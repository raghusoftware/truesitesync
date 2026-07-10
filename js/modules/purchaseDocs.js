/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Purchase Order, Purchase Return & Fixed Asset forms
 * ═══════════════════════════════════════════════════════════
 * Procurement documents (PO / debit-note return / asset purchase).
 * Extracted from ui.js. Shared form chrome from formHelpers.js.
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { showToast, getCurrencySymbol, getCompanyHeaderForPDF, getPdfCurrency, mobileSavePDF } from './utils.js';
import { _openFullScreenForm, _populateVendorSelect, closeFullScreenForm } from './formHelpers.js';

export function openPurchaseOrderForm(editId) {
  _populateVendorSelect('poOrdFormVendor');
  const po = editId ? (state.purchaseOrders || []).find(o => o.id === editId) : null;
  state._editingPOId = po ? po.id : null;
  const tbody = document.getElementById('poOrdFormTableBody');
  tbody.innerHTML = '';
  if (po) {
    document.getElementById('poOrdFormVendor').value = po.vendorId || '';
    document.getElementById('poOrdFormNo').value = po.poNo || '';
    document.getElementById('poOrdFormDate').value = po.date || new Date().toISOString().split('T')[0];
    const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    setV('poOrdFormAddr', po.address); setV('poOrdFormDelivery', po.deliveryDate); setV('poOrdFormTerms', po.terms);
    (po.items || []).forEach(it => {
      addPOFormRow(1);
      const tr = tbody.rows[tbody.rows.length - 1];
      tr.querySelector('.pur-mat').value = it.rawMatId || '';
      tr.querySelector('.pur-qty').value = it.qty ?? '';
      tr.querySelector('.pur-rate').value = it.rate ?? '';
    });
    if (!(po.items || []).length) addPOFormRow(1);
  } else {
    document.getElementById('poOrdFormDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('poOrdFormNo').value = 'PO-' + ((state.purchaseOrders || []).length + 1).toString().padStart(3, '0');
    ['poOrdFormAddr', 'poOrdFormDelivery', 'poOrdFormTerms'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    addPOFormRow(3);
  }
  calcPOFormTotal();
  _openFullScreenForm('purchaseOrderFormPanel');
}

export function addPOFormRow(count = 1) {
  const tbody = document.getElementById('poOrdFormTableBody');
  let rmOpts = '<option value="">-- Select Item --</option>';
  state.rawMaterials.forEach(rm => rmOpts += `<option value="${rm.id}">${rm.name} (${rm.unit})</option>`);
  for (let i = 0; i < count; i++) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="p-1 border text-center text-xs font-bold text-slate-400 po-row-num">${tbody.rows.length + 1}</td><td class="p-1 border"><select class="table-input pur-mat font-bold">${rmOpts}</select></td><td class="p-1 border"><input type="number" class="table-input pur-qty" oninput="calcPOFormTotal()"></td><td class="p-1 border"><input type="number" class="table-input pur-rate" oninput="calcPOFormTotal()"></td><td class="p-1 border bg-slate-50"><input type="text" class="table-input pur-amt font-bold text-blue-800 text-right" readonly></td><td class="p-1 border text-center"><button onclick="this.closest('tr').remove(); calcPOFormTotal();" class="text-red-400 hover:bg-red-50 p-1 rounded font-bold">✕</button></td>`;
    tbody.appendChild(tr);
  }
}

export function calcPOFormTotal() {
  let sub = 0;
  document.querySelectorAll('#poOrdFormTableBody tr').forEach((tr, idx) => {
    const numEl = tr.querySelector('.po-row-num'); if (numEl) numEl.textContent = idx + 1;
    const q = parseFloat(tr.querySelector('.pur-qty')?.value) || 0;
    const r = parseFloat(tr.querySelector('.pur-rate')?.value) || 0;
    const a = q * r;
    const amtEl = tr.querySelector('.pur-amt'); if (amtEl) amtEl.value = a > 0 ? a.toFixed(2) : '';
    sub += a;
  });
  if (document.getElementById('poOrdFormSubtotal')) document.getElementById('poOrdFormSubtotal').textContent = getCurrencySymbol() + sub.toFixed(2);
  if (document.getElementById('poOrdFormTotal')) document.getElementById('poOrdFormTotal').textContent = getCurrencySymbol() + sub.toFixed(2);
}

export function savePurchaseOrderForm() {
  const vendorId = document.getElementById('poOrdFormVendor').value;
  const poNo = document.getElementById('poOrdFormNo').value.trim();
  const date = document.getElementById('poOrdFormDate').value;
  if (!vendorId || !poNo) return showToast('Vendor and PO Number required!', 'error');
  const items = [];
  let total = 0;
  document.querySelectorAll('#poOrdFormTableBody tr').forEach(tr => {
    const matId = tr.querySelector('.pur-mat')?.value;
    const qty = parseFloat(tr.querySelector('.pur-qty')?.value) || 0;
    const rate = parseFloat(tr.querySelector('.pur-rate')?.value) || 0;
    if (matId && qty > 0) { const amt = qty * rate; items.push({ rawMatId: matId, qty, rate, amount: amt }); total += amt; }
  });
  if (items.length === 0) return showToast('Add at least one item!', 'error');
  if (!state.purchaseOrders) state.purchaseOrders = [];
  const fields = {
    vendorId, poNo, date, items, totalAmount: total,
    deliveryDate: document.getElementById('poOrdFormDelivery').value,
    address: document.getElementById('poOrdFormAddr').value,
    terms: document.getElementById('poOrdFormTerms').value
  };
  const editId = state._editingPOId;
  const existing = editId ? state.purchaseOrders.find(o => o.id === editId) : null;
  if (existing) {
    Object.assign(existing, fields);   // keep id, statuses, _fromEstimate
  } else {
    state.purchaseOrders.push({ id: 'po_' + Date.now(), ...fields, deliveryStatus: 'Pending', paymentStatus: 'Unpaid' });
  }
  state._editingPOId = null;
  saveAllData();
  closeFullScreenForm('purchaseOrderFormPanel');
  showToast(existing ? 'Purchase Order Updated!' : 'Purchase Order Created!', 'success');
  renderPurchaseOrders();
}

export function exportPurchaseOrderPDF(id) {
  const po = (state.purchaseOrders || []).find(o => o.id === id);
  if (!po) return showToast('Purchase Order not found', 'error');
  const v = (state.vendors || []).find(x => x.id === po.vendorId);
  const sym = getPdfCurrency().trim();
  const n2 = x => (Number(x) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const doc = new window.jspdf.jsPDF();
  let y = getCompanyHeaderForPDF(doc);
  doc.setFontSize(14); doc.setTextColor(0);
  doc.text('PURCHASE ORDER', 105, y + 5, null, null, 'center');
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`PO No: ${po.poNo || ''}`, 14, y + 15); doc.text(`Date: ${po.date || ''}`, 14, y + 20);
  doc.text(`Vendor: ${v?.name || '—'}`, 14, y + 28);
  if (po.deliveryDate) doc.text(`Delivery: ${po.deliveryDate}`, 140, y + 15);
  if (po.address) doc.text(`Deliver to: ${po.address}`, 14, y + 33, { maxWidth: 180 });
  const rows = (po.items || []).map((it, i) => {
    const rm = (state.rawMaterials || []).find(r => r.id === it.rawMatId);
    return [i + 1, rm?.name || it.rawMatId, `${it.qty || 0} ${rm?.unit || ''}`.trim(), n2(it.rate), n2(it.amount ?? (it.qty || 0) * (it.rate || 0))];
  });
  doc.autoTable({
    startY: y + 40, head: [['#', 'Material', 'Qty', `Rate (${sym})`, `Amount (${sym})`]], body: rows, theme: 'grid',
    headStyles: { fillColor: [37, 99, 235], fontSize: 9 }, styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak' },
    columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 82 }, 2: { halign: 'right', cellWidth: 30 }, 3: { halign: 'right', cellWidth: 28 }, 4: { halign: 'right', cellWidth: 30 } }
  });
  let tY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text(`Total: ${sym} ${n2(po.totalAmount)}`, 14, tY);
  if (po.terms) { tY += 12; doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text('Terms:', 14, tY); doc.setFont('helvetica', 'normal'); doc.text(po.terms, 14, tY + 6, { maxWidth: 180 }); }
  mobileSavePDF(doc, `${po.poNo || 'PurchaseOrder'}.pdf`);
}
window.exportPurchaseOrderPDF = exportPurchaseOrderPDF;

export function renderPurchaseOrders() {
  if (!state.purchaseOrders) state.purchaseOrders = [];
  const orders = [...state.purchaseOrders].sort((a, b) => new Date(b.date) - new Date(a.date));
  const pending = orders.filter(o => o.deliveryStatus === 'Pending').length;
  const completed = orders.filter(o => o.deliveryStatus === 'Completed').length;
  const totalVal = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
  if (document.getElementById('poOrdTotal')) document.getElementById('poOrdTotal').textContent = orders.length;
  if (document.getElementById('poOrdPending')) document.getElementById('poOrdPending').textContent = pending;
  if (document.getElementById('poOrdCompleted')) document.getElementById('poOrdCompleted').textContent = completed;
  if (document.getElementById('poOrdValue')) document.getElementById('poOrdValue').textContent = getCurrencySymbol() + ' ' + totalVal.toLocaleString('en-IN');

  const search = (document.getElementById('poOrderSearch')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('poOrderStatus')?.value || '';
  let filtered = orders;
  if (search) filtered = filtered.filter(o => (o.poNo || '').toLowerCase().includes(search));
  if (statusFilter) filtered = filtered.filter(o => o.deliveryStatus === statusFilter || o.paymentStatus === statusFilter);

  const tbody = document.getElementById('poOrderTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-12 text-center text-slate-400 font-medium">No purchase orders found.</td></tr>'; return; }
  filtered.forEach(o => {
    const v = state.vendors.find(x => x.id === o.vendorId);
    const dBadge = o.deliveryStatus === 'Completed' ? '<span class="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded font-bold">Completed</span>' : '<span class="bg-orange-100 text-orange-700 text-[10px] px-2 py-1 rounded font-bold">Pending</span>';
    const pBadge = o.paymentStatus === 'Paid' ? '<span class="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded font-bold">Paid</span>' : '<span class="bg-blue-100 text-blue-700 text-[10px] px-2 py-1 rounded font-bold">Unpaid</span>';
    tbody.innerHTML += `<tr class="hover:bg-slate-50 transition">
      <td class="px-4 py-3 font-mono font-bold text-blue-700">${o.poNo}</td>
      <td class="px-4 py-3 font-bold text-slate-700">${v?.name || 'Unknown'}</td>
      <td class="px-4 py-3 text-slate-500">${o.date}</td>
      <td class="px-4 py-3 text-right font-bold text-slate-800">${getCurrencySymbol()}${(o.totalAmount || 0).toLocaleString('en-IN')}</td>
      <td class="px-4 py-3 text-center">${dBadge}</td>
      <td class="px-4 py-3 text-center">${pBadge}</td>
      <td class="px-4 py-3 text-center whitespace-nowrap">
        <button onclick="openPurchaseOrderForm('${o.id}')" class="text-blue-600 bg-blue-50 hover:bg-blue-100 text-[10px] px-2 py-1 rounded font-bold mr-1">Edit</button>
        <button onclick="exportPurchaseOrderPDF('${o.id}')" class="text-slate-700 bg-slate-100 hover:bg-slate-200 text-[10px] px-2 py-1 rounded font-bold mr-1">PDF</button>
        <button onclick="deletePurchaseOrder('${o.id}')" class="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] px-2 py-1 rounded font-bold">Del</button>
      </td>
    </tr>`;
  });
}

export function clearPOFilters() {
  ['poOrderSearch', 'poOrderStatus'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderPurchaseOrders();
}

export function deletePurchaseOrder(id) {
  if (!confirm('Delete this Purchase Order?')) return;
  window.recycleDelete && window.recycleDelete('purchaseOrders', id, 'Purchase Order');
  saveAllData(); renderPurchaseOrders(); showToast('Purchase Order Deleted', 'error');
}

// ==========================================
// PURCHASE RETURN MODULE
// ==========================================
export function openPurchaseReturnForm() {
  _populateVendorSelect('prFormVendor');
  document.getElementById('prFormDate').value = new Date().toISOString().split('T')[0];
  const retNo = 'DR-' + ((state.purchaseReturns || []).length + 1).toString().padStart(3, '0');
  document.getElementById('prFormNo').value = retNo;
  ['prFormInvRef', 'prFormAmount', 'prFormReason'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  _openFullScreenForm('purchaseReturnFormPanel');
}

export function savePurchaseReturnForm() {
  const vendorId = document.getElementById('prFormVendor').value;
  const returnNo = document.getElementById('prFormNo').value.trim();
  const date = document.getElementById('prFormDate').value;
  const invoiceRef = document.getElementById('prFormInvRef').value.trim();
  const amount = parseFloat(document.getElementById('prFormAmount').value) || 0;
  const reason = document.getElementById('prFormReason').value.trim();
  if (!vendorId || !returnNo || amount <= 0) return showToast('Vendor, Return No, and Amount required!', 'error');
  if (!state.purchaseReturns) state.purchaseReturns = [];
  state.purchaseReturns.push({ id: 'pr_' + Date.now(), vendorId, returnNo, date, invoiceRef, amount, reason, status: 'Processed' });
  saveAllData();
  closeFullScreenForm('purchaseReturnFormPanel');
  showToast('Purchase Return / Debit Note Created!', 'success');
  renderPurchaseReturns();
}

export function renderPurchaseReturns() {
  if (!state.purchaseReturns) state.purchaseReturns = [];
  const returns = [...state.purchaseReturns].sort((a, b) => new Date(b.date) - new Date(a.date));
  const totalAmt = returns.reduce((s, r) => s + (r.amount || 0), 0);
  const adjusted = returns.filter(r => r.status === 'Processed').reduce((s, r) => s + (r.amount || 0), 0);
  if (document.getElementById('prKpiCount')) document.getElementById('prKpiCount').textContent = returns.length;
  if (document.getElementById('prKpiTotal')) document.getElementById('prKpiTotal').textContent = getCurrencySymbol() + ' ' + totalAmt.toLocaleString('en-IN');
  if (document.getElementById('prKpiAdjusted')) document.getElementById('prKpiAdjusted').textContent = getCurrencySymbol() + ' ' + adjusted.toLocaleString('en-IN');

  const tbody = document.getElementById('prTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (returns.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-12 text-center text-slate-400 font-medium">No purchase returns found.</td></tr>'; return; }
  returns.forEach(r => {
    const v = state.vendors.find(x => x.id === r.vendorId);
    tbody.innerHTML += `<tr class="hover:bg-slate-50 transition">
      <td class="px-4 py-3 font-mono font-bold text-blue-700">${r.returnNo}</td>
      <td class="px-4 py-3 font-bold text-slate-700">${v?.name || 'Unknown'}</td>
      <td class="px-4 py-3 text-slate-500">${r.invoiceRef || '-'}</td>
      <td class="px-4 py-3 text-right font-bold text-slate-800">${getCurrencySymbol()}${(r.amount || 0).toLocaleString('en-IN')}</td>
      <td class="px-4 py-3 text-center"><span class="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded font-bold">${r.status}</span></td>
      <td class="px-4 py-3 text-slate-500">${r.date}</td>
      <td class="px-4 py-3 text-center"><button onclick="deletePurchaseReturn('${r.id}')" class="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] px-2 py-1 rounded font-bold">Del</button></td>
    </tr>`;
  });
}

export function deletePurchaseReturn(id) {
  if (!confirm('Delete this Purchase Return?')) return;
  window.recycleDelete && window.recycleDelete('purchaseReturns', id, 'Purchase Return');
  saveAllData(); renderPurchaseReturns(); showToast('Purchase Return Deleted', 'error');
}

// ==========================================
// FIXED ASSETS MODULE
// ==========================================
export function openFixedAssetForm() {
  _populateVendorSelect('faFormVendor');
  document.getElementById('faFormDate').value = new Date().toISOString().split('T')[0];
  ['faFormName', 'faFormAmount', 'faFormNotes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('faFormCategory').value = 'Machinery';
  document.getElementById('faFormLife').value = '5';
  _openFullScreenForm('fixedAssetFormPanel');
}

export function saveFixedAssetForm() {
  const name = document.getElementById('faFormName').value.trim();
  const category = document.getElementById('faFormCategory').value;
  const vendorId = document.getElementById('faFormVendor').value;
  const date = document.getElementById('faFormDate').value;
  const amount = parseFloat(document.getElementById('faFormAmount').value) || 0;
  const life = parseInt(document.getElementById('faFormLife').value) || 5;
  const notes = document.getElementById('faFormNotes').value.trim();
  if (!name || amount <= 0) return showToast('Asset Name and Amount required!', 'error');
  if (!state.fixedAssets) state.fixedAssets = [];
  const depreciationPerYear = amount / life;
  const yearsElapsed = Math.min(life, Math.max(0, (new Date().getFullYear() - new Date(date).getFullYear())));
  const currentValue = Math.max(0, amount - (depreciationPerYear * yearsElapsed));
  state.fixedAssets.push({ id: 'fa_' + Date.now(), name, category, vendorId, date, amount, life, notes, currentValue: Math.round(currentValue), status: 'Active' });
  saveAllData();
  closeFullScreenForm('fixedAssetFormPanel');
  showToast('Fixed Asset Added!', 'success');
  renderFixedAssets();
}

export function renderFixedAssets() {
  if (!state.fixedAssets) state.fixedAssets = [];
  const assets = [...state.fixedAssets].sort((a, b) => new Date(b.date) - new Date(a.date));
  const totalVal = assets.reduce((s, a) => s + (a.amount || 0), 0);
  const currentVal = assets.reduce((s, a) => s + (a.currentValue || 0), 0);
  const depr = totalVal - currentVal;
  if (document.getElementById('faKpiCount')) document.getElementById('faKpiCount').textContent = assets.length;
  if (document.getElementById('faKpiValue')) document.getElementById('faKpiValue').textContent = getCurrencySymbol() + ' ' + totalVal.toLocaleString('en-IN');
  if (document.getElementById('faKpiCurrent')) document.getElementById('faKpiCurrent').textContent = getCurrencySymbol() + ' ' + currentVal.toLocaleString('en-IN');
  if (document.getElementById('faKpiDepr')) document.getElementById('faKpiDepr').textContent = getCurrencySymbol() + ' ' + depr.toLocaleString('en-IN');

  const tbody = document.getElementById('faTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (assets.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-12 text-center text-slate-400 font-medium">No fixed assets recorded.</td></tr>'; return; }
  assets.forEach(a => {
    const v = state.vendors.find(x => x.id === a.vendorId);
    tbody.innerHTML += `<tr class="hover:bg-slate-50 transition">
      <td class="px-4 py-3 font-bold text-slate-700">${a.name}</td>
      <td class="px-4 py-3 text-slate-500">${v?.name || '-'}</td>
      <td class="px-4 py-3 text-slate-500">${a.date}</td>
      <td class="px-4 py-3 text-right font-bold text-slate-800">${getCurrencySymbol()}${(a.amount || 0).toLocaleString('en-IN')}</td>
      <td class="px-4 py-3"><span class="bg-blue-100 text-blue-700 text-[10px] px-2 py-1 rounded font-bold">${a.category}</span></td>
      <td class="px-4 py-3 text-center"><span class="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded font-bold">${a.status}</span></td>
      <td class="px-4 py-3 text-center"><button onclick="deleteFixedAsset('${a.id}')" class="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] px-2 py-1 rounded font-bold">Del</button></td>
    </tr>`;
  });
}

export function deleteFixedAsset(id) {
  if (!confirm('Delete this Fixed Asset?')) return;
  window.recycleDelete && window.recycleDelete('fixedAssets', id, 'Fixed Asset');
  saveAllData(); renderFixedAssets(); showToast('Fixed Asset Deleted', 'error');
}

// ==========================================
// ═══════ SALE MODULE FUNCTIONS ═══════
// ==========================================


// ══════════════════════════════════════════════════════════════════
// SALE INVOICE — Premium ERP Redesign
// Smart autocomplete, PO combo-box, usage tracking, discount column
// ══════════════════════════════════════════════════════════════════

// ── Debounce helper ──
let _siItemDebounce = null;

// ── Credit / Cash toggle ──
