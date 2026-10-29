-- ════════════════════════════════════════════════════════════════════════════
--  Anti-proxy staff attendance — server-side enforcement
--
--  Staff punches live in module_data (module 'staffAttendance', a JSON array).
--  A punch (inAt / outAt) may only be added or changed by:
--    • the staff member themself: record.inBy / outBy = auth.uid() AND the staff
--      card (module 'staffMaster', same id) has userId = auth.uid(); or
--    • the org owner / admin (manual corrections — the app requires a reason).
--  Anything else is reverted to the cloud copy (or dropped if new), so a proxy
--  punch never reaches the shared data — whether it comes through the app's
--  push_module_merged RPC or a direct table write.
--  On staff cards, only the owner / admin may change the linked login (userId)
--  or reset the registered phone; a member may register their own first phone.
--  Server-side callers (no auth.uid(), e.g. service role) are not filtered.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public._is_org_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.org_members
                  where org_id = p_org and user_id = auth.uid()
                    and coalesce(is_active, true) and role in ('owner', 'admin'));
$$;

-- The rule itself: pure (no table reads), so it can be tested on its own.
--   p_staff: the org's staff cards (module 'staffMaster' payload), for the login link.
create or replace function public._guard_attendance_core(p_module text, p_new jsonb, p_old jsonb, p_uid text, p_is_admin boolean, p_staff jsonb)
returns jsonb language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_out jsonb := '[]'::jsonb;
  e jsonb; o jsonb; v_staff_uid text; v_ok boolean;
begin
  if p_uid is null or p_is_admin or p_module not in ('staffAttendance', 'staffMaster')
     or jsonb_typeof(p_new) <> 'array' then
    return p_new;
  end if;

  for e in select value from jsonb_array_elements(p_new) loop
    if jsonb_typeof(e) <> 'object' or e->>'id' is null then
      v_out := v_out || jsonb_build_array(e); continue;
    end if;
    o := null;
    if jsonb_typeof(p_old) = 'array' then
      select x into o from jsonb_array_elements(p_old) x where x->>'id' = e->>'id' limit 1;
    end if;

    if p_module = 'staffAttendance' then
      if (e->>'inAt') is not distinct from (o->>'inAt') and (e->>'outAt') is not distinct from (o->>'outAt') then
        v_out := v_out || jsonb_build_array(e); continue;           -- no punch change
      end if;
      v_staff_uid := null;
      if jsonb_typeof(p_staff) = 'array' then
        select s->>'userId' into v_staff_uid from jsonb_array_elements(p_staff) s where s->>'id' = e->>'staffId' limit 1;
      end if;
      v_ok := v_staff_uid = p_uid
        and ((e->>'inAt')  is not distinct from (o->>'inAt')  or e->>'inBy'  = p_uid)
        and ((e->>'outAt') is not distinct from (o->>'outAt') or e->>'outBy' = p_uid);
      if v_ok then v_out := v_out || jsonb_build_array(e);
      elsif o is not null then v_out := v_out || jsonb_build_array(o);   -- revert the proxy change
      end if;                                                           -- (a new proxy record is dropped)
    else  -- staffMaster: login link + registered phone are owner-controlled
      if o is null then
        e := e - 'userId' - 'userEmail' - 'boundDevice' - 'boundAt';
      else
        if (e->>'userId') is distinct from (o->>'userId') or (e->>'userEmail') is distinct from (o->>'userEmail') then
          e := (e - 'userId' - 'userEmail') || jsonb_strip_nulls(jsonb_build_object('userId', o->'userId', 'userEmail', o->'userEmail'));
        end if;
        if (e->>'boundDevice') is distinct from (o->>'boundDevice')
           and not (coalesce(o->>'boundDevice', '') = '' and o->>'userId' = p_uid) then
          e := (e - 'boundDevice' - 'boundAt') || jsonb_strip_nulls(jsonb_build_object('boundDevice', o->'boundDevice', 'boundAt', o->'boundAt'));
        end if;
      end if;
      v_out := v_out || jsonb_build_array(e);
    end if;
  end loop;
  return v_out;
end $$;

-- Wrapper: who is calling, are they owner / admin, and the org's staff cards.
create or replace function public._guard_attendance(p_org uuid, p_module text, p_new jsonb, p_old jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or p_module not in ('staffAttendance', 'staffMaster') then return p_new; end if;
  return public._guard_attendance_core(p_module, p_new, p_old, auth.uid()::text, public._is_org_admin(p_org),
    (select payload from public.module_data where organization_id = p_org and module_name = 'staffMaster'));
end $$;

-- Direct table writes go through the existing merge-guard trigger: add the check there.
create or replace function public._module_data_merge_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $function$
begin
  if coalesce(current_setting('app.bypass_merge', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and jsonb_typeof(new.payload) = 'array'
     and jsonb_typeof(old.payload) = 'array' then
    new.payload := new.payload || (
      select coalesce(jsonb_agg(c), '[]'::jsonb)
      from jsonb_array_elements(old.payload) c
      where jsonb_typeof(c) = 'object'
        and coalesce(c->>'id', c->>'binId') is not null
        and not exists (
          select 1 from jsonb_array_elements(new.payload) i
          where coalesce(i->>'id', i->>'binId') = coalesce(c->>'id', c->>'binId')
        )
    );
    new.payload := public._apply_tombstones(new.organization_id, new.module_name, new.payload);
    -- Safeguard: never let a stale device wipe a project's BOQ list.
    if new.module_name = 'projects' then
      new.payload := public._preserve_project_boq(new.payload, old.payload);
    end if;
  elsif tg_op = 'UPDATE'
     and jsonb_typeof(new.payload) = 'object' and new.payload = '{}'::jsonb
     and jsonb_typeof(old.payload) = 'object' and old.payload <> '{}'::jsonb then
    new.payload := old.payload;
  end if;
  -- Anti-proxy attendance (no-op for other modules).
  if new.module_name in ('staffAttendance', 'staffMaster') then
    new.payload := public._guard_attendance(new.organization_id, new.module_name, new.payload,
                                            case when tg_op = 'UPDATE' then old.payload else null end);
  end if;
  return new;
end $function$;

-- The app's push RPC: apply the same check before saving, so the merged result it
-- returns to the phone is already the guarded one (the phone then drops a proxy punch).
create or replace function public.push_module_merged(p_module text, p_payload jsonb, p_org uuid default null::uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  v_org uuid;
  v_uid uuid := auth.uid();
  v_existing jsonb;
  v_merged jsonb;
  m text;
begin
  v_org := coalesce(p_org, (select org_id from public.org_members
                            where user_id = v_uid and coalesce(is_active, true)
                            order by joined_at limit 1));
  if v_org is null then raise exception 'no_org'; end if;
  if not exists (select 1 from public.org_members
                 where org_id = v_org and user_id = v_uid and coalesce(is_active, true)) then
    raise exception 'not_member';
  end if;

  select payload into v_existing from public.module_data
   where organization_id = v_org and module_name = p_module;

  if v_existing is null then
    v_merged := p_payload;
  elsif jsonb_typeof(p_payload) = 'array' and jsonb_typeof(v_existing) = 'array' then
    v_merged := p_payload || (
      select coalesce(jsonb_agg(c), '[]'::jsonb)
      from jsonb_array_elements(v_existing) c
      where jsonb_typeof(c) = 'object'
        and coalesce(c->>'id', c->>'binId') is not null
        and not exists (
          select 1 from jsonb_array_elements(p_payload) i
          where coalesce(i->>'id', i->>'binId') = coalesce(c->>'id', c->>'binId')
        )
    );
    v_merged := public._apply_tombstones(v_org, p_module, v_merged);
    if p_module = 'projects' then
      v_merged := public._preserve_project_boq(v_merged, v_existing);
    end if;
  elsif jsonb_typeof(p_payload) = 'object' and p_payload = '{}'::jsonb
        and jsonb_typeof(v_existing) = 'object' and v_existing <> '{}'::jsonb then
    v_merged := v_existing;
  else
    v_merged := p_payload;
  end if;

  if p_module in ('staffAttendance', 'staffMaster') then
    v_merged := public._guard_attendance(v_org, p_module, v_merged, v_existing);
  end if;

  insert into public.module_data(organization_id, module_name, record_id, payload, updated_by, updated_at)
  values (v_org, p_module, p_module, v_merged, v_uid, now())
  on conflict (organization_id, module_name, record_id)
  do update set payload = excluded.payload, updated_by = v_uid, updated_at = now();

  if p_module = 'recycleBin' and jsonb_typeof(v_merged) = 'array' then
    for m in select distinct e->>'key' from jsonb_array_elements(v_merged) e
              where jsonb_typeof(e) = 'object' and e->>'key' is not null and e->>'key' <> 'recycleBin' loop
      perform public._purge_tombstoned(v_org, m);
    end loop;
  end if;

  return v_merged;
end $function$;

revoke all on function public._guard_attendance(uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._is_org_admin(uuid) from public, anon, authenticated;
revoke all on function public._guard_attendance_core(text, jsonb, jsonb, text, boolean, jsonb) from public, anon, authenticated;
