/**
 * paymentsUI.js — Unified "Payments" page (Payment Out + Payment In).
 * Mobile-first; in the APK it replaces the Reports bottom-nav slot.
 *
 * Smart dropdowns: Pay-to type → name list; Pay-from → Main account or a petty-cash
 * custodian; Expense head → sub-head. Every save funnels through paymentsEngine so
 * Petty Cash and the Main Account always reconcile (see paymentsEngine.js).
 */
import { state, saveAllData } from './state.js';
import { showToast, formatINR } from './utils.js';
import {
  buildPaymentOut, buildPaymentIn, DEFAULT_EXPENSE_HEADS,
  accountBalance, custodianBalance,
} from './paymentsEngine.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _pid = () => state.currentProjectId || null;
const money = (n) => (typeof formatINR === 'function' ? formatINR(n) : '₹' + Math.round(n || 0).toLocaleString('en-IN'));

// Module UI state
const _ui = { mode: 'out', payeeType: 'vendor', source: 'account' };

/** Expense-head chart (editable). Seeded from defaults on first use. */
function heads() {
  if (!Array.isArray(state.expenseHeads) || !state.expenseHeads.length) {
    state.expenseHeads = DEFAULT_EXPENSE_HEADS.map(h => ({ head: h.head, subs: [...h.subs] }));
  }
  return state.expenseHeads;
}

/* ── list helpers ── */
const accounts = () => (state.accounts || []);
const custodians = () => (state.pettyCashCustodians || []).filter(c => !_pid() || !c.projectId || c.projectId === _pid());
const vendors = () => (state.vendors || []);
const labour = () => { const p = _pid(); const all = state.labourMaster || []; return p ? all.filter(l => l.projectId === p) : all; };
const contractors = () => (state.labourContractors || []);
const clients = () => (state.clients || []);

const PAYEE_LABELS = {
  vendor: 'Vendor / Supplier', labour: 'Labour', contractor: 'Contractor / Gang',
  expense: 'Expense head', equipment: 'Equipment (rental)', statutory: 'Statutory (GST/PF…)',
  owner: 'Owner / Drawings', pettyTopup: 'Petty-cash top-up',
};
const PAYER_LABELS = { client: 'Client receipt', other: 'Other income', owner: 'Owner / Capital', loan: 'Loan', custodianReturn: 'Petty-cash return' };

function _opts(list, idKey = 'id', nameKey = 'name', extra) {
  return list.map(x => `<option value="${esc(x[idKey])}">${esc(x[nameKey] || '—')}${extra ? extra(x) : ''}</option>`).join('');
}

/* ── render ── */
export function renderPaymentsHub() {
  const el = document.getElementById('paymentsHubView');
  if (!el) return;
  const acctStrip = accounts().map(a => `<span class="pmt-bal"><b>${esc(a.name)}</b> ${money(accountBalance(state, a.id))}</span>`).join('')
    + custodians().map(c => `<span class="pmt-bal pmt-bal-petty">👛 ${esc(c.name)} ${money(custodianBalance(state, c.id))}</span>`).join('')
    || '<span class="pmt-bal">No accounts yet — add one in Finance → Accounts.</span>';

  el.innerHTML = `
    <style>
      #paymentsHubView{padding:12px 12px 96px;max-width:640px;margin:0 auto}
      .pmt-balstrip{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
      .pmt-bal{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:999px;padding:6px 12px;font-size:12px;color:#334155;white-space:nowrap}
      .pmt-bal b{color:#0f172a}
      .pmt-bal-petty{background:#fef9c3;border-color:#fde68a}
      .pmt-seg{display:flex;gap:8px;margin-bottom:14px}
      .pmt-seg button{flex:1;padding:12px;border-radius:12px;border:2px solid #e2e8f0;background:#fff;font-weight:800;font-size:15px;cursor:pointer}
      .pmt-seg button.on-out{background:#fef2f2;border-color:#ef4444;color:#b91c1c}
      .pmt-seg button.on-in{background:#ecfdf5;border-color:#10b981;color:#047857}
      .pmt-card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px}
      .pmt-lbl{display:block;font-size:12px;font-weight:700;color:#64748b;margin:12px 0 5px}
      .pmt-in,.pmt-sel{width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px;font-size:15px;background:#fff;outline:none}
      .pmt-chips{display:flex;gap:6px;flex-wrap:wrap}
      .pmt-chip{padding:8px 12px;border-radius:999px;border:1px solid #cbd5e1;background:#fff;font-size:13px;font-weight:600;cursor:pointer}
      .pmt-chip.active{background:#0f172a;color:#fff;border-color:#0f172a}
      .pmt-row{display:flex;gap:10px}.pmt-row>*{flex:1}
      .pmt-save{width:100%;margin-top:16px;padding:14px;border:none;border-radius:12px;font-weight:800;font-size:16px;color:#fff;cursor:pointer}
      .pmt-save.out{background:#dc2626}.pmt-save.in{background:#059669}
      .pmt-hint{font-size:11px;color:#94a3b8;margin-top:4px}
      .pmt-recent{margin-top:18px}
      .pmt-rrow{display:flex;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px}
      .pmt-rrow .amt{font-weight:800}.pmt-rrow .out{color:#dc2626}.pmt-rrow .in{color:#059669}
      .pmt-sub{color:#94a3b8;font-size:11px}
      @media (prefers-color-scheme:dark){
        #paymentsHubView{color:#e2e8f0}.pmt-card{background:#0f1822;border-color:#243343}
        .pmt-bal{background:#16202c;border-color:#243343;color:#cbd5e1}.pmt-bal b{color:#fff}
        .pmt-in,.pmt-sel,.pmt-chip,.pmt-seg button{background:#0f1822;border-color:#31445a;color:#e2e8f0}
        .pmt-bal-petty{background:#3a2c15;border-color:#5a4a1f}
      }
    </style>
    <div class="pmt-balstrip">${acctStrip}</div>
    <div class="pmt-seg">
      <button id="pmtTabOut" class="${_ui.mode === 'out' ? 'on-out' : ''}" onclick="window._pmtSetMode('out')">↑ Payment Out</button>
      <button id="pmtTabIn" class="${_ui.mode === 'in' ? 'on-in' : ''}" onclick="window._pmtSetMode('in')">↓ Payment In</button>
    </div>
    <div class="pmt-card">${_ui.mode === 'out' ? _formOut() : _formIn()}</div>
    <div class="pmt-recent">${_recent()}</div>
  `;
  if (_ui.mode === 'out') { _syncPayeeUI(); _syncSourceUI(); }
}

function _formOut() {
  const chips = Object.keys(PAYEE_LABELS).map(k =>
    `<span class="pmt-chip ${_ui.payeeType === k ? 'active' : ''}" onclick="window._pmtSetPayee('${k}')">${esc(PAYEE_LABELS[k])}</span>`).join('');
  return `
    <label class="pmt-lbl">Pay to</label>
    <div class="pmt-chips">${chips}</div>

    <div id="pmtPayeeNameWrap">
      <label class="pmt-lbl" id="pmtPayeeNameLbl">Select</label>
      <select id="pmtPayeeName" class="pmt-sel"></select>
    </div>

    <div id="pmtHeadWrap" style="display:none">
      <div class="pmt-row">
        <div><label class="pmt-lbl">Head</label>
          <select id="pmtHead" class="pmt-sel" onchange="window._pmtHeadChange()"></select></div>
        <div><label class="pmt-lbl">Sub-head</label>
          <select id="pmtSub" class="pmt-sel"></select></div>
      </div>
    </div>

    <label class="pmt-lbl">Pay from</label>
    <div class="pmt-chips">
      <span class="pmt-chip ${_ui.source === 'account' ? 'active' : ''}" onclick="window._pmtSetSource('account')">🏦 Main account</span>
      <span class="pmt-chip ${_ui.source === 'petty' ? 'active' : ''}" onclick="window._pmtSetSource('petty')">👛 Petty cash</span>
    </div>
    <div id="pmtAccWrap" style="margin-top:6px"><select id="pmtAcc" class="pmt-sel">${_opts(accounts(), 'id', 'name', a => ' — ' + money(accountBalance(state, a.id)))}</select></div>
    <div id="pmtCustWrap" style="margin-top:6px;display:none"><select id="pmtCust" class="pmt-sel">${_opts(custodians(), 'id', 'name', c => ' — ' + money(custodianBalance(state, c.id)))}</select></div>

    <div class="pmt-row">
      <div><label class="pmt-lbl">Amount ₹</label><input id="pmtAmt" class="pmt-in" type="number" inputmode="decimal" placeholder="0"></div>
      <div><label class="pmt-lbl">Date</label><input id="pmtDate" class="pmt-in" type="date" value="${new Date().toISOString().split('T')[0]}"></div>
    </div>
    <label class="pmt-lbl">Reference / note</label>
    <input id="pmtRef" class="pmt-in" placeholder="e.g. diesel for JCB, bill no…">
    <button class="pmt-save out" onclick="window._pmtSaveOut()">Save Payment Out</button>
    <div class="pmt-hint">Paying from petty cash records who paid it and never double-debits the main account.</div>
  `;
}

function _formIn() {
  const chips = Object.keys(PAYER_LABELS).map(k =>
    `<span class="pmt-chip ${_ui.payerType === k ? 'active' : ''}" onclick="window._pmtSetPayer('${k}')">${esc(PAYER_LABELS[k])}</span>`).join('');
  if (!_ui.payerType) _ui.payerType = 'client';
  const showClient = _ui.payerType === 'client';
  const showCust = _ui.payerType === 'custodianReturn';
  return `
    <label class="pmt-lbl">Received from</label>
    <div class="pmt-chips">${chips}</div>
    ${showClient ? `<label class="pmt-lbl">Client</label><select id="pmtInName" class="pmt-sel">${_opts(clients())}</select>` : ''}
    ${showCust ? `<label class="pmt-lbl">Custodian returning cash</label><select id="pmtInName" class="pmt-sel">${_opts(custodians(), 'id', 'name', c => ' — ' + money(custodianBalance(state, c.id)))}</select>` : ''}
    <label class="pmt-lbl">${showCust ? 'Return to account' : 'Deposit to account'}</label>
    <select id="pmtInAcc" class="pmt-sel">${_opts(accounts(), 'id', 'name', a => ' — ' + money(accountBalance(state, a.id)))}</select>
    <div class="pmt-row">
      <div><label class="pmt-lbl">Amount ₹</label><input id="pmtInAmt" class="pmt-in" type="number" inputmode="decimal" placeholder="0"></div>
      <div><label class="pmt-lbl">Date</label><input id="pmtInDate" class="pmt-in" type="date" value="${new Date().toISOString().split('T')[0]}"></div>
    </div>
    <label class="pmt-lbl">Reference / note</label>
    <input id="pmtInRef" class="pmt-in" placeholder="e.g. RA-2 payment, advance…">
    <button class="pmt-save in" onclick="window._pmtSaveIn()">Save Payment In</button>
  `;
}

/* ── dependent-dropdown sync (no full re-render, keeps typed values) ── */
function _syncPayeeUI() {
  const t = _ui.payeeType;
  const nameWrap = document.getElementById('pmtPayeeNameWrap');
  const headWrap = document.getElementById('pmtHeadWrap');
  const lbl = document.getElementById('pmtPayeeNameLbl');
  const sel = document.getElementById('pmtPayeeName');
  const isExpense = (t === 'expense' || t === 'statutory' || t === 'owner' || t === 'equipment');
  const needsName = (t === 'vendor' || t === 'labour' || t === 'contractor' || t === 'equipment' || t === 'pettyTopup');
  if (nameWrap) nameWrap.style.display = needsName ? '' : 'none';
  if (headWrap) headWrap.style.display = (t === 'expense' || t === 'statutory' || t === 'owner') ? '' : 'none';
  if (needsName && sel && lbl) {
    let list = [], label = 'Select';
    if (t === 'vendor' || t === 'equipment') { list = vendors(); label = 'Vendor / Supplier'; }
    else if (t === 'labour') { list = labour(); label = 'Labour'; }
    else if (t === 'contractor') { list = contractors(); label = 'Contractor / Gang'; }
    else if (t === 'pettyTopup') { list = custodians(); label = 'Top up which custodian'; }
    lbl.textContent = label;
    sel.innerHTML = _opts(list);
  }
  if (t === 'expense' || t === 'statutory' || t === 'owner') _fillHeads();
  // top-up always comes from main account
  if (t === 'pettyTopup' && _ui.source === 'petty') { _ui.source = 'account'; }
  void isExpense;
}
function _fillHeads() {
  const h = document.getElementById('pmtHead'); if (!h) return;
  h.innerHTML = heads().map(x => `<option value="${esc(x.head)}">${esc(x.head)}</option>`).join('');
  _fillSubs();
}
function _fillSubs() {
  const h = document.getElementById('pmtHead'), s = document.getElementById('pmtSub'); if (!h || !s) return;
  const found = heads().find(x => x.head === h.value) || { subs: [] };
  s.innerHTML = ['<option value="">(none)</option>'].concat((found.subs || []).map(x => `<option value="${esc(x)}">${esc(x)}</option>`)).join('');
}
function _syncSourceUI() {
  const a = document.getElementById('pmtAccWrap'), c = document.getElementById('pmtCustWrap');
  if (a) a.style.display = _ui.source === 'account' ? '' : 'none';
  if (c) c.style.display = _ui.source === 'petty' ? '' : 'none';
}

/* ── window handlers ── */
function _pmtSetMode(m) { _ui.mode = m; renderPaymentsHub(); }
function _pmtSetPayee(t) { _ui.payeeType = t; renderPaymentsHub(); }
function _pmtSetSource(s) { _ui.source = s; renderPaymentsHub(); }
function _pmtSetPayer(t) { _ui.payerType = t; renderPaymentsHub(); }
function _pmtHeadChange() { _fillSubs(); }

function _val(id) { const e = document.getElementById(id); return e ? e.value : ''; }

function _pmtSaveOut() {
  const amount = parseFloat(_val('pmtAmt')) || 0;
  if (!(amount > 0)) return showToast('Enter a valid amount', 'error');
  const t = _ui.payeeType;
  const source = (t === 'pettyTopup') ? 'account' : _ui.source;
  if (source === 'account' && !accounts().length) return showToast('Add a bank/cash account first (Finance → Accounts)', 'error');
  if (source === 'petty' && !custodians().length) return showToast('Add a petty-cash custodian first', 'error');

  const acc = accounts().find(a => a.id === _val('pmtAcc'));
  const cust = custodians().find(c => c.id === _val('pmtCust'));
  const payeeSel = document.getElementById('pmtPayeeName');
  const payeeId = payeeSel ? payeeSel.value : '';
  const payeeName = payeeSel && payeeSel.selectedOptions[0] ? payeeSel.selectedOptions[0].textContent : '';

  const input = {
    payeeType: t, payeeId, payeeName, amount,
    date: _val('pmtDate'), ref: _val('pmtRef'), projectId: _pid(),
    source,
    accountId: acc?.id, accountName: acc?.name,
    custodianId: cust?.id,
    head: _val('pmtHead'), subHead: _val('pmtSub'),
  };
  if (t === 'pettyTopup') { input.payeeId = payeeId; input.accountId = acc?.id; input.accountName = acc?.name; }

  const { append } = buildPaymentOut(input);
  _appendAll(append);
  saveAllData();
  showToast('Payment recorded', 'success');
  renderPaymentsHub();
  try { window.renderPettyCash?.(); window.renderAccounts?.(); } catch {}
}

function _pmtSaveIn() {
  const amount = parseFloat(_val('pmtInAmt')) || 0;
  if (!(amount > 0)) return showToast('Enter a valid amount', 'error');
  if (!accounts().length) return showToast('Add a bank/cash account first', 'error');
  const acc = accounts().find(a => a.id === _val('pmtInAcc'));
  const nameSel = document.getElementById('pmtInName');
  const input = {
    payerType: _ui.payerType || 'client',
    payerId: nameSel ? nameSel.value : '',
    payerName: nameSel && nameSel.selectedOptions[0] ? nameSel.selectedOptions[0].textContent : '',
    amount, date: _val('pmtInDate'), ref: _val('pmtInRef'), projectId: _pid(),
    accountId: acc?.id, accountName: acc?.name,
  };
  const { append } = buildPaymentIn(input);
  _appendAll(append);
  saveAllData();
  showToast('Receipt recorded', 'success');
  renderPaymentsHub();
  try { window.renderPettyCash?.(); window.renderAccounts?.(); } catch {}
}

function _appendAll(append) {
  for (const k in append) {
    if (!append[k] || !append[k].length) continue;
    if (!Array.isArray(state[k])) state[k] = [];
    append[k].forEach(rec => { if (typeof window.stampCreate === 'function') window.stampCreate(rec); state[k].push(rec); });
  }
}

/* ── recent payments (with attribution) ── */
function _recent() {
  const rows = [];
  const pName = (arr, id, nk = 'name') => (state[arr] || []).find(x => x.id === id)?.[nk] || '';
  (state.vendorPayments || []).forEach(v => rows.push({ date: v.date, dir: 'out', amt: v.amount, who: 'Vendor: ' + (pName('vendors', v.vendorId) || v.ref || ''), via: v.source === 'petty' ? 'Petty · ' + (pName('pettyCashCustodians', v.custodianId)) : (pName('accounts', v.accountId)) }));
  (state.labourPayments || []).forEach(l => rows.push({ date: l.date, dir: 'out', amt: l.amount, who: 'Labour: ' + (pName('labourMaster', l.labourId) || l.ref || ''), via: l.source === 'petty' ? 'Petty · ' + (pName('pettyCashCustodians', l.custodianId)) : (pName('accounts', l.accountId)) }));
  (state.expenses || []).forEach(e => rows.push({ date: e.date, dir: 'out', amt: e.amount, who: (e.head || e.category || 'Expense') + (e.subHead ? ' · ' + e.subHead : ''), via: pName('accounts', e.accountId) }));
  (state.pettyCashTxns || []).forEach(t => {
    if (t.type === 'EXPENSE') rows.push({ date: t.date, dir: 'out', amt: t.amount, who: (t.head || t.payeeName || t.category || 'Petty expense') + (t.subHead ? ' · ' + t.subHead : ''), via: 'Petty · ' + (pName('pettyCashCustodians', t.custodianId)) });
    if (t.type === 'TRANSFER') rows.push({ date: t.date, dir: 'out', amt: t.amount, who: 'Top-up → ' + (pName('pettyCashCustodians', t.custodianId)), via: pName('accounts', t.fromAccountId) });
    if (t.type === 'RETURN') rows.push({ date: t.date, dir: 'in', amt: t.amount, who: 'Petty return ← ' + (pName('pettyCashCustodians', t.custodianId)), via: pName('accounts', t.toAccountId) });
  });
  (state.paymentsIn || []).forEach(p => rows.push({ date: p.date, dir: 'in', amt: p.amount, who: 'Receipt: ' + (pName('clients', p.clientId) || p.ref || ''), via: pName('accounts', p.accountId) }));
  (state.otherIncome || []).forEach(o => rows.push({ date: o.date, dir: 'in', amt: o.amount, who: 'Other income: ' + (o.source || ''), via: pName('accounts', o.accountId) }));
  rows.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const top = rows.slice(0, 25);
  if (!top.length) return '<div class="pmt-sub">No payments yet.</div>';
  return '<label class="pmt-lbl">Recent</label>' + top.map(r =>
    `<div class="pmt-rrow"><div>${esc(r.who)}<div class="pmt-sub">${esc(r.via || '')} · ${esc(r.date || '')}</div></div>
     <div class="amt ${r.dir}">${r.dir === 'out' ? '−' : '+'}${money(r.amt)}</div></div>`).join('');
}

/* ── self-bind for inline handlers ── */
if (typeof window !== 'undefined') {
  Object.assign(window, {
    renderPaymentsHub, _pmtSetMode, _pmtSetPayee, _pmtSetSource, _pmtSetPayer,
    _pmtHeadChange, _pmtSaveOut, _pmtSaveIn,
  });
}
