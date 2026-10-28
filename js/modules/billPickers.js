/**
 * billPickers.js — UI shared by the Purchase and Sale bill forms.
 *
 *   pendingMonthsHTML(listId, groups, opts)  pending items (GRNs / abstracts) under
 *                                            collapsible month headers (native <details>)
 *   mountTaxScope(select, opts)              turns a plain tax-type <select> into a
 *                                            segmented "Intra-state / Inter-state / No tax"
 *                                            control. The <select> stays the source of
 *                                            truth (hidden), so existing code keeps reading
 *                                            .value and listening for 'change'.
 *   syncTaxScope(select) / setTaxScopeHint(select, html)
 *
 * Grouping + GST rules live in pendingGroups.js (pure, tested).
 */

import { gstStateCode, taxScopeFor } from './pendingGroups.js?v=1.0.0';
import { GST_STATE } from './constants.js?v=1.1.0';

const _esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Month-grouped pending list ──────────────────────────────────────────────
const _open = {};   // listId → { monthKey: open? } — the user's own toggles survive re-renders

/**
 * @param {string} listId   stable id of the list (remembers collapsed months)
 * @param {Array<{key,label,items}>} groups  from groupByMonth()
 * @param {{ rowHTML:(item)=>string, sum?:(item)=>number, money?:(n)=>string, selectable?:boolean }} o
 */
export function pendingMonthsHTML(listId, groups, o) {
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const mem = _open[listId] || (_open[listId] = {});
  return groups.map((g, gi) => {
    // Short lists open fully; long ones open the oldest month (the one to bill next).
    const open = g.key in mem ? mem[g.key] : (total <= 12 || gi === 0);
    const sum = o.sum ? g.items.reduce((s, it) => s + (Number(o.sum(it)) || 0), 0) : null;
    return `<details class="pg-month" data-key="${_esc(g.key)}" ${open ? 'open' : ''} ontoggle="window._pgToggle('${_esc(listId)}','${_esc(g.key)}',this.open)">
      <summary class="pg-head">
        <span class="pg-chev" aria-hidden="true"></span>
        <span class="pg-label">${_esc(g.label)}</span>
        <span class="pg-count">${g.items.length}</span>
        ${sum != null && o.money ? `<span class="pg-sum">${o.money(sum)}</span>` : ''}
        ${o.selectable ? `<button type="button" class="pg-selm" onclick="event.preventDefault();event.stopPropagation();window._pgSelectMonth(this)">Select month</button>` : ''}
      </summary>
      <div class="pg-items">${g.items.map(o.rowHTML).join('')}</div>
    </details>`;
  }).join('');
}
window._pgToggle = (list, key, isOpen) => { (_open[list] || (_open[list] = {}))[key] = !!isOpen; };
/** Tick (or clear, if all ticked) every item in one month. */
window._pgSelectMonth = (btn) => {
  const d = btn.closest('details'); if (!d) return;
  const boxes = [...d.querySelectorAll('.pg-items input[type="checkbox"]:not(:disabled)')];
  const on = boxes.some(c => !c.checked);
  boxes.forEach(c => { c.checked = on; });
  btn.textContent = on ? 'Clear month' : 'Select month';
  d.open = true;
};

// ── Tax scope (segmented control over a hidden <select>) ─────────────────────
const SCOPE_LABEL = {
  CGST_SGST: ['Intra-state', 'CGST + SGST'],
  IGST: ['Inter-state', 'IGST'],
  NONE: ['No tax', 'Exempt / nil'],
};

/**
 * @param {HTMLSelectElement} sel
 * @param {{ label?: string }} [opts]
 */
export function mountTaxScope(sel, opts = {}) {
  if (!sel) return null;
  // Re-opening a form re-mounts: reuse the existing wrapper (not the inner .tx-scope).
  let box = sel.parentElement.querySelector(`.tx-scope[data-for="${sel.id}"]`)?.closest('.tx-scope-wrap');
  if (!box) {
    box = document.createElement('div');
    box.className = 'tx-scope-wrap';
    box.innerHTML = `${opts.label ? `<span class="tx-scope-cap">${_esc(opts.label)}</span>` : ''}
      <div class="tx-scope" role="radiogroup" aria-label="${_esc(opts.label || 'Tax type')}" data-for="${sel.id}"></div>
      <div class="tx-hint" data-for="${sel.id}" hidden></div>`;
    sel.insertAdjacentElement('afterend', box);
    sel.classList.add('tx-scope-native');
    sel.addEventListener('change', () => syncTaxScope(sel));
  }
  const seg = box.querySelector('.tx-scope');
  seg.innerHTML = [...sel.options].map(o => {
    const [main, sub] = SCOPE_LABEL[o.value] || [o.textContent, ''];
    return `<button type="button" role="radio" class="tx-opt" data-v="${_esc(o.value)}" tabindex="-1">
      <b>${_esc(main)}</b>${sub ? `<small>${_esc(sub)}</small>` : ''}</button>`;
  }).join('');
  seg.onclick = (e) => {
    const b = e.target.closest('.tx-opt'); if (!b) return;
    _pick(sel, b.dataset.v, true);
  };
  seg.onkeydown = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const btns = [...seg.querySelectorAll('.tx-opt')];
    const i = btns.findIndex(b => b.dataset.v === sel.value);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1
      : (i + ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 1) + btns.length) % btns.length;
    _pick(sel, btns[n].dataset.v, true);
    btns[n].focus();
  };
  syncTaxScope(sel);
  return box;
}

function _pick(sel, v, byUser) {
  if (byUser) sel.dataset.userPicked = '1';
  if (sel.value === v && !sel.dataset.mixed) return;
  delete sel.dataset.mixed;
  sel.value = v;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Repaint the segmented control from the <select> (call after setting .value in code). */
export function syncTaxScope(sel) {
  const seg = sel && sel.parentElement.querySelector(`.tx-scope[data-for="${sel.id}"]`);
  if (!seg) return;
  const mixed = !!sel.dataset.mixed;
  seg.classList.toggle('mixed', mixed);
  seg.querySelectorAll('.tx-opt').forEach(b => {
    const on = !mixed && b.dataset.v === sel.value;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on || (mixed && !b.previousElementSibling) ? 0 : -1;
  });
  // The hint's "Use …" shortcut only shows while the header disagrees with it.
  const use = sel.parentElement.querySelector(`.tx-hint[data-for="${sel.id}"] .tx-hint-use`);
  if (use) use.hidden = !mixed && sel.value === use.dataset.v;
}

/** Small line under the control (e.g. why a scope was suggested). Empty hides it. */
export function setTaxScopeHint(sel, html) {
  const h = sel && sel.parentElement.querySelector(`.tx-hint[data-for="${sel.id}"]`);
  if (!h) return;
  h.innerHTML = html || '';
  h.hidden = !html;
}

/**
 * GSTIN-based suggestion: same state → Intra-state, different → Inter-state.
 * Always explains itself in the hint; only switches the control when the user
 * hasn't picked a scope on this form and the document isn't an existing one.
 * @returns {string} the suggested scope ('' when the GSTINs don't tell)
 */
export function autoTaxScope(sel, ourGstin, partyGstin, partyWord, { editing } = {}) {
  if (!sel) return '';
  const scope = taxScopeFor(ourGstin, partyGstin);
  if (!scope || ![...sel.options].some(o => o.value === scope)) { setTaxScopeHint(sel, ''); return ''; }
  const them = GST_STATE[gstStateCode(partyGstin)] || gstStateCode(partyGstin);
  const us = GST_STATE[gstStateCode(ourGstin)] || gstStateCode(ourGstin);
  const word = scope === 'IGST' ? 'Inter-state' : 'Intra-state';
  const applied = !editing && !sel.dataset.userPicked && !sel.dataset.mixed;
  if (applied && sel.value !== scope) _pick(sel, scope, false);
  const off = sel.dataset.mixed || sel.value !== scope;
  setTaxScopeHint(sel, `${_esc(partyWord)} in <b>${_esc(them)}</b>, you in <b>${_esc(us)}</b> → ${word}`
    + ` <button type="button" class="tx-hint-use" data-v="${scope}" ${off ? '' : 'hidden'} onclick="window._txUse('${sel.id}','${scope}')">Use ${word}</button>`);
  return scope;
}
window._txUse = (id, v) => { const sel = document.getElementById(id); if (sel) _pick(sel, v, true); };

/** Reflect the line items in the header: one shared type → that type; a mix → "mixed". */
export function syncTaxScopeFromLines(sel, lineValues) {
  if (!sel) return;
  const vals = [...new Set((lineValues || []).filter(Boolean))];
  if (vals.length > 1) sel.dataset.mixed = '1';
  else { delete sel.dataset.mixed; if (vals.length === 1 && sel.value !== vals[0]) sel.value = vals[0]; }
  syncTaxScope(sel);
}
