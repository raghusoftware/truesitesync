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
  // Re-fill every row's rate from the newly picked supplier's approved rates.
  const vendorSel = document.getElementById('poOrdFormVendor');
  if (vendorSel) vendorSel.onchange = () => _poVendorChanged();
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
    tr.innerHTML = `<td class="p-1 border text-center text-xs font-bold text-slate-400 po-row-num">${tbody.rows.length + 1}</td><td class="p-1 border"><select class="table-input pur-mat font-bold" onchange="_poRowFillRate(this)">${rmOpts}</select></td><td class="p-1 border"><input type="number" class="table-input pur-qty" oninput="calcPOFormTotal()"></td><td class="p-1 border"><input type="number" class="table-input pur-rate" oninput="calcPOFormTotal()"></td><td class="p-1 border bg-slate-50"><input type="text" class="table-input pur-amt font-bold text-blue-800 text-right" readonly></td><td class="p-1 border text-center"><button onclick="this.closest('tr').remove(); calcPOFormTotal();" class="text-red-400 hover:bg-red-50 p-1 rounded font-bold">✕</button></td>`;
    tbody.appendChild(tr);
  }
}

/** Approved rate a supplier charges for a material, or null if none on file. */
function _approvedRate(vendorId, matId) {
  if (!vendorId || !matId) return null;
  const rm = (state.rawMaterials || []).find(m => m.id === matId);
  const rec = (rm?.supplierRates || []).find(s => s.vendorId === vendorId && s.approved !== false && s.rate != null);
  return rec ? rec.rate : null;
}

/** Fill one PO row's rate from the selected supplier's approved rate for its item. */
window._poRowFillRate = function (matSel) {
  const tr = matSel.closest('tr'); if (!tr) return;
  const vendorId = document.getElementById('poOrdFormVendor')?.value || '';
  const rate = _approvedRate(vendorId, matSel.value);
  if (rate != null) {
    const rateEl = tr.querySelector('.pur-rate');
    if (rateEl) rateEl.value = rate;  // auto-filled; user can still override
  }
  calcPOFormTotal();
};

/** Supplier changed — refresh the rate on every row that has an approved rate on file. */
window._poVendorChanged = function () {
  const vendorId = document.getElementById('poOrdFormVendor')?.value || '';
  document.querySelectorAll('#poOrdFormTableBody tr').forEach(tr => {
    const matId = tr.querySelector('.pur-mat')?.value;
    const rate = _approvedRate(vendorId, matId);
    if (rate != null) { const rateEl = tr.querySelector('.pur-rate'); if (rateEl) rateEl.value = rate; }
  });
  calcPOFormTotal();
};

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

/**
 * Fulfillment of a Purchase Order = how much of each ordered item has actually
 * been received against it. "Received" sums every GRN linked to the PO
 * (g.poId === po.id) by material — this covers both manual GRNs (PO picked on
 * the receipt) and the auto-GRNs a purchase bill creates for a PO it references.
 * Returns per-item ordered/received/remaining plus an overall % and status.
 */
export function poFulfillment(po) {
  const grns = (state.grnRecords || []).filter(g => g.poId === po.id);
  const recvByMat = {};
  grns.forEach(g => { recvByMat[g.matId] = (recvByMat[g.matId] || 0) + (Number(g.qty) || 0); });
  let orderedTotal = 0, receivedClamped = 0;
  const items = (po.items || []).map(it => {
    const rm = (state.rawMaterials || []).find(r => r.id === it.rawMatId);
    const ordered = Number(it.qty) || 0;
    const received = recvByMat[it.rawMatId] || 0;
    orderedTotal += ordered; receivedClamped += Math.min(received, ordered);
    return { matId: it.rawMatId, name: rm?.name || it.rawMatId, unit: rm?.unit || '', ordered, received, remaining: Math.max(0, ordered - received), rate: it.rate || 0 };
  });
  // Materials received against this PO that weren't on the original order (extras).
  Object.keys(recvByMat).forEach(mid => {
    if (!(po.items || []).some(it => it.rawMatId === mid)) {
      const rm = (state.rawMaterials || []).find(r => r.id === mid);
      items.push({ matId: mid, name: (rm?.name || mid) + ' (extra)', unit: rm?.unit || '', ordered: 0, received: recvByMat[mid], remaining: 0, rate: 0, extra: true });
    }
  });
  const pct = orderedTotal > 0 ? Math.min(100, Math.round((receivedClamped / orderedTotal) * 100)) : (grns.length ? 100 : 0);
  const status = pct >= 100 && (orderedTotal > 0 || grns.length) ? 'Completed' : (receivedClamped > 0 ? 'Partial' : 'Pending');
  return { items, orderedTotal, receivedTotal: receivedClamped, pct, status, grns };
}
window.poFulfillment = poFulfillment;

export function renderPurchaseOrders() {
  if (!state.purchaseOrders) state.purchaseOrders = [];
  const orders = [...state.purchaseOrders].sort((a, b) => new Date(b.date) - new Date(a.date));
  const _fmap = new Map(orders.map(o => [o.id, poFulfillment(o)]));
  const completed = orders.filter(o => _fmap.get(o.id).status === 'Completed').length;
  const pending = orders.length - completed;
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
    const f = _fmap.get(o.id);
    const barColor = f.status === 'Completed' ? '#16a34a' : (f.status === 'Partial' ? '#f59e0b' : '#cbd5e1');
    const chip = f.status === 'Completed'
      ? '<span class="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded font-bold">Completed</span>'
      : (f.status === 'Partial'
        ? `<span class="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded font-bold">Partial ${f.pct}%</span>`
        : '<span class="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded font-bold">Pending</span>');
    const dCell = `<div class="flex flex-col items-center gap-1">${chip}<div style="width:78px;height:5px;background:#e2e8f0;border-radius:99px;overflow:hidden;"><div style="width:${f.pct}%;height:100%;background:${barColor};"></div></div><span class="text-[9px] text-slate-400">recv ${(+f.receivedTotal.toFixed(2))}/${(+f.orderedTotal.toFixed(2))}</span></div>`;
    const pBadge = o.paymentStatus === 'Paid' ? '<span class="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded font-bold">Paid</span>' : '<span class="bg-blue-100 text-blue-700 text-[10px] px-2 py-1 rounded font-bold">Unpaid</span>';
    tbody.innerHTML += `<tr class="hover:bg-slate-50 transition">
      <td class="px-4 py-3 font-mono font-bold text-blue-700">${o.poNo}</td>
      <td class="px-4 py-3 font-bold text-slate-700">${v?.name || 'Unknown'}</td>
      <td class="px-4 py-3 text-slate-500">${o.date}</td>
      <td class="px-4 py-3 text-right font-bold text-slate-800">${getCurrencySymbol()}${(o.totalAmount || 0).toLocaleString('en-IN')}</td>
      <td class="px-4 py-3 text-center">${dCell}</td>
      <td class="px-4 py-3 text-center">${pBadge}</td>
      <td class="px-4 py-3 text-center whitespace-nowrap">
        <button onclick="viewPurchaseOrderReport('${o.id}')" class="text-indigo-600 bg-indigo-50 hover:bg-indigo-100 text-[10px] px-2 py-1 rounded font-bold mr-1">📊 Track</button>
        <button onclick="openPurchaseOrderForm('${o.id}')" class="text-blue-600 bg-blue-50 hover:bg-blue-100 text-[10px] px-2 py-1 rounded font-bold mr-1">Edit</button>
        <button onclick="exportPurchaseOrderPDF('${o.id}')" class="text-slate-700 bg-slate-100 hover:bg-slate-200 text-[10px] px-2 py-1 rounded font-bold mr-1">PDF</button>
        <button onclick="deletePurchaseOrder('${o.id}')" class="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] px-2 py-1 rounded font-bold">Del</button>
      </td>
    </tr>`;
  });
}

/** Detail modal: PO items ordered/received/remaining + linked GRNs & bills. */
export function viewPurchaseOrderReport(id) {
  const po = (state.purchaseOrders || []).find(o => o.id === id);
  if (!po) return showToast('Purchase Order not found', 'error');
  const v = state.vendors.find(x => x.id === po.vendorId);
  const f = poFulfillment(po);
  const bills = (state.vendorMaterials || []).filter(b => b.poId === po.id);
  const cur = getCurrencySymbol();
  const qn = n => (+(Number(n) || 0).toFixed(2)).toLocaleString('en-IN');
  const statusColor = f.status === 'Completed' ? '#16a34a' : (f.status === 'Partial' ? '#f59e0b' : '#64748b');
  const itemRows = f.items.map(it => {
    const rc = it.remaining <= 0 && it.ordered > 0 ? '#16a34a' : (it.received > 0 ? '#f59e0b' : '#94a3b8');
    return `<tr style="border-bottom:1px solid #f1f5f9;">
      <td class="px-3 py-2 font-bold text-slate-700">${it.name}</td>
      <td class="px-3 py-2 text-center">${it.unit || ''}</td>
      <td class="px-3 py-2 text-right">${qn(it.ordered)}</td>
      <td class="px-3 py-2 text-right font-bold" style="color:${rc}">${qn(it.received)}</td>
      <td class="px-3 py-2 text-right font-bold ${it.remaining > 0 ? 'text-rose-600' : 'text-green-600'}">${qn(it.remaining)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="px-3 py-4 text-center text-slate-400">No items on this PO.</td></tr>';
  const grnRows = f.grns.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(g => {
    const m = state.rawMaterials.find(r => r.id === g.matId);
    return `<tr style="border-bottom:1px solid #f1f5f9;"><td class="px-3 py-1.5 font-mono text-blue-700">${g.grnNo || '—'}</td><td class="px-3 py-1.5">${g.date || ''}</td><td class="px-3 py-1.5">${m?.name || g.category || '—'}</td><td class="px-3 py-1.5 text-right font-bold">${qn(g.qty)} ${m?.unit || ''}</td><td class="px-3 py-1.5 text-center">${g.billed ? '<span class="text-green-600 font-bold">Billed</span>' : '<span class="text-rose-600 font-bold">Unbilled</span>'}</td></tr>`;
  }).join('') || '<tr><td colspan="5" class="px-3 py-3 text-center text-slate-400">No goods received against this PO yet.</td></tr>';
  const billRows = bills.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(b => `<tr style="border-bottom:1px solid #f1f5f9;"><td class="px-3 py-1.5 font-mono text-blue-700">${b.billNo || '—'}</td><td class="px-3 py-1.5">${b.date || ''}</td><td class="px-3 py-1.5 text-right font-bold">${cur}${qn(b.totalAmount)}</td></tr>`).join('') || '<tr><td colspan="3" class="px-3 py-3 text-center text-slate-400">No purchase bills reference this PO yet.</td></tr>';

  let modal = document.getElementById('poTrackModal');
  if (modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'poTrackModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center';
  modal.style.zIndex = '199999';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div class="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl">
      <div class="flex items-center gap-3 px-5 py-4 border-b" style="background:linear-gradient(135deg,#eef2ff,#e0e7ff);">
        <div class="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-lg">📊</div>
        <div class="flex-1 min-w-0">
          <h3 class="font-extrabold text-slate-800">PO Tracking — <span class="font-mono text-indigo-700">${po.poNo}</span></h3>
          <p class="text-xs text-slate-500">${v?.name || 'Unknown supplier'} &middot; ${po.date || ''}</p>
        </div>
        <span class="text-[11px] px-2.5 py-1 rounded-full font-bold text-white" style="background:${statusColor}">${f.status} · ${f.pct}%</span>
        <button onclick="document.getElementById('poTrackModal').remove()" class="ml-1 text-slate-400 hover:text-slate-700 text-2xl leading-none">&times;</button>
      </div>
      <div class="p-5 space-y-5">
        <div>
          <div class="text-[11px] font-extrabold text-slate-400 uppercase tracking-wide mb-2">Items — Ordered vs Received</div>
          <div class="overflow-x-auto border border-slate-100 rounded-xl"><table class="w-full text-xs"><thead class="bg-slate-50"><tr>
            <th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Item</th><th class="px-3 py-2 text-center font-bold uppercase text-slate-500">Unit</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Ordered</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Received</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Remaining</th>
          </tr></thead><tbody>${itemRows}</tbody></table></div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <div class="text-[11px] font-extrabold text-slate-400 uppercase tracking-wide mb-2">Goods Received (GRNs)</div>
            <div class="overflow-x-auto border border-slate-100 rounded-xl"><table class="w-full text-[11px]"><thead class="bg-slate-50"><tr><th class="px-3 py-1.5 text-left font-bold uppercase text-slate-500">GRN</th><th class="px-3 py-1.5 text-left font-bold uppercase text-slate-500">Date</th><th class="px-3 py-1.5 text-left font-bold uppercase text-slate-500">Material</th><th class="px-3 py-1.5 text-right font-bold uppercase text-slate-500">Qty</th><th class="px-3 py-1.5 text-center font-bold uppercase text-slate-500">Bill</th></tr></thead><tbody>${grnRows}</tbody></table></div>
          </div>
          <div>
            <div class="text-[11px] font-extrabold text-slate-400 uppercase tracking-wide mb-2">Purchase Bills</div>
            <div class="overflow-x-auto border border-slate-100 rounded-xl"><table class="w-full text-[11px]"><thead class="bg-slate-50"><tr><th class="px-3 py-1.5 text-left font-bold uppercase text-slate-500">Bill No</th><th class="px-3 py-1.5 text-left font-bold uppercase text-slate-500">Date</th><th class="px-3 py-1.5 text-right font-bold uppercase text-slate-500">Amount</th></tr></thead><tbody>${billRows}</tbody></table></div>
          </div>
        </div>
      </div>
      <div class="px-5 py-3 border-t bg-slate-50 flex justify-end gap-2">
        <button onclick="exportPOTrackingPDF('${po.id}')" class="px-4 py-2 rounded-lg font-bold text-xs text-white bg-indigo-600 hover:bg-indigo-700">🖨️ PDF</button>
        <button onclick="document.getElementById('poTrackModal').remove()" class="px-4 py-2 rounded-lg font-bold text-xs text-slate-600 bg-white border border-slate-200 hover:bg-slate-100">Close</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}
window.viewPurchaseOrderReport = viewPurchaseOrderReport;

/** PDF of the PO tracking report (items ordered/received/remaining + GRNs). */
export function exportPOTrackingPDF(id) {
  const po = (state.purchaseOrders || []).find(o => o.id === id);
  if (!po) return showToast('Purchase Order not found', 'error');
  const v = state.vendors.find(x => x.id === po.vendorId);
  const f = poFulfillment(po);
  const sym = getPdfCurrency().trim();
  const qn = n => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const doc = new window.jspdf.jsPDF();
  let y = getCompanyHeaderForPDF(doc);
  doc.setFontSize(14); doc.setTextColor(0); doc.setFont('helvetica', 'bold');
  doc.text('PURCHASE ORDER — TRACKING', 105, y + 5, null, null, 'center');
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`PO No: ${po.poNo || ''}`, 14, y + 14); doc.text(`Date: ${po.date || ''}`, 14, y + 19);
  doc.text(`Supplier: ${v?.name || '—'}`, 14, y + 24);
  doc.text(`Status: ${f.status} (${f.pct}% received)`, 140, y + 14);
  const rows = f.items.map((it, i) => [i + 1, it.name, it.unit || '', qn(it.ordered), qn(it.received), qn(it.remaining)]);
  doc.autoTable({
    startY: y + 30, head: [['#', 'Item', 'Unit', 'Ordered', 'Received', 'Remaining']], body: rows, theme: 'grid',
    headStyles: { fillColor: [79, 70, 229], fontSize: 9 }, styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak' },
    columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 70 }, 2: { cellWidth: 20, halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
  });
  let gy = doc.lastAutoTable.finalY + 8;
  const grns = f.grns.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (grns.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Goods Received', 14, gy); gy += 2;
    const grows = grns.map(g => { const m = state.rawMaterials.find(r => r.id === g.matId); return [g.grnNo || '—', g.date || '', m?.name || g.category || '—', `${qn(g.qty)} ${m?.unit || ''}`, g.billed ? 'Billed' : 'Unbilled']; });
    doc.autoTable({ startY: gy + 2, head: [['GRN', 'Date', 'Material', 'Qty', 'Bill']], body: grows, theme: 'grid', headStyles: { fillColor: [100, 116, 139], fontSize: 8 }, styles: { fontSize: 8, cellPadding: 2 }, columnStyles: { 3: { halign: 'right' }, 4: { halign: 'center' } } });
    gy = doc.lastAutoTable.finalY + 8;
  }
  const bills = (state.vendorMaterials || []).filter(b => b.poId === po.id);
  if (bills.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Purchase Bills', 14, gy);
    const brows = bills.map(b => [b.billNo || '—', b.date || '', `${sym} ${qn(b.totalAmount)}`]);
    doc.autoTable({ startY: gy + 4, head: [['Bill No', 'Date', 'Amount']], body: brows, theme: 'grid', headStyles: { fillColor: [30, 64, 175], fontSize: 8 }, styles: { fontSize: 8, cellPadding: 2 }, columnStyles: { 2: { halign: 'right' } } });
  }
  mobileSavePDF(doc, `${po.poNo || 'PO'}-tracking.pdf`);
}
window.exportPOTrackingPDF = exportPOTrackingPDF;

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
