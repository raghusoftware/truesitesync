/**
 * pieceRate.js — Piece-Rate Labour Billing (Labour → Piece-Rate Work).
 *
 *   Work Orders  a labour group + BOQ items at agreed rates (₹20 / sqft plaster), with an
 *                optional labour budget per unit for the cost report
 *   Daily Logs   who did what, captured in the DPR ("Done by" on each measurement row) or
 *                entered here; one log per row, linked to the BOQ item and the work-order line
 *   Labour Bills the period's unbilled logs for a group → one line per item (qty × rate);
 *                approve → it is a payable (Cash Forecast); paying via Payments / Petty Cash
 *                settles it (oldest bill first, or the bill named in the payment reference)
 *   BOQ Cost     "BOQ Labour Cost Analysis" — per BOQ item: scope & budget, done, groups,
 *                labour cost, paid, variance — on screen and as a PDF
 *
 * Rules live in pieceRateCalc.js (pure, tested).
 */
import { state, saveAllData, keepOnly } from './state.js';
import { showToast, getCurrencySymbol, getPdfCurrency, getCompanyHeaderForPDF, mobileSavePDF } from './utils.js';
import { openFormModal, closeFormModal, FS_INPUT, FS_LABEL } from './formHelpers.js';
import { rateFor, priceLogs, unbilledLogs, draftBillLines, billSettlement, boqLabourReport, reportTotals } from './pieceRateCalc.js?v=1.0.0';
import { nextPayDay, addDays } from './cashForecast.js?v=2.0.1';

const N = v => parseFloat(v) || 0;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => (N(v) < 0 ? '−' : '') + getCurrencySymbol() + Math.round(Math.abs(N(v))).toLocaleString('en-IN');
const qtyF = v => (Math.round(N(v) * 1000) / 1000).toLocaleString('en-IN');
const today = () => new Date().toISOString().slice(0, 10);
const pid = () => state.currentProjectId || null;
const proj = () => (state.projects || []).find(p => p.id === pid()) || {};
const arr = k => (state[k] || (state[k] = []));
const mine = k => arr(k).filter(x => x.projectId === pid());
const gangs = () => (state.labourContractors || []).filter(c => !c.projectId || c.projectId === pid());
const gangName = id => (state.labourContractors || []).find(g => g.id === id)?.name || 'Labour group';
const payDay = () => (state.cashFlowSettings?.labourPayDay != null ? N(state.cashFlowSettings.labourPayDay) : 6);
const who = () => { try { const u = window.getCurrentUser?.(); return u?.name || u?.email || 'Engineer'; } catch { return 'Engineer'; } };

/** BOQ items of the current project: { code, description, uom, qty, rate }. */
export function boqItems() {
  const out = [], seen = new Set();
  (proj().boqs || []).forEach(g => (g.items || []).forEach(it => {
    const code = it.code || it.itemNo; if (!code || seen.has(code)) return; seen.add(code);
    out.push({ code, description: it.description || it.name || code, uom: it.uom || it.unit || '', qty: N(it.qty || it.quantity), rate: N(it.rate) });
  }));
  return out;
}
const budgets = () => proj().labourBudget || {};
const rates = () => mine('workItemRates');
const logs = () => priceLogs(mine('workMeasurements'), rates());
const nextNo = (list, key, prefix) => prefix + String(list.reduce((m, x) => Math.max(m, parseInt(String(x[key] || '').replace(/\D/g, ''), 10) || 0), 0) + 1).padStart(3, '0');

let _tab = 'orders';
const TABS = [['orders', '📋 Work Orders'], ['logs', '📏 Daily Logs'], ['bills', '🧾 Labour Bills'], ['report', '📊 BOQ Cost']];

window._prTab = function (tab) {
  _tab = { rates: 'orders', measure: 'logs', approve: 'bills', payout: 'bills' }[tab] || tab || 'orders';
  const host = document.getElementById('labourSecPiecerate'); if (!host) return;
  const body = _tab === 'logs' ? _logsView() : _tab === 'bills' ? _billsView() : _tab === 'report' ? _reportView() : _ordersView();
  host.innerHTML = `<div class="prw">
    <div class="prw-tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${_tab === k}" class="${_tab === k ? 'on' : ''}" onclick="window._prTab('${k}')">${l}</button>`).join('')}</div>
    ${body}</div>`;
};
const rerender = () => { if (document.getElementById('labourSecPiecerate')?.offsetParent) window._prTab(_tab); };

// ── Work Orders ──────────────────────────────────────────────────────────────
function _ordersView() {
  const rs = rates(), lg = logs(), bud = budgets();
  const doneBy = {}; lg.forEach(m => { doneBy[m.rateId] = (doneBy[m.rateId] || 0) + N(m.quantity); });
  const groups = {};
  rs.forEach(r => { (groups[r.gangId || ''] = groups[r.gangId || ''] || []).push(r); });
  const card = (gid, list) => `<section class="prw-card">
    <header><div><b>${gid ? esc(gangName(gid)) : 'Any group (general rates)'}</b><small>${[...new Set(list.map(r => r.woNo).filter(Boolean))].join(', ') || 'Rate card'}</small></div>
      ${gid ? `<button type="button" class="prw-btn sm" onclick="window._prWoForm('${gid}')">+ Item</button>` : ''}</header>
    <div class="prw-rows">${list.map(r => {
      const code = r.boqCode || r.itemCode || '', done = doneBy[r.id] || 0;
      return `<div class="prw-row${r.status === 'closed' ? ' off' : ''}">
        <div class="prw-main"><b>${esc(code)}</b> ${esc(r.workCategory || '')}<small>${money(r.rate)} / ${esc(r.uom)}${bud[code] ? ` · budget ${money(bud[code])} / ${esc(r.uom)}` : ''}${N(r.scopeQty) ? ` · scope ${qtyF(r.scopeQty)}` : ''}${r.status === 'closed' ? ' · closed' : ''}</small></div>
        <div class="prw-num"><b>${qtyF(done)} ${esc(r.uom)}</b><small>${money(done * N(r.rate))}</small></div>
        <button type="button" class="prw-icon" aria-label="More" onclick="window._prWoMenu('${r.id}')">⋯</button>
      </div>`;
    }).join('')}</div></section>`;
  const order = Object.keys(groups).sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || gangName(a).localeCompare(gangName(b)));
  return `<div class="prw-bar"><p>Give a labour group BOQ items at an agreed rate. Work they do is then tagged in the Daily Progress Report.</p>
      <button type="button" class="prw-btn" onclick="window._prWoForm()">+ New work order</button></div>
    ${order.map(g => card(g, groups[g])).join('') || `<div class="prw-empty"><b>No work orders yet</b><span>Create one: pick a labour group, pull items from the BOQ, set the rate per unit.</span></div>`}`;
}

window._prWoForm = function (gangId) {
  const boq = boqItems();
  if (!boq.length) { showToast('This project has no BOQ items yet — add the BOQ first', 'error'); return; }
  const gs = gangs();
  const gangSel = `<select id="prwGang" style="${FS_INPUT}"><option value="">— Select labour group —</option>${gs.map(g => `<option value="${g.id}" ${g.id === gangId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>`;
  openFormModal('Labour work order', `
    <div><label style="${FS_LABEL}">Labour group / petty contractor <span style="color:#dc2626">*</span></label>
      <div style="display:flex;gap:8px;">${gangSel}<button type="button" class="prw-btn ghost" onclick="window._prQuickGang()">+ New</button></div></div>
    <div><label style="${FS_LABEL}">BOQ items and agreed labour rates</label>
      <div id="prwLines">${_woLine(boq)}</div>
      <button type="button" class="prw-btn ghost" style="margin-top:8px" onclick="document.getElementById('prwLines').insertAdjacentHTML('beforeend', window._prWoLine())">+ Add BOQ item</button>
      <p class="prw-hint">Labour budget / unit is your estimate's labour allowance for the item. It drives the profit / loss column of the BOQ cost report.</p></div>`,
    { grid: 1, width: 640, onSave: 'window._prWoSave()', saveLabel: 'Save work order' });
};
function _woLine(boq) {
  boq = boq || boqItems();
  const bud = budgets();
  return `<div class="prw-line">
    <select class="wl-boq" style="${FS_INPUT}" onchange="window._prWoPick(this)"><option value="">— BOQ item —</option>${boq.map(b => `<option value="${esc(b.code)}" data-uom="${esc(b.uom)}" data-budget="${N(bud[b.code]) || ''}" data-qty="${b.qty}">${esc(b.code)} — ${esc(b.description)} (${qtyF(b.qty)} ${esc(b.uom)})</option>`).join('')}</select>
    <div class="prw-line-nums">
      <label>Rate / <span class="wl-uom">unit</span><input class="wl-rate" type="number" inputmode="decimal" min="0" step="any" style="${FS_INPUT}"></label>
      <label>Scope qty<input class="wl-scope" type="number" inputmode="decimal" min="0" step="any" placeholder="optional" style="${FS_INPUT}"></label>
      <label>Labour budget / unit<input class="wl-budget" type="number" inputmode="decimal" min="0" step="any" placeholder="optional" style="${FS_INPUT}"></label>
      <button type="button" class="prw-icon" aria-label="Remove item" onclick="this.closest('.prw-line').remove()">✕</button>
    </div></div>`;
}
window._prWoLine = () => _woLine();
window._prWoPick = function (sel) {
  const o = sel.selectedOptions[0], line = sel.closest('.prw-line');
  line.querySelector('.wl-uom').textContent = o?.dataset.uom || 'unit';
  const b = line.querySelector('.wl-budget'); if (b && !b.value && o?.dataset.budget) b.value = o.dataset.budget;
};
window._prQuickGang = function () {
  const name = prompt('Labour group / petty contractor name:'); if (!name || !name.trim()) return;
  const phone = prompt('Phone (optional):') || '';
  const g = { id: 'ctr_' + Date.now(), name: name.trim(), phone: phone.trim(), projectId: pid() };
  arr('labourContractors').push(g); saveAllData();
  const sel = document.getElementById('prwGang');
  if (sel) { sel.insertAdjacentHTML('beforeend', `<option value="${g.id}">${esc(g.name)}</option>`); sel.value = g.id; }
};
window._prWoSave = function () {
  const gangId = document.getElementById('prwGang')?.value;
  if (!gangId) { showToast('Pick the labour group', 'error'); return; }
  const lines = [...document.querySelectorAll('#prwLines .prw-line')].map(l => {
    const sel = l.querySelector('.wl-boq'), o = sel.selectedOptions[0];
    return { code: sel.value, desc: (o?.textContent || '').split(' — ').slice(1).join(' — ').replace(/ \([^)]*\)$/, ''), uom: o?.dataset.uom || '', rate: N(l.querySelector('.wl-rate').value), scope: N(l.querySelector('.wl-scope').value), budget: l.querySelector('.wl-budget').value };
  }).filter(x => x.code);
  if (!lines.length) { showToast('Add at least one BOQ item', 'error'); return; }
  if (lines.some(x => !(x.rate > 0))) { showToast('Enter the agreed rate for every item', 'error'); return; }
  const woNo = nextNo(rates(), 'woNo', 'LWO-');
  const p = proj(); if (!p.labourBudget) p.labourBudget = {};
  lines.forEach(x => {
    // One active line per group + item: a new rate closes the old one (logs keep their own rate).
    rates().filter(r => r.gangId === gangId && (r.boqCode || r.itemCode) === x.code && r.status !== 'closed').forEach(r => { r.status = 'closed'; r.closedAt = today(); });
    arr('workItemRates').push(window.stampCreate({ id: 'rate_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), woNo, gangId, boqCode: x.code, itemCode: x.code, workCategory: x.desc, uom: x.uom, rate: x.rate, scopeQty: x.scope || null, status: 'active', date: today(), projectId: pid() }));
    if (x.budget !== '') p.labourBudget[x.code] = N(x.budget);
  });
  saveAllData(); closeFormModal(); showToast(`${woNo} saved — ${lines.length} item${lines.length === 1 ? '' : 's'} for ${gangName(gangId)}`, 'success'); rerender();
};
window._prWoMenu = function (id) {
  const r = rates().find(x => x.id === id); if (!r) return;
  const used = mine('workMeasurements').some(m => m.rateId === id);
  openFormModal(esc((r.boqCode || r.itemCode || '') + ' · ' + (r.workCategory || '')), `
    <p class="prw-hint" style="margin:0">${r.gangId ? esc(gangName(r.gangId)) + ' · ' : ''}${money(r.rate)} / ${esc(r.uom)}${r.woNo ? ' · ' + esc(r.woNo) : ''}${r.status === 'closed' ? ' · closed' : ''}</p>
    <button type="button" class="prw-btn ghost" onclick="window._prWoAct('${id}','toggle')">${r.status === 'closed' ? 'Reopen this rate' : 'Close this rate (no new work)'}</button>
    ${used ? '<p class="prw-hint" style="margin:0">Work is logged at this rate, so it can be closed but not deleted.</p>' : `<button type="button" class="prw-btn ghost danger" onclick="window._prWoAct('${id}','delete')">Delete this rate</button>`}`,
    { grid: 1, width: 420 });
};
window._prWoAct = function (id, what) {
  const r = rates().find(x => x.id === id); if (!r) return;
  if (what === 'toggle') r.status = r.status === 'closed' ? 'active' : 'closed';
  else if (what === 'delete' && !mine('workMeasurements').some(m => m.rateId === id)) keepOnly('workItemRates', x => x.id !== id);
  saveAllData(); closeFormModal(); rerender();
};

// ── Daily Logs ───────────────────────────────────────────────────────────────
function _logsView() {
  const lg = logs().slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const rById = {}; rates().forEach(r => { rById[r.id] = r; });
  const billNo = id => mine('labourBills').find(b => b.id === id)?.billNo || '';
  const byDate = {}; lg.forEach(m => { (byDate[m.date] = byDate[m.date] || []).push(m); });
  const dprNo = id => (state.dailyProgress || []).find(d => d.id === id)?.dprNum || 'DPR';
  const rows = Object.entries(byDate).slice(0, 60).map(([d, list]) => `<div class="prw-day"><div class="prw-day-h">${esc(d)}</div>${list.map(m => {
    const r = rById[m.rateId];
    return `<div class="prw-row">
      <div class="prw-main"><b>${esc(gangName(m.gangId))}</b> · ${esc(m.boqCode || r?.boqCode || '')} ${esc(r?.workCategory || '')}
        <small>${m.src === 'dpr' ? `From ${esc(dprNo(m.dprId))}` : 'Entered here'}${m.location ? ' · ' + esc(m.location) : ''}${r ? '' : ' · <em class="warn">no rate for this group — add a work order</em>'}</small></div>
      <div class="prw-num"><b>${qtyF(m.quantity)} ${esc(r?.uom || '')}</b><small>${r ? money(N(m.quantity) * N(r.rate)) : '—'}</small></div>
      <span class="prw-chip ${m.billId ? 'ok' : m.paid ? 'ok' : ''}">${m.billId ? esc(billNo(m.billId)) : m.paid ? 'Paid' : 'Unbilled'}</span>
      ${!m.billId && !m.paid && m.src !== 'dpr' ? `<button type="button" class="prw-icon" aria-label="Delete" onclick="window._prDelLog('${m.id}')">✕</button>` : ''}
    </div>`;
  }).join('')}</div>`).join('');
  return `<div class="prw-bar"><p>Every row of work a labour group did. Most come from the Daily Progress Report ("Done by" on each measurement row).</p>
      <button type="button" class="prw-btn" onclick="window._prLogForm()">+ Log work</button></div>
    ${rows || `<div class="prw-empty"><b>No work logged yet</b><span>In the DPR, pick who did each measurement row — it appears here, ready to bill.</span></div>`}`;
}
window._prLogForm = function () {
  const gs = gangs(); if (!gs.length) { showToast('Add a labour group first (Work Orders → New work order)', 'error'); return; }
  const boq = boqItems();
  openFormModal('Log piece-rate work', `
    <div><label style="${FS_LABEL}">Date</label><input id="prlDate" type="date" value="${today()}" style="${FS_INPUT}"></div>
    <div><label style="${FS_LABEL}">Done by <span style="color:#dc2626">*</span></label><select id="prlGang" style="${FS_INPUT}"><option value="">— Labour group —</option>${gs.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></div>
    <div style="grid-column:1/-1"><label style="${FS_LABEL}">BOQ item <span style="color:#dc2626">*</span></label><select id="prlBoq" style="${FS_INPUT}"><option value="">— BOQ item —</option>${boq.map(b => `<option value="${esc(b.code)}">${esc(b.code)} — ${esc(b.description)} (${esc(b.uom)})</option>`).join('')}</select></div>
    <div><label style="${FS_LABEL}">Quantity <span style="color:#dc2626">*</span></label><input id="prlQty" type="number" inputmode="decimal" min="0" step="any" style="${FS_INPUT}"></div>
    <div><label style="${FS_LABEL}">Location</label><input id="prlLoc" placeholder="e.g. 2nd floor, Flat 203" style="${FS_INPUT}"></div>`,
    { grid: 2, width: 560, onSave: 'window._prLogSave()', saveLabel: 'Save' });
};
window._prLogSave = function () {
  const v = id => (document.getElementById(id)?.value || '').trim();
  const gangId = v('prlGang'), boqCode = v('prlBoq'), quantity = N(v('prlQty'));
  if (!gangId || !boqCode || !(quantity > 0)) { showToast('Pick the group, the BOQ item and a quantity', 'error'); return; }
  const r = rateFor(rates(), gangId, boqCode);
  arr('workMeasurements').push(window.stampCreate({ id: 'meas_' + Date.now(), date: v('prlDate') || today(), gangId, boqCode, rateId: r?.id || '', quantity, location: v('prlLoc'), src: 'manual', approved: false, projectId: pid() }));
  saveAllData(); closeFormModal();
  showToast(r ? `Logged ${qtyF(quantity)} ${r.uom} = ${money(quantity * N(r.rate))}` : `Logged — ${gangName(gangId)} has no rate for ${boqCode} yet; add it to a work order`, r ? 'success' : 'warning');
  rerender();
};
window._prDelLog = function (id) { if (!confirm('Delete this work log?')) return; keepOnly('workMeasurements', m => m.id !== id); saveAllData(); rerender(); };

/**
 * DPR hook: sync one DPR's "Done by" rows into labour logs. Billed logs are never changed;
 * unbilled ones follow the DPR (edit / remove). Returns ids kept, and rows that have no rate.
 * @param {string} dprId @param {string} date
 * @param {Array<{ gangId, code, qty, location, labourLogId? }>} rows
 */
window.prSyncDprLogs = function (dprId, date, rows) {
  const list = arr('workMeasurements');
  const keep = new Set(); let unpriced = 0, locked = 0;
  rows.filter(r => r.gangId && r.code && !String(r.code).startsWith('NB:') && N(r.qty) > 0).forEach(r => {
    const rate = rateFor(rates(), r.gangId, r.code);
    if (!rate) unpriced++;
    let m = r.labourLogId && list.find(x => x.id === r.labourLogId);
    if (m && m.billId) { keep.add(m.id); if (N(m.quantity) !== N(r.qty) || m.gangId !== r.gangId) locked++; return; }
    if (!m) { m = window.stampCreate({ id: 'meas_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), src: 'dpr', dprId, approved: false, projectId: pid() }); list.push(m); }
    Object.assign(m, { date, gangId: r.gangId, boqCode: r.code, rateId: rate?.id || '', quantity: N(r.qty), location: r.location || '' });
    r.labourLogId = m.id; keep.add(m.id);
  });
  keepOnly('workMeasurements', x => !(x.dprId === dprId && x.src === 'dpr' && !x.billId && !keep.has(x.id)));
  if (unpriced) showToast(`${unpriced} row${unpriced === 1 ? '' : 's'} tagged to a group with no rate for that item — add it to a work order to bill`, 'warning');
  if (locked) showToast(`${locked} row${locked === 1 ? ' is' : 's are'} already on a labour bill — the bill keeps the original quantity`, 'warning');
};
/** Options for the DPR "Done by" picker. */
window.prGangOptions = (cur) => `<option value="">Own labour / not tagged</option>` + gangs().map(g => `<option value="${g.id}" ${g.id === cur ? 'selected' : ''}>${esc(g.name)}</option>`).join('');

// ── Labour Bills ─────────────────────────────────────────────────────────────
function _billsView() {
  const bills = mine('labourBills').slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.billNo).localeCompare(String(a.billNo)));
  const settled = {}; billSettlement(bills, state).forEach(b => { settled[b.id] = b; });
  const unbilled = {};
  logs().forEach(m => { if (!m.billId && !m.paid && m.rateId) { const r = rates().find(x => x.id === m.rateId); unbilled[m.gangId] = (unbilled[m.gangId] || 0) + N(m.quantity) * N(r?.rate); } });
  const ready = Object.entries(unbilled).filter(([, v]) => v > 0);
  const chip = b => {
    if (b.status === 'draft') return '<span class="prw-chip">Draft</span>';
    if (b.status === 'cancelled') return '<span class="prw-chip off">Cancelled</span>';
    const s = settled[b.id];
    return s?.state === 'paid' ? '<span class="prw-chip ok">Paid</span>' : s?.state === 'part' ? `<span class="prw-chip warn">Part paid · ${money(s.open)} due</span>` : `<span class="prw-chip warn">Approved · due ${esc(b.dueDate || '')}</span>`;
  };
  return `<div class="prw-bar"><p>Turn a group's logged work into a bill. Approved bills show in Cash Forecast; paying from Payments or Petty Cash settles them.</p>
      <button type="button" class="prw-btn" onclick="window._prBillForm()">+ Generate bill</button></div>
    ${ready.length ? `<div class="prw-ready">${ready.map(([g, v]) => `<button type="button" onclick="window._prBillForm('${g}')"><b>${esc(gangName(g))}</b><span>${money(v)} unbilled work</span></button>`).join('')}</div>` : ''}
    ${bills.map(b => `<section class="prw-card bill">
      <header><div><b>${esc(b.billNo)} · ${esc(gangName(b.gangId))}</b><small>${esc(b.from)} → ${esc(b.to)} · ${(b.lines || []).length} item${(b.lines || []).length === 1 ? '' : 's'}</small></div><div class="prw-amt">${money(b.gross)}</div></header>
      <div class="prw-bill-f">${chip(b)}<span class="prw-acts">
        ${b.status === 'draft' ? `<button type="button" class="prw-btn sm" onclick="window._prBillApprove('${b.id}')">Approve</button>` : ''}
        ${b.status === 'approved' && settled[b.id]?.open > 0 ? `<button type="button" class="prw-btn sm" onclick="window._prBillPay('${b.id}')">Pay ${money(settled[b.id].open)}</button>` : ''}
        <button type="button" class="prw-btn sm ghost" onclick="window._prBillPdf('${b.id}')">PDF</button>
        ${b.status !== 'cancelled' && !(settled[b.id]?.paid > 0) ? `<button type="button" class="prw-btn sm ghost" onclick="window._prBillCancel('${b.id}')">Cancel</button>` : ''}
      </span></div></section>`).join('') || `<div class="prw-empty"><b>No labour bills yet</b><span>Generate one from a group's logged work.</span></div>`}`;
}
window._prBillForm = function (gangId) {
  const gs = gangs(); if (!gs.length) { showToast('No labour groups yet', 'error'); return; }
  const last = gid => mine('labourBills').filter(b => b.gangId === gid && b.status !== 'cancelled').map(b => b.to).sort().pop();
  const from = gangId && last(gangId) ? addDays(last(gangId), 1) : addDays(today(), -6);
  openFormModal('Generate labour bill', `
    <div style="grid-column:1/-1"><label style="${FS_LABEL}">Labour group</label><select id="prbGang" style="${FS_INPUT}" onchange="window._prBillPreview()">${gs.map(g => `<option value="${g.id}" ${g.id === gangId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
    <div><label style="${FS_LABEL}">From</label><input id="prbFrom" type="date" value="${from}" style="${FS_INPUT}" onchange="window._prBillPreview()"></div>
    <div><label style="${FS_LABEL}">To</label><input id="prbTo" type="date" value="${today()}" style="${FS_INPUT}" onchange="window._prBillPreview()"></div>
    <div id="prbPreview" style="grid-column:1/-1"></div>`,
    { grid: 2, width: 620, onSave: 'window._prBillSave()', saveLabel: 'Approve bill' });
  window._prBillPreview();
};
function _billDraft() {
  const v = id => document.getElementById(id)?.value || '';
  const gangId = v('prbGang'), from = v('prbFrom'), to = v('prbTo');
  const pending = unbilledLogs(logs(), gangId, from, to);
  return { gangId, from, to, pending, lines: draftBillLines(pending, rates()), unpriced: pending.filter(m => !m.rateId) };
}
window._prBillPreview = function () {
  const d = _billDraft(), box = document.getElementById('prbPreview'); if (!box) return;
  const gross = d.lines.reduce((s, l) => s + l.amount, 0);
  box.innerHTML = d.lines.length ? `<table class="prw-table"><thead><tr><th>BOQ item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>
      ${d.lines.map(l => `<tr><td><b>${esc(l.boqCode)}</b> ${esc(l.description)}<small>${l.logIds.length} log${l.logIds.length === 1 ? '' : 's'}</small></td><td>${qtyF(l.qty)} ${esc(l.uom)}</td><td>${money(l.rate)}</td><td><b>${money(l.amount)}</b></td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="3">Bill total</td><td><b>${money(gross)}</b></td></tr></tfoot></table>
      ${d.unpriced.length ? `<p class="prw-hint warn">${d.unpriced.length} log${d.unpriced.length === 1 ? ' has' : 's have'} no rate for this group and ${d.unpriced.length === 1 ? 'is' : 'are'} left out — add the item to a work order.</p>` : ''}
      <p class="prw-hint">Approving makes it payable on ${esc(nextPayDay(today(), payDay()))} (your labour pay day) and locks these logs. <button type="button" class="prw-link" onclick="window._prBillSave(true)">Save as draft instead</button></p>`
    : `<div class="prw-empty"><b>Nothing to bill</b><span>No unbilled, priced work for this group in these dates.</span></div>`;
};
window._prBillSave = function (asDraft) {
  const d = _billDraft();
  if (!d.lines.length) { showToast('Nothing to bill in this period', 'error'); return; }
  const id = 'lb_' + Date.now();
  const bill = window.stampCreate({ id, billNo: nextNo(mine('labourBills'), 'billNo', 'LB-'), projectId: pid(), gangId: d.gangId, from: d.from, to: d.to, date: today(), status: 'draft',
    lines: d.lines.map(({ logIds, ...l }) => ({ ...l, logIds })), gross: Math.round(d.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100 });
  arr('labourBills').push(bill);
  const ids = new Set(d.lines.flatMap(l => l.logIds));
  arr('workMeasurements').forEach(m => { if (ids.has(m.id)) { m.billId = id; if (!m.rateId) m.rateId = d.pending.find(x => x.id === m.id)?.rateId || ''; } });
  if (!asDraft) _approve(bill);
  saveAllData(); closeFormModal();
  showToast(`${bill.billNo} ${asDraft ? 'saved as draft' : 'approved'} — ${money(bill.gross)}`, 'success'); _tab = 'bills'; rerender();
};
function _approve(b) {
  b.status = 'approved'; b.approvedBy = who(); b.approvedAt = new Date().toISOString(); b.dueDate = nextPayDay(today(), payDay());
  const ids = new Set((b.lines || []).flatMap(l => l.logIds || []));
  arr('workMeasurements').forEach(m => { if (ids.has(m.id)) { m.approved = true; m.approvedBy = b.approvedBy; m.approvedAt = b.approvedAt; } });
}
window._prBillApprove = function (id) { const b = mine('labourBills').find(x => x.id === id); if (!b) return; _approve(b); saveAllData(); showToast(`${b.billNo} approved — due ${b.dueDate}`, 'success'); rerender(); };
window._prBillCancel = function (id) {
  const b = mine('labourBills').find(x => x.id === id); if (!b || !confirm(`Cancel ${b.billNo}? Its work goes back to unbilled.`)) return;
  b.status = 'cancelled';
  arr('workMeasurements').forEach(m => { if (m.billId === id) { delete m.billId; m.approved = false; } });
  saveAllData(); rerender();
};
/** Pay through the Payments screen (account or petty cash), pre-filled with the group, amount and bill number. */
window._prBillPay = function (id) {
  const b = billSettlement(mine('labourBills'), state).find(x => x.id === id); if (!b) return;
  window._pmtStart?.('out', { payeeType: 'contractor', id: b.gangId });
  setTimeout(() => {
    const a = document.getElementById('pmtAmt'); if (a) { a.value = b.open; a.dispatchEvent(new Event('input', { bubbles: true })); }
    const r = document.getElementById('pmtRef'); if (r) r.value = b.billNo;
  }, 60);
};

// ── BOQ Labour Cost Analysis ─────────────────────────────────────────────────
function _report() {
  const measured = {};
  (state.sheets || []).filter(s => s.projectId === pid()).forEach(s => (s.entries || []).forEach(e => { if (e.code) measured[e.code] = (measured[e.code] || 0) + N(e.qty); }));
  const rows = boqLabourReport({ boq: boqItems(), rates: rates(), logs: logs(), bills: mine('labourBills'), S: state, budget: budgets(), measured, gangName });
  return { rows, t: reportTotals(rows) };
}
function _reportView() {
  const { rows, t } = _report();
  if (!rows.length) return `<div class="prw-empty"><b>No BOQ for this project</b><span>Add the BOQ, then work orders — labour cost per item shows here.</span></div>`;
  const vcls = v => (v == null ? '' : v < 0 ? 'neg' : 'pos');
  return `<div class="prw-bar"><p><b>BOQ Labour Cost Analysis</b> — labour paid per BOQ item against your labour budget.</p>
      <button type="button" class="prw-btn" onclick="window._prReportPdf()">⬇ PDF</button></div>
    <div class="prw-kpis">
      <div><span>Labour cost to date</span><b>${money(t.cost)}</b><small>work done × agreed rates</small></div>
      <div><span>Paid to labour</span><b>${money(t.paid)}</b><small>${money(t.billed)} billed</small></div>
      <div><span>Budget for work done</span><b>${money(t.budgetDone)}</b><small>${t.unbudgeted ? `${t.unbudgeted} item${t.unbudgeted === 1 ? '' : 's'} without a budget` : 'all items budgeted'}</small></div>
      <div><span>${t.variance >= 0 ? 'Labour saving' : 'Labour overrun'}</span><b class="${vcls(t.variance)}">${money(Math.abs(t.variance))}</b><small>budget − cost, budgeted items</small></div>
    </div>
    <div class="prw-scroll"><table class="prw-table rep"><thead><tr>
      <th>BOQ item</th><th>BOQ qty</th><th>Labour budget</th><th>Done</th><th>Labour groups</th><th>Labour cost</th><th>Paid</th><th>Variance</th></tr></thead><tbody>
      ${rows.map(r => `<tr>
        <td class="rep-item"><b>${esc(r.code)}</b> ${esc(r.description)}<small>BOQ value ${money(r.boqValue)}</small></td>
        <td data-l="BOQ qty">${qtyF(r.boqQty)} ${esc(r.uom)}</td>
        <td data-l="Labour budget"><label class="prw-bud">${getCurrencySymbol()}<input type="number" inputmode="decimal" min="0" step="any" value="${r.budgetRate || ''}" placeholder="—" aria-label="Labour budget per ${esc(r.uom)} for ${esc(r.code)}" onchange="window._prSetBudget('${esc(r.code)}', this.value)">/${esc(r.uom)}</label><small>${r.budget != null ? money(r.budget) + ' total' : 'set a rate'}</small></td>
        <td data-l="Done">${qtyF(r.done)} ${esc(r.uom)}<small>${r.pctDone != null ? r.pctDone + '% of BOQ' : ''}${r.untagged ? ` · ${qtyF(r.untagged)} measured, no group` : ''}</small></td>
        <td data-l="Labour groups">${r.gangs.map(g => `<div class="prw-g">${esc(g.name)} <small>${qtyF(g.qty)} @ ${money(g.rate)}</small></div>`).join('') || '<small>—</small>'}</td>
        <td data-l="Labour cost"><b>${money(r.cost)}</b>${r.avgRate ? `<small>${money(r.avgRate)} / ${esc(r.uom)}</small>` : ''}</td>
        <td data-l="Paid">${money(r.paid)}${r.billed > r.paid ? `<small>${money(r.billed - r.paid)} due</small>` : ''}</td>
        <td data-l="Variance" class="${vcls(r.variance)}">${r.variance == null ? '<small>no budget</small>' : `<b>${r.variance < 0 ? '−' : '+'}${money(Math.abs(r.variance))}</b><small>${r.variance < 0 ? 'loss' : 'profit'}</small>`}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="5" class="rep-item">Total</td><td data-l="Labour cost"><b>${money(t.cost)}</b></td><td data-l="Paid">${money(t.paid)}</td><td data-l="Variance" class="${vcls(t.variance)}"><b>${t.variance < 0 ? '−' : '+'}${money(Math.abs(t.variance))}</b></td></tr></tfoot></table></div>
    <p class="prw-hint">Variance = labour budget for the quantity done − labour cost of that quantity. "Measured, no group" is work in the measurement sheets that nobody was tagged for in the DPR.</p>`;
}
window._prSetBudget = function (code, v) {
  const p = proj(); if (!p.id) return;
  if (!p.labourBudget) p.labourBudget = {};
  if (v === '' || !(N(v) > 0)) delete p.labourBudget[code]; else p.labourBudget[code] = N(v);
  saveAllData(); rerender();
};

window._prReportPdf = function () {
  try {
    if (!window.jspdf?.jsPDF) return showToast('PDF library not loaded — refresh', 'error');
    const { rows, t } = _report(); const cur = getPdfCurrency();
    const m = v => (N(v) < 0 ? '-' : '') + cur + Math.round(Math.abs(N(v))).toLocaleString('en-IN');
    const doc = new window.jspdf.jsPDF('l', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth(), ml = 12;
    let y = getCompanyHeaderForPDF(doc);
    doc.setFillColor(23, 37, 84); doc.rect(ml, y, pw - ml * 2, 9, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('BOQ LABOUR COST ANALYSIS', pw / 2, y + 6, { align: 'center' });
    y += 13; doc.setTextColor(0); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Project: ${proj().name || '—'}    As on: ${today()}    Labour cost ${m(t.cost)} · Paid ${m(t.paid)} · Budget for work done ${m(t.budgetDone)} · Variance ${m(t.variance)}`, ml, y); y += 4;
    doc.autoTable({
      startY: y + 2, theme: 'grid', margin: { left: ml, right: ml },
      head: [['BOQ item', 'BOQ qty', 'BOQ value', 'Labour budget', 'Done', 'Labour groups', 'Labour cost', 'Paid', 'Variance']],
      body: rows.map(r => [`${r.code} ${r.description}`, `${qtyF(r.boqQty)} ${r.uom}`, m(r.boqValue), r.budget != null ? `${m(r.budget)}\n@ ${m(r.budgetRate)}/${r.uom}` : '—',
        `${qtyF(r.done)} ${r.uom}${r.pctDone != null ? `\n${r.pctDone}%` : ''}`, r.gangs.map(g => `${g.name}: ${qtyF(g.qty)} @ ${m(g.rate)}`).join('\n') || '—',
        m(r.cost), m(r.paid), r.variance == null ? 'no budget' : (r.variance < 0 ? 'Loss ' : 'Profit ') + m(Math.abs(r.variance))]),
      foot: [['Total', '', m(t.boqValue), m(t.budget), '', '', m(t.cost), m(t.paid), m(t.variance)]],
      styles: { fontSize: 8, cellPadding: 1.8, lineColor: [203, 213, 225], lineWidth: 0.1, valign: 'top' },
      headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
      footStyles: { fillColor: [255, 243, 234], textColor: [15, 23, 42], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 62 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { cellWidth: 52 }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
      didParseCell: d => { if (d.section === 'body' && d.column.index === 8) { const r = rows[d.row.index]; if (r && r.variance != null) d.cell.styles.textColor = r.variance < 0 ? [185, 28, 28] : [4, 120, 87]; } },
    });
    doc.setFontSize(7.5); doc.setTextColor(90);
    doc.text('Variance = labour budget for the quantity done - labour cost of that quantity (work done x agreed piece rates).', ml, doc.lastAutoTable.finalY + 6);
    mobileSavePDF(doc, `BOQ-Labour-Cost-${(proj().name || 'project').replace(/[\\/]/g, '-')}.pdf`);
  } catch (e) { console.error('BOQ labour PDF failed:', e); showToast('PDF error: ' + (e.message || e), 'error'); }
};

window._prBillPdf = function (id) {
  try {
    if (!window.jspdf?.jsPDF) return showToast('PDF library not loaded — refresh', 'error');
    const b = mine('labourBills').find(x => x.id === id); if (!b) return;
    const s = billSettlement([b], state)[0];
    const cur = getPdfCurrency(), m = v => cur + (Math.round(N(v) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const doc = new window.jspdf.jsPDF('p', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth(), ml = 14;
    let y = getCompanyHeaderForPDF(doc);
    doc.setFillColor(23, 37, 84); doc.rect(ml, y, pw - ml * 2, 9, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('LABOUR BILL (PIECE-RATE)', pw / 2, y + 6, { align: 'center' });
    y += 14; doc.setTextColor(0); doc.setFontSize(9);
    [[`Bill No: ${b.billNo}`, `Date: ${b.date}`], [`Labour group: ${gangName(b.gangId)}`, `Period: ${b.from} to ${b.to}`], [`Project: ${proj().name || '—'}`, `Status: ${b.status === 'approved' ? (s?.state === 'paid' ? 'Paid' : 'Approved') : b.status}`]]
      .forEach(([l, r]) => { doc.text(l, ml, y); doc.text(r, pw - ml, y, { align: 'right' }); y += 5; });
    doc.autoTable({
      startY: y + 2, theme: 'grid', margin: { left: ml, right: ml },
      head: [['BOQ item', 'Work', 'Qty', 'Unit', 'Rate', 'Amount']],
      body: (b.lines || []).map(l => [l.boqCode, l.description, qtyF(l.qty), l.uom, m(l.rate), m(l.amount)]),
      foot: [['', 'Total', '', '', '', m(b.gross)], ...(s && s.paid ? [['', 'Paid', '', '', '', m(s.paid)], ['', 'Balance due', '', '', '', m(s.open)]] : [])],
      styles: { fontSize: 9, cellPadding: 2, lineColor: [203, 213, 225], lineWidth: 0.1 },
      headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] }, footStyles: { fillColor: [255, 243, 234], textColor: [15, 23, 42] },
      columnStyles: { 2: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    });
    y = doc.lastAutoTable.finalY + 18;
    doc.setFontSize(8.5); doc.line(ml, y, ml + 60, y); doc.line(pw - ml - 60, y, pw - ml, y);
    doc.text(`Approved by${b.approvedBy ? ': ' + b.approvedBy : ''}`, ml, y + 4); doc.text('Received by (labour group)', pw - ml - 60, y + 4);
    mobileSavePDF(doc, `${b.billNo}-${gangName(b.gangId).replace(/[\\/]/g, '-')}.pdf`);
  } catch (e) { console.error('Labour bill PDF failed:', e); showToast('PDF error: ' + (e.message || e), 'error'); }
};

// Keep an open Piece-Rate screen current when data changes (a DPR saved, a payment recorded).
window.addEventListener('tss:data-saved', () => { if (!document.getElementById('tssFormModal')) rerender(); });
