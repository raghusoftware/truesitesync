-- Backup / snapshot tables are never read by the app. Keep them out of the public API:
-- RLS on with no policies (no rows via PostgREST) and no anon / authenticated grants.
-- They stay readable from the Supabase dashboard / service role.
-- Applied 2026-10-28 (fixes Supabase lint 0013 rls_disabled_in_public).
alter table public.sanjay_org_snapshot_20260922 enable row level security;
revoke all on table public.sanjay_org_snapshot_20260922 from anon, authenticated;
comment on table public.sanjay_org_snapshot_20260922 is 'Backup snapshot (2026-09-22). Admin-only: RLS on, no API access.';
