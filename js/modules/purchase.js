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
    tbody.innerHTML += `<tr class="hover:bg-slate-50 transition"><td class="px-4 py-3 font-mono font-bold text-blue-700">${b.billNo}</td><td class="px-4 py-3 text-slate-500">${b.date}</td><td class="px-4 py-3 font-bold text-slate-700">${v?.name || 'Unknown'}</td><td class="px-4 py-3 text-slate-500">${site?.name || '-'}</td><td class="px-4 py-3 text-right font-bold text-slate-800">${getCurrencySymbol()}${b.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td class="px-4 py-3 text-right text-green-700 font-bold">${getCurrencySymbol()}${b.paidAmt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td class="px-4 py-3 text-right ${b.outstanding > 0 ? 'text-red-600 font-extrabold' : 'text-slate-400'}">${getCurrencySymbol()}${b.outstanding.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td class="px-4 py-3 text-center">${statBadge}</td><td class="px-4 py-3 text-center"><div class="flex gap-1 justify-center"><button onclick="viewPurchaseBill('${b.id}')" class="text-blue-600 bg-blue-50 hover:bg-blue-100 text-[10px] px-2 py-1 rounded font-bold">View</button><button onclick="openPurchaseFormPanel('${b.id}')" class="text-emerald-600 bg-emerald-50 hover:bg-emerald-100 text-[10px] px-2 py-1 rounded font-bold">Edit</button><button onclick="deletePurchaseBill('${b.id}')" class="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] px-2 py-1 rounded font-bold">Del</button></div></td></tr>`;
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

export function openPurchaseFormPanel(editId) {
  const panel = document.getElementById('purchaseFormPanel');
  panel.classList.remove('hidden');
  panel.dataset.editId = editId || '';
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

  const existing = editId ? (state.vendorMaterials || []).find(m => m.id === editId) : null;
  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); };
  if (existing) {
    setEl('plFormVendor', existing.vendorId);
    setEl('plFormSite', existing.siteId);
    setEl('plFormBillNo', existing.billNo);
    setEl('plFormDate', existing.date);
    setEl('plFormTransport', existing.extras?.transport || 0);
    setEl('plFormLoading', existing.extras?.loading || 0);
    const taxIncl = document.getElementById('plFormTaxIncl'); if (taxIncl) taxIncl.checked = !!existing.taxInclusive;
    const round = document.getElementById('plFormRoundOff'); if (round) round.checked = existing.roundOff !== false;
  } else {
    setEl('plFormDate', new Date().toISOString().split('T')[0]);
    setEl('plFormBillNo', '');
    setEl('plFormTransport', '0');
    setEl('plFormLoading', '0');
    const taxIncl = document.getElementById('plFormTaxIncl'); if (taxIncl) taxIncl.checked = false;
    const round = document.getElementById('plFormRoundOff'); if (round) round.checked = true;
  }

  // Build line items.
  document.getElementById('plFormTableBody').innerHTML = '';
  if (existing && Array.isArray(existing.items) && existing.items.length) {
    existing.items.forEach(it => _addPurRow(it));
  } else {
    addPurchaseRowToPanel(3);
  }
  calcPanelPurchaseTotal();
}

export function closePurchaseFormPanel() {
  const panel = document.getElementById('purchaseFormPanel');
  panel.classList.add('hidden');
  panel.dataset.editId = '';
  document.body.style.overflow = '';
}

const _rmOptionsHtml = () => {
  let o = '<option value="">-- Select Material / Asset --</option>';
  (state.rawMaterials || []).forEach(rm => o += `<option value="${rm.id}" data-unit="${rm.unit || ''}">${rm.name} (${rm.unit}) [${rm.type}]</option>`);
  return o;
};

/** Build one purchase line row (optionally prefilled from an item record). */
function _addPurRow(data) {
  const tbody = document.getElementById('plFormTableBody');
  if (!tbody) return;
  const defGst = document.getElementById('plFormDefGst')?.value || '18';
  const defType = document.getElementById('plFormDefType')?.value || 'CGST_SGST';
  const tax = data && data.taxPct != null ? data.taxPct : defGst;
  const type = data && data.taxType ? data.taxType : defType;
  const tOpt = (v) => `<option value="${v}" ${type === v ? 'selected' : ''}>`;
  const tr = document.createElement('tr');
  tr.innerHTML =
    `<td class="p-1 border text-center text-xs font-bold text-slate-400 plf-row-num"></td>`
    + `<td class="p-1 border"><select class="table-input pur-mat font-bold" onchange="window._purMatChanged(this)">${_rmOptionsHtml()}</select></td>`
    + `<td class="p-1 border"><input type="text" class="table-input pur-hsn" value="${data?.hsn || ''}"></td>`
    + `<td class="p-1 border"><input type="number" class="table-input pur-qty" value="${data?.qty ?? ''}" oninput="calcPanelPurchaseTotal()"></td>`
    + `<td class="p-1 border"><input type="text" class="table-input pur-unit" value="${data?.unit || ''}"></td>`
    + `<td class="p-1 border"><input type="number" class="table-input pur-rate" value="${data?.rate ?? ''}" oninput="calcPanelPurchaseTotal()"></td>`
    + `<td class="p-1 border"><input type="number" class="table-input pur-disc" value="${data?.discPct ?? ''}" oninput="calcPanelPurchaseTotal()"></td>`
    + `<td class="p-1 border"><input type="number" class="table-input pur-tax" value="${tax}" oninput="calcPanelPurchaseTotal()"></td>`
    + `<td class="p-1 border"><select class="table-input pur-taxtype" onchange="calcPanelPurchaseTotal()">${tOpt('CGST_SGST')}CGST+SGST</option>${tOpt('IGST')}IGST</option>${tOpt('NONE')}No Tax</option></select></td>`
    + `<td class="p-1 border bg-slate-50"><input type="text" class="table-input pur-amt font-bold text-blue-800 text-right" readonly></td>`
    + `<td class="p-1 border text-center"><button onclick="this.closest('tr').remove(); updatePanelRowNums(); calcPanelPurchaseTotal();" class="text-red-400 hover:bg-red-50 p-1 rounded font-bold">✕</button></td>`;
  tbody.appendChild(tr);
  // Prefill the material select + unit if editing.
  if (data && data.rawMatId) {
    const sel = tr.querySelector('.pur-mat'); if (sel) sel.value = data.rawMatId;
    if (!data.unit) { const rm = (state.rawMaterials || []).find(r => r.id === data.rawMatId); if (rm) tr.querySelector('.pur-unit').value = rm.unit || ''; }
  }
  updatePanelRowNums();
}

export function addPurchaseRowToPanel(count = 1) {
  for (let i = 0; i < count; i++) _addPurRow();
  updatePanelRowNums();
}

/** Auto-fill the unit cell from the selected material. */
window._purMatChanged = function(sel) {
  const opt = sel.selectedOptions?.[0];
  const unit = opt?.dataset?.unit || '';
  const unitEl = sel.closest('tr')?.querySelector('.pur-unit');
  if (unitEl && unit && !unitEl.value) unitEl.value = unit;
};

/** Apply the default GST % / type to every line. */
window._purApplyDefaults = function() {
  const defGst = document.getElementById('plFormDefGst')?.value || '18';
  const defType = document.getElementById('plFormDefType')?.value || 'CGST_SGST';
  document.querySelectorAll('#plFormTableBody tr').forEach(tr => {
    const taxEl = tr.querySelector('.pur-tax'); if (taxEl) taxEl.value = defGst;
    const typeEl = tr.querySelector('.pur-taxtype'); if (typeEl) typeEl.value = defType;
  });
  calcPanelPurchaseTotal();
};

export function updatePanelRowNums() {
  document.querySelectorAll('#plFormTableBody tr').forEach((tr, idx) => {
    const numEl = tr.querySelector('.plf-row-num');
    if (numEl) numEl.textContent = idx + 1;
  });
}

/** Compute one line's taxable + tax (respects the tax-inclusive toggle). */
function _purLineCalc(tr, taxIncl) {
  const qty = parseFloat(tr.querySelector('.pur-qty')?.value) || 0;
  const rate = parseFloat(tr.querySelector('.pur-rate')?.value) || 0;
  const disc = parseFloat(tr.querySelector('.pur-disc')?.value) || 0;
  const taxPct = parseFloat(tr.querySelector('.pur-tax')?.value) || 0;
  const taxType = tr.querySelector('.pur-taxtype')?.value || 'CGST_SGST';
  const gross = qty * rate;
  const lineDisc = gross * disc / 100;
  const afterDisc = gross - lineDisc;
  let taxable, lineTax;
  if (taxIncl && taxPct > 0 && taxType !== 'NONE') {
    taxable = afterDisc / (1 + taxPct / 100);
    lineTax = afterDisc - taxable;
  } else {
    taxable = afterDisc;
    lineTax = (taxType !== 'NONE' && taxPct > 0) ? taxable * taxPct / 100 : 0;
  }
  return { qty, rate, disc, taxPct, taxType, gross, lineDisc, taxable, lineTax, lineTotal: taxable + lineTax };
}

export function calcPanelPurchaseTotal() {
  const taxIncl = document.getElementById('plFormTaxIncl')?.checked;
  let gross = 0, discount = 0, taxable = 0, cgst = 0, sgst = 0, igst = 0;
  document.querySelectorAll('#plFormTableBody tr').forEach(tr => {
    const c = _purLineCalc(tr, taxIncl);
    gross += c.gross; discount += c.lineDisc; taxable += c.taxable;
    if (c.taxType === 'CGST_SGST') { cgst += c.lineTax / 2; sgst += c.lineTax / 2; }
    else if (c.taxType === 'IGST') { igst += c.lineTax; }
    const amtInput = tr.querySelector('.pur-amt');
    if (amtInput) amtInput.value = c.lineTotal > 0 ? c.lineTotal.toFixed(2) : '';
  });
  const transport = parseFloat(document.getElementById('plFormTransport')?.value) || 0;
  const loading = parseFloat(document.getElementById('plFormLoading')?.value) || 0;
  const extras = transport + loading;
  let grand = taxable + cgst + sgst + igst + extras;
  if (document.getElementById('plFormRoundOff')?.checked) grand = Math.round(grand);
  const cur = getCurrencySymbol();
  const setT = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = cur + (Math.round(v * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const showRow = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? 'flex' : 'none'; };
  setT('plFormGross', gross);
  const discEl = document.getElementById('plFormDisc'); if (discEl) discEl.textContent = '-' + cur + (Math.round(discount * 100) / 100).toFixed(2); showRow('plFormDiscRow', discount > 0);
  setT('plFormTaxable', taxable);
  setT('plFormCGST', cgst); showRow('plFormCGSTRow', cgst > 0);
  setT('plFormSGST', sgst); showRow('plFormSGSTRow', sgst > 0);
  setT('plFormIGST', igst); showRow('plFormIGSTRow', igst > 0);
  setT('plFormExtras', extras); showRow('plFormExtrasRow', extras > 0);
  const gt = document.getElementById('plFormGrandTotal'); if (gt) gt.textContent = cur + grand.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function savePanelPurchaseBill() {
  const vendorId = document.getElementById('plFormVendor').value;
  const siteId = document.getElementById('plFormSite').value;
  const billNo = document.getElementById('plFormBillNo').value;
  const date = document.getElementById('plFormDate').value;
  if (!vendorId || !siteId || !billNo) return showToast('Vendor, Bill No, and Site/Location are required!', 'error');

  const taxIncl = document.getElementById('plFormTaxIncl')?.checked;
  const purItems = [];
  let gross = 0, discount = 0, taxable = 0, cgst = 0, sgst = 0, igst = 0;
  document.querySelectorAll('#plFormTableBody tr').forEach(tr => {
    const rmId = tr.querySelector('.pur-mat')?.value;
    const c = _purLineCalc(tr, taxIncl);
    if (rmId && c.qty > 0) {
      const netRate = (taxIncl && c.qty > 0) ? Math.round((c.taxable / c.qty) * 100) / 100 : c.rate;
      purItems.push({
        rawMatId: rmId,
        hsn: tr.querySelector('.pur-hsn')?.value?.trim() || '',
        qty: c.qty, unit: tr.querySelector('.pur-unit')?.value?.trim() || '',
        rate: c.rate, netRate, discPct: c.disc, taxPct: c.taxPct, taxType: c.taxType,
        taxable: Math.round(c.taxable * 100) / 100, taxAmount: Math.round(c.lineTax * 100) / 100,
        amount: Math.round(c.lineTotal * 100) / 100
      });
      gross += c.gross; discount += c.lineDisc; taxable += c.taxable;
      if (c.taxType === 'CGST_SGST') { cgst += c.lineTax / 2; sgst += c.lineTax / 2; }
      else if (c.taxType === 'IGST') { igst += c.lineTax; }
    }
  });
  if (purItems.length === 0) return showToast('Add at least one item!', 'error');

  const transport = parseFloat(document.getElementById('plFormTransport').value) || 0;
  const loading = parseFloat(document.getElementById('plFormLoading').value) || 0;
  const roundOff = document.getElementById('plFormRoundOff')?.checked !== false;
  const gstAmount = cgst + sgst + igst;
  let totalAmount = taxable + gstAmount + transport + loading;
  let roundAmt = 0;
  if (roundOff) { roundAmt = Math.round(totalAmount) - totalAmount; totalAmount = Math.round(totalAmount); }

  const panel = document.getElementById('purchaseFormPanel');
  const editId = panel?.dataset?.editId || '';
  const existing = editId ? (state.vendorMaterials || []).find(m => m.id === editId) : null;
  const billId = existing ? existing.id : ('pb_' + Date.now());

  const rec = {
    id: billId, vendorId, siteId, billNo, date, items: purItems,
    grossTotal: Math.round(gross * 100) / 100, totalDiscount: Math.round(discount * 100) / 100,
    taxableAmount: Math.round(taxable * 100) / 100, cgst: Math.round(cgst * 100) / 100,
    sgst: Math.round(sgst * 100) / 100, igst: Math.round(igst * 100) / 100,
    gstAmount: Math.round(gstAmount * 100) / 100, taxInclusive: !!taxIncl, roundOff, roundAmt,
    extras: { transport, loading, gst: Math.round(gstAmount * 100) / 100 },
    totalAmount
  };
  if (!state.vendorMaterials) state.vendorMaterials = [];
  if (existing) {
    const idx = state.vendorMaterials.findIndex(m => m.id === existing.id);
    if (idx >= 0) state.vendorMaterials[idx] = rec;
    // Rebuild inventory entries + auto-GRN entries tied to this bill (avoid duplicates on edit).
    state.inventoryTx = (state.inventoryTx || []).filter(tx => tx.refBillId !== billId);
    state.grnRecords = (state.grnRecords || []).filter(g => g.refBillId !== billId);
  } else {
    state.vendorMaterials.push(rec);
  }
  // Tag the bill as "Billed" so any existing matching unbilled GRNs flip too.
  rec.billed = true;
  // Cross-module wiring:
  //  - One inventoryTx per line (visible in the Inventory view; stamped with projectId so the view's project scope doesn't hide it).
  //  - One auto-GRN per line (so material received via Purchase shows up in the GRN list too — they're one truth, not two).
  if (!state.grnRecords) state.grnRecords = [];
  const projectId = state.currentProjectId || rec.projectId || '';
  purItems.forEach((it, i) => {
    const txId = 'tx_in_' + Date.now() + '_' + i + Math.random().toString(36).substr(2, 4);
    state.inventoryTx.push({
      id: txId,
      date, siteId, type: 'IN', rawMaterialId: it.rawMatId,
      qty: it.qty, rate: it.netRate != null ? it.netRate : it.rate,
      ref: `Purchase Bill: ${billNo}`, refBillId: billId,
      projectId
    });
    // Auto-GRN — keeps GRN as the single physical-receipt record even when entry
    // started in the Purchase module. refBillId links them so an edit/delete on
    // the bill rebuilds both sides cleanly.
    state.grnRecords.push({
      id: 'grn_pb_' + Date.now() + '_' + i,
      grnNo: `${billNo}-${i + 1}`,
      date, receivedAt: new Date().toISOString(),
      siteId, matId: it.rawMatId, category: '', qty: it.qty,
      expectedQty: 0, rate: it.netRate != null ? it.netRate : it.rate, amount: it.amount,
      challanNo: billNo, supplierId: vendorId, vehicleNo: '', driver: '',
      projectId,
      challanPhoto: null, condPhoto: null,
      billed: true, // billed at source — it came from a purchase bill
      qcStatus: 'Accepted',
      refBillId: billId, source: 'purchase'
    });
  });

  saveAllData();
  showToast(existing ? 'Purchase Bill updated & inventory synced!' : 'Purchase Bill Saved & Inventory Updated!', 'success');
  closePurchaseFormPanel();
  renderPurchaseLedger();
  if (typeof window.renderVendorLedger === 'function' && !document.getElementById('vendorView')?.classList.contains('hide')) { try { window.renderVendorLedger(); } catch {} }
  if (typeof window.renderPartyTransactions === 'function') { try { window.renderPartyTransactions(); } catch {} }
}
