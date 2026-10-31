/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Sale documents (non-invoice)
 * ═══════════════════════════════════════════════════════════
 * Proforma invoice, payment-in (receipt), sale order, delivery
 * challan, sale return, sale fixed asset, other income.
 * Extracted from ui.js. Shared form chrome from formHelpers.js.
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { deductionsBlockHTML, initDeductions, readDeductions, loadDeductions, refreshBills, clientBills } from './deductionsUI.js';
import { settledAmount, deductionTotal } from './deductions.js';
import { showToast, getCurrencySymbol } from './utils.js';
import { _openFullScreenForm, _populateClientSelect, _populateAccountSelect, _addGenericFormRow, _calcGenericFormTotal, closeFullScreenForm, openFormModal, closeFormModal } from './formHelpers.js';
import { renderStyledInvoice, resolveInvoiceDesign } from './invoiceTemplates.js?v=2.0.3';
import { txCard, txMount } from './txList.js?v=1.0.0';
import { donutSVG, legendHTML, areaSVG, lastMonths, shortMoney, SERIES, NEUTRAL } from './financeViz.js?v=1.0.1';

/** New pro forma, or edit an existing one (editId): the same form, filled in. */
export function openProformaInvoiceForm(editId) {
  if (typeof editId !== 'string') editId = '';   // called from a click handler (event) → new
  const pi = editId ? (state.proformaInvoices || []).find(p => p.id === editId) : null;
  if (editId && !pi) { showToast('Proforma invoice not found', 'error'); return; }
  _populateClientSelect('piFormClient');
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  const panel = document.getElementById('proformaInvoiceFormPanel');
  if (panel) panel.dataset.editId = pi ? pi.id : '';
  const title = panel?.querySelector('h2'); if (title) title.textContent = pi ? `Edit Proforma Invoice ${pi.piNo || ''}` : 'Create Proforma Invoice';
  const saveBtn = panel?.querySelector('button[onclick="saveProformaInvoiceForm()"]'); if (saveBtn) saveBtn.textContent = pi ? 'Save Changes' : 'Save Proforma Invoice';
  set('piFormClient', pi ? pi.clientId : '');
  set('piFormDate', pi ? pi.date : new Date().toISOString().split('T')[0]);
  set('piFormNo', pi ? pi.piNo : _nextPiNo());
  set('piFormValidUntil', pi ? pi.validUntil : '');
  set('piFormNotes', pi ? pi.notes : '');
  const tbody = document.getElementById('piFormTableBody');
  tbody.innerHTML = '';
  const items = pi ? (pi.items || []) : [];
  addPIFormRow(Math.max(items.length, pi ? 1 : 3));
  items.forEach((it, i) => {
    const r = tbody.rows[i]; if (!r) return;
    r.querySelector('input[type="text"]').value = it.desc || '';
    const nums = r.querySelectorAll('input[type="number"]');
    nums[0].value = it.qty; nums[1].value = it.rate;
  });
  calcPIFormTotal();
  _openFullScreenForm('proformaInvoiceFormPanel');
}
/** Next PI-#### number: one past the highest already used. */
function _nextPiNo() {
  const max = (state.proformaInvoices || []).reduce((m, p) => Math.max(m, parseInt(String(p.piNo || '').replace(/\D/g, ''), 10) || 0), 0);
  return 'PI-' + String(max + 1).padStart(4, '0');
}
export function addPIFormRow(count = 1) { for (let i = 0; i < count; i++) _addGenericFormRow('piFormTableBody', 'calcPIFormTotal'); }
export function calcPIFormTotal() { _calcGenericFormTotal('piFormTableBody', 'piFormSubtotal', 'piFormTotal'); }
export function saveProformaInvoiceForm() {
  const editId = document.getElementById('proformaInvoiceFormPanel')?.dataset.editId || '';
  const clientId = document.getElementById('piFormClient').value;
  if (!clientId) { showToast('Select a client', 'error'); return; }
  const piNo = (document.getElementById('piFormNo').value || '').trim();
  if (!piNo) { showToast('Enter the PI number', 'error'); return; }
  if ((state.proformaInvoices || []).some(p => p.id !== editId && (p.piNo || '').trim().toLowerCase() === piNo.toLowerCase())) { showToast(`${piNo} is already used — pick another number`, 'error'); return; }
  const tbody = document.getElementById('piFormTableBody');
  let items = [], sub = 0;
  Array.from(tbody.rows).forEach(r => {
    const desc = r.querySelectorAll('input[type="text"]')[0]?.value || '';
    const inputs = r.querySelectorAll('input[type="number"]');
    const qty = parseFloat(inputs[0]?.value) || 0;
    const rate = parseFloat(inputs[1]?.value) || 0;
    if (desc && qty > 0) { items.push({ desc, qty, rate, amount: qty * rate }); sub += qty * rate; }
  });
  if (!items.length) { showToast('Add at least one item', 'error'); return; }
  const data = {
    piNo, date: document.getElementById('piFormDate').value, clientId, items, total: sub,
    validUntil: document.getElementById('piFormValidUntil')?.value || '',
    notes: document.getElementById('piFormNotes')?.value || '',
  };
  if (!state.proformaInvoices) state.proformaInvoices = [];
  const existing = editId && state.proformaInvoices.find(p => p.id === editId);
  if (existing) { Object.assign(existing, data, { updatedAt: new Date().toISOString() }); window.stampUpdate?.(existing); }
  else state.proformaInvoices.push(window.stampCreate ? window.stampCreate({ id: 'pi_' + Date.now(), ...data, status: 'Pending', convertedInvoice: '' }) : { id: 'pi_' + Date.now(), ...data, status: 'Pending', convertedInvoice: '' });
  saveAllData(); closeFullScreenForm('proformaInvoiceFormPanel');
  showToast(existing ? `${piNo} updated` : 'Proforma Invoice saved!', 'success'); renderProformaInvoices();
}
/** Pro forma PDF in the same design as the Tax Invoice (Settings → Print), titled "Proforma Invoice". */
export function exportProformaPDF(id) {
  const p = (state.proformaInvoices || []).find(x => x.id === id);
  if (!p) { showToast('Proforma invoice not found', 'error'); return; }
  const notes = [p.validUntil ? `Valid until ${p.validUntil}.` : '', p.notes || ''].filter(Boolean).join(' ');
  return renderStyledInvoice({ invoiceNo: p.piNo, date: p.date, clientId: p.clientId, items: (p.items || []).map(it => ({ desc: it.desc, qty: it.qty, rate: it.rate, amount: it.amount })), total: p.total, notes },
    resolveInvoiceDesign(state.printSettings?.invoiceTemplate), { title: 'Proforma Invoice', filePrefix: 'Proforma_Invoice_', hideReceived: true });
}
export function renderProformaInvoices() {
  const cfEl = document.getElementById('piFilterClient');
  if (cfEl && cfEl.options.length <= 1) state.clients.forEach(c => cfEl.innerHTML += `<option value="${c.id}">${c.name}</option>`);
  const search = (document.getElementById('piSearch')?.value || '').toLowerCase();
  const cFilter = document.getElementById('piFilterClient')?.value || '';
  const sFilter = document.getElementById('piFilterStatus')?.value || '';
  let list = [...(state.proformaInvoices || [])];
  list = list.filter(p => {
    const c = state.clients.find(x => x.id === p.clientId);
    return (!search || p.piNo?.toLowerCase().includes(search) || c?.name?.toLowerCase().includes(search)) &&
           (!cFilter || p.clientId === cFilter) && (!sFilter || p.status === sFilter);
  });
  list.sort((a, b) => new Date(b.date) - new Date(a.date));
  const tbody = document.getElementById('piTableBody');
  if (!tbody) return;
  let kPend = 0, kConv = 0, kTotal = 0;
  const cur = getCurrencySymbol(), money = v => cur + (Number(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const cards = list.map(p => {
    const c = state.clients.find(x => x.id === p.clientId);
    const proj = p.projectId ? (state.projects || []).find(x => x.id === p.projectId) : null;
    kTotal += p.total; if (p.status === 'Converted') kConv += p.total; else kPend += p.total;
    return txCard({ id: p.id, no: p.piNo || 'Proforma', date: p.date, party: c?.name || 'Unknown client',
      sub: [proj?.name, p.status === 'Converted' && p.convertedInvoiceNo ? 'Invoice ' + p.convertedInvoiceNo : ''].filter(Boolean).join(' · '),
      amount: money(p.total), badge: p.status === 'Converted' ? 'Converted' : 'Pending',
      tap: `window._piMenu('${p.id}')`, menu: `window._piMenu('${p.id}')` });
  }).join('');
  txMount(tbody, cards, { empty: (state.proformaInvoices || []).length ? 'No proforma invoices match your filters' : 'No proforma invoices yet',
    summary: `<span>${list.length} proforma${list.length === 1 ? '' : 's'}</span><span>Pending <b>${money(kPend)}</b></span>` });
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  s('piKpiPending', getCurrencySymbol() + kPend.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
  s('piKpiConverted', getCurrencySymbol() + kConv.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
  s('piKpiTotal', getCurrencySymbol() + kTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
}
export function clearPIFilters() { ['piSearch','piFilterClient','piFilterStatus','piFromDate','piToDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); renderProformaInvoices(); }
/** Delete with a confirmation dialog (the record goes to the Recycle Bin). */
export function deleteProformaInvoice(id) {
  const p = (state.proformaInvoices || []).find(x => x.id === id); if (!p) return;
  const c = (state.clients || []).find(x => x.id === p.clientId);
  openFormModal('Delete proforma invoice?', `<p style="margin:0;font-size:14px;color:#334155;line-height:1.5;">
      <b>${p.piNo}</b> · ${c?.name || 'Unknown client'} · ${getCurrencySymbol()}${(p.total || 0).toLocaleString('en-IN')}<br>
      It moves to the Recycle Bin (Setup → Recycle Bin), where you can restore it.${p.status === 'Converted' ? '<br><b>The tax invoice made from it is not affected.</b>' : ''}</p>`,
    { grid: 1, width: 440, onSave: `window._piDeleteNow('${id}')`, saveLabel: 'Delete', danger: true });
}
window._piDeleteNow = function (id) {
  const p = (state.proformaInvoices || []).find(x => x.id === id);
  window.recycleDelete && window.recycleDelete('proformaInvoices', id, 'Proforma Invoice');
  saveAllData(); closeFormModal(); renderProformaInvoices(); showToast(`${p?.piNo || 'Proforma invoice'} deleted`, 'success');
};
/** Row actions: View PDF · Edit · Delete. */
window._piMenu = function (id) {
  const p = (state.proformaInvoices || []).find(x => x.id === id); if (!p) return;
  const c = (state.clients || []).find(x => x.id === p.clientId);
  const acts = [
    { icon: '📄', title: 'View PDF', desc: 'Same design as your tax invoice', run: () => exportProformaPDF(id) },
    { icon: '✏️', title: 'Edit', desc: p.status === 'Converted' ? 'Already converted — changes don\'t touch the tax invoice' : 'Change items, rates, dates or notes', run: () => openProformaInvoiceForm(id) },
    { icon: '🗑', title: 'Delete', danger: true, run: () => deleteProformaInvoice(id) },
  ];
  if (typeof window.shellSheet === 'function') window.shellSheet(`${p.piNo} · ${c?.name || ''}`, acts);
  else openFormModal(`${p.piNo}`, acts.map((a, i) => `<button type="button" onclick="window.closeFormModal();window.__piActs[${i}]()" style="text-align:left;padding:12px 14px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;font-weight:700;cursor:pointer;color:${a.danger ? '#b91c1c' : '#0f172a'}">${a.icon} ${a.title}</button>`).join(''), { grid: 1, width: 380 }), window.__piActs = acts.map(a => a.run);
};
window.exportProformaPDF = exportProformaPDF;

// ══════════════════════════════════
// PAYMENT-IN
// ══════════════════════════════════
export function openPaymentInForm(editId) {
  _populateClientSelect('pinFormClient');
  _populateAccountSelect('pinFormAccount');
  const panelEl = document.getElementById('paymentInFormPanel');
  if (panelEl) panelEl.dataset.editId = editId || '';
  const existing = editId ? (state.paymentsIn || []).find(p => p.id === editId) : null;
  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); };
  if (existing) {
    setEl('pinFormDate', existing.date);
    setEl('pinFormAmount', existing.amount);
    setEl('pinFormRef', existing.ref);
    setEl('pinFormInvRef', existing.invoiceRef);
    setEl('pinFormClient', existing.clientId);
    setEl('pinFormAccount', existing.accountId);
    setEl('pinFormMode', existing.mode);
  } else {
    setEl('pinFormDate', new Date().toISOString().split('T')[0]);
    setEl('pinFormAmount', '');
    setEl('pinFormRef', '');
    setEl('pinFormInvRef', '');
  }
  // Deductions (TDS / penalty / retention…) — rebuilt each open so it starts clean.
  const host = document.getElementById('pinDedHost');
  if (host) {
    host.innerHTML = deductionsBlockHTML('pind', { direction: 'in' });
    initDeductions('pind', { cashInputId: 'pinFormAmount', direction: 'in', getState: () => state,
      bills: () => clientBills(state, document.getElementById('pinFormClient')?.value) });
    const cSel = document.getElementById('pinFormClient');
    if (cSel && !cSel.dataset.dedBound) { cSel.dataset.dedBound = '1'; cSel.addEventListener('change', () => refreshBills('pind')); }
    if (existing) loadDeductions('pind', existing);
  }
  _openFullScreenForm('paymentInFormPanel');
}
export function savePaymentInForm() {
  const clientId = document.getElementById('pinFormClient').value;
  const amount = parseFloat(document.getElementById('pinFormAmount').value) || 0;
  const ded = document.getElementById('pind') ? readDeductions('pind') : { deductions: [], errors: [] };
  if (ded.errors.length) { showToast(ded.errors[0], 'error'); return; }
  if (!clientId || (!(amount > 0) && !ded.deductions.length)) { showToast('Client and Amount required', 'error'); return; }
  if (amount < 0) { showToast('Amount received cannot be negative — check the deductions', 'error'); return; }
  const panelEl = document.getElementById('paymentInFormPanel');
  const editId = panelEl?.dataset?.editId || '';
  const existing = editId ? (state.paymentsIn || []).find(p => p.id === editId) : null;
  const rec = {
    id: existing ? existing.id : ('pin_' + Date.now()),
    clientId,
    date: document.getElementById('pinFormDate').value,
    accountId: document.getElementById('pinFormAccount')?.value || '',
    amount,
    mode: document.getElementById('pinFormMode')?.value || 'Cash',
    ref: document.getElementById('pinFormRef')?.value || '',
    invoiceRef: document.getElementById('pinFormInvRef')?.value || ded.billRef || '',
    receiptNo: existing ? (existing.receiptNo || ('RCP-' + (Date.now() % 100000))) : ('RCP-' + (Date.now() % 100000))
  };
  if (existing && existing.projectId !== undefined) rec.projectId = existing.projectId;
  if (ded.deductions.length) {
    rec.deductions = ded.deductions;
    rec.settledAmount = settledAmount(rec);
    rec.deductionRemark = ded.remark;
    if (ded.billId) { rec.againstBillId = ded.billId; rec.againstBillRef = ded.billRef; }
  }
  if (!state.paymentsIn) state.paymentsIn = [];
  if (existing) {
    const idx = state.paymentsIn.findIndex(p => p.id === existing.id);
    if (idx >= 0) state.paymentsIn[idx] = rec;
  } else {
    state.paymentsIn.push(rec);
  }
  if (panelEl) panelEl.dataset.editId = '';
  saveAllData(); closeFullScreenForm('paymentInFormPanel');
  showToast(existing ? 'Payment-In updated!' : 'Payment-In recorded!');
  renderPaymentInList();
  if (typeof window.renderPartyTransactions === 'function') { try { window.renderPartyTransactions(); } catch {} }
  if (typeof window.renderPartiesList === 'function') { try { window.renderPartiesList(); } catch {} }
}
export function renderPaymentInList() {
  const cfEl = document.getElementById('pinFilterClient');
  if (cfEl && cfEl.options.length <= 1) state.clients.forEach(c => cfEl.innerHTML += `<option value="${c.id}">${c.name}</option>`);
  const search = (document.getElementById('pinSearch')?.value || '').toLowerCase();
  const cFilter = document.getElementById('pinFilterClient')?.value || '';
  const fromD = document.getElementById('pinFromDate')?.value || '';
  const toD = document.getElementById('pinToDate')?.value || '';
  let list = [...(state.paymentsIn || [])];
  list = list.filter(p => {
    const c = state.clients.find(x => x.id === p.clientId);
    return (!search || p.receiptNo?.toLowerCase().includes(search) || p.ref?.toLowerCase().includes(search) || c?.name?.toLowerCase().includes(search)) &&
           (!cFilter || p.clientId === cFilter) && (!fromD || p.date >= fromD) && (!toD || p.date <= toD);
  });
  list.sort((a, b) => new Date(b.date) - new Date(a.date));
  const tbody = document.getElementById('pinTableBody');
  if (!tbody) return; tbody.innerHTML = '';
  let kTotal = 0, kMonth = 0;
  const curMonth = new Date().toISOString().slice(0, 7);
  list.forEach(p => {
    const c = state.clients.find(x => x.id === p.clientId);
    kTotal += parseFloat(p.amount || 0);
    if (p.date?.startsWith(curMonth)) kMonth += parseFloat(p.amount || 0);
    tbody.innerHTML += `<tr class="hover:bg-slate-50"><td class="px-4 py-3 text-slate-500">${p.date}</td><td class="px-4 py-3 font-mono font-bold text-green-700">${p.receiptNo || p.ref || '-'}</td><td class="px-4 py-3 font-bold">${c?.name || 'Unknown'}</td><td class="px-4 py-3 text-slate-500">${p.invoiceRef || '-'}</td><td class="px-4 py-3"><span class="bg-blue-100 text-blue-700 text-[10px] px-2 py-1 rounded font-bold">${p.mode || 'Cash'}</span></td><td class="px-4 py-3 text-right font-extrabold text-green-700">${getCurrencySymbol()}${parseFloat(p.amount).toLocaleString('en-IN')}${deductionTotal(p) > 0 ? `<div class="text-[10px] font-bold text-rose-600" title="${(p.deductionRemark || '').replace(/"/g, '&quot;')}">+ ${getCurrencySymbol()}${deductionTotal(p).toLocaleString('en-IN')} deducted</div>` : ''}</td><td class="px-4 py-3 text-center"><button onclick="deletePaymentIn('${p.id}')" class="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] px-2 py-1 rounded font-bold">Del</button></td></tr>`;
  });
  if (!list.length) tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-slate-400 font-medium">No payment receipts found.</td></tr>';
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  s('pinKpiTotal', getCurrencySymbol() + kTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
  s('pinKpiMonth', getCurrencySymbol() + kMonth.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
  s('pinKpiCount', list.length);
}
export function clearPaymentInFilters() { ['pinSearch','pinFilterClient','pinFromDate','pinToDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); renderPaymentInList(); }
export function deletePaymentIn(id) {
  if (!confirm('Delete this payment receipt?')) return;
  window.recycleDelete && window.recycleDelete('paymentsIn', id, 'Payment In');
  saveAllData(); renderPaymentInList(); showToast('Payment Deleted', 'error');
}

// ══════════════════════════════════
// SALE ORDER
// ══════════════════════════════════
export function openSaleOrderForm(editId) {
  _populateClientSelect('soFormClient');
  const so = editId ? (state.saleOrders || []).find(o => o.id === editId) : null;
  state._editingSOId = so ? so.id : null;
  const tbody = document.getElementById('soFormTableBody');
  tbody.innerHTML = '';
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  if (so) {
    setV('soFormClient', so.clientId); setV('soFormNo', so.soNo); setV('soFormDate', so.date);
    setV('soFormDelivery', so.deliveryDate); setV('soFormTerms', so.terms);
    (so.items || []).forEach(it => {
      addSOFormRow(1);
      const tr = tbody.rows[tbody.rows.length - 1];
      tr.querySelector('input[type="text"]').value = it.desc || '';
      const nums = tr.querySelectorAll('input[type="number"]');
      if (nums[0]) nums[0].value = it.qty ?? '';
      if (nums[1]) nums[1].value = it.rate ?? '';
    });
    if (!(so.items || []).length) addSOFormRow(1);
  } else {
    setV('soFormDate', new Date().toISOString().split('T')[0]);
    setV('soFormNo', 'SO-' + (Date.now() % 100000));
    setV('soFormDelivery', ''); setV('soFormTerms', '');
    addSOFormRow(3);
  }
  calcSOFormTotal();
  _openFullScreenForm('saleOrderFormPanel');
}
export function addSOFormRow(count = 1) { for (let i = 0; i < count; i++) _addGenericFormRow('soFormTableBody', 'calcSOFormTotal'); }
export function calcSOFormTotal() { _calcGenericFormTotal('soFormTableBody', 'soFormSubtotal', 'soFormTotal'); }
export function saveSaleOrderForm() {
  const clientId = document.getElementById('soFormClient').value;
  if (!clientId) { showToast('Select a client', 'error'); return; }
  const tbody = document.getElementById('soFormTableBody');
  let items = [], sub = 0;
  Array.from(tbody.rows).forEach(r => {
    const desc = r.querySelectorAll('input[type="text"]')[0]?.value || '';
    const inputs = r.querySelectorAll('input[type="number"]');
    const qty = parseFloat(inputs[0]?.value) || 0;
    const rate = parseFloat(inputs[1]?.value) || 0;
    if (desc && qty > 0) { items.push({ desc, qty, rate, amount: qty * rate }); sub += qty * rate; }
  });
  if (!items.length) { showToast('Add at least one item', 'error'); return; }
  const fields = {
    soNo: document.getElementById('soFormNo').value,
    date: document.getElementById('soFormDate').value, clientId, items, total: sub,
    deliveryDate: document.getElementById('soFormDelivery')?.value || '',
    terms: document.getElementById('soFormTerms')?.value || ''
  };
  if (!state.saleOrders) state.saleOrders = [];
  const editId = state._editingSOId;
  const existing = editId ? state.saleOrders.find(o => o.id === editId) : null;
  if (existing) {
    Object.assign(existing, fields);   // keep id, statuses, _fromEstimate
  } else {
    state.saleOrders.push({ id: 'so_' + Date.now(), ...fields, deliveryStatus: 'Pending', paymentStatus: 'Pending' });
  }
  state._editingSOId = null;
  saveAllData(); closeFullScreenForm('saleOrderFormPanel');
  showToast(existing ? 'Sale Order updated!' : 'Sale Order saved!'); renderSaleOrders();
}
export function renderSaleOrders() {
  const cfEl = document.getElementById('soFilterClient');
  if (cfEl && cfEl.options.length <= 1) state.clients.forEach(c => cfEl.innerHTML += `<option value="${c.id}">${c.name}</option>`);
  const search = (document.getElementById('soSearch')?.value || '').toLowerCase();
  const cFilter = document.getElementById('soFilterClient')?.value || '';
  const sFilter = document.getElementById('soFilterStatus')?.value || '';
  let list = [...(state.saleOrders || [])];
  list = list.filter(o => {
    const c = state.clients.find(x => x.id === o.clientId);
    return (!search || o.soNo?.toLowerCase().includes(search) || c?.name?.toLowerCase().includes(search)) &&
           (!cFilter || o.clientId === cFilter) && (!sFilter || o.deliveryStatus === sFilter);
  });
  list.sort((a, b) => new Date(b.date) - new Date(a.date));
  const tbody = document.getElementById('soTableBody');
  if (!tbody) return; tbody.innerHTML = '';
  let kPend = 0, kComp = 0, kInv = 0, kTotal = 0;
  list.forEach(o => {
    const c = state.clients.find(x => x.id === o.clientId);
    kTotal += o.total;
    if (o.deliveryStatus === 'Completed') kComp++; else if (o.deliveryStatus === 'Invoiced') kInv++; else kPend++;
    const dBadge = o.deliveryStatus === 'Completed' ? '<span class="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded font-bold">Completed</span>' : o.deliveryStatus === 'Invoiced' ? '<span class="bg-blue-100 text-blue-700 text-[10px] px-2 py-1 rounded font-bold">Invoiced</span>' : '<span class="bg-orange-100 text-orange-700 text-[10px] px-2 py-1 rounded font-bold">Pending</span>';
    const pBadge = o.paymentStatus === 'Paid' ? '<span class="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded font-bold">Paid</span>' : '<span class="bg-orange-100 text-orange-700 text-[10px] px-2 py-1 rounded font-bold">Pending</span>';
    tbody.innerHTML += `<tr class="hover:bg-slate-50"><td class="px-4 py-3 font-mono font-bold text-blue-700">${o.soNo}</td><td class="px-4 py-3 text-slate-500">${o.date}</td><td class="px-4 py-3 font-bold">${c?.name || 'Unknown'}</td><td class="px-4 py-3 text-right font-bold">${getCurrencySymbol()}${o.total?.toLocaleString('en-IN')}</td><td class="px-4 py-3 text-center">${dBadge}</td><td class="px-4 py-3 text-center">${pBadge}</td><td class="px-4 py-3 text-center whitespace-nowrap"><button onclick="openSaleOrderForm('${o.id}')" class="text-blue-600 bg-blue-50 hover:bg-blue-100 text-[10px] px-2 py-1 rounded font-bold mr-1">Edit</button><button onclick="deleteSaleOrder('${o.id}')" class="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] px-2 py-1 rounded font-bold">Del</button></td></tr>`;
  });
  if (!list.length) tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-slate-400 font-medium">No sale orders found.</td></tr>';
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  s('soKpiPending', kPend); s('soKpiCompleted', kComp); s('soKpiInvoiced', kInv);
  s('soKpiTotal', getCurrencySymbol() + kTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
}
export function clearSOFilters() { ['soSearch','soFilterClient','soFilterStatus','soFromDate','soToDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); renderSaleOrders(); }
export function deleteSaleOrder(id) {
  if (!confirm('Delete this Sale Order?')) return;
  window.recycleDelete && window.recycleDelete('saleOrders', id, 'Sale Order');
  saveAllData(); renderSaleOrders(); showToast('Sale Order Deleted', 'error');
}

// ══════════════════════════════════
// DELIVERY CHALLAN
// ══════════════════════════════════
export function openDeliveryChallanForm() {
  _populateClientSelect('dcFormClient');
  document.getElementById('dcFormDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('dcFormNo').value = 'DC-' + (Date.now() % 100000);
  document.getElementById('dcFormVehicle').value = '';
  document.getElementById('dcFormSORef').value = '';
  document.getElementById('dcFormItems').value = '';
  _openFullScreenForm('deliveryChallanFormPanel');
}
export function saveDeliveryChallanForm() {
  const clientId = document.getElementById('dcFormClient').value;
  if (!clientId) { showToast('Select a client', 'error'); return; }
  const rec = {
    id: 'dc_' + Date.now(), challanNo: document.getElementById('dcFormNo').value,
    date: document.getElementById('dcFormDate').value, clientId,
    vehicle: document.getElementById('dcFormVehicle')?.value || '',
    soRef: document.getElementById('dcFormSORef')?.value || '',
    items: document.getElementById('dcFormItems')?.value || '',
    status: 'Dispatched', invoiceStatus: 'Not Invoiced'
  };
  if (!state.deliveryChallans) state.deliveryChallans = [];
  state.deliveryChallans.push(rec);
  saveAllData(); closeFullScreenForm('deliveryChallanFormPanel');
  showToast('Delivery Challan saved!'); renderDeliveryChallans();
}
export function renderDeliveryChallans() {
  const search = (document.getElementById('dcSearch')?.value || '').toLowerCase();
  const sFilter = document.getElementById('dcFilterStatus')?.value || '';
  let list = [...(state.deliveryChallans || [])];
  list = list.filter(d => {
    const c = state.clients.find(x => x.id === d.clientId);
    return (!search || d.challanNo?.toLowerCase().includes(search) || c?.name?.toLowerCase().includes(search)) &&
           (!sFilter || d.status === sFilter);
  });
  list.sort((a, b) => new Date(b.date) - new Date(a.date));
  const tbody = document.getElementById('dcTableBody');
  if (!tbody) return; tbody.innerHTML = '';
  let kPend = 0, kDel = 0, kRet = 0;
  list.forEach(d => {
    const c = state.clients.find(x => x.id === d.clientId);
    if (d.status === 'Delivered') kDel++; else if (d.status === 'Returned') kRet++; else kPend++;
    const sBadge = d.status === 'Delivered' ? '<span class="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded font-bold">Delivered</span>' : d.status === 'Returned' ? '<span class="bg-red-100 text-red-700 text-[10px] px-2 py-1 rounded font-bold">Returned</span>' : '<span class="bg-orange-100 text-orange-700 text-[10px] px-2 py-1 rounded font-bold">Dispatched</span>';
    tbody.innerHTML += `<tr class="hover:bg-slate-50"><td class="px-4 py-3 font-mono font-bold text-blue-700">${d.challanNo}</td><td class="px-4 py-3 text-slate-500">${d.date}</td><td class="px-4 py-3 font-bold">${c?.name || 'Unknown'}</td><td class="px-4 py-3 text-slate-500">${d.vehicle || '-'}</td><td class="px-4 py-3 text-center">${sBadge}</td><td class="px-4 py-3 text-slate-500">${d.invoiceStatus}</td><td class="px-4 py-3 text-center"><button onclick="deleteDeliveryChallan('${d.id}')" class="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] px-2 py-1 rounded font-bold">Del</button></td></tr>`;
  });
  if (!list.length) tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-slate-400 font-medium">No delivery challans found.</td></tr>';
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  s('dcKpiPending', kPend); s('dcKpiDelivered', kDel); s('dcKpiReturned', kRet);
}
export function clearDCFilters() { ['dcSearch','dcFilterStatus','dcFromDate','dcToDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); renderDeliveryChallans(); }
export function deleteDeliveryChallan(id) {
  if (!confirm('Delete this Delivery Challan?')) return;
  window.recycleDelete && window.recycleDelete('deliveryChallans', id, 'Delivery Challan');
  saveAllData(); renderDeliveryChallans(); showToast('Delivery Challan Deleted', 'error');
}

// ══════════════════════════════════
// SALE RETURN / CREDIT NOTE
// ══════════════════════════════════
export function openSaleReturnForm() {
  _populateClientSelect('srFormClient');
  document.getElementById('srFormDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('srFormNo').value = 'CN-' + (Date.now() % 100000);
  document.getElementById('srFormAmount').value = '';
  document.getElementById('srFormInvRef').value = '';
  document.getElementById('srFormReason').value = '';
  _openFullScreenForm('saleReturnFormPanel');
}
export function saveSaleReturnForm() {
  const clientId = document.getElementById('srFormClient').value;
  const amount = parseFloat(document.getElementById('srFormAmount').value);
  if (!clientId || !amount) { showToast('Client and Amount required', 'error'); return; }
  const rec = {
    id: 'sr_' + Date.now(), returnNo: document.getElementById('srFormNo').value,
    date: document.getElementById('srFormDate').value, clientId, amount,
    invoiceRef: document.getElementById('srFormInvRef')?.value || '',
    reason: document.getElementById('srFormReason')?.value || '',
    status: 'Pending'
  };
  if (!state.saleReturns) state.saleReturns = [];
  state.saleReturns.push(rec);
  saveAllData(); closeFullScreenForm('saleReturnFormPanel');
  showToast('Credit Note saved!'); renderSaleReturns();
}
export function renderSaleReturns() {
  const cfEl = document.getElementById('srFilterClient');
  if (cfEl && cfEl.options.length <= 1) state.clients.forEach(c => cfEl.innerHTML += `<option value="${c.id}">${c.name}</option>`);
  const search = (document.getElementById('srSearch')?.value || '').toLowerCase();
  const cFilter = document.getElementById('srFilterClient')?.value || '';
  let list = [...(state.saleReturns || [])];
  list = list.filter(r => {
    const c = state.clients.find(x => x.id === r.clientId);
    return (!search || r.returnNo?.toLowerCase().includes(search) || c?.name?.toLowerCase().includes(search)) && (!cFilter || r.clientId === cFilter);
  });
  list.sort((a, b) => new Date(b.date) - new Date(a.date));
  const tbody = document.getElementById('srTableBody');
  if (!tbody) return; tbody.innerHTML = '';
  let kTotal = 0, kAdj = 0, kPend = 0;
  list.forEach(r => {
    const c = state.clients.find(x => x.id === r.clientId);
    kTotal += r.amount;
    if (r.status === 'Adjusted') kAdj += r.amount; else kPend += r.amount;
    const sBadge = r.status === 'Adjusted' ? '<span class="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded font-bold">Adjusted</span>' : '<span class="bg-orange-100 text-orange-700 text-[10px] px-2 py-1 rounded font-bold">Pending</span>';
    tbody.innerHTML += `<tr class="hover:bg-slate-50"><td class="px-4 py-3 font-mono font-bold text-red-600">${r.returnNo}</td><td class="px-4 py-3 text-slate-500">${r.date}</td><td class="px-4 py-3 font-bold">${c?.name || 'Unknown'}</td><td class="px-4 py-3 text-slate-500">${r.invoiceRef || '-'}</td><td class="px-4 py-3 text-right font-bold text-red-600">${getCurrencySymbol()}${r.amount?.toLocaleString('en-IN')}</td><td class="px-4 py-3 text-center">${sBadge}</td><td class="px-4 py-3 text-center"><button onclick="deleteSaleReturn('${r.id}')" class="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] px-2 py-1 rounded font-bold">Del</button></td></tr>`;
  });
  if (!list.length) tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-slate-400 font-medium">No sale returns found.</td></tr>';
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  s('srKpiTotal', getCurrencySymbol() + kTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
  s('srKpiAdjusted', getCurrencySymbol() + kAdj.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
  s('srKpiPending', getCurrencySymbol() + kPend.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
}
export function clearSRFilters() { ['srSearch','srFilterClient','srFromDate','srToDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); renderSaleReturns(); }
export function deleteSaleReturn(id) {
  if (!confirm('Delete this Sale Return?')) return;
  window.recycleDelete && window.recycleDelete('saleReturns', id, 'Sale Return');
  saveAllData(); renderSaleReturns(); showToast('Sale Return Deleted', 'error');
}

// ══════════════════════════════════
// SALE FIXED ASSETS
// ══════════════════════════════════
export function openSaleFixedAssetForm() {
  document.getElementById('sfaFormDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('sfaFormName').value = '';
  document.getElementById('sfaFormBuyer').value = '';
  document.getElementById('sfaFormAmount').value = '';
  document.getElementById('sfaFormBookValue').value = '';
  document.getElementById('sfaFormNotes').value = '';
  _openFullScreenForm('saleFixedAssetFormPanel');
}
export function saveSaleFixedAssetForm() {
  const name = document.getElementById('sfaFormName').value;
  const amount = parseFloat(document.getElementById('sfaFormAmount').value);
  if (!name || !amount) { showToast('Asset name and amount required', 'error'); return; }
  const bookVal = parseFloat(document.getElementById('sfaFormBookValue').value) || 0;
  const rec = {
    id: 'sfa_' + Date.now(), name, date: document.getElementById('sfaFormDate').value,
    buyer: document.getElementById('sfaFormBuyer')?.value || '',
    category: document.getElementById('sfaFormCategory')?.value || 'Other',
    amount, bookValue: bookVal, profitLoss: amount - bookVal,
    notes: document.getElementById('sfaFormNotes')?.value || '', status: 'Sold'
  };
  if (!state.saleFixedAssets) state.saleFixedAssets = [];
  state.saleFixedAssets.push(rec);
  saveAllData(); closeFullScreenForm('saleFixedAssetFormPanel');
  showToast('Asset Sale recorded!'); renderSaleFixedAssets();
}
export function renderSaleFixedAssets() {
  const search = (document.getElementById('sfaSearch')?.value || '').toLowerCase();
  let list = [...(state.saleFixedAssets || [])];
  list = list.filter(a => !search || a.name?.toLowerCase().includes(search) || a.buyer?.toLowerCase().includes(search));
  list.sort((a, b) => new Date(b.date) - new Date(a.date));
  const tbody = document.getElementById('sfaTableBody');
  if (!tbody) return; tbody.innerHTML = '';
  let kTotal = 0, kProfit = 0, kLoss = 0;
  list.forEach(a => {
    kTotal += a.amount;
    if (a.profitLoss >= 0) kProfit += a.profitLoss; else kLoss += Math.abs(a.profitLoss);
    tbody.innerHTML += `<tr class="hover:bg-slate-50"><td class="px-4 py-3 font-bold">${a.name}</td><td class="px-4 py-3 text-slate-500">${a.buyer || '-'}</td><td class="px-4 py-3 text-slate-500">${a.date}</td><td class="px-4 py-3 text-right font-bold">${getCurrencySymbol()}${a.amount?.toLocaleString('en-IN')}</td><td class="px-4 py-3"><span class="bg-blue-100 text-blue-700 text-[10px] px-2 py-1 rounded font-bold">${a.category}</span></td><td class="px-4 py-3 text-center"><span class="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded font-bold">${a.status}</span></td><td class="px-4 py-3 text-center"><button onclick="deleteSaleFixedAsset('${a.id}')" class="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] px-2 py-1 rounded font-bold">Del</button></td></tr>`;
  });
  if (!list.length) tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-slate-400 font-medium">No asset sales found.</td></tr>';
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  s('sfaKpiTotal', getCurrencySymbol() + kTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
  s('sfaKpiProfit', getCurrencySymbol() + kProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
  s('sfaKpiLoss', getCurrencySymbol() + kLoss.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
}
export function clearSFAFilters() { ['sfaSearch','sfaFromDate','sfaToDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); renderSaleFixedAssets(); }
export function deleteSaleFixedAsset(id) {
  if (!confirm('Delete this Asset Sale?')) return;
  window.recycleDelete && window.recycleDelete('saleFixedAssets', id, 'Sale Fixed Asset');
  saveAllData(); renderSaleFixedAssets(); showToast('Asset Sale Deleted', 'error');
}

// ══════════════════════════════════
// OTHER INCOME
// ══════════════════════════════════
/** Income streams beyond RA bills. Older entries (Interest, Rent, Commission, Other) group under Miscellaneous. */
export const OI_CATS = [
  { key: 'Equipment Rental', icon: '🚜', color: SERIES[0], hint: 'Machines hired out to others' },
  { key: 'Scrap Sale', icon: '♻️', color: SERIES[1], hint: 'Steel, shuttering, packaging' },
  { key: 'Consulting', icon: '📐', color: SERIES[2], hint: 'Design, supervision, PMC fees' },
  { key: 'Miscellaneous', icon: '💼', color: NEUTRAL, hint: 'Interest, rent, commission, other' },
];
const _oiCat = o => (OI_CATS.some(c => c.key === o.category) ? o.category : 'Miscellaneous');
const _oiMeta = k => OI_CATS.find(c => c.key === k) || OI_CATS[3];
const _oiF = { q: '', cat: '', from: '', to: '' };

export function openOtherIncomeForm(editId) {
  if (typeof editId !== 'string') editId = '';
  const o = editId ? (state.otherIncome || []).find(x => x.id === editId) : null;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  const panel = document.getElementById('otherIncomeFormPanel');
  if (panel) {
    panel.dataset.editId = o ? o.id : '';
    const h = panel.querySelector('h2'); if (h) h.textContent = o ? `Edit ${o.incomeNo || 'income'}` : 'Add Other Income';
  }
  set('oiFormDate', o ? o.date : new Date().toISOString().split('T')[0]);
  set('oiFormSource', o ? o.source : '');
  set('oiFormCategory', o ? _oiCat(o) : (_oiF.cat || 'Equipment Rental'));
  set('oiFormPayType', o ? o.payType : 'Bank');
  set('oiFormAmount', o ? o.amount : '');
  set('oiFormRef', o ? o.ref : '');
  set('oiFormNotes', o ? o.notes : '');
  _openFullScreenForm('otherIncomeFormPanel');
}
export function saveOtherIncomeForm() {
  const editId = document.getElementById('otherIncomeFormPanel')?.dataset.editId || '';
  const source = (document.getElementById('oiFormSource').value || '').trim();
  const amount = parseFloat(document.getElementById('oiFormAmount').value);
  if (!source || !(amount > 0)) { showToast('Enter where the money came from and the amount', 'error'); return; }
  const data = {
    source, date: document.getElementById('oiFormDate').value,
    category: document.getElementById('oiFormCategory')?.value || 'Miscellaneous',
    payType: document.getElementById('oiFormPayType')?.value || 'Bank',
    amount, ref: document.getElementById('oiFormRef')?.value || '',
    notes: document.getElementById('oiFormNotes')?.value || ''
  };
  if (!state.otherIncome) state.otherIncome = [];
  const existing = editId && state.otherIncome.find(x => x.id === editId);
  if (existing) { Object.assign(existing, data); window.stampUpdate?.(existing); }
  else {
    const n = state.otherIncome.reduce((m, x) => Math.max(m, parseInt(String(x.incomeNo || '').replace(/\D/g, ''), 10) || 0), 0) + 1;
    const rec = { id: 'oi_' + Date.now(), incomeNo: 'OI-' + String(n).padStart(4, '0'), ...data };
    state.otherIncome.push(window.stampCreate ? window.stampCreate(rec) : rec);
  }
  saveAllData(); closeFullScreenForm('otherIncomeFormPanel');
  showToast(existing ? `${existing.incomeNo} updated` : 'Income recorded', 'success'); renderOtherIncome();
}
export function renderOtherIncome() {
  const root = document.getElementById('oiRoot');
  if (!root) return;
  const cur = getCurrencySymbol();
  const fmt = n => cur + Math.round(n || 0).toLocaleString('en-IN');
  const sm = n => shortMoney(n, cur);
  const all = state.otherIncome || [];
  const f = _oiF;
  const list = all.filter(o => (!f.q || [o.source, o.incomeNo, o.ref, o.category].some(v => String(v || '').toLowerCase().includes(f.q)))
    && (!f.cat || _oiCat(o) === f.cat) && (!f.from || (o.date || '') >= f.from) && (!f.to || (o.date || '') <= f.to))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const total = list.reduce((t, o) => t + (parseFloat(o.amount) || 0), 0);
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = list.filter(o => (o.date || '').startsWith(month)).reduce((t, o) => t + (parseFloat(o.amount) || 0), 0);
  const slices = OI_CATS.map(c => ({ label: c.key, color: c.color, value: list.filter(o => _oiCat(o) === c.key).reduce((t, o) => t + (parseFloat(o.amount) || 0), 0) }));
  const trend = lastMonths(12).map(m => ({ label: m.label, value: list.filter(o => (o.date || '').startsWith(m.key)).reduce((t, o) => t + (parseFloat(o.amount) || 0), 0) }));
  const top = slices.slice().sort((a, b) => b.value - a.value)[0];
  const chartW = Math.max(300, Math.min(760, (root.clientWidth || 900) > 860 ? (root.clientWidth - 40) / 2 : (root.clientWidth || 360) - 32));
  const chip = (k, l) => `<button type="button" class="fx-chip${f.cat === k ? ' on' : ''}" onclick="window._oiSet('cat','${k}')">${l}</button>`;
  root.innerHTML = `<div class="fx">
    <div class="fx-head"><div><h2>Other Income</h2><p>Money earned beyond RA bills — equipment hire, scrap, consulting and more.</p></div>
      <button type="button" class="fx-cta" onclick="openOtherIncomeForm()">+ Add income</button></div>
    <section class="fx-hero">
      <div class="fx-hero-main">
        <span class="fx-eyebrow">Other income${f.from || f.to ? ` · ${f.from || '…'} → ${f.to || 'today'}` : ' · all time'}${f.cat ? ' · ' + f.cat : ''}</span>
        <b class="pos">${fmt(total)}</b>
        <span class="fx-pill pos">${list.length} entr${list.length === 1 ? 'y' : 'ies'}</span>
      </div>
      <div class="fx-kpis">
        <div><span>This month</span><b>${fmt(thisMonth)}</b><small>${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</small></div>
        <div><span>Biggest stream</span><b>${top && top.value ? top.label : '—'}</b><small>${top && top.value ? fmt(top.value) : 'no income yet'}</small></div>
        <div><span>Average entry</span><b>${fmt(list.length ? total / list.length : 0)}</b><small>per receipt</small></div>
      </div>
    </section>
    <div class="fx-grid2">
      <section class="fx-card"><header><b>Income by stream</b><small>share of total</small></header>
        <div class="fx-donut-wrap">${donutSVG(slices, { size: 190, thick: 28, money: sm, sub: 'total income', title: 'Other income by category' })}${legendHTML(slices, fmt)}</div></section>
      <section class="fx-card"><header><b>Monthly income</b><small>last 12 months</small></header>
        ${areaSVG(trend, { width: chartW, height: 220, money: sm, title: 'Other income per month, last 12 months' })}</section>
    </div>
    <div class="fx-filter">
      <div class="fx-filter-row">
        <input type="search" placeholder="Search source, number, reference…" value="${(f.q || '').replace(/"/g, '&quot;')}" oninput="window._oiSet('q', this.value)" aria-label="Search">
        <span class="fx-dates"><input type="date" value="${f.from}" onchange="window._oiSet('from', this.value)" aria-label="From"><span>→</span><input type="date" value="${f.to}" onchange="window._oiSet('to', this.value)" aria-label="To"></span>
        ${f.q || f.cat || f.from || f.to ? '<button type="button" class="fx-chip" onclick="clearOIFilters()">✕ Clear</button>' : ''}
      </div>
      <div class="fx-filter-row">${chip('', 'All')}${OI_CATS.map(c => chip(c.key, c.icon + ' ' + c.key)).join('')}</div>
    </div>
    <section class="fx-card flush">
      <header><b>Income register</b><small>tap a row to edit or delete</small></header>
      <div class="fx-list">${list.map(o => {
        const k = _oiCat(o), m = _oiMeta(k);
        return `<button type="button" class="fx-li" onclick="window._oiMenu('${o.id}')">
          <span class="fx-li-ic" style="background:${m.color}1f">${m.icon}</span>
          <span class="fx-li-main"><b>${o.source || '—'}</b><small>${o.incomeNo || ''} · ${o.date || ''} · <i class="fx-dot" style="background:${m.color}"></i>${o.category && o.category !== k ? o.category : k} · ${o.payType || ''}${o.ref ? ' · ' + o.ref : ''}</small></span>
          <span class="fx-li-amt pos">+${fmt(o.amount)}</span><span class="fx-li-more" aria-hidden="true">⋯</span></button>`;
      }).join('') || `<p class="fx-empty">${all.length ? 'No income matches these filters.' : 'No other income yet. Add equipment hire, scrap sales or consulting fees.'}</p>`}</div>
    </section>
  </div>`;
}
window._oiSet = (k, v) => {
  _oiF[k] = k === 'q' ? String(v || '').toLowerCase() : (k === 'cat' && _oiF.cat === v ? '' : v || '');
  renderOtherIncome();
  if (k === 'q') { const el = document.querySelector('#oiRoot input[type=search]'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
};
window._oiMenu = function (id) {
  const o = (state.otherIncome || []).find(x => x.id === id); if (!o) return;
  const acts = [
    { icon: '✏️', title: 'Edit', run: () => openOtherIncomeForm(id) },
    { icon: '🗑', title: 'Delete', danger: true, run: () => deleteOtherIncome(id) },
  ];
  if (typeof window.shellSheet === 'function') window.shellSheet(`${o.incomeNo || 'Income'} · ${o.source || ''}`, acts);
  else openOtherIncomeForm(id);
};
export function clearOIFilters() { Object.assign(_oiF, { q: '', cat: '', from: '', to: '' }); renderOtherIncome(); }
export function deleteOtherIncome(id) {
  const o = (state.otherIncome || []).find(x => x.id === id); if (!o) return;
  openFormModal('Delete this income?', `<p style="margin:0;font-size:14px;color:#334155;line-height:1.5;"><b>${o.incomeNo || ''}</b> · ${o.source || ''} · ${getCurrencySymbol()}${(parseFloat(o.amount) || 0).toLocaleString('en-IN')}<br>It moves to the Recycle Bin, where you can restore it.</p>`,
    { grid: 1, width: 420, onSave: `window._oiDeleteNow('${id}')`, saveLabel: 'Delete', danger: true });
}
window._oiDeleteNow = function (id) {
  window.recycleDelete && window.recycleDelete('otherIncome', id, 'Other Income');
  saveAllData(); closeFormModal(); renderOtherIncome(); showToast('Income deleted', 'success');
};
