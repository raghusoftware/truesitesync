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
import { showToast, getCurrencySymbol } from './utils.js';
import { _openFullScreenForm, _populateClientSelect, _populateAccountSelect, _addGenericFormRow, _calcGenericFormTotal, closeFullScreenForm } from './formHelpers.js';

export function openProformaInvoiceForm() {
  _populateClientSelect('piFormClient');
  document.getElementById('piFormDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('piFormNo').value = 'PI-' + (Date.now() % 100000);
  document.getElementById('piFormTableBody').innerHTML = '';
  addPIFormRow(3); calcPIFormTotal();
  _openFullScreenForm('proformaInvoiceFormPanel');
}
export function addPIFormRow(count = 1) { for (let i = 0; i < count; i++) _addGenericFormRow('piFormTableBody', 'calcPIFormTotal'); }
export function calcPIFormTotal() { _calcGenericFormTotal('piFormTableBody', 'piFormSubtotal', 'piFormTotal'); }
export function saveProformaInvoiceForm() {
  const clientId = document.getElementById('piFormClient').value;
  if (!clientId) { showToast('Select a client', 'error'); return; }
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
  const rec = {
    id: 'pi_' + Date.now(), piNo: document.getElementById('piFormNo').value,
    date: document.getElementById('piFormDate').value, clientId, items, total: sub,
    validUntil: document.getElementById('piFormValidUntil')?.value || '',
    notes: document.getElementById('piFormNotes')?.value || '',
    status: 'Pending', convertedInvoice: ''
  };
  if (!state.proformaInvoices) state.proformaInvoices = [];
  state.proformaInvoices.push(rec);
  saveAllData(); closeFullScreenForm('proformaInvoiceFormPanel');
  showToast('Proforma Invoice saved!'); renderProformaInvoices();
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
  if (!tbody) return; tbody.innerHTML = '';
  let kPend = 0, kConv = 0, kTotal = 0;
  list.forEach(p => {
    const c = state.clients.find(x => x.id === p.clientId);
    kTotal += p.total; if (p.status === 'Converted') kConv += p.total; else kPend += p.total;
    const sBadge = p.status === 'Converted' ? '<span class="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded font-bold">Converted</span>' : '<span class="bg-orange-100 text-orange-700 text-[10px] px-2 py-1 rounded font-bold">Pending</span>';
    tbody.innerHTML += `<tr class="hover:bg-slate-50"><td class="px-4 py-3 font-mono font-bold text-blue-700">${p.piNo}</td><td class="px-4 py-3 text-slate-500">${p.date}</td><td class="px-4 py-3 font-bold">${c?.name || 'Unknown'}</td><td class="px-4 py-3 text-right font-bold">${getCurrencySymbol()}${p.total?.toLocaleString('en-IN')}</td><td class="px-4 py-3 text-center">${sBadge}</td><td class="px-4 py-3 text-slate-500">${p.convertedInvoice || '-'}</td><td class="px-4 py-3 text-center"><button onclick="deleteProformaInvoice('${p.id}')" class="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] px-2 py-1 rounded font-bold">Del</button></td></tr>`;
  });
  if (!list.length) tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-slate-400 font-medium">No proforma invoices found.</td></tr>';
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  s('piKpiPending', getCurrencySymbol() + kPend.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
  s('piKpiConverted', getCurrencySymbol() + kConv.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
  s('piKpiTotal', getCurrencySymbol() + kTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
}
export function clearPIFilters() { ['piSearch','piFilterClient','piFilterStatus','piFromDate','piToDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); renderProformaInvoices(); }
export function deleteProformaInvoice(id) {
  if (!confirm('Delete this Proforma Invoice?')) return;
  state.proformaInvoices = (state.proformaInvoices || []).filter(p => p.id !== id);
  saveAllData(); renderProformaInvoices(); showToast('Proforma Invoice Deleted', 'error');
}

// ══════════════════════════════════
// PAYMENT-IN
// ══════════════════════════════════
export function openPaymentInForm() {
  _populateClientSelect('pinFormClient');
  _populateAccountSelect('pinFormAccount');
  document.getElementById('pinFormDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('pinFormAmount').value = '';
  document.getElementById('pinFormRef').value = '';
  document.getElementById('pinFormInvRef').value = '';
  _openFullScreenForm('paymentInFormPanel');
}
export function savePaymentInForm() {
  const clientId = document.getElementById('pinFormClient').value;
  const amount = parseFloat(document.getElementById('pinFormAmount').value);
  if (!clientId || !amount) { showToast('Client and Amount required', 'error'); return; }
  const rec = {
    id: 'pin_' + Date.now(), clientId, date: document.getElementById('pinFormDate').value,
    accountId: document.getElementById('pinFormAccount')?.value || '',
    amount, mode: document.getElementById('pinFormMode')?.value || 'Cash',
    ref: document.getElementById('pinFormRef')?.value || '',
    invoiceRef: document.getElementById('pinFormInvRef')?.value || '',
    receiptNo: 'RCP-' + (Date.now() % 100000)
  };
  // Also push to paymentsIn for the accounting integration
  state.paymentsIn.push(rec);
  saveAllData(); closeFullScreenForm('paymentInFormPanel');
  showToast('Payment-In recorded!'); renderPaymentInList();
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
    tbody.innerHTML += `<tr class="hover:bg-slate-50"><td class="px-4 py-3 text-slate-500">${p.date}</td><td class="px-4 py-3 font-mono font-bold text-green-700">${p.receiptNo || p.ref || '-'}</td><td class="px-4 py-3 font-bold">${c?.name || 'Unknown'}</td><td class="px-4 py-3 text-slate-500">${p.invoiceRef || '-'}</td><td class="px-4 py-3"><span class="bg-blue-100 text-blue-700 text-[10px] px-2 py-1 rounded font-bold">${p.mode || 'Cash'}</span></td><td class="px-4 py-3 text-right font-extrabold text-green-700">${getCurrencySymbol()}${parseFloat(p.amount).toLocaleString('en-IN')}</td><td class="px-4 py-3 text-center"><button onclick="deletePaymentIn('${p.id}')" class="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] px-2 py-1 rounded font-bold">Del</button></td></tr>`;
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
  state.paymentsIn = (state.paymentsIn || []).filter(p => p.id !== id);
  saveAllData(); renderPaymentInList(); showToast('Payment Deleted', 'error');
}

// ══════════════════════════════════
// SALE ORDER
// ══════════════════════════════════
export function openSaleOrderForm() {
  _populateClientSelect('soFormClient');
  document.getElementById('soFormDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('soFormNo').value = 'SO-' + (Date.now() % 100000);
  document.getElementById('soFormTableBody').innerHTML = '';
  addSOFormRow(3); calcSOFormTotal();
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
  const rec = {
    id: 'so_' + Date.now(), soNo: document.getElementById('soFormNo').value,
    date: document.getElementById('soFormDate').value, clientId, items, total: sub,
    deliveryDate: document.getElementById('soFormDelivery')?.value || '',
    terms: document.getElementById('soFormTerms')?.value || '',
    deliveryStatus: 'Pending', paymentStatus: 'Pending'
  };
  if (!state.saleOrders) state.saleOrders = [];
  state.saleOrders.push(rec);
  saveAllData(); closeFullScreenForm('saleOrderFormPanel');
  showToast('Sale Order saved!'); renderSaleOrders();
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
    tbody.innerHTML += `<tr class="hover:bg-slate-50"><td class="px-4 py-3 font-mono font-bold text-blue-700">${o.soNo}</td><td class="px-4 py-3 text-slate-500">${o.date}</td><td class="px-4 py-3 font-bold">${c?.name || 'Unknown'}</td><td class="px-4 py-3 text-right font-bold">${getCurrencySymbol()}${o.total?.toLocaleString('en-IN')}</td><td class="px-4 py-3 text-center">${dBadge}</td><td class="px-4 py-3 text-center">${pBadge}</td><td class="px-4 py-3 text-center"><button onclick="deleteSaleOrder('${o.id}')" class="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] px-2 py-1 rounded font-bold">Del</button></td></tr>`;
  });
  if (!list.length) tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-slate-400 font-medium">No sale orders found.</td></tr>';
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  s('soKpiPending', kPend); s('soKpiCompleted', kComp); s('soKpiInvoiced', kInv);
  s('soKpiTotal', getCurrencySymbol() + kTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
}
export function clearSOFilters() { ['soSearch','soFilterClient','soFilterStatus','soFromDate','soToDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); renderSaleOrders(); }
export function deleteSaleOrder(id) {
  if (!confirm('Delete this Sale Order?')) return;
  state.saleOrders = (state.saleOrders || []).filter(o => o.id !== id);
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
  state.deliveryChallans = (state.deliveryChallans || []).filter(d => d.id !== id);
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
  state.saleReturns = (state.saleReturns || []).filter(r => r.id !== id);
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
  state.saleFixedAssets = (state.saleFixedAssets || []).filter(a => a.id !== id);
  saveAllData(); renderSaleFixedAssets(); showToast('Asset Sale Deleted', 'error');
}

// ══════════════════════════════════
// OTHER INCOME
// ══════════════════════════════════
export function openOtherIncomeForm() {
  document.getElementById('oiFormDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('oiFormSource').value = '';
  document.getElementById('oiFormAmount').value = '';
  document.getElementById('oiFormRef').value = '';
  document.getElementById('oiFormNotes').value = '';
  _openFullScreenForm('otherIncomeFormPanel');
}
export function saveOtherIncomeForm() {
  const source = document.getElementById('oiFormSource').value;
  const amount = parseFloat(document.getElementById('oiFormAmount').value);
  if (!source || !amount) { showToast('Source and Amount required', 'error'); return; }
  const rec = {
    id: 'oi_' + Date.now(), incomeNo: 'OI-' + (Date.now() % 100000), source,
    date: document.getElementById('oiFormDate').value,
    category: document.getElementById('oiFormCategory')?.value || 'Other',
    payType: document.getElementById('oiFormPayType')?.value || 'Cash',
    amount, ref: document.getElementById('oiFormRef')?.value || '',
    notes: document.getElementById('oiFormNotes')?.value || ''
  };
  if (!state.otherIncome) state.otherIncome = [];
  state.otherIncome.push(rec);
  saveAllData(); closeFullScreenForm('otherIncomeFormPanel');
  showToast('Other Income recorded!'); renderOtherIncome();
}
export function renderOtherIncome() {
  const search = (document.getElementById('oiSearch')?.value || '').toLowerCase();
  const catFilter = document.getElementById('oiFilterCategory')?.value || '';
  let list = [...(state.otherIncome || [])];
  list = list.filter(o => (!search || o.source?.toLowerCase().includes(search) || o.incomeNo?.toLowerCase().includes(search)) && (!catFilter || o.category === catFilter));
  list.sort((a, b) => new Date(b.date) - new Date(a.date));
  const tbody = document.getElementById('oiTableBody');
  if (!tbody) return; tbody.innerHTML = '';
  let kTotal = 0, kMonth = 0;
  const curMonth = new Date().toISOString().slice(0, 7);
  list.forEach(o => {
    kTotal += o.amount;
    if (o.date?.startsWith(curMonth)) kMonth += o.amount;
    tbody.innerHTML += `<tr class="hover:bg-slate-50"><td class="px-4 py-3 font-mono font-bold text-green-700">${o.incomeNo}</td><td class="px-4 py-3 text-slate-500">${o.date}</td><td class="px-4 py-3 font-bold">${o.source}</td><td class="px-4 py-3"><span class="bg-blue-100 text-blue-700 text-[10px] px-2 py-1 rounded font-bold">${o.category}</span></td><td class="px-4 py-3"><span class="bg-slate-100 text-slate-700 text-[10px] px-2 py-1 rounded font-bold">${o.payType}</span></td><td class="px-4 py-3 text-right font-extrabold text-green-700">${getCurrencySymbol()}${o.amount?.toLocaleString('en-IN')}</td><td class="px-4 py-3 text-center"><button onclick="deleteOtherIncome('${o.id}')" class="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] px-2 py-1 rounded font-bold">Del</button></td></tr>`;
  });
  if (!list.length) tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-slate-400 font-medium">No other income entries found.</td></tr>';
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  s('oiKpiTotal', getCurrencySymbol() + kTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
  s('oiKpiMonth', getCurrencySymbol() + kMonth.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
  s('oiKpiCount', list.length);
}
export function clearOIFilters() { ['oiSearch','oiFilterCategory','oiFromDate','oiToDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); renderOtherIncome(); }
export function deleteOtherIncome(id) {
  if (!confirm('Delete this income entry?')) return;
  state.otherIncome = (state.otherIncome || []).filter(o => o.id !== id);
  saveAllData(); renderOtherIncome(); showToast('Income Entry Deleted', 'error');
}
