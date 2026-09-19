-- Security hardening for Google Business Profile secret helpers.
-- Functions remain callable only by the Supabase service role and use a pinned search_path.
alter function public.set_google_business_refresh_token(uuid,text) set search_path = '';
alter function public.get_google_business_refresh_token(uuid) set search_path = '';
alter function public.update_google_business_connection(uuid,text,text,text,text,text,text,text) set search_path = '';
alter function public.mark_google_business_refreshed(bigint,text) set search_path = '';
