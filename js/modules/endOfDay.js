/**
 * endOfDay.js — the Daily Progress suite: one "End of Day" screen per project and date.
 *
 *   Progress      work done against BOQ items, each tagged to who did it (sub contractor /
 *                 own labour); quick-log sheet; weather + hindrances. Feeds the day's DPR,
 *                 the measurement sheets (→ RA bills, Cost & Profit) and piece-rate labour bills.
 *   Concrete      Concrete Pour Cards for the day — grade, element, m³, slump, cast window,
 *                 supplier, ticket no, cubes, pre-pour checks, photo (same records + PDF as before).
 *   Quality & Safety  quick digital QC checklists (Pass / Fail / N.A.) and incident reports with
 *                 severity and up to 4 photos.
 *   Workforce     who was on site — from labour attendance and staff punches (read-only).
 *
 * It writes the same records the registers use (dailyProgress, concretePours, qualityChecks,
 * incidents), so every list, PDF and report keeps working. Day maths: endOfDayCalc.js.
 */
import { state, saveAllData } from './state.js';
import { showToast } from './utils.js';
import { getCurrentUser, isCurrentUserAdmin } from './rbac.js';
import { uploadExecMedia, signedExecUrl } from './execMedia.js';
import { daySummary, checklistResult, QC_TEMPLATES, POUR_ELEMENTS, GRADES, POUR_CHECKS, SAFETY_TYPES, SEVERITIES } from './endOfDayCalc.js?v=1.1.0';

const N = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pid = () => state.currentProjectId || null;
const proj = () => (state.projects || []).find(p => p.id === pid()) || {};
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const shift = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const nice = iso => { const t = today(); if (iso === t) return 'Today'; if (iso === shift(t, -1)) return 'Yesterday'; return new Date(iso + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }); };
const hhmm = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const arr = k => (state[k] || (state[k] = []));
const gangs = () => (state.labourContractors || []).filter(c => !c.projectId || c.projectId === pid());
const boqItems = () => (typeof window.mpBoqItems === 'function' ? window.mpBoqItems() : []);
const SEV_C = { Low: '#0f766e', Medium: '#b45309', High: '#c2410c', Critical: '#b91c1c' };
const TABS = [['progress', 'Daily Report', '📋'], ['pour', 'Concrete', '🧱'], ['qs', 'Quality & Safety', '🦺'], ['crew', 'Workforce', '👷']];
const DONE_KEY = { progress: 'progress', pour: 'pour', qs: 'quality', crew: 'workforce' };

let _date = null, _tab = 'progress';
let _photos = [];            // [{ path?, b64?, url }] for the open sheet

/** Render the End-of-Day hub into the Execution root. */
export function renderEndOfDay(root) {
  if (!_date) _date = today();
  const s = daySummary(state, pid(), _date);
  const doneN = Object.values(s.done).filter(Boolean).length;
  const ring = (() => { const r = 17, c = 2 * Math.PI * r, f = doneN / 4; return `<svg viewBox="0 0 44 44" class="eod-ring" aria-label="${doneN} of 4 sections recorded"><circle cx="22" cy="22" r="${r}" fill="none" stroke="#e8ecf1" stroke-width="5"/><circle cx="22" cy="22" r="${r}" fill="none" stroke="${doneN === 4 ? '#059669' : '#ea580c'}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 22 22)"/><text x="22" y="26" text-anchor="middle">${doneN}/4</text></svg>`; })();
  const body = _tab === 'pour' ? _pourTab(s) : _tab === 'qs' ? _qsTab(s) : _tab === 'crew' ? _crewTab(s) : _progressTab(s);
  root.innerHTML = `<div class="eod">
    <header class="eod-top">
      <button type="button" class="eod-nav" aria-label="Previous day" onclick="window._eodDay(-1)">‹</button>
      <label class="eod-date"><b>${esc(nice(_date))}</b><small>${esc(proj().name || '')} · ${esc(_date)}</small><input type="date" value="${_date}" max="${today()}" onchange="window._eodSetDate(this.value)" aria-label="Pick a date"></label>
      <button type="button" class="eod-nav" aria-label="Next day" onclick="window._eodDay(1)" ${_date >= today() ? 'disabled' : ''}>›</button>
      ${ring}
    </header>
    <nav class="eod-tabs" role="tablist">${TABS.map(([k, l, i]) => `<button type="button" role="tab" aria-selected="${_tab === k}" class="${_tab === k ? 'on' : ''}" onclick="window._eodTab('${k}')"><span aria-hidden="true">${i}</span>${l}${s.done[DONE_KEY[k]] ? '<i class="eod-ok" aria-label="recorded">✓</i>' : ''}</button>`).join('')}</nav>
    <main class="eod-body">${body}</main>
    <footer class="eod-foot">
      <button type="button" class="eod-btn ghost" onclick="window._eodPdf()">📄 Day report PDF</button>
      <button type="button" class="eod-btn ghost" onclick="window._exOpen('registers')">🗂 All registers</button>
    </footer>
  </div>`;
}
const _re = () => window.renderExecution?.();
window._eodDay = n => { const d = shift(_date || today(), n); if (d > today()) return; _date = d; _re(); };
window._eodSetDate = v => { if (v && v <= today()) { _date = v; _re(); } };
window._eodTab = t => { _tab = t; _re(); };
window._eodPdf = () => { const s = daySummary(state, pid(), _date); if (s.dpr) window._exDprPdf?.(s.dpr.id); else showToast('Log some work for this day first — the report is built from it', 'info'); };

// ── Daily Report feed — one vertical checklist that pulls the day's data in ───────
const UOMS = ['Nos', 'Sqm', 'Cum', 'Rmt', 'Kg', 'MT', 'Trip', 'Hours', 'Day', 'Bag', 'Ltr', 'LS'];
const fq = v => (Math.round(N(v) * 1000) / 1000).toLocaleString('en-IN');
const _locked = () => !!_dayDpr(false)?.eodSubmitted;
const _guard = () => { if (!_locked()) return false; showToast('This day is submitted and locked', 'info'); return true; };
const _isAdmin = () => { try { return ['owner', 'admin'].includes(window.getCurrentOrg?.()?._userRole) || !!isCurrentUserAdmin(); } catch { return false; } };

/** One checklist step: number / tick, title, a one-line status and the body. */
function _step(n, done, title, status, body, action) {
  return `<section class="eod-card eod-step${done ? ' done' : ''}">
    <header><span class="eod-num" aria-hidden="true">${done ? '✓' : n}</span><div class="eod-step-t"><b>${title}</b><small>${status}</small></div>${action || ''}</header>
    ${body}</section>`;
}

function _progressTab(s) {
  const d = s.dpr, r = s.report, w = s.workforce, lock = r.locked;
  const ro = lock ? ' disabled' : '';
  const sub = r.submitted;
  const when = sub?.at ? new Date(sub.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

  // 1 · Labour — read-only from attendance; never re-typed here.
  const labour = w.headcount
    ? `<button type="button" class="eod-crew" onclick="window._eodTab('crew')" aria-label="Workforce details">
        <span class="eod-crew-ic" aria-hidden="true">👷</span>
        <span class="eod-crew-n"><b>${w.headcount}</b><span>on site today</span></span>
        <span class="eod-crew-s">${w.present} present${w.half ? ` · ${w.half} half day` : ''}${w.staff ? ` · ${w.staff} staff` : ''}${w.ot ? ` · ${w.ot}h OT` : ''}<em>From attendance · tap for details ›</em></span>
      </button>`
    : `<div class="eod-nudge"><span aria-hidden="true">🕘</span><div><b>No attendance logged for ${esc(nice(_date).toLowerCase() === 'today' ? 'today' : nice(_date))}</b><small>The labour count fills itself from attendance — nothing to type here.</small></div>
        <button type="button" class="eod-btn" onclick="window.switchView('labourView');window._openLabourSection?.('markAtt')">Tap to log attendance</button></div>`;

  // 2 · BOQ measurements — grouped by item; lines from this DPR and from measurement sheets.
  const bq = {}; boqItems().forEach(b => { bq[b.code] = b; });
  const dims = l => [l.nos, l.l, l.b, l.h].filter(x => N(x)).map(x => fq(x)).join(' × ');
  const groups = r.groups.map(g => `<details class="eod-grp"><summary>
      <span class="eod-grp-c">${esc(g.code)}</span>
      <span class="eod-grp-d">${esc(g.description || bq[g.code]?.description || '')}<small>${g.lines.length} line${g.lines.length === 1 ? '' : 's'}${g.lines.some(l => l.src === 'sheet') ? ' · incl. measurement sheet' : ''}</small></span>
      <b class="eod-grp-q">${fq(g.qty)} <em>${esc(g.uom || bq[g.code]?.uom || '')}</em></b></summary>
      <ul class="eod-list">${g.lines.map(l => `<li><div class="eod-li-main"><b>${fq(l.qty)} ${esc(l.uom || g.uom || '')}</b>${dims(l) ? ` <span class="eod-dim">${dims(l)}</span>` : ''}<small>📍 ${esc(l.location || 'General')}${l.src === 'sheet' ? ` · 📏 Sheet ${esc(l.sheetNo || '')}` : ` · ${esc(l.doneBy || 'Own labour')}`}</small></div>
        ${l.src === 'sheet' ? '<span class="eod-pill">Measurement</span>' : lock ? '<span class="eod-pill ok">DPR</span>' : `<button type="button" class="eod-x" aria-label="Remove line" onclick="window._eodWorkDel('${l.dprId}', ${l.wi})">✕</button>`}</li>`).join('')}</ul></details>`).join('');
  const boq = (groups ? `<div class="eod-grps">${groups}</div>` : `<div class="eod-empty"><b>No measurements yet</b><span>Anything measured today in the Measurement module shows here automatically.</span></div>`)
    + (lock ? '' : `<button type="button" class="eod-btn wide" onclick="window._eodWorkSheet()">+ Add measurement</button>`);

  // 3 · Non-BOQ work — vertical cards, photo optional.
  const nb = r.nonBoq.map(n => `<li class="eod-nb">${n.photoPath || n.photo ? `<span class="eod-nb-ph" data-path="${esc(n.photoPath || '')}" data-b64="${n.photoPath ? '' : esc(n.photo || '')}"></span>` : '<span class="eod-nb-ph none" aria-hidden="true">🧰</span>'}
      <div class="eod-li-main"><b>${esc(n.description || String(n.code).replace(/^NB:/, ''))}</b><small>📍 ${esc(n.location || 'General')} · ${esc(n.doneBy || 'Own labour')}</small></div>
      <div class="eod-li-r"><b>${fq(n.qty)} ${esc(n.uom || '')}</b></div>
      ${lock ? '' : `<button type="button" class="eod-x" aria-label="Remove" onclick="window._eodWorkDel('${n.dprId}', ${s.work.indexOf(n)})">✕</button>`}</li>`).join('');
  const nonBoq = (nb ? `<ul class="eod-list">${nb}</ul>` : '<p class="eod-hint" style="margin:0 0 10px">Extra or out-of-scope work that is not in the BOQ — debris removal, rework, client-asked changes.</p>')
    + (lock ? '' : `<button type="button" class="eod-btn wide ghost" onclick="window._eodNbSheet()">+ Log non-BOQ work</button>`);

  // 4 · Equipment — pulled from Equipment logs; quick insert saves to the master logs.
  const eq = r.equipment.map(m => `<li><span class="eod-eq-ic" aria-hidden="true">🚜</span><div class="eod-li-main"><b>${esc(m.name)}</b><small>${esc(m.regNo || '')}${m.logs > 1 ? `${m.regNo ? ' · ' : ''}${m.logs} logs` : ''}${m.breakdown ? ' · ⚠ breakdown' : ''}</small></div>
      <div class="eod-li-r"><b>${m.hours ? fq(m.hours) + ' h' : m.km ? fq(m.km) + ' km' : '—'}</b>${m.litres ? `<span class="eod-tag">⛽ ${fq(m.litres)} L</span>` : ''}</div></li>`).join('');
  const equip = (eq ? `<ul class="eod-list">${eq}</ul>` : '<p class="eod-hint" style="margin:0 0 10px">No machine hours logged for this day.</p>')
    + (lock ? '' : `<button type="button" class="eod-btn wide ghost" onclick="window._eodEqSheet()">+ Log equipment usage</button>`);

  // 5 · Weather & remarks
  const weather = ['☀️ Sunny', '⛅ Cloudy', '🌧️ Rain', '🌬️ Windy'];
  const notes = `<div class="eod-chips">${weather.map(x => `<button type="button" class="eod-chip${d?.weather === x ? ' on' : ''}" onclick="window._eodNote('weather', '${x}')"${ro}>${x}</button>`).join('')}</div>
    <label class="eod-field">Hindrances / delays<input value="${esc(d?.hindrance || '')}" placeholder="e.g. Rain stopped work 2–4 pm; RMC late" onchange="window._eodNote('hindrance', this.value)"${ro}></label>
    <label class="eod-field">General remarks<textarea rows="2" placeholder="One line for the client report" onchange="window._eodNote('workDone', this.value)"${ro}>${esc(d?.workDone || '')}</textarea></label>`;

  const steps = [
    _step(1, w.headcount > 0, 'Labour', w.headcount ? `${w.headcount} on site · synced from attendance` : 'Waiting for attendance', labour),
    _step(2, r.groups.length > 0, 'BOQ measurements', r.groups.length ? `${r.groups.length} item${r.groups.length === 1 ? '' : 's'} measured` : 'Nothing measured yet', boq),
    _step(3, r.nonBoq.length > 0, 'Non-BOQ work', r.nonBoq.length ? `${r.nonBoq.length} entr${r.nonBoq.length === 1 ? 'y' : 'ies'}` : 'Optional', nonBoq),
    _step(4, r.equipment.length > 0, 'Equipment', r.equipment.length ? `${r.equipment.length} machine${r.equipment.length === 1 ? '' : 's'}${r.equipHours ? ` · ${fq(r.equipHours)} h` : ''} · from Equipment logs` : 'Optional', equip),
    _step(5, !!(d?.weather || d?.workDone || d?.hindrance), 'Site weather & remarks', d?.weather || 'Optional', notes,
      d ? `<button type="button" class="eod-link" onclick="window._exDprForm('${d.id}')">Full DPR</button>` : ''),
  ].join('');

  const foot = lock
    ? `<section class="eod-done-card"><span aria-hidden="true">🔒</span><div><b>Daily report submitted</b><small>${esc([sub.by, when].filter(Boolean).join(' · '))}${sub.by || when ? ' — ' : ''}this day's record is locked.</small></div>
        ${_isAdmin() ? '<button type="button" class="eod-btn ghost" onclick="window._eodReopen()">Reopen</button>' : ''}</section>`
    : `<div class="eod-swipe" id="eodSwipe"><span class="eod-swipe-t">Slide to submit daily report</span>
        <button type="button" class="eod-swipe-k" aria-label="Submit daily report" onclick="window._eodSubmit()" onpointerdown="window._eodSwipeStart(event)">➜</button></div>
        <p class="eod-hint" style="text-align:center">Submitting locks the day's DPR. Labour and equipment stay live in their own modules.</p>`;
  setTimeout(_paintNbPhotos, 0);
  return `${lock ? `<div class="eod-lockbar">🔒 Submitted${sub.by ? ' by ' + esc(sub.by) : ''}${when ? ' · ' + esc(when) : ''}</div>` : ''}${steps}${foot}`;
}
async function _paintNbPhotos() {
  for (const el of document.querySelectorAll('.eod-nb-ph[data-path],.eod-nb-ph[data-b64]')) {
    if (el.dataset.done) continue; el.dataset.done = '1';
    const src = el.dataset.b64 || (el.dataset.path ? await signedExecUrl(el.dataset.path).catch(() => '') : '');
    if (src) el.innerHTML = `<img src="${esc(src)}" alt="Work photo">`;
  }
}
/** The day's DPR, created on first use (same numbering as the DPR form). */
function _dayDpr(create) {
  let d = arr('dailyProgress').find(x => x.projectId === pid() && (x.date || '').slice(0, 10) === _date);
  if (!d && create) {
    const p = proj();
    const dprNum = typeof window._nextProjectSeries === 'function' ? window._nextProjectSeries(p.clientId || '', pid()) : '';
    d = window.stampCreate({ id: 'dpr_' + Date.now(), projectId: pid(), date: _date, measurements: [], overheads: [], dprNum, showProgress: true });
    arr('dailyProgress').push(d);
  }
  return d;
}
/** Rebuild this DPR's measurement lines + labour logs after a change (same path as the DPR form). */
function _resync(d) {
  window.prSyncDprLogs?.(d.id, d.date, d.measurements || []);
  if (typeof window.mpRecordWork !== 'function') return;
  window.mpClearDpr?.(d.id);
  const byLoc = {}, oh = d.overheads || [];
  (d.measurements || []).forEach(m => { (byLoc[m.location] = byLoc[m.location] || []).push(m); });
  const ohLoc = (d.area || Object.keys(byLoc)[0] || 'General').trim() || 'General';
  Object.keys(byLoc).forEach(loc => window.mpRecordWork({ date: d.date, locationId: loc, locationLabel: loc, items: byLoc[loc], overheads: loc === ohLoc ? oh : [], src: 'dpr', dprId: d.id }));
  if (oh.length && !byLoc[ohLoc]) window.mpRecordWork({ date: d.date, locationId: ohLoc, locationLabel: ohLoc, items: [], overheads: oh, src: 'dpr', dprId: d.id });
}
window._eodNote = (k, v) => { if (_guard()) return; const d = _dayDpr(true); d[k] = d[k] === v && k === 'weather' ? '' : v; saveAllData(); _re(); };
window._eodWorkSheet = function () {
  if (_guard()) return;
  const boq = boqItems();
  if (!boq.length) { showToast('This project has no BOQ yet — add the BOQ first', 'error'); return; }
  const locs = typeof window.mpProjectLocations === 'function' ? window.mpProjectLocations() : [];
  _sheet('Log work', `
    <label class="eod-field">BOQ item<select id="ewBoq" onchange="document.getElementById('ewUom').textContent=this.selectedOptions[0]?.dataset.uom||''"><option value="">— Pick the item —</option>${boq.map(b => `<option value="${esc(b.code)}" data-uom="${esc(b.uom)}">${esc(b.code)} — ${esc(b.description)}</option>`).join('')}</select></label>
    <div class="eod-sec">Measure <span class="eod-sec-n">optional — fills the quantity</span></div>
    <div class="eod-dims">${['Nos', 'L', 'B', 'H'].map(k => `<label>${k}<input id="ewD${k}" type="number" inputmode="decimal" min="0" step="any" oninput="window._eodDims()"></label>`).join('')}</div>
    <div class="eod-row2">
      <label class="eod-field">Quantity<span class="eod-qty"><input id="ewQty" type="number" inputmode="decimal" min="0" step="any" placeholder="0" oninput="this.dataset.typed=1"><em id="ewUom"></em></span></label>
      <label class="eod-field">Location<input id="ewLoc" list="ewLocs" placeholder="e.g. Tower B, 3rd floor"><datalist id="ewLocs">${locs.map(l => `<option value="${esc(l.label)}">`).join('')}</datalist></label>
    </div>
    <label class="eod-field">Who executed this work?<select id="ewGang">${window.prGangOptions ? window.prGangOptions('') : '<option value="">Own labour</option>'}</select></label>
    <p class="eod-hint">Tagging a sub contractor bills them at their work-order rate (Sub Contractor → Labour Bills).</p>`,
    'Save work', 'window._eodWorkSave()');
};
window._eodWorkSave = function () {
  const sel = document.getElementById('ewBoq'), code = sel?.value, qty = N(document.getElementById('ewQty')?.value);
  if (!code || !(qty > 0)) { showToast('Pick the BOQ item and enter the quantity', 'error'); return; }
  const b = boqItems().find(x => x.code === code) || {};
  const d = _dayDpr(true);
  if (!d.measurements) d.measurements = [];
  const dv = k => document.getElementById('ewD' + k)?.value || '';
  d.measurements.push({ location: (document.getElementById('ewLoc')?.value || '').trim() || 'General', code, description: b.description, uom: b.uom, rate: b.rate, qty, nos: dv('Nos'), l: dv('L'), b: dv('B'), h: dv('H'), gangId: document.getElementById('ewGang')?.value || '', isNonBoq: false });
  _resync(d); saveAllData(); _closeSheet(); showToast(`Logged ${qty} ${b.uom || ''} of ${code}`, 'success'); _re();
};
window._eodWorkDel = function (dprId, i) {
  if (_guard()) return;
  const s = daySummary(state, pid(), _date), w = s.work[i]; if (!w) return;
  const d = arr('dailyProgress').find(x => x.id === dprId); if (!d) return;
  const k = (d.measurements || []).findIndex(m => m.code === w.code && N(m.qty) === N(w.qty) && (m.location || '') === (w.location || '') && (m.gangId || '') === (w.gangId || ''));
  if (k < 0 || !confirm(`Remove ${w.code} · ${w.qty} ${w.uom || ''}?`)) return;
  d.measurements.splice(k, 1); _resync(d); saveAllData(); _re();
};

/** Quantity = Nos × L × B × H of whatever is filled, unless the quantity was typed by hand. */
window._eodDims = function () {
  const q = document.getElementById('ewQty'); if (!q || q.dataset.typed) return;
  const v = ['Nos', 'L', 'B', 'H'].map(k => N(document.getElementById('ewD' + k)?.value)).filter(x => x > 0);
  q.value = v.length ? String(Math.round(v.reduce((a, b) => a * b, 1) * 1000) / 1000) : '';
};

// Non-BOQ work → a DPR line flagged isNonBoq (same shape the DPR form writes), photo optional.
window._eodNbSheet = function () {
  if (_guard()) return;
  const locs = typeof window.mpProjectLocations === 'function' ? window.mpProjectLocations() : [];
  _sheet('Log non-BOQ work', `
    <label class="eod-field">What was done?<input id="nbDesc" placeholder="e.g. Debris removal from Tower B" autocomplete="off"></label>
    <div class="eod-sec">Unit</div>
    <div class="eod-chips" id="nbUoms">${UOMS.map((u, i) => `<button type="button" class="eod-chip${i === 0 ? ' on' : ''}" data-u="${u}" onclick="document.querySelectorAll('#nbUoms .eod-chip').forEach(b=>b.classList.toggle('on',b===this))">${u}</button>`).join('')}</div>
    <div class="eod-row2">
      <label class="eod-field">Quantity<span class="eod-qty"><input id="nbQty" type="number" inputmode="decimal" min="0" step="any" placeholder="0"></span></label>
      <label class="eod-field">Location<input id="nbLoc" list="nbLocs" placeholder="Optional"><datalist id="nbLocs">${locs.map(l => `<option value="${esc(l.label)}">`).join('')}</datalist></label>
    </div>
    <label class="eod-field">Who did it?<select id="nbGang">${window.prGangOptions ? window.prGangOptions('') : '<option value="">Own labour</option>'}</select></label>
    ${_photoField(1)}`, 'Save non-BOQ work', 'window._eodNbSave()');
  setTimeout(() => document.getElementById('nbDesc')?.focus(), 50);
};
window._eodNbSave = function () {
  const desc = (document.getElementById('nbDesc')?.value || '').trim(), qty = N(document.getElementById('nbQty')?.value);
  const uom = document.querySelector('#nbUoms .eod-chip.on')?.dataset.u || '';
  if (!desc || !(qty > 0)) { showToast('Describe the work and enter the quantity', 'error'); return; }
  if (_photos.some(p => p.uploading)) { showToast('Photo still uploading — one moment', 'info'); return; }
  const d = _dayDpr(true); if (!d.measurements) d.measurements = [];
  const ph = _photos[0];
  d.measurements.push({ location: (document.getElementById('nbLoc')?.value || '').trim() || 'General', code: 'NB:' + desc, description: desc, uom, rate: 0, qty, gangId: document.getElementById('nbGang')?.value || '', isNonBoq: true, ...(ph?.path ? { photoPath: ph.path } : ph?.b64 ? { photo: ph.b64 } : {}) });
  _resync(d); saveAllData(); _closeSheet(); showToast(`Logged ${qty} ${uom} — ${desc}`, 'success'); _re();
};

// Equipment usage → saved to the master Equipment logs (meter + service due), so every module sees it.
window._eodEqSheet = function () {
  if (_guard()) return;
  const list = (state.equipmentList || []).filter(e => !e.projectId || e.projectId === pid());
  if (!list.length) { showToast('No equipment yet — add machines in Equipment first', 'error'); return; }
  const ops = (state.labourMaster || []).filter(l => !l.siteId || l.siteId === pid());
  _sheet('Log equipment usage', `
    <label class="eod-field">Machine<select id="eqA" onchange="window._eodEqUnit()">${list.map(e => `<option value="${esc(e.id)}" data-unit="${esc(e.unit || 'HMR')}">${esc(e.name || e.code || 'Equipment')}${e.regNo ? ' · ' + esc(e.regNo) : ''}</option>`).join('')}</select></label>
    <div class="eod-row2">
      <label class="eod-field">Start<input id="eqS" type="time" oninput="window._eodEqCalc()"></label>
      <label class="eod-field">Finish<input id="eqF" type="time" oninput="window._eodEqCalc()"></label>
    </div>
    <div class="eod-row2">
      <label class="eod-field">Hours run<span class="eod-qty"><input id="eqH" type="number" inputmode="decimal" min="0" step="any" placeholder="0"><em>h</em></span></label>
      <label class="eod-field" id="eqKmF">KM run<span class="eod-qty"><input id="eqK" type="number" inputmode="decimal" min="0" step="any" placeholder="0"><em>km</em></span></label>
    </div>
    <label class="eod-field">Operator<select id="eqO"><option value="">—</option>${ops.map(l => `<option value="${esc(l.id)}">${esc(l.name || '')}</option>`).join('')}</select></label>
    <label class="eod-field">Note<input id="eqR" placeholder="Optional — e.g. excavation, Tower B"></label>
    <p class="eod-hint">Saved to Equipment → Usage logs as well — the machine's meter moves forward.</p>`, 'Save usage', 'window._eodEqSave()');
  window._eodEqUnit();
};
window._eodEqUnit = () => { const u = document.getElementById('eqA')?.selectedOptions[0]?.dataset.unit; const f = document.getElementById('eqKmF'); if (f) f.style.opacity = u === 'KM' ? '1' : '.55'; };
window._eodEqCalc = function () {
  const s = document.getElementById('eqS')?.value, f = document.getElementById('eqF')?.value; if (!s || !f) return;
  const m = (t => t[0] * 60 + t[1]); let mins = m(f.split(':').map(Number)) - m(s.split(':').map(Number)); if (mins < 0) mins += 1440;
  document.getElementById('eqH').value = Math.round(mins / 60 * 100) / 100;
};
window._eodEqSave = function () {
  const v = id => document.getElementById(id)?.value || '';
  if (typeof window.logEquipmentRun !== 'function') { showToast('Equipment module not loaded — refresh', 'error'); return; }
  const log = window.logEquipmentRun({ assetId: v('eqA'), date: _date, hours: v('eqH'), km: v('eqK'), startTime: v('eqS'), finishTime: v('eqF'), operatorId: v('eqO'), remarks: v('eqR').trim(), projectId: pid(), src: 'dpr' });
  if (!log) { showToast('Enter the hours or km run', 'error'); return; }
  _closeSheet(); showToast('Equipment usage saved', 'success'); _re();
};

// Swipe-to-submit (the knob is also a plain button: tap / Enter submits after a confirm).
window._eodSwipeStart = function (ev) {
  const k = ev.currentTarget, bar = document.getElementById('eodSwipe'); if (!bar) return;
  ev.preventDefault();
  const x0 = ev.clientX, max = bar.clientWidth - k.offsetWidth - 8; let dx = 0;
  k.setPointerCapture?.(ev.pointerId);
  const mv = e => { dx = Math.max(0, Math.min(max, e.clientX - x0)); k.style.transform = `translateX(${dx}px)`; bar.style.setProperty('--p', (dx / max).toFixed(3)); };
  const up = () => {
    k.removeEventListener('pointermove', mv); k.removeEventListener('pointerup', up); k.removeEventListener('pointercancel', up);
    if (dx >= max * 0.85) window._eodSubmit(true); else { k.style.transform = ''; bar.style.setProperty('--p', 0); }
  };
  k.addEventListener('pointermove', mv); k.addEventListener('pointerup', up); k.addEventListener('pointercancel', up);
  k.onclick = null;   // a drag is not a tap
  setTimeout(() => { k.onclick = () => window._eodSubmit(); }, 400);
};
window._eodSubmit = function (swiped) {
  if (_guard()) return;
  const s = daySummary(state, pid(), _date), r = s.report;
  const gaps = [!s.workforce.headcount && 'no attendance', !r.groups.length && !r.nonBoq.length && 'no work measured'].filter(Boolean);
  if (gaps.length && !confirm(`Submit with ${gaps.join(' and ')}?`)) { _re(); return; }
  if (!swiped && !gaps.length && !confirm(`Submit the daily report for ${nice(_date)}? It will be locked.`)) return;
  const d = _dayDpr(true), u = (() => { try { return getCurrentUser() || {}; } catch { return {}; } })(), w = s.workforce;
  // Snapshot what was pulled in, so the DPR (and its PDF) keeps the day's picture.
  d.eodSnapshot = { headcount: w.headcount, present: w.present, half: w.half, staff: w.staff, ot: w.ot,
    equipment: r.equipment.map(m => ({ assetId: m.assetId, name: m.name, hours: m.hours, km: m.km, litres: m.litres })),
    sheetLines: r.sheetLines.length, measuredItems: r.groups.length, nonBoq: r.nonBoq.length };
  if (r.equipment.length) d.equipment = r.equipment.map(m => `${m.name}${m.hours ? ' ' + fq(m.hours) + 'h' : m.km ? ' ' + fq(m.km) + 'km' : ''}`).join(', ');
  if (!N(d.manpowerSkilled) && !N(d.manpowerUnskilled)) d.manpowerUnskilled = w.present + w.half;
  d.eodSubmitted = { at: new Date().toISOString(), by: u.name || u.email || '', uid: u.id || '' };
  saveAllData(); showToast('Daily report submitted 🔒', 'success'); _re();
  try { window.notifyOwners && window.notifyOwners({ type: 'dpr', title: 'Daily report submitted', body: `${proj().name || ''} · ${_date} · ${w.headcount} on site`, data: { view: 'executionView' } }); } catch {}
};
window._eodReopen = function () {
  const d = _dayDpr(false); if (!d?.eodSubmitted) return;
  if (!_isAdmin()) { showToast('Only an owner or admin can reopen a submitted day', 'error'); return; }
  const why = prompt('Reason for reopening this day?'); if (!why || !why.trim()) return;
  (d.eodReopened = d.eodReopened || []).push({ ...d.eodSubmitted, reopenedAt: new Date().toISOString(), reason: why.trim() });
  delete d.eodSubmitted; saveAllData(); showToast('Day reopened for edits', 'success'); _re();
};

// ── Concrete pour cards ──────────────────────────────────────────────────────
function _pourTab(s) {
  return `<div class="eod-kpis"><div><b>${s.pours.length}</b><span>pour${s.pours.length === 1 ? '' : 's'}</span></div><div><b>${s.pourM3} m³</b><span>cast</span></div><div><b>${s.pours.reduce((t, p) => t + N(p.cubes), 0)}</b><span>cubes cast</span></div></div>
    <button type="button" class="eod-btn wide" onclick="window._eodPourSheet()">+ New pour card</button>
    ${s.pours.map(p => {
      const checks = POUR_CHECKS.filter(([k]) => p.checklist?.[k]).length;
      return `<article class="eod-pour">
        <div class="eod-grade">${esc(p.grade || '—')}</div>
        <div class="eod-pour-main"><b>${esc(p.element || 'Pour')}${p.location ? ' · ' + esc(p.location) : ''}</b>
          <small>${esc(p.pourNo || '')} · ${esc(p.startTime || '—')}–${esc(p.endTime || '…')} · ${esc(p.supplier || 'Supplier —')}${p.batchNo ? ' · ' + esc(p.batchNo) : ''}</small>
          <div class="eod-pour-stats"><span><b>${N(p.volume)}</b> m³</span><span><b>${p.slump || '—'}</b> mm slump</span><span><b>${N(p.cubes)}</b> cubes</span><span><b>${checks}/${POUR_CHECKS.length}</b> checks</span></div></div>
        <div class="eod-pour-acts"><button type="button" class="eod-link" onclick="window._eodPourSheet('${p.id}')">Edit</button><button type="button" class="eod-link" onclick="window._exPourPDF('${p.id}')">PDF</button></div>
      </article>`;
    }).join('') || '<div class="eod-empty"><b>No concrete cast</b><span>Record each pour — grade, volume, slump and cubes — as it happens.</span></div>'}`;
}
window._eodPourSheet = function (id) {
  const p = id ? arr('concretePours').find(x => x.id === id) : null;
  _photos = p && (p.photoPath || p.photo) ? [{ path: p.photoPath, b64: p.photo }] : [];
  const vendors = state.vendors || [];
  const chips = (name, opts, cur) => `<div class="eod-chips" data-name="${name}">${opts.map(o => `<button type="button" class="eod-chip${cur === o ? ' on' : ''}" onclick="window._eodPick(this)" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
  _sheet(p ? `Edit ${esc(p.pourNo || 'pour card')}` : 'Concrete pour card', `
    <div class="eod-sec">Element cast</div>${chips('element', POUR_ELEMENTS, p?.element || 'Slab')}
    <div class="eod-sec">Grade of concrete</div>${chips('grade', GRADES.slice(1, 7), p?.grade || 'M25')}
    <div class="eod-row2">
      <label class="eod-field">Volume<span class="eod-qty"><button type="button" onclick="window._eodStep('epVol',-0.5)" aria-label="Less">−</button><input id="epVol" type="number" inputmode="decimal" step="0.5" min="0" value="${p ? N(p.volume) : ''}" placeholder="0"><button type="button" onclick="window._eodStep('epVol',0.5)" aria-label="More">+</button><em>m³</em></span></label>
      <label class="eod-field">Slump test<span class="eod-qty"><input id="epSlump" type="number" inputmode="numeric" min="0" value="${p ? esc(p.slump || '') : ''}" placeholder="100"><em>mm</em></span></label>
    </div>
    <div class="eod-row2">
      <label class="eod-field">Cast start<span class="eod-qty"><input id="epStart" type="time" value="${esc(p?.startTime || hhmm())}"><button type="button" onclick="document.getElementById('epStart').value='${hhmm()}'">Now</button></span></label>
      <label class="eod-field">Cast end<span class="eod-qty"><input id="epEnd" type="time" value="${esc(p?.endTime || '')}"><button type="button" onclick="document.getElementById('epEnd').value=window._eodNow()">Now</button></span></label>
    </div>
    <label class="eod-field">Location / grid<input id="epLoc" value="${esc(p?.location || '')}" placeholder="e.g. Slab 3, Grid A–D / 1–4"></label>
    <div class="eod-row2">
      <label class="eod-field">Supplier (RMC)<select id="epVendor"><option value="">Site mix / other</option>${vendors.map(v => `<option value="${esc(v.id)}" ${p?.vendorId === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
      <label class="eod-field">Ticket / batch no.<input id="epBatch" value="${esc(p?.batchNo || '')}" placeholder="DC-1234"></label>
    </div>
    <label class="eod-field">Cubes cast<span class="eod-qty"><button type="button" onclick="window._eodStep('epCubes',-1)" aria-label="Less">−</button><input id="epCubes" type="number" inputmode="numeric" min="0" value="${p ? N(p.cubes) : 3}"><button type="button" onclick="window._eodStep('epCubes',1)" aria-label="More">+</button><em>nos</em></span></label>
    <div class="eod-sec">Pre-pour checks</div>
    <div class="eod-checks">${POUR_CHECKS.map(([k, l]) => `<label><input type="checkbox" id="epck_${k}" ${p?.checklist?.[k] ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>
    ${_photoField()}`,
    p ? 'Save changes' : 'Save pour card', `window._eodPourSave('${id || ''}')`);
};
window._eodNow = hhmm;
window._eodPick = btn => { btn.parentElement.querySelectorAll('.eod-chip').forEach(b => b.classList.toggle('on', b === btn)); };
window._eodStep = (id, n) => { const el = document.getElementById(id); if (el) el.value = Math.max(0, Math.round((N(el.value) + n) * 10) / 10); };
const _chipVal = name => document.querySelector(`#eodSheetOverlay .eod-chips[data-name="${name}"] .eod-chip.on`)?.dataset.v || '';
window._eodPourSave = function (id) {
  const v = i => (document.getElementById(i)?.value || '').trim();
  const volume = N(v('epVol'));
  if (!(volume > 0)) { showToast('Enter the volume cast (m³)', 'error'); return; }
  const checklist = {}; POUR_CHECKS.forEach(([k]) => { checklist[k] = !!document.getElementById('epck_' + k)?.checked; });
  const vendorId = v('epVendor');
  const ph = _photos[0] || {};
  const data = { date: _date, element: _chipVal('element') || 'Other', grade: _chipVal('grade') || 'M25', volume, slump: v('epSlump'), startTime: v('epStart'), endTime: v('epEnd'),
    location: v('epLoc'), vendorId, supplier: (state.vendors || []).find(x => x.id === vendorId)?.name || '', batchNo: v('epBatch'), cubes: N(v('epCubes')), checklist,
    photoPath: ph.path || null, photo: ph.path ? null : (ph.b64 || null), status: 'Completed' };
  const list = arr('concretePours');
  const ex = id && list.find(x => x.id === id);
  if (ex) Object.assign(ex, data);
  else list.push(window.stampCreate({ id: 'cpc_' + Date.now(), projectId: pid(), pourNo: 'CPC-' + String(list.filter(x => x.projectId === pid()).length + 1).padStart(3, '0'), ...data }));
  saveAllData(); _closeSheet(); showToast(ex ? 'Pour card updated' : `Pour card saved · ${volume} m³ ${data.grade}`, 'success'); _re();
};

// ── Quality & Safety ─────────────────────────────────────────────────────────
function _qsTab(s) {
  const pill = st => `<span class="eod-pill ${st === 'Pass' || st === 'Closed' ? 'ok' : st === 'Fail' ? 'bad' : ''}">${esc(st || 'Open')}</span>`;
  return `<section class="eod-card">
      <header><b>Quality checks</b><button type="button" class="eod-btn" onclick="window._eodQcSheet()">+ Checklist</button></header>
      ${s.qc.length ? `<ul class="eod-list">${s.qc.map(q => `<li><div class="eod-li-main"><b>${esc(q.checklist || q.type || 'Check')}</b><small>${esc(q.element || '')}${q.items ? ` · ${q.items.filter(i => i.result === 'Pass').length}/${q.items.filter(i => i.result !== 'NA').length} passed` : (q.result ? ' · ' + esc(q.result) : '')}</small></div>${pill(q.status)}</li>`).join('')}</ul>`
        : '<div class="eod-empty"><b>No checks yet</b><span>Run a quick checklist — pre-pour, brickwork, plaster — item by item.</span></div>'}
    </section>
    <section class="eod-card">
      <header><b>Safety</b><button type="button" class="eod-btn danger" onclick="window._eodIncidentSheet()">+ Report incident</button></header>
      ${s.incidents.length ? `<ul class="eod-list">${s.incidents.map(i => `<li class="sev" style="--sev:${SEV_C[i.severity] || '#64748b'}"><div class="eod-li-main"><b>${esc(i.type || 'Incident')}</b><small>${esc(i.description || '')}${i.location ? ' · 📍 ' + esc(i.location) : ''}${(i.photos || []).length || i.photoPath || i.photo ? ` · 📷 ${(i.photos || []).length || 1}` : ''}</small></div><span class="eod-pill" style="color:${SEV_C[i.severity] || '#475569'};background:${(SEV_C[i.severity] || '#475569')}14">${esc(i.severity || '')}</span></li>`).join('')}</ul>`
        : '<div class="eod-empty ok"><b>✓ No incidents reported</b><span>Report incidents, near misses and unsafe conditions with photos.</span></div>'}
    </section>`;
}
window._eodQcSheet = function (tpl) {
  tpl = tpl || Object.keys(QC_TEMPLATES)[0];
  _sheet('Quality checklist', `
    <div class="eod-chips">${Object.keys(QC_TEMPLATES).map(k => `<button type="button" class="eod-chip${k === tpl ? ' on' : ''}" onclick="window._eodQcSheet('${esc(k)}')">${esc(k)}</button>`).join('')}</div>
    <label class="eod-field">Element / location<input id="eqEl" placeholder="e.g. Slab 3, Tower B"></label>
    <ul class="eod-qc" data-tpl="${esc(tpl)}">${QC_TEMPLATES[tpl].map((l, i) => `<li><span>${esc(l)}</span><div class="eod-seg" data-i="${i}">${['Pass', 'Fail', 'NA'].map(r => `<button type="button" data-r="${r}" onclick="window._eodQcSet(this)">${r === 'NA' ? 'N.A.' : r}</button>`).join('')}</div></li>`).join('')}</ul>
    <label class="eod-field">Remarks<input id="eqRem" placeholder="What needs fixing, by whom"></label>
    ${_photoField()}`,
    'Save checklist', 'window._eodQcSave()');
};
window._eodQcSet = btn => { btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn)); };
window._eodQcSave = function () {
  const ul = document.querySelector('#eodSheetOverlay .eod-qc'); if (!ul) return;
  const tpl = ul.dataset.tpl;
  const items = QC_TEMPLATES[tpl].map((label, i) => ({ label, result: ul.querySelector(`.eod-seg[data-i="${i}"] button.on`)?.dataset.r || '' }));
  if (!items.some(i => i.result)) { showToast('Mark at least one item Pass, Fail or N.A.', 'error'); return; }
  const status = checklistResult(items), ph = _photos[0] || {};
  arr('qualityChecks').push(window.stampCreate({ id: 'qc_' + Date.now(), projectId: pid(), date: _date, type: 'Inspection', checklist: tpl, items, status,
    element: (document.getElementById('eqEl')?.value || '').trim(), result: `${items.filter(i => i.result === 'Pass').length}/${items.filter(i => i.result && i.result !== 'NA').length} passed`,
    remarks: (document.getElementById('eqRem')?.value || '').trim(), photoPath: ph.path || null, photo: ph.path ? null : (ph.b64 || null) }));
  saveAllData(); _closeSheet(); showToast(`${tpl} checklist — ${status}`, status === 'Fail' ? 'warning' : 'success'); _re();
};
window._eodIncidentSheet = function () {
  _photos = [];
  const me = (() => { try { return getCurrentUser()?.name || ''; } catch { return ''; } })();
  _sheet('Report a safety incident', `
    <div class="eod-sec">What happened</div>
    <div class="eod-chips" data-name="type">${SAFETY_TYPES.map((t, i) => `<button type="button" class="eod-chip${i === 0 ? ' on' : ''}" data-v="${esc(t)}" onclick="window._eodPick(this)">${esc(t)}</button>`).join('')}</div>
    <div class="eod-sec">Severity</div>
    <div class="eod-sev" data-name="severity">${SEVERITIES.map((v, i) => `<button type="button" class="eod-chip${i === 0 ? ' on' : ''}" data-v="${v}" style="--sev:${SEV_C[v]}" onclick="window._eodPick(this)">${v}</button>`).join('')}</div>
    <label class="eod-field">Description<textarea id="eiDesc" rows="3" placeholder="What happened, who was involved"></textarea></label>
    <div class="eod-row2">
      <label class="eod-field">Location<input id="eiLoc" placeholder="e.g. Scaffold, east face"></label>
      <label class="eod-field">Reported by<input id="eiBy" value="${esc(me)}"></label>
    </div>
    <label class="eod-field">Action taken<input id="eiAct" placeholder="First aid, area barricaded, toolbox talk…"></label>
    ${_photoField(4)}`,
    'Submit report', 'window._eodIncidentSave()', true);
};
window._eodIncidentSave = function () {
  const v = i => (document.getElementById(i)?.value || '').trim();
  const description = v('eiDesc');
  if (!description) { showToast('Describe what happened', 'error'); return; }
  const severity = document.querySelector('#eodSheetOverlay .eod-sev .eod-chip.on')?.dataset.v || 'Low';
  const paths = _photos.filter(p => p.path).map(p => p.path);
  const first = _photos[0] || {};
  arr('incidents').push(window.stampCreate({ id: 'inc_' + Date.now(), projectId: pid(), date: _date, type: _chipVal('type') || 'Incident', severity, description,
    location: v('eiLoc'), reportedBy: v('eiBy'), actionTaken: v('eiAct'), photos: paths, photoPath: first.path || null, photo: first.path ? null : (first.b64 || null), time: hhmm() }));
  saveAllData(); _closeSheet();
  if (severity === 'High' || severity === 'Critical') { try { window.notifyOwners?.({ type: 'safety', title: `${severity} safety incident`, body: `${description.slice(0, 80)} · ${proj().name || ''}`, data: { view: 'executionView' } }); } catch {} }
  showToast(`${severity} incident reported`, severity === 'Low' ? 'success' : 'warning'); _re();
};

// ── Workforce ────────────────────────────────────────────────────────────────
function _crewTab(s) {
  const w = s.workforce;
  const bars = (obj) => { const e = Object.entries(obj).sort((a, b) => b[1] - a[1]); const max = Math.max(1, ...e.map(x => x[1])); return e.map(([k, v]) => `<li><span>${esc(k)}</span><i style="--w:${(v / max * 100).toFixed(0)}%"></i><b>${v}</b></li>`).join(''); };
  return `<section class="eod-head">
      <div><b>${w.headcount}</b><span>people on site</span></div>
      <ul><li><b>${w.present}</b>present</li><li><b>${w.half}</b>half day</li><li><b>${w.absent}</b>absent</li><li><b>${w.staff}</b>staff</li>${w.ot ? `<li><b>${w.ot}h</b>OT</li>` : ''}</ul>
    </section>
    ${w.headcount ? `<div class="eod-grid2">
      <section class="eod-card"><header><b>By sub contractor</b><small>man-days</small></header><ul class="eod-bars">${bars(w.byGroup) || '<li class="none">No labour marked</li>'}</ul></section>
      <section class="eod-card"><header><b>By trade</b><small>man-days</small></header><ul class="eod-bars">${bars(w.byTrade) || '<li class="none">No labour marked</li>'}</ul></section>
    </div>
    ${w.staffList.length ? `<section class="eod-card"><header><b>Staff</b><small>punched in</small></header><ul class="eod-list">${w.staffList.map(a => { const st = (state.staffMaster || []).find(x => x.id === a.staffId) || {}; const t = x => (x ? new Date(x).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '…'); return `<li><div class="eod-li-main"><b>${esc(st.name || 'Staff')}</b><small>${esc(st.designation || '')}${a.manual ? ' · ✎ manual' : ''}</small></div><span class="eod-pill ok">${t(a.inAt)}–${t(a.outAt)}</span></li>`; }).join('')}</ul></section>` : ''}`
    : '<div class="eod-empty"><b>No attendance for this day</b><span>Mark labour attendance and staff punches — the headcount builds itself.</span></div>'}
    <div class="eod-row2">
      <button type="button" class="eod-btn ghost" onclick="window.switchView('labourView');window._openLabourSection?.('markAtt')">👷 Mark labour attendance</button>
      <button type="button" class="eod-btn ghost" onclick="window._exOpen('staff')">📍 Staff punch in / out</button>
    </div>`;
}

// ── Bottom sheet + photos ────────────────────────────────────────────────────
function _sheet(title, body, saveLabel, onSave, danger) {
  _closeSheet(true);
  document.body.insertAdjacentHTML('beforeend', `<div id="eodSheetOverlay" class="eod-sheet-bg" onclick="if(event.target===this)window._eodCloseSheet()">
    <section class="eod-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header><h3>${title}</h3><button type="button" class="eod-x" aria-label="Close" onclick="window._eodCloseSheet()">✕</button></header>
      <div class="eod-sheet-body">${body}</div>
      <footer><button type="button" class="eod-btn wide${danger ? ' danger' : ''}" onclick="${onSave}">${saveLabel}</button></footer>
    </section></div>`);
  const el = document.getElementById('eodSheetOverlay');
  el.__onBack = () => window._eodCloseSheet();
  _paintPhotos();
}
function _closeSheet(keepPhotos) { document.getElementById('eodSheetOverlay')?.remove(); if (!keepPhotos) _photos = []; }
window._eodCloseSheet = () => _closeSheet();
function _photoField(max = 1) {
  return `<div class="eod-sec">Photo${max > 1 ? `s (up to ${max})` : ''}</div>
    <div class="eod-photos" data-max="${max}"><div id="eodPhotoList" class="eod-photo-list"></div>
      <label class="eod-photo-add"><input type="file" accept="image/*" capture="environment" onchange="window._eodPhoto(this)"><span>📷</span>Add photo</label></div>`;
}
async function _paintPhotos() {
  const box = document.getElementById('eodPhotoList'); if (!box) return;
  const max = N(box.closest('.eod-photos')?.dataset.max) || 1;
  for (const p of _photos) if (!p.url) p.url = p.b64 || (p.path ? await signedExecUrl(p.path).catch(() => '') : '');
  box.innerHTML = _photos.map((p, i) => `<span class="eod-photo"><img src="${esc(p.url || '')}" alt="Photo ${i + 1}"><button type="button" aria-label="Remove photo" onclick="window._eodPhotoDel(${i})">✕</button></span>`).join('');
  const add = box.parentElement.querySelector('.eod-photo-add'); if (add) add.hidden = _photos.length >= max;
}
window._eodPhotoDel = i => { _photos.splice(i, 1); _paintPhotos(); };
window._eodPhoto = async function (input) {
  const file = input.files && input.files[0]; if (!file) return;
  const url = URL.createObjectURL(file);
  const entry = { url, uploading: true }; _photos.push(entry); _paintPhotos();
  try { const ref = await uploadExecMedia(file, 'dpr', 'dpr'); if (ref) entry.path = ref.path; } catch {}
  if (!entry.path) entry.b64 = await _shrink(file).catch(() => null);   // offline: keep a small copy
  entry.uploading = false; input.value = '';
};
function _shrink(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(); img.onerror = reject;
    img.onload = () => { const sc = Math.min(1, 900 / (img.width || 900)); const cv = document.createElement('canvas'); cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); resolve(cv.toDataURL('image/jpeg', 0.6)); };
    img.src = URL.createObjectURL(file);
  });
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('eodSheetOverlay')) _closeSheet(); });
window.renderEndOfDay = renderEndOfDay;
