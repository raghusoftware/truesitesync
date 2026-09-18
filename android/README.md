# True Site Sync — Native Android (Field)

A native **Kotlin + Jetpack Compose** field client for True Site Sync, built to
**coexist** with the existing Capacitor web / Electron build against the **same
Supabase backend**. It owns the on-site flows (issues, diary, safety, deliveries,
attendance); the web app keeps the GST/finance/ledger engine.

> Status: **foundation + Today, Issues, Site Diary, Attendance, Inventory and
> Documents flows + offline CameraX photo capture with geotag + live multi-device
> sync (Realtime websocket)**. The remaining field flows slot into this same
> skeleton — see "Roadmap" below.

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

- ~~Diary / Site progress (`dailyProgress`) — full DPR + PDF~~ **DONE** — Site
  tab + DPR editor (`ui/diary/`): header (date, weather, work done, manpower,
  equipment, hindrance, geotagged photo) plus **editable measurement rows**
  (description, nos, L, B, H → auto qty, unit, rate → amount) and **overheads**
  (resource, qty, rate → cost) with running totals — field names match the web
  DPR for lossless round-trip. **On-device PDF export** (`DprPdf`, platform
  PdfDocument, no library) renders header + both tables + totals and opens/shares
  via FileProvider.
- ~~Attendance (`attendanceLogs` + `labourMaster`)~~ **DONE** — `ui/attendance/`
  is a daily **muster roll**: the whole active crew on one screen, tap a name to
  cycle P / A / ½ / OT (deterministic `att_{worker}_{date}` id = one log per
  worker per day), "All present" bulk action, batched save, and quick add-worker.
  Preserves the web roster's KYC/payroll keys via `extraJson`.
- ~~Inventory & stock (`rawMaterials` + `inventoryTx`)~~ **DONE** —
  `ui/inventory/` is a live stock list: **on-hand is derived** (Σ IN − Σ OUT via
  a Room aggregate query), low-stock items flag red against `minStock`, search,
  add-material, and a one-tap **Received (IN) / Issued (OUT)** movement sheet.
- ~~Documents / drawings viewer (`projectDocs`)~~ **DONE** — `ui/documents/`.
  Note `projectDocs` is an OBJECT keyed by projectId (not an array), so it needed
  a lightweight **project selector** (new pull-only `projects` module) and a
  whole-object REPLACE push (`push_module_replace`, merged over the cloud object
  so other projects survive). Browse nested folders, upload any file via SAF to
  bucket `project-docs`, view images in-app (Coil) and other files via a signed
  URL. Offline folder/upload metadata syncs; bytes upload when online.
- **Safety** (`incidents`/`ppeChecks`), **Delivery + QR** — next; Delivery adds
  barcode/QR scanning (CameraX + ML Kit) and links a scan to a stock IN.

- ~~Generic all-module data sync~~ **DONE** — `GenericSyncRepository` +
  `module_mirror` table mirror EVERY org `module_data` key and personal
  `user_data` key into the device in one sweep per sync (pull-only; typed repos
  still own their writes). So all ~55 modules' data lands on Android immediately.
  Browse it via Capture → **All modules** (`ui/modules/`). Scope pruning only
  runs on a successful snapshot, so a network blip never wipes the mirror.

- ~~Mix design / recipes~~ **DONE** — `ui/mix/` (module `mixDesigns`):
  per-project recipe list + editor (name/grade, BOQ code, per-unit, ingredient
  rows: material, unit, qty, wastage%). NOTE: stored under a new `mixDesigns`
  key rather than the web's nested `recipes` object (which is keyed by
  clientId→itemCode and needs clients + BOQ, not yet modeled natively); existing
  web recipes remain visible via the "All modules" mirror. Full web-recipes
  interop is a follow-up once clients/BOQ land.
- ~~Abstracts / billing (`abstracts`)~~ **DONE** — `ui/abstracts/`: per-project
  work-abstract list + editor (abstract no., date, area, item rows: code, desc,
  unit, qty × rate → amount, grand total), **import items from a measurement
  sheet** (aggregates entries by code/description), and on-device PDF export.
  Field names match the web abstract items for lossless round-trip.
- ~~Measurement sheets (`sheets`)~~ **DONE** — `ui/measurement/`: per-project
  sheet list + editor with entry rows (description, code, unit, nos/L/B/H →
  auto qty, remarks), running total, and on-device PDF export (`SheetPdf`).
  Field names match the web sheet entries for lossless round-trip.
- ~~Equipment / fleet (`equipmentList` + `equipmentLogs`)~~ **DONE** —
  `ui/equipment/`: per-project asset register (name, type, reg no, ownership
  OWNED/RENTED, meter unit HMR/KM, opening meter, rent rate/basis, operator,
  service target) with a live **status** badge (ACTIVE / SERVICE DUE /
  UNDER REPAIR) and current meter. Per-asset **log** entry (Runbook hours/km,
  Fuel litres/source/amount, Maintenance/Repair cost, Breakdown) that advances
  the running meter, flags SERVICE_DUE at the PM target, and flips status on
  breakdown/repair — matching the web's `saveEquipmentLog`. Both module keys
  round-trip losslessly (extraJson preserves vendorId, baselineEff, receipt,
  operatorId, siteId, start/finish times).
  **Fuel management** (`fuelStorages` + `fuelTxns`, Equipment → Fuel): register
  tanks/bowsers with a live balance (Σ RECEIPT − Σ ISSUE), record tanker
  **receipts** and **dip reconciliations** (physical vs book → variance), and
  **issue fuel** from a tank to a machine — which deducts the tank AND writes the
  machine's Fuel log (source "On-Site Barrel"), mirroring the web's `_fuelIssue`.
  Pump-credit txns round-trip too (type preserved); the pump-ledger UI is a
  follow-up.
- ~~Purchase + Accounts (`purchaseOrders`, `vendorMaterials`, `vendorPayments`,
  `accounts`)~~ **DONE** — `ui/purchase/` hub with Orders · Bills · Payments
  tabs. PO/Bill editor picks a vendor + items (code→name/unit/rate auto-fill),
  qty × rate + GST% per line, running totals. Payment-out records a payment to a
  vendor from an account. `ui/finance/AccountsScreen` is the bank/cash master.
  Offline-first; unknown web keys preserved via extraJson.
- ~~Parties (`clients` + `vendors`)~~ **DONE** — `ui/parties/`: Clients/Vendors
  tabbed master (name, contact, phone, GSTIN, address), add/edit/delete. One
  Room table, two cloud keys. Feeds GRN supplier + (coming) sales/purchase.
- ~~Goods receipt / GRN (`grnRecords`)~~ **DONE** — `ui/grn/`: pick supplier
  (from vendors) + materials (from the item catalog — **code→name/unit/rate
  auto-fill**), qty × rate, save → **raises one inventory IN per line**
  (deterministic `refGrnId`, rebuilt in place, never double-counts), so received
  stock shows up in Inventory on-hand. Mirrors the web GRN → stock IN.
- ~~Petty cash (`pettyCashCustodians` + `pettyCashTxns`)~~ **DONE** —
  `ui/petty/`: per-project **custodian wallets** with a live balance (accepted
  transfers − expenses − returns, a Room aggregate). Per custodian: a ledger and
  three actions — **log expense** (amount, category from the web's list,
  description, date), **add funds** (imprest transfer in, recorded accepted),
  and **return** to an account. Transfers synced from the web arrive `pending`
  and can be **confirmed** (accepted) on device. Categories and the balance math
  match the web's `pettyCash.js` (`_txnEffect`). Receipt-photo capture and the
  bank-account picker are follow-ups (photoPath/account fields round-trip via
  extraJson meanwhile).
- ~~Cross-module pipeline (DPR → sheet → abstract, recipe → inventory)~~
  **DONE** — mirrors the web's `mpRecordWork` / `generateAbstractFromSheet` /
  `rebuildSheetConsumption`:
  1. **DPR → measurement sheet.** Saving a DPR flows its measurement rows into a
     per-location **running** measurement sheet (`MeasurementFlow`, find-or-create
     by deterministic id). Rows are tagged `_dprId`, so re-saving an edited DPR
     replaces its own rows instead of duplicating (like `mpClearDpr`); deleting a
     DPR pulls them back out.
  2. **Sheet → Abstract.** "Generate Abstract" on a measurement sheet aggregates
     entries by code (carrying qty × rate), creates the abstract, and marks the
     sheet **billed** + linked (badge on the card). Sheet entries now carry `rate`
     for lossless round-trip and real billing amounts.
  3. **Recipe → inventory auto-deduct.** On every sheet save (`ConsumptionEngine`),
     each measured BOQ code is matched to a **mix design** by its `itemCode`, and
     every ingredient writes a `CONSUME` stock movement = `qty × ingredient ×
     (1+wastage%)`, tagged `refSheetId` so it rebuilds in place (never
     double-counts). Stock-on-hand stays derived, so site stock deducts
     automatically. NOTE: consumption reads Android `mixDesigns` (matched on BOQ
     code) rather than the web's nested `recipes` object; a running sheet Android
     creates for a location may not share the exact id of the web's sheet for that
     location, but `_dprId` tagging keeps totals correct.
- **Project scoping is now strict** — worker roster and item catalog are
  project-scoped too (filter `projectId = active OR NULL`, matching the web's
  `!projectId || projectId === pid`), and new workers/items are stamped with the
  active project. Switching projects updates every module's data automatically.

- ~~Project scoping across all flows~~ **DONE** — a global **ProjectBar**
  (`ui/project/`) on the main tabs sets the active project (SessionStore); every
  field flow scopes to it and stamps new records: Today tiles, Issues list,
  Site Diary list, and Inventory on-hand filter by the active project (null =
  "All projects"); new issues/diary/stock-movements/attendance are tagged with
  it. Worker roster and item catalog stay org-global.
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
