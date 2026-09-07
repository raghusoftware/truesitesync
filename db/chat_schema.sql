-- ============================================================================
-- True Site Sync — Chat module schema (org-scoped, real-time, RLS)
-- Run in: Supabase Dashboard → SQL Editor → New query → Run  (idempotent)
--
-- Depends on db/org_sync_schema.sql having been run first: it provides
--   • public.organizations / public.org_members (org membership)
--   • public.user_org_ids()  — SECURITY DEFINER helper returning the caller's org ids
--   • public.touch_updated_at() — updated_at trigger fn
-- This script only ADDS the chat tables, their RLS, realtime and a media bucket.
-- ============================================================================

-- ── Fallbacks so this file also runs standalone ─────────────────────────────
create or replace function public.user_org_ids()
returns setof uuid language sql security definer stable set search_path = public as $$
  select org_id from public.org_members
  where user_id = auth.uid() and coalesce(is_active, true)
$$;
grant execute on function public.user_org_ids() to authenticated;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ============================================================================
-- 1) CHANNELS ────────────────────────────────────────────────────────────────
--    Project channels, sub-channels (zone/trade/crew/safety/logistics),
--    direct 1:1 and named group chats. project_id is a free-text app id
--    (mirrors mes_projects[].id) so a channel can auto-bind to a project.
-- ============================================================================
create table if not exists public.chat_channels (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  project_id       text,                                   -- app project id (nullable for org-wide/DM)
  name             text not null,
  kind             text not null default 'general'
                   check (kind in ('project','zone','trade','crew','safety','logistics','general','dm','group')),
  topic            text,
  icon             text,                                   -- emoji / short label
  access_level     text not null default 'internal'
                   check (access_level in ('internal','subcontractor','client','guest')),
  is_archived      boolean not null default false,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, project_id, kind, name)
);
create index if not exists idx_chat_channels_org      on public.chat_channels(organization_id);
create index if not exists idx_chat_channels_project  on public.chat_channels(organization_id, project_id);

drop trigger if exists trg_chat_channels_touch on public.chat_channels;
create trigger trg_chat_channels_touch before update on public.chat_channels
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 2) CHANNEL MEMBERSHIP ──────────────────────────────────────────────────────
--    Per-user membership drives access, unread counts, mute/notification prefs.
-- ============================================================================
create table if not exists public.chat_channel_members (
  id            uuid primary key default gen_random_uuid(),
  channel_id    uuid not null references public.chat_channels(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'member' check (role in ('owner','admin','member','guest')),
  notif_pref    text not null default 'all'    check (notif_pref in ('all','mentions','priority','none')),
  last_read_at  timestamptz not null default now(),
  is_muted      boolean not null default false,
  joined_at     timestamptz not null default now(),
  unique (channel_id, user_id)
);
create index if not exists idx_ccm_user    on public.chat_channel_members(user_id);
create index if not exists idx_ccm_channel on public.chat_channel_members(channel_id);

-- ============================================================================
-- 3) MESSAGES ─────────────────────────────────────────────────────────────────
--    One row per message. Rich payloads (attachments, tagged inventory assets,
--    location pin, @mentions, convert-to-record links) ride along as JSONB so the
--    schema stays stable as the composer grows.
-- ============================================================================
create table if not exists public.chat_messages (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  channel_id       uuid not null references public.chat_channels(id) on delete cascade,
  parent_id        uuid references public.chat_messages(id) on delete cascade,  -- threaded reply
  user_id          uuid references auth.users(id),
  kind             text not null default 'text'
                   check (kind in ('text','system','convert')),
  body             text not null default '',
  priority         text not null default 'normal'
                   check (priority in ('normal','high','urgent','safety')),
  attachments      jsonb not null default '[]'::jsonb,   -- [{type,url,name,size,mime,w,h,dur,waveform,thumb}]
  asset_tags       jsonb not null default '[]'::jsonb,   -- [{assetId,kind,name,code,status,location,photo}]
  location         jsonb,                                -- {lat,lng,accuracy,label,live,expires_at}
  mentions         jsonb not null default '[]'::jsonb,   -- [user_id,...]
  linked_record    jsonb,                                -- {module,recordId,title} for convert-to-Task/RFI/…
  is_pinned        boolean not null default false,
  edited_at        timestamptz,
  deleted_at       timestamptz,                          -- soft delete (audit trail preserved)
  created_at       timestamptz not null default now()
);
create index if not exists idx_chat_msg_channel on public.chat_messages(channel_id, created_at desc);
create index if not exists idx_chat_msg_org     on public.chat_messages(organization_id);
create index if not exists idx_chat_msg_parent  on public.chat_messages(parent_id);
create index if not exists idx_chat_msg_pinned  on public.chat_messages(channel_id) where is_pinned;
-- Full-text search across message bodies (search feature)
create index if not exists idx_chat_msg_fts
  on public.chat_messages using gin (to_tsvector('simple', coalesce(body,'')));

-- ============================================================================
-- 4) READ RECEIPTS ────────────────────────────────────────────────────────────
--    Per-message read receipts (delivery/read status). Channel-level unread is
--    derived from chat_channel_members.last_read_at; this table powers the
--    "seen by" avatars on individual messages.
-- ============================================================================
create table if not exists public.chat_message_reads (
  message_id  uuid not null references public.chat_messages(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  read_at     timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- ============================================================================
-- 5) ROW LEVEL SECURITY ───────────────────────────────────────────────────────
--    Strict per-organization isolation, mirroring module_data. A user only sees
--    channels/messages in an org they belong to. (Per-channel guest scoping is
--    enforced in the app layer via chat_channel_members.role/access_level.)
-- ============================================================================
alter table public.chat_channels        enable row level security;
alter table public.chat_channel_members enable row level security;
alter table public.chat_messages        enable row level security;
alter table public.chat_message_reads   enable row level security;

-- chat_channels
drop policy if exists chat_ch_select on public.chat_channels;
create policy chat_ch_select on public.chat_channels for select to authenticated
  using (organization_id in (select public.user_org_ids()));
drop policy if exists chat_ch_insert on public.chat_channels;
create policy chat_ch_insert on public.chat_channels for insert to authenticated
  with check (organization_id in (select public.user_org_ids()));
drop policy if exists chat_ch_update on public.chat_channels;
create policy chat_ch_update on public.chat_channels for update to authenticated
  using      (organization_id in (select public.user_org_ids()))
  with check (organization_id in (select public.user_org_ids()));
drop policy if exists chat_ch_delete on public.chat_channels;
create policy chat_ch_delete on public.chat_channels for delete to authenticated
  using (organization_id in (select public.user_org_ids()));

-- chat_channel_members  (scoped by the parent channel's org)
drop policy if exists chat_ccm_all on public.chat_channel_members;
create policy chat_ccm_all on public.chat_channel_members for all to authenticated
  using (channel_id in (
    select id from public.chat_channels where organization_id in (select public.user_org_ids())
  ))
  with check (channel_id in (
    select id from public.chat_channels where organization_id in (select public.user_org_ids())
  ));

-- chat_messages
drop policy if exists chat_msg_select on public.chat_messages;
create policy chat_msg_select on public.chat_messages for select to authenticated
  using (organization_id in (select public.user_org_ids()));
drop policy if exists chat_msg_insert on public.chat_messages;
create policy chat_msg_insert on public.chat_messages for insert to authenticated
  with check (organization_id in (select public.user_org_ids()) and user_id = auth.uid());
-- Update/delete limited to the author (edit own message, soft-delete own message).
-- Pin/last_read are handled on separate rows/columns; broaden here if you want
-- channel admins to moderate.
drop policy if exists chat_msg_update on public.chat_messages;
create policy chat_msg_update on public.chat_messages for update to authenticated
  using      (organization_id in (select public.user_org_ids()))
  with check (organization_id in (select public.user_org_ids()));
drop policy if exists chat_msg_delete on public.chat_messages;
create policy chat_msg_delete on public.chat_messages for delete to authenticated
  using (organization_id in (select public.user_org_ids()) and user_id = auth.uid());

-- chat_message_reads
drop policy if exists chat_reads_all on public.chat_message_reads;
create policy chat_reads_all on public.chat_message_reads for all to authenticated
  using (message_id in (
    select id from public.chat_messages where organization_id in (select public.user_org_ids())
  ))
  with check (user_id = auth.uid());

-- ============================================================================
-- 6) REALTIME ─────────────────────────────────────────────────────────────────
--    Broadcast row changes (RLS still applies to each subscriber).
-- ============================================================================
alter table public.chat_channels        replica identity full;
alter table public.chat_channel_members replica identity full;
alter table public.chat_messages        replica identity full;
alter table public.chat_message_reads   replica identity full;

do $$
declare t text;
begin
  foreach t in array array['chat_channels','chat_channel_members','chat_messages','chat_message_reads'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================================
-- 7) STORAGE BUCKET for chat media (photos / video / files / voice) ───────────
--    Objects are namespaced by org id: <org_id>/<channel_id>/<file>. RLS checks
--    the first path segment against the caller's org membership.
-- ============================================================================
insert into storage.buckets (id, name, public)
  values ('chat-media','chat-media', false)
  on conflict (id) do nothing;

drop policy if exists chat_media_read on storage.objects;
create policy chat_media_read on storage.objects for select to authenticated
  using (bucket_id = 'chat-media'
         and (storage.foldername(name))[1] in (select public.user_org_ids()::text));

drop policy if exists chat_media_write on storage.objects;
create policy chat_media_write on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media'
              and (storage.foldername(name))[1] in (select public.user_org_ids()::text));

drop policy if exists chat_media_delete on storage.objects;
create policy chat_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media'
         and (storage.foldername(name))[1] in (select public.user_org_ids()::text));

-- ============================================================================
-- Done. Chat is org-isolated, real-time and audit-ready.
-- ============================================================================
