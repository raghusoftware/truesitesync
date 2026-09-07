# True Site Sync — Chat Module

Construction-native team chat that replaces WhatsApp/Telegram site groups and
becomes the single source of truth for site communication. This document is the
feature spec + design + schema + roadmap; the working MVP ships alongside it.

> **What's built now (MVP, this branch):** project channels + sub-channels + DMs,
> real-time text, photo/video/file/voice/location attachments (multi-attach),
> threaded replies, pins, @mentions, priority & safety flags, search/filter/sort,
> read receipts & delivery status, per-channel notification prefs, one-click
> convert-to-record, offline-first outbox, dark + high-contrast + mobile UI.
>
> **Deferred to Phase 2 (documented, not yet built):** inventory/equipment asset
> tagging (schema column reserved), end-to-end encryption, continuous live-location
> streaming, in-app photo/video markup, native push, AI summarize/suggest, deep
> two-way linking of converted records into the Tasks/RFI modules.

---

## 1. Feature specification

### 1.1 Messaging
| Capability | MVP | Notes |
|---|---|---|
| Text messages | ✅ | Markdown-safe, `@` mentions, safety-keyword auto-highlight |
| Photo & video | ✅ | Client-side image compression (canvas → JPEG ~1600px, q0.72) for low bandwidth; original kept for files |
| File sharing (PDF/DWG/XLS/DOC…) | ✅ | Type-aware icons + size; opens/downloads via signed URL |
| Voice messages | ✅ | `MediaRecorder` (webm/opus), live timer, RMS waveform (≤40 bars), duration |
| Location | ✅ | One-time pin + "live 15 min" flag (continuous streaming = Phase 2) |
| Multiple media in one message | ✅ | Composer staging tray; any mix of media + location + text |

### 1.2 Organization
- **Project channels** auto-provisioned per project (`kind: project`, bound to `project_id`).
- **Sub-channels**: `zone`, `trade`, `crew`, `safety`, `logistics`, `general`.
- **Direct 1:1 & group** chats (`dm` / `group`).
- **Threaded replies** (side panel), **pin** important messages, **convert** any message into a Task / RFI / Punch List / Safety Observation / Daily Report entry (one click).

### 1.3 Search, filter & sort
- Full-text search across message bodies, file names and people.
- Filters: media type, priority, has-attachment, has-location, mentions-me (project scoping is via channel selection).
- Sort: Latest, Unread, Priority, Mentions.

### 1.4 Collaboration & permissions
- View gated by RBAC (`chatView` registered in `js/modules/rbac.js`; granted to PM / Supervisor / Engineer / Admin roles).
- Org isolation enforced at the database by RLS (`user_org_ids()`), matching the rest of the platform.
- Channel-level roles (`owner/admin/member/guest`) and `access_level` (`internal/subcontractor/client/guest`) for subcontractor/client/guest scoping.
- @mentions, read receipts ("✓✓ N"), delivery status (🕒 pending → sent), priority / safety-alert flags with distinct visual + notification treatment.

### 1.5 Field experience
- Mobile-first single-pane layout with slide navigation and 48px gloves-friendly targets.
- Quick-action attach menu (Camera / Video / File / Voice / Location).
- Dark mode (system + explicit) and an outdoor **high-contrast** mode (`html.chat-hc`).
- **Offline-first**: messages queue in an IndexedDB/localStorage outbox and flush automatically on reconnect; realtime re-subscribes on socket recovery.

### 1.6 Notifications & intelligence
- Per-channel preference: All / Mentions / Priority / Muted.
- In-app rich toasts with priority styling; safety messages escalate to error-level.
- Safety keyword detection highlights hazard terms inline (offline heuristic).
- AI summarize / suggested reply → Phase 2.

---

## 2. Key user flows

**Share a video + location from the field**
1. Tap ＋ → Video → capture/pick → auto-compressed and staged.
2. Tap ＋ → Location pin → GPS staged.
3. Type note, set priority, Send → both ride in one message; offline → queued, sent on reconnect.

**Report a hazard (safety alert)**
1. Type message; hazard keywords auto-highlight.
2. Set priority = 🦺 Safety → red-bordered bubble + stronger notification to the channel.
3. Convert ▾ → Safety Observation → titled record created + system back-link posted.

**Convert a message to a Task**
1. On any message → Convert ▾ → ✅ Task → confirm title.
2. Chat-owned record is stored and a system message links it in-thread. (Phase 2: record lands directly in the Tasks module.)

**Direct message a teammate** → ＋ New channel → group, or open a DM; realtime delivery with read receipts.

---

## 3. UI structure (wireframe)

```
WEB (≥860px)                              MOBILE (<860px)
┌───────────┬───────────────────────┐    ┌───────────────────┐
│ Sidebar   │  Channel header        │    │  Channel list      │  ← pane=list
│  search   │  [pins bar]            │    │  search / filters  │
│  sort/flt │  ┌───────────────────┐ │    │  ▸ Project chans   │
│  ─Project │  │ messages          │ │    │  ▸ Sub-channels    │
│  ─Sub     │  │  bubbles + media  │ │    │  ▸ Direct msgs     │
│  ─Direct  │  │  threads/pins     │ │    └───────────────────┘
│           │  └───────────────────┘ │    ┌───────────────────┐
│           │  [＋][prio][input][➤] │    │ ‹ header           │  ← pane=thread
└───────────┴───────────────────────┘    │   messages         │
       thread panel slides from right      │ [＋][prio][in][➤] │
                                           └───────────────────┘
```

Files: `js/modules/chat.js` (logic + render), `css/chat.css` (scoped styles),
`#chatView` container in `app.html`, nav button in the Project Context nav.

---

## 4. Database schema

Defined in [`db/chat_schema.sql`](../db/chat_schema.sql) — org-scoped, RLS, realtime,
private `chat-media` storage bucket. Summary:

- **chat_channels** — `id, organization_id, project_id, name, kind, topic, icon, access_level, is_archived, created_by, timestamps`.
- **chat_channel_members** — `channel_id, user_id, role, notif_pref, last_read_at, is_muted, joined_at` (drives access, unread, mute).
- **chat_messages** — `id, organization_id, channel_id, parent_id (thread), user_id, kind, body, priority, attachments jsonb, asset_tags jsonb (reserved), location jsonb, mentions jsonb, linked_record jsonb, is_pinned, edited_at, deleted_at (soft delete/audit), created_at`; GIN full-text index on `body`.
- **chat_message_reads** — `(message_id, user_id, read_at)` per-message receipts.

RLS mirrors `module_data`: every row is visible only to members of its
organization (`organization_id in (select public.user_org_ids())`); messages are
author-writable; storage objects are namespaced `<org_id>/<channel_id>/<file>`
and checked against org membership. All four tables are added to the
`supabase_realtime` publication with `replica identity full`.

---

## 5. Data-layer / API overview

The app is a Supabase-backed SPA, so the "API" is the Supabase client + realtime
(no bespoke server). `chat.js` encapsulates it behind a small data layer with a
transparent **local fallback** when the tables don't exist yet.

| Operation | Cloud (Supabase) |
|---|---|
| List channels | `from('chat_channels').select().eq('organization_id',org)` |
| Auto-provision project channel | `insert` if none for current `project_id` |
| Load messages | `from('chat_messages').select().eq('channel_id',id).is('parent_id',null)` |
| Send message | `insert` (+ Storage `upload` per attachment, then signed URL) |
| Thread replies | `select().eq('parent_id',pid)` / `insert` with `parent_id` |
| Pin / edit / soft-delete | `update` by id (author-scoped) |
| Read receipts / unread | upsert `chat_channel_members.last_read_at` + `chat_message_reads` |
| Notif prefs | upsert `chat_channel_members.notif_pref/is_muted` |
| Realtime | `channel('rt_chat_<org>').on('postgres_changes', … chat_messages/chat_channels)` |
| Media | Storage bucket `chat-media`, `createSignedUrl` (1h) on read |

Offline: unsent messages persist to IndexedDB (`tss_chat_outbox`) and flush on
`online` / realtime recovery. Convert-records persist to `tss_chat_converts`.

---

## 6. Priority roadmap

**MVP (this branch)** — everything in the status box above: channels, realtime
text + rich media + voice + location, threads/pins/mentions, priority & safety,
search/filter/sort, receipts, notif prefs, convert-to-record, offline-first,
mobile + dark + high-contrast, RBAC + org RLS.

**Phase 2**
1. **Inventory/equipment asset tagging** — `@asset` picker, rich asset cards
   (name/code/status/location/photo/quick-actions), open full record, inline
   status update (Available/In Use/Under Maintenance/Breakdown). Schema column
   `asset_tags` is already reserved.
2. **Deep record integration** — converted messages write directly into the
   Tasks / RFI / Punch / Daily Report / Safety modules with two-way back-links.
3. **In-app photo/video markup** — draw, arrow, circle, text, measure; auto-geotag overlay.
4. **Continuous live location** streaming and map view.
5. **End-to-end encryption** for sensitive project channels (key management +
   search trade-offs to be designed; today data is protected by TLS + RLS).
6. **Native push notifications** (Capacitor) with rich previews; presence/typing.
7. **AI assist** — thread auto-summary, suggested replies, safety-signal detection.
8. **Guest/client portals** with scoped external access.

### Known MVP limitations
- Cloud attachment URLs are signed for 1 hour; a page open longer may need a refresh to reload old media (local/demo mode uses data URLs and is unaffected).
- "Live location" stores a 15-minute window flag but does not yet stream updates.
- Convert-to-record creates chat-owned records + a linking system message; it does not yet populate the target modules (Phase 2 item 2).
