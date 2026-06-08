-- ============================================================================
-- True Site Sync — Organization-scoped real-time cloud sync schema
-- Run in: Supabase Dashboard → SQL Editor → New query → Run  (idempotent)
--
-- NOTE: Your project ALREADY has `organizations` and membership in `org_members`
-- (columns: org_id, user_id, role, is_active). This script integrates with those
-- instead of creating a parallel `org_users` table, so module sync uses your real
-- company membership. It only ADDS: module_data + helpers + RLS + realtime.
-- ============================================================================

-- 1) CENTRAL MODULE DATA (JSONB payload, tagged by module, org-scoped) -------
create table if not exists public.module_data (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  module_name      text not null,                    -- 'labor_attendance','epc_project',...
  record_id        text not null,                    -- client id → idempotent upsert
  payload          jsonb not null default '{}'::jsonb,
  created_by       uuid references auth.users(id),
  updated_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, module_name, record_id)
);
create index if not exists idx_md_org_module on public.module_data(organization_id, module_name);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_md_touch on public.module_data;
create trigger trg_md_touch before update on public.module_data
  for each row execute function public.touch_updated_at();

-- 2) HELPER: org ids the current user belongs to (reads existing org_members) -
create or replace function public.user_org_ids()
returns setof uuid
language sql security definer stable
set search_path = public
as $$
  select org_id from public.org_members
  where user_id = auth.uid() and coalesce(is_active, true)
$$;
grant execute on function public.user_org_ids() to authenticated;

-- 3) ROW LEVEL SECURITY on module_data — strict per-organization isolation ---
alter table public.module_data enable row level security;

drop policy if exists md_select on public.module_data;
create policy md_select on public.module_data
  for select to authenticated using (organization_id in (select public.user_org_ids()));

drop policy if exists md_insert on public.module_data;
create policy md_insert on public.module_data
  for insert to authenticated with check (organization_id in (select public.user_org_ids()));

drop policy if exists md_update on public.module_data;
create policy md_update on public.module_data
  for update to authenticated
  using      (organization_id in (select public.user_org_ids()))
  with check (organization_id in (select public.user_org_ids()));

drop policy if exists md_delete on public.module_data;
create policy md_delete on public.module_data
  for delete to authenticated using (organization_id in (select public.user_org_ids()));

-- 4) REALTIME — broadcast module_data row changes (RLS still applies) --------
alter table public.module_data replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='module_data'
  ) then
    alter publication supabase_realtime add table public.module_data;
  end if;
end $$;

-- 5) ATOMIC ORG CREATION for first-time users (org + owner membership) -------
-- organizations.slug is NOT NULL + UNIQUE → generate one from the name.
create or replace function public.create_org_with_owner(p_name text, p_email text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare new_org uuid; base text; sl text;
begin
  base := lower(regexp_replace(coalesce(nullif(p_name,''),'org'), '[^a-zA-Z0-9]+', '-', 'g'));
  base := trim(both '-' from base);
  if base = '' then base := 'org'; end if;
  sl := base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
  insert into public.organizations(name, slug)
    values (coalesce(nullif(p_name,''),'My Company'), sl)
    returning id into new_org;
  insert into public.org_members(org_id, user_id, role, is_active, joined_at)
    values (new_org, auth.uid(), 'owner', true, now())
    on conflict do nothing;
  return new_org;
end $$;
grant execute on function public.create_org_with_owner(text, text) to authenticated;
