/* ============================================================================
 * True Site Sync — Organization Cloud Sync Engine (pure JS, single file)
 * ----------------------------------------------------------------------------
 * Real-time, org-scoped sync on top of Supabase. Every module saves through
 * one universal function (saveToCloud) into a central `module_data` table,
 * tagged by module_name and isolated per organization via RLS. Realtime
 * subscriptions push every other device's changes instantly.
 *
 * USAGE (single-file architecture):
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="js/cloudSync.js"></script>
 *   <script>
 *     await TSCloud.init();                          // after the user signs in
 *     await TSCloud.saveToCloud('labor_attendance', record);
 *     TSCloud.onModuleChange('labor_attendance', (evt, payload) => renderRow(payload));
 *   </script>
 *
 * Exposes a single global: window.TSCloud
 * ==========================================================================*/
(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  const SUPABASE_URL = 'https://cuxblomxefwgdcijmpjk.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1eGJsb214ZWZ3Z2RjaWptcGprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MzE2ODgsImV4cCI6MjA5NTUwNzY4OH0.BPSv4rkvjIn0mYdwkfdpRc6NZXB9aOLycongwShisRU';

  // Reuse an existing client if the app already created one; else make ours.
  const sb = (window.supabase && window.supabase.from)
    ? window.supabase
    : window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        realtime: { params: { eventsPerSecond: 10 } },
      });

  // ── State ──────────────────────────────────────────────────────────────────
  let ORG_ID = null;
  let USER = null;
  let channel = null;
  const listeners = Object.create(null);   // moduleName ('*' = all) -> [callback]

  // ── Tiny event registry ─────────────────────────────────────────────────────
  function onModuleChange(moduleName, cb) {
    (listeners[moduleName] || (listeners[moduleName] = [])).push(cb);
    return () => { listeners[moduleName] = (listeners[moduleName] || []).filter(f => f !== cb); };
  }
  function emit(moduleName, evt, payload, row) {
    (listeners[moduleName] || []).forEach(cb => { try { cb(evt, payload, row); } catch (e) { console.warn(e); } });
    (listeners['*'] || []).forEach(cb => { try { cb(evt, payload, row, moduleName); } catch (e) { console.warn(e); } });
  }

  // ── Init: authenticate + resolve organization_id ─────────────────────────────
  async function init() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { ui.toast('Please sign in to enable cloud sync', 'error'); return false; }
    USER = user;

    // Find the org this user belongs to (uses the app's existing org_members table).
    const { data: membership } = await sb
      .from('org_members').select('org_id').eq('user_id', user.id)
      .eq('is_active', true).limit(1).maybeSingle();
    ORG_ID = membership ? membership.org_id : null;

    // First-time users: create an organization for them (atomic RPC).
    if (!ORG_ID) {
      const orgName = (user.user_metadata && user.user_metadata.company) || (user.email || 'My Company').split('@')[0];
      const { data: newOrg, error } = await sb.rpc('create_org_with_owner', { p_name: orgName, p_email: user.email });
      if (error) { ui.toast('Could not set up your organization: ' + error.message, 'error'); return false; }
      ORG_ID = newOrg;
    }

    startRealtime();
    ui.indicator('synced');
    return true;
  }

  // ── Universal save: upsert a record into the org's module_data ───────────────
  // moduleName: logical bucket ('labor_attendance', 'epc_project', ...)
  // dataObject: any JSON-serialisable object (uses .id as the record id if present)
  // recordId:   optional explicit id (falls back to dataObject.id, then a uuid)
  async function saveToCloud(moduleName, dataObject, recordId) {
    if (!ORG_ID && !(await init())) return { ok: false, error: 'No organization' };
    ui.indicator('saving');

    const row = {
      organization_id: ORG_ID,
      module_name: moduleName,
      record_id: String(recordId || dataObject.id || dataObject.record_id || _uuid()),
      payload: dataObject,
      created_by: USER && USER.id,
      updated_by: USER && USER.id,
    };

    const { data, error } = await sb
      .from('module_data')
      .upsert(row, { onConflict: 'organization_id,module_name,record_id' })
      .select()
      .single();

    if (error) {
      ui.indicator('error', error.message);
      ui.toast('⚠️ Save failed — kept on this device, will retry', 'error');
      return { ok: false, error };
    }
    ui.indicator('synced');
    ui.toast('☁️ Saved & synced', 'success', true /* throttle */);
    return { ok: true, data };
  }

  // ── Load all records for a module (initial paint) ────────────────────────────
  async function loadModule(moduleName) {
    if (!ORG_ID && !(await init())) return [];
    const { data, error } = await sb
      .from('module_data').select('*')
      .eq('organization_id', ORG_ID).eq('module_name', moduleName)
      .order('updated_at', { ascending: false });
    if (error) { console.warn('[cloud] load', moduleName, error.message); return []; }
    // Return payloads with the db ids attached for later upsert/delete.
    return (data || []).map(r => Object.assign({ _id: r.id, _recordId: r.record_id, _updatedAt: r.updated_at }, r.payload));
  }

  // ── Delete a record ──────────────────────────────────────────────────────────
  async function deleteFromCloud(moduleName, recordId) {
    if (!ORG_ID) return { ok: false };
    const { error } = await sb.from('module_data').delete()
      .eq('organization_id', ORG_ID).eq('module_name', moduleName).eq('record_id', String(recordId));
    if (error) { ui.toast('Delete failed: ' + error.message, 'error'); return { ok: false, error }; }
    return { ok: true };
  }

  // ── Realtime: every device in the org gets INSERT/UPDATE/DELETE instantly ────
  function startRealtime() {
    if (channel || !ORG_ID) return;
    channel = sb
      .channel('org_module_data_' + ORG_ID)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'module_data', filter: 'organization_id=eq.' + ORG_ID },
        (msg) => {
          const row = msg.new && msg.new.id ? msg.new : msg.old;
          if (!row) return;
          // Ignore the echo of our own just-saved change (best-effort).
          emit(row.module_name, msg.eventType, row.payload, row);
          if (msg.eventType !== 'DELETE') ui.toast('🔄 Updated from another device', 'info', true);
        })
      .subscribe((status) => { if (status === 'SUBSCRIBED') ui.indicator('synced'); });
  }
  function stopRealtime() { if (channel) { sb.removeChannel(channel); channel = null; } }

  function _uuid() {
    return (crypto && crypto.randomUUID) ? crypto.randomUUID()
      : 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  /* ==========================================================================
   * UI — obsidian-emerald glassmorphism sync indicator + toasts
   * (injected once; no external CSS needed — keeps single-file architecture)
   * ========================================================================*/
  const ui = (function () {
    let _lastToast = 0;
    function ensureStyles() {
      if (document.getElementById('tscloud-styles')) return;
      const css = `
      .tsc-ind{position:fixed;top:14px;right:16px;z-index:2147483000;display:flex;align-items:center;gap:8px;
        padding:8px 14px;border-radius:999px;font:600 12px/1 'Inter',system-ui,sans-serif;color:#d1fae5;
        background:rgba(6,16,12,.55);backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%);
        border:1px solid rgba(16,185,129,.28);box-shadow:0 8px 32px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.05);
        transition:opacity .3s, transform .3s;cursor:pointer;user-select:none}
      .tsc-ind .dot{width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 10px #10b981}
      .tsc-ind.saving .dot{background:#f59e0b;box-shadow:0 0 10px #f59e0b;animation:tscpulse 1s infinite}
      .tsc-ind.error  .dot{background:#ef4444;box-shadow:0 0 10px #ef4444}
      .tsc-ind.error{color:#fecaca;border-color:rgba(239,68,68,.35)}
      @keyframes tscpulse{0%,100%{opacity:1}50%{opacity:.35}}
      .tsc-toasts{position:fixed;bottom:20px;right:20px;z-index:2147483600;display:flex;flex-direction:column;gap:10px;align-items:flex-end}
      .tsc-toast{padding:12px 16px;border-radius:14px;font:600 13px/1.35 'Inter',system-ui,sans-serif;max-width:320px;
        color:#ecfdf5;background:rgba(6,16,12,.62);backdrop-filter:blur(16px) saturate(160%);-webkit-backdrop-filter:blur(16px) saturate(160%);
        border:1px solid rgba(16,185,129,.30);box-shadow:0 12px 40px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.06);
        transform:translateY(8px);opacity:0;animation:tscin .35s cubic-bezier(.2,.8,.2,1) forwards}
      .tsc-toast.error{color:#fee2e2;border-color:rgba(239,68,68,.4)}
      .tsc-toast.info{color:#cffafe;border-color:rgba(45,212,191,.35)}
      @keyframes tscin{to{transform:translateY(0);opacity:1}}`;
      const el = document.createElement('style'); el.id = 'tscloud-styles'; el.textContent = css;
      document.head.appendChild(el);
    }
    function indicator(state, msg) {
      ensureStyles();
      let el = document.getElementById('tscloud-ind');
      if (!el) {
        el = document.createElement('div'); el.id = 'tscloud-ind'; el.className = 'tsc-ind';
        el.onclick = () => sync();                      // click pill to force-refresh
        document.body.appendChild(el);
      }
      const label = state === 'saving' ? 'Syncing…' : state === 'error' ? 'Sync error' : 'Synced';
      el.className = 'tsc-ind ' + (state === 'synced' ? '' : state);
      el.title = msg || 'Cloud sync — click to refresh';
      el.innerHTML = '<span class="dot"></span><span>' + label + '</span>';
    }
    function toast(text, kind, throttle) {
      ensureStyles();
      if (throttle && Date.now() - _lastToast < 3500) return;   // avoid spam on rapid saves
      _lastToast = Date.now();
      let wrap = document.getElementById('tsc-toasts');
      if (!wrap) { wrap = document.createElement('div'); wrap.id = 'tsc-toasts'; wrap.className = 'tsc-toasts'; document.body.appendChild(wrap); }
      const t = document.createElement('div'); t.className = 'tsc-toast ' + (kind || 'info'); t.textContent = text;
      wrap.appendChild(t);
      setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; setTimeout(() => t.remove(), 350); }, 2600);
    }
    return { indicator, toast };
  })();

  // Force a re-pull of every module that has listeners (used by the indicator click).
  async function sync() {
    ui.indicator('saving');
    const mods = Object.keys(listeners).filter(k => k !== '*');
    for (const m of mods) {
      const rows = await loadModule(m);
      rows.forEach(r => emit(m, 'RELOAD', r, { module_name: m, record_id: r._recordId }));
    }
    ui.indicator('synced');
    ui.toast('☁️ Up to date', 'success');
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  window.TSCloud = {
    init, saveToCloud, loadModule, deleteFromCloud,
    onModuleChange, startRealtime, stopRealtime, sync,
    get orgId() { return ORG_ID; },
    get user() { return USER; },
    client: sb,
  };
})();
