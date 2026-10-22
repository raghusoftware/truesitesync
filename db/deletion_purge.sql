-- ═══════════════════════════════════════════════════════════════════════════
-- Deleted records must leave the cloud copy IMMEDIATELY (not on the next save)
-- ───────────────────────────────────────────────────────────────────────────
-- Tombstones (recycle-bin entries and org_deletions) used to be applied only
-- when a module was written again. Until then the stored row still held the
-- deleted records, so a refresh / another device pulled them straight back
-- ("deleted GRN came back", "emptied bin still has data"). And when a delete's
-- module push reached the server before its recycle-bin push, the merge
-- re-added the record from the stored copy.
--
-- _purge_tombstoned strips tombstoned / binned records from a module's stored
-- row right away. It runs:
--   • in record_deletions (Empty bin / Delete permanently) for every module
--     touched, including 'recycleBin' itself;
--   • in push_module_merged after a recycleBin push, for every module the bin
--     references (so a soft-delete takes the record out of the cloud row at once).
-- Same filter the merge already applies on every write (_apply_tombstones) —
-- it only removes records that are binned or permanently deleted.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public._purge_tombstoned(p_org uuid, p_module text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_old jsonb;
  v_new jsonb;
begin
  select payload into v_old from public.module_data
   where organization_id = p_org and module_name = p_module;
  if v_old is null or jsonb_typeof(v_old) <> 'array' then return; end if;
  v_new := public._apply_tombstones(p_org, p_module, v_old);
  if v_new is not distinct from v_old then return; end if;
  -- Bypass the union merge guard for this write (it would re-add what we strip).
  perform set_config('app.bypass_merge', 'on', true);
  update public.module_data
     set payload = v_new, updated_at = now()
   where organization_id = p_org and module_name = p_module;
  perform set_config('app.bypass_merge', '', true);
end $function$;

revoke all on function public._purge_tombstoned(uuid, text) from public, anon, authenticated;

create or replace function public.record_deletions(p_org uuid, p_entries jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  m text;
begin
  if p_org not in (select public.user_org_ids()) then raise exception 'not_member'; end if;
  insert into public.org_deletions(org_id, module_name, record_id)
  select p_org, e->>'key', e->>'id'
  from jsonb_array_elements(coalesce(p_entries,'[]'::jsonb)) e
  where e->>'key' is not null and e->>'id' is not null
  on conflict do nothing;
  -- Take the deleted records out of the stored rows now, not on the next save.
  for m in select distinct e->>'key' from jsonb_array_elements(coalesce(p_entries,'[]'::jsonb)) e where e->>'key' is not null loop
    perform public._purge_tombstoned(p_org, m);
  end loop;
end $function$;

create or replace function public.push_module_merged(p_module text, p_payload jsonb, p_org uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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

  insert into public.module_data(organization_id, module_name, record_id, payload, updated_by, updated_at)
  values (v_org, p_module, p_module, v_merged, v_uid, now())
  on conflict (organization_id, module_name, record_id)
  do update set payload = excluded.payload, updated_by = v_uid, updated_at = now();

  -- A recycle-bin push: take every binned record out of its module's stored row
  -- now, so a module push that raced ahead of this one can't keep it alive.
  if p_module = 'recycleBin' and jsonb_typeof(v_merged) = 'array' then
    for m in select distinct e->>'key' from jsonb_array_elements(v_merged) e
              where jsonb_typeof(e) = 'object' and e->>'key' is not null and e->>'key' <> 'recycleBin' loop
      perform public._purge_tombstoned(v_org, m);
    end loop;
  end if;

  return v_merged;
end $function$;
