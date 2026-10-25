/**
 * inventoryList.js — Current Inventory as one full-width card per material,
 * in a single vertical list that scrolls with the page (no inner scroll boxes,
 * no side-scrolling tables). A sticky bar on top holds search, site, status
 * chips and location / type / sort filters. Each card shows the material, a
 * 📍 storage-location badge (tap to set), stock vs minimum with a meter, and
 * expands in place to show recent movements.
 * Cards render in batches as you scroll, so long lists stay smooth.
 * Stock maths: inventoryCalc.js (unit-tested).
 */
import { state, saveAllData } from './state.js';
import * as IC from './inventoryCalc.js';
import { getAllLocations, showToast } from './utils.js';

const BATCH = 30;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const qty = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
const fmtD = (d) => { const [y, m, dd] = String(d || '').split('-').map(Number); return y ? `${dd} ${MON[m - 1]} ${y}` : '-'; };

// Filter state (kept while the app is open)
let _site = null;           // null = this project's site on first open; '' = all sites
let _q = '', _status = 'all', _loc = '', _kind = '', _sort = 'low';
let _rows = [], _shown = 0, _open = null, _obs = null, _showFilters = false;

const ICON = {
  search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  pin: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
  filter: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
  chev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
};

function siteName(id) {
  if (!id) return 'All sites';
  const l = getAllLocations().find(x => x.id === id);
  return l ? (l.projectName || l.name) : id;
}

function computeRows() {
  return IC.stockRows({
    materials: state.rawMaterials || [], tx: state.inventoryTx || [],
    transfers: state.itemTransfers || [], siteId: _site,
  });
}

/** How many of site / location / sort differ from the defaults. */
function activeFilters() {
  return [_site !== (state.currentProjectId || ''), !!_loc, _sort !== 'low'].filter(Boolean).length;
}

function filtered() {
  return IC.filterRows(_rows, { q: _q, status: _status, location: _loc, kind: _kind, sort: _sort });
}

const STATUS_LABEL = { ok: 'In stock', low: 'Low', out: 'Out' };

const KIND_ICON = { raw: '🧱', consumable: '🧴', tool: '🔧' };

/** Compact card: name + status, kind + 📍 location, stock vs minimum + meter. */
function cardHtml(r) {
  const open = _open === r.id;
  const loc = r.location
    ? `<button type="button" class="ivc-loc" onclick="event.stopPropagation();window._ivSetLoc('${esc(r.id)}')" title="Change location">${ICON.pin}<span>${esc(r.location)}</span></button>`
    : `<button type="button" class="ivc-loc none" onclick="event.stopPropagation();window._ivSetLoc('${esc(r.id)}')">${ICON.pin}<span>${_site ? 'Set location' : 'No location'}</span></button>`;
  return `<article class="ivc ${r.status}${open ? ' open' : ''}" data-id="${esc(r.id)}" onclick="window._ivToggle('${esc(r.id)}')">
    <div class="ivc-top">
      <h3 class="ivc-name">${esc(r.name)}</h3>
      <span class="ivc-pill ${r.status}">${STATUS_LABEL[r.status]}</span>
    </div>
    <div class="ivc-tags"><span class="ivc-kind ${r.kind}">${KIND_ICON[r.kind]} ${IC.KIND_LABEL[r.kind]}</span>${loc}</div>
    <div class="ivc-stock">
      <b>${qty(r.stock)} <em>${esc(r.unit)}</em></b>
      <span class="ivc-min">${r.min > 0 ? `Min ${qty(r.min)} ${esc(r.unit)}` : 'No minimum'}</span>
      <span class="ivc-chev">${ICON.chev}</span>
    </div>
    <div class="ivc-meter" aria-hidden="true"><i style="width:${r.meter}%"></i>${r.min > 0 ? '<u></u>' : ''}</div>
    ${open ? detailHtml(r) : ''}
  </article>`;
}

/** In-place details: totals + last movements (no navigation). */
function detailHtml(r) {
  const moves = (state.inventoryTx || [])
    .filter(t => t.rawMaterialId === r.id && (parseFloat(t.qty) || 0) !== 0 && (!_site || t.siteId === _site))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 6);
  const label = { IN: 'Received', OUT: 'Issued', CONSUME: 'Consumed' };
  const list = moves.length ? moves.map(t => `<li><span>${esc(fmtD(t.date))}<small>${esc(label[t.type] || t.type)}${t.ref ? ' · ' + esc(t.ref) : ''}</small></span><b class="${t.type === 'IN' ? 'in' : 'out'}">${t.type === 'IN' ? '+' : '−'}${qty(t.qty)}</b></li>`).join('')
    : '<li class="none">No movements yet</li>';
  return `<div class="ivc-detail" onclick="event.stopPropagation()">
    <div class="ivc-tot"><div><small>Total received</small><b class="in">${qty(r.in)} ${esc(r.unit)}</b></div><div><small>Issued / used</small><b class="out">${qty(r.out)} ${esc(r.unit)}</b></div></div>
    <ul class="ivc-moves">${list}</ul>
    <div class="ivc-acts">
      <button type="button" onclick="window._openInvSection('grn')">🚚 Receive</button>
      <button type="button" onclick="window._openInvSection('gang')">🧱 Issue</button>
      <button type="button" onclick="window._ivAdjust('${esc(r.id)}')">✏️ Adjust</button>
    </div>
  </div>`;
}

function appendBatch() {
  const list = document.getElementById('ivCards');
  if (!list) return;
  const rows = filtered();
  const next = rows.slice(_shown, _shown + BATCH);
  list.insertAdjacentHTML('beforeend', next.map(cardHtml).join(''));
  _shown += next.length;
  const more = document.getElementById('ivMore');
  if (more) more.style.display = _shown < rows.length ? 'block' : 'none';
}

/** Re-render only the cards (keeps the toolbar and the search box focus). */
function renderCards() {
  const list = document.getElementById('ivCards');
  if (!list) return;
  const rows = filtered();
  list.innerHTML = '';
  _shown = 0;
  const cnt = document.getElementById('ivCount');
  if (cnt) cnt.textContent = `${rows.length} item${rows.length === 1 ? '' : 's'} · ${siteName(_site)}`;
  const empty = document.getElementById('ivEmpty');
  if (empty) {
    empty.style.display = rows.length ? 'none' : 'block';
    empty.innerHTML = _rows.length
      ? '<div class="ts-emo" data-keep-emoji>🔍</div><h3>No material found</h3><p>Try another name, location or filter.</p>'
      : '<div class="ts-emo" data-keep-emoji>📦</div><h3>No stock here yet</h3><p>Materials appear once they are received at this site.</p>';
  }
  appendBatch();
  renderChips();
}

function renderChips() {
  // Status counts follow the chosen kind (Raw material / Consumable / Tool).
  const c = IC.statusCounts(_kind ? _rows.filter(r => r.kind === _kind) : _rows);
  const chip = (key, l) => `<button type="button" class="ts-chip ${_status === key ? 'on' : ''}" onclick="window._ivStatus('${key}')">${l}<b>${c[key]}</b></button>`;
  const seg = (key, l) => `<button type="button" class="${_kind === key ? 'on' : ''}" onclick="window._ivKind('${key}')" aria-pressed="${_kind === key}">${l}</button>`;
  const el = document.getElementById('ivChips');
  if (el) el.innerHTML = chip('all', 'All') + chip('low', 'Low') + chip('out', 'Out') + chip('ok', 'OK') + chip('noloc', 'No 📍');
  const ks = document.getElementById('ivKinds');
  if (ks) ks.innerHTML = seg('', 'All') + seg('raw', 'Raw material') + seg('consumable', 'Consumable') + seg('tool', 'Tool');
}

export function renderInvList() {
  const host = document.getElementById('invList');
  if (!host) return;
  if (_site === null) _site = state.currentProjectId || '';
  _rows = computeRows();
  const locs = [...new Set(_rows.map(r => r.location).filter(Boolean))].sort();
  if (_loc && !locs.includes(_loc)) _loc = '';
  const opt = (v, l, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
  const sites = getAllLocations().filter(l => l.name);
  const keepFocus = document.activeElement && document.activeElement.id === 'ivSearch';
  // Pin the toolbar right under the app bar, whatever its height on this phone.
  const bar = document.getElementById('breadcrumbBar');
  host.style.setProperty('--iv-top', (bar && bar.offsetParent ? bar.offsetHeight : 0) + 'px');

  host.innerHTML = `<div class="iv">
    <div class="iv-bar">
      <div class="iv-top">
        <div class="ts-search">${ICON.search}<input id="ivSearch" type="search" placeholder="Search materials, locations…" value="${esc(_q)}" oninput="window._ivSearch(this.value)" autocomplete="off"></div>
        <button type="button" class="iv-fbtn${_showFilters ? ' on' : ''}" onclick="window._ivFilters()" aria-expanded="${_showFilters}" aria-label="Filter and sort">${ICON.filter}${activeFilters() ? `<b>${activeFilters()}</b>` : ''}</button>
      </div>
      <div class="iv-sel"${_showFilters ? '' : ' hidden'}>
        <select onchange="window._ivSite(this.value)" aria-label="Site">${opt('', 'All sites', _site)}${sites.map(l => opt(l.id, l.projectName || l.name, _site)).join('')}</select>
        <select onchange="window._ivLoc(this.value)" aria-label="Location">${opt('', 'All locations', _loc)}${locs.map(l => opt(l, '📍 ' + l, _loc)).join('')}</select>
        <select onchange="window._ivSort(this.value)" aria-label="Sort">${opt('low', 'Sort: Most urgent', _sort)}${opt('name', 'Sort: Name A–Z', _sort)}${opt('location', 'Sort: Location', _sort)}${opt('stock', 'Sort: Most stock', _sort)}</select>
      </div>
      <div id="ivKinds" class="iv-kinds" role="group" aria-label="Item kind"></div>
      <div id="ivChips" class="iv-chips"></div>
    </div>
    <div id="ivCount" class="iv-count"></div>
    <div id="ivCards" class="iv-cards"></div>
    <div id="ivEmpty" class="ts-empty" style="display:none"></div>
    <div id="ivMore" class="iv-more">Loading more…</div>
    <button type="button" class="iv-manage" onclick="window._ivAdjust()">Manual adjustment &amp; stock ledger</button>
  </div>`;
  renderCards();
  watchScroll();
  if (keepFocus) { const i = document.getElementById('ivSearch'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}

/** Load the next batch when the "Loading more" line nears the screen. */
function watchScroll() {
  const sentinel = document.getElementById('ivMore');
  if (!sentinel || typeof IntersectionObserver !== 'function') return;
  if (_obs) _obs.disconnect();
  _obs = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) appendBatch();
  }, { root: document.querySelector('main'), rootMargin: '600px 0px' });
  _obs.observe(sentinel);
}

function setLocation(id) {
  const m = (state.rawMaterials || []).find(x => x.id === id);
  if (!m) return;
  const site = _site || state.currentProjectId || '';
  if (!site) { showToast('Pick a site first, then set where this material is kept', 'info'); return; }
  const cur = (m.locations || {})[site] || '';
  const v = prompt(`Where is "${m.name}" kept at ${siteName(site)}?\n(e.g. Yard A - Section 3, Block B - Ground Floor)`, cur);
  if (v === null) return;
  m.locations = { ...(m.locations || {}) };
  if (v.trim()) m.locations[site] = v.trim(); else delete m.locations[site];
  try { window.stampUpdate?.(m); } catch {}
  saveAllData();
  renderInvList();
  showToast(v.trim() ? 'Location saved' : 'Location cleared', 'success');
}

/** Show the classic adjustment form + ledger below the list and scroll to it. */
function openManage(matId) {
  const box = document.getElementById('invManageBox');
  if (!box) return;
  box.classList.remove('hide');
  if (matId) {
    const sel = document.getElementById('invMaterial');
    if (sel) { sel.value = matId; try { window.refreshInvUnitPicker?.(); } catch {} }
  }
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

if (typeof window !== 'undefined') {
  window.renderInvList = renderInvList;
  window._ivSearch = (v) => { _q = v; renderCards(); };
  window._ivStatus = (s) => { _status = s; renderCards(); };
  window._ivLoc = (v) => { _loc = v; renderInvList(); };
  window._ivKind = (v) => { _kind = v; renderCards(); };
  window._ivSort = (v) => { _sort = v; renderInvList(); };
  window._ivFilters = () => { _showFilters = !_showFilters; renderInvList(); };
  window._ivSite = (v) => { _site = v; _loc = ''; renderInvList(); };
  window._ivSetLoc = setLocation;
  window._ivAdjust = openManage;
  window._ivToggle = (id) => {
    _open = _open === id ? null : id;
    const card = document.querySelector(`.ivc[data-id="${CSS.escape(id)}"]`);
    const row = _rows.find(r => r.id === id);
    document.querySelectorAll('.ivc.open').forEach(el => {
      const r = _rows.find(x => x.id === el.dataset.id);
      if (r && el !== card) el.outerHTML = cardHtml(r);
    });
    if (card && row) card.outerHTML = cardHtml(row);
  };
}
