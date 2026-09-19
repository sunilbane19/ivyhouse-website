import { withSupabase } from 'npm:@supabase/server@^1';

const BUCKET = 'ivy-house-gallery';
const GITHUB_BASE = 'https://raw.githubusercontent.com/sunilbane19/ivyhouse-website/main/';

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const email = String(ctx.userClaims?.email || '').trim().toLowerCase();
    const { data: admin, error: adminError } = await ctx.supabaseAdmin
      .from('ivy_house_admins')
      .select('id')
      .eq('email', email)
      .eq('active', true)
      .maybeSingle();
    if (adminError || !admin) {
      return Response.json({ error: 'Not authorized' }, { status: 403 });
    }

    if (req.method !== 'POST') {
      return Response.json({ error: 'POST required' }, { status: 405 });
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit) || 5, 1), 10);

    const { data: items, error } = await ctx.supabaseAdmin
      .from('gallery_items')
      .select('id, source_path, storage_path, media_type')
      .is('storage_path', null)
      .eq('active', true)
      .order('sort_order')
      .limit(limit);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    let migrated = 0;
    const errors: { id: number; path: string; error: string }[] = [];

    for (const item of items ?? []) {
      try {
        const response = await fetch(GITHUB_BASE + item.source_path);
        if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
        const blob = await response.blob();

        const safeName = item.source_path.split('/').pop() || `media-${item.id}`;
        const storagePath = `gallery/${item.id}-${safeName}`;

        const { error: uploadError } = await ctx.supabaseAdmin.storage
          .from(BUCKET)
          .upload(storagePath, blob, {
            contentType: item.media_type === 'video' ? (blob.type || 'video/mp4') : (blob.type || 'image/jpeg'),
            cacheControl: '31536000',
            upsert: true
          });

        if (uploadError) throw new Error(uploadError.message);

        const { error: updateError } = await ctx.supabaseAdmin
          .from('gallery_items')
          .update({ storage_path: storagePath, updated_at: new Date().toISOString() })
          .eq('id', item.id);

        if (updateError) throw new Error(updateError.message);
        migrated++;
      } catch (e) {
        errors.push({ id: item.id, path: item.source_path, error: e instanceof Error ? e.message : String(e) });
      }
    }

    const { count: remaining } = await ctx.supabaseAdmin
      .from('gallery_items')
      .select('id', { count: 'exact', head: true })
      .is('storage_path', null)
      .eq('active', true);

    return Response.json({ migrated, remaining: remaining ?? 0, errors });
  })
};
