/**
 * deductionsUI.js — shared "Deductions" section for payment forms.
 *
 * Drop-in for any Payment In / Payment Out form:
 *   html  = deductionsBlockHTML('pmtd', { direction: 'in' })
 *   initDeductions('pmtd', { cashInputId: 'pmtInAmt', direction: 'in', getState: () => state })
 *   const { deductions, gross, cash, billId, billRef, errors } = readDeductions('pmtd')
 *
 * The user can type the CASH received/paid (in the form's own amount field) or
 * the BILL amount (gross) here — the other is solved. Rows take % or ₹. Picking a
 * bill pre-fills the deductions saved on it (RA-bill retention / TDS / LD…).
 * All math lives in deductions.js (unit-tested).
 */
import {
  deductionTypes, findType, computeDeductions, validateDeductions,
  normalizeDeductions, buildSettlementRemark,
} from './deductions.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const money = (n) => '₹' + (Math.round(_num(n) * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const QUICK = [
  ['tds', 'TDS'], ['ld_penalty', 'Penalty'], ['retention', 'Retention'], ['advance_recovery', 'Recovery'], ['other', 'Other'],
];

const _w = {}; // widget state by prefix
let _rid = 0;

const CSS = `
.ded{--ded-ink:#1f2937;--ded-mut:#6b7280;--ded-line:#e5e7eb;--ded-acc:#c2410c;--ded-tint:#fff4ec;--ded-bg:#fff;
  border:1.5px dashed #f3c6a5;border-radius:16px;background:var(--ded-bg);font-family:inherit;color:var(--ded-ink)}
.ded *{box-sizing:border-box}
.ded-head{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;background:none;border:0;padding:14px 14px;cursor:pointer;font:inherit;color:inherit;text-align:left}
.ded-head b{font-size:14px;font-weight:800}
.ded-head small{display:block;font-size:11.5px;color:var(--ded-mut);font-weight:500;margin-top:2px}
.ded-pill{flex:0 0 auto;font-size:12px;font-weight:800;color:var(--ded-acc);background:var(--ded-tint);border-radius:999px;padding:5px 11px;white-space:nowrap}
.ded-body{display:none;padding:0 14px 14px}
.ded.open{border-style:solid;border-color:#f0b48a}
.ded.open .ded-body{display:block}
.ded-lbl{display:block;font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ded-mut);margin:0 0 6px}
.ded .ded-in,.ded .ded-sel{width:100%;margin:0;font:inherit;font-size:14px;color:var(--ded-ink);background:#fff;border:1.5px solid var(--ded-line);border-radius:11px;padding:10px 11px;outline:none;-webkit-appearance:none;appearance:none}
.ded .ded-in:focus,.ded .ded-sel:focus{border-color:var(--ded-acc);box-shadow:0 0 0 3px var(--ded-tint)}
.ded-top{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
.ded-chips{display:flex;flex-wrap:wrap;gap:7px;margin:2px 0 12px}
.ded-chip{border:1.5px solid var(--ded-line);background:#fff;border-radius:999px;padding:7px 12px;font:inherit;font-size:12.5px;font-weight:700;color:var(--ded-ink);cursor:pointer}
.ded-chip:hover{border-color:var(--ded-acc);color:var(--ded-acc)}
.ded-chip-more{width:auto!important;max-width:150px;padding:7px 10px;border-radius:999px;font-size:12.5px;font-weight:700}
.ded-row{border:1px solid var(--ded-line);border-radius:13px;padding:10px;margin-bottom:9px;background:#fcfcfd}
.ded-r1{display:grid;grid-template-columns:minmax(0,1fr) 74px 110px 34px;gap:7px;align-items:center}
.ded-r2{display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:7px;margin-top:7px}
.ded-x{width:100%;min-width:34px;height:44px;border:0;background:#fef2f2;color:#dc2626;border-radius:10px;font-size:16px;font-weight:800;cursor:pointer}
.ded-pct{position:relative}.ded-pct .ded-in{padding-right:22px}
.ded-pct span{position:absolute;right:9px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--ded-mut);pointer-events:none}
.ded-in.need{border-color:#fca5a5;background:#fff7f7}
.ded-sum{border-radius:13px;background:linear-gradient(135deg,#fff7ed,#fff1e6);border:1px solid #fde0c8;padding:12px 13px;margin-top:4px}
.ded-sum-row{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:2px 0;font-variant-numeric:tabular-nums}
.ded-sum-row.tot{font-weight:800;font-size:14.5px;border-top:1px dashed #f4c7a4;margin-top:5px;padding-top:7px}
.ded-sum-row .neg{color:#be123c}
.ded-rmk{font-size:11.5px;color:var(--ded-mut);margin-top:7px;line-height:1.45}
.ded-empty{font-size:12.5px;color:var(--ded-mut);padding:2px 0 10px}
@media(max-width:560px){
  .ded-top{grid-template-columns:1fr}
  .ded-r1{grid-template-columns:96px minmax(0,1fr) 40px}
  .ded-r1 .ded-t{grid-column:1/3;grid-row:1}.ded-r1 .ded-x{grid-column:3;grid-row:1}
  .ded-r1 .ded-pct{grid-column:1;grid-row:2}.ded-r1 .ded-a{grid-column:2/4;grid-row:2}
  .ded-r2{grid-template-columns:minmax(0,1fr) 138px}
}
@media (prefers-color-scheme:dark){
  .ded-darkok{--ded-ink:#ece9f7;--ded-mut:#9a94b4;--ded-line:#2f2945;--ded-tint:#3a2316;--ded-bg:#151222}
  .ded-darkok .ded-in,.ded-darkok .ded-sel,.ded-darkok .ded-chip,.ded-darkok .ded-row{background:#1b1729}
  .ded-darkok .ded-sum{background:#241a16;border-color:#4a3020}
}`;

function _ensureCss() {
  if (document.getElementById('ded-style')) return;
  const st = document.createElement('style'); st.id = 'ded-style'; st.textContent = CSS; document.head.appendChild(st);
}

/** HTML shell — rows are rendered by initDeductions. */
export function deductionsBlockHTML(prefix, { direction = 'in', darkOk = false, withBill = true } = {}) {
  const who = direction === 'in' ? 'client' : 'you';
  return `<div class="ded ${darkOk ? 'ded-darkok' : ''}" id="${prefix}">
    <button type="button" class="ded-head" data-ded="toggle">
      <span><b>➖ Deductions</b><small>TDS, penalty, retention, recovery… deducted by ${who}</small></span>
      <span class="ded-pill" id="${prefix}_pill">+ Add</span>
    </button>
    <div class="ded-body">
      <div class="ded-top">
        ${withBill ? `<div><label class="ded-lbl">Against bill</label><select class="ded-sel" id="${prefix}_bill"><option value="">— Not linked —</option></select></div>` : ''}
        <div><label class="ded-lbl">Bill amount settled ₹</label><input class="ded-in" id="${prefix}_gross" type="number" inputmode="decimal" placeholder="0"></div>
      </div>
      <div class="ded-chips" id="${prefix}_chips"></div>
      <div id="${prefix}_rows"></div>
      <div class="ded-sum" id="${prefix}_sum"></div>
    </div>
  </div>`;
}

/**
 * Bind the widget. opts:
 *   cashInputId  — the form's own cash amount <input>
 *   direction    — 'in' | 'out'
 *   getState     — () => app state (for deduction types)
 *   bills        — () => [{ id, ref, label, gross, base?, deductions? }] for the selected party
 */
export function initDeductions(prefix, opts = {}) {
  _ensureCss();
  const root = document.getElementById(prefix);
  if (!root) return;
  const st = _w[prefix] = { open: false, rows: [], anchor: 'cash', gross: 0, base: 0, billId: '', billRef: '', ...opts };
  const S = () => (typeof st.getState === 'function' ? st.getState() : {});

  // chips + "more" select
  const chips = root.querySelector(`#${prefix}_chips`);
  const types = deductionTypes(S());
  const quick = QUICK.filter(([k]) => types.some(t => t.key === k));
  chips.innerHTML = quick.map(([k, l]) => `<button type="button" class="ded-chip" data-add="${k}">+ ${esc(l)}</button>`).join('') +
    `<select class="ded-sel ded-chip-more" data-add-more><option value="">More…</option>${types.filter(t => !quick.some(q => q[0] === t.key)).map(t => `<option value="${esc(t.key)}">${esc(t.label)}</option>`).join('')}</select>`;

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-ded="toggle"]');
    if (t) { st.open = !st.open; root.classList.toggle('open', st.open); return; }
    const add = e.target.closest('[data-add]');
    if (add) { addRow(prefix, add.dataset.add); return; }
    const rm = e.target.closest('[data-rm]');
    if (rm) { st.rows = st.rows.filter(r => String(r.id) !== rm.dataset.rm); _renderRows(prefix); _recalc(prefix); }
  });
  root.addEventListener('change', (e) => {
    if (e.target.matches('[data-add-more]')) { if (e.target.value) addRow(prefix, e.target.value); e.target.value = ''; return; }
    if (e.target.id === `${prefix}_bill`) { _applyBill(prefix, e.target.value); return; }
    const row = e.target.closest('[data-row]');
    if (row && e.target.dataset.f === 'type') {
      const r = st.rows.find(x => String(x.id) === row.dataset.row);
      const t = findType(S(), e.target.value);
      r.type = t.key; if (!r.rate && !r.amount && t.rate) r.rate = t.rate;
      _renderRows(prefix); _recalc(prefix);
    }
  });
  root.addEventListener('input', (e) => {
    if (e.target.id === `${prefix}_gross`) { st.anchor = 'gross'; st.gross = _num(e.target.value); _recalc(prefix, e.target); return; }
    const row = e.target.closest('[data-row]');
    if (!row) return;
    const r = st.rows.find(x => String(x.id) === row.dataset.row);
    const f = e.target.dataset.f;
    if (f === 'rate') { r.rate = _num(e.target.value); r.fixed = false; }
    else if (f === 'amount') { r.amount = _num(e.target.value); r.fixed = true; }
    else if (f === 'remark') { r.remark = e.target.value; _summary(prefix); _reqMarks(prefix); return; }
    else if (f === 'section') { r.section = e.target.value; _summary(prefix); return; }
    _recalc(prefix, e.target);
  });
  const cash = document.getElementById(st.cashInputId);
  if (cash) cash.addEventListener('input', () => { st.anchor = 'cash'; _recalc(prefix, cash); });

  refreshBills(prefix);
  _renderRows(prefix); _recalc(prefix);
}

/** Re-read the bill list (call when the party dropdown changes). */
export function refreshBills(prefix) {
  const st = _w[prefix]; if (!st) return;
  const sel = document.getElementById(`${prefix}_bill`); if (!sel) return;
  const bills = typeof st.bills === 'function' ? (st.bills() || []) : [];
  st._bills = bills;
  sel.innerHTML = '<option value="">— Not linked —</option>' + bills.map(b => `<option value="${esc(b.id)}">${esc(b.label)}</option>`).join('');
  if (st.billId && bills.some(b => b.id === st.billId)) sel.value = st.billId; else { st.billId = ''; st.billRef = ''; st.base = 0; }
}

export function addRow(prefix, typeKey, preset = {}) {
  const st = _w[prefix]; if (!st) return;
  const t = findType(st.getState ? st.getState() : {}, typeKey);
  st.rows.push({ id: ++_rid, type: t.key, rate: preset.rate ?? (preset.amount ? 0 : (t.rate || 0)), amount: preset.amount || 0,
    fixed: !!preset.amount, remark: preset.remark || '', section: preset.section ?? (t.nature === 'tax' ? (t.section || '') : '') });
  if (!st.open) { st.open = true; document.getElementById(prefix)?.classList.add('open'); }
  _renderRows(prefix); _recalc(prefix);
  const last = document.querySelector(`#${prefix}_rows [data-row]:last-child input[data-f="${preset.amount ? 'remark' : 'rate'}"]`);
  if (last && !preset.silent) last.focus();
}

function _applyBill(prefix, billId) {
  const st = _w[prefix];
  const b = (st._bills || []).find(x => x.id === billId);
  st.billId = b ? b.id : ''; st.billRef = b ? b.ref : ''; st.base = b && b.base ? _num(b.base) : 0;
  if (!b) { _recalc(prefix); return; }
  // Replace rows with the deductions saved on the bill (user can still edit).
  st.rows = [];
  (b.deductions || []).forEach(d => addRow(prefix, d.type, { amount: d.amount, rate: d.rate || 0, remark: d.remark || '', silent: true }));
  st.anchor = 'gross'; st.gross = _num(b.gross);
  const g = document.getElementById(`${prefix}_gross`); if (g) g.value = st.gross || '';
  _renderRows(prefix); _recalc(prefix);
}

function _renderRows(prefix) {
  const st = _w[prefix];
  const box = document.getElementById(`${prefix}_rows`); if (!box) return;
  const types = deductionTypes(st.getState ? st.getState() : {});
  if (!st.rows.length) { box.innerHTML = '<div class="ded-empty">No deductions — tap a button above to add TDS, penalty, retention…</div>'; return; }
  box.innerHTML = st.rows.map(r => {
    const t = findType(st.getState ? st.getState() : {}, r.type);
    const opts = types.map(x => `<option value="${esc(x.key)}" ${x.key === r.type ? 'selected' : ''}>${esc(x.label)}</option>`).join('');
    return `<div class="ded-row ${t.remarkRequired ? 'ded-req' : ''}" data-row="${r.id}">
      <div class="ded-r1">
        <select class="ded-sel ded-t" data-f="type">${opts}</select>
        <div class="ded-pct"><input class="ded-in" data-f="rate" type="number" inputmode="decimal" placeholder="%" value="${r.rate && !r.fixed ? r.rate : (r.rate || '')}"><span>%</span></div>
        <input class="ded-in ded-a" data-f="amount" type="number" inputmode="decimal" placeholder="₹ amount" value="${r.amount || ''}">
        <button type="button" class="ded-x" data-rm="${r.id}" aria-label="Remove">×</button>
      </div>
      <div class="ded-r2" ${t.nature === 'tax' ? '' : 'style="grid-template-columns:1fr"'}>
        <input class="ded-in" data-f="remark" placeholder="${t.remarkRequired ? 'Remark (required) — e.g. delay in slab work' : 'Remark'}" value="${esc(r.remark)}">
        ${t.nature === 'tax' ? `<input class="ded-in" data-f="section" placeholder="Section" value="${esc(r.section || '')}">` : ''}
      </div>
    </div>`;
  }).join('');
  _reqMarks(prefix);
}

function _reqMarks(prefix) {
  // highlight empty remarks on deduction types that require one (penalty / other)
  document.querySelectorAll(`#${prefix}_rows .ded-req input[data-f="remark"]`).forEach(el => {
    el.classList.toggle('need', !el.value.trim());
  });
}

function _recalc(prefix, focusEl) {
  const st = _w[prefix];
  const cashEl = document.getElementById(st.cashInputId);
  const grossEl = document.getElementById(`${prefix}_gross`);
  const r = computeDeductions({ anchor: st.anchor, gross: st.gross, cash: _num(cashEl?.value), rows: st.rows, base: st.base });
  // write back computed row amounts (don't touch the field being typed in)
  r.rows.forEach(row => {
    const s = st.rows.find(x => x.id === row.id); if (s) s.amount = row.amount;
    const el = document.querySelector(`#${prefix}_rows [data-row="${row.id}"] input[data-f="amount"]`);
    if (el && el !== focusEl) el.value = row.amount || '';
  });
  st.gross = r.gross;
  if (grossEl && grossEl !== focusEl) grossEl.value = st.rows.length ? (r.gross || '') : '';
  if (cashEl && cashEl !== focusEl && st.anchor === 'gross' && st.rows.length) cashEl.value = r.cash > 0 ? r.cash : 0;
  st._last = r;
  _summary(prefix);
}

function _summary(prefix) {
  const st = _w[prefix];
  const r = st._last || { gross: 0, cash: 0, total: 0, rows: [] };
  const pill = document.getElementById(`${prefix}_pill`);
  const sum = document.getElementById(`${prefix}_sum`);
  const ds = normalizeDeductions(st.rows, st.getState ? st.getState() : {});
  if (pill) pill.textContent = ds.length ? `− ${money(r.total)}` : '+ Add';
  if (!sum) return;
  if (!ds.length) { sum.style.display = 'none'; return; }
  sum.style.display = '';
  const inward = st.direction !== 'out';
  sum.innerHTML = `
    <div class="ded-sum-row"><span>${inward ? 'Cash received' : 'Cash paid'}</span><b>${money(r.cash)}</b></div>
    ${ds.map(d => `<div class="ded-sum-row"><span>+ ${esc(d.label)}${d.rate ? ' @' + d.rate + '%' : ''}</span><span class="neg">${money(d.amount)}</span></div>`).join('')}
    <div class="ded-sum-row tot"><span>Bill amount settled</span><span>${money(r.cash + r.total)}</span></div>
    <div class="ded-rmk">📝 ${esc(buildSettlementRemark({ direction: st.direction, cash: r.cash, deductions: ds, billRef: st.billRef, fmt: money }))}</div>`;
}

/** Read the widget for saving. */
export function readDeductions(prefix) {
  const st = _w[prefix];
  if (!st) return { deductions: [], errors: [] };
  const S = st.getState ? st.getState() : {};
  const deductions = normalizeDeductions(st.rows, S);
  const errors = validateDeductions(st.rows, S);
  const r = st._last || { gross: 0, cash: 0 };
  return {
    deductions, errors, gross: r.cash + deductions.reduce((s, d) => s + d.amount, 0), cash: r.cash,
    billId: st.billId, billRef: st.billRef,
    remark: buildSettlementRemark({ direction: st.direction, cash: r.cash, deductions, billRef: st.billRef }),
  };
}

/** Load saved deductions into the widget (edit mode). */
export function loadDeductions(prefix, rec) {
  const st = _w[prefix]; if (!st) return;
  st.rows = []; st.anchor = 'cash';
  st.billId = rec?.againstBillId || ''; st.billRef = rec?.againstBillRef || '';
  (rec?.deductions || []).forEach(d => addRow(prefix, d.type, { amount: d.amount, rate: d.rate || 0, remark: d.remark || '', section: d.section || '', silent: true }));
  const sel = document.getElementById(`${prefix}_bill`); if (sel) sel.value = st.billId;
  if (!st.rows.length) { st.open = false; document.getElementById(prefix)?.classList.remove('open'); }
  _renderRows(prefix); _recalc(prefix);
}

/* ───────── bill lists for the "Against bill" dropdown ───────── */

/** Client bills: RA invoices (with their saved deductions) + sale invoices. */
export function clientBills(state, clientId) {
  if (!clientId) return [];
  const out = [];
  (state.invoices || []).filter(i => i.clientId === clientId && i.status !== 'Cancelled').forEach(i => {
    const ds = [];
    if (_num(i.retentionAmt) > 0) ds.push({ type: 'retention', amount: _num(i.retentionAmt), rate: _num(i.retentionPct) });
    if (_num(i.tdsAmt) > 0) ds.push({ type: 'tds', amount: _num(i.tdsAmt), rate: _num(i.tdsPct) });
    if (_num(i.advanceRec) > 0) ds.push({ type: 'advance_recovery', amount: _num(i.advanceRec) });
    if (_num(i.ld) > 0) ds.push({ type: 'ld_penalty', amount: _num(i.ld), remark: 'As per RA bill ' + (i.invoiceNum || '') });
    const gross = _num(i.totalAmount) || (_num(i.subtotal) + _num(i.taxAmount));
    out.push({ id: i.id, ref: i.invoiceNum || 'RA bill', label: `${i.invoiceNum || 'RA bill'} · ${i.date || ''} · ${money(gross)}`, gross, base: _num(i.subtotal), deductions: ds });
  });
  (state.saleInvoices || []).filter(i => i.clientId === clientId && i.status !== 'Cancelled').forEach(i => {
    const gross = _num(i.total);
    out.push({ id: i.id, ref: i.invoiceNo || 'Invoice', label: `${i.invoiceNo || 'Invoice'} · ${i.date || ''} · ${money(gross)}`, gross, base: _num(i.subtotal || i.taxableValue), deductions: [] });
  });
  return out.sort((a, b) => String(b.label).localeCompare(String(a.label)));
}

/** Vendor bills (purchase bills). */
export function vendorBills(state, vendorId) {
  if (!vendorId) return [];
  return (state.vendorMaterials || []).filter(b => b.vendorId === vendorId).map(b => {
    const gross = _num(b.totalAmount ?? b.amount);
    return { id: b.id, ref: b.billNo || 'Bill', label: `${b.billNo || 'Bill'} · ${b.date || ''} · ${money(gross)}`, gross, base: _num(b.subtotal), deductions: [] };
  });
}
