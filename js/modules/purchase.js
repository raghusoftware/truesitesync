/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Purchase ledger & purchase entry panel
 * ═══════════════════════════════════════════════════════════
 * Vendor purchase-bill ledger (list/view/delete) and the full-screen
 * purchase entry panel. Extracted from ui.js. Totals via purchaseCalc.js.
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { showToast, getCurrencySymbol, getCompanyHeaderForPDF, getPdfCurrency, mobileSavePDF } from './utils.js';
import { computePurchaseTotal } from './purchaseCalc.js';
import { materialUnitOptions, toBaseQty } from './units.js';

/** Display a stored ISO date (yyyy-mm-dd) as dd/mm/yyyy. */
function _purFmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
}
/** Redesigned-ledger helpers (kept local to avoid cross-module cache coupling). */
function _lxAv(name) { let h = 0; const s = String(name || '?'); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return `linear-gradient(135deg, hsl(${h} 62% 55%), hsl(${(h + 32) % 360} 64% 44%))`; }
function _lxInit(name) { const p = String(name || '').trim().split(/\s+/).filter(Boolean); return p.length ? (p[0][0] + (p[1] ? p[1][0] : (p[0][1] || ''))).toUpperCase() : '?'; }
function _lxDate(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); if (!m) return iso || '—'; const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m[2] - 1] || m[2]; return `${m[3]} ${mon} ${m[1]}`; }

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

  const sym = getCurrencySymbol();
  const nf = v => (Number(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const today = new Date().toISOString().split('T')[0];
  let kpiOverdue = 0;
  let rowsHtml = '';
  filtered.forEach((b, i) => {
    const v = state.vendors.find(x => x.id === b.vendorId);
    const site = allLocs.find(x => x.id === b.siteId);
    kpiTotal += b.totalAmount; kpiPaid += b.paidAmt; kpiOut += b.outstanding;
    const isOverdue = (b.outstanding > 0) && b.dueDate && b.dueDate < today;
    if (isOverdue) kpiOverdue += b.outstanding;
    const pill = b.status === 'Paid' ? '<span class="lx-pill paid">Paid</span>'
      : (b.status === 'Partial' ? '<span class="lx-pill partial">Partial</span>' : '<span class="lx-pill pending">Unpaid</span>');
    const nm = v?.name || 'Unknown';
    rowsHtml += `<tr style="animation-delay:${Math.min(i * 28, 320)}ms">
      <td style="color:var(--lx-muted)">${_lxDate(b.date)}</td>
      <td><span class="doc-no">${b.billNo}</span></td>
      <td><span class="lx-party"><span class="lx-av" style="background:${_lxAv(nm)}">${_lxInit(nm)}</span><span style="font-weight:650">${nm}</span></span></td>
      <td style="color:var(--lx-muted)">${site?.name || '—'}</td>
      <td class="num" style="font-weight:750">${sym}${nf(b.totalAmount)}</td>
      <td class="num" style="${b.outstanding > 0 ? 'color:var(--lx-bad);font-weight:800' : 'color:var(--lx-faint)'}">${sym}${nf(b.outstanding)}</td>
      <td style="color:${isOverdue ? 'var(--lx-bad);font-weight:700' : 'var(--lx-muted)'}">${b.dueDate ? _lxDate(b.dueDate) : '—'}</td>
      <td style="text-align:center">${pill}</td>
      <td style="text-align:center"><div class="lx-act"><button onclick="viewPurchaseBill('${b.id}')" class="lx-btn view">View</button><button onclick="openPurchaseFormPanel('${b.id}')" class="lx-btn edit">Edit</button><button onclick="deletePurchaseBill('${b.id}')" class="lx-btn del">Del</button></div></td>
    </tr>`;
  });
  tbody.innerHTML = rowsHtml || `<tr><td colspan="9" style="padding:44px;text-align:center;color:var(--lx-faint);font-weight:600">No purchases match your filters.</td></tr>`;
  document.getElementById('plKpiTotal').textContent = sym + nf(kpiTotal);
  document.getElementById('plKpiPaid').textContent = sym + nf(kpiPaid);
  document.getElementById('plKpiOutstanding').textContent = sym + nf(kpiOut);
  const overEl = document.getElementById('plKpiOverdue');
  if (overEl) overEl.textContent = sym + nf(kpiOverdue);
  const pct = kpiTotal > 0 ? Math.round(kpiPaid / kpiTotal * 100) : 0;
  const setSub = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
  setSub('plKpiPaidSub', pct + '% settled');
  setSub('plKpiOutstandingSub', (100 - pct) + '% payable');
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
  _purInfoBillId = id;
  document.getElementById('purchaseInfoModal').classList.remove('hidden');
}

// ── Purchase-bill PDF: shared builder + preview / open / save actions ──
let _purInfoBillId = null;

function _buildPurchaseBillDoc(id) {
  const b = state.vendorMaterials.find(x => x.id === id);
  if (!b) { showToast('Purchase bill not found', 'error'); return null; }
  const v = state.vendors.find(x => x.id === b.vendorId);
  const site = getAllLocations().find(x => x.id === b.siteId);
  const sym = getPdfCurrency().trim();
  const n2 = x => (Number(x) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const doc = new window.jspdf.jsPDF();
  let y = getCompanyHeaderForPDF(doc);
  doc.setFontSize(14); doc.setTextColor(0); doc.setFont('helvetica', 'bold');
  doc.text('PURCHASE BILL', 105, y + 5, null, null, 'center');
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`Bill No: ${b.billNo || '—'}`, 14, y + 15);
  doc.text(`Date: ${b.date || '—'}`, 140, y + 15);
  doc.text(`Vendor: ${v?.name || '—'}`, 14, y + 21);
  if (v?.gst || v?.GST) doc.text(`Vendor GSTIN: ${String(v.gst || v.GST).toUpperCase()}`, 14, y + 27);
  if (site?.name) doc.text(`Site/Project: ${site.name}`, 140, y + 21);
  const rows = (b.items || []).map((it, i) => {
    const rm = (state.rawMaterials || []).find(r => r.id === it.rawMatId);
    return [i + 1, rm?.name || 'Unknown', `${it.qty || 0} ${rm?.unit || ''}`.trim(), n2(it.rate), n2(it.amount ?? (it.qty || 0) * (it.rate || 0))];
  });
  doc.autoTable({
    startY: y + 33, head: [['#', 'Material', 'Qty', `Rate (${sym})`, `Amount (${sym})`]], body: rows, theme: 'grid',
    headStyles: { fillColor: [37, 99, 235], fontSize: 9 }, styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak' },
    columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 82 }, 2: { halign: 'right', cellWidth: 30 }, 3: { halign: 'right', cellWidth: 28 }, 4: { halign: 'right', cellWidth: 30 } }
  });
  let tY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  const ex = b.extras || {};
  if (ex.transport) { doc.text(`Transport: ${sym} ${n2(ex.transport)}`, 196, tY, { align: 'right' }); tY += 5; }
  if (ex.loading) { doc.text(`Loading: ${sym} ${n2(ex.loading)}`, 196, tY, { align: 'right' }); tY += 5; }
  if (ex.gst) { doc.text(`GST: ${sym} ${n2(ex.gst)}`, 196, tY, { align: 'right' }); tY += 5; }
  tY += 3;
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text(`Grand Total: ${sym} ${n2(b.totalAmount)}`, 196, tY, { align: 'right' });
  return { doc, name: `PurchaseBill-${(b.billNo || id).toString().replace(/[^\w.-]/g, '_')}.pdf` };
}

// Preview — embed the rendered PDF inline inside the details modal
export function previewPurchaseBillPDF(id) {
  const built = _buildPurchaseBillDoc(id ?? _purInfoBillId);
  if (!built) return;
  const holder = document.getElementById('purInfoContent');
  if (!holder) return;
  try {
    const url = built.doc.output('bloburl');
    holder.innerHTML = `<iframe src="${url}" style="width:100%;height:65vh;border:1px solid #e2e8f0;border-radius:8px" title="Purchase Bill PDF"></iframe>`;
  } catch (e) {
    showToast('Preview failed: ' + (e.message || e), 'error');
  }
}

// Open PDF — open the rendered PDF in a new browser tab
export function openPurchaseBillPDF(id) {
  const built = _buildPurchaseBillDoc(id ?? _purInfoBillId);
  if (!built) return;
  try {
    const w = window.open(built.doc.output('bloburl'), '_blank');
    if (!w) built.doc.output('dataurlnewwindow');
  } catch (e) {
    try { built.doc.output('dataurlnewwindow'); } catch (_) { showToast('Open failed: ' + (e.message || e), 'error'); }
  }
}

// Save — download the PDF to the device
export function savePurchaseBillPDF(id) {
  const built = _buildPurchaseBillDoc(id ?? _purInfoBillId);
  if (!built) return;
  mobileSavePDF(built.doc, built.name);
}

export function deletePurchaseBill(id) {
  if (!confirm("Move this Purchase Bill to the Recycle Bin?\n\nThe associated Inventory items will be removed from stock (restored if you restore the bill).")) return;
  const bill = (state.vendorMaterials || []).find(m => m.id === id);
  state.inventoryTx = state.inventoryTx.filter(tx => tx.refBillId !== id);
  // Remove auto-GRNs this bill created, and un-bill any manual GRNs it claimed
  // so they reappear as "pending" in the purchase form.
  state.grnRecords = (state.grnRecords || []).filter(g => g.refBillId !== id);
  state.grnRecords.forEach(g => { if (g.billedByBillId === id) { g.billed = false; delete g.billedByBillId; } });
  window.recycleDelete?.('vendorMaterials', id, 'Purchase Bill', bill?.billNo || bill?.invoiceNo || id);
  renderPurchaseLedger();
  if (!document.getElementById('vendorView').classList.contains('hide')) renderVendorLedger();
  showToast('Purchase Bill moved to Recycle Bin & inventory reversed', 'warning');
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
  // Refresh the pending-GRN picker AND the PO dropdown whenever the vendor changes.
  vendorSel.onchange = () => {
    window._purRefreshGrnPicker && window._purRefreshGrnPicker();
    window._purFillPO && window._purFillPO(vendorSel.value, '');
  };

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
  // Show any GRNs already received from this vendor that haven't been billed yet.
  if (window._purRefreshGrnPicker) window._purRefreshGrnPicker();
  // Populate the Purchase Order dropdown for the (existing) vendor.
  if (window._purFillPO) window._purFillPO(existing?.vendorId || '', existing?.poId || '');
}

/** Fill the bill's Purchase Order dropdown with the vendor's POs (+ count hint). */
window._purFillPO = function (vendorId, selectedPoId) {
  const sel = document.getElementById('plFormPO'); if (!sel) return;
  const hint = document.getElementById('plFormPOHint');
  const cur = getCurrencySymbol();
  const pos = (state.purchaseOrders || []).filter(o => o.vendorId === vendorId);
  sel.innerHTML = '<option value="">— None —</option>' + pos.map(o =>
    `<option value="${o.id}">${o.poNo || o.id} · ${_purFmtDate(o.date) || ''} · ${cur}${(o.totalAmount || 0).toLocaleString('en-IN')}</option>`
  ).join('');
  if (selectedPoId) sel.value = selectedPoId;
  if (hint) hint.textContent = !vendorId ? '' : (pos.length ? `${pos.length} purchase order${pos.length > 1 ? 's' : ''} for this supplier` : 'No purchase orders on file for this supplier');
};

export function closePurchaseFormPanel() {
  const panel = document.getElementById('purchaseFormPanel');
  panel.classList.add('hidden');
  panel.dataset.editId = '';
  document.body.style.overflow = '';
}

const _rmOptionsHtml = () => {
  // Unit is chosen in the per-row unit picker, not baked into the label.
  let o = '<option value="">-- Select Material / Asset --</option>';
  (state.rawMaterials || []).forEach(rm => o += `<option value="${rm.id}" data-unit="${rm.unit || ''}">${rm.name} [${rm.type}]</option>`);
  return o;
};
/** <option>s of a material's entry units (base + alternates) for the unit cell. */
const _purUnitOptions = (rmId, selected) => {
  const rm = (state.rawMaterials || []).find(r => r.id === rmId);
  if (!rm) return `<option value="${selected || ''}">${selected || ''}</option>`;
  return materialUnitOptions(rm, selected != null ? selected : rm.unit);
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
    + `<td class="p-1 border"><select class="table-input pur-unit" title="Purchase unit — stock stores in the base unit">${_purUnitOptions(data?.rawMatId, data?.unit)}</select></td>`
    + `<td class="p-1 border"><input type="number" class="table-input pur-rate" value="${data?.rate ?? ''}" oninput="calcPanelPurchaseTotal()"></td>`
    + `<td class="p-1 border"><input type="number" class="table-input pur-disc" value="${data?.discPct ?? ''}" oninput="calcPanelPurchaseTotal()"></td>`
    + `<td class="p-1 border"><input type="number" class="table-input pur-tax" value="${tax}" oninput="calcPanelPurchaseTotal()"></td>`
    + `<td class="p-1 border"><select class="table-input pur-taxtype" onchange="calcPanelPurchaseTotal()">${tOpt('CGST_SGST')}CGST+SGST</option>${tOpt('IGST')}IGST</option>${tOpt('NONE')}No Tax</option></select></td>`
    + `<td class="p-1 border bg-slate-50"><input type="text" class="table-input pur-amt font-bold text-blue-800 text-right" readonly></td>`
    + `<td class="p-1 border text-center"><button onclick="this.closest('tr').remove(); updatePanelRowNums(); calcPanelPurchaseTotal();" class="text-red-400 hover:bg-red-50 p-1 rounded font-bold">✕</button></td>`;
  // Tag the row with the originating GRN id (if this line came from a received
  // GRN) so save() links to that GRN instead of creating a duplicate.
  if (data && data.grnId) tr.dataset.grnId = data.grnId;
  tbody.appendChild(tr);
  // Prefill the material select + unit picker if editing.
  if (data && data.rawMatId) {
    const sel = tr.querySelector('.pur-mat'); if (sel) sel.value = data.rawMatId;
    const uSel = tr.querySelector('.pur-unit');
    if (uSel) { uSel.innerHTML = _purUnitOptions(data.rawMatId, data.unit); }
  }
  updatePanelRowNums();
}

export function addPurchaseRowToPanel(count = 1) {
  for (let i = 0; i < count; i++) _addPurRow();
  updatePanelRowNums();
}

/** Repopulate the row's unit picker with the chosen material's units. */
window._purMatChanged = function(sel) {
  const rmId = sel.value;
  const unitEl = sel.closest('tr')?.querySelector('.pur-unit');
  if (unitEl) unitEl.innerHTML = _purUnitOptions(rmId);
};

/** Unbilled GRNs for a vendor = physically received (manual GRN), not yet
 *  invoiced, and not already pulled into THIS open bill as a line. */
function _pendingGrnsForVendor(vendorId) {
  const usedGrnIds = new Set(
    [...document.querySelectorAll('#plFormTableBody tr')].map(tr => tr.dataset.grnId).filter(Boolean)
  );
  return (state.grnRecords || []).filter(g =>
    g.supplierId === vendorId && !g.billed && g.source !== 'purchase' && !usedGrnIds.has(g.id)
  );
}

/** Render the "Pending GRNs" picker for the currently selected vendor. */
window._purRefreshGrnPicker = function() {
  const section = document.getElementById('plFormGrnSection');
  const list = document.getElementById('plFormGrnList');
  const countEl = document.getElementById('plFormGrnCount');
  if (!section || !list) return;
  const vendorId = document.getElementById('plFormVendor')?.value || '';
  const pending = vendorId ? _pendingGrnsForVendor(vendorId) : [];
  if (!pending.length) { section.classList.add('hidden'); list.innerHTML = ''; if (countEl) countEl.textContent = ''; return; }
  section.classList.remove('hidden');
  if (countEl) countEl.textContent = `${pending.length} pending`;
  const cur = getCurrencySymbol();
  list.innerHTML = pending.map(g => {
    const m = (state.rawMaterials || []).find(r => r.id === g.matId);
    const amt = g.amount || (g.qty * (g.rate || 0));
    return `<label class="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2 cursor-pointer hover:bg-amber-50">
      <input type="checkbox" class="pur-grn-chk" value="${g.id}" style="width:15px;height:15px;">
      <span class="font-mono text-[11px] text-amber-700 font-bold">${g.grnNo || '—'}</span>
      <span class="text-xs font-bold text-slate-700">${m ? m.name : (g.category || 'Material')}</span>
      <span class="text-[11px] text-slate-500">${g.qty} ${m?.unit || ''} × ${cur}${(g.rate || 0).toLocaleString('en-IN')}</span>
      <span class="ml-auto text-[11px] text-slate-400">${_purFmtDate(g.date)}</span>
      <span class="text-xs font-bold text-slate-800">${cur}${amt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
    </label>`;
  }).join('');
};

window._purToggleAllGrns = function(on) {
  document.querySelectorAll('#plFormGrnList .pur-grn-chk').forEach(c => { c.checked = !!on; });
};

/** Pull the checked GRNs into the bill as line items, then refresh the picker. */
window._purAddSelectedGrns = function() {
  const checked = [...document.querySelectorAll('#plFormGrnList .pur-grn-chk:checked')].map(c => c.value);
  if (!checked.length) return showToast('Select at least one GRN to add', 'warning');
  // If there are only blank starter rows, clear them so we don't leave empties.
  const blankRows = [...document.querySelectorAll('#plFormTableBody tr')].filter(tr => !tr.querySelector('.pur-mat')?.value && !tr.querySelector('.pur-qty')?.value);
  blankRows.forEach(tr => tr.remove());
  let firstSite = '', firstPoId = '';
  checked.forEach(gid => {
    const g = (state.grnRecords || []).find(x => x.id === gid);
    if (!g) return;
    if (!firstSite && g.siteId) firstSite = g.siteId;
    if (!firstPoId && g.poId) firstPoId = g.poId;
    const m = (state.rawMaterials || []).find(r => r.id === g.matId);
    _addPurRow({ rawMatId: g.matId, qty: g.qty, rate: g.rate || 0, unit: m?.unit || '', grnId: g.id });
  });
  // Default the bill's site to the GRN's site if none chosen yet.
  const siteSel = document.getElementById('plFormSite');
  if (siteSel && !siteSel.value && firstSite) siteSel.value = firstSite;
  // Auto-fill the bill's Purchase Order from the selected GRN (if it carried one
  // and the user hasn't already picked a PO). Otherwise they can pick one below.
  const poSel = document.getElementById('plFormPO');
  if (poSel && !poSel.value && firstPoId) { if ([...poSel.options].some(o => o.value === firstPoId)) poSel.value = firstPoId; }
  updatePanelRowNums();
  calcPanelPurchaseTotal();
  window._purRefreshGrnPicker();
  showToast(`${checked.length} GRN${checked.length > 1 ? 's' : ''} added to bill`, 'success');
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
        amount: Math.round(c.lineTotal * 100) / 100,
        grnId: tr.dataset.grnId || '' // links this line to an existing received GRN (no duplicate stock/GRN)
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

  const poId = document.getElementById('plFormPO')?.value || '';
  const poNo = (state.purchaseOrders || []).find(o => o.id === poId)?.poNo || '';
  const rec = {
    id: billId, vendorId, siteId, billNo, date, poId, poNo, items: purItems,
    grossTotal: Math.round(gross * 100) / 100, totalDiscount: Math.round(discount * 100) / 100,
    taxableAmount: Math.round(taxable * 100) / 100, cgst: Math.round(cgst * 100) / 100,
    sgst: Math.round(sgst * 100) / 100, igst: Math.round(igst * 100) / 100,
    gstAmount: Math.round(gstAmount * 100) / 100, taxInclusive: !!taxIncl, roundOff, roundAmt,
    extras: { transport, loading, gst: Math.round(gstAmount * 100) / 100 },
    totalAmount
  };
  if (!state.vendorMaterials) state.vendorMaterials = [];
  if (!state.grnRecords) state.grnRecords = [];
  if (existing) {
    const idx = state.vendorMaterials.findIndex(m => m.id === existing.id);
    if (idx >= 0) state.vendorMaterials[idx] = rec;
    // Rebuild inventory entries + auto-GRN entries tied to this bill (avoid duplicates on edit).
    state.inventoryTx = (state.inventoryTx || []).filter(tx => tx.refBillId !== billId);
    state.grnRecords = (state.grnRecords || []).filter(g => g.refBillId !== billId);
    // Un-link any manual GRNs this bill previously claimed, so the linkage is
    // recomputed cleanly from the current line items below.
    state.grnRecords.forEach(g => { if (g.billedByBillId === billId) { g.billed = false; delete g.billedByBillId; } });
  } else {
    state.vendorMaterials.push(rec);
  }
  // Tag the bill as "Billed" so any existing matching unbilled GRNs flip too.
  rec.billed = true;
  // Cross-module wiring. Two kinds of lines:
  //  A) Lines linked to an existing GRN (it.grnId) — the stock was already
  //     received and posted to inventory by that GRN, so we DON'T create a new
  //     inventoryTx or auto-GRN; we just mark the GRN billed and link it back.
  //  B) Manually-typed lines — create one inventoryTx + one auto-GRN each so the
  //     material shows in both the inventory ledger and the GRN list.
  const projectId = state.currentProjectId || rec.projectId || '';
  purItems.forEach((it, i) => {
    if (it.grnId) {
      const g = state.grnRecords.find(x => x.id === it.grnId);
      if (g) { g.billed = true; g.billedByBillId = billId; }
      return; // stock + GRN already exist — nothing more to create
    }
    // The bill line keeps the ENTERED unit/qty (that's the document), but stock
    // is always tracked in the material's BASE unit — convert, and restate the
    // rate per base unit so stock valuation still equals the line amount.
    const mat = (state.rawMaterials || []).find(r => r.id === it.rawMatId);
    const entryRate = it.netRate != null ? it.netRate : it.rate;
    const baseQty = toBaseQty(mat, it.qty, it.unit);
    const baseRate = (baseQty > 0) ? (it.qty * entryRate) / baseQty : entryRate;
    const unitNote = (mat && it.unit && it.unit !== mat.unit) ? ` (${it.qty} ${it.unit})` : '';
    const txId = 'tx_in_' + Date.now() + '_' + i + Math.random().toString(36).substr(2, 4);
    state.inventoryTx.push({
      id: txId,
      date, siteId, type: 'IN', rawMaterialId: it.rawMatId,
      qty: baseQty, rate: baseRate,
      ref: `Purchase Bill: ${billNo}${unitNote}`, refBillId: billId,
      projectId
    });
    // Auto-GRN — keeps GRN as the single physical-receipt record even when entry
    // started in the Purchase module. refBillId links them so an edit/delete on
    // the bill rebuilds both sides cleanly.
    state.grnRecords.push({
      id: 'grn_pb_' + Date.now() + '_' + i,
      grnNo: `${billNo}-${i + 1}`,
      date, receivedAt: new Date().toISOString(),
      siteId, matId: it.rawMatId, category: '', qty: baseQty,
      expectedQty: 0, rate: baseRate, amount: it.amount,
      enteredQty: it.qty, entryUnit: it.unit,
      challanNo: billNo, supplierId: vendorId, poId: rec.poId || '', poNo: rec.poNo || '', vehicleNo: '', driver: '',
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
