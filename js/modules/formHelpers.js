/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Shared form helpers
 * ═══════════════════════════════════════════════════════════
 * Full-screen form open/close, dropdown population, and generic
 * multi-row table add/total. Shared by every form module (expense,
 * payment-out, purchase order/return, fixed asset, sale sub-forms).
 * Extracted from ui.js. Exported with their original underscore names
 * so existing call sites work unchanged.
 * ═══════════════════════════════════════════════════════════
 */

import { state } from './state.js';
import { getCurrencySymbol } from './utils.js';

export function closeFullScreenForm(panelId) {
  const panel = document.getElementById(panelId);
  if (panel) { panel.classList.add('hidden'); document.body.style.overflow = ''; }
}

export function _openFullScreenForm(panelId) {
  document.getElementById(panelId).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  const escH = (e) => { if (e.key === 'Escape') { closeFullScreenForm(panelId); document.removeEventListener('keydown', escH); } };
  document.addEventListener('keydown', escH);
}

export function _populateVendorSelect(selId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Select Vendor --</option>';
  state.vendors.forEach(v => sel.innerHTML += `<option value="${v.id}">${v.name}</option>`);
}

export function _populateAccountSelect(selId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Select Account --</option>';
  (state.accounts || []).forEach(a => sel.innerHTML += `<option value="${a.id}">${a.name} (${a.type})</option>`);
}

export function _populateClientSelect(selId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Select Client --</option>';
  state.clients.forEach(c => sel.innerHTML += `<option value="${c.id}">${c.name}${c.projectName ? ' — ' + c.projectName : ''}</option>`);
}

export function _addGenericFormRow(tbodyId, calcFn) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const idx = tbody.rows.length + 1;
  tbody.innerHTML += `<tr>
    <td class="p-2 text-center text-slate-400 font-bold">${idx}</td>
    <td class="p-2"><input type="text" class="w-full p-1.5 border rounded text-sm outline-none focus:border-blue-400" placeholder="Item description"></td>
    <td class="p-2"><input type="number" class="w-full p-1.5 border rounded text-sm text-center outline-none" value="1" oninput="${calcFn}()"></td>
    <td class="p-2"><input type="number" class="w-full p-1.5 border rounded text-sm text-right outline-none" value="0" oninput="${calcFn}()"></td>
    <td class="p-2 text-right font-bold text-slate-700">${getCurrencySymbol()}0</td>
    <td class="p-2 text-center"><button onclick="this.closest('tr').remove();${calcFn}()" class="text-red-400 hover:text-red-600 font-bold">✕</button></td>
  </tr>`;
}

/* ═══════════════════════════════════════════════════════════
 * Shared form modal — the app's premium data-entry pattern.
 * A centered dialog with a blurred backdrop, title bar, scrollable body
 * and a sticky footer. Used by modules so entry is a focused task instead
 * of an always-open inline form. Reusable styling tokens below keep every
 * form looking the same across the product.
 * ═══════════════════════════════════════════════════════════ */

/** Input / label / section style tokens for consistent forms everywhere. */
export const FS_INPUT = 'width:100%;padding:9px 11px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;box-sizing:border-box;outline:none;background:#fff;';
export const FS_LABEL = 'display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:4px;letter-spacing:.2px;';

/** A labelled field block: label + control, laid out in the modal's grid. */
export function fsField(label, controlHtml, opts = {}) {
  return `<div style="${opts.span ? 'grid-column:1/-1;' : ''}">
    <label style="${FS_LABEL}">${label}${opts.req ? ' <span style="color:#dc2626">*</span>' : ''}</label>
    ${controlHtml}
  </div>`;
}

export function closeFormModal() {
  const o = document.getElementById('tssFormModal');
  if (o) o.remove();
  if (!document.getElementById('exModalOverlay')?.style.display?.includes('flex')) document.body.style.overflow = '';
}
window.closeFormModal = closeFormModal;

/**
 * Open a focused form modal.
 * @param {string} title
 * @param {string} bodyHtml   fields (use fsField + FS_INPUT/FS_LABEL)
 * @param {{saveLabel?:string, onSave?:string, width?:number, grid?:number}} opts
 *        onSave is a global function NAME called on Save (reads inputs, closes).
 */
export function openFormModal(title, bodyHtml, opts = {}) {
  closeFormModal();
  const width = opts.width || 560;
  const cols = opts.grid || 2;
  const o = document.createElement('div');
  o.id = 'tssFormModal';
  o.style.cssText = 'position:fixed;inset:0;z-index:200050;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px;';
  o.innerHTML = `
    <div role="dialog" aria-modal="true" style="background:#fff;border-radius:18px;width:100%;max-width:${width}px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,.32);overflow:hidden;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #f1f5f9;flex-shrink:0;">
        <h3 style="font-weight:800;color:#0f172a;font-size:16px;margin:0;">${title}</h3>
        <button type="button" onclick="window.closeFormModal()" style="border:none;background:#f1f5f9;border-radius:9px;width:30px;height:30px;cursor:pointer;color:#64748b;font-size:17px;line-height:1;">×</button>
      </div>
      <div style="padding:18px 20px;overflow:auto;display:grid;grid-template-columns:repeat(${cols},1fr);gap:13px;align-content:start;">
        ${bodyHtml}
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid #f1f5f9;flex-shrink:0;background:#fafbfc;">
        <button type="button" onclick="window.closeFormModal()" style="border:1px solid #e2e8f0;background:#fff;color:#475569;border-radius:10px;padding:9px 18px;font-size:13px;font-weight:700;cursor:pointer;">Cancel</button>
        ${opts.onSave ? `<button type="button" onclick="${opts.onSave}" style="border:none;background:linear-gradient(135deg,#ef8420,#d6402c);color:#fff;border-radius:10px;padding:9px 20px;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 4px 12px rgba(214,64,44,.22);">${opts.saveLabel || 'Save'}</button>` : ''}
      </div>
    </div>`;
  o.addEventListener('click', e => { if (e.target === o) closeFormModal(); });
  const escH = (e) => { if (e.key === 'Escape') { closeFormModal(); document.removeEventListener('keydown', escH); } };
  document.addEventListener('keydown', escH);
  document.body.appendChild(o);
  document.body.style.overflow = 'hidden';
  // Focus the first control for fast keyboard entry.
  setTimeout(() => { try { o.querySelector('input,select,textarea')?.focus(); } catch {} }, 30);
}
window.openFormModal = openFormModal;

export function _calcGenericFormTotal(tbodyId, subtotalId, totalId, gstPctId, gstAmtId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  let sub = 0;
  Array.from(tbody.rows).forEach((r, i) => {
    const inputs = r.querySelectorAll('input[type="number"]');
    if (inputs.length >= 2) {
      const qty = parseFloat(inputs[0].value) || 0;
      const rate = parseFloat(inputs[1].value) || 0;
      const amt = qty * rate;
      sub += amt;
      r.cells[4].textContent = getCurrencySymbol() + amt.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    }
    r.cells[0].textContent = i + 1;
  });
  const subEl = document.getElementById(subtotalId);
  if (subEl) subEl.textContent = getCurrencySymbol() + sub.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  let gst = 0;
  if (gstPctId) {
    const pct = parseFloat(document.getElementById(gstPctId)?.value) || 0;
    gst = sub * pct / 100;
    const gstEl = document.getElementById(gstAmtId);
    if (gstEl) gstEl.textContent = getCurrencySymbol() + gst.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }
  const totEl = document.getElementById(totalId);
  if (totEl) totEl.textContent = getCurrencySymbol() + (sub + gst).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
