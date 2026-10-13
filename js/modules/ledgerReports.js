/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Tally-style ledgers (Reports → Finance & Cash)
 * ═══════════════════════════════════════════════════════════
 * Account Statement : Bank / Cash books — group summary of every account
 *                     (Opening · Debit · Credit · Closing) → drill into an
 *                     account's Ledger Vouchers.
 * Party Ledger      : Sundry Debtors (clients), Sundry Creditors (vendors),
 *                     Labour and Contractors / Gangs — group summary → ledger.
 *
 * Ledger layout follows Tally: Date · Particulars (To / By the contra ledger,
 * with narration) · Vch Type · Vch No. · Debit · Credit · running balance (Dr/Cr),
 * framed by Opening Balance, Current Total and Closing Balance. Every ledger
 * also has a Monthly Summary view. On screen + PDF + Excel.
 *
 * Conventions: Balance = Debit − Credit. A bank / cash account in hand is Dr;
 * a client who owes us is Dr; a vendor / labour we owe is Cr.
 * Party entries mirror the Parties screen (parties.js), plus credit / debit notes.
 * ═══════════════════════════════════════════════════════════
 */

import { state } from './state.js';
import { showToast, mobileSavePDF, mobileSaveXLSX } from './utils.js';
import { formatNumber2 } from './format.js?v=1.0.1';

const N = v => parseFloat(v) || 0;
const _n2 = n => formatNumber2(n, (state.currencySettings || {}).locale || 'en-IN');
const _esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const _find = (key, id) => (state[key] || []).find(x => x.id === id);
const _name = (key, id) => _find(key, id)?.name || '';
const _accName = id => _name('accounts', id) || 'Cash / Bank';
const _custName = id => _name('pettyCashCustodians', id) || 'Custodian';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Tally date: 1-Apr-2026 */
function _td(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${+m[3]}-${MONTHS[+m[2] - 1]}-${m[1]}` : (iso || '');
}
/** "1,234.00 Dr" */
const _drcr = b => Math.abs(b) < 0.005 ? '0.00' : _n2(Math.abs(b)) + (b < 0 ? ' Cr' : ' Dr');
const _iso = d => d.toISOString().slice(0, 10);
function _fyStart() { const n = new Date(); return (n.getMonth() >= 3 ? n.getFullYear() : n.getFullYear() - 1) + '-04-01'; }

// ── Entry: { date, part, vchType, vchNo, narr, dr, cr } ─────────────────────
function _e(date, part, vchType, vchNo, narr, dr, cr) {
  return { date: date || '', part: part || '', vchType, vchNo: vchNo || '', narr: narr || '', dr: N(dr), cr: N(cr) };
}
const _join = (...a) => a.filter(Boolean).join(' · ');

// ═══════════════ LEDGER SOURCES ═══════════════

/** Bank / cash account: money in = Debit, money out = Credit. */
function _accountEntries(accId) {
  const t = [];
  (state.paymentsIn || []).filter(p => p.accountId === accId).forEach(p => t.push(_e(p.date, _name('clients', p.clientId) || 'Client Receipt', 'Receipt', p.receiptNo || p.ref, _join(p.mode, p.receiptNo ? p.ref : '', p.invoiceRef && 'Against ' + p.invoiceRef), p.amount, 0)));
  (state.otherIncome || []).filter(o => o.accountId === accId).forEach(o => t.push(_e(o.date, o.source || 'Other Income', 'Receipt', o.ref, '', o.amount, 0)));
  (state.expenses || []).filter(e => e.accountId === accId).forEach(e => t.push(_e(e.date, e.party || (e.gangId && _name('labourContractors', e.gangId)) || e.category || e.head || 'Expense', 'Payment', e.voucherNo || e.ref, _join(e.party && e.category, e.subHead, e.remarks || e.description), 0, e.amount)));
  (state.vendorPayments || []).filter(v => v.accountId === accId).forEach(v => t.push(_e(v.date, _name('vendors', v.vendorId) || v.partyName || 'Vendor Payment', 'Payment', v.voucherNo || v.ref, '', 0, v.amount)));
  (state.labourPayments || []).filter(l => l.accountId === accId).forEach(l => t.push(_e(l.date, _name('labourMaster', l.labourId) || 'Labour Payment', 'Payment', '', _join(l.ref, l.wageMonth), 0, l.amount)));
  (state.equipmentLogs || []).filter(e => e.accountId === accId && N(e.amount)).forEach(e => t.push(_e(e.date, _name('equipmentList', e.equipmentId) || 'Equipment', 'Payment', '', e.remarks, 0, e.amount)));
  (state.accountTransfers || []).forEach(x => {
    if (x.fromAccountId === accId) t.push(_e(x.date, _accName(x.toAccountId), 'Contra', x.ref, x.note || x.remarks, 0, x.amount));
    if (x.toAccountId === accId) t.push(_e(x.date, _accName(x.fromAccountId), 'Contra', x.ref, x.note || x.remarks, x.amount, 0));
  });
  (state.pettyCashTxns || []).forEach(x => {
    if (x.type === 'TRANSFER' && x.fromAccountId === accId) t.push(_e(x.date, 'Petty Cash — ' + _custName(x.custodianId), 'Contra', '', x.note, 0, x.amount));
    if (x.type === 'RETURN' && x.toAccountId === accId) t.push(_e(x.date, 'Petty Cash — ' + _custName(x.custodianId), 'Contra', '', x.note, x.amount, 0));
  });
  return t;
}

/** Party ledger (mirrors the Parties screen, plus credit / debit notes). */
function _partyEntries(type, id) {
  const t = [];
  if (type === 'client') {
    (state.abstracts || []).filter(a => a.clientId === id && a.status !== 'invoiced').forEach(a => t.push(_e(a.date, 'Sales — Work Bill (Abstract)', 'Sales', a.abstractNum, a.sheetNum && 'Measurement ' + a.sheetNum, a.totalAmount, 0)));
    (state.invoices || []).filter(i => i.clientId === id && i.status !== 'Cancelled').forEach(i => t.push(_e(i.date, 'Sales (GST)', 'Sales', i.invoiceNum, '', i.taxAmount, 0)));
    (state.saleInvoices || []).filter(i => i.clientId === id && i.status !== 'Cancelled').forEach(i => t.push(_e(i.date, 'Sales', 'Sales', i.invoiceNo, i.poNo && 'PO ' + i.poNo, i.total, 0)));
    (state.paymentsIn || []).filter(p => p.clientId === id).forEach(p => t.push(_e(p.date, _accName(p.accountId), 'Receipt', p.receiptNo || p.ref, _join(p.mode, p.receiptNo ? p.ref : '', p.invoiceRef && 'Against ' + p.invoiceRef), 0, p.amount)));
    (state.saleReturns || []).filter(r => r.clientId === id && r.status !== 'Cancelled').forEach(r => t.push(_e(r.date, 'Sales Return', 'Credit Note', r.returnNo, _join(r.invoiceRef && 'Against ' + r.invoiceRef, r.reason), 0, r.amount)));
  } else if (type === 'vendor') {
    (state.vendorMaterials || []).filter(m => m.vendorId === id).forEach(m => t.push(_e(m.date, 'Purchase', 'Purchase', m.billNo, '', 0, m.totalAmount ?? m.amount)));
    (state.vendorPayments || []).filter(p => p.vendorId === id).forEach(p => t.push(_e(p.date, p.accountId ? _accName(p.accountId) : (p.source === 'petty' ? 'Petty Cash' : 'Cash / Bank'), 'Payment', p.voucherNo || p.ref, '', p.amount, 0)));
    (state.purchaseReturns || []).filter(r => r.vendorId === id && r.status !== 'Cancelled').forEach(r => t.push(_e(r.date, 'Purchase Return', 'Debit Note', r.returnNo, _join(r.invoiceRef && 'Against ' + r.invoiceRef, r.reason), r.amount, 0)));
  } else if (type === 'labour') {
    (state.labourSalaries || []).filter(s => s.labourId === id).forEach(s => t.push(_e(s.date, 'Wages', 'Journal', s.month, 'Salary for ' + (s.month || ''), 0, s.amount)));
    (state.labourPayments || []).filter(p => p.labourId === id).forEach(p => t.push(_e(p.date, p.accountId ? _accName(p.accountId) : 'Cash / Bank', 'Payment', '', _join(p.ref, p.wageMonth), p.amount, 0)));
  } else if (type === 'contractor') {
    (state.workMeasurements || []).filter(m => m.gangId === id && m.approved).forEach(m => {
      const r = (state.workItemRates || []).find(x => x.id === m.rateId);
      t.push(_e(m.date, 'Piece-Rate Work — ' + (r?.workCategory || 'Work'), 'Journal', '', `${N(m.quantity)} ${r?.uom || ''} @ ${_n2(r?.rate || 0)}`, 0, N(r?.rate) * N(m.quantity)));
    });
    (state.expenses || []).filter(e => e.gangId === id && e.category === 'Piece-Rate Gang Payout').forEach(e => t.push(_e(e.date, e.accountId ? _accName(e.accountId) : 'Cash / Bank', 'Payment', '', 'Gang payout', e.amount, 0)));
    (state.labourAdvances || []).filter(a => a.labourId === id).forEach(a => t.push(_e(a.date, 'Advance', 'Payment', '', a.reason || a.note, a.amount, 0)));
    const wIds = new Set((state.labourMaster || []).filter(w => w.contractorId === id).map(w => w.id));
    (state.labourSalaries || []).filter(s => wIds.has(s.labourId)).forEach(s => t.push(_e(s.date, 'Wages — ' + _name('labourMaster', s.labourId), 'Journal', s.month, '', 0, s.amount)));
    (state.labourPayments || []).filter(p => wIds.has(p.labourId)).forEach(p => t.push(_e(p.date, p.accountId ? _accName(p.accountId) : 'Cash / Bank', 'Payment', '', _join(_name('labourMaster', p.labourId), p.ref), p.amount, 0)));
  }
  return t;
}

// ═══════════════ LEDGER CATALOGUE ═══════════════

const GROUPS = {
  bank:       { label: 'Bank & Cash Accounts', short: 'Accounts' },
  client:     { label: 'Sundry Debtors (Clients)', short: 'Clients' },
  vendor:     { label: 'Sundry Creditors (Vendors)', short: 'Vendors' },
  labour:     { label: 'Labour', short: 'Labour' },
  contractor: { label: 'Contractors / Gangs', short: 'Contractors' },
};
function _ledgersOf(group) {
  if (group === 'bank') return (state.accounts || []).map(a => ({ group, id: a.id, name: a.name || 'Account', sub: [a.type, a.bankName, a.accountNo && 'A/c ' + a.accountNo].filter(Boolean).join(' · ') }));
  if (group === 'client') return (state.clients || []).map(c => ({ group, id: c.id, name: c.name || 'Client', sub: c.gst ? 'GSTIN ' + c.gst : '' }));
  if (group === 'vendor') return (state.vendors || []).map(v => ({ group, id: v.id, name: v.name || 'Vendor', sub: v.gst ? 'GSTIN ' + v.gst : '' }));
  if (group === 'labour') return (state.labourMaster || []).filter(l => !l.contractorId).map(l => ({ group, id: l.id, name: l.name || 'Worker', sub: l.trade || l.category || '' }));
  if (group === 'contractor') return (state.labourContractors || []).map(g => ({ group, id: g.id, name: g.name || 'Contractor', sub: '' }));
  return [];
}
function _entriesOf(group, id) { return group === 'bank' ? _accountEntries(id) : _partyEntries(group, id); }
function _baseOpening(group, id) { return group === 'bank' ? N(_find('accounts', id)?.openingBalance) : 0; }

/** Opening (as at `from`), the period's entries, totals and closing. */
function _ledger(group, id, from, to) {
  const all = _entriesOf(group, id).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let opening = _baseOpening(group, id);
  const rows = [];
  all.forEach(e => {
    if (from && e.date < from) { opening += e.dr - e.cr; return; }
    if (to && e.date && e.date > to) return;
    rows.push(e);
  });
  let bal = opening, dr = 0, cr = 0;
  rows.forEach(e => { dr += e.dr; cr += e.cr; bal += e.dr - e.cr; e.bal = bal; });
  return { opening, rows, dr, cr, closing: opening + dr - cr };
}

/** Month-wise (Tally "Monthly Summary"): every month in the period. */
function _monthly(L, from, to) {
  const start = from || (L.rows[0]?.date) || _iso(new Date());
  const end = to || _iso(new Date());
  const out = [];
  let y = +start.slice(0, 4), m = +start.slice(5, 7), bal = L.opening;
  const ey = +end.slice(0, 4), em = +end.slice(5, 7);
  while (y < ey || (y === ey && m <= em)) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const rs = L.rows.filter(r => (r.date || '').slice(0, 7) === key);
    const dr = rs.reduce((s, r) => s + r.dr, 0), cr = rs.reduce((s, r) => s + r.cr, 0);
    bal += dr - cr;
    out.push({ label: `${MONTHS_LONG[m - 1]} ${y}`, dr, cr, bal, count: rs.length });
    if (++m > 12) { m = 1; y++; }
    if (out.length > 240) break;
  }
  return out;
}

/** Group summary: every ledger in a group with opening / debit / credit / closing. */
function _summary(group, from, to) {
  return _ledgersOf(group).map(l => {
    const L = _ledger(group, l.id, from, to);
    return { ...l, opening: L.opening, dr: L.dr, cr: L.cr, closing: L.closing, count: L.rows.length };
  });
}

// ═══════════════ ON-SCREEN UI ═══════════════

const S = { kind: 'bank', group: 'bank', id: '', from: '', to: '', view: 'detail', hideZero: false };

const css = {
  wrap: 'max-width:1100px;margin:0 auto;',
  card: 'background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 1px 4px rgba(0,0,0,.04);overflow:hidden;',
  bar: 'display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;padding:14px 16px;border-bottom:1px solid #e2e8f0;background:#f8fafc;',
  lbl: 'display:block;font-size:10px;font-weight:700;color:#64748b;margin-bottom:3px;text-transform:uppercase;letter-spacing:.04em;',
  inp: 'padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-weight:600;background:#fff;color:#0f172a;',
  btn: 'padding:8px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:1px solid transparent;',
  th: 'padding:8px 10px;font-size:11px;font-weight:700;color:#0f172a;border-bottom:1.5px solid #0f172a;border-top:1.5px solid #0f172a;white-space:nowrap;background:#fff;position:sticky;top:0;',
  td: 'padding:6px 10px;font-size:12.5px;color:#0f172a;border-bottom:1px solid #f1f5f9;vertical-align:top;',
  num: 'text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;',
};

function _tabBtn(active, label, onclick) {
  return `<button onclick="${onclick}" style="${css.btn}${active ? 'background:#0f172a;color:#fff;' : 'background:#fff;color:#334155;border-color:#cbd5e1;'}">${label}</button>`;
}

/** Entry point from the Reports module. kind: 'bank' | 'party'. */
export function renderLedgerReport(kind) {
  const k = kind === 'party' ? 'party' : 'bank';
  if (S.kind !== k) { S.kind = k; S.group = k === 'bank' ? 'bank' : 'client'; S.id = ''; S.view = 'detail'; }
  if (!S.from) { S.from = _fyStart(); S.to = _iso(new Date()); }
  _draw();
}

function _draw() {
  const box = document.getElementById('reportsDashContent');
  if (!box) return;
  const isBank = S.kind === 'bank';
  const groups = isBank ? ['bank'] : ['client', 'vendor', 'labour', 'contractor'];
  const ledgers = _ledgersOf(S.group);
  if (S.id && !ledgers.some(l => l.id === S.id)) S.id = '';
  const title = isBank ? 'Account Statement — Bank &amp; Cash' : 'Party Ledger';
  const sub = isBank ? 'Bank / cash book: opening balance, every receipt, payment and contra entry, running balance and closing balance.'
    : 'Ledger for every client (Sundry Debtors), vendor (Sundry Creditors), worker and contractor.';
  const ledOpts = `<option value="">— All ${GROUPS[S.group].short} (Summary) —</option>` + ledgers.map(l => `<option value="${l.id}" ${l.id === S.id ? 'selected' : ''}>${_esc(l.name)}</option>`).join('');

  let html = `<div style="${css.wrap}">
    <button onclick="(window._rptOpenCategory||renderReportsDashboard)('finance')" style="margin-bottom:12px;padding:6px 14px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;">&larr; Finance &amp; Cash</button>
    <div style="margin-bottom:12px;"><h2 style="font-size:20px;font-weight:800;color:#0f172a;margin:0;">${title}</h2><p style="font-size:12.5px;color:#64748b;margin:2px 0 0;">${sub}</p></div>
    <div style="${css.card}">
      <div style="${css.bar}">
        ${!isBank ? `<div><label style="${css.lbl}">Group</label><select style="${css.inp}" onchange="window._ldgSet({group:this.value,id:''})">${groups.map(g => `<option value="${g}" ${g === S.group ? 'selected' : ''}>${GROUPS[g].label}</option>`).join('')}</select></div>` : ''}
        <div style="flex:1;min-width:200px;"><label style="${css.lbl}">${isBank ? 'Account' : 'Ledger'}</label><select style="${css.inp}width:100%;" onchange="window._ldgSet({id:this.value})">${ledOpts}</select></div>
        <div><label style="${css.lbl}">From</label><input type="date" value="${S.from}" style="${css.inp}" onchange="window._ldgSet({from:this.value})"></div>
        <div><label style="${css.lbl}">To</label><input type="date" value="${S.to}" style="${css.inp}" onchange="window._ldgSet({to:this.value})"></div>
        ${S.id ? `<div style="display:flex;gap:6px;">${_tabBtn(S.view === 'detail', 'Vouchers', "window._ldgSet({view:'detail'})")}${_tabBtn(S.view === 'monthly', 'Monthly', "window._ldgSet({view:'monthly'})")}</div>` : `<label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#334155;padding-bottom:8px;"><input type="checkbox" ${S.hideZero ? 'checked' : ''} onchange="window._ldgSet({hideZero:this.checked})"> Hide zero balances</label>`}
        <div style="display:flex;gap:6px;">
          <button onclick="window._ldgPDF()" style="${css.btn}background:#1e3a8a;color:#fff;">&#128424; PDF</button>
          <button onclick="window._ldgExcel()" style="${css.btn}background:#ef8420;color:#fff;">&#128202; Excel</button>
        </div>
      </div>
      <div style="padding:14px 16px 6px;text-align:center;border-bottom:1px solid #e2e8f0;">
        ${_headerHTML()}
      </div>
      <div style="overflow:auto;max-height:68vh;">${S.id ? (S.view === 'monthly' ? _monthlyHTML() : _vouchersHTML()) : _summaryHTML()}</div>
    </div>
  </div>`;
  box.innerHTML = html;
}

function _headerHTML() {
  const cp = state.companyProfile || {};
  const led = S.id ? _ledgersOf(S.group).find(l => l.id === S.id) : null;
  const what = led ? `Ledger: <b>${_esc(led.name)}</b>` : `<b>${GROUPS[S.group].label}</b> — Group Summary`;
  const kind = led ? (S.view === 'monthly' ? 'Monthly Summary' : (S.group === 'bank' ? 'Bank / Cash Book — Ledger Vouchers' : 'Ledger Account')) : '';
  return `<div style="font-size:15px;font-weight:800;color:#0f172a;">${_esc(cp.CompanyName || '')}</div>
    ${cp.Address ? `<div style="font-size:11.5px;color:#475569;">${_esc(cp.Address)}</div>` : ''}
    <div style="font-size:13px;color:#0f172a;margin-top:6px;">${what}${led && led.sub ? ` <span style="color:#64748b;font-size:11.5px;">(${_esc(led.sub)})</span>` : ''}</div>
    ${kind ? `<div style="font-size:11.5px;color:#475569;">${kind}</div>` : ''}
    <div style="font-size:11.5px;color:#475569;">${_td(S.from)} to ${_td(S.to)}</div>`;
}

function _vouchersHTML() {
  const L = _ledger(S.group, S.id, S.from, S.to);
  const tdN = css.td + css.num;
  const amt = v => v ? _n2(v) : '';
  let h = `<table style="width:100%;min-width:780px;border-collapse:collapse;">
    <thead><tr>
      <th style="${css.th}text-align:left;width:92px;">Date</th>
      <th style="${css.th}text-align:left;">Particulars</th>
      <th style="${css.th}text-align:left;width:96px;">Vch Type</th>
      <th style="${css.th}text-align:left;width:110px;">Vch No.</th>
      <th style="${css.th}text-align:right;width:120px;">Debit</th>
      <th style="${css.th}text-align:right;width:120px;">Credit</th>
      <th style="${css.th}text-align:right;width:130px;">Balance</th>
    </tr></thead><tbody>
    <tr style="background:#f8fafc;"><td style="${css.td}">${_td(S.from)}</td><td style="${css.td}font-weight:700;">Opening Balance</td><td style="${css.td}"></td><td style="${css.td}"></td>
      <td style="${tdN}font-weight:700;">${L.opening > 0.005 ? _n2(L.opening) : ''}</td><td style="${tdN}font-weight:700;">${L.opening < -0.005 ? _n2(-L.opening) : ''}</td><td style="${tdN}font-weight:700;">${_drcr(L.opening)}</td></tr>`;
  L.rows.forEach(r => {
    h += `<tr><td style="${css.td}white-space:nowrap;">${_td(r.date)}</td>
      <td style="${css.td}"><span style="color:#64748b;font-size:11px;font-weight:700;margin-right:4px;">${r.dr ? 'To' : 'By'}</span><span style="font-weight:600;">${_esc(r.part)}</span>${r.narr ? `<div style="font-size:11px;color:#64748b;font-style:italic;margin-left:22px;">${_esc(r.narr)}</div>` : ''}</td>
      <td style="${css.td}">${r.vchType}</td><td style="${css.td}">${_esc(r.vchNo)}</td>
      <td style="${tdN}">${amt(r.dr)}</td><td style="${tdN}">${amt(r.cr)}</td><td style="${tdN}color:#334155;">${_drcr(r.bal)}</td></tr>`;
  });
  if (!L.rows.length) h += `<tr><td colspan="7" style="${css.td}text-align:center;color:#94a3b8;padding:24px;">No vouchers in this period</td></tr>`;
  const foot = 'padding:7px 10px;font-size:12.5px;font-weight:800;color:#0f172a;';
  h += `</tbody><tfoot>
    <tr><td style="${foot}border-top:1.5px solid #0f172a;"></td><td style="${foot}border-top:1.5px solid #0f172a;text-align:right;" colspan="3">Current Total</td>
      <td style="${foot}${css.num}border-top:1.5px solid #0f172a;">${_n2(L.dr)}</td><td style="${foot}${css.num}border-top:1.5px solid #0f172a;">${_n2(L.cr)}</td><td style="${foot}border-top:1.5px solid #0f172a;"></td></tr>
    <tr><td style="${foot}border-bottom:1.5px solid #0f172a;"></td><td style="${foot}text-align:right;border-bottom:1.5px solid #0f172a;" colspan="3">Closing Balance</td>
      <td style="${foot}${css.num}border-bottom:1.5px solid #0f172a;">${L.closing > 0.005 ? _n2(L.closing) : ''}</td><td style="${foot}${css.num}border-bottom:1.5px solid #0f172a;">${L.closing < -0.005 ? _n2(-L.closing) : ''}</td>
      <td style="${foot}${css.num}border-bottom:1.5px solid #0f172a;color:${L.closing < 0 ? '#b91c1c' : '#15803d'};">${_drcr(L.closing)}</td></tr>
  </tfoot></table>`;
  return h;
}

function _monthlyHTML() {
  const L = _ledger(S.group, S.id, S.from, S.to);
  const M = _monthly(L, S.from, S.to);
  const tdN = css.td + css.num;
  let h = `<table style="width:100%;min-width:520px;border-collapse:collapse;"><thead><tr>
      <th style="${css.th}text-align:left;">Particulars</th><th style="${css.th}text-align:right;width:150px;">Debit</th>
      <th style="${css.th}text-align:right;width:150px;">Credit</th><th style="${css.th}text-align:right;width:160px;">Closing Balance</th></tr></thead><tbody>
    <tr style="background:#f8fafc;"><td style="${css.td}font-weight:700;">Opening Balance</td><td style="${tdN}"></td><td style="${tdN}"></td><td style="${tdN}font-weight:700;">${_drcr(L.opening)}</td></tr>`;
  M.forEach(m => {
    h += `<tr style="cursor:pointer;" onclick="window._ldgMonth('${m.label}')" title="Show this month's vouchers"><td style="${css.td}font-weight:600;">${m.label}${m.count ? ` <span style="color:#94a3b8;font-size:11px;">(${m.count})</span>` : ''}</td>
      <td style="${tdN}">${m.dr ? _n2(m.dr) : ''}</td><td style="${tdN}">${m.cr ? _n2(m.cr) : ''}</td><td style="${tdN}">${_drcr(m.bal)}</td></tr>`;
  });
  const foot = 'padding:7px 10px;font-size:12.5px;font-weight:800;color:#0f172a;border-top:1.5px solid #0f172a;border-bottom:1.5px solid #0f172a;';
  h += `</tbody><tfoot><tr><td style="${foot}">Grand Total</td><td style="${foot}${css.num}">${_n2(L.dr)}</td><td style="${foot}${css.num}">${_n2(L.cr)}</td><td style="${foot}${css.num}">${_drcr(L.closing)}</td></tr></tfoot></table>`;
  return h;
}

function _summaryRows() {
  let rows = _summary(S.group, S.from, S.to);
  if (S.hideZero) rows = rows.filter(r => Math.abs(r.opening) > 0.005 || Math.abs(r.closing) > 0.005 || r.count);
  return rows;
}
function _summaryHTML() {
  const rows = _summaryRows();
  const tdN = css.td + css.num;
  const tot = rows.reduce((t, r) => ({ opening: t.opening + r.opening, dr: t.dr + r.dr, cr: t.cr + r.cr, closing: t.closing + r.closing }), { opening: 0, dr: 0, cr: 0, closing: 0 });
  let h = `<table style="width:100%;min-width:640px;border-collapse:collapse;"><thead><tr>
      <th style="${css.th}text-align:left;">Particulars</th><th style="${css.th}text-align:right;width:140px;">Opening Balance</th>
      <th style="${css.th}text-align:right;width:130px;">Debit</th><th style="${css.th}text-align:right;width:130px;">Credit</th>
      <th style="${css.th}text-align:right;width:150px;">Closing Balance</th></tr></thead><tbody>`;
  rows.forEach(r => {
    h += `<tr style="cursor:pointer;" onclick="window._ldgSet({id:'${r.id}',view:'detail'})" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
      <td style="${css.td}"><span style="font-weight:700;color:#1e3a8a;">${_esc(r.name)}</span>${r.sub ? `<div style="font-size:11px;color:#94a3b8;">${_esc(r.sub)}</div>` : ''}</td>
      <td style="${tdN}">${_drcr(r.opening)}</td><td style="${tdN}">${r.dr ? _n2(r.dr) : ''}</td><td style="${tdN}">${r.cr ? _n2(r.cr) : ''}</td>
      <td style="${tdN}font-weight:700;color:${r.closing < -0.005 ? '#b91c1c' : '#0f172a'};">${_drcr(r.closing)}</td></tr>`;
  });
  if (!rows.length) h += `<tr><td colspan="5" style="${css.td}text-align:center;color:#94a3b8;padding:24px;">No ${GROUPS[S.group].short.toLowerCase()} yet</td></tr>`;
  const foot = 'padding:7px 10px;font-size:12.5px;font-weight:800;color:#0f172a;border-top:1.5px solid #0f172a;border-bottom:1.5px solid #0f172a;';
  h += `</tbody><tfoot><tr><td style="${foot}">Grand Total</td><td style="${foot}${css.num}">${_drcr(tot.opening)}</td><td style="${foot}${css.num}">${_n2(tot.dr)}</td><td style="${foot}${css.num}">${_n2(tot.cr)}</td><td style="${foot}${css.num}">${_drcr(tot.closing)}</td></tr></tfoot></table>
    <p style="font-size:11px;color:#94a3b8;padding:8px 16px;">Tap a ${S.group === 'bank' ? 'account' : 'party'} to open its ledger. Dr = ${S.group === 'bank' ? 'balance available' : S.group === 'client' ? 'receivable from client' : 'advance / overpaid'}; Cr = ${S.group === 'bank' ? 'overdrawn' : S.group === 'client' ? 'advance received' : 'payable by us'}.</p>`;
  return h;
}

window._ldgSet = function (patch) {
  Object.assign(S, patch);
  if (S.from && S.to && S.from > S.to) { const t = S.from; S.from = S.to; S.to = t; }
  _draw();
};
window._ldgMonth = function (label) {
  const [mon, yr] = label.split(' ');
  const m = MONTHS_LONG.indexOf(mon) + 1;
  if (!m) return;
  const first = `${yr}-${String(m).padStart(2, '0')}-01`;
  const last = _iso(new Date(Date.UTC(+yr, m, 0)));
  S.from = first; S.to = last; S.view = 'detail';
  _draw();
};
window.renderLedgerReport = renderLedgerReport;

// ═══════════════ PDF (Tally print layout, black & white) ═══════════════

function _pdfHeader(doc, lines) {
  const cp = state.companyProfile || {};
  const pw = doc.internal.pageSize.getWidth();
  let y = 14;
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(cp.CompanyName || '', pw / 2, y, { align: 'center' }); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  if (cp.Address) doc.splitTextToSize(cp.Address, 150).forEach(l => { doc.text(l, pw / 2, y, { align: 'center' }); y += 3.8; });
  const extra = [cp.Phone && 'Ph: ' + cp.Phone, cp.Email, cp.GST && 'GSTIN: ' + String(cp.GST).toUpperCase()].filter(Boolean).join('  |  ');
  if (extra) { doc.text(extra, pw / 2, y, { align: 'center' }); y += 3.8; }
  y += 2.5;
  lines.forEach(([t, bold, size]) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size || 9.5); doc.text(t, pw / 2, y, { align: 'center' }); y += (size || 9.5) * 0.45; });
  return y + 1.5;
}
function _pdfFooter(doc) {
  const n = doc.internal.getNumberOfPages(), pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(90, 90, 90);
    doc.text(`Page ${i} of ${n}`, pw - 12, ph - 7, { align: 'right' });
    doc.text('Generated ' + _td(_iso(new Date())), 12, ph - 7);
    if (i < n) doc.text('continued …', pw / 2, ph - 7, { align: 'center' });
  }
}
// Plain table; Tally-style rules above/below the column head and the totals are
// drawn by hand (this autoTable build has no per-side borders).
function _rules(c) {
  if (c.section === 'body') return;
  const d = c.doc; d.setDrawColor(0, 0, 0); d.setLineWidth(0.35);
  const x0 = c.cell.x, x1 = c.cell.x + c.cell.width, y0 = c.cell.y, y1 = c.cell.y + c.cell.height;
  if (c.section === 'head' || c.row.index === 0) d.line(x0, y0, x1, y0);
  if (c.section === 'head' || c.row.index === c.table.foot.length - 1) d.line(x0, y1, x1, y1);
}
const _tableBase = { theme: 'plain', margin: { left: 12, right: 12, bottom: 14 },
  styles: { font: 'helvetica', fontSize: 8, cellPadding: { top: 1.3, bottom: 1.3, left: 1.5, right: 1.5 }, textColor: 0, fillColor: false, lineWidth: 0, overflow: 'linebreak' },
  headStyles: { fontStyle: 'bold', fontSize: 8.2, fillColor: false, textColor: 0 },
  footStyles: { fontStyle: 'bold', fillColor: false, textColor: 0 },
  didDrawCell: _rules };

window._ldgPDF = function () {
  if (!window.jspdf?.jsPDF) return showToast('PDF library still loading — try again in a moment', 'warning');
  try {
    const doc = new window.jspdf.jsPDF('p', 'mm', 'a4');
    const led = S.id ? _ledgersOf(S.group).find(l => l.id === S.id) : null;
    const period = `${_td(S.from)} to ${_td(S.to)}`;
    let file;
    if (!led) {
      const rows = _summaryRows();
      const y = _pdfHeader(doc, [[GROUPS[S.group].label, true, 11], ['Group Summary', false, 9], [period, false, 9]]);
      const tot = rows.reduce((t, r) => ({ o: t.o + r.opening, d: t.d + r.dr, c: t.c + r.cr, cl: t.cl + r.closing }), { o: 0, d: 0, c: 0, cl: 0 });
      doc.autoTable({ ..._tableBase, startY: y,
        head: [['Particulars', 'Opening Balance', 'Debit', 'Credit', 'Closing Balance']],
        body: rows.map(r => [r.name, _drcr(r.opening), r.dr ? _n2(r.dr) : '', r.cr ? _n2(r.cr) : '', _drcr(r.closing)]),
        foot: [['Grand Total', _drcr(tot.o), _n2(tot.d), _n2(tot.c), _drcr(tot.cl)]],
        columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 32, halign: 'right' }, 2: { cellWidth: 30, halign: 'right' }, 3: { cellWidth: 30, halign: 'right' }, 4: { cellWidth: 34, halign: 'right' } },
        didParseCell: c => { if (c.section !== 'body' && c.column.index > 0) c.cell.styles.halign = 'right'; },
      });
      file = `${GROUPS[S.group].short}_Summary`;
    } else {
      const L = _ledger(S.group, S.id, S.from, S.to);
      const kind = S.view === 'monthly' ? 'Monthly Summary' : (S.group === 'bank' ? 'Bank / Cash Book' : 'Ledger Account');
      const y = _pdfHeader(doc, [[led.name, true, 11], ...(led.sub ? [[led.sub, false, 8.5]] : []), [kind, false, 9], [period, false, 9]]);
      if (S.view === 'monthly') {
        const M = _monthly(L, S.from, S.to);
        doc.autoTable({ ..._tableBase, startY: y,
          head: [['Particulars', 'Debit', 'Credit', 'Closing Balance']],
          body: [[{ content: 'Opening Balance', styles: { fontStyle: 'bold' } }, '', '', { content: _drcr(L.opening), styles: { fontStyle: 'bold' } }], ...M.map(m => [m.label, m.dr ? _n2(m.dr) : '', m.cr ? _n2(m.cr) : '', _drcr(m.bal)])],
          foot: [['Grand Total', _n2(L.dr), _n2(L.cr), _drcr(L.closing)]],
          columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 38, halign: 'right' }, 2: { cellWidth: 38, halign: 'right' }, 3: { cellWidth: 40, halign: 'right' } },
          didParseCell: c => { if (c.section !== 'body' && c.column.index > 0) c.cell.styles.halign = 'right'; },
        });
      } else {
        const body = [[_td(S.from), { content: 'Opening Balance', styles: { fontStyle: 'bold' } }, '', '', L.opening > 0.005 ? _n2(L.opening) : '', L.opening < -0.005 ? _n2(-L.opening) : '', _drcr(L.opening)]];
        L.rows.forEach(r => body.push([_td(r.date), (r.dr ? 'To  ' : 'By  ') + r.part + (r.narr ? '\n      ' + r.narr : ''), r.vchType, r.vchNo, r.dr ? _n2(r.dr) : '', r.cr ? _n2(r.cr) : '', _drcr(r.bal)]));
        doc.autoTable({ ..._tableBase, startY: y,
          head: [['Date', 'Particulars', 'Vch Type', 'Vch No.', 'Debit', 'Credit', 'Balance']],
          body,
          foot: [['', { content: 'Current Total', styles: { halign: 'right' } }, '', '', _n2(L.dr), _n2(L.cr), ''],
                 ['', { content: 'Closing Balance', styles: { halign: 'right' } }, '', '', L.closing > 0.005 ? _n2(L.closing) : '', L.closing < -0.005 ? _n2(-L.closing) : '', _drcr(L.closing)]],
          columnStyles: { 0: { cellWidth: 21 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 19 }, 3: { cellWidth: 27 }, 4: { cellWidth: 24, halign: 'right' }, 5: { cellWidth: 24, halign: 'right' }, 6: { cellWidth: 27, halign: 'right' } },
          didParseCell: c => { if (c.section !== 'body' && c.column.index >= 4) c.cell.styles.halign = 'right'; if (c.section === 'body' && c.column.index === 1 && /\n/.test(c.cell.raw || '')) c.cell.styles.fontSize = 8; },
        });
      }
      file = led.name.replace(/[\\/:*?"<>|]/g, '-') + (S.view === 'monthly' ? '_Monthly' : '_Ledger');
    }
    _pdfFooter(doc);
    mobileSavePDF(doc, `${file}_${S.from}_to_${S.to}.pdf`);
  } catch (e) { console.error(e); showToast('PDF error: ' + e.message, 'error'); }
};

// ═══════════════ EXCEL ═══════════════

window._ldgExcel = function () {
  if (!window.XLSX) return showToast('Excel library still loading — try again in a moment', 'warning');
  try {
    const cp = state.companyProfile || {};
    const led = S.id ? _ledgersOf(S.group).find(l => l.id === S.id) : null;
    const aoa = [[cp.CompanyName || ''], [cp.Address || '']];
    let file, cols;
    if (!led) {
      const rows = _summaryRows();
      aoa.push([GROUPS[S.group].label + ' — Group Summary'], [`${_td(S.from)} to ${_td(S.to)}`], [],
        ['Particulars', 'Opening Balance', 'Dr/Cr', 'Debit', 'Credit', 'Closing Balance', 'Dr/Cr']);
      const sign = b => Math.abs(b) < 0.005 ? '' : (b < 0 ? 'Cr' : 'Dr');
      rows.forEach(r => aoa.push([r.name, +Math.abs(r.opening).toFixed(2), sign(r.opening), +r.dr.toFixed(2), +r.cr.toFixed(2), +Math.abs(r.closing).toFixed(2), sign(r.closing)]));
      const t = rows.reduce((a, r) => ({ o: a.o + r.opening, d: a.d + r.dr, c: a.c + r.cr, cl: a.cl + r.closing }), { o: 0, d: 0, c: 0, cl: 0 });
      aoa.push(['Grand Total', +Math.abs(t.o).toFixed(2), sign(t.o), +t.d.toFixed(2), +t.c.toFixed(2), +Math.abs(t.cl).toFixed(2), sign(t.cl)]);
      file = `${GROUPS[S.group].short}_Summary`; cols = [34, 16, 6, 14, 14, 16, 6];
    } else {
      const L = _ledger(S.group, S.id, S.from, S.to);
      const sign = b => Math.abs(b) < 0.005 ? '' : (b < 0 ? 'Cr' : 'Dr');
      aoa.push(['Ledger: ' + led.name], [`${_td(S.from)} to ${_td(S.to)}`], []);
      if (S.view === 'monthly') {
        aoa.push(['Particulars', 'Debit', 'Credit', 'Closing Balance', 'Dr/Cr'], ['Opening Balance', '', '', +Math.abs(L.opening).toFixed(2), sign(L.opening)]);
        _monthly(L, S.from, S.to).forEach(m => aoa.push([m.label, +m.dr.toFixed(2), +m.cr.toFixed(2), +Math.abs(m.bal).toFixed(2), sign(m.bal)]));
        aoa.push(['Grand Total', +L.dr.toFixed(2), +L.cr.toFixed(2), +Math.abs(L.closing).toFixed(2), sign(L.closing)]);
        cols = [24, 14, 14, 16, 6];
      } else {
        aoa.push(['Date', 'Particulars', 'Narration', 'Vch Type', 'Vch No.', 'Debit', 'Credit', 'Balance', 'Dr/Cr'],
          [S.from, 'Opening Balance', '', '', '', L.opening > 0 ? +L.opening.toFixed(2) : '', L.opening < 0 ? +(-L.opening).toFixed(2) : '', +Math.abs(L.opening).toFixed(2), sign(L.opening)]);
        L.rows.forEach(r => aoa.push([r.date, (r.dr ? 'To ' : 'By ') + r.part, r.narr, r.vchType, r.vchNo, r.dr || '', r.cr || '', +Math.abs(r.bal).toFixed(2), sign(r.bal)]));
        aoa.push(['', 'Current Total', '', '', '', +L.dr.toFixed(2), +L.cr.toFixed(2), '', ''],
          ['', 'Closing Balance', '', '', '', L.closing > 0 ? +L.closing.toFixed(2) : '', L.closing < 0 ? +(-L.closing).toFixed(2) : '', +Math.abs(L.closing).toFixed(2), sign(L.closing)]);
        cols = [11, 30, 30, 11, 14, 14, 14, 14, 6];
      }
      file = led.name.replace(/[\\/:*?"<>|]/g, '-') + (S.view === 'monthly' ? '_Monthly' : '_Ledger');
    }
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = cols.map(w => ({ wch: w }));
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
    mobileSaveXLSX(wb, `${file}_${S.from}_to_${S.to}.xlsx`);
  } catch (e) { console.error(e); showToast('Excel error: ' + e.message, 'error'); }
};

// Exposed for tests.
export const _ledgerInternals = { _accountEntries, _partyEntries, _ledger, _monthly, _summary };
