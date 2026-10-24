-- Super-admin helpers (applied to Supabase as migration "admin_user_activity").
-- admin_user_activity: real "last active" per user — app session refreshes,
-- data saved (module_data), client errors — instead of auth's last_sign_in_at,
-- which only changes on a fresh password login.
-- admin_org_project_counts: project count per organization from module_data.
-- Only the service role (admin-data edge function) may call them.
create or replace function public.admin_user_activity()
returns table(user_id uuid, last_session timestamptz, last_data timestamptz, last_error timestamptz)
language sql stable security definer set search_path = public, auth
as $$
  with s as (select s.user_id, max(greatest(s.refreshed_at at time zone 'UTC', s.updated_at, s.created_at)) t from auth.sessions s group by 1),
       d as (select coalesce(m.updated_by, m.created_by) uid, max(m.updated_at) t from public.module_data m group by 1),
       e as (select c.user_id, max(c.created_at) t from public.client_errors c where c.user_id is not null group by 1)
  select u.id, s.t, d.t, e.t
  from auth.users u
  left join s on s.user_id = u.id
  left join d on d.uid = u.id
  left join e on e.user_id = u.id;
$$;

create or replace function public.admin_org_project_counts()
returns table(org_id uuid, projects bigint)
language sql stable security definer set search_path = public
as $$
  select organization_id, count(*) from public.module_data where module_name = 'projects' group by 1;
$$;

revoke all on function public.admin_user_activity() from public, anon, authenticated;
revoke all on function public.admin_org_project_counts() from public, anon, authenticated;
grant execute on function public.admin_user_activity() to service_role;
grant execute on function public.admin_org_project_counts() to service_role;
