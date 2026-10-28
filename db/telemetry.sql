-- Server-side telemetry (applied to Supabase as migration "telemetry_events").
-- One table for every tracked event. Rows are written only by database
-- triggers (signup / login) and by edge functions with the service role
-- (download), so ad blockers, closed tabs and client bugs can't lose them.
-- Super admins read it; nobody can write it from the browser.
create table if not exists public.analytics_events (
  id          bigserial primary key,
  event       text not null,            -- signup | login | download | download_failed
  occurred_at timestamptz not null default now(),
  user_id     uuid,
  email       text,
  platform    text,                     -- windows | android | web | email | google ...
  source      text,                     -- trigger | edge:download | backfill
  ip          text,
  user_agent  text,
  referrer    text,
  lead_id     uuid,
  meta        jsonb not null default '{}'::jsonb
);
create index if not exists analytics_events_event_time on public.analytics_events (event, occurred_at desc);
create index if not exists analytics_events_time on public.analytics_events (occurred_at desc);

alter table public.analytics_events enable row level security;
drop policy if exists analytics_events_admin_read on public.analytics_events;
create policy analytics_events_admin_read on public.analytics_events
  for select to authenticated using (public.is_super_admin());
revoke insert, update, delete on public.analytics_events from anon, authenticated;

-- Signup: a new row in auth.users. Never blocks the signup — any error is swallowed.
create or replace function public.tg_track_signup()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  begin
    insert into public.analytics_events (event, occurred_at, user_id, email, platform, source, meta)
    values ('signup', coalesce(new.created_at, now()), new.id, new.email,
            coalesce(new.raw_app_meta_data->>'provider', 'email'), 'trigger',
            jsonb_build_object('confirmed', new.email_confirmed_at is not null));
  exception when others then null;
  end;
  return new;
end;
$$;

-- Login: every successful sign-in (password, Google, OTP, magic link) creates
-- a row in auth.sessions; token refreshes don't, so one row = one login.
create or replace function public.tg_track_login()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
begin
  begin
    insert into public.analytics_events (event, occurred_at, user_id, email, platform, source, ip, user_agent, meta)
    select 'login', coalesce(new.created_at, now()), new.user_id, u.email,
           coalesce(u.raw_app_meta_data->>'provider', 'email'), 'trigger',
           host(new.ip), new.user_agent, jsonb_build_object('session_id', new.id, 'aal', new.aal)
    from auth.users u where u.id = new.user_id;
  exception when others then null;
  end;
  return new;
end;
$$;

revoke all on function public.tg_track_signup() from public, anon, authenticated;
revoke all on function public.tg_track_login() from public, anon, authenticated;

drop trigger if exists tss_track_signup on auth.users;
create trigger tss_track_signup after insert on auth.users
  for each row execute function public.tg_track_signup();
drop trigger if exists tss_track_login on auth.sessions;
create trigger tss_track_login after insert on auth.sessions
  for each row execute function public.tg_track_login();

-- Backfill what the auth tables still remember (all signups; the sessions
-- that haven't expired).
insert into public.analytics_events (event, occurred_at, user_id, email, platform, source, meta)
select 'signup', u.created_at, u.id, u.email, coalesce(u.raw_app_meta_data->>'provider', 'email'), 'backfill', '{"backfill":true}'
from auth.users u
where not exists (select 1 from public.analytics_events e where e.event = 'signup' and e.user_id = u.id);

insert into public.analytics_events (event, occurred_at, user_id, email, platform, source, ip, user_agent, meta)
select 'login', s.created_at, s.user_id, u.email, coalesce(u.raw_app_meta_data->>'provider', 'email'), 'backfill',
       host(s.ip), s.user_agent, jsonb_build_object('backfill', true, 'session_id', s.id)
from auth.sessions s join auth.users u on u.id = s.user_id
where not exists (select 1 from public.analytics_events e where e.event = 'login' and e.meta->>'session_id' = s.id::text);

-- Summary for the super-admin dashboard (admin-data edge function only).
create or replace function public.admin_telemetry(days int default 30)
returns jsonb language sql stable security definer set search_path = public
as $$
  with ev as (select * from public.analytics_events where occurred_at >= now() - make_interval(days => days)),
       series as (
         select d::date day,
                count(*) filter (where e.event = 'signup')   signups,
                count(*) filter (where e.event = 'login')    logins,
                count(*) filter (where e.event = 'download') downloads,
                count(*) filter (where e.event = 'download_failed') failed
         from generate_series((now() - make_interval(days => days - 1))::date, now()::date, '1 day') d
         left join ev e on e.occurred_at::date = d::date
         group by 1 order by 1)
  select jsonb_build_object(
    'totals', (select jsonb_object_agg(k, v) from (
       select event || '_' || w k, count(*) v from (
         select event, 'today' w from public.analytics_events where occurred_at >= date_trunc('day', now())
         union all select event, '7d' from public.analytics_events where occurred_at >= now() - interval '7 days'
         union all select event, '30d' from public.analytics_events where occurred_at >= now() - interval '30 days'
         union all select event, 'all' from public.analytics_events) x group by 1) t),
    'last', (select jsonb_object_agg(event, t) from (select event, max(occurred_at) t from public.analytics_events group by 1) l),
    'series', (select jsonb_agg(to_jsonb(series)) from series),
    'recent', (select jsonb_agg(to_jsonb(r)) from (
       select event, occurred_at, email, platform, ip, user_agent, referrer, meta
       from public.analytics_events where source <> 'backfill' order by occurred_at desc limit 50) r)
  );
$$;
revoke all on function public.admin_telemetry(int) from public, anon, authenticated;
grant execute on function public.admin_telemetry(int) to service_role;
