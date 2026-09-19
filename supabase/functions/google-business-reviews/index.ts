import { withSupabase } from "npm:@supabase/server@^1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUSINESS_SCOPE = "https://www.googleapis.com/auth/business.manage";
const ACCOUNT_API = "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
const REVIEWS_API = "https://mybusiness.googleapis.com/v4";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

function starRating(value: string | undefined): number {
  return ({
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5,
  } as Record<string, number>)[String(value || "").replace("STAR_RATING_", "")] || 5;
}

async function googleGet(path: string, accessToken: string) {
  const response = await fetch(path, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!response.ok) {
    const message = body?.error?.message || body?.error || `Google API returned HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

async function listLocations(accessToken: string) {
  const accountsResponse = await googleGet(`${ACCOUNT_API}/accounts`, accessToken);
  const accounts = Array.isArray(accountsResponse?.accounts) ? accountsResponse.accounts : [];
  const locations: any[] = [];

  for (const account of accounts) {
    const accountName = String(account?.name || "");
    if (!accountName) continue;

    let pageToken = "";
    do {
      const params = new URLSearchParams({
        readMask: "name,title,websiteUri,metadata,storefrontAddress,phoneNumbers",
        pageSize: "100",
      });
      if (pageToken) params.set("pageToken", pageToken);

      const data = await googleGet(
        `${INFO_API}/${accountName}/locations?${params.toString()}`,
        accessToken
      );

      for (const location of data?.locations || []) {
        locations.push({ account, location });
      }
      pageToken = data?.nextPageToken || "";
    } while (pageToken);
  }

  return locations;
}

function chooseLocation(locations: any[]) {
  const ivyMatches = locations.filter(({ location }) => {
    const title = String(location?.title || "").toLowerCase();
    const website = String(location?.websiteUri || "").toLowerCase();
    return title.includes("ivy house") || website.includes("ivyhouse.in");
  });

  if (ivyMatches.length === 1) return ivyMatches[0];
  if (ivyMatches.length > 1) return { ambiguous: true, candidates: ivyMatches };

  if (locations.length === 1) return locations[0];

  return { ambiguous: true, candidates: locations };
}

async function listReviews(accountId: string, locationId: string, accessToken: string) {
  const reviews: any[] = [];
  let pageToken = "";

  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({ pageSize: "50" });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await googleGet(
      `${REVIEWS_API}/accounts/${accountId}/locations/${locationId}/reviews?${params.toString()}`,
      accessToken
    );

    reviews.push(...(data?.reviews || []));
    pageToken = data?.nextPageToken || "";
    if (!pageToken) break;
  }

  return reviews;
}

async function refreshWithStoredToken(ctx: any, adminUserId: string) {
  const { data, error } = await ctx.supabaseAdmin.rpc(
    "get_google_business_refresh_token",
    { p_admin_user_id: adminUserId }
  );
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Google Reviews needs to be reconnected.");
  return data;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json({ error: "POST required" }, 405);

    const adminUserId = String(ctx.userClaims?.sub || "");
    if (!adminUserId) return json({ error: "Unauthorized" }, 401);

    const callerEmail = String(ctx.userClaims?.email || "").trim().toLowerCase();
    const { data: admin, error: adminError } = await ctx.supabaseAdmin
      .from("ivy_house_admins")
      .select("id,email,active")
      .eq("email", callerEmail)
      .eq("active", true)
      .maybeSingle();

    if (adminError) {
      console.error("Admin lookup failed:", adminError.message);
      return json({ error: "Admin authorization check failed." }, 500);
    }
    if (!admin) return json({ error: "Not authorized" }, 403);

    let body: any = {};
    try { body = await req.json(); } catch {}

    const action = body?.action || "status";
    let accessToken = String(body?.provider_access_token || "").trim();
    const refreshToken = String(body?.provider_refresh_token || "").trim();

    try {
      if (action === "status") {
        const { data: connection, error } = await ctx.supabaseAdmin
          .from("google_business_connections")
          .select("id,google_account_name,google_location_name,google_location_id,google_location_title,google_maps_url,google_new_review_url,status,connected_at,last_refreshed_at,updated_at")
          .eq("admin_user_id", adminUserId)
          .maybeSingle();

        if (error) throw new Error(error.message);

        const { count } = await ctx.supabaseAdmin
          .from("google_business_reviews")
          .select("id", { count: "exact", head: true });

        return json({ connected: !!connection, connection, review_count: count || 0 });
      }

      if (!accessToken && action === "refresh") {
        // The stored refresh token is retained in Vault. If a future server-side
        // refresh credential is configured, it can be exchanged here. For now,
        // the Admin UI re-authorizes Google and supplies the fresh provider token.
        await refreshWithStoredToken(ctx, adminUserId).catch(() => null);
        return json({
          ok: false,
          needs_reauthorization: true,
          error: "Please reconnect Google Reviews to refresh the Business Profile access token.",
        }, 401);
      }

      if (!accessToken) {
        return json({ error: "Google provider access token is required." }, 400);
      }

      if (refreshToken) {
        // The connection row is created after the Business Profile location is resolved.
        // The refresh token is never returned to the browser or written to a normal table.
      }

      const locations = await listLocations(accessToken);
      if (!locations.length) {
        return json({
          ok: false,
          error: "No Google Business Profile locations were returned for this Google account.",
          scope: BUSINESS_SCOPE,
        }, 404);
      }

      const choice = chooseLocation(locations);
      if (choice.ambiguous) {
        return json({
          ok: false,
          error: "More than one Google Business Profile location was found. The integration needs a unique Ivy House match.",
          candidates: choice.candidates.map(({ account, location }: any) => ({
            account_name: account?.name || null,
            account_label: account?.accountName || null,
            location_name: location?.name || null,
            location_title: location?.title || null,
            website_uri: location?.websiteUri || null,
            maps_url: location?.metadata?.mapsUrl || null,
          })),
        }, 409);
      }

      const account = choice.account;
      const location = choice.location;
      const accountName = String(account?.name || "");
      const locationName = String(location?.name || "");
      const accountId = accountName.split("/").pop();
      const locationId = locationName.split("/").pop();

      if (!accountId || !locationId) throw new Error("Google returned an invalid Business Profile location identifier.");

      const { data: connectionId, error: connectionError } = await ctx.supabaseAdmin.rpc(
        "update_google_business_connection",
        {
          p_admin_user_id: adminUserId,
          p_google_account_name: accountName,
          p_google_location_name: locationName,
          p_google_location_id: locationId,
          p_google_location_title: location?.title || null,
          p_google_maps_url: location?.metadata?.mapsUrl || null,
          p_google_new_review_url: location?.metadata?.newReviewUrl || null,
          p_status: "connected",
        }
      );
      if (connectionError) throw new Error(connectionError.message);

      if (refreshToken) {
        const { error: tokenError } = await ctx.supabaseAdmin.rpc(
          "set_google_business_refresh_token",
          { p_admin_user_id: adminUserId, p_refresh_token: refreshToken }
        );
        if (tokenError) throw new Error(tokenError.message);
      }

      const reviews = await listReviews(accountId, locationId, accessToken);

      const { error: deactivateError } = await ctx.supabaseAdmin
        .from("google_business_reviews")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("connection_id", connectionId);
      if (deactivateError) throw new Error(deactivateError.message);

      const rows = reviews.map((review: any, index: number) => ({
        connection_id: connectionId,
        google_review_name: review?.name,
        reviewer_name: review?.reviewer?.displayName || "Google guest",
        reviewer_photo_url: review?.reviewer?.profilePhotoUrl || null,
        star_rating: starRating(review?.starRating),
        comment: review?.comment || null,
        create_time: review?.createTime || null,
        update_time: review?.updateTime || review?.createTime || null,
        google_reply: review?.reviewReply?.comment || null,
        google_reply_update_time: review?.reviewReply?.updateTime || null,
        active: true,
        sort_order: index,
        updated_at: new Date().toISOString(),
      })).filter((row: any) => row.google_review_name);

      if (rows.length) {
        const { error: reviewError } = await ctx.supabaseAdmin
          .from("google_business_reviews")
          .upsert(rows, { onConflict: "google_review_name" });
        if (reviewError) throw new Error(reviewError.message);
      }

      const { error: refreshError } = await ctx.supabaseAdmin.rpc(
        "mark_google_business_refreshed",
        { p_connection_id: connectionId, p_status: "connected" }
      );
      if (refreshError) throw new Error(refreshError.message);

      return json({
        ok: true,
        connected: true,
        location: {
          account_name: accountName,
          location_name: locationName,
          title: location?.title || null,
          maps_url: location?.metadata?.mapsUrl || null,
          new_review_url: location?.metadata?.newReviewUrl || null,
        },
        review_count: rows.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Google Business Reviews error:", message);
      return json({ ok: false, error: message }, 500);
    }
  }),
};
