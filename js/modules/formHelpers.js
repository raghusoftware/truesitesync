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
