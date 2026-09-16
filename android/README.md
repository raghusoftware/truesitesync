# True Site Sync — Native Android (Field)

A native **Kotlin + Jetpack Compose** field client for True Site Sync, built to
**coexist** with the existing Capacitor web / Electron build against the **same
Supabase backend**. It owns the on-site flows (issues, diary, safety, deliveries,
attendance); the web app keeps the GST/finance/ledger engine.

> Status: **foundation + Today, Issues and Site Diary flows + offline CameraX
> photo capture with geotag + live multi-device sync (Realtime websocket)**. The
> remaining field flows slot into this same skeleton — see "Roadmap" below.

## Why native coexists (not a rewrite)

The backend is a generic JSONB document store, not per-feature tables:

- `user_data(user_id, data_key, data)` — per-user documents.
- `module_data(organization_id, module_name, record_id, payload)` — org-scoped,
  realtime, RLS via `org_members`. **For a module the whole array lives in one
  row where `record_id == module_name`** (`payload` is the full array).

So the native client is just **another client on that contract** — no schema
change, no data migration, full interop with the web app. Writes go through the
same RPCs the web app uses:

| Operation | Endpoint (verified against `js/database/sync.js`) |
|---|---|
| Push (server-side array union) | `rpc/push_module_merged {p_module, p_payload, p_org}` |
| Replace (shrink an array) | `rpc/push_module_replace` |
| Tombstone deletes | `rpc/record_deletions {p_org, p_entries:[{key,id}]}` |
| Read a module | `GET module_data?organization_id=eq&module_name=eq&record_id=eq&select=payload,updated_at` |
| Resolve org | `rpc/user_org_ids` |
| Media | Storage bucket `project-docs`, path `{org}/{folder}/{id}-{name}`, signed URLs |

**Integrity guarantee:** each issue's original cloud object is preserved verbatim
in `IssueEntity.extraJson`; on push the client overlays only the fields it owns
(`IssueMapper.toPayload`), so keys the native app doesn't model (`boqRef`,
`taskId`, custom fields written by the web app) survive a round-trip untouched.

## Architecture

Clean-ish layering, offline-first, unidirectional UI state.

```
ui/ (Compose)            data/
  theme/  design system    local/   Room: IssueEntity + DAOs (source of truth for reads)
  navigation/ 5-tab IA     remote/  SupabaseApi (Ktor → REST/RPC), DTOs, IssueMapper
  today/  home screen      repo/    IssueRepository (optimistic write + reconcile)
  issues/ list + editor    sync/    SyncWorker (WorkManager) + SyncScheduler + ConnectivityObserver
  auth/   sign-in          session/ SessionStore (DataStore: token, org, prefs)
  root/   auth gate       di/       Hilt (DataModule) + HiltWorkerFactory
```

- **Local-first:** reads always come from Room (instant, offline). Writes hit
  Room immediately (optimistic) and enqueue a WorkManager sync.
- **Sync = WorkManager** (the Android-correct WorkManager the brief asks for):
  network-constrained one-shot after each write + a 15-min periodic safety net,
  exponential backoff, `retry()` on transient failure so the outbox drains when
  connectivity/auth returns. `IssueRepository.syncNow()` = tombstone deletes →
  push whole array (server unions) → adopt merged result without clobbering rows
  still dirty locally.
- **Process death / config change:** state lives in Room + DataStore + Compose
  `ViewModel` StateFlows; nothing important is held in the composition.

## Design system (deliverable 3)

`ui/theme` — sunlight-tuned Material 3:
- **Dark field scheme** default; **high-contrast light** ("sunlight mode") toggle
  (wired through `SessionStore.sunlightMode` → `TrueSiteSyncTheme`).
- Single **high-vis safety amber** accent, reserved for the primary action and
  attention states. Solid surfaces + borders (shadows vanish outdoors).
- Type scale is larger/heavier than stock; min touch target **56dp** (`Dimens`).

## Information architecture (deliverable 2)

Stable 5-tab bottom nav — positions never change; content is role/project-aware:
**Today · Site · [Capture FAB] · Issues · More**. Finance/ledgers live under
*More*, demoted from the field thumb-zone. Deep links: App Links on
`https://truesitesync.com/app/...` + `truesitesync://` scheme (manifest).

## Running it

1. Open `android/` in Android Studio (Ladybug+), or provision the Gradle wrapper:
   `cd android && gradle wrapper` (the binary `gradle-wrapper.jar` isn't checked
   in; Android Studio generates it on first open).
2. `cp local.properties.example local.properties`, set `sdk.dir` and
   `SUPABASE_ANON_KEY` (same anon key as the web app; URL defaults to the project
   Supabase). Without the anon key the app builds and runs but sign-in is disabled.
3. Run the `app` config on a device/emulator (minSdk 26, targetSdk 35).

> Not yet built in this environment — there's no Android SDK here. Code is written
> to be idiomatic and correct; first build needs a Studio Gradle sync.

## Roadmap (remaining deliverables 1, 5, 6)

Each is a new `ui/<feature>` + reusing `module_data` under a new `module_name`:

- ~~Diary / Site progress (`dailyProgress`)~~ **DONE** — Site tab + fast <60s
  DPR editor (`ui/diary/`): date, weather chips, work done, skilled/unskilled
  manpower, equipment, geotagged photo. Preserves the web editor's richer keys
  (measurements[], overheads[], dprNum) via `extraJson`. Multi-line measurement
  tables are the follow-up.
- **Safety** (`incidents`/`ppeChecks`), **Delivery + QR** (`inventoryTx`),
  **Attendance** (`attendanceLogs`) — next, same pattern.
- ~~CameraX capture with geotag burn-in → Storage upload~~ **DONE** — see
  `ui/capture/` + `data/media/`. Photos capture offline (persisted to filesDir),
  are geotag-burned, and upload to bucket `project-docs` at `{org}/issues/{id}-{name}`
  on the next sync (mirrors `execMedia.js`); display uses signed URLs via Coil.
  Multi-photo galleries and drawing markup are the follow-ups.
- ~~Realtime via a Ktor websocket on `module_data`~~ **DONE** —
  `data/sync/RealtimeManager` speaks the Supabase Realtime (Phoenix) protocol:
  joins a channel filtered by `organization_id`, sends the user JWT for RLS,
  heartbeats, and reconnects with backoff. Each postgres change is treated as a
  *signal* that nudges the normal sync pipeline (so the conflict-safe reconcile
  and UI Flows refresh), rather than trusting wire-payload parsing. Runs only in
  the foreground (ProcessLifecycle) for battery; the 15-min periodic sync is the
  reliable fallback if the socket can't connect.
- **Delighters**: voice-to-text diary, offline drawing markup, home-screen
  widgets (Glance) for one-tap capture, predictive back (already enabled).
```
