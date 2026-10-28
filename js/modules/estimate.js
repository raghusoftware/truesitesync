/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Estimates / Quotations
 * ═══════════════════════════════════════════════════════════
 * Create/edit/list commercial estimates. Extracted from ui.js.
 * PDF export lives in invoiceExports.js; row/total calc in finance.js
 * (both reached via window from inline handlers).
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { showToast, getCurrencySymbol, populateDropdowns } from './utils.js';
import { estimateTotals } from './estimateCalc.js';
import { setupEstimateEditor, readEstimateDocFields } from './estimateDocUI.js?v=1.0.1';
import { nextDocNo } from './docNumbering.js?v=1.0.0';
import { estimateStatus, duplicateEstimate, STATUSES } from './estimateDoc.js?v=1.1.0';

// Estimate numbers follow Settings → Auto-Numbering (prefix + padded counter), never reusing one.
function _estSeqCfg() { const c = (state.autoNumbering || {}).estimate || {}; return { prefix: c.prefix ?? 'EST-', nextNum: c.nextNum ?? 1, digits: c.digits ?? 4 }; }
function _estPeekNo() { return nextDocNo(_estSeqCfg(), (state.estimates || []).map(e => e.estNum)).no; }
function _estTakeNo() {
  const cfg = _estSeqCfg();
  const { no, n } = nextDocNo(cfg, (state.estimates || []).map(e => e.estNum));
  state.autoNumbering = { ...(state.autoNumbering || {}), estimate: { ...cfg, nextNum: n + 1 } };
  return no;
}

/** Fill the discount inputs (blank for a new estimate). */
function _setDiscountInputs(type, value) {
  const t = document.getElementById('estDiscountType'); if (t) t.value = type === 'amt' ? 'amt' : 'pct';
  const v = document.getElementById('estDiscount'); if (v) v.value = value ? value : '';
}

/** Open/close the estimate editor as a full-screen overlay (matches the other
 *  full-screen forms). Escape closes it. */
let _estEscH = null;
function _estFullscreen(on) {
  const el = document.getElementById('estimateEditor');
  if (!el) return;
  if (on) {
    // Re-parent to <body>: the .view-section ancestor keeps a residual transform
    // (fadeIn animation, fill-mode both), which would otherwise make position:fixed
    // resolve relative to that box (offset by the sidebar) and trap the z-index.
    if (el.parentElement !== document.body) document.body.appendChild(el);
    Object.assign(el.style, {
      position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', inset: '0',
      zIndex: '99999', margin: '0', borderRadius: '0', maxWidth: 'none',
      overflowY: 'auto', background: '#f0f2f8'
    });
    document.body.style.overflow = 'hidden';
    if (!_estEscH) {
      _estEscH = (e) => { if (e.key === 'Escape') closeEstimateEditor(); };
      document.addEventListener('keydown', _estEscH);
    }
    el.scrollTop = 0;
  } else {
    ['position', 'top', 'left', 'right', 'bottom', 'inset', 'zIndex', 'margin', 'borderRadius', 'maxWidth', 'overflowY', 'background'].forEach(p => { el.style[p] = ''; });
    document.body.style.overflow = '';
    if (_estEscH) { document.removeEventListener('keydown', _estEscH); _estEscH = null; }
  }
}

export function createNewEstimate() {
  state.currentEstimateId = null;
  populateDropdowns();   // fill the client dropdown with the latest clients
  document.getElementById('estClient').value = '';
  document.getElementById('estDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('estNum').value = _estPeekNo();     // final number is issued on save
  document.getElementById('estTerms').value = '';
  document.getElementById('estNotes').value = '';
  document.getElementById('estTableBody').innerHTML = '';
  _setDiscountInputs('pct', 0);
  const t = document.getElementById('estEditorTitle'); if (t) t.textContent = 'Draft Estimate';
  addEstimateRow();
  if (window.calcEstimateTotal) window.calcEstimateTotal();
  setupEstimateEditor(null);   // style picker + saved T&C (default preset goes in)
  document.getElementById('estimateEditor').classList.remove('hide');
  _estFullscreen(true);
}

/** Reopen a saved estimate for editing: load it into the editor and mark it current
 *  so saveEstimate() updates in place (instead of creating a new one). */
export function openEstimate(id) {
  const e = state.estimates.find(x => x.id === id);
  if (!e) return showToast('Estimate not found', 'error');
  state.currentEstimateId = e.id;
  const esc = s => String(s == null ? '' : s).replace(/"/g, '&quot;');
  populateDropdowns();   // fill the client dropdown before selecting the saved client
  document.getElementById('estClient').value = e.clientId || '';
  document.getElementById('estDate').value = e.date || new Date().toISOString().split('T')[0];
  document.getElementById('estNum').value = e.estNum || '';
  document.getElementById('estTerms').value = e.terms || '';
  document.getElementById('estNotes').value = e.notes || '';
  _setDiscountInputs(e.discountType, e.discountValue);
  const tbody = document.getElementById('estTableBody');
  tbody.innerHTML = '';
  (e.items || []).forEach((it, idx) => {
    const amt = (it.qty || 0) * (it.rate || 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="p-2 border text-center text-xs font-bold text-slate-400">${idx + 1}</td><td class="p-2 border"><input type="text" class="table-input desc-input" value="${esc(it.desc)}" placeholder="Item Description" oninput="handleDescInput(this)"><input type="hidden" class="est-code" value="${esc(it.code)}"><div class="autocomplete-list hide"></div></td><td class="p-2 border"><input type="number" class="table-input est-qty font-bold" value="${it.qty || 0}" oninput="calcEstimateRow(this)"></td><td class="p-2 border"><input type="text" class="table-input est-unit" value="${esc(it.unit)}" placeholder="Unit"></td><td class="p-2 border"><input type="number" class="table-input est-rate" value="${it.rate || 0}" oninput="calcEstimateRow(this)"></td><td class="p-2 border"><input type="text" class="table-input est-amount font-bold text-emerald-700" value="${amt.toFixed(2)}" readonly></td><td class="p-2 border text-center"><button onclick="this.closest('tr').remove(); calcEstimateTotal();" class="text-red-400 hover:bg-red-50 p-1 rounded font-bold">✕</button></td>`;
    tbody.appendChild(tr);
  });
  if (!(e.items || []).length) addEstimateRow();
  const t = document.getElementById('estEditorTitle'); if (t) t.textContent = 'Edit Estimate — ' + (e.estNum || '');
  setupEstimateEditor(e);
  document.getElementById('estimateEditor').classList.remove('hide');
  _estFullscreen(true);
  if (window.calcEstimateTotal) window.calcEstimateTotal();
}
window.openEstimate = openEstimate;

export function closeEstimateEditor() { _estFullscreen(false); document.getElementById('estimateEditor').classList.add('hide'); }

export function addEstimateRow() {
  const tbody = document.getElementById('estTableBody');
  const tr = document.createElement('tr');
  const idx = tbody.rows.length + 1;
  tr.innerHTML = `<td class="p-2 border text-center text-xs font-bold text-slate-400">${idx}</td><td class="p-2 border"><input type="text" class="table-input desc-input" placeholder="Item Description" oninput="handleDescInput(this)"><input type="hidden" class="est-code"><div class="autocomplete-list hide"></div></td><td class="p-2 border"><input type="number" class="table-input est-qty font-bold" value="1" oninput="calcEstimateRow(this)"></td><td class="p-2 border"><input type="text" class="table-input est-unit" placeholder="Unit"></td><td class="p-2 border"><input type="number" class="table-input est-rate" placeholder="Rate" oninput="calcEstimateRow(this)"></td><td class="p-2 border"><input type="text" class="table-input est-amount font-bold text-emerald-700" readonly></td><td class="p-2 border text-center"><button onclick="this.closest('tr').remove(); calcEstimateTotal();" class="text-red-400 hover:bg-red-50 p-1 rounded font-bold">✕</button></td>`;
  tbody.appendChild(tr);
}

export function saveEstimate() {
  const cId = document.getElementById('estClient').value;
  if (!cId) return showToast('Client required', 'error');
  const estItems = [];
  document.querySelectorAll('#estTableBody tr').forEach(tr => {
    const desc = tr.querySelector('.desc-input').value;
    const qty = parseFloat(tr.querySelector('.est-qty').value) || 0;
    const rate = parseFloat(tr.querySelector('.est-rate').value) || 0;
    const code = tr.querySelector('.est-code')?.value || '';   // BOQ code — links line to its recipe
    if (desc && qty > 0) estItems.push({ code, desc, qty, unit: tr.querySelector('.est-unit').value, rate, amount: qty * rate });
  });
  if (estItems.length === 0) return showToast('Add items', 'error');
  const discountType = document.getElementById('estDiscountType')?.value === 'amt' ? 'amt' : 'pct';
  const discountValue = parseFloat(document.getElementById('estDiscount')?.value) || 0;
  const { subTotal, discountAmount, total } = estimateTotals(estItems, discountType, discountValue);
  // Preserve downstream links (Sale Order / Project / already-ordered materials) across edits.
  const prev = state.currentEstimateId ? state.estimates.find(e => e.id === state.currentEstimateId) : null;
  const data = { id: state.currentEstimateId || 'est_' + Date.now(), estNum: document.getElementById('estNum').value, clientId: cId, date: document.getElementById('estDate').value, items: estItems, subTotal, discountType, discountValue, discountAmount, total, terms: document.getElementById('estTerms').value, notes: document.getElementById('estNotes').value,
    ...readEstimateDocFields(),   // template ('classic' | 'modern') + termsPresetId
    saleOrderId: prev?.saleOrderId || null, projectId: prev?.projectId || null, orderedMaterials: prev?.orderedMaterials || [], recipeMap: prev?.recipeMap || {},
    // Link back to the measurement it was converted from (source of truth for the
    // sheet's "Converted to Estimate" status). Preserved across edits.
    sheetId: prev?.sheetId || state._estimateFromSheetId || null };
  state._estimateFromSheetId = null;
  // Audit stamp — keep original creator on edit, record the editor.
  if (prev) {
    data.createdBy = prev.createdBy; data.createdById = prev.createdById; data.createdAt = prev.createdAt;
    window.stampUpdate(data);
  } else {
    window.stampCreate(data);
  }
  // findIndex can be -1 if a cloud pull replaced state.estimates mid-edit;
  // assigning to [-1] would silently discard the save. Re-add instead.
  const idx = state.currentEstimateId ? state.estimates.findIndex(e => e.id === state.currentEstimateId) : -1;
  if (idx >= 0) state.estimates[idx] = { ...state.estimates[idx], ...data };   // keep status / links set from the list
  else { data.estNum = _estTakeNo(); data.status = 'draft'; state.estimates.push(data); }
  saveAllData(); showToast('Estimate Saved'); closeEstimateEditor(); renderEstimatesList();
}

/* ── Estimates list: one dense row per estimate ──────────────────────────────
   Left: number + date · centre: client + project · right: amount + status.
   Tap = preview PDF · swipe left = Duplicate / Delete · swipe right = Share PDF / Excel
   · ⋯ = every action (desktop and keyboard users). */
const _esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _fmtD = iso => { const d = new Date(iso); return isNaN(d) ? (iso || '—') : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); };

export function renderEstimatesList() {
  const container = document.getElementById('estimatesListContainer');
  if (!container) return;
  const cur = getCurrencySymbol();
  const list = (state.estimates || []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.estNum || '').localeCompare(String(a.estNum || '')));
  if (!list.length) {
    container.innerHTML = `<div class="esl-empty"><b>No estimates yet</b><span>Tap “New Estimate” to quote your first client.</span></div>`;
    return;
  }
  const total = list.reduce((s, e) => s + (Number(e.total) || 0), 0);
  container.innerHTML = `<div class="esl-sum"><span>${list.length} estimate${list.length === 1 ? '' : 's'}</span><b>${cur}${total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b></div>`
    + list.map(e => {
      const c = (state.clients || []).find(x => x.id === e.clientId);
      const proj = (state.projects || []).find(p => p.id === e.projectId);
      const st = estimateStatus(e);
      const ordered = (e.orderedMaterials || []).length;
      const sub = [proj ? proj.name : '', ordered ? `${ordered} material${ordered === 1 ? '' : 's'} ordered` : ''].filter(Boolean).join(' · ');
      return `<div class="esl" data-id="${_esc(e.id)}">
        <div class="esl-tray left" aria-hidden="true"><button type="button" class="share" onclick="exportEstimatePDF('${e.id}')">Share PDF</button><button type="button" class="xls" onclick="window.exportEstimateExcel('${e.id}')">Excel</button></div>
        <div class="esl-tray right" aria-hidden="true"><button type="button" class="dup" onclick="window._estDuplicate('${e.id}')">Duplicate</button><button type="button" class="del" onclick="window._estDelete('${e.id}')">Delete</button></div>
        <div class="esl-row" role="button" tabindex="0" aria-label="Estimate ${_esc(e.estNum)} — open preview"
             onclick="window._estRowTap('${e.id}')" onkeydown="if(event.key==='Enter')window._estRowTap('${e.id}')">
          <div class="esl-id"><b>${_esc(e.estNum || '—')}</b><small>${_fmtD(e.date)}</small></div>
          <div class="esl-who"><b>${_esc(c ? c.name : 'Unknown client')}</b>${sub ? `<small>${_esc(sub)}</small>` : ''}</div>
          <div class="esl-amt"><b>${cur}${(Number(e.total) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b><span class="esl-badge ${st}">${STATUSES[st]}</span></div>
          <button type="button" class="esl-more" aria-label="More actions" onclick="event.stopPropagation();window._estMenu('${e.id}')">⋯</button>
        </div>
      </div>`;
    }).join('');
  _estAttachSwipe(container);
}

/* swipe: horizontal drag on touch / pen reveals a tray; one row open at a time */
const TRAY = 168;
let _estOpen = null;      // { el, dir }
function _estClose() { if (_estOpen) { _estOpen.el.querySelector('.esl-row').style.transform = ''; _estOpen.el.classList.remove('open-left', 'open-right'); _estOpen = null; } }
function _estAttachSwipe(root) {
  root.querySelectorAll('.esl').forEach(el => {
    const row = el.querySelector('.esl-row');
    let x0 = 0, y0 = 0, dx = 0, drag = false, axis = '';
    row.addEventListener('pointerdown', ev => {
      if (ev.pointerType === 'mouse' || ev.target.closest('.esl-more')) return;
      x0 = ev.clientX; y0 = ev.clientY; dx = 0; drag = true; axis = '';
    });
    row.addEventListener('pointermove', ev => {
      if (!drag) return;
      const mx = ev.clientX - x0, my = ev.clientY - y0;
      if (!axis) { if (Math.abs(mx) < 8 && Math.abs(my) < 8) return; axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'; if (axis === 'x') { try { row.setPointerCapture(ev.pointerId); } catch {} } }
      if (axis !== 'x') return;
      ev.preventDefault();
      if (_estOpen && _estOpen.el !== el) _estClose();
      const base = el.classList.contains('open-left') ? -TRAY : el.classList.contains('open-right') ? TRAY : 0;
      dx = Math.max(-TRAY - 24, Math.min(TRAY + 24, base + mx));
      row.style.transition = 'none'; row.style.transform = `translateX(${dx}px)`;
      el.classList.toggle('show-left', dx > 0); el.classList.toggle('show-right', dx < 0);
    }, { passive: false });
    const end = () => {
      if (!drag) return; drag = false; row.style.transition = '';
      if (axis !== 'x') return;
      row.dataset.swiped = '1'; setTimeout(() => delete row.dataset.swiped, 80);   // the click after a drag is not a tap
      el.classList.remove('open-left', 'open-right');
      if (dx < -TRAY / 2) { el.classList.add('open-left'); row.style.transform = `translateX(${-TRAY}px)`; _estOpen = { el }; }
      else if (dx > TRAY / 2) { el.classList.add('open-right'); row.style.transform = `translateX(${TRAY}px)`; _estOpen = { el }; }
      else { row.style.transform = ''; if (_estOpen?.el === el) _estOpen = null; }
      try { navigator.vibrate?.(8); } catch {}
    };
    row.addEventListener('pointerup', end); row.addEventListener('pointercancel', end);
  });
}

window._estRowTap = function (id) {
  const el = document.querySelector(`.esl[data-id="${id}"]`);
  if (el?.querySelector('.esl-row')?.dataset.swiped) return;
  if (_estOpen) { _estClose(); return; }                        // a tap on an open row just closes it
  window._estPreviewById?.(id);
};
window._estMenu = function (id) {
  const e = (state.estimates || []).find(x => x.id === id); if (!e) return;
  const st = estimateStatus(e);
  const statusOpts = ['draft', 'sent', 'approved', 'rejected'].filter(k => k !== st)
    .map(k => ({ icon: { draft: '📝', sent: '📤', approved: '✅', rejected: '⛔' }[k], title: 'Mark as ' + STATUSES[k], run: () => window._estSetStatus(id, k) }));
  window.shellSheet?.(`${e.estNum || 'Estimate'}`, [
    { icon: '👁', title: 'Preview', desc: 'The PDF your client receives', run: () => window._estPreviewById?.(id) },
    { icon: '✏️', title: 'Edit', run: () => window.openEstimate(id) },
    { icon: '📄', title: 'Share PDF', run: () => window.exportEstimatePDF(id) },
    { icon: '📊', title: 'Excel', run: () => window.exportEstimateExcel(id) },
    { icon: '🏗️', title: e.saleOrderId ? 'Convert again (order + project)' : 'Convert to order + project', run: () => window.estimateToSaleOrder(id) },
    { icon: '⚙️', title: 'Materials / PO', run: () => window.openEstimateMaterials(id) },
    ...statusOpts,
    { icon: '⧉', title: 'Duplicate', run: () => window._estDuplicate(id) },
    { icon: '🗑', title: 'Delete', danger: true, run: () => window._estDelete(id) },
  ]);
};
window._estSetStatus = function (id, st) {
  const e = (state.estimates || []).find(x => x.id === id); if (!e || !STATUSES[st]) return;
  e.status = st; e.statusAt = Date.now();
  saveAllData(); renderEstimatesList(); showToast(`${e.estNum} marked ${STATUSES[st]}`, 'success');
};
window._estDuplicate = function (id) {
  const e = (state.estimates || []).find(x => x.id === id); if (!e) return;
  const copy = duplicateEstimate(e, { id: 'est_' + Date.now(), estNum: _estTakeNo(), date: new Date().toISOString().split('T')[0] });
  state.estimates.push(window.stampCreate ? window.stampCreate(copy) : copy);
  saveAllData(); _estOpen = null; renderEstimatesList(); showToast(`Duplicated as ${copy.estNum}`, 'success');
};
window._estDelete = function (id) {
  const e = (state.estimates || []).find(x => x.id === id); if (!e) return;
  if (!confirm(`Delete estimate ${e.estNum || ''}?`)) return;
  window.recycleDelete && window.recycleDelete('estimates', id, 'Estimate', String(e.estNum || '').replace(/'/g, ''));
  _estOpen = null; renderEstimatesList();
};
