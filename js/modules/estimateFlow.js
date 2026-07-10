/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Estimate Flow
 * ───────────────────────────────────────────────────────────
 * Turns an estimate into downstream documents:
 *   1. estimateToSaleOrder(id)  → creates a Sale Order AND a Project (BOQ from
 *      the estimate items) under the client, in one click.
 *   2. openEstimateMaterials(id) → explodes each line's recipe into aggregated
 *      raw-material requirements (qty + amount). User ticks materials and clicks
 *      "Create Purchase Order(s)": selected materials are grouped by their last
 *      known vendor → one PO per vendor. Unticked materials stay "Pending PO".
 * Recipe = state.recipes[clientId][boqCode].ingredients[{rawMatId, qty, wastage}]
 * (per 1 unit of the BOQ item). Estimate lines carry `code` = that BOQ code.
 * ═══════════════════════════════════════════════════════════
 */
import { state, saveAllData } from './state.js';
import { showToast, getCurrencySymbol } from './utils.js';

const CS = () => getCurrencySymbol();
const _est = id => (state.estimates || []).find(e => e.id === id);
const _rm = id => (state.rawMaterials || []).find(r => r.id === id);
const _fmt = n => (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Last known purchase rate for a raw material (most recent inventory IN, else last bill line). */
function _lastRate(rmId) {
  const tx = (state.inventoryTx || [])
    .filter(t => t.rawMaterialId === rmId && t.type === 'IN' && t.rate > 0)
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  if (tx) return tx.rate;
  let best = null;
  (state.vendorMaterials || []).forEach(b => (b.items || []).forEach(it => {
    if (it.rawMatId === rmId && it.rate > 0 && (!best || new Date(b.date) > new Date(best.date))) best = { date: b.date, rate: it.rate };
  }));
  return best ? best.rate : 0;
}

/** Last vendor that supplied a raw material (from purchase-bill history). '' if unknown. */
function _lastVendor(rmId) {
  let best = null;
  (state.vendorMaterials || []).forEach(b => (b.items || []).forEach(it => {
    if (it.rawMatId === rmId && b.vendorId && (!best || new Date(b.date) > new Date(best.date))) best = { date: b.date, vendorId: b.vendorId };
  }));
  return best ? best.vendorId : '';
}

/** Explode an estimate into aggregated raw-material requirements. */
function _explode(est) {
  const agg = {};             // rawMatId -> total qty
  const noRecipe = [];        // line descriptions with no usable recipe
  (est.items || []).forEach(it => {
    const recipe = it.code ? state.recipes?.[est.clientId]?.[it.code] : null;
    if (!recipe || !(recipe.ingredients || []).length) { noRecipe.push(it.desc || it.code || '—'); return; }
    recipe.ingredients.forEach(ing => {
      const need = (it.qty || 0) * (ing.qty || 0) * (1 + (ing.wastage || 0) / 100);
      if (!ing.rawMatId || need <= 0) return;
      agg[ing.rawMatId] = (agg[ing.rawMatId] || 0) + need;
    });
  });
  const ordered = est.orderedMaterials || [];
  const rows = Object.entries(agg).map(([rmId, qty]) => {
    const rm = _rm(rmId), rate = _lastRate(rmId), vendorId = _lastVendor(rmId);
    const vendor = (state.vendors || []).find(v => v.id === vendorId);
    const q = Math.round(qty * 1000) / 1000;
    return {
      rawMatId: rmId, name: rm?.name || rmId, unit: rm?.unit || '',
      qty: q, rate, amount: Math.round(q * rate * 100) / 100,
      vendorId, vendorName: vendor?.name || '', ordered: ordered.includes(rmId)
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { rows, noRecipe };
}

// ── 1. Estimate → Sale Order + Project ──────────────────────
export function estimateToSaleOrder(estId) {
  const est = _est(estId);
  if (!est) return;
  if (est.saleOrderId && !confirm('A Sale Order + Project was already created from this estimate.\n\nCreate another set?')) return;
  const client = (state.clients || []).find(c => c.id === est.clientId);

  const items = (est.items || []).map(i => ({ code: i.code || '', desc: i.desc, qty: i.qty, unit: i.unit || '', rate: i.rate, amount: (i.qty || 0) * (i.rate || 0) }));
  const total = items.reduce((s, i) => s + i.amount, 0);

  const so = {
    id: 'so_' + Date.now(), soNo: 'SO-' + (Date.now() % 100000), date: new Date().toISOString().split('T')[0],
    clientId: est.clientId, items, total, deliveryDate: '', terms: est.terms || '',
    deliveryStatus: 'Pending', paymentStatus: 'Pending', _fromEstimate: est.id
  };
  if (!state.saleOrders) state.saleOrders = [];
  state.saleOrders.push(so);

  // Project with a BOQ group built from the estimate items.
  // NOTE: BOQ rows read the `description` field (not `desc`) — see _createBOQRowHTML /
  // _getBoqGroupItems in ui.js. Set both so every reader picks up the text.
  const boqItems = items.map((i, idx) => ({ code: i.code || ('IT-' + (idx + 1)), description: i.desc || '', desc: i.desc || '', uom: i.unit || '', qty: i.qty, rate: i.rate, amount: i.amount, gst: 18, boqIndex: '', ref: '' }));
  const group = { id: 'boq_' + Date.now(), name: est.estNum || 'Estimate BOQ', type: 'BOQ', items: boqItems, poValue: total };
  const proj = {
    id: 'proj_' + Date.now(), name: (est.estNum ? est.estNum + ' — ' : '') + (client?.name || 'Project'),
    clientId: est.clientId, code: 'PROJ-' + (Date.now() % 100000), manager: '', location: '', status: 'Active',
    startDate: new Date().toISOString().split('T')[0], endDate: '', color: '#3b82f6',
    description: 'Auto-created from estimate ' + (est.estNum || ''),
    clientName: client?.name || '', clientContact: client?.contact || '', clientPhone: client?.phone || '',
    clientEmail: client?.email || '', clientGst: client?.gst || '', clientPan: client?.pan || '', clientAddress: client?.address || '',
    boqItems, boqs: [group], budget: total, woNumber: '', teamMembers: [], createdAt: new Date().toISOString(), _fromEstimate: est.id
  };
  if (!state.projects) state.projects = [];
  state.projects.push(proj);

  est.saleOrderId = so.id; est.projectId = proj.id;
  saveAllData();
  try { window.populateDropdowns?.(); } catch {}
  try { window.renderSaleOrders?.(); } catch {}
  try { window.renderEstimatesList?.(); } catch {}
  showToast('Sale Order + Project created for ' + (client?.name || 'client') + '!', 'success');
}
window.estimateToSaleOrder = estimateToSaleOrder;

// ── 2. Estimate → raw-material requirements → Purchase Orders ─
export function openEstimateMaterials(estId) {
  const est = _est(estId);
  if (!est) return;
  const { rows, noRecipe } = _explode(est);
  const client = (state.clients || []).find(c => c.id === est.clientId);
  document.getElementById('estMatOverlay')?.remove();

  const bodyRows = rows.length ? rows.map(r => `
    <tr class="border-b ${r.ordered ? 'bg-slate-50 text-slate-400' : 'hover:bg-purple-50'}">
      <td class="px-2 py-2 text-center"><input type="checkbox" class="estmat-chk w-4 h-4" value="${_esc(r.rawMatId)}" ${r.ordered ? 'disabled' : 'checked'}></td>
      <td class="px-3 py-2 font-semibold text-slate-700">${_esc(r.name)}</td>
      <td class="px-3 py-2 text-right font-bold">${_fmt(r.qty)}</td>
      <td class="px-2 py-2 text-slate-500">${_esc(r.unit)}</td>
      <td class="px-3 py-2 text-right">${CS()}${_fmt(r.rate)}</td>
      <td class="px-3 py-2 text-right font-bold text-emerald-700">${CS()}${_fmt(r.amount)}</td>
      <td class="px-3 py-2 text-xs">${r.vendorName ? _esc(r.vendorName) : '<span class="text-orange-500 font-bold">— set vendor —</span>'}</td>
      <td class="px-3 py-2 text-center">${r.ordered ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Ordered</span>' : '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Pending PO</span>'}</td>
    </tr>`).join('') : `<tr><td colspan="8" class="p-8 text-center text-slate-400 font-medium">No recipe-linked materials found. Configure recipes for the estimate's BOQ items first.</td></tr>`;

  const warn = noRecipe.length ? `<div class="mb-3 text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-lg p-2.5">⚠ No recipe for: <b>${noRecipe.map(_esc).join(', ')}</b>. These lines contribute no materials — add recipes to include them.</div>` : '';
  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);

  const html = `
  <div id="estMatOverlay" style="position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)this.remove()">
    <div style="background:#fff;border-radius:16px;max-width:920px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);">
      <div style="position:sticky;top:0;background:#fff;border-bottom:1px solid #e2e8f0;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <h3 class="font-extrabold text-slate-800 text-lg">Raw Material Requirement</h3>
          <p class="text-xs text-slate-500">${_esc(est.estNum || '')} · ${_esc(client?.name || 'Client')} · exploded from recipes</p>
        </div>
        <button onclick="document.getElementById('estMatOverlay').remove()" class="text-slate-400 hover:text-red-500 font-bold text-2xl leading-none">&times;</button>
      </div>
      <div style="padding:16px 20px;">
        ${warn}
        <div class="flex items-center justify-between mb-2">
          <label class="text-xs font-bold text-slate-600 flex items-center gap-2"><input type="checkbox" id="estMatAll" class="w-4 h-4" checked onchange="window._estMatToggleAll(this.checked)"> Select all pending</label>
          <p class="text-xs text-slate-500">Estimated material cost: <b class="text-emerald-700">${CS()}${_fmt(grandTotal)}</b></p>
        </div>
        <div class="border rounded-xl overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-left text-[10px] uppercase font-bold text-slate-500">
              <tr><th class="px-2 py-2 text-center">✓</th><th class="px-3 py-2">Material</th><th class="px-3 py-2 text-right">Qty</th><th class="px-2 py-2">Unit</th><th class="px-3 py-2 text-right">Rate</th><th class="px-3 py-2 text-right">Amount</th><th class="px-3 py-2">Vendor</th><th class="px-3 py-2 text-center">Status</th></tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
        <p class="text-[11px] text-slate-400 mt-2">Selected materials are grouped by their last-used vendor → one Purchase Order per vendor. Unselected stay <b>Pending PO</b>. Materials with no vendor go into one PO for you to set the vendor.</p>
      </div>
      <div style="position:sticky;bottom:0;background:#fff;border-top:1px solid #e2e8f0;padding:14px 20px;display:flex;gap:10px;justify-content:flex-end;">
        <button onclick="document.getElementById('estMatOverlay').remove()" class="px-4 py-2 rounded-lg font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200">Close</button>
        <button onclick="window.createPOFromEstimate('${est.id}')" class="px-5 py-2 rounded-lg font-bold text-sm text-white bg-purple-600 hover:bg-purple-700" ${rows.every(r => r.ordered) ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''}>🧾 Create Purchase Order(s)</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}
window.openEstimateMaterials = openEstimateMaterials;

window._estMatToggleAll = function (on) {
  document.querySelectorAll('.estmat-chk:not(:disabled)').forEach(el => { el.checked = on; });
};

export function createPOFromEstimate(estId) {
  const est = _est(estId);
  if (!est) return;
  const checked = Array.from(document.querySelectorAll('.estmat-chk:checked')).map(el => el.value);
  if (!checked.length) return showToast('Select at least one material', 'error');
  const { rows } = _explode(est);
  const sel = rows.filter(r => checked.includes(r.rawMatId) && !r.ordered);
  if (!sel.length) return showToast('Selected materials are already ordered', 'error');

  const byVendor = {};
  sel.forEach(r => { (byVendor[r.vendorId || ''] = byVendor[r.vendorId || ''] || []).push(r); });
  if (!state.purchaseOrders) state.purchaseOrders = [];

  let created = 0, hasUnassigned = false;
  Object.entries(byVendor).forEach(([vId, list]) => {
    if (!vId) hasUnassigned = true;
    const items = list.map(r => ({ rawMatId: r.rawMatId, qty: r.qty, rate: r.rate, amount: Math.round(r.qty * r.rate * 100) / 100 }));
    const total = items.reduce((s, i) => s + i.amount, 0);
    const seq = (state.purchaseOrders.length + 1).toString().padStart(3, '0');
    state.purchaseOrders.push({
      id: 'po_' + Date.now() + '_' + created, vendorId: vId, poNo: 'PO-' + seq,
      date: new Date().toISOString().split('T')[0], items, totalAmount: total,
      deliveryDate: '', address: '', terms: '', deliveryStatus: 'Pending', paymentStatus: 'Unpaid',
      _fromEstimate: est.id
    });
    created++;
  });

  est.orderedMaterials = Array.from(new Set([...(est.orderedMaterials || []), ...sel.map(r => r.rawMatId)]));
  saveAllData();
  try { window.renderPurchaseOrders?.(); } catch {}
  try { window.renderEstimatesList?.(); } catch {}
  showToast(created + ' Purchase Order(s) created' + (hasUnassigned ? ' — 1 needs a vendor set' : ''), 'success');
  openEstimateMaterials(estId);   // refresh modal so ordered rows flip to "Ordered"
}
window.createPOFromEstimate = createPOFromEstimate;
