/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Execution Intelligence Platform
 * ───────────────────────────────────────────────────────────
 * Reforms Planning + Micro-Planning into a three-stage, fully-auditable
 * project-execution engine that preserves every decision forever:
 *
 *   Stage 1  BASELINE        (execActivities → approved snapshot in execBaselines,
 *                             then read-only forever)
 *   Stage 2  EXECUTION PLAN  (execPlans — Generate from baseline, every edit forces
 *                             a reason and appends a new version V1→V2→V3…;
 *                             each change logged to execChanges)
 *   Stage 3  ACTUALS         (execActuals — append-only daily site records with
 *                             photos / GPS / voice notes)
 *
 *   → Compare (Original │ Execution │ Actual) → Variance engine
 *   → Dashboard (KPIs + charts) → rule-based AI Insights
 *
 * Nothing is ever overwritten. Baselines are immutable, plans are versioned,
 * changes and actuals are append-only. Deletes go through recycleDelete
 * (tombstoned). Media bytes live in Storage; only refs ride the synced JSON.
 * ═══════════════════════════════════════════════════════════
 */
import { state, saveAllData, pullRemoteUpdates } from './state.js';
import { showToast, getCurrencySymbol, getCompanyHeaderForPDF, mobileSavePDF } from './utils.js';
import { uploadExecMedia, openExecMedia, removeExecMedia, getGps, gpsLabel, startVoice, stopVoice, isRecording } from './execMedia.js';

/* ── constants ─────────────────────────────────────────── */
const TRADES = ['Mason', 'Bar Bender', 'Shuttering Carpenter', 'Steel Fixer', 'Plumber', 'Electrician', 'Painter', 'Welder', 'Operator', 'Skilled Helper', 'Unskilled Helper', 'Mistri', 'Supervisor', 'Engineer'];
const CHANGE_REASONS = ['Rain / Weather', 'Client Change', 'Drawing Revision', 'Equipment Breakdown', 'Labour Shortage', 'Material Delay', 'Safety Issue', 'Access Restriction', 'Utility Conflict', 'Productivity Improvement', 'Emergency Work', 'Other'];
const WEATHER = ['Clear', 'Cloudy', 'Light Rain', 'Heavy Rain', 'Hot', 'Windy'];
const INSPECTIONS = ['Not Required', 'Pending', 'Passed', 'Failed'];
const DEP_TYPES = ['FS (Finish→Start)', 'SS (Start→Start)', 'FF (Finish→Finish)'];
const SHIFTS = ['Day', 'Night', 'General', 'Two-shift'];

/* ── module UI state ──────────────────────────────────── */
const _ui = { tab: 'baseline', editActId: null, planActId: null, actualActId: null, compareActId: null, ver: null };
let _draft = null;         // activity being edited (Stage 1)
let _planDraft = null;     // plan being edited (Stage 2)
let _actualDraft = null;   // actual being entered (Stage 3)
let _pendingReason = null; // { actId, diffs, base } queued for the reason modal

/* ── tiny helpers ─────────────────────────────────────── */
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const q = s => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const uid = p => (p || 'x') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
const cur = () => getCurrencySymbol();
const money = n => cur() + (Math.round(num(n))).toLocaleString('en-IN');
const fmtN = (n, d = 2) => num(n).toLocaleString('en-IN', { maximumFractionDigits: d });
const pid = () => state.currentProjectId;
const proj = () => (state.projects || []).find(p => p.id === pid());
const who = () => { const u = (window.getCurrentUser && window.getCurrentUser()) || {}; return u.name || u.email || 'You'; };
const device = () => { try { return navigator.platform || (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || 'web'; } catch { return 'web'; } };
const nowISO = () => new Date().toISOString();

/* ── data accessors ───────────────────────────────────── */
const acts = () => (state.execActivities || []).filter(a => a.projectId === pid());
const actById = id => (state.execActivities || []).find(a => a.id === id);
const baselinesFor = id => (state.execBaselines || []).filter(b => b.activityId === id).sort((a, b) => (a.version || 0) - (b.version || 0));
const latestBaseline = id => { const l = baselinesFor(id); return l[l.length - 1] || null; };
const plansFor = id => (state.execPlans || []).filter(p => p.activityId === id).sort((a, b) => (a.verNum || 0) - (b.verNum || 0));
const activePlan = id => plansFor(id).find(p => p.active) || plansFor(id).slice(-1)[0] || null;
const changesFor = id => (state.execChanges || []).filter(c => c.activityId === id).sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
const actualsFor = id => (state.execActuals || []).filter(x => x.activityId === id).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

function _ensureArrays() {
  ['execActivities', 'execBaselines', 'execPlans', 'execChanges', 'execActuals', 'execAssignments'].forEach(k => { if (!Array.isArray(state[k])) state[k] = []; });
}

/* ── labour roster / availability (reuses labourMaster + attendanceLogs) ── */
const roster = () => (state.labourMaster || []).filter(w => !w.projectId || w.projectId === pid());
const isAbsent = (w, date) => (state.attendanceLogs || []).some(a => a.labourId === w.id && a.date === date && a.status === 'Absent');
const availableWorkers = date => roster().filter(w => !isAbsent(w, date));
const assignmentsOn = date => (state.execAssignments || []).filter(x => x.projectId === pid() && x.date === date);
const assignmentsForActivity = (actId, date) => (state.execAssignments || []).filter(x => x.activityId === actId && x.date === date);
const isWorkerFree = (workerId, date) => !(state.execAssignments || []).some(x => x.projectId === pid() && x.date === date && x.workerId === workerId);
/** Activities that have an active plan and are scheduled on `date` (no dates ⇒ always active). */
function activeActivitiesOn(date) {
  return acts().filter(a => {
    const ap = activePlan(a.id); if (!ap) return false;
    const s = (ap.schedule && ap.schedule.plannedStart) || '', f = (ap.schedule && ap.schedule.plannedFinish) || '';
    if (!s && !f) return true;
    if (s && date < s) return false;
    if (f && date > f) return false;
    return true;
  });
}
function planTradeNeed(ap) { const m = {}; (ap.labour || []).forEach(l => { const t = l.type || 'General'; m[t] = (m[t] || 0) + num(l.workers); }); return m; }
/** Append to a synced array; pull first to reduce concurrent-append clobber on the audit logs. */
async function _appendSynced(key, rec) {
  _ensureArrays();
  try { if (navigator.onLine) await pullRemoteUpdates(); } catch {}
  if (!Array.isArray(state[key])) state[key] = [];
  state[key].push(rec);
  saveAllData();
}

/* ── blank models ─────────────────────────────────────── */
function blankActivity() {
  return {
    id: uid('act'), projectId: pid(), name: '', code: '', wbs: '', boqRef: '', workPackage: '',
    location: '', wing: '', floor: '', zone: '', area: '',
    schedule: { plannedStart: '', plannedFinish: '', duration: '', workingDays: '', calendar: '6-day', shift: 'Day' },
    qty: { plannedQty: '', unit: '', dailyProductivity: '', weeklyProductivity: '' },
    labour: [], material: [], equipment: [],
    cost: { subCost: 0, overheads: 0, indirect: 0 },
    deps: [], status: 'draft', approvedBy: '', approvedAt: '', createdAt: nowISO(), createdBy: who()
  };
}

/**
 * Seed DRAFT baseline activities from a Schedule Builder location.
 * Maps each schedule task → an execActivity (name, code, location, planned
 * start/duration/finish, dependencies). Skips tasks whose (code|location) already
 * exists so re-running is idempotent. Returns { added, skipped }.
 */
export function seedBaselineFromSchedule(loc) {
  if (!loc || !Array.isArray(loc.tasks)) return { added: 0, skipped: 0 };
  _ensureArrays();
  const existing = new Set((state.execActivities || []).filter(a => a.projectId === pid())
    .map(a => ((a.code || a.name || '') + '|' + (a.location || '')).toLowerCase()));
  const sorted = loc.tasks.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const created = {};   // schedule task id → new activity (for dependency mapping)
  let added = 0, skipped = 0;
  sorted.forEach(t => {
    const code = (t.masterTaskId && !/^std_/.test(t.masterTaskId)) ? t.masterTaskId : '';
    const key = ((code || t.name || '') + '|' + (loc.name || '')).toLowerCase();
    if (existing.has(key)) { skipped++; return; }
    const a = blankActivity();
    a.name = t.name || 'Task'; a.code = code; a.boqRef = code; a.location = loc.name || '';
    a.schedule.plannedStart = t.startDate || '';
    a.schedule.duration = t.duration || '';
    if (t.startDate && num(t.duration)) {
      const d = new Date(t.startDate); d.setDate(d.getDate() + Math.max(0, num(t.duration)));
      a.schedule.plannedFinish = d.toISOString().slice(0, 10);
    }
    state.execActivities.push(a); created[t.id] = a; existing.add(key); added++;
  });
  // carry over dependencies between the activities we just created
  sorted.forEach(t => {
    const a = created[t.id]; if (!a) return;
    (t.deps || []).forEach(depId => {
      const da = created[depId];
      if (da) a.deps.push({ id: uid('d'), dependsOn: da.id, type: DEP_TYPES[0], lag: 0, critical: false });
    });
  });
  if (added) saveAllData();
  return { added, skipped };
}

/* ── cost roll-ups ────────────────────────────────────── */
function labCost(rows) { return (rows || []).reduce((s, r) => s + num(r.cost), 0); }
function matCost(rows) { return (rows || []).reduce((s, r) => s + (num(r.cost) || num(r.qty) * (1 + num(r.wastagePct) / 100) * num(r.rate)), 0); }
function eqCost(rows) { return (rows || []).reduce((s, r) => s + num(r.cost), 0); }
function totalCost(a) {
  if (!a) return 0;
  const m = matCost(a.material), l = labCost(a.labour), e = eqCost(a.equipment);
  const c = a.cost || {};
  return m + l + e + num(c.subCost) + num(c.overheads) + num(c.indirect);
}

/* ═══════════════════════════════════════════════════════
 *  MAIN RENDER — tab shell
 * ═══════════════════════════════════════════════════════ */
/** Planning → Scheduling → Execution flow stepper (shared look; `active` marks
 *  the current step). Each step navigates to its module. */
function _psStepper(active) {
  const step = (key, label, view) => {
    const on = active === key;
    return `<button onclick="window.switchView&&window.switchView('${view}')" style="padding:5px 11px;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;border:1px solid ${on ? '#7c3aed' : '#e2e8f0'};background:${on ? '#7c3aed' : '#fff'};color:${on ? '#fff' : '#64748b'};white-space:nowrap;">${label}</button>`;
  };
  const arr = `<span style="color:#cbd5e1;font-weight:800;">→</span>`;
  return `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:10px;">${step('plan', '① Planning', 'execEngineView')}${arr}${step('sched', '② Scheduling', 'scheduleBuilderView')}${arr}${step('exec', '③ Execution', 'executionView')}</div>`;
}

/* ═══════════════════════════════════════════════════════════
 *  SIMPLE PLANNING — one activity list (name · unit · qty · dates).
 *  Progress rolls up live from the DPR (executed quantity by BOQ code).
 * ═══════════════════════════════════════════════════════════ */
const _EE_IN = 'width:100%;padding:9px 11px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;box-sizing:border-box;';
function _eeAddDays(iso, n) { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return ''; d.setDate(d.getDate() + Math.max(0, num(n))); return d.toISOString().slice(0, 10); }
function _eeDMY(iso) { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }); }
/** Executed quantity for an activity = DPR measured qty on the same BOQ code
 *  (or, for a manual/non-BOQ activity, by matching name). This is the live link
 *  from Execution (DPR) back to Planning. */
function actDoneQty(a) {
  const code = (a.code || a.boqRef || '').trim();
  let sum = 0;
  (state.dailyProgress || []).filter(d => d.projectId === pid()).forEach(d => (d.measurements || []).forEach(m => {
    if (code) { if ((m.code || '') === code) sum += num(m.qty); }
    else if (m.description === a.name || (m.code || '') === 'NB:' + a.name) sum += num(m.qty);
  }));
  return sum;
}
window.execActDoneQty = actDoneQty;

export function renderExecEngine() {
  _ensureArrays();
  const host = document.getElementById('execEngineContent');
  if (!host) return;
  const p = proj();
  if (!p) { host.innerHTML = _noProject(); return; }
  const list = acts();
  const seedable = ((p.boqItems) || []).length;
  let totPct = 0;
  const rows = list.map((a, i) => {
    const pq = num(a.qty && a.qty.plannedQty), dq = actDoneQty(a);
    const pct = pq > 0 ? Math.min(100, Math.round(dq / pq * 100)) : 0;
    totPct += pct;
    const start = (a.schedule && a.schedule.plannedStart) || '';
    const dur = num(a.schedule && a.schedule.duration);
    const fin = (a.schedule && a.schedule.plannedFinish) || _eeAddDays(start, dur);
    const barC = pct >= 100 ? '#16a34a' : (pct > 0 ? '#f59e0b' : '#cbd5e1');
    return `<tr style="border-top:1px solid #f1f5f9;">
      <td style="padding:8px 10px;color:#94a3b8;">${i + 1}</td>
      <td style="padding:8px 10px;font-weight:700;color:#0f172a;">${esc(a.name || 'Untitled')}${a.boqRef ? ` <span style="font-size:9px;color:#7c3aed;background:#f5f3ff;border-radius:5px;padding:1px 5px;">${esc(a.boqRef)}</span>` : ''}</td>
      <td style="padding:8px 10px;text-align:center;color:#64748b;">${esc((a.qty && a.qty.unit) || '')}</td>
      <td style="padding:8px 10px;text-align:right;">${fmtN(pq)}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;color:#0369a1;">${fmtN(dq)}</td>
      <td style="padding:8px 10px;min-width:120px;"><div style="display:flex;align-items:center;gap:6px;"><div style="flex:1;height:6px;background:#eef2f7;border-radius:99px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:${barC};"></div></div><span style="font-size:11px;font-weight:700;color:${barC};">${pct}%</span></div></td>
      <td style="padding:8px 10px;color:#64748b;white-space:nowrap;">${_eeDMY(start)}</td>
      <td style="padding:8px 10px;text-align:center;color:#64748b;">${dur || '—'}</td>
      <td style="padding:8px 10px;color:#64748b;white-space:nowrap;">${_eeDMY(fin)}</td>
      <td style="padding:8px 10px;text-align:right;white-space:nowrap;"><button onclick="window._execActForm('${a.id}')" style="border:none;background:#eff6ff;color:#1d4ed8;border-radius:7px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;">Edit</button> <button onclick="window._execDelActivity('${a.id}')" style="border:none;background:transparent;color:#cbd5e1;cursor:pointer;font-size:14px;">🗑️</button></td>
    </tr>`;
  }).join('');
  const overall = list.length ? Math.round(totPct / list.length) : 0;
  host.innerHTML = `
    <div class="ee-wrap">
      <button onclick="window._navBack&&window._navBack()" style="margin-bottom:8px;padding:6px 14px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;">&larr; Back</button>
      ${_psStepper('plan')}
      <div style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:10px;margin-bottom:14px;">
        <div>
          <h2 class="text-2xl font-extrabold text-slate-800">Planning</h2>
          <p class="text-xs text-slate-400 mt-0.5">${esc(p.name || 'Project')} · list the work with quantity &amp; duration — then Schedule it and track daily via DPR.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${seedable ? `<button class="ee-btn-ghost" onclick="window._execAddFromBOQ()">+ From BOQ (${seedable})</button>` : ''}
          <button class="ee-btn-primary" onclick="window._execActForm()">+ Add Activity</button>
        </div>
      </div>
      ${list.length ? `<div style="margin-bottom:12px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:12px;">
        <span style="font-size:12px;font-weight:700;color:#64748b;">Overall progress</span>
        <div style="flex:1;height:8px;background:#eef2f7;border-radius:99px;overflow:hidden;"><div style="width:${overall}%;height:100%;background:${overall >= 100 ? '#16a34a' : '#7c3aed'};"></div></div>
        <span style="font-size:14px;font-weight:800;color:#0f172a;">${overall}%</span>
        <span style="font-size:11px;color:#94a3b8;">${list.length} activit${list.length === 1 ? 'y' : 'ies'}</span>
      </div>` : ''}
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
        <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:720px;">
          <thead><tr style="background:#f8fafc;color:#64748b;text-transform:uppercase;font-size:10px;letter-spacing:.03em;">
            <th style="padding:8px 10px;text-align:left;">#</th><th style="padding:8px 10px;text-align:left;">Activity</th><th style="padding:8px 10px;text-align:center;">Unit</th><th style="padding:8px 10px;text-align:right;">Planned</th><th style="padding:8px 10px;text-align:right;">Done</th><th style="padding:8px 10px;text-align:left;">Progress</th><th style="padding:8px 10px;text-align:left;">Start</th><th style="padding:8px 10px;text-align:center;">Days</th><th style="padding:8px 10px;text-align:left;">Finish</th><th style="padding:8px 10px;"></th>
          </tr></thead>
          <tbody>${rows || `<tr><td colspan="10" style="padding:40px;text-align:center;color:#94a3b8;">No activities yet. Tap <b>+ Add Activity</b> or <b>+ From BOQ</b>.</td></tr>`}</tbody>
        </table></div>
      </div>
    </div>`;
}
window.renderExecEngine = renderExecEngine;

/** Add / edit one activity — the simple form. */
window._execActForm = function (id) {
  const a = id ? actById(id) : null;
  const boq = (proj() && proj().boqItems) || [];
  const boqOpts = '<option value="">— Custom (type a name below) —</option>' + boq.map(it => `<option value="${esc(it.code || it.boqIndex || '')}" data-desc="${esc(it.description || it.desc || it.name || '')}" data-unit="${esc(it.uom || it.unit || '')}" data-qty="${num(it.qty)}">${esc(((it.code ? it.code + ' · ' : '')) + (it.description || it.desc || it.name || ''))}</option>`).join('');
  const wrap = document.createElement('div'); wrap.className = 'ee-overlay'; wrap.id = 'eeActModal';
  wrap.onclick = e => { if (e.target === wrap) wrap.remove(); };
  wrap.innerHTML = `<div class="ee-modal"><div class="ee-modal-h">${a ? 'Edit Activity' : 'Add Activity'}</div>
    <div class="ee-modal-body" style="display:flex;flex-direction:column;gap:12px;">
      ${!a && boq.length ? `<div><label style="font-size:11px;font-weight:700;color:#64748b;">Pick from BOQ (optional)</label><select id="eaBoq" onchange="window._execActPickBoq(this)" style="${_EE_IN}">${boqOpts}</select></div>` : ''}
      <div><label style="font-size:11px;font-weight:700;color:#64748b;">Activity name *</label><input id="eaName" style="${_EE_IN}" value="${a ? esc(a.name) : ''}" placeholder="e.g. RCC Slab Casting"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
        <div><label style="font-size:11px;font-weight:700;color:#64748b;">Unit</label><input id="eaUnit" style="${_EE_IN}" value="${a ? esc((a.qty && a.qty.unit) || '') : ''}" placeholder="M3"></div>
        <div><label style="font-size:11px;font-weight:700;color:#64748b;">Planned Qty</label><input id="eaQty" type="number" style="${_EE_IN}" value="${a ? num(a.qty && a.qty.plannedQty) || '' : ''}"></div>
        <div><label style="font-size:11px;font-weight:700;color:#64748b;">Duration (days)</label><input id="eaDur" type="number" style="${_EE_IN}" value="${a ? num(a.schedule && a.schedule.duration) || '' : ''}"></div>
      </div>
      <div><label style="font-size:11px;font-weight:700;color:#64748b;">Planned Start</label><input id="eaStart" type="date" style="${_EE_IN}" value="${a ? esc((a.schedule && a.schedule.plannedStart) || '') : ''}"></div>
    </div>
    <div class="ee-modal-f"><button class="ee-btn-ghost" onclick="this.closest('.ee-overlay').remove()">Cancel</button><button class="ee-btn-primary" onclick="window._execActSave('${id || ''}')">${a ? 'Save' : 'Add Activity'}</button></div>
  </div>`;
  document.body.appendChild(wrap);
  setTimeout(() => document.getElementById('eaName')?.focus(), 40);
};
window._execActPickBoq = function (sel) {
  const o = sel.selectedOptions[0]; if (!o) return;
  const g = i => document.getElementById(i);
  if (g('eaName') && (!g('eaName').value || !sel.dataset.touched)) g('eaName').value = o.dataset.desc || g('eaName').value;
  if (sel.value) { if (g('eaUnit')) g('eaUnit').value = o.dataset.unit || ''; if (g('eaQty') && !g('eaQty').value) g('eaQty').value = o.dataset.qty || ''; }
  sel.dataset.touched = '1'; sel.setAttribute('data-code', sel.value || '');
};
window._execActSave = function (id) {
  const val = i => (document.getElementById(i)?.value || '').trim();
  const name = val('eaName'); if (!name) { showToast('Activity name required', 'error'); return; }
  const a = id ? actById(id) : blankActivity();
  if (!a) { showToast('Activity not found', 'error'); return; }
  a.name = name;
  if (!id) { const bs = document.getElementById('eaBoq'); if (bs && bs.value) { a.code = bs.value; a.boqRef = bs.value; } }
  a.qty = a.qty || {}; a.qty.unit = val('eaUnit'); a.qty.plannedQty = num(val('eaQty'));
  a.schedule = a.schedule || {}; a.schedule.plannedStart = val('eaStart'); a.schedule.duration = num(val('eaDur'));
  a.schedule.plannedFinish = _eeAddDays(a.schedule.plannedStart, a.schedule.duration);
  if (!id) state.execActivities.push(a);
  saveAllData(); document.getElementById('eeActModal')?.remove();
  showToast(id ? 'Activity updated' : 'Activity added', 'success'); renderExecEngine();
};
window._execDelActivity = function (id) {
  const a = actById(id); if (!a) return;
  if (!confirm(`Delete "${a.name || 'activity'}"? It stays recoverable in the Recycle Bin.`)) return;
  window.recycleDelete && window.recycleDelete('execActivities', id, 'Activity', a.name);
  saveAllData(); renderExecEngine();
};

function _noProject() {
  return `<div class="ee-empty"><div class="text-4xl mb-2">🏗️</div><p class="font-bold text-slate-700">Select a project first</p><p class="text-xs text-slate-400 mt-1">Open a project, then plan and execute its activities here.</p></div>`;
}

/* ═══════════════════════════════════════════════════════
 *  STAGE 1 — BASELINE
 * ═══════════════════════════════════════════════════════ */
function _baselineList() {
  const list = acts();
  const seedable = ((proj() && proj().boqItems) || []).length;
  const oldPlanning = (state.planningTasks || []).filter(t => t.projectId === pid()).length;
  return `
    <div class="ee-toolbar">
      <div class="text-xs text-slate-500">${list.length} activit${list.length === 1 ? 'y' : 'ies'} · ${list.filter(a => a.status === 'approved').length} baselined</div>
      <div class="flex gap-2 flex-wrap">
        ${seedable ? `<button class="ee-btn-ghost" onclick="window._execAddFromBOQ()">+ From BOQ (${seedable})</button>` : ''}
        ${oldPlanning ? `<button class="ee-btn-ghost" onclick="window._execImportPlanning()" title="Bring your existing Planning tasks in as activities">↻ Import Planning (${oldPlanning})</button>` : ''}
        <button class="ee-btn-primary" onclick="window._execNewActivity()">+ New Activity</button>
      </div>
    </div>
    ${!list.length ? `<div class="ee-empty"><div class="text-3xl mb-2">📐</div><p class="font-bold text-slate-700">No activities yet</p><p class="text-xs text-slate-400 mt-1">Add activities (or seed from BOQ), fill labour/material/equipment/cost, then <b>Approve</b> to lock the baseline.</p></div>`
      : `<div class="ee-cards">${list.map(_actCard).join('')}</div>`}
  `;
}

function _actCard(a) {
  const locked = a.status === 'approved';
  const ap = activePlan(a.id);
  const acu = actualsFor(a.id).length;
  return `
    <div class="ee-card">
      <div class="ee-card-top">
        <div class="min-w-0">
          <div class="ee-card-title">${esc(a.name || 'Untitled')}</div>
          <div class="ee-card-sub">${esc([a.code, a.wbs, a.location, a.floor].filter(Boolean).join(' · ')) || '—'}</div>
        </div>
        <span class="ee-badge ${locked ? 'ok' : 'draft'}">${locked ? '🔒 Baselined' : 'Draft'}</span>
      </div>
      <div class="ee-card-metrics">
        <div><span>Qty</span><b>${fmtN(a.qty && a.qty.plannedQty)} ${esc((a.qty && a.qty.unit) || '')}</b></div>
        <div><span>Labour</span><b>${(a.labour || []).reduce((s, l) => s + num(l.workers), 0)}</b></div>
        <div><span>Planned cost</span><b>${money(totalCost(a))}</b></div>
      </div>
      <div class="ee-card-foot">
        <span class="ee-mini">${ap ? 'Plan ' + ap.version : 'No plan'} · ${acu} actual${acu === 1 ? '' : 's'}</span>
        <div class="flex gap-1">
          <button class="ee-lnk" onclick="window._execEditActivity('${a.id}')">${locked ? 'View' : 'Edit'}</button>
          ${!locked ? `<button class="ee-lnk ok" onclick="window._execApprove('${a.id}')">Approve</button>` : `<button class="ee-lnk" onclick="window._execTab('plan')">Execution ›</button>`}
          <button class="ee-lnk del" onclick="window._execDelActivity('${a.id}')">Del</button>
        </div>
      </div>
    </div>`;
}

window._execNewActivity = function () { _draft = blankActivity(); _ui.editActId = _draft.id; renderExecEngine(); };
window._execEditActivity = function (id) { const a = actById(id); if (!a) return; _draft = JSON.parse(JSON.stringify(a)); _ui.editActId = id; renderExecEngine(); };
window._execDelActivity = function (id) {
  const a = actById(id); if (!a) return;
  if (!confirm(`Delete activity "${a.name || 'Untitled'}"? Its plans and actuals stay in the recycle bin.`)) return;
  window.recycleDelete && window.recycleDelete('execActivities', id, 'Activity', a.name);
  saveAllData(); renderExecEngine();
};
window._execCloseEditor = function () { _draft = null; _ui.editActId = null; renderExecEngine(); };

window._execAddFromBOQ = function () {
  const p = proj(); const boq = (p && p.boqItems) || [];
  if (!boq.length) return showToast('This project has no BOQ items', 'error');
  const existing = new Set(acts().map(a => (a.boqRef || '').trim()).filter(Boolean));
  let added = 0;
  boq.forEach(it => {
    const ref = (it.code || it.boqIndex || '').trim();
    if (ref && existing.has(ref)) return;
    const a = blankActivity();
    a.name = it.description || it.desc || it.name || ref || 'Item';
    a.code = it.code || ''; a.boqRef = ref;
    a.qty.plannedQty = it.qty || ''; a.qty.unit = it.uom || it.unit || '';
    state.execActivities.push(a); added++;
  });
  saveAllData(); renderExecEngine();
  showToast(added ? `${added} activit${added === 1 ? 'y' : 'ies'} added from BOQ` : 'All BOQ items already added', added ? 'success' : 'info');
};

window._execImportPlanning = function () {
  const tasks = (state.planningTasks || []).filter(t => t.projectId === pid());
  if (!tasks.length) return showToast('No planning tasks to import', 'error');
  const existing = new Set(acts().map(a => (a.code || a.name || '').trim().toLowerCase()));
  let added = 0;
  tasks.forEach(t => {
    const key = (t.code || t.name || '').trim().toLowerCase();
    if (key && existing.has(key)) return;
    const a = blankActivity();
    a.name = t.name || 'Task'; a.code = t.code || ''; a.area = t.area || ''; a.location = t.area || '';
    a.schedule.plannedStart = t.startDate || ''; a.schedule.plannedFinish = t.endDate || '';
    (t.labourReq || []).forEach(l => a.labour.push({ id: uid('l'), type: l.trade, workers: l.count, hours: 8, otHours: 0, productivity: '', cost: 0 }));
    (state.taskMaterials || []).filter(m => m.taskId === t.id).forEach(m => {
      const rm = (state.rawMaterials || []).find(r => r.id === m.materialId);
      a.material.push({ id: uid('m'), name: (rm && rm.name) || 'Material', qty: m.qtyRequired, unit: (rm && rm.unit) || '', consumptionRate: '', wastagePct: 0, deliveryDate: '', rate: (rm && rm.rate) || 0, cost: 0 });
    });
    state.execActivities.push(a); added++;
  });
  saveAllData(); renderExecEngine();
  showToast(added ? `${added} activit${added === 1 ? 'y' : 'ies'} imported` : 'Already imported', added ? 'success' : 'info');
};

function _sec(title, body, hint) {
  return `<div class="ee-sec"><div class="ee-sec-h">${title}${hint ? `<span class="ee-hint">${hint}</span>` : ''}</div><div class="ee-sec-b">${body}</div></div>`;
}
function _fld(label, html) { return `<label class="ee-fld"><span>${label}</span>${html}</label>`; }
function _in(path, val, type = 'text', ph = '') { return `<input class="ee-input" type="${type}" value="${esc(val)}" placeholder="${esc(ph)}" oninput="window._execDraftSet('${path}', this.value)">`; }
function _sel(path, val, opts) { return `<select class="ee-input" onchange="window._execDraftSet('${path}', this.value)">${opts.map(o => `<option ${String(val) === String(o) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`; }

window._execDraftSet = function (path, val) {
  if (!_draft) return;
  const parts = path.split('.'); let o = _draft;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
  o[parts[parts.length - 1]] = val;
  if (path.startsWith('cost.') || path.startsWith('material.') || path.startsWith('labour.') || path.startsWith('equipment.')) _refreshCostBar();
};

function _baselineEditor() {
  const a = _draft; const ro = a.status === 'approved';
  const disabled = ro ? 'disabled' : '';
  const bl = latestBaseline(a.id);
  return `
    <div class="ee-editor ${ro ? 'ee-ro' : ''}">
      <div class="ee-editor-head">
        <button class="ee-btn-ghost" onclick="window._execCloseEditor()">‹ Back</button>
        <div class="text-sm font-bold text-slate-700">${ro ? '🔒 Baseline (read-only)' : (actById(a.id) ? 'Edit activity' : 'New activity')}</div>
        <div class="flex gap-2">
          ${!ro ? `<button class="ee-btn-primary" onclick="window._execSaveActivity()">Save</button>` : ''}
          ${!ro ? `<button class="ee-btn-ok" onclick="window._execSaveActivity(true)">Save & Approve</button>` : `<button class="ee-btn-ghost" onclick="window._execTab('plan')">Go to Execution Plan ›</button>`}
        </div>
      </div>
      ${ro ? `<div class="ee-lock-banner">🔒 Baseline v${bl ? bl.version : 1} locked${bl ? ' · approved by ' + esc(bl.approvedBy) + ' on ' + new Date(bl.approvedAt).toLocaleDateString('en-IN') : ''}. All execution changes happen in the Execution Plan — the baseline is preserved for comparison.</div>` : ''}
      <fieldset ${disabled} style="border:0;padding:0;margin:0;min-width:0;">
      ${_sec('Activity Information', `<div class="ee-grid">
        ${_fld('Activity Name *', _in('name', a.name))}
        ${_fld('Activity Code', _in('code', a.code))}
        ${_fld('WBS', _in('wbs', a.wbs))}
        ${_fld('BOQ Reference', _in('boqRef', a.boqRef))}
        ${_fld('Work Package', _in('workPackage', a.workPackage))}
        ${_fld('Location', _in('location', a.location))}
        ${_fld('Wing / Tower', _in('wing', a.wing))}
        ${_fld('Floor / Level', _in('floor', a.floor))}
        ${_fld('Zone', _in('zone', a.zone))}
        ${_fld('Area', _in('area', a.area))}
      </div>`)}
      ${_sec('Schedule', `<div class="ee-grid">
        ${_fld('Planned Start', _in('schedule.plannedStart', a.schedule.plannedStart, 'date'))}
        ${_fld('Planned Finish', _in('schedule.plannedFinish', a.schedule.plannedFinish, 'date'))}
        ${_fld('Duration (days)', _in('schedule.duration', a.schedule.duration, 'number'))}
        ${_fld('Working Days', _in('schedule.workingDays', a.schedule.workingDays, 'number'))}
        ${_fld('Calendar', _sel('schedule.calendar', a.schedule.calendar, ['6-day', '7-day', '5-day']))}
        ${_fld('Shift', _sel('schedule.shift', a.schedule.shift, SHIFTS))}
      </div>`)}
      ${_sec('Quantity Planning', `<div class="ee-grid">
        ${_fld('Planned Quantity', _in('qty.plannedQty', a.qty.plannedQty, 'number'))}
        ${_fld('Unit', _in('qty.unit', a.qty.unit))}
        ${_fld('Daily Productivity', _in('qty.dailyProductivity', a.qty.dailyProductivity, 'number'))}
        ${_fld('Weekly Productivity', _in('qty.weeklyProductivity', a.qty.weeklyProductivity, 'number'))}
      </div>`)}
      ${_sec('Labour Planning', _labourTable(a.labour, ro), '')}
      ${_sec('Material Planning', _materialTable(a.material, ro), 'Pull a mix-design recipe to auto-fill')}
      ${_sec('Equipment Planning', _equipTable(a.equipment, ro), '')}
      ${_sec('Cost Planning', _costPanel(a), '')}
      ${_sec('Dependencies', _depTable(a.deps, ro), '')}
      </fieldset>
    </div>`;
}

/* ---- resource tables (Stage 1) ---- */
function _rowBtns(section, i, ro) { return ro ? '' : `<button class="ee-rowdel" onclick="window._execDelRow('${section}',${i})" title="Remove">✕</button>`; }
function _cell(section, i, field, val, type = 'number') { return `<input class="ee-cell" type="${type}" value="${esc(val)}" oninput="window._execRowSet('${section}',${i},'${field}',this.value)">`; }

function _labourTable(rows, ro) {
  return `<div class="ee-tblwrap"><table class="ee-tbl"><thead><tr>
    <th>Labour Type</th><th>Workers</th><th>Hours</th><th>OT hrs</th><th>Productivity</th><th>Cost (${cur()})</th><th></th></tr></thead><tbody>
    ${(rows || []).map((r, i) => `<tr>
      <td><select class="ee-cell" onchange="window._execRowSet('labour',${i},'type',this.value)">${TRADES.map(t => `<option ${r.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
      <td>${_cell('labour', i, 'workers', r.workers)}</td>
      <td>${_cell('labour', i, 'hours', r.hours)}</td>
      <td>${_cell('labour', i, 'otHours', r.otHours)}</td>
      <td>${_cell('labour', i, 'productivity', r.productivity)}</td>
      <td>${_cell('labour', i, 'cost', r.cost)}</td>
      <td>${_rowBtns('labour', i, ro)}</td></tr>`).join('')}
    </tbody></table></div>
    ${ro ? '' : `<button class="ee-addrow" onclick="window._execAddRow('labour')">+ Add labour</button>`}`;
}
function _materialTable(rows, ro) {
  return `<div class="ee-tblwrap"><table class="ee-tbl"><thead><tr>
    <th>Material</th><th>Qty</th><th>Unit</th><th>Cons. rate</th><th>Wastage %</th><th>Delivery</th><th>Rate</th><th>Cost (${cur()})</th><th></th></tr></thead><tbody>
    ${(rows || []).map((r, i) => `<tr>
      <td><input class="ee-cell wide" list="eeMatList" value="${esc(r.name)}" oninput="window._execRowSet('material',${i},'name',this.value);window._execMatLookup(${i},this.value)"></td>
      <td>${_cell('material', i, 'qty', r.qty)}</td>
      <td><input class="ee-cell sm" value="${esc(r.unit)}" oninput="window._execRowSet('material',${i},'unit',this.value)"></td>
      <td>${_cell('material', i, 'consumptionRate', r.consumptionRate)}</td>
      <td>${_cell('material', i, 'wastagePct', r.wastagePct)}</td>
      <td>${_cell('material', i, 'deliveryDate', r.deliveryDate, 'date')}</td>
      <td>${_cell('material', i, 'rate', r.rate)}</td>
      <td>${_cell('material', i, 'cost', r.cost)}</td>
      <td>${_rowBtns('material', i, ro)}</td></tr>`).join('')}
    </tbody></table></div>
    <datalist id="eeMatList">${_matMaster().map(m => `<option value="${esc(m.name)}">`).join('')}</datalist>
    ${ro ? '' : `<div class="flex gap-2 flex-wrap"><button class="ee-addrow" onclick="window._execAddRow('material')">+ Add material</button><button class="ee-addrow" onclick="window._execAttachRecipe()">⚗ Attach mix-design recipe</button></div>`}`;
}
function _equipTable(rows, ro) {
  return `<div class="ee-tblwrap"><table class="ee-tbl"><thead><tr>
    <th>Equipment</th><th>Qty</th><th>Work hrs</th><th>Idle hrs</th><th>Fuel (L)</th><th>Cost (${cur()})</th><th></th></tr></thead><tbody>
    ${(rows || []).map((r, i) => `<tr>
      <td><input class="ee-cell wide" list="eeEqList" value="${esc(r.name)}" oninput="window._execRowSet('equipment',${i},'name',this.value)"></td>
      <td>${_cell('equipment', i, 'qty', r.qty)}</td>
      <td>${_cell('equipment', i, 'workingHours', r.workingHours)}</td>
      <td>${_cell('equipment', i, 'idleHours', r.idleHours)}</td>
      <td>${_cell('equipment', i, 'fuel', r.fuel)}</td>
      <td>${_cell('equipment', i, 'cost', r.cost)}</td>
      <td>${_rowBtns('equipment', i, ro)}</td></tr>`).join('')}
    </tbody></table></div>
    <datalist id="eeEqList">${(state.equipmentList || []).map(e => `<option value="${esc(e.name)}">`).join('')}</datalist>
    ${ro ? '' : `<button class="ee-addrow" onclick="window._execAddRow('equipment')">+ Add equipment</button>`}`;
}
function _depTable(rows, ro) {
  const others = acts().filter(x => x.id !== _draft.id);
  return `<div class="ee-tblwrap"><table class="ee-tbl"><thead><tr>
    <th>Depends on</th><th>Type</th><th>Lag (days)</th><th>Critical</th><th></th></tr></thead><tbody>
    ${(rows || []).map((r, i) => `<tr>
      <td><select class="ee-cell wide" onchange="window._execRowSet('deps',${i},'dependsOn',this.value)"><option value="">— none —</option>${others.map(o => `<option value="${o.id}" ${r.dependsOn === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></td>
      <td><select class="ee-cell" onchange="window._execRowSet('deps',${i},'type',this.value)">${DEP_TYPES.map(t => `<option ${r.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
      <td>${_cell('deps', i, 'lag', r.lag)}</td>
      <td style="text-align:center"><input type="checkbox" ${r.critical ? 'checked' : ''} onchange="window._execRowSet('deps',${i},'critical',this.checked)"></td>
      <td>${_rowBtns('deps', i, ro)}</td></tr>`).join('')}
    </tbody></table></div>
    ${ro ? '' : `<button class="ee-addrow" onclick="window._execAddRow('deps')">+ Add dependency</button>`}`;
}
function _costPanel(a) {
  const m = matCost(a.material), l = labCost(a.labour), e = eqCost(a.equipment), c = a.cost || {};
  const tot = m + l + e + num(c.subCost) + num(c.overheads) + num(c.indirect);
  return `<div id="eeCostBar" class="ee-cost">
    <div class="ee-cost-line"><span>Material cost</span><b>${money(m)}</b></div>
    <div class="ee-cost-line"><span>Labour cost</span><b>${money(l)}</b></div>
    <div class="ee-cost-line"><span>Equipment cost</span><b>${money(e)}</b></div>
    <div class="ee-cost-line"><span>Subcontract</span>${_in('cost.subCost', c.subCost, 'number')}</div>
    <div class="ee-cost-line"><span>Overheads</span>${_in('cost.overheads', c.overheads, 'number')}</div>
    <div class="ee-cost-line"><span>Indirect cost</span>${_in('cost.indirect', c.indirect, 'number')}</div>
    <div class="ee-cost-total"><span>Total Planned Cost</span><b>${money(tot)}</b></div>
  </div>`;
}
function _refreshCostBar() { const el = document.getElementById('eeCostBar'); if (el && _draft) el.outerHTML = _costPanel(_draft); }

window._execAddRow = function (section) {
  if (!_draft) return;
  _draft[section] = _draft[section] || [];
  const blanks = {
    labour: { id: uid('l'), type: 'Mason', workers: '', hours: 8, otHours: 0, productivity: '', cost: '' },
    material: { id: uid('m'), name: '', qty: '', unit: '', consumptionRate: '', wastagePct: 0, deliveryDate: '', rate: '', cost: '' },
    equipment: { id: uid('e'), name: '', qty: 1, workingHours: 8, idleHours: 0, fuel: '', cost: '' },
    deps: { id: uid('d'), dependsOn: '', type: DEP_TYPES[0], lag: 0, critical: false }
  };
  _draft[section].push(blanks[section]); _renderBody();
};
window._execDelRow = function (section, i) { if (!_draft) return; _draft[section].splice(i, 1); _renderBody(); };
window._execRowSet = function (section, i, field, val) {
  if (!_draft || !_draft[section] || !_draft[section][i]) return;
  const r = _draft[section][i];
  r[field] = (field === 'critical') ? val : (['type', 'name', 'unit', 'deliveryDate', 'dependsOn'].includes(field) ? val : (val === '' ? '' : num(val)));
  // auto material line cost from rate/qty/wastage
  if (section === 'material' && ['qty', 'rate', 'wastagePct'].includes(field)) r.cost = +(num(r.qty) * (1 + num(r.wastagePct) / 100) * num(r.rate)).toFixed(2);
  if (['cost', 'qty', 'rate', 'wastagePct', 'workers', 'workingHours', 'fuel'].includes(field)) _refreshCostBar();
};
window._execMatLookup = function (i, name) {
  const m = _matMaster().find(x => x.name.toLowerCase() === String(name).toLowerCase());
  if (!m || !_draft.material[i]) return;
  const r = _draft.material[i];
  if (!r.unit) r.unit = m.unit || '';
  if (!num(r.rate)) { r.rate = m.rate || 0; r.cost = +(num(r.qty) * (1 + num(r.wastagePct) / 100) * num(r.rate)).toFixed(2); }
  _renderBody();
};
function _matMaster() {
  const out = new Map();
  (state.rawMaterials || []).forEach(m => m.name && out.set(m.name.toLowerCase(), { name: m.name, unit: m.unit || '', rate: num(m.rate) || num(m.lastRate) }));
  (state.itemsMaster || []).forEach(m => m.name && !out.has(m.name.toLowerCase()) && out.set(m.name.toLowerCase(), { name: m.name, unit: m.unit || '', rate: num(m.rate) || num(m.purchaseRate) }));
  return [...out.values()];
}
window._execAttachRecipe = function () {
  const p = proj(); const cId = p && p.clientId;
  const recs = (state.recipes && cId && state.recipes[cId]) || {};
  const code = (_draft.boqRef || _draft.code || '').trim();
  const rec = recs[code] || recs[_draft.code];
  if (!rec || !Array.isArray(rec.ingredients) || !rec.ingredients.length) return showToast('No mix-design recipe found for this BOQ code', 'error');
  const qtyBase = num(_draft.qty.plannedQty) || 1;
  rec.ingredients.forEach(ing => {
    const rm = (state.rawMaterials || []).find(r => r.id === (ing.rawMatId || ing.materialId));
    const per = num(ing.qty);
    const totalQ = +(per * qtyBase).toFixed(3);
    const rate = num(rm && rm.rate);
    _draft.material.push({ id: uid('m'), name: (rm && rm.name) || 'Material', qty: totalQ, unit: (rm && rm.unit) || '', consumptionRate: per, wastagePct: num(ing.wastage), deliveryDate: '', rate, cost: +(totalQ * (1 + num(ing.wastage) / 100) * rate).toFixed(2) });
  });
  _renderBody(); showToast('Recipe materials attached', 'success');
};

window._execSaveActivity = function (approve) {
  if (!_draft) return;
  if (!(_draft.name || '').trim()) return showToast('Activity name is required', 'error');
  _ensureArrays();
  const idx = state.execActivities.findIndex(a => a.id === _draft.id);
  if (idx >= 0) state.execActivities[idx] = _draft; else state.execActivities.push(_draft);
  saveAllData();
  if (approve) { window._execApprove(_draft.id, true); return; }
  showToast('Activity saved', 'success');
  _draft = null; _ui.editActId = null; renderExecEngine();
};

window._execApprove = function (id, fromEditor) {
  const a = actById(id); if (!a) return;
  if (!confirm('Approve this baseline? Once approved it becomes read-only and is snapshotted for permanent comparison. Later revisions create a new baseline version.')) return;
  const ver = baselinesFor(id).length + 1;
  a.status = 'approved'; a.approvedBy = who(); a.approvedAt = nowISO();
  state.execBaselines.push({ id: uid('bl'), activityId: id, projectId: pid(), version: ver, snapshot: JSON.parse(JSON.stringify(a)), approvedBy: who(), approvedAt: nowISO() });
  saveAllData();
  showToast(`Baseline v${ver} approved & locked`, 'success');
  if (fromEditor) { _draft = JSON.parse(JSON.stringify(a)); }
  renderExecEngine();
};

/* ═══════════════════════════════════════════════════════
 *  STAGE 2 — EXECUTION PLAN (versioned + reason-tracked)
 * ═══════════════════════════════════════════════════════ */
function _planList() {
  const approved = acts().filter(a => a.status === 'approved');
  const drafts = acts().filter(a => a.status !== 'approved');
  const anyPlan = approved.some(a => activePlan(a.id));
  return `
    <div class="ee-toolbar"><div class="text-xs text-slate-500">${approved.length} baselined activit${approved.length === 1 ? 'y' : 'ies'} ready to execute</div>
      ${anyPlan ? `<button class="ee-btn-primary" onclick="window._execAssignOpen()">👷 Assign Labour (by day)</button>` : ''}
    </div>
    ${drafts.length ? `<div class="ee-note">⚠ ${drafts.length} activit${drafts.length === 1 ? 'y is' : 'ies are'} still in draft. Approve the baseline (Baseline tab) before generating an execution plan.</div>` : ''}
    ${!approved.length ? `<div class="ee-empty"><div class="text-3xl mb-2">📋</div><p class="font-bold text-slate-700">Nothing to execute yet</p><p class="text-xs text-slate-400 mt-1">Approve a baseline first, then <b>Generate Plan</b> here — everything auto-fills from the baseline.</p></div>`
      : `<div class="ee-cards">${approved.map(_planCard).join('')}</div>`}`;
}
function _planCard(a) {
  const plans = plansFor(a.id); const ap = activePlan(a.id); const ch = changesFor(a.id).length;
  return `
    <div class="ee-card">
      <div class="ee-card-top"><div class="min-w-0"><div class="ee-card-title">${esc(a.name)}</div><div class="ee-card-sub">${esc([a.code, a.location].filter(Boolean).join(' · ')) || '—'}</div></div>
        ${ap ? `<span class="ee-badge ver">${ap.version}</span>` : `<span class="ee-badge draft">No plan</span>`}</div>
      ${!ap ? `<div class="ee-card-cta"><button class="ee-btn-primary w-full" onclick="window._execGenPlan('${a.id}')">⚡ Generate Plan</button></div>`
        : `<div class="ee-card-metrics">
             <div><span>Target qty</span><b>${fmtN(ap.targetQty)} ${esc((a.qty && a.qty.unit) || '')}</b></div>
             <div><span>Labour</span><b>${(ap.labour || []).reduce((s, l) => s + num(l.workers), 0)}</b></div>
             <div><span>Versions</span><b>${plans.length}</b></div>
           </div>
           <div class="ee-card-foot"><span class="ee-mini">${ch} logged change${ch === 1 ? '' : 's'}</span>
             <div class="flex gap-1">
               ${plans.length > 1 ? `<button class="ee-lnk" onclick="window._execVersions('${a.id}')">Versions</button>` : ''}
               <button class="ee-lnk" onclick="window._execChangeLog('${a.id}')">History</button>
               <button class="ee-lnk" onclick="window._execPlanPDF('${a.id}')" title="Printable work order to hand out">⬇ Plan PDF</button>
               <button class="ee-lnk ok" onclick="window._execEditPlan('${a.id}')">Edit plan</button>
             </div></div>`}
    </div>`;
}

window._execGenPlan = function (actId) {
  const a = actById(actId); if (!a || a.status !== 'approved') return showToast('Approve the baseline first', 'error');
  _ensureArrays();
  const bl = latestBaseline(actId); const src = (bl && bl.snapshot) || a;
  const plan = {
    id: uid('pl'), activityId: actId, projectId: pid(), verNum: 1, version: 'V1', baselineId: bl && bl.id, active: true,
    schedule: JSON.parse(JSON.stringify(src.schedule || {})), targetQty: num(src.qty && src.qty.plannedQty),
    labour: JSON.parse(JSON.stringify(src.labour || [])), material: JSON.parse(JSON.stringify(src.material || [])),
    equipment: JSON.parse(JSON.stringify(src.equipment || [])), cost: JSON.parse(JSON.stringify(src.cost || {})),
    createdBy: who(), createdAt: nowISO()
  };
  state.execPlans.push(plan); saveAllData();
  showToast('Execution plan V1 generated from baseline', 'success');
  window._execEditPlan(actId);
};

window._execEditPlan = function (actId) {
  const ap = activePlan(actId); if (!ap) return window._execGenPlan(actId);
  _planDraft = JSON.parse(JSON.stringify(ap)); _ui.planActId = actId; _ui.tab = 'plan'; renderExecEngine();
};
window._execClosePlan = function () { _planDraft = null; _ui.planActId = null; renderExecEngine(); };

function _planEditor() {
  const a = actById(_ui.planActId); const d = _planDraft; if (!a || !d) return _planList();
  return `<div class="ee-editor">
    <div class="ee-editor-head">
      <button class="ee-btn-ghost" onclick="window._execClosePlan()">‹ Back</button>
      <div class="text-sm font-bold text-slate-700">Execution Plan · ${esc(a.name)} · <span class="ee-badge ver" style="vertical-align:middle">${d.version}</span></div>
      <div class="flex gap-2">
        <button class="ee-btn-ghost" onclick="window._execPlanPDF('${a.id}')">⬇ Plan PDF</button>
        <button class="ee-btn-ok" onclick="window._execSavePlan()">Save changes</button>
      </div>
    </div>
    <div class="ee-note">Edits here never touch the baseline. Any change asks for a reason and creates a new version (audit-tracked).</div>
    ${_sec('Schedule & Target', `<div class="ee-grid">
      ${_pfld('Planned Start', 'schedule.plannedStart', d.schedule.plannedStart, 'date')}
      ${_pfld('Planned Finish', 'schedule.plannedFinish', d.schedule.plannedFinish, 'date')}
      ${_pfld('Duration (days)', 'schedule.duration', d.schedule.duration, 'number')}
      ${_pfld('Shift', 'schedule.shift', d.schedule.shift, 'text')}
      ${_pfld('Target Quantity', 'targetQty', d.targetQty, 'number')}
    </div>`)}
    ${_sec('Labour', _pLabour(d.labour))}
    ${_sec('Material', _pMaterial(d.material))}
    ${_sec('Equipment', _pEquip(d.equipment))}
  </div>`;
}
function _pfld(label, path, val, type) { return _fld(label, `<input class="ee-input" type="${type}" value="${esc(val)}" oninput="window._execPlanSet('${path}',this.value)">`); }
function _pcell(section, i, field, val, type = 'number') { return `<input class="ee-cell" type="${type}" value="${esc(val)}" oninput="window._execPlanRow('${section}',${i},'${field}',this.value)">`; }
function _pLabour(rows) {
  return `<div class="ee-tblwrap"><table class="ee-tbl"><thead><tr><th>Type</th><th>Workers</th><th>Hours</th><th>OT</th><th></th></tr></thead><tbody>
    ${(rows || []).map((r, i) => `<tr><td><select class="ee-cell" onchange="window._execPlanRow('labour',${i},'type',this.value)">${TRADES.map(t => `<option ${r.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
    <td>${_pcell('labour', i, 'workers', r.workers)}</td><td>${_pcell('labour', i, 'hours', r.hours)}</td><td>${_pcell('labour', i, 'otHours', r.otHours)}</td>
    <td><button class="ee-rowdel" onclick="window._execPlanDel('labour',${i})">✕</button></td></tr>`).join('')}</tbody></table></div>
    <button class="ee-addrow" onclick="window._execPlanAdd('labour')">+ Add labour</button>`;
}
function _pMaterial(rows) {
  return `<div class="ee-tblwrap"><table class="ee-tbl"><thead><tr><th>Material</th><th>Qty</th><th>Unit</th><th>Rate</th><th></th></tr></thead><tbody>
    ${(rows || []).map((r, i) => `<tr><td><input class="ee-cell wide" value="${esc(r.name)}" oninput="window._execPlanRow('material',${i},'name',this.value)"></td>
    <td>${_pcell('material', i, 'qty', r.qty)}</td><td><input class="ee-cell sm" value="${esc(r.unit)}" oninput="window._execPlanRow('material',${i},'unit',this.value)"></td>
    <td>${_pcell('material', i, 'rate', r.rate)}</td><td><button class="ee-rowdel" onclick="window._execPlanDel('material',${i})">✕</button></td></tr>`).join('')}</tbody></table></div>
    <button class="ee-addrow" onclick="window._execPlanAdd('material')">+ Add material</button>`;
}
function _pEquip(rows) {
  return `<div class="ee-tblwrap"><table class="ee-tbl"><thead><tr><th>Equipment</th><th>Qty</th><th>Work hrs</th><th>Fuel</th><th></th></tr></thead><tbody>
    ${(rows || []).map((r, i) => `<tr><td><input class="ee-cell wide" value="${esc(r.name)}" oninput="window._execPlanRow('equipment',${i},'name',this.value)"></td>
    <td>${_pcell('equipment', i, 'qty', r.qty)}</td><td>${_pcell('equipment', i, 'workingHours', r.workingHours)}</td><td>${_pcell('equipment', i, 'fuel', r.fuel)}</td>
    <td><button class="ee-rowdel" onclick="window._execPlanDel('equipment',${i})">✕</button></td></tr>`).join('')}</tbody></table></div>
    <button class="ee-addrow" onclick="window._execPlanAdd('equipment')">+ Add equipment</button>`;
}
window._execPlanSet = function (path, val) { if (!_planDraft) return; const parts = path.split('.'); let o = _planDraft; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {}; o[parts[parts.length - 1]] = (['schedule', 'targetQty'].some(x => path.includes(x)) && parts[parts.length - 1] !== 'shift' && !path.includes('planned')) ? num(val) : val; };
window._execPlanRow = function (s, i, f, v) { if (!_planDraft || !_planDraft[s] || !_planDraft[s][i]) return; _planDraft[s][i][f] = ['type', 'name', 'unit'].includes(f) ? v : num(v); };
window._execPlanAdd = function (s) { if (!_planDraft) return; _planDraft[s] = _planDraft[s] || []; const b = { labour: { id: uid('l'), type: 'Mason', workers: '', hours: 8, otHours: 0 }, material: { id: uid('m'), name: '', qty: '', unit: '', rate: 0 }, equipment: { id: uid('e'), name: '', qty: 1, workingHours: 8, fuel: 0 } }; _planDraft[s].push(b[s]); _renderBody(); };
window._execPlanDel = function (s, i) { if (!_planDraft) return; _planDraft[s].splice(i, 1); _renderBody(); };

/* ---- change detection → reason modal ---- */
function _diffPlan(oldP, newP) {
  const diffs = [];
  const push = (field, o, n) => { if (num(o) !== num(n) || (typeof o === 'string' && (o || '') !== (n || ''))) diffs.push({ field, oldValue: o, newValue: n }); };
  push('Duration (days)', oldP.schedule && oldP.schedule.duration, newP.schedule && newP.schedule.duration);
  push('Planned Start', oldP.schedule && oldP.schedule.plannedStart, newP.schedule && newP.schedule.plannedStart);
  push('Planned Finish', oldP.schedule && oldP.schedule.plannedFinish, newP.schedule && newP.schedule.plannedFinish);
  push('Shift', oldP.schedule && oldP.schedule.shift, newP.schedule && newP.schedule.shift);
  push('Target Qty', oldP.targetQty, newP.targetQty);
  _diffRows('Labour', oldP.labour, newP.labour, 'type', r => `${num(r.workers)}w×${num(r.hours)}h`, diffs);
  _diffRows('Material', oldP.material, newP.material, 'name', r => `${num(r.qty)} ${r.unit || ''}`, diffs);
  _diffRows('Equipment', oldP.equipment, newP.equipment, 'name', r => `${num(r.qty)}× ${num(r.workingHours)}h`, diffs);
  return diffs;
}
function _diffRows(label, oldR, newR, key, fmt, diffs) {
  const om = new Map((oldR || []).map(r => [String(r[key] || '').toLowerCase(), r]));
  const nm = new Map((newR || []).map(r => [String(r[key] || '').toLowerCase(), r]));
  nm.forEach((r, k) => { const o = om.get(k); if (!o) diffs.push({ field: `${label}: ${r[key]}`, oldValue: '—', newValue: fmt(r) }); else if (fmt(o) !== fmt(r)) diffs.push({ field: `${label}: ${r[key]}`, oldValue: fmt(o), newValue: fmt(r) }); });
  om.forEach((r, k) => { if (!nm.has(k)) diffs.push({ field: `${label}: ${r[key]}`, oldValue: fmt(r), newValue: '— removed —' }); });
}

window._execSavePlan = function () {
  const ap = activePlan(_ui.planActId); if (!ap || !_planDraft) return;
  const diffs = _diffPlan(ap, _planDraft);
  if (!diffs.length) { showToast('No changes to save', 'info'); return; }
  _pendingReason = { actId: _ui.planActId, diffs, media: { gps: null, photoRef: null, voiceRef: null } };
  _openReasonModal();
};

function _openReasonModal() {
  const { diffs } = _pendingReason;
  const wrap = document.createElement('div');
  wrap.id = 'eeReasonModal'; wrap.className = 'ee-overlay';
  wrap.innerHTML = `
    <div class="ee-modal">
      <div class="ee-modal-h">Reason for change <span class="req">*</span></div>
      <div class="ee-diffs">${diffs.map(d => `<div class="ee-diff"><span>${esc(d.field)}</span><b>${esc(String(d.oldValue))} → ${esc(String(d.newValue))}</b></div>`).join('')}</div>
      <label class="ee-fld"><span>Reason</span>
        <select class="ee-input" id="eeReasonSel" onchange="document.getElementById('eeReasonOther').style.display=this.value==='Other'?'block':'none'">
          <option value="">— select a reason —</option>${CHANGE_REASONS.map(r => `<option>${r}</option>`).join('')}
        </select></label>
      <textarea id="eeReasonOther" class="ee-input" placeholder="Add a note (required if Other)…" style="display:none;min-height:60px"></textarea>
      <div class="ee-capture">
        <button class="ee-chip" id="eeGpsBtn" onclick="window._execReasonGps()">📍 Stamp GPS</button>
        <label class="ee-chip">📷 Photo<input type="file" accept="image/*" capture="environment" style="display:none" onchange="window._execReasonPhoto(this.files[0])"></label>
        <button class="ee-chip" id="eeVoiceBtn" onclick="window._execReasonVoice()">🎙 Voice note</button>
        <span id="eeCaptureStatus" class="ee-cap-status"></span>
      </div>
      <div class="ee-modal-f">
        <button class="ee-btn-ghost" onclick="window._execCloseReason()">Cancel</button>
        <button class="ee-btn-ok" onclick="window._execConfirmReason()">Save new version</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
window._execCloseReason = function () { const m = document.getElementById('eeReasonModal'); if (m) m.remove(); _pendingReason = null; };
window._execReasonGps = async function () {
  const st = document.getElementById('eeCaptureStatus'); if (st) st.textContent = 'Locating…';
  const g = await getGps(); _pendingReason.media.gps = g;
  const btn = document.getElementById('eeGpsBtn'); if (btn && g) btn.classList.add('on');
  if (st) st.textContent = g ? '📍 ' + gpsLabel(g) : 'GPS unavailable';
};
window._execReasonPhoto = async function (file) {
  if (!file) return; const st = document.getElementById('eeCaptureStatus'); if (st) st.textContent = 'Uploading photo…';
  const ref = await uploadExecMedia(file, 'photo'); _pendingReason.media.photoRef = ref;
  if (st) st.textContent = ref ? '📷 photo attached' : 'photo failed';
};
window._execReasonVoice = async function () {
  const btn = document.getElementById('eeVoiceBtn'); const st = document.getElementById('eeCaptureStatus');
  if (!isRecording()) { const ok = await startVoice(); if (ok) { btn.classList.add('rec'); btn.textContent = '⏹ Stop'; if (st) st.textContent = 'Recording…'; } }
  else { btn.classList.remove('rec'); btn.textContent = '🎙 Voice note'; if (st) st.textContent = 'Uploading voice…'; const f = await stopVoice(); const ref = f ? await uploadExecMedia(f, 'voice') : null; _pendingReason.media.voiceRef = ref; if (st) st.textContent = ref ? '🎙 voice attached' : 'voice failed'; }
};
window._execConfirmReason = async function () {
  const sel = document.getElementById('eeReasonSel').value;
  const note = document.getElementById('eeReasonOther').value.trim();
  if (!sel) return showToast('Please select a reason', 'error');
  if (sel === 'Other' && !note) return showToast('Please describe the reason', 'error');
  const { actId, diffs, media } = _pendingReason;
  const ap = activePlan(actId);
  const verNum = plansFor(actId).length + 1;
  // mark old versions inactive; append the new active version
  (state.execPlans || []).forEach(p => { if (p.activityId === actId) p.active = false; });
  const newPlan = JSON.parse(JSON.stringify(_planDraft));
  newPlan.id = uid('pl'); newPlan.verNum = verNum; newPlan.version = 'V' + verNum; newPlan.active = true;
  newPlan.createdBy = who(); newPlan.createdAt = nowISO(); newPlan.reason = sel; newPlan.reasonNote = note; newPlan.fromVersion = ap.version;
  const ts = nowISO();
  const changeRows = diffs.map(d => ({ id: uid('ch'), activityId: actId, projectId: pid(), planId: newPlan.id, version: newPlan.version, field: d.field, oldValue: d.oldValue, newValue: d.newValue, reason: sel, reasonNote: note, user: who(), ts, device: device(), gps: media.gps, photoRef: media.photoRef, voiceRef: media.voiceRef }));
  _ensureArrays();
  state.execPlans.push(newPlan);
  state.execChanges.push(...changeRows);
  saveAllData();
  try { if (navigator.onLine) await pullRemoteUpdates(); } catch {}
  window._execCloseReason();
  _planDraft = null; _ui.planActId = null;
  showToast(`Saved ${newPlan.version} · ${diffs.length} change(s) logged`, 'success');
  renderExecEngine();
};

/* ---- versions & change history ---- */
window._execVersions = function (actId) {
  const plans = plansFor(actId); const a = actById(actId);
  const body = plans.map(p => `<div class="ee-ver-row"><div><b>${p.version}</b> · ${new Date(p.createdAt).toLocaleString('en-IN')} · ${esc(p.createdBy)}${p.reason ? ` · <span class="ee-tag">${esc(p.reason)}</span>` : ''}</div><div class="ee-mini">${(p.labour || []).reduce((s, l) => s + num(l.workers), 0)} workers · target ${fmtN(p.targetQty)}${p.active ? ' · <b style="color:#16a34a">ACTIVE</b>' : ''}</div></div>`).join('');
  _simpleModal(`Versions · ${esc(a.name)}`, body || 'No versions');
};
window._execChangeLog = function (actId) {
  const rows = changesFor(actId); const a = actById(actId);
  if (!rows.length) return _simpleModal(`Change history · ${esc(a.name)}`, '<p class="text-xs text-slate-400">No changes logged yet.</p>');
  const body = rows.map(c => `<div class="ee-ver-row">
    <div><b>${esc(c.field)}</b>: ${esc(String(c.oldValue))} → ${esc(String(c.newValue))}</div>
    <div class="ee-mini">${esc(c.version || '')} · ${new Date(c.ts).toLocaleString('en-IN')} · ${esc(c.user)} · <span class="ee-tag">${esc(c.reason)}</span>${c.reasonNote ? ' · ' + esc(c.reasonNote) : ''}</div>
    <div class="ee-mini">${c.gps ? '📍 ' + esc(gpsLabel(c.gps)) + ' ' : ''}${c.photoRef ? `<a href="#" onclick="window._execOpenMedia('${q(c.photoRef.path)}');return false">📷 photo</a> ` : ''}${c.voiceRef ? `<a href="#" onclick="window._execOpenMedia('${q(c.voiceRef.path)}');return false">🎙 voice</a>` : ''}</div>
  </div>`).join('');
  _simpleModal(`Change history · ${esc(a.name)}`, body);
};
window._execOpenMedia = function (path) { openExecMedia(path); };

function _simpleModal(title, bodyHtml) {
  const wrap = document.createElement('div'); wrap.className = 'ee-overlay'; wrap.onclick = e => { if (e.target === wrap) wrap.remove(); };
  wrap.innerHTML = `<div class="ee-modal"><div class="ee-modal-h">${esc(title)}</div><div class="ee-modal-body">${bodyHtml}</div><div class="ee-modal-f"><button class="ee-btn-ghost" onclick="this.closest('.ee-overlay').remove()">Close</button></div></div>`;
  document.body.appendChild(wrap);
}

/* ═══════════════════════════════════════════════════════
 *  GENERATE PLAN PDF — printable work order (hand-out & assign)
 * ═══════════════════════════════════════════════════════ */
window._execPlanPDF = function (actId) {
  const a = actById(actId); const ap = activePlan(actId);
  if (!a || !ap) return showToast('Generate an execution plan first', 'error');
  const ns = window.jspdf; if (!ns) return showToast('PDF engine not ready', 'error');
  const doc = new ns.jsPDF({ unit: 'mm', format: 'a4' });
  const ml = 14; let y = getCompanyHeaderForPDF(doc);
  doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.text('EXECUTION PLAN / WORK ORDER', ml, y); y += 5;
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  const loc = [a.location, a.wing, a.floor, a.zone, a.area].filter(Boolean).join(' · ');
  const sd = ap.schedule || {};
  doc.text(`Project: ${(proj() || {}).name || '—'}    |    Plan ${ap.version}    |    Generated: ${new Date().toLocaleDateString('en-IN')}`, ml, y); y += 4;
  doc.text(`Activity: ${a.name}${a.code ? '  (' + a.code + ')' : ''}${loc ? '    |    Location: ' + loc : ''}`, ml, y); y += 4;
  doc.text(`Schedule: ${sd.plannedStart || '—'} to ${sd.plannedFinish || '—'}    |    Duration: ${num(sd.duration) || '—'} d    |    Shift: ${sd.shift || '—'}    |    Target Qty: ${fmtN(ap.targetQty)} ${(a.qty && a.qty.unit) || ''}`, ml, y); y += 6;

  const tbl = (title, head, body) => { if (!body.length) return; doc.setFont(undefined, 'bold'); doc.setFontSize(10); doc.text(title, ml, y); y += 1; doc.autoTable({ startY: y + 1, head: [head], body, styles: { fontSize: 8 }, headStyles: { fontStyle: 'bold' }, theme: 'grid', margin: { left: ml, right: ml } }); y = doc.lastAutoTable.finalY + 6; };
  tbl('LABOUR', ['Trade', 'Workers', 'Hours', 'OT'], (ap.labour || []).map(l => [l.type || '', num(l.workers), num(l.hours), num(l.otHours)]));
  tbl('MATERIALS', ['Material', 'Qty', 'Unit'], (ap.material || []).map(m => [m.name || '', fmtN(m.qty), m.unit || '']));
  tbl('EQUIPMENT', ['Equipment', 'Qty', 'Work hrs', 'Fuel (L)'], (ap.equipment || []).map(e => [e.name || '', num(e.qty), num(e.workingHours), num(e.fuel)]));

  // assigned workers for the plan's start date, if any
  const day = sd.plannedStart || new Date().toISOString().slice(0, 10);
  const asg = assignmentsForActivity(actId, day);
  if (asg.length) tbl(`ASSIGNED WORKERS (${day})`, ['#', 'Name', 'Trade'], asg.map((x, i) => { const w = roster().find(r => r.id === x.workerId) || {}; return [i + 1, w.name || x.workerId, w.trade || x.trade || '']; }));

  if (y > 250) { doc.addPage(); y = 20; }
  y += 4; doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text('Assigned to (Gang/Sub): ______________________________', ml, y); y += 8;
  doc.text('Site Engineer: __________________', ml, y); doc.text('Supervisor: __________________', ml + 90, y); y += 8;
  doc.text('Signature: __________________', ml, y); doc.text('Date: __________________', ml + 90, y);
  mobileSavePDF(doc, `WorkOrder-${(a.name || 'activity').replace(/[^a-z0-9]+/gi, '-')}.pdf`);
};

/* ═══════════════════════════════════════════════════════
 *  FREE-LABOUR ASSIGNMENT (by day) — assign available workers
 * ═══════════════════════════════════════════════════════ */
window._execAssignOpen = function () { _ui.assignMode = true; _ui.assignDate = _ui.assignDate || new Date().toISOString().slice(0, 10); _ui.tab = 'plan'; renderExecEngine(); };
window._execAssignClose = function () { _ui.assignMode = false; renderExecEngine(); };
window._execAssignDate = function (d) { _ui.assignDate = d; _renderBody(); };

function _assignBoard() {
  const date = _ui.assignDate;
  const roles = roster();
  if (!roles.length) return `<div class="ee-editor"><div class="ee-editor-head"><button class="ee-btn-ghost" onclick="window._execAssignClose()">‹ Back</button><div class="text-sm font-bold text-slate-700">Assign Labour</div><span></span></div><div class="ee-note">No workers in the Labour master for this project. Add workers under <b>Labour</b> first, then assign them here.</div></div>`;
  const active = activeActivitiesOn(date);
  const avail = availableWorkers(date);
  const free = avail.filter(w => isWorkerFree(w.id, date));

  // per-trade availability summary
  const trades = [...new Set([...roles.map(w => (w.trade || 'General')), ...active.flatMap(a => Object.keys(planTradeNeed(activePlan(a.id))))])];
  const needTotal = {}; active.forEach(a => { const n = planTradeNeed(activePlan(a.id)); Object.entries(n).forEach(([t, c]) => needTotal[t] = (needTotal[t] || 0) + c); });
  const summary = trades.map(t => {
    const strength = roles.filter(w => (w.trade || 'General') === t).length;
    const availT = avail.filter(w => (w.trade || 'General') === t).length;
    const freeT = free.filter(w => (w.trade || 'General') === t).length;
    const need = needTotal[t] || 0;
    const short = need > availT;
    return `<tr class="${short ? 'ee-short' : ''}"><td class="ee-vlabel">${esc(t)}</td><td>${strength}</td><td>${availT}</td><td>${need}</td><td><b>${freeT}</b></td><td>${short ? `<span class="ee-vr">short ${need - availT}</span>` : (need ? '<span class="ee-vg">ok</span>' : '—')}</td></tr>`;
  }).join('');

  // free worker pool chips (grouped)
  const poolChips = free.length ? free.map(w => `<span class="ee-wchip">${esc(w.name)} <i>${esc(w.trade || 'general')}</i>
    <select class="ee-wassign" onchange="window._execAssign('${date}','${w.id}',this.value)"><option value="">＋ assign…</option>${active.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></span>`).join('') : '<span class="ee-mini">All available workers are assigned.</span>';

  const cards = active.length ? active.map(a => {
    const ap = activePlan(a.id); const need = planTradeNeed(ap);
    const asg = assignmentsForActivity(a.id, date);
    const byTrade = {}; asg.forEach(x => { const w = roles.find(r => r.id === x.workerId) || {}; const t = w.trade || x.trade || 'General'; (byTrade[t] = byTrade[t] || []).push({ id: x.id, wid: x.workerId, name: w.name || x.workerId }); });
    const rows = Object.keys(need).map(t => {
      const got = (byTrade[t] || []).length; const short = got < need[t];
      const chips = (byTrade[t] || []).map(p => `<span class="ee-achip">${esc(p.name)}<button onclick="window._execUnassign('${p.id}')" title="Remove">✕</button></span>`).join('');
      return `<div class="ee-need-row"><span class="ee-need-t">${esc(t)} <b class="${short ? 'ee-vr' : 'ee-vg'}">${got}/${need[t]}</b></span><div class="ee-need-chips">${chips || '<span class="ee-mini">none assigned</span>'}</div></div>`;
    }).join('');
    const shortAny = Object.keys(need).some(t => (byTrade[t] || []).length < need[t]);
    return `<div class="ee-card"><div class="ee-card-top"><div class="min-w-0"><div class="ee-card-title">${esc(a.name)}</div><div class="ee-card-sub">${esc([a.code, a.location, a.floor].filter(Boolean).join(' · ')) || '—'}</div></div>${shortAny ? '<span class="ee-badge draft" style="background:#fef2f2;color:#dc2626">Short</span>' : '<span class="ee-badge ok">Staffed</span>'}</div>${rows || '<span class="ee-mini">No labour in this plan.</span>'}<div class="ee-card-foot"><span class="ee-mini">${asg.length} assigned</span>${shortAny && free.length ? `<button class="ee-lnk ok" onclick="window._execAutoAssign('${a.id}','${date}')">🤖 Auto-fill free</button>` : ''}</div></div>`;
  }).join('') : `<div class="ee-empty"><p class="font-bold text-slate-700">No activities scheduled on ${esc(date)}</p><p class="text-xs text-slate-400 mt-1">Pick another date, or set plan start/finish dates so activities appear here.</p></div>`;

  return `
    <div class="ee-editor">
      <div class="ee-editor-head">
        <button class="ee-btn-ghost" onclick="window._execAssignClose()">‹ Back</button>
        <div class="text-sm font-bold text-slate-700">👷 Assign Labour</div>
        <div class="flex gap-2 items-center">
          <input type="date" class="ee-input" style="width:auto" value="${esc(date)}" onchange="window._execAssignDate(this.value)">
          <button class="ee-btn-ghost" onclick="window._execAssignPDF('${date}')">⬇ Day Plan PDF</button>
        </div>
      </div>
      ${_sec('Manpower availability · ' + esc(date), `<div class="ee-tblwrap"><table class="ee-tbl"><thead><tr><th>Trade</th><th>Strength</th><th>Available</th><th>Required</th><th>Free</th><th>Status</th></tr></thead><tbody>${summary || '<tr><td colspan="6" class="ee-mini">No trades</td></tr>'}</tbody></table></div>`)}
      ${_sec('Free labour pool (' + free.length + ')', `<div class="ee-pool">${poolChips}</div>`, 'Available & not yet assigned today')}
      <div class="ee-cards">${cards}</div>
    </div>`;
}

window._execAssign = function (date, workerId, actId) {
  if (!actId) return;
  if (!isWorkerFree(workerId, date)) return showToast('Worker is already assigned today', 'error');
  _ensureArrays();
  const w = roster().find(r => r.id === workerId) || {};
  state.execAssignments.push({ id: uid('asg'), projectId: pid(), date, activityId: actId, workerId, trade: w.trade || 'General', createdBy: who(), createdAt: nowISO() });
  saveAllData(); _renderBody();
};
window._execUnassign = function (asgId) {
  window.recycleDelete && window.recycleDelete('execAssignments', asgId, 'Assignment');
  saveAllData(); _renderBody();
};
window._execAutoAssign = function (actId, date) {
  const ap = activePlan(actId); if (!ap) return;
  const need = planTradeNeed(ap);
  const asg = assignmentsForActivity(actId, date);
  const got = {}; asg.forEach(x => { const w = roster().find(r => r.id === x.workerId) || {}; const t = w.trade || x.trade || 'General'; got[t] = (got[t] || 0) + 1; });
  let free = availableWorkers(date).filter(w => isWorkerFree(w.id, date));
  let added = 0;
  _ensureArrays();
  Object.entries(need).forEach(([t, count]) => {
    let deficit = count - (got[t] || 0);
    while (deficit > 0) {
      const pick = free.find(x => (x.trade || 'General') === t);
      if (!pick) break;
      state.execAssignments.push({ id: uid('asg'), projectId: pid(), date, activityId: actId, workerId: pick.id, trade: t, createdBy: who(), createdAt: nowISO() });
      free = free.filter(x => x.id !== pick.id); deficit--; added++;
    }
  });
  saveAllData(); _renderBody();
  showToast(added ? `Auto-assigned ${added} worker(s)` : 'No matching free workers for the shortfall', added ? 'success' : 'info');
};

window._execAssignPDF = function (date) {
  const ns = window.jspdf; if (!ns) return showToast('PDF engine not ready', 'error');
  const active = activeActivitiesOn(date);
  if (!active.length) return showToast('No activities scheduled on this date', 'error');
  const doc = new ns.jsPDF({ unit: 'mm', format: 'a4' });
  const ml = 14; let y = getCompanyHeaderForPDF(doc);
  doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.text('DAILY WORK ASSIGNMENT', ml, y); y += 5;
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text(`Project: ${(proj() || {}).name || '—'}    |    Date: ${date}    |    Generated: ${new Date().toLocaleDateString('en-IN')}`, ml, y); y += 6;
  active.forEach(a => {
    const ap = activePlan(a.id); const need = planTradeNeed(ap); const asg = assignmentsForActivity(a.id, date);
    if (y > 255) { doc.addPage(); y = 20; }
    doc.setFont(undefined, 'bold'); doc.setFontSize(10); doc.text(`${a.name}${a.code ? ' (' + a.code + ')' : ''}`, ml, y); y += 1;
    const loc = [a.location, a.wing, a.floor].filter(Boolean).join(' · ');
    const needStr = Object.entries(need).map(([t, c]) => `${t}: ${c}`).join(', ') || '—';
    const body = asg.length ? asg.map((x, i) => { const w = roster().find(r => r.id === x.workerId) || {}; return [i + 1, w.name || x.workerId, w.trade || x.trade || '', x.checkedIn ? '✓' : '']; }) : [['—', 'No workers assigned', '', '']];
    doc.autoTable({ startY: y + 2, head: [[`# `, 'Worker', 'Trade', 'Present']], body, styles: { fontSize: 8 }, headStyles: { fontStyle: 'bold' }, theme: 'grid', margin: { left: ml, right: ml },
      didDrawPage: () => {}, });
    y = doc.lastAutoTable.finalY + 2;
    doc.setFont(undefined, 'normal'); doc.setFontSize(8);
    doc.text(`Required — ${needStr}${loc ? '    |    Location: ' + loc : ''}    |    Target: ${fmtN(ap.targetQty)} ${(a.qty && a.qty.unit) || ''}`, ml, y); y += 7;
  });
  if (y > 255) { doc.addPage(); y = 20; }
  doc.setFontSize(9); doc.text('Site Engineer: __________________', ml, y); doc.text('Supervisor: __________________', ml + 90, y);
  mobileSavePDF(doc, `Daily-Assignment-${date}.pdf`);
};

/* ═══════════════════════════════════════════════════════
 *  STAGE 3 — ACTUALS (daily site execution + capture)
 * ═══════════════════════════════════════════════════════ */
function _actualsList() {
  const withPlan = acts().filter(a => activePlan(a.id));
  const all = actualsFor && (state.execActuals || []).filter(x => x.projectId === pid());
  return `
    <div class="ee-toolbar"><div class="text-xs text-slate-500">${(all || []).length} actual record(s) logged</div></div>
    ${!withPlan.length ? `<div class="ee-empty"><div class="text-3xl mb-2">⚙️</div><p class="font-bold text-slate-700">No execution plans to record against</p><p class="text-xs text-slate-400 mt-1">Generate an execution plan first, then log daily actuals here.</p></div>`
      : `<div class="ee-cards">${withPlan.map(a => {
        const rows = actualsFor(a.id); const done = rows.reduce((s, r) => s + num(r.actualQty), 0); const ap = activePlan(a.id);
        return `<div class="ee-card"><div class="ee-card-top"><div class="min-w-0"><div class="ee-card-title">${esc(a.name)}</div><div class="ee-card-sub">${rows.length} day(s) · vs plan ${ap.version}</div></div></div>
          <div class="ee-card-metrics"><div><span>Done qty</span><b>${fmtN(done)} ${esc((a.qty && a.qty.unit) || '')}</b></div><div><span>Target</span><b>${fmtN(ap.targetQty)}</b></div><div><span>Progress</span><b>${ap.targetQty ? Math.round(done / num(ap.targetQty) * 100) : 0}%</b></div></div>
          <div class="ee-card-foot"><span class="ee-mini">${rows.length ? 'last: ' + esc(rows[rows.length - 1].date) : 'no entries'}</span>
            <div class="flex gap-1">${rows.length ? `<button class="ee-lnk" onclick="window._execActualHistory('${a.id}')">Entries</button>` : ''}<button class="ee-lnk ok" onclick="window._execNewActual('${a.id}')">+ Log actual</button></div></div></div>`;
      }).join('')}</div>`}`;
}

function blankActual(actId) {
  const a = actById(actId); const ap = activePlan(actId); const unit = (a && a.qty && a.qty.unit) || '';
  return {
    id: uid('ac'), activityId: actId, planId: ap && ap.id, planVersion: ap && ap.version, projectId: pid(),
    date: new Date().toISOString().slice(0, 10), actualStart: '', actualFinish: '',
    labour: (ap && ap.labour || []).map(l => ({ id: uid('l'), type: l.type, workers: l.workers, hours: l.hours, otHours: l.otHours || 0 })),
    material: (ap && ap.material || []).map(m => ({ id: uid('m'), name: m.name, qty: m.qty, unit: m.unit, rate: m.rate || 0 })),
    equipment: (ap && ap.equipment || []).map(e => ({ id: uid('e'), name: e.name, workingHours: e.workingHours, idleHours: 0, fuel: e.fuel || 0 })),
    unit, actualQty: '', downtime: '', weather: 'Clear', remarks: '', qualityRemarks: '', safetyIncident: '', inspectionStatus: 'Not Required',
    progressPct: '', cost: {}, gps: null, photoRefs: [], voiceRefs: [], recordedBy: who(), createdAt: nowISO()
  };
}
window._execNewActual = function (actId) { _actualDraft = blankActual(actId); _ui.actualActId = actId; _ui.tab = 'actuals'; renderExecEngine(); };
window._execCloseActual = function () { _actualDraft = null; _ui.actualActId = null; renderExecEngine(); };

function _actualEditor() {
  const a = actById(_ui.actualActId); const d = _actualDraft; if (!a || !d) return _actualsList();
  const as = (s, i, f, v, t = 'number') => `<input class="ee-cell" type="${t}" value="${esc(v)}" oninput="window._execActualRow('${s}',${i},'${f}',this.value)">`;
  return `<div class="ee-editor">
    <div class="ee-editor-head"><button class="ee-btn-ghost" onclick="window._execCloseActual()">‹ Back</button>
      <div class="text-sm font-bold text-slate-700">Actual execution · ${esc(a.name)}</div>
      <button class="ee-btn-ok" onclick="window._execSaveActual()">Save actual</button></div>
    ${_sec('When', `<div class="ee-grid">
      ${_afld('Date', 'date', d.date, 'date')}${_afld('Actual Start', 'actualStart', d.actualStart, 'time')}${_afld('Actual Finish', 'actualFinish', d.actualFinish, 'time')}
      ${_afld('Downtime (hrs)', 'downtime', d.downtime, 'number')}${_afld('Weather', 'weather', d.weather, 'select', WEATHER)}
    </div>`)}
    ${_sec('Actual Labour', `<div class="ee-tblwrap"><table class="ee-tbl"><thead><tr><th>Type</th><th>Workers</th><th>Hours</th><th>OT</th><th></th></tr></thead><tbody>
      ${d.labour.map((r, i) => `<tr><td><select class="ee-cell" onchange="window._execActualRow('labour',${i},'type',this.value)">${TRADES.map(t => `<option ${r.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></td><td>${as('labour', i, 'workers', r.workers)}</td><td>${as('labour', i, 'hours', r.hours)}</td><td>${as('labour', i, 'otHours', r.otHours)}</td><td><button class="ee-rowdel" onclick="window._execActualDel('labour',${i})">✕</button></td></tr>`).join('')}
      </tbody></table></div><button class="ee-addrow" onclick="window._execActualAdd('labour')">+ Add</button>`)}
    ${_sec('Actual Material Consumption', `<div class="ee-tblwrap"><table class="ee-tbl"><thead><tr><th>Material</th><th>Qty</th><th>Unit</th><th>Rate</th><th></th></tr></thead><tbody>
      ${d.material.map((r, i) => `<tr><td><input class="ee-cell wide" value="${esc(r.name)}" oninput="window._execActualRow('material',${i},'name',this.value)"></td><td>${as('material', i, 'qty', r.qty)}</td><td><input class="ee-cell sm" value="${esc(r.unit)}" oninput="window._execActualRow('material',${i},'unit',this.value)"></td><td>${as('material', i, 'rate', r.rate)}</td><td><button class="ee-rowdel" onclick="window._execActualDel('material',${i})">✕</button></td></tr>`).join('')}
      </tbody></table></div><button class="ee-addrow" onclick="window._execActualAdd('material')">+ Add</button>`)}
    ${_sec('Actual Equipment Usage', `<div class="ee-tblwrap"><table class="ee-tbl"><thead><tr><th>Equipment</th><th>Work hrs</th><th>Idle hrs</th><th>Fuel (L)</th><th></th></tr></thead><tbody>
      ${d.equipment.map((r, i) => `<tr><td><input class="ee-cell wide" value="${esc(r.name)}" oninput="window._execActualRow('equipment',${i},'name',this.value)"></td><td>${as('equipment', i, 'workingHours', r.workingHours)}</td><td>${as('equipment', i, 'idleHours', r.idleHours)}</td><td>${as('equipment', i, 'fuel', r.fuel)}</td><td><button class="ee-rowdel" onclick="window._execActualDel('equipment',${i})">✕</button></td></tr>`).join('')}
      </tbody></table></div><button class="ee-addrow" onclick="window._execActualAdd('equipment')">+ Add</button>`)}
    ${_sec('Progress & Quality', `<div class="ee-grid">
      ${_afld('Qty Completed (' + esc(d.unit) + ')', 'actualQty', d.actualQty, 'number')}
      ${_afld('Progress %', 'progressPct', d.progressPct, 'number')}
      ${_afld('Actual Cost', 'cost.total', (d.cost && d.cost.total), 'number')}
      ${_afld('Inspection', 'inspectionStatus', d.inspectionStatus, 'select', INSPECTIONS)}
    </div>
    ${_afld('Site Remarks', 'remarks', d.remarks, 'textarea')}
    ${_afld('Quality Remarks', 'qualityRemarks', d.qualityRemarks, 'textarea')}
    ${_afld('Safety Incident (if any)', 'safetyIncident', d.safetyIncident, 'textarea')}`)}
    ${_sec('Site Capture', `<div class="ee-capture">
      <button class="ee-chip ${d.gps ? 'on' : ''}" id="eeAGps" onclick="window._execActualGps()">📍 ${d.gps ? gpsLabel(d.gps) : 'Stamp GPS'}</button>
      <label class="ee-chip">📷 Add photo<input type="file" accept="image/*" capture="environment" style="display:none" onchange="window._execActualPhoto(this.files[0])"></label>
      <button class="ee-chip" id="eeAVoice" onclick="window._execActualVoice()">🎙 Voice note</button>
      <span id="eeAStatus" class="ee-cap-status"></span></div>
      <div id="eeAMedia" class="ee-media">${_mediaChips(d)}</div>`)}
  </div>`;
}
function _afld(label, path, val, type, opts) {
  let ctl;
  if (type === 'select') ctl = `<select class="ee-input" onchange="window._execActualSet('${path}',this.value)">${opts.map(o => `<option ${String(val) === String(o) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else if (type === 'textarea') ctl = `<textarea class="ee-input" style="min-height:54px" oninput="window._execActualSet('${path}',this.value)">${esc(val)}</textarea>`;
  else ctl = `<input class="ee-input" type="${type}" value="${esc(val)}" oninput="window._execActualSet('${path}',this.value)">`;
  return _fld(label, ctl);
}
function _mediaChips(d) {
  const ph = (d.photoRefs || []).map(r => `<a class="ee-mchip" href="#" onclick="window._execOpenMedia('${q(r.path)}');return false">📷 ${esc(r.name || 'photo')}</a>`).join('');
  const vo = (d.voiceRefs || []).map(r => `<a class="ee-mchip" href="#" onclick="window._execOpenMedia('${q(r.path)}');return false">🎙 ${esc(r.name || 'voice')}</a>`).join('');
  return ph + vo || '<span class="ee-mini">No attachments yet</span>';
}
window._execActualSet = function (path, val) { if (!_actualDraft) return; const parts = path.split('.'); let o = _actualDraft; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {}; const key = parts[parts.length - 1]; o[key] = ['date', 'actualStart', 'actualFinish', 'weather', 'remarks', 'qualityRemarks', 'safetyIncident', 'inspectionStatus', 'unit'].includes(key) ? val : num(val); };
window._execActualRow = function (s, i, f, v) { if (!_actualDraft || !_actualDraft[s][i]) return; _actualDraft[s][i][f] = ['type', 'name', 'unit'].includes(f) ? v : num(v); };
window._execActualAdd = function (s) { const b = { labour: { id: uid('l'), type: 'Mason', workers: '', hours: 8, otHours: 0 }, material: { id: uid('m'), name: '', qty: '', unit: '', rate: 0 }, equipment: { id: uid('e'), name: '', workingHours: '', idleHours: 0, fuel: 0 } }; _actualDraft[s].push(b[s]); _renderBody(); };
window._execActualDel = function (s, i) { _actualDraft[s].splice(i, 1); _renderBody(); };
window._execActualGps = async function () { const st = document.getElementById('eeAStatus'); if (st) st.textContent = 'Locating…'; const g = await getGps(); _actualDraft.gps = g; const b = document.getElementById('eeAGps'); if (b) { b.classList.toggle('on', !!g); b.textContent = '📍 ' + (g ? gpsLabel(g) : 'GPS unavailable'); } if (st) st.textContent = ''; };
window._execActualPhoto = async function (file) { if (!file) return; const st = document.getElementById('eeAStatus'); if (st) st.textContent = 'Uploading photo…'; const ref = await uploadExecMedia(file, 'photo'); if (ref) { _actualDraft.photoRefs.push(ref); document.getElementById('eeAMedia').innerHTML = _mediaChips(_actualDraft); } if (st) st.textContent = ''; };
window._execActualVoice = async function () { const b = document.getElementById('eeAVoice'); const st = document.getElementById('eeAStatus'); if (!isRecording()) { const ok = await startVoice(); if (ok) { b.classList.add('rec'); b.textContent = '⏹ Stop'; if (st) st.textContent = 'Recording…'; } } else { b.classList.remove('rec'); b.textContent = '🎙 Voice note'; if (st) st.textContent = 'Uploading…'; const f = await stopVoice(); const ref = f ? await uploadExecMedia(f, 'voice') : null; if (ref) { _actualDraft.voiceRefs.push(ref); document.getElementById('eeAMedia').innerHTML = _mediaChips(_actualDraft); } if (st) st.textContent = ''; } };

window._execSaveActual = async function () {
  const d = _actualDraft; if (!d) return;
  if (!d.date) return showToast('Date is required', 'error');
  // auto productivity + cost if blank
  const days = 1; d.productivity = num(d.actualQty) / days;
  if (!(d.cost && num(d.cost.total))) {
    const mc = d.material.reduce((s, m) => s + num(m.qty) * num(m.rate), 0);
    d.cost = d.cost || {}; d.cost.material = mc;
  }
  await _appendSynced('execActuals', d);
  showToast('Actual execution recorded', 'success');
  _actualDraft = null; _ui.actualActId = null; renderExecEngine();
};
window._execActualHistory = function (actId) {
  const rows = actualsFor(actId); const a = actById(actId);
  const body = rows.map(r => `<div class="ee-ver-row"><div><b>${esc(r.date)}</b> · ${fmtN(r.actualQty)} ${esc(r.unit || '')} · ${r.labour.reduce((s, l) => s + num(l.workers), 0)} workers</div>
    <div class="ee-mini">${esc(r.weather || '')}${r.downtime ? ' · downtime ' + fmtN(r.downtime) + 'h' : ''}${r.inspectionStatus && r.inspectionStatus !== 'Not Required' ? ' · ' + esc(r.inspectionStatus) : ''} · ${esc(r.recordedBy)}</div>
    <div class="ee-mini">${r.gps ? '📍 ' + esc(gpsLabel(r.gps)) + ' ' : ''}${(r.photoRefs || []).map(p => `<a href="#" onclick="window._execOpenMedia('${q(p.path)}');return false">📷</a>`).join(' ')} ${(r.voiceRefs || []).map(p => `<a href="#" onclick="window._execOpenMedia('${q(p.path)}');return false">🎙</a>`).join(' ')}</div>
    ${r.remarks ? `<div class="ee-mini">📝 ${esc(r.remarks)}</div>` : ''}</div>`).join('');
  _simpleModal(`Actuals · ${esc(a.name)}`, body || 'None');
};

/* ═══════════════════════════════════════════════════════
 *  AGGREGATION + VARIANCE ENGINE
 * ═══════════════════════════════════════════════════════ */
function _snapMetrics(src) {
  // src = baseline snapshot OR plan; normalise to comparable metrics
  const labourWorkers = (src.labour || []).reduce((s, l) => s + num(l.workers), 0);
  const manHours = (src.labour || []).reduce((s, l) => s + num(l.workers) * (num(l.hours) + num(l.otHours)), 0);
  const materials = {}; (src.material || []).forEach(m => { const k = (m.name || '').toLowerCase(); if (!k) return; materials[k] = materials[k] || { name: m.name, qty: 0, cost: 0 }; materials[k].qty += num(m.qty); materials[k].cost += num(m.cost) || num(m.qty) * (1 + num(m.wastagePct) / 100) * num(m.rate); });
  const equipment = {}; (src.equipment || []).forEach(e => { const k = (e.name || '').toLowerCase(); if (!k) return; equipment[k] = equipment[k] || { name: e.name, hours: 0, idle: 0, fuel: 0, cost: 0 }; equipment[k].hours += num(e.workingHours); equipment[k].idle += num(e.idleHours); equipment[k].fuel += num(e.fuel); equipment[k].cost += num(e.cost); });
  const duration = num(src.schedule && src.schedule.duration);
  const qty = num(src.targetQty != null ? src.targetQty : (src.qty && src.qty.plannedQty));
  const cost = src.__cost != null ? src.__cost : (src.qty ? totalCost(src) : (labCost(src.labour) + Object.values(materials).reduce((s, m) => s + m.cost, 0) + Object.values(equipment).reduce((s, e) => s + e.cost, 0) + num(src.cost && src.cost.subCost) + num(src.cost && src.cost.overheads) + num(src.cost && src.cost.indirect)));
  return { labourWorkers, manHours, materials, equipment, duration, qty, cost, fuel: Object.values(equipment).reduce((s, e) => s + e.fuel, 0), idle: Object.values(equipment).reduce((s, e) => s + e.idle, 0) };
}
function _aggActuals(actId) {
  const rows = actualsFor(actId);
  const m = { labourWorkers: 0, manHours: 0, materials: {}, equipment: {}, duration: rows.length, qty: 0, cost: 0, fuel: 0, idle: 0, downtime: 0, days: rows.length };
  rows.forEach(r => {
    m.labourWorkers = Math.max(m.labourWorkers, (r.labour || []).reduce((s, l) => s + num(l.workers), 0));
    m.manHours += (r.labour || []).reduce((s, l) => s + num(l.workers) * (num(l.hours) + num(l.otHours)), 0);
    (r.material || []).forEach(x => { const k = (x.name || '').toLowerCase(); if (!k) return; m.materials[k] = m.materials[k] || { name: x.name, qty: 0, cost: 0 }; m.materials[k].qty += num(x.qty); m.materials[k].cost += num(x.qty) * num(x.rate); });
    (r.equipment || []).forEach(x => { const k = (x.name || '').toLowerCase(); if (!k) return; m.equipment[k] = m.equipment[k] || { name: x.name, hours: 0, idle: 0, fuel: 0, cost: 0 }; m.equipment[k].hours += num(x.workingHours); m.equipment[k].idle += num(x.idleHours); m.equipment[k].fuel += num(x.fuel); });
    m.qty += num(r.actualQty); m.downtime += num(r.downtime);
    m.cost += num(r.cost && r.cost.total) || (r.material || []).reduce((s, x) => s + num(x.qty) * num(x.rate), 0);
  });
  m.fuel = Object.values(m.equipment).reduce((s, e) => s + e.fuel, 0);
  m.idle = Object.values(m.equipment).reduce((s, e) => s + e.idle, 0);
  return m;
}

/* ═══════════════════════════════════════════════════════
 *  COMPARE & VARIANCE tab
 * ═══════════════════════════════════════════════════════ */
function _compareView() {
  const list = acts().filter(a => latestBaseline(a.id));
  if (!list.length) return `<div class="ee-empty"><div class="text-3xl mb-2">📊</div><p class="font-bold text-slate-700">No baselined activities to compare</p><p class="text-xs text-slate-400 mt-1">Approve a baseline and record some actuals to see Original vs Execution vs Actual.</p></div>`;
  const sel = _ui.compareActId && list.find(a => a.id === _ui.compareActId) ? _ui.compareActId : list[0].id;
  _ui.compareActId = sel;
  return `
    <div class="ee-toolbar">
      <select class="ee-input" style="max-width:340px" onchange="window._execCompareSel(this.value)">${list.map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
      <button class="ee-btn-ghost" onclick="window._execVariancePDF('${sel}')">⬇ Variance PDF</button>
    </div>
    ${_compareTable(sel)}`;
}
window._execCompareSel = function (id) { _ui.compareActId = id; _renderBody(); };

function _vcell(val, unit) { return `${fmtN(val)}${unit ? ' ' + esc(unit) : ''}`; }
function _vdelta(a, b, goodDown) {
  // b relative to a; goodDown => decrease is good (green)
  const d = num(b) - num(a); if (!num(a) && !num(b)) return '<span class="ee-v0">—</span>';
  const pct = num(a) ? (d / num(a) * 100) : 100;
  let cls = 'ee-v0'; if (Math.abs(d) > 1e-9) cls = (goodDown ? (d < 0) : (d > 0)) ? 'ee-vg' : 'ee-vr';
  const sign = d > 0 ? '+' : '';
  return `<span class="${cls}">${sign}${fmtN(d)} (${sign}${fmtN(pct, 1)}%)</span>`;
}
function _threeRow(label, base, exec, act, unit, goodDown) {
  return `<tr><td class="ee-vlabel">${label}</td>
    <td>${_vcell(base, unit)}</td>
    <td>${_vcell(exec, unit)} <span class="ee-sub">${_vdelta(base, exec, goodDown)}</span></td>
    <td>${_vcell(act, unit)} <span class="ee-sub">${_vdelta(exec, act, goodDown)}</span></td></tr>`;
}
function _compareTable(actId) {
  const a = actById(actId); const bl = latestBaseline(actId); const ap = activePlan(actId);
  const B = _snapMetrics((bl && bl.snapshot) || a);
  const E = ap ? _snapMetrics(ap) : B;
  const A = _aggActuals(actId);
  const unit = (a.qty && a.qty.unit) || '';
  // resource rows: union of material & equipment names across all three
  const matKeys = [...new Set([...Object.keys(B.materials), ...Object.keys(E.materials), ...Object.keys(A.materials)])];
  const eqKeys = [...new Set([...Object.keys(B.equipment), ...Object.keys(E.equipment), ...Object.keys(A.equipment)])];
  const matRows = matKeys.map(k => { const bm = B.materials[k] || {}, em = E.materials[k] || {}, am = A.materials[k] || {}; return _threeRow('🧱 ' + esc((em.name || bm.name || am.name)), bm.qty, em.qty, am.qty, '', true); }).join('');
  const eqRows = eqKeys.map(k => { const be = B.equipment[k] || {}, ee = E.equipment[k] || {}, ae = A.equipment[k] || {}; return _threeRow('🚜 ' + esc((ee.name || be.name || ae.name)) + ' hrs', be.hours, ee.hours, ae.hours, 'h', false); }).join('');
  const prodB = B.duration ? B.qty / B.duration : 0, prodE = E.duration ? E.qty / E.duration : 0, prodA = A.days ? A.qty / A.days : 0;
  return `
    <div class="ee-cmpwrap"><table class="ee-cmp"><thead><tr><th>Parameter</th><th>Original Plan</th><th>Execution Plan</th><th>Actual</th></tr></thead><tbody>
      ${_threeRow('👷 Labour (workers)', B.labourWorkers, E.labourWorkers, A.labourWorkers, '', true)}
      ${_threeRow('⏱ Man-hours', B.manHours, E.manHours, A.manHours, 'h', true)}
      ${matRows}
      ${eqRows}
      ${_threeRow('⛽ Fuel', B.fuel, E.fuel, A.fuel, 'L', true)}
      ${_threeRow('🕓 Idle equip hrs', B.idle, E.idle, A.idle, 'h', true)}
      ${_threeRow('📅 Duration', B.duration, E.duration, A.duration, 'd', true)}
      ${_threeRow('📦 Quantity', B.qty, E.qty, A.qty, unit, false)}
      ${_threeRow('📈 Productivity/day', prodB, prodE, prodA, unit, false)}
      <tr class="ee-cmp-total"><td class="ee-vlabel">💰 Cost</td><td>${money(B.cost)}</td><td>${money(E.cost)} <span class="ee-sub">${_vdelta(B.cost, E.cost, true)}</span></td><td>${money(A.cost)} <span class="ee-sub">${_vdelta(E.cost, A.cost, true)}</span></td></tr>
    </tbody></table></div>
    <div class="ee-legend"><span class="ee-vg">green = improvement</span> · <span style="color:#b45309">amber delta = planned change</span> · <span class="ee-vr">red = overrun</span></div>`;
}

window._execVariancePDF = function (actId) {
  const a = actById(actId); if (!a) return;
  const ns = window.jspdf; if (!ns) return showToast('PDF engine not ready', 'error');
  const doc = new ns.jsPDF({ unit: 'mm', format: 'a4' });
  let y = getCompanyHeaderForPDF(doc);
  doc.setFontSize(13); doc.text('Variance Report — Original vs Execution vs Actual', 14, y); y += 6;
  doc.setFontSize(9); doc.text(`Activity: ${a.name}${a.code ? ' (' + a.code + ')' : ''}   |   Project: ${(proj() || {}).name || ''}   |   ${new Date().toLocaleDateString('en-IN')}`, 14, y); y += 4;
  const bl = latestBaseline(actId); const ap = activePlan(actId);
  const B = _snapMetrics((bl && bl.snapshot) || a); const E = ap ? _snapMetrics(ap) : B; const A = _aggActuals(actId);
  const unit = (a.qty && a.qty.unit) || '';
  const rows = [];
  const row = (p, b, e, ac, u) => rows.push([p, fmtN(b) + (u ? ' ' + u : ''), fmtN(e) + (u ? ' ' + u : ''), fmtN(ac) + (u ? ' ' + u : '')]);
  row('Labour (workers)', B.labourWorkers, E.labourWorkers, A.labourWorkers, '');
  row('Man-hours', B.manHours, E.manHours, A.manHours, 'h');
  [...new Set([...Object.keys(B.materials), ...Object.keys(E.materials), ...Object.keys(A.materials)])].forEach(k => { const bm = B.materials[k] || {}, em = E.materials[k] || {}, am = A.materials[k] || {}; row((em.name || bm.name || am.name), bm.qty || 0, em.qty || 0, am.qty || 0, ''); });
  [...new Set([...Object.keys(B.equipment), ...Object.keys(E.equipment), ...Object.keys(A.equipment)])].forEach(k => { const be = B.equipment[k] || {}, ee = E.equipment[k] || {}, ae = A.equipment[k] || {}; row((ee.name || be.name || ae.name) + ' hrs', be.hours || 0, ee.hours || 0, ae.hours || 0, 'h'); });
  row('Fuel', B.fuel, E.fuel, A.fuel, 'L'); row('Duration', B.duration, E.duration, A.duration, 'd'); row('Quantity', B.qty, E.qty, A.qty, unit);
  rows.push(['Total Cost', money(B.cost), money(E.cost), money(A.cost)]);
  doc.autoTable({ startY: y + 2, head: [['Parameter', 'Original Plan', 'Execution Plan', 'Actual']], body: rows, styles: { fontSize: 8 }, headStyles: { fontStyle: 'bold' }, theme: 'grid' });
  mobileSavePDF(doc, `Variance-${(a.name || 'activity').replace(/[^a-z0-9]+/gi, '-')}.pdf`);
};

/* ═══════════════════════════════════════════════════════
 *  DASHBOARD
 * ═══════════════════════════════════════════════════════ */
function _bar(label, val, max, color) {
  const w = max ? Math.max(2, Math.round(num(val) / max * 100)) : 0;
  return `<div class="ee-barrow"><span class="ee-barlbl" title="${esc(label)}">${esc(label)}</span><span class="ee-bartrack"><span class="ee-barfill" style="width:${w}%;background:${color}"></span></span><b class="ee-barval">${fmtN(val)}</b></div>`;
}
function _dashboardView() {
  const list = acts().filter(a => latestBaseline(a.id));
  if (!list.length) return `<div class="ee-empty"><div class="text-3xl mb-2">📈</div><p class="font-bold text-slate-700">Dashboard fills in as you execute</p><p class="text-xs text-slate-400 mt-1">Approve baselines, generate plans, and log actuals — KPIs appear here.</p></div>`;
  // compute per-activity variance snapshots
  const stats = list.map(a => {
    const bl = latestBaseline(a.id); const ap = activePlan(a.id);
    const B = _snapMetrics((bl && bl.snapshot) || a); const E = ap ? _snapMetrics(ap) : B; const A = _aggActuals(a.id);
    return { a, B, E, A, costOver: A.cost - B.cost, durOver: A.duration - B.duration, changes: changesFor(a.id).length, idle: A.idle, prodGain: (A.days ? A.qty / A.days : 0) - (B.duration ? B.qty / B.duration : 0) };
  });
  const totBaseCost = stats.reduce((s, x) => s + x.B.cost, 0);
  const totActCost = stats.reduce((s, x) => s + x.A.cost, 0);
  const totChanges = stats.reduce((s, x) => s + x.changes, 0);
  const overruns = stats.filter(x => x.costOver > 0).sort((a, b) => b.costOver - a.costOver).slice(0, 6);
  const mostChanged = [...stats].sort((a, b) => b.changes - a.changes).slice(0, 6).filter(x => x.changes);
  const slippage = [...stats].sort((a, b) => b.durOver - a.durOver).slice(0, 6).filter(x => x.durOver > 0);
  const idle = [...stats].sort((a, b) => b.idle - a.idle).slice(0, 6).filter(x => x.idle > 0);
  // supervisor change leaderboard
  const bySup = {}; (state.execChanges || []).filter(c => c.projectId === pid()).forEach(c => { bySup[c.user] = (bySup[c.user] || 0) + 1; });
  const supers = Object.entries(bySup).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxOver = Math.max(1, ...overruns.map(x => x.costOver));
  const maxChg = Math.max(1, ...mostChanged.map(x => x.changes));
  const maxSlip = Math.max(1, ...slippage.map(x => x.durOver));
  const maxIdle = Math.max(1, ...idle.map(x => x.idle));
  const maxSup = Math.max(1, ...supers.map(x => x[1]));
  const kpi = (l, v, sub, cls) => `<div class="ee-kpi ${cls || ''}"><span>${l}</span><b>${v}</b>${sub ? `<i>${sub}</i>` : ''}</div>`;
  return `
    <div class="ee-kpis">
      ${kpi('Activities', list.length, stats.filter(x => x.A.qty > 0).length + ' in progress')}
      ${kpi('Planned cost', money(totBaseCost), '')}
      ${kpi('Actual cost', money(totActCost), (totActCost > totBaseCost ? '▲ ' : '▼ ') + money(Math.abs(totActCost - totBaseCost)) + ' vs plan', totActCost > totBaseCost ? 'bad' : 'good')}
      ${kpi('Logged changes', totChanges, 'across execution plans')}
    </div>
    <div class="ee-dash-grid">
      ${_dashCard('💸 Top cost overruns', overruns.length ? overruns.map(x => _bar(x.a.name, x.costOver, maxOver, '#dc2626')).join('') : _emptyMini('No overruns'))}
      ${_dashCard('✏️ Most-modified activities', mostChanged.length ? mostChanged.map(x => _bar(x.a.name, x.changes, maxChg, '#d97706')).join('') : _emptyMini('No changes logged'))}
      ${_dashCard('🐌 Biggest schedule slippage (days)', slippage.length ? slippage.map(x => _bar(x.a.name, x.durOver, maxSlip, '#7c3aed')).join('') : _emptyMini('On schedule'))}
      ${_dashCard('🕓 Highest equipment idle (hrs)', idle.length ? idle.map(x => _bar(x.a.name, x.idle, maxIdle, '#0891b2')).join('') : _emptyMini('No idle recorded'))}
      ${_dashCard('👷 Supervisor change leaderboard', supers.length ? supers.map(([u, n]) => _bar(u, n, maxSup, '#2563eb')).join('') : _emptyMini('No changes yet'))}
    </div>`;
}
function _dashCard(title, body) { return `<div class="ee-dashcard"><div class="ee-dashcard-h">${title}</div><div class="ee-dashcard-b">${body}</div></div>`; }
function _emptyMini(t) { return `<p class="ee-mini" style="padding:12px 0;text-align:center">${esc(t)}</p>`; }

/* ═══════════════════════════════════════════════════════
 *  RULE-BASED INSIGHTS
 * ═══════════════════════════════════════════════════════ */
function _insightsView() {
  const ins = _computeInsights();
  return `
    <div class="ee-toolbar"><div class="text-xs text-slate-500">Automatic analysis of your baseline vs execution vs actuals — computed on-device.</div></div>
    ${!ins.length ? `<div class="ee-empty"><div class="text-3xl mb-2">🧠</div><p class="font-bold text-slate-700">Insights appear as data builds up</p><p class="text-xs text-slate-400 mt-1">Log a few actuals and plan changes — the engine will explain deviations and suggest actions.</p></div>`
      : `<div class="ee-ins-list">${ins.map(i => `<div class="ee-ins ${i.level}"><div class="ee-ins-ic">${i.icon}</div><div><div class="ee-ins-t">${esc(i.title)}</div><div class="ee-ins-b">${esc(i.body)}</div>${i.action ? `<div class="ee-ins-a">💡 ${esc(i.action)}</div>` : ''}</div></div>`).join('')}</div>`}`;
}
function _computeInsights() {
  const out = []; const list = acts().filter(a => latestBaseline(a.id));
  list.forEach(a => {
    const bl = latestBaseline(a.id); const ap = activePlan(a.id);
    const B = _snapMetrics((bl && bl.snapshot) || a); const E = ap ? _snapMetrics(ap) : B; const A = _aggActuals(a.id);
    const chs = changesFor(a.id);
    // 1. Variance attribution: material overrun + labour increase on same activity
    Object.keys(A.materials).forEach(k => {
      const base = (B.materials[k] || {}).qty || (E.materials[k] || {}).qty || 0; const act = A.materials[k].qty;
      if (base > 0 && act > base * 1.08) {
        const pct = Math.round((act - base) / base * 100);
        const labUp = A.labourWorkers > B.labourWorkers;
        out.push({ level: 'warn', icon: '🧱', title: `${A.materials[k].name} on "${a.name}" is +${pct}% over plan`, body: `Planned ~${fmtN(base)}, actual ${fmtN(act)}.${labUp ? ` Labour also rose ${B.labourWorkers}→${A.labourWorkers}, a likely driver.` : ''}`, action: labUp ? 'Check whether extra crew is consuming/​wasting more material; tighten issue control.' : 'Review wastage and re-check the mix design against actual consumption.' });
      }
    });
    // 2. Schedule slippage
    if (A.duration > B.duration && B.duration) out.push({ level: 'warn', icon: '📅', title: `"${a.name}" is running ${A.duration - B.duration} day(s) long`, body: `Baseline ${B.duration}d, actual ${A.duration}d so far.`, action: 'Add a shift or crew to recover, or re-baseline downstream dependencies.' });
    // 3. Cost overrun
    if (A.cost > B.cost * 1.05 && B.cost) out.push({ level: 'bad', icon: '💸', title: `"${a.name}" cost +${Math.round((A.cost - B.cost) / B.cost * 100)}% vs baseline`, body: `Planned ${money(B.cost)}, actual ${money(A.cost)}.`, action: 'Drill into the variance table to find the driving resource.' });
    // 4. Idle / downtime linkage to material delay
    if (A.idle > 0) { const delay = chs.find(c => /Material Delay/i.test(c.reason || '')); out.push({ level: 'info', icon: '🕓', title: `${fmtN(A.idle)} idle equipment-hours on "${a.name}"`, body: delay ? 'Correlates with a logged "Material Delay" change.' : 'Equipment sat idle during execution.', action: delay ? 'Tighten material delivery scheduling before mobilising equipment.' : 'Right-size equipment deployment to the work front.' }); }
    // 5. Productivity gain
    const pB = B.duration ? B.qty / B.duration : 0, pA = A.days ? A.qty / A.days : 0;
    if (pA > pB * 1.1 && pB) out.push({ level: 'good', icon: '📈', title: `"${a.name}" beat planned productivity by ${Math.round((pA - pB) / pB * 100)}%`, body: `Planned ${fmtN(pB)}/day, actual ${fmtN(pA)}/day.`, action: 'Capture this crew mix as a template for similar activities.' });
  });
  // 6. Cross-activity recurring problem (same name overruns repeatedly)
  const byName = {}; acts().forEach(a => { const A = _aggActuals(a.id); const B = _snapMetrics((latestBaseline(a.id) || {}).snapshot || a); if (B.duration && A.duration > B.duration) { const key = (a.name || '').split(/\s|-/)[0].toLowerCase(); byName[key] = byName[key] || { n: 0, label: a.name }; byName[key].n++; } });
  Object.values(byName).filter(x => x.n >= 2).forEach(x => out.push({ level: 'warn', icon: '🔁', title: `"${x.label}"-type work slips repeatedly`, body: `${x.n} activities of this type ran over planned duration.`, action: 'Adjust the baseline productivity assumption for this work type.' }));
  // 7. Supervisor behaviour
  const bySup = {}; (state.execChanges || []).filter(c => c.projectId === pid()).forEach(c => { const key = c.user + '|' + (/Labour/i.test(c.field) && (num(c.newValue) > num(c.oldValue)) ? 'labup' : ''); if (key.endsWith('labup')) bySup[c.user] = (bySup[c.user] || 0) + 1; });
  Object.entries(bySup).filter(([, n]) => n >= 3).forEach(([u, n]) => out.push({ level: 'info', icon: '👷', title: `${u} increases labour often`, body: `${n} labour-up changes logged.`, action: 'Review whether baseline crew sizes are set too low for this supervisor’s work.' }));
  return out;
}
