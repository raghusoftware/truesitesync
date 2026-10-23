/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Parties Ledger
 * ═══════════════════════════════════════════════════════════
 * Unified ledger for clients/vendors/labour: list, per-party
 * transactions, edit/delete, and receipt PDF. Extracted from ui.js.
 * Navigation (switchView) reached via window.
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData, keepOnly } from './state.js';
import { partyRows, partyEntries, partyTotals, balanceSide, filterParties, TYPE_LABEL } from './partyCalc.js';
import { deductionTotal } from './deductions.js';
import { showToast, getCurrencySymbol, pdfMoney, getCompanyHeaderForPDF, mobileSavePDF, populateDropdowns, getTerm, getTaxConfig, printReport } from './utils.js';

// ── Party screens: list (summary · search · type chips · cards) and one
//    party's entries with Payment In / Payment Out at the bottom. Balances and
//    entries come from partyCalc.js.
let _pq = '', _pchip = 'All', _eq = '';
const _pe = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _pm = (n) => getCurrencySymbol() + (Math.abs(Number(n) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const _SEARCH_IC = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
const _SIDE = { receivable: ['Receivable', 'var(--ts-green)'], payable: ['Payable', 'var(--ts-red)'], settled: ['Settled', 'var(--ts-muted)'] };

export function renderPartiesList() {
  const root = document.getElementById('partyRoot');
  if (!root) return;
  if (state.currentSelectedParty) { renderPartyTransactions(); return; }
  const rows = partyRows(state);
  const tot = partyTotals(rows);
  const list = filterParties(rows, { q: _pq, type: _pchip });
  const count = (t) => t === 'All' ? rows.length : rows.filter(r => r.type === t).length;
  const chips = [['All', 'All'], ['Client', 'Clients'], ['Vendor', 'Suppliers'], ['Labour', 'Labour'], ['Contractor', 'Contractors']]
    .filter(([k]) => k === 'All' || count(k))
    .map(([k, l]) => `<button type="button" class="ts-chip ${_pchip === k ? 'on' : ''}" onclick="window._partyChip('${k}')">${l}<b>${count(k)}</b></button>`).join('');
  const cards = list.map(r => {
    const side = balanceSide(r), [lbl, col] = _SIDE[side];
    return `<div class="pt-card" style="border-left-color:${col}" role="button" tabindex="0" onclick="selectParty('${_pe(r.id)}','${r.type}')" onkeydown="if(event.key==='Enter')this.click()">
      <div class="pt-card-h"><b>${_pe(r.name)}</b><span class="pt-go">→</span></div>
      <div class="pt-card-r"><div><small>Party Type</small><span>${_pe(TYPE_LABEL[r.type] || r.type)}${r.trade ? ' · ' + _pe(r.trade) : ''}</span></div>
        <div style="text-align:right"><small>${lbl}</small><span style="color:${col};font-weight:700">${_pm(r.balance)}</span></div></div>
    </div>`;
  }).join('');
  const keepFocus = document.activeElement && document.activeElement.id === 'partySearch';
  root.innerHTML = `<div class="ts-page">
    <div class="tsp-sum" style="grid-template-columns:repeat(2,1fr)">
      <div style="text-align:left;padding-left:16px !important"><small>Receivable</small><b style="color:var(--ts-green)">${_pm(tot.receivable)}</b></div>
      <div style="text-align:right;padding-right:16px !important"><small>Payable</small><b style="color:var(--ts-red)">${_pm(tot.payable)}</b></div>
    </div>
    <div class="ts-search">${_SEARCH_IC}<input id="partySearch" type="search" placeholder="Search party" value="${_pe(_pq)}" oninput="window._partySearch(this.value)" autocomplete="off"></div>
    <div class="ts-chips">${chips}</div>
    ${list.length ? `<div class="pt-list">${cards}</div>` : `<div class="ts-empty"><div class="ts-emo" data-keep-emoji>🤝</div><h3>${rows.length ? 'No party found' : 'No parties yet'}</h3>
      ${rows.length ? '' : '<p style="margin-bottom:18px">Clients, suppliers, labour and contractors show here with what you owe and what you are owed.</p><button type="button" class="ts-btn" onclick="window._addPartyChooser&&window._addPartyChooser()">+ Add Party</button>'}</div>`}
  </div>`;
  if (keepFocus) { const i = document.getElementById('partySearch'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}

function _findPartyName(id, type) {
  const list = type === 'Client' ? state.clients : type === 'Vendor' ? state.vendors : type === 'Labour' ? state.labourMaster : state.labourContractors;
  return ((list || []).find(x => x.id === id) || {}).name || '';
}

/** One party: header card, entries (newest first), action bar. */
export function renderPartyTransactions() {
  const root = document.getElementById('partyRoot');
  const sel = state.currentSelectedParty;
  if (!root || !sel) return;
  const { id, type } = sel;
  const name = _findPartyName(id, type);
  if (!name && type !== 'Contractor') { state.currentSelectedParty = null; renderPartiesList(); return; }
  const row = partyRows(state).find(r => r.id === id && r.type === type) || { id, type, balance: 0 };
  const side = balanceSide(row), [lbl, col] = _SIDE[side];
  const all = partyEntries(state, id, type);
  const q = _eq.trim().toLowerCase();
  const entries = all.filter(e => !q || [e.type, e.number, e.date, String(e.total)].some(v => String(v || '').toLowerCase().includes(q))).reverse();
  const party = _findParty(id, type) || {};
  const ini = String(name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const rows = entries.map(e => {
    const out = type === 'Client' ? !e.isDebit : e.isDebit; // money moved: payment rows
    const isPay = /Payment/.test(e.type);
    const ded = e.rec && deductionTotal(e.rec) > 0 ? `<div class="pt-e-ded">incl. ${_pm(deductionTotal(e.rec))} deductions (${_pe(e.rec.deductions.map(d => d.label).join(', '))})</div>` : '';
    return `<div class="pt-entry" role="button" tabindex="0" onclick="window._partyEntryMenu('${e.src}','${_pe(e.id)}')">
      <div class="pt-e-ic ${isPay ? (out ? 'in' : 'out') : 'bill'}">${isPay ? (type === 'Client' ? '↙' : '↗') : '🧾'}</div>
      <div class="pt-e-m"><b>${_pe(e.type)}</b><small>${_pe(e.number)}${e.date ? ' · ' + _pe(e.date) : ''}</small>${ded}</div>
      <div class="pt-e-a"><b>${_pm(e.total)}</b><small>Bal ${_pm(e.running)}</small></div>
    </div>`;
  }).join('');
  // Context actions: money in (green) left, money out (red) right.
  const act = {
    Client: [['in', '↙ Payment In', `window._pmtStart&&window._pmtStart('in',{payerType:'client',id:'${id}'})`], ['out', '+ Sale Invoice', "window.openSaleInvoiceForm?window.openSaleInvoiceForm():switchView('salesLedgerView')"]],
    Vendor: [['in', '+ Purchase Bill', "window.openPurchaseFormPanel?window.openPurchaseFormPanel():switchView('purchaseBillsView')"], ['out', '↗ Payment Out', `window._pmtStart&&window._pmtStart('out',{payeeType:'vendor',id:'${id}'})`]],
    Labour: [['in', '+ Advance', 'window._recordAdvance&&window._recordAdvance()'], ['out', '↗ Payment Out', `openLabourPaymentModal('${id}')`]],
    Contractor: [['in', 'Pay Gang Wages', `window._payContractor&&window._payContractor('${id}')`], ['out', '↗ Payment Out', `window._pmtStart&&window._pmtStart('out',{payeeType:'contractor',id:'${id}'})`]],
  }[type] || [];
  const keepFocus = document.activeElement && document.activeElement.id === 'partyEntrySearch';
  root.innerHTML = `<div class="ts-page">
    <div class="pt-head">
      <div class="pt-av">${_pe(ini)}</div>
      <div style="flex:1;min-width:0"><b class="pt-name">${_pe(name)}</b><small>${_pe(TYPE_LABEL[type] || type)}${party.phone || party.contact ? ' · ' + _pe(party.phone || party.contact) : ''}</small></div>
      <div style="text-align:right"><b style="color:${col};font-size:17px">${_pm(row.balance)}</b><small style="display:block;color:var(--ts-muted);font-size:12px">${lbl}</small></div>
      <button type="button" class="ts-kebab" onclick="window._partyMenu()" aria-label="Party options"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>
    </div>
    <div class="ts-search" style="margin-top:12px">${_SEARCH_IC}<input id="partyEntrySearch" type="search" placeholder="Search entry" value="${_pe(_eq)}" oninput="window._partyEntrySearch(this.value)" autocomplete="off"></div>
    <div class="pt-entries">${rows || `<div class="ts-empty"><div class="ts-emo" data-keep-emoji>🔍</div><h3>No entry found</h3></div>`}</div>
    <div id="partyLedgerPrintZone" hidden>${_printTable(name, type, all)}</div>
    <div class="ts-actbar">${act.map(([k, l, fn]) => `<button type="button" class="ts-act ${k}" onclick="${fn}">${l}</button>`).join('')}</div>
  </div>`;
  if (keepFocus) { const i = document.getElementById('partyEntrySearch'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}

function _printTable(name, type, entries) {
  const r = entries.map(e => `<tr><td>${_pe(e.date)}</td><td>${_pe(e.type)}</td><td>${_pe(e.number)}</td><td style="text-align:right">${_pm(e.total)}</td><td style="text-align:right">${_pm(e.running)}${e.running < 0 ? ' (Adv)' : ''}</td></tr>`).join('');
  return `<h3>${_pe(name)} — ${_pe(TYPE_LABEL[type] || type)} ledger</h3><table style="width:100%;border-collapse:collapse" border="1" cellpadding="6">
    <thead><tr><th>Date</th><th>Type</th><th>Number / Ref</th><th>Amount</th><th>Balance</th></tr></thead><tbody>${r}</tbody></table>`;
}

window._partyChip = (c) => { _pchip = c; renderPartiesList(); };
window._partySearch = (q) => { _pq = q; renderPartiesList(); };
window._partyEntrySearch = (q) => { _eq = q; renderPartyTransactions(); };
window._partyBack = () => { state.currentSelectedParty = null; renderPartiesList(); window.shellSectionChanged?.(); };
window.openPartyDetail = (id, type) => selectParty(id, type);

/** Tap an entry: open it in its own form, receipt, delete. */
window._partyEntryMenu = function (src, id) {
  if (!src || !id) return;
  const opener = { saleInvoices: 'openSaleInvoiceForm', vendorMaterials: 'openPurchaseFormPanel', abstracts: 'openAbstractEditor', invoices: 'openInvoiceInfo' }[src];
  const editable = ['paymentsIn', 'vendorPayments', 'labourPayments', 'labourSalaries'].includes(src);
  const items = [];
  if (opener) items.push({ icon: '📂', title: 'Open', desc: 'View or edit this entry', run: () => window[opener]?.(id) });
  if (editable) items.push({ icon: '✏️', title: 'Edit', desc: 'Change amount, date or note', run: () => window._editPartyTx(src, id) });
  if (['paymentsIn', 'vendorPayments', 'labourPayments', 'expenses', 'labourAdvances'].includes(src)) items.push({ icon: '🧾', title: 'Receipt / voucher', desc: 'Preview & download PDF', run: () => window._partyReceipt(src, id) });
  if (src !== 'workMeasurements') items.push({ icon: '🗑️', title: 'Delete', desc: 'Remove this entry', danger: true, run: () => window._deletePartyTx(src, id) });
  if (!items.length) return;
  window.shellSheet?.('Entry', items);
};

window._partyMenu = function () {
  const sel = state.currentSelectedParty; if (!sel) return;
  const { id, type } = sel;
  const p = _findParty(id, type) || {};
  const phone = String(p.phone || p.contact || '').replace(/[^\d+]/g, '');
  const items = [];
  if (phone) items.push({ icon: '📞', title: 'Call', desc: phone, run: () => { location.href = 'tel:' + phone; } });
  items.push({ icon: '🖨️', title: 'Print / share statement', desc: 'Full ledger with running balance', run: () => printReport('partyLedgerPrintZone', _findPartyName(id, type) + ' Ledger') });
  if (type !== 'Contractor') {
    items.push({ icon: '✏️', title: 'Edit party', desc: 'Name, phone, GST, address, terms', run: () => _editParty(id, type) });
    items.push({ icon: '🗑️', title: 'Delete party', desc: 'Moves it to the Recycle Bin', danger: true, run: () => _deleteParty(id, type) });
  }
  window.shellSheet?.(_findPartyName(id, type) || 'Party', items);
};

/** Edit an editable transaction. Routes each src to its native form prefilled,
 *  matching the new-entry experience. Falls back to a prompt-based edit only
 *  if the corresponding form isn't loaded yet. */
window._editPartyTx = function(src, id) {
  const rec = (state[src] || []).find(x => x.id === id);
  if (!rec) return;
  // Route to native forms by source.
  if (src === 'paymentsIn' && typeof window.openPaymentInForm === 'function') {
    try { window.openPaymentInForm(id); return; } catch (e) { console.warn('[ledger edit pin]', e); }
  }
  if (src === 'vendorPayments' && typeof window.openPaymentOutForm === 'function') {
    try { window.openPaymentOutForm(id); return; } catch (e) { console.warn('[ledger edit po]', e); }
  }
  if (src === 'labourPayments' && typeof window.openLabourPaymentModal === 'function') {
    try { window.openLabourPaymentModal(null, id); return; } catch (e) { console.warn('[ledger edit lp]', e); }
  }
  if (src === 'saleInvoices' && typeof window.openSaleInvoiceForm === 'function') {
    try { window.openSaleInvoiceForm(id); return; } catch (e) { console.warn('[ledger edit si]', e); }
  }
  // Fallback: legacy prompt-based edit (preserves existing behaviour for unknown sources).
  const amount = prompt('Amount (' + getCurrencySymbol().trim() + '):', rec.amount);
  if (amount === null) return;
  if (isNaN(amount) || parseFloat(amount) <= 0) { showToast('Invalid amount', 'error'); return; }
  rec.amount = parseFloat(amount);
  const date = prompt('Date (YYYY-MM-DD):', rec.date);
  if (date) rec.date = date;
  const ref = prompt('Reference / Note:', rec.ref || '');
  if (ref !== null) rec.ref = ref;
  saveAllData();
  renderPartiesList();
  showToast('Transaction updated', 'success');
};

/** Delete a transaction */
window._deletePartyTx = function(src, id) {
  const labels = { paymentsIn: 'receipt', vendorPayments: 'vendor payment', labourPayments: 'labour payment', vendorMaterials: 'purchase bill', abstracts: 'abstract', invoices: 'invoice', labourSalaries: 'salary entry' };
  if (!confirm(`Delete this ${labels[src] || 'transaction'}? This cannot be undone.`)) return;
  // keepOnly records a tombstone so the deletion can't sync back from the cloud.
  keepOnly(src, x => x.id !== id);
  saveAllData();
  renderPartiesList();
  showToast('Transaction deleted', 'error');
};

/** Preview + download a payment receipt PDF */
window._partyReceipt = function(src, id) {
  const rec = (state[src] || []).find(x => x.id === id);
  if (!rec) { showToast('Record not found', 'error'); return; }
  const { type } = state.currentSelectedParty || {};
  const partyId = state.currentSelectedParty?.id;
  let partyName = '';
  if (type === 'Client') partyName = state.clients.find(c => c.id === partyId)?.name || '';
  else if (type === 'Vendor') partyName = state.vendors.find(v => v.id === partyId)?.name || '';
  else if (type === 'Labour') partyName = state.labourMaster.find(l => l.id === partyId)?.name || '';

  const amount = (parseFloat(rec.amount) || rec.totalAmount || rec.taxAmount || 0);
  const isReceipt = src === 'paymentsIn';
  const docTitle = isReceipt ? 'RECEIPT' : (src === 'vendorPayments' || src === 'labourPayments') ? 'PAYMENT VOUCHER' : 'TRANSACTION';
  const acc = state.accounts.find(a => a.id === rec.accountId);

  const doc = new window.jspdf.jsPDF('p', 'mm', 'a5');
  let y = getCompanyHeaderForPDF(doc);
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 58, 138);
  doc.text(docTitle, 74, y, null, null, 'center'); y += 10;
  doc.setDrawColor(220); doc.line(12, y, 136, y); y += 8;

  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(60);
  const row = (label, val) => { doc.setFont('helvetica','bold'); doc.text(label, 14, y); doc.setFont('helvetica','normal'); doc.text(String(val), 60, y); y += 8; };
  row(type === 'Client' ? 'Received From:' : 'Paid To:', partyName);
  row('Date:', rec.date || '—');
  row('Reference:', rec.ref || rec.billNo || rec.invoiceNum || '—');
  if (acc) row('Via Account:', acc.name);
  y += 4;
  doc.setFillColor(240, 249, 255); doc.rect(12, y - 4, 124, 14, 'F');
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(5, 150, 105);
  doc.text('Amount:', 16, y + 4);
  doc.text(pdfMoney(amount), 132, y + 4, null, null, 'right');
  y += 20;
  doc.setFontSize(8); doc.setTextColor(120); doc.setFont('helvetica', 'normal');
  doc.text('This is a computer-generated receipt.', 74, y, null, null, 'center');
  y += 18;
  doc.setDrawColor(180); doc.line(90, y, 134, y); y += 5;
  doc.setFontSize(9); doc.text('Authorised Signatory', 112, y, null, null, 'center');

  mobileSavePDF(doc, `${docTitle}_${partyName.replace(/\s+/g, '_')}_${rec.date || ''}.pdf`);
  showToast('Receipt generated', 'success');
};

export function selectParty(id, type) {
  state.currentSelectedParty = { id, type };
  _eq = '';
  renderPartyTransactions();
  window.shellSectionChanged?.();
}

/** Prompt to edit a party's payment terms (credit days) and log any change. */
function _editPartyTerms(party, kind) {
  const cur = party.paymentTermsDays != null ? party.paymentTermsDays : '';
  const label = kind === 'vendor' ? 'Payment terms — days they give YOU to pay:' : 'Payment terms — days you give this client to pay:';
  const s = prompt(label, cur);
  if (s === null) return; // cancelled — leave unchanged
  const nd = s.trim() === '' ? null : Math.max(0, parseInt(s) || 0);
  const prev = party.paymentTermsDays != null ? party.paymentTermsDays : null;
  if (nd === prev) return;
  if (!Array.isArray(party.termsHistory)) party.termsHistory = [];
  let reason = '';
  if (prev != null && nd != null) reason = prompt(`Terms changing ${prev} → ${nd} days. Reason? (optional)`, '') || '';
  party.termsHistory.push({ date: new Date().toISOString(), from: prev, to: nd, reason: reason || (prev == null ? 'Terms set' : 'Terms changed') });
  party.paymentTermsDays = nd;
}

function _findParty(id, type) {
  if (type === 'Client') return (state.clients || []).find(x => x.id === id);
  if (type === 'Vendor') return (state.vendors || []).find(x => x.id === id);
  if (type === 'Labour') return (state.labourMaster || []).find(x => x.id === id);
  if (type === 'Contractor') return (state.labourContractors || []).find(x => x.id === id);
  return null;
}

const _peEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function _peField(label, id, val, opts = {}) {
  const span = opts.full ? 'sm:col-span-2' : '';
  const mono = opts.mono ? 'font-mono uppercase' : '';
  return `<div class="${span}">
    <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">${label}</label>
    <input id="${id}" type="${opts.type || 'text'}" value="${_peEsc(val)}" placeholder="${opts.ph || ''}" ${opts.min != null ? `min="${opts.min}"` : ''}
      class="w-full p-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${mono}">
  </div>`;
}

/** Nice modal to edit a party (Client / Vendor / Labour). Replaces the old prompt() chain. */
export function _editParty(id, type) {
  const rec = _findParty(id, type);
  if (!rec) return showToast(type + ' not found', 'error');
  window._partyEditCtx = { id, type };
  document.getElementById('partyEditOverlay')?.remove();

  const accent = type === 'Client' ? '#2563eb' : type === 'Vendor' ? '#ea580c' : '#d97706';
  const icon = type === 'Client' ? '🏢' : type === 'Vendor' ? '🚚' : '👷';

  let fields;
  if (type === 'Labour') {
    fields = [
      _peField('Labour Name *', 'pe_name', rec.name, { full: true, ph: 'Full name' }),
      _peField('Phone', 'pe_phone', rec.phone, { ph: 'Mobile number' }),
      _peField('Daily Rate', 'pe_rate', rec.dailyRate, { type: 'number', min: 0, ph: '0' }),
      _peField('Skill / Trade', 'pe_skill', rec.skill, { full: true, ph: 'e.g. Mason, Carpenter, Helper' })
    ].join('');
  } else {
    const isClient = type === 'Client';
    fields = [
      _peField((isClient ? 'Client' : 'Vendor') + ' / Company Name *', 'pe_name', rec.name, { full: true, ph: 'e.g. L&T Construction' }),
      _peField('Contact Person', 'pe_contact', rec.contact, { ph: 'Contact person' }),
      _peField('Phone', 'pe_phone', rec.phone, { ph: 'Mobile / Phone' }),
      _peField('Email', 'pe_email', rec.email, { type: 'email', ph: 'name@email.com' }),
      _peField(getTerm('taxId'), 'pe_gst', rec.gst, { mono: true, ph: getTaxConfig().mode === 'gst' ? '22AAAAA0000A1Z5' : '' }),
      _peField('PAN', 'pe_pan', rec.pan, { mono: true, ph: 'ABCDE1234F' }),
      _peField('Payment Terms — Credit Days', 'pe_terms', rec.paymentTermsDays, { type: 'number', min: 0, ph: 'e.g. 30' }),
      isClient ? '' : `<div>
        <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Terms Start From</label>
        <select id="pe_termsbasis" class="w-full p-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 bg-white">
          <option value="bill" ${rec.termsBasis !== 'delivery' ? 'selected' : ''}>Bill / Invoice date</option>
          <option value="delivery" ${rec.termsBasis === 'delivery' ? 'selected' : ''}>Delivery / GRN date</option>
        </select></div>`,
      isClient ? _peField('Credit Limit', 'pe_credit', rec.creditLimit, { type: 'number', min: 0, ph: 'Max outstanding' }) : '',
      _peField('Address', 'pe_addr', rec.address, { full: true, ph: 'Full address' })
    ].join('');
  }

  const html = `
  <div id="partyEditOverlay" style="position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:199999;display:flex;align-items:center;justify-content:center;padding:16px;">
    <div style="background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 24px 70px rgba(0,0,0,.35);">
      <div style="padding:18px 22px;border-bottom:1px solid #e2e8f0;border-top:4px solid ${accent};border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center;">
        <div class="flex items-center gap-2.5">
          <span style="font-size:22px;">${icon}</span>
          <div>
            <h3 class="font-extrabold text-slate-800 text-lg leading-tight">Edit ${type}</h3>
            <p class="text-xs text-slate-400 font-medium">${_peEsc(rec.name || '')}</p>
          </div>
        </div>
        <button onclick="window._closePartyEdit()" class="text-slate-400 hover:text-red-500 font-bold text-2xl leading-none">&times;</button>
      </div>
      <div style="padding:20px 22px;">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">${fields}</div>
      </div>
      <div style="padding:14px 22px;border-top:1px solid #e2e8f0;display:flex;gap:10px;justify-content:flex-end;">
        <button onclick="window._closePartyEdit()" class="px-4 py-2 rounded-lg font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200">Cancel</button>
        <button onclick="window._savePartyEdit()" class="px-6 py-2 rounded-lg font-bold text-sm text-white" style="background:${accent};">💾 Save ${type}</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(() => document.getElementById('pe_name')?.focus(), 30);
}

window._closePartyEdit = function () { document.getElementById('partyEditOverlay')?.remove(); window._partyEditCtx = null; };

window._savePartyEdit = function () {
  const ctx = window._partyEditCtx;
  if (!ctx) return;
  const { id, type } = ctx;
  const rec = _findParty(id, type);
  if (!rec) return window._closePartyEdit();
  const V = fid => (document.getElementById(fid)?.value ?? '').trim();
  const name = V('pe_name');
  if (!name) return showToast('Name is required', 'error');
  rec.name = name;

  if (type === 'Labour') {
    rec.phone = V('pe_phone');
    rec.dailyRate = parseFloat(V('pe_rate')) || 0;
    rec.skill = V('pe_skill');
  } else {
    rec.contact = V('pe_contact');
    rec.phone = V('pe_phone');
    rec.email = V('pe_email');
    rec.gst = V('pe_gst');
    rec.pan = V('pe_pan');
    rec.address = V('pe_addr');
    if (type === 'Client') rec.creditLimit = parseFloat(V('pe_credit')) || 0;
    // Payment terms — record a history entry only when the value actually changes.
    const raw = V('pe_terms');
    const nd = raw === '' ? null : Math.max(0, parseInt(raw) || 0);
    const prev = rec.paymentTermsDays != null ? rec.paymentTermsDays : null;
    if (nd !== prev) {
      if (!Array.isArray(rec.termsHistory)) rec.termsHistory = [];
      rec.termsHistory.push({ date: new Date().toISOString(), from: prev, to: nd, reason: prev == null ? 'Terms set' : 'Terms changed' });
      rec.paymentTermsDays = nd;
    }
    // Terms basis (vendors): count credit days from delivery/GRN date or bill date.
    if (type !== 'Client') { const tb = document.getElementById('pe_termsbasis')?.value; if (tb) rec.termsBasis = tb; }
  }

  // A client rename must reach the denormalized clientName stored on their sale
  // invoices (and re-attach any project-orphaned invoices), so old sales keep
  // showing under the updated name everywhere.
  if (type === 'Client' && typeof window.relinkOrphanedSaleClients === 'function') {
    try { window.relinkOrphanedSaleClients(); } catch {}
  }
  saveAllData();
  window._closePartyEdit();
  showToast(type + ' updated', 'success');
  renderPartiesList();
  populateDropdowns();
};

export function _deleteParty(id, type) {
  let name = '';
  if (type === 'Client') name = state.clients.find(x => x.id === id)?.name;
  else if (type === 'Vendor') name = state.vendors.find(x => x.id === id)?.name;
  else if (type === 'Labour') name = state.labourMaster.find(x => x.id === id)?.name;

  if (!confirm(`Delete "${name}" (${type})?\n\nThis will NOT delete their transactions (invoices, payments, etc). Only the party record will be removed.`)) return;

  // Route through the recycle bin so a tombstone is recorded. Without it, a stale
  // device (or an anti-clobber pull) that re-pushes the clients/vendors/labour array
  // would resurrect the deleted party — the "ghost deletion" bug. recycleDelete()
  // removes it from the source array, adds a bin entry, and persists+syncs both, so
  // reconcileRecycleBin() re-strips it after every load/pull/realtime.
  const stateKey = type === 'Client' ? 'clients' : type === 'Vendor' ? 'vendors' : type === 'Labour' ? 'labourMaster' : null;
  if (!stateKey) return;
  const moved = window.recycleDelete
    ? window.recycleDelete(stateKey, id, type, name)
    : (state[stateKey] = state[stateKey].filter(x => x.id !== id), saveAllData(), true); // fallback if bin unavailable
  if (!moved) { showToast(`Could not delete ${type}`, 'error'); return; }

  state.currentSelectedParty = null;
  showToast(`${type} "${name}" moved to Recycle Bin`, 'error');
  renderPartiesList();
  window.shellSectionChanged?.();
  populateDropdowns();
}

