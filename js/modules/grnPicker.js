/**
 * grnPicker.js — Material Received: choose a material from a full-screen,
 * vertical list of large tap targets (no dropdowns, no sideways scrolling).
 * Sticky search + Raw material / Consumable / Tool chips on top; each row shows
 * a category icon, the name, stock at the chosen site and any quantity still
 * pending on purchase orders. Picking a row fills the item's (hidden) material
 * <select> and fires its change handler, so all GRN save logic is unchanged.
 */
import { state } from './state.js';
import * as IC from './inventoryCalc.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const qty = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });

let _selectId = null;   // the hidden <select> being filled
let _q = '', _kind = '';

/** Rows for the picker: every stock material with its stock here + pending POs. */
function rows() {
  const siteId = document.getElementById('grnSite')?.value || '';
  const stock = {};
  IC.stockRows({ materials: state.rawMaterials || [], tx: state.inventoryTx || [], transfers: state.itemTransfers || [], siteId })
    .forEach(r => { stock[r.id] = r.stock; });
  const pending = IC.pendingOrders(state.purchaseOrders || [], state.grnRecords || []);
  // Most recently received first, so the usual materials sit at the top.
  const last = {};
  (state.grnRecords || []).forEach(g => { if (g.matId && (g.date || '') > (last[g.matId] || '')) last[g.matId] = g.date || ''; });
  return (state.rawMaterials || []).map(m => ({
    id: m.id, name: m.name || 'Material', unit: m.unit || '', kind: IC.materialKind(m.type),
    icon: IC.materialIcon(m), stock: stock[m.id] ?? 0, pending: pending[m.id] || 0, last: last[m.id] || '',
  })).sort((a, b) => (b.pending > 0) - (a.pending > 0) || b.last.localeCompare(a.last) || a.name.localeCompare(b.name));
}

function listHtml() {
  const needle = _q.trim().toLowerCase();
  const sel = document.getElementById(_selectId)?.value || '';
  const list = rows().filter(r => (!_kind || r.kind === _kind) && (!needle || r.name.toLowerCase().includes(needle)));
  if (!list.length) return `<div class="gp-none">No material found${needle ? ` for “${esc(_q)}”` : ''}.<br><button type="button" onclick="window._gpNew()">+ Add a new material</button></div>`;
  return list.map(r => {
    const sub = [
      `<span class="${r.stock > 0 ? 'ok' : 'zero'}">In stock: ${qty(r.stock)} ${esc(r.unit)}</span>`,
      r.pending > 0 ? `<span class="po">Pending order: ${qty(r.pending)} ${esc(r.unit)}</span>` : '',
    ].filter(Boolean).join('');
    return `<button type="button" class="gp-row${r.id === sel ? ' on' : ''}" onclick="window._gpPick('${esc(r.id)}')">
      <span class="gp-ic" aria-hidden="true">${r.icon}</span>
      <span class="gp-txt"><b>${esc(r.name)}</b><small>${sub}</small></span>
      <span class="gp-kind ${r.kind}">${IC.KIND_LABEL[r.kind]}</span>
    </button>`;
  }).join('');
}

function paint() {
  const body = document.getElementById('gpList');
  if (body) body.innerHTML = listHtml();
  document.querySelectorAll('#grnPickOverlay .gp-chips button').forEach(b => b.classList.toggle('on', b.dataset.k === _kind));
}

export function openMaterialPicker(selectId) {
  _selectId = selectId;
  let o = document.getElementById('grnPickOverlay');
  if (!o) {
    o = document.createElement('div');
    o.id = 'grnPickOverlay';
    o.className = 'gp-overlay';
    o.__onBack = closeMaterialPicker;   // hardware / browser Back closes the picker
    document.body.appendChild(o);
  }
  const chip = (k, l) => `<button type="button" data-k="${k}" class="${_kind === k ? 'on' : ''}" onclick="window._gpKind('${k}')">${l}</button>`;
  o.innerHTML = `<div class="gp-sheet" role="dialog" aria-label="Select material">
    <div class="gp-head">
      <button type="button" class="gp-x" onclick="window._gpClose()" aria-label="Close">✕</button>
      <b>Select material</b>
    </div>
    <div class="gp-bar">
      <div class="ts-search"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="gpSearch" type="search" placeholder="Search materials…" value="${esc(_q)}" oninput="window._gpSearch(this.value)" autocomplete="off"></div>
      <div class="gp-chips">${chip('', 'All')}${chip('raw', 'Raw material')}${chip('consumable', 'Consumable')}${chip('tool', 'Tool')}</div>
    </div>
    <div id="gpList" class="gp-list"></div>
  </div>`;
  o.style.display = 'flex';
  paint();
  // Focus search on large screens only — on phones the keyboard would cover the list.
  if (window.innerWidth > 768) document.getElementById('gpSearch')?.focus();
}

export function closeMaterialPicker() {
  const o = document.getElementById('grnPickOverlay');
  if (o) o.style.display = 'none';
}

if (typeof window !== 'undefined') {
  window._grnOpenPicker = openMaterialPicker;
  window._gpClose = closeMaterialPicker;
  window._gpSearch = (v) => { _q = v; paint(); };
  window._gpKind = (k) => { _kind = k; paint(); };
  window._gpPick = (id) => {
    const sel = document.getElementById(_selectId);
    if (sel) { sel.value = id; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    closeMaterialPicker();
  };
  window._gpNew = () => { closeMaterialPicker(); window.openRawMaterialModal?.(); };
}
