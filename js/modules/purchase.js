/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Purchase ledger & purchase entry panel
 * ═══════════════════════════════════════════════════════════
 * Vendor purchase-bill ledger (list/view/delete) and the full-screen
 * purchase entry panel. Extracted from ui.js. Totals via purchaseCalc.js.
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { showToast, getCurrencySymbol } from './utils.js';
import { computePurchaseTotal } from './purchaseCalc.js';

export function renderPurchaseLedger() {
  const vFilterEl = document.getElementById('plFilterVendor');
  if (vFilterEl && vFilterEl.options.length <= 1) {
    state.vendors.forEach(v => vFilterEl.innerHTML += `<option value="${v.id}">${v.name}</option>`);
  }
  const sFilterEl = document.getElementById('plFilterSite');
  if (sFilterEl && sFilterEl.options.length <= 1) {
    getAllLocations().forEach(l => sFilterEl.innerHTML += `<option value="${l.id}">${l.name}</option>`);
  }
  const search = (document.getElementById('plSearch')?.value || '').toLowerCase();
  const vFilter = document.getElementById('plFilterVendor')?.value || '';
  const sFilter = document.getElementById('plFilterSite')?.value || '';
  const statusFilter = document.getElementById('plFilterStatus')?.value || '';
  const fromD = document.getElementById('plFromDate')?.value || '';
  const toD = document.getElementById('plToDate')?.value || '';

  let bills = state.vendorMaterials.filter(m => m.items);
  let vendorBalances = {};
  state.vendors.forEach(v => {
    let totalPaid = state.vendorPayments.filter(p => p.vendorId === v.id).reduce((s, p) => s + parseFloat(p.amount), 0);
    vendorBalances[v.id] = totalPaid;
  });
  bills.sort((a, b) => new Date(a.date) - new Date(b.date));
  let mappedBills = bills.map(b => {
    let billTotal = b.totalAmount || 0;
    let paidForThisBill = 0;
    if (vendorBalances[b.vendorId] >= billTotal) { paidForThisBill = billTotal; vendorBalances[b.vendorId] -= billTotal; }
    else if (vendorBalances[b.vendorId] > 0) { paidForThisBill = vendorBalances[b.vendorId]; vendorBalances[b.vendorId] = 0; }
    let outstanding = billTotal - paidForThisBill;
    let status = outstanding <= 0 ? 'Paid' : (paidForThisBill > 0 ? 'Partial' : 'Unpaid');
    return { ...b, paidAmt: paidForThisBill, outstanding, status };
  });

  let filtered = mappedBills.filter(b => {
    const v = state.vendors.find(x => x.id === b.vendorId);
    const matchSearch = !search || b.billNo?.toLowerCase().includes(search) || v?.name?.toLowerCase().includes(search);
    const matchV = !vFilter || b.vendorId === vFilter;
    const matchS = !sFilter || b.siteId === sFilter;
    const matchStatus = !statusFilter || b.status === statusFilter;
    const matchFrom = !fromD || b.date >= fromD;
    const matchTo = !toD || b.date <= toD;
    return matchSearch && matchV && matchS && matchStatus && matchFrom && matchTo;
  });
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  const tbody = document.getElementById('plTableBody');
  tbody.innerHTML = '';
  let kpiTotal = 0, kpiPaid = 0, kpiOut = 0;
  const allLocs = getAllLocations();

  filtered.forEach(b => {
    const v = state.vendors.find(x => x.id === b.vendorId);
    const site = allLocs.find(x => x.id === b.siteId);
    kpiTotal += b.totalAmount; kpiPaid += b.paidAmt; kpiOut += b.outstanding;
    let statBadge = b.status === 'Paid' ? `<span class="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded font-bold">Paid</span>` : (b.status === 'Partial' ? `<span class="bg-blue-100 text-blue-700 text-[10px] px-2 py-1 rounded font-bold">Partial</span>` : `<span class="bg-orange-100 text-orange-700 text-[10px] px-2 py-1 rounded font-bold">Unpaid</span>`);
    tbody.innerHTML += `<tr class="hover:bg-slate-50 transition"><td class="px-4 py-3 font-mono font-bold text-blue-700">${b.billNo}</td><td class="px-4 py-3 text-slate-500">${b.date}</td><td class="px-4 py-3 font-bold text-slate-700">${v?.name || 'Unknown'}</td><td class="px-4 py-3 text-slate-500">${site?.name || '-'}</td><td class="px-4 py-3 text-right font-bold text-slate-800">${getCurrencySymbol()}${b.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td class="px-4 py-3 text-right text-green-700 font-bold">${getCurrencySymbol()}${b.paidAmt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td class="px-4 py-3 text-right ${b.outstanding > 0 ? 'text-red-600 font-extrabold' : 'text-slate-400'}">${getCurrencySymbol()}${b.outstanding.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td class="px-4 py-3 text-center">${statBadge}</td><td class="px-4 py-3 text-center"><div class="flex gap-1 justify-center"><button onclick="viewPurchaseBill('${b.id}')" class="text-blue-600 bg-blue-50 hover:bg-blue-100 text-[10px] px-2 py-1 rounded font-bold">View</button><button onclick="deletePurchaseBill('${b.id}')" class="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] px-2 py-1 rounded font-bold">Del</button></div></td></tr>`;
  });
  if (filtered.length === 0) tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-slate-400 font-medium">No purchases match your filters.</td></tr>`;
  document.getElementById('plKpiTotal').textContent = getCurrencySymbol() + kpiTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  document.getElementById('plKpiPaid').textContent = getCurrencySymbol() + kpiPaid.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  document.getElementById('plKpiOutstanding').textContent = getCurrencySymbol() + kpiOut.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const overEl = document.getElementById('plKpiOverdue');
  if (overEl) overEl.textContent = getCurrencySymbol() + '0';
}

export function clearPurchaseLedgerFilters() {
  ['plSearch', 'plFilterVendor', 'plFilterSite', 'plFilterStatus', 'plFromDate', 'plToDate'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  renderPurchaseLedger();
}

export function viewPurchaseBill(id) {
  const b = state.vendorMaterials.find(x => x.id === id);
  if (!b) return;
  const v = state.vendors.find(x => x.id === b.vendorId);
  const site = getAllLocations().find(x => x.id === b.siteId);
  document.getElementById('purInfoTitle').textContent = `Purchase Bill: ${b.billNo}`;
  let html = `<div class="grid grid-cols-2 gap-2 mb-4 text-sm bg-slate-50 p-3 rounded"><p><span class="text-slate-500 uppercase text-xs font-bold block">Date</span> <b class="text-slate-800">${b.date}</b></p><p><span class="text-slate-500 uppercase text-xs font-bold block">Vendor</span> <b class="text-slate-800">${v?.name || '-'}</b></p><p class="col-span-2"><span class="text-slate-500 uppercase text-xs font-bold block">Linked Site/Project</span> <b class="text-slate-800">${site?.name || '-'}</b></p></div>`;
  html += `<div class="max-h-48 overflow-y-auto border rounded mb-3"><table class="w-full text-xs text-left"><thead class="bg-slate-100 sticky top-0"><tr><th class="p-2 border-b">Item</th><th class="p-2 border-b text-center">Qty</th><th class="p-2 border-b text-right">Rate</th><th class="p-2 border-b text-right">Amt</th></tr></thead><tbody class="divide-y">`;
  b.items.forEach(i => {
    const rm = state.rawMaterials.find(r => r.id === i.rawMatId);
    html += `<tr><td class="p-2">${rm?.name || 'Unknown'}</td><td class="p-2 text-center font-bold">${i.qty}</td><td class="p-2 text-right">${getCurrencySymbol()}${i.rate}</td><td class="p-2 text-right font-bold text-slate-700">${getCurrencySymbol()}${i.amount}</td></tr>`;
  });
  html += `</tbody></table></div>`;
  html += `<div class="text-sm text-right space-y-1"><p><span class="text-slate-500 font-medium">Transport:</span> ${getCurrencySymbol()}${b.extras?.transport || 0}</p><p><span class="text-slate-500 font-medium">Loading:</span> ${getCurrencySymbol()}${b.extras?.loading || 0}</p><p><span class="text-slate-500 font-medium">GST:</span> ${getCurrencySymbol()}${b.extras?.gst || 0}</p><p class="text-xl font-extrabold text-blue-800 border-t pt-2 mt-2">Grand Total: ${getCurrencySymbol()}${b.totalAmount.toLocaleString('en-IN')}</p></div>`;
  document.getElementById('purInfoContent').innerHTML = html;
  document.getElementById('purchaseInfoModal').classList.remove('hidden');
}

export function deletePurchaseBill(id) {
  if (!confirm("Permanently delete this Purchase Bill?\n\nWARNING: The associated Inventory items will also be removed from stock!")) return;
  state.vendorMaterials = state.vendorMaterials.filter(m => m.id !== id);
  state.inventoryTx = state.inventoryTx.filter(tx => tx.refBillId !== id);
  saveAllData();
  renderPurchaseLedger();
  if (!document.getElementById('vendorView').classList.contains('hide')) renderVendorLedger();
  showToast('Purchase Bill Deleted & Inventory Reversed', 'error');
}

// ==========================================
// LABOUR MODULE
// ==========================================
let _labPhotoData = '';
let _labIdDocData = '';

export function openPurchaseFormPanel() {
  const panel = document.getElementById('purchaseFormPanel');
  panel.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // ESC to close
  const escHandler = (e) => { if (e.key === 'Escape') { closePurchaseFormPanel(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);

  // Populate vendor dropdown
  const vendorSel = document.getElementById('plFormVendor');
  vendorSel.innerHTML = '<option value="">-- Select Vendor --</option>';
  state.vendors.forEach(v => vendorSel.innerHTML += `<option value="${v.id}">${v.name}</option>`);

  // Populate site dropdown
  const siteSel = document.getElementById('plFormSite');
  siteSel.innerHTML = '<option value="">-- Select Site / Location --</option>';
  getAllLocations().forEach(l => siteSel.innerHTML += `<option value="${l.id}">${l.name}</option>`);

  // Set today's date
  document.getElementById('plFormDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('plFormBillNo').value = '';
  document.getElementById('plFormTransport').value = '0';
  document.getElementById('plFormLoading').value = '0';
  document.getElementById('plFormGst').value = '0';
  document.getElementById('plFormSubtotal').textContent = getCurrencySymbol() + '0.00';
  document.getElementById('plFormExtras').textContent = getCurrencySymbol() + '0.00';
  document.getElementById('plFormGrandTotal').textContent = getCurrencySymbol() + '0.00';

  // Add 3 starter rows
  document.getElementById('plFormTableBody').innerHTML = '';
  addPurchaseRowToPanel(3);
}

export function closePurchaseFormPanel() {
  document.getElementById('purchaseFormPanel').classList.add('hidden');
  document.body.style.overflow = '';
}

export function addPurchaseRowToPanel(count = 1) {
  const tbody = document.getElementById('plFormTableBody');
  let rmOptions = '<option value="">-- Select Material / Asset --</option>';
  state.rawMaterials.forEach(rm => rmOptions += `<option value="${rm.id}">${rm.name} (${rm.unit}) [${rm.type}]</option>`);
  for (let i = 0; i < count; i++) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="p-1 border text-center text-xs font-bold text-slate-400 plf-row-num"></td><td class="p-1 border"><select class="table-input pur-mat font-bold">${rmOptions}</select></td><td class="p-1 border"><input type="number" class="table-input pur-qty" oninput="calcPanelPurchaseTotal()"></td><td class="p-1 border"><input type="number" class="table-input pur-rate" oninput="calcPanelPurchaseTotal()"></td><td class="p-1 border bg-slate-50"><input type="text" class="table-input pur-amt font-bold text-blue-800 text-right" readonly></td><td class="p-1 border text-center"><button onclick="this.closest('tr').remove(); updatePanelRowNums(); calcPanelPurchaseTotal();" class="text-red-400 hover:bg-red-50 p-1 rounded font-bold">✕</button></td>`;
    tbody.appendChild(tr);
  }
  updatePanelRowNums();
}

export function updatePanelRowNums() {
  document.querySelectorAll('#plFormTableBody tr').forEach((tr, idx) => {
    const numEl = tr.querySelector('.plf-row-num');
    if (numEl) numEl.textContent = idx + 1;
  });
}

export function calcPanelPurchaseTotal() {
  let subtotal = 0;
  document.querySelectorAll('#plFormTableBody tr').forEach(tr => {
    const qty = parseFloat(tr.querySelector('.pur-qty')?.value) || 0;
    const rate = parseFloat(tr.querySelector('.pur-rate')?.value) || 0;
    const amt = qty * rate;
    const amtInput = tr.querySelector('.pur-amt');
    if (amtInput) amtInput.value = amt > 0 ? amt.toFixed(2) : '';
    subtotal += amt;
  });
  const { extras, totalAmount: grandTotal } = computePurchaseTotal(subtotal, {
    transport: parseFloat(document.getElementById('plFormTransport').value) || 0,
    loading: parseFloat(document.getElementById('plFormLoading').value) || 0,
    gst: parseFloat(document.getElementById('plFormGst').value) || 0
  });
  document.getElementById('plFormSubtotal').textContent = getCurrencySymbol() + subtotal.toFixed(2);
  document.getElementById('plFormExtras').textContent = getCurrencySymbol() + extras.toFixed(2);
  document.getElementById('plFormGrandTotal').textContent = getCurrencySymbol() + grandTotal.toFixed(2);
}

export function savePanelPurchaseBill() {
  const vendorId = document.getElementById('plFormVendor').value;
  const siteId = document.getElementById('plFormSite').value;
  const billNo = document.getElementById('plFormBillNo').value;
  const date = document.getElementById('plFormDate').value;
  if (!vendorId || !siteId || !billNo) return showToast('Vendor, Bill No, and Site/Location are required!', 'error');

  const purItems = [];
  let subtotal = 0;
  document.querySelectorAll('#plFormTableBody tr').forEach(tr => {
    const rmId = tr.querySelector('.pur-mat')?.value;
    const qty = parseFloat(tr.querySelector('.pur-qty')?.value) || 0;
    const rate = parseFloat(tr.querySelector('.pur-rate')?.value) || 0;
    if (rmId && qty > 0) {
      const amt = qty * rate;
      purItems.push({ rawMatId: rmId, qty, rate, amount: amt });
      subtotal += amt;
    }
  });
  if (purItems.length === 0) return showToast('Add at least one item!', 'error');

  const transport = parseFloat(document.getElementById('plFormTransport').value) || 0;
  const loading = parseFloat(document.getElementById('plFormLoading').value) || 0;
  const gst = parseFloat(document.getElementById('plFormGst').value) || 0;
  const { totalAmount } = computePurchaseTotal(subtotal, { transport, loading, gst });
  const billId = 'pb_' + Date.now();

  state.vendorMaterials.push({ id: billId, vendorId, siteId, billNo, date, items: purItems, extras: { transport, loading, gst }, totalAmount });
  purItems.forEach(it => {
    state.inventoryTx.push({
      id: 'tx_in_' + Date.now() + Math.random().toString(36).substr(2, 5),
      date, siteId, type: 'IN', rawMaterialId: it.rawMatId,
      qty: it.qty, rate: it.rate, ref: `Purchase Bill: ${billNo}`, refBillId: billId
    });
  });

  saveAllData();
  showToast('Purchase Bill Saved & Inventory Updated!', 'success');
  closePurchaseFormPanel();
  renderPurchaseLedger();
}
