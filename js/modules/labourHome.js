/**
 * labourHome.js — Labour Attendance, the landing screen of the Labour module:
 * date ‹ › · search · Present / Absent / Half Day / To Pay · one card per worker
 * with P · A · H · OT buttons that save on tap · + Labour Options sheet.
 * Tapping a worker opens their payments & attendance panel (labourWorker.js).
 * Older screens (monthly sheet, labour list, contractors, piece-rate) open as
 * sections from the Options sheet. Attendance rules live in labourCalc.js.
 */
import { state, saveLabourData, keepOnly } from './state.js';
import * as LC from './labourCalc.js';
import './labourWorker.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cur = () => (typeof window.getCurrencySymbol === 'function' ? window.getCurrencySymbol() : '₹');
const money = (n) => cur() + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const workers = () => (typeof window._projectLabourList === 'function' ? window._projectLabourList() : []) || [];
const toPay = (id) => { try { return window._labourNetPayable?.(id)?.net || 0; } catch { return 0; } };
const term = () => (typeof window.modeTerm === 'function' ? window.modeTerm('labour') : 'Labour') || 'Labour';

let _date = LC.todayISO();
let _q = '';
let _chip = 'all'; // all | P | A | H | none

const ico = {
  prev: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  next: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  cal: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  dots: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
  go: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
};

function persist() {
  try { saveLabourData(); } catch (e) { console.warn(e); }
  try { window.renderMonthlyMuster?.(); } catch {}
}

/** Tap P / A / H — saves straight away. */
function mark(labourId, status) {
  const logs = state.attendanceLogs || (state.attendanceLogs = []);
  const r = LC.markDay(logs, { labourId, date: _date, siteId: state.currentProjectId || 'site', status });
  if (r.remove) keepOnly('attendanceLogs', a => a !== r.remove);
  persist();
  renderLabourHome();
}

function setOT(labourId, hours) {
  const logs = state.attendanceLogs || (state.attendanceLogs = []);
  LC.markDay(logs, { labourId, date: _date, siteId: state.currentProjectId || 'site', ot: hours });
  persist();
  renderLabourHome();
}

function otSheet(labourId) {
  const l = workers().find(w => w.id === labourId);
  const curOT = LC.dayLog(state.attendanceLogs, labourId, _date)?.ot || 0;
  const opts = [0, 1, 2, 3, 4, 6, 8].map(h => ({
    icon: h ? '⏱️' : '✖️', title: h ? `${h} hour${h > 1 ? 's' : ''} overtime` : 'No overtime',
    desc: h === curOT ? 'Current' : '', run: () => setOT(labourId, h),
  }));
  opts.push({ icon: '✏️', title: 'Other…', desc: 'Type the hours', run: () => {
    const v = prompt('Overtime hours', curOT || '');
    if (v !== null) setOT(labourId, parseFloat(v) || 0);
  } });
  window.shellSheet?.(`Overtime — ${l ? l.name : ''}`, opts);
}

function workerMenu(labourId) {
  const l = workers().find(w => w.id === labourId);
  if (!l) return;
  window.shellSheet?.(l.name || 'Worker', [
    { icon: '💳', title: 'Payments & attendance', desc: 'Amount paid, wages and days — filter by month', run: () => window.openLabourWorkerPanel?.(labourId) },
    { icon: '📒', title: 'Full party ledger', desc: 'Every entry for this worker across projects', run: () => openLedger(labourId) },
    { icon: '💸', title: 'Pay', desc: 'Record a payment to this worker', run: () => window.openLabourPaymentModal?.(labourId) },
    { icon: '🪙', title: 'Advance (kharchi)', desc: 'Cash given before wages', run: () => window._recordAdvance?.() },
    { icon: '📋', title: 'Muster card (this month)', desc: 'Attendance + total paid, as PDF', run: () => window.exportLabourMusterCard?.(labourId, ...monthBounds()) },
    { icon: '✏️', title: 'Edit details', desc: 'Name, trade, day rate, documents', run: () => window.openLabourModal?.(labourId) },
    { icon: '🗑️', title: 'Delete', desc: 'Remove this worker', danger: true, run: () => { window.deleteLabour?.(labourId); renderLabourHome(); } },
  ]);
}

/** First and last day of the month being viewed on the attendance screen. */
function monthBounds() {
  const r = LC.periodRange('month', {}, _date);
  return [r.from, r.to];
}

function openLedger(labourId) {
  window.switchView?.('partiesLedgerView');
  window.openPartyDetail?.(labourId, 'Labour');
}

function markAll(status) {
  const ws = filtered();
  if (!ws.length) return;
  const logs = state.attendanceLogs || (state.attendanceLogs = []);
  ws.forEach(w => {
    const ex = LC.dayLog(logs, w.id, _date);
    if (ex && ex.status === status) return;
    LC.markDay(logs, { labourId: w.id, date: _date, siteId: state.currentProjectId || 'site', status });
  });
  persist();
  renderLabourHome();
  window.showToast?.(`Marked ${ws.length} as ${LC.STATUS_LABEL[status]}`, 'success');
}

function optionsSheet() {
  const T = term();
  window.shellSheet?.(`${T} Options`, [
    { icon: '➕', title: `Add New ${T}`, desc: `Create a new ${T.toLowerCase()} record for this project`, run: () => window.openLabourModal?.() },
    { icon: '✅', title: 'Mark all present', desc: `Everyone in the list for ${LC.dayLabel(_date)}`, run: () => markAll('P') },
    { icon: '📋', title: 'Muster card for the month', desc: 'One worker — attendance + total paid (PDF)', run: () => musterPicker() },
    { icon: '🗓️', title: 'Monthly attendance sheet', desc: 'Days present, half days & wages per worker', run: () => window._openLabourSection?.('sheet') },
    { icon: '👥', title: `All ${T} list`, desc: 'Details, rates, documents & PPE', run: () => window._openLabourSection?.('master') },
    { icon: '🧑‍🔧', title: 'Contractors / gangs', desc: 'Mukadam & gang payouts', run: () => window._openLabourSection?.('contractors') },
    { icon: '📏', title: 'Piece-rate work', desc: 'Rate card, measure & payout', run: () => window._openLabourSection?.('piecerate') },
    { icon: '💰', title: `Pay multiple ${T.toLowerCase()}`, desc: 'Bulk wage payment', run: () => window._bulkLabourPayment?.() },
    { icon: '🪙', title: 'Advance (kharchi)', desc: 'Mid-week cash advance', run: () => window._recordAdvance?.() },
    { icon: '➖', title: 'Deduction', desc: 'Lost tools, PPE, penalty', run: () => window._recordDeduction?.() },
    { icon: '🦺', title: 'Issue PPE', desc: 'Helmet, shoes, jacket…', run: () => window._issuePPE?.() },
    { icon: '🤝', title: 'Final settlement', desc: 'Settle and close a worker', run: () => window._finalSettlement?.() },
    { icon: '👷', title: 'Headcount report', desc: `Trade-wise headcount for ${LC.dayLabel(_date)}`, run: () => {
      const d = document.getElementById('attDate'); if (d) d.value = _date; window._dailyMusterRoll?.();
    } },
  ]);
}

/** Pick a worker, then export their muster card for the viewed month. */
function musterPicker() {
  const [from, to] = monthBounds();
  const ws = workers();
  if (!ws.length) { window.showToast?.('No workers yet', 'error'); return; }
  window.shellSheet?.(`Muster card — ${LC.dayLabel(from).replace(/^.*?, \d+ /, '')}`, ws.map(w => ({
    icon: '👷', title: w.name || 'Worker', desc: w.trade || '', run: () => window.exportLabourMusterCard?.(w.id, from, to),
  })));
}

function filtered() {
  const q = _q.trim().toLowerCase();
  return workers().filter(w => {
    if (q && ![w.name, w.trade, w.phone, w.labourCode].some(v => String(v || '').toLowerCase().includes(q))) return false;
    return _chip === 'all' || LC.dayState(state.attendanceLogs, w.id, _date) === _chip;
  });
}

export function renderLabourHome() {
  const host = document.getElementById('labourHome');
  if (!host) return;
  const all = workers();
  const T = term();
  const sum = LC.daySummary(state.attendanceLogs, all.map(w => w.id), _date);
  const due = all.reduce((s, w) => s + Math.max(0, toPay(w.id)), 0);
  const list = filtered();
  const chips = [['all', 'All', all.length], ['P', 'Present', sum.P], ['A', 'Absent', sum.A], ['H', 'Half Day', sum.H], ['none', 'Not marked', sum.unmarked]]
    .map(([k, l, n]) => `<button type="button" class="ts-chip ${_chip === k ? 'on' : ''}" onclick="window._labChip('${k}')">${l}<b>${n}</b></button>`).join('');
  const cards = list.map(w => {
    const log = LC.dayLog(state.attendanceLogs, w.id, _date);
    const st = log ? log.status : '';
    const ot = log && log.ot > 0 ? log.ot : 0;
    const pay = toPay(w.id);
    const av = w.photo ? `<img src="${esc(w.photo)}" alt="">` : esc((w.name || '?').trim().charAt(0).toUpperCase());
    return `<div class="lab-card">
      <div class="lab-top">
        <div class="lab-av">${av}</div>
        <div class="lab-meta">
          <button type="button" class="lab-name" onclick="window._labWorker('${esc(w.id)}')">${esc(w.name || 'Worker')} ${ico.go}</button>
          <div class="lab-trade">${esc(w.trade || T)}${w.dayRate ? ` · ${money(w.dayRate).replace(/\.00$/, '')}/day` : ''}</div>
        </div>
        <div class="lab-pay" role="button" tabindex="0" onclick="window._labWorker('${esc(w.id)}')"><b class="${pay > 0 ? 'due' : ''}">${money(pay)}</b><small>${pay < 0 ? 'Advance' : 'To Pay'}</small></div>
        <button type="button" class="ts-kebab" onclick="window._labMenu('${esc(w.id)}')" aria-label="Worker options">${ico.dots}</button>
      </div>
      <div class="lab-btns" role="group" aria-label="Attendance">
        <button type="button" class="lab-b p ${st === 'P' ? 'on' : ''}" onclick="window._labMark('${esc(w.id)}','P')" aria-pressed="${st === 'P'}">P</button>
        <button type="button" class="lab-b a ${st === 'A' ? 'on' : ''}" onclick="window._labMark('${esc(w.id)}','A')" aria-pressed="${st === 'A'}">A</button>
        <button type="button" class="lab-b h ${st === 'H' ? 'on' : ''}" onclick="window._labMark('${esc(w.id)}','H')" aria-pressed="${st === 'H'}">H</button>
        <button type="button" class="lab-b ot ${ot ? 'on' : ''}" onclick="window._labOT('${esc(w.id)}')">${ot ? `OT ${ot}h` : 'OT'}</button>
      </div>
    </div>`;
  }).join('');
  const empty = !all.length
    ? `<div class="ts-empty"><div class="ts-emo" data-keep-emoji>👷</div><h3>No ${esc(T.toLowerCase())} yet</h3>
        <p style="margin-bottom:18px">Add your workers once — then mark attendance with one tap a day.</p>
        <button type="button" class="ts-btn" onclick="window.openLabourModal&&window.openLabourModal()">+ Add New ${esc(T)}</button></div>`
    : `<div class="ts-empty"><div class="ts-emo" data-keep-emoji>🔍</div><h3>No entry found</h3><p>Try another name or filter.</p></div>`;
  const keepFocus = document.activeElement && document.activeElement.id === 'labSearch';
  host.innerHTML = `<div class="ts-page lab">
    <div class="lab-date">
      <button type="button" class="lab-dnav" onclick="window._labDay(-1)" aria-label="Previous day">${ico.prev}</button>
      <label class="lab-dlbl">${ico.cal}<span>${esc(LC.dayLabel(_date))}</span>
        <input type="date" value="${_date}" max="${LC.todayISO()}" onchange="window._labSetDate(this.value)" aria-label="Pick date"></label>
      <button type="button" class="lab-dnav" onclick="window._labDay(1)" aria-label="Next day" ${_date >= LC.todayISO() ? 'disabled' : ''}>${ico.next}</button>
    </div>
    <div class="ts-search" style="margin-top:12px">${ico.search}<input id="labSearch" type="search" placeholder="Search ${esc(T.toLowerCase())}" value="${esc(_q)}" oninput="window._labSearch(this.value)" autocomplete="off"></div>
    <div class="lab-sum">
      <div><b style="color:#15803d">${sum.P}</b><small>Present</small></div>
      <div><b style="color:#d92d20">${sum.A}</b><small>Absent</small></div>
      <div><b style="color:#4b5563">${sum.H}</b><small>Half Day</small></div>
      <div><b style="color:var(--ts-blue)">${money(due).replace(/\.00$/, '')}</b><small>To Pay</small></div>
    </div>
    ${all.length ? `<div class="ts-chips" style="padding-top:2px">${chips}</div>` : ''}
    ${list.length ? `<div class="lab-list">${cards}</div>` : empty}
  </div>`;
  if (keepFocus) { const i = document.getElementById('labSearch'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}

if (typeof window !== 'undefined') {
  window.renderLabourHome = renderLabourHome;
  window._labMark = mark;
  window._labOT = otSheet;
  window._labMenu = workerMenu;
  window._labLedger = openLedger;
  window._labWorker = (id) => window.openLabourWorkerPanel?.(id);
  window._labChip = (c) => { _chip = c; renderLabourHome(); };
  window._labSearch = (q) => { _q = q; renderLabourHome(); };
  window._labDay = (d) => { const n = LC.shiftDate(_date, d); if (n <= LC.todayISO()) { _date = n; renderLabourHome(); } };
  window._labSetDate = (v) => { if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { _date = v > LC.todayISO() ? LC.todayISO() : v; renderLabourHome(); } };
  window.labourOptionsSheet = optionsSheet;
}
