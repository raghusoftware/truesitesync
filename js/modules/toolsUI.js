/**
 * toolsUI.js — Tools register (Inventory → Tools), built for one-handed field use.
 *
 *   • sticky search + filter pills (All · Available · In use · Repair · My tools ·
 *     Returnable · Overdue) and a category row;
 *   • one high-contrast card per tool: category icon, name, tag, status badge,
 *     who has it and for how long — readable without a tap;
 *   • swipe a card right to Assign / Return / Mark repaired, left to report it
 *     broken or lost (rubber-band + haptic, like the chat);
 *   • tap a card for a half-height bottom sheet with details, actions and history
 *     (drag the handle up for full height, down to close; Android Back closes it).
 *
 * Data: state.toolRegister (rules in toolsCalc.js). A check-out also writes a
 * state.toolIssues record so worker deductions and the old issue log keep working.
 */
import { state, saveAllData } from './state.js';
import { showToast, getCurrencySymbol } from './utils.js';
import { CATEGORIES, STATUS, guessCategory, daysSince, isOverdue, nextCode, registerFromIssues, filterTools, statusCounts } from './toolsCalc.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => 'tl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const me = () => { try { return window.actingUser?.() || {}; } catch { return {}; } };
const money = (n) => getCurrencySymbol() + (Number(n) || 0).toLocaleString('en-IN');
const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };
const worker = (id) => (state.labourMaster || []).find(l => l.id === id);
const workerName = (id) => worker(id)?.name || 'Worker';
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
function haptic(ms = 10) {
  try { const H = window.Capacitor?.Plugins?.Haptics; if (H?.impact) { H.impact({ style: ms > 14 ? 'MEDIUM' : 'LIGHT' }); return; } } catch {}
  try { navigator.vibrate?.(ms); } catch {}
}

/* ── line icons (24px grid) ── */
const sv = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const CAT_ICON = {
  power: sv('<rect x="3" y="6" width="11" height="7" rx="2"/><path d="M14 8.5h4l3 1-3 1h-4M6.5 13l-1.5 7h4.5l1-7"/>'),
  hand: sv('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/>'),
  heavy: sv('<path d="M2 16V9h9v7M11 11h5l3 3v2h-8"/><circle cx="6" cy="17.5" r="2"/><circle cx="16" cy="17.5" r="2"/><path d="M4 9l2-4h4"/>'),
  measure: sv('<rect x="2" y="8" width="20" height="8" rx="1.5"/><path d="M6 8v3M10 8v4M14 8v3M18 8v4"/>'),
  safety: sv('<path d="M4 15a8 8 0 0 1 16 0"/><path d="M2 15h20v2H2zM12 7v4"/>'),
  scaffold: sv('<path d="M4 3v18M20 3v18M4 7h16M4 13h16M4 19h16M4 7l16 6M20 7L4 13"/>'),
  other: sv('<path d="M21 8l-9-5-9 5 9 5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>'),
};
const CAT_TONE = { power: '#4f46e5', hand: '#0284c7', heavy: '#b45309', measure: '#0d9488', safety: '#7c3aed', scaffold: '#475569', other: '#64748b' };
const I = {
  search: sv('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  sun: sv('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  plus: sv('<path d="M12 5v14M5 12h14"/>'),
  assign: sv('<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/>'),
  ret: sv('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  fix: sv('<path d="M20 6L9 17l-5-5"/>'),
  warn: sv('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>'),
  edit: sv('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  pin: sv('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  x: sv('<path d="M6 6l12 12M18 6L6 18"/>'),
  trash: sv('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
};
/** What a right-swipe (primary action) does for each status. */
const PRIMARY = {
  available: { key: 'assign', label: 'Assign', icon: I.assign },
  in_use: { key: 'return', label: 'Return', icon: I.ret },
  maintenance: { key: 'repaired', label: 'Repaired', icon: I.fix },
  lost: { key: 'found', label: 'Found', icon: I.fix },
};

/* ── module UI state ── */
const V = { q: '', filter: 'all', cat: '' };
let _hc = false;
try { _hc = localStorage.getItem('tss_tools_hc') === '1'; } catch {}

/** saveAllData + a direct local copy, so a browser still holding an older
 *  state.js (without the toolRegister key) can't lose the register on reload. */
function persist() {
  saveAllData();
  try { localStorage.setItem('mes_tool_register', JSON.stringify(state.toolRegister || [])); } catch {}
}
function tools() {
  if (!Array.isArray(state.toolRegister)) {
    try { state.toolRegister = JSON.parse(localStorage.getItem('mes_tool_register') || '[]'); } catch { state.toolRegister = []; }
  }
  return state.toolRegister.filter(t => t.projectId === state.currentProjectId);
}
function byId(id) { return (state.toolRegister || []).find(t => t.id === id); }
function logEvent(t, ev) { (t.history = t.history || []).push({ at: new Date().toISOString(), by: me().name || '', ...ev }); t.updatedAt = Date.now(); }

/** One-time: turn the old free-text issue log into register entries. */
function migrateIssues() {
  const issues = state.toolIssues || [];
  if (!issues.some(i => i.projectId === state.currentProjectId && !i.toolId && i.tool)) return;
  if (!Array.isArray(state.toolRegister)) state.toolRegister = [];
  const { created, links } = registerFromIssues(state.toolRegister, issues, state.currentProjectId, () => uid());
  created.forEach(t => { state.toolRegister.push(t); });
  issues.forEach(i => { if (links[i.id]) i.toolId = links[i.id]; });
  persist();
}

/* ═════════════ List screen ═════════════ */
export function renderToolsModule() {
  const host = document.getElementById('toolsContent'); if (!host) return;
  migrateIssues();
  const list = tools();
  const counts = statusCounts(list);
  const shown = filterTools(list, { ...V, meId: me().id, nameOf: workerName });
  const pill = (key, label, n) => `<button class="tl-pill${V.filter === key ? ' on' : ''}${key === 'overdue' && n ? ' warn' : ''}" onclick="_tlFilter('${key}')">${label}${n != null ? `<em>${n}</em>` : ''}</button>`;
  const mineN = list.filter(t => t.status === 'in_use' && t.holder?.byId === me().id).length;
  const cat = (c) => `<button class="tl-cat${V.cat === c.key ? ' on' : ''}" style="--c:${CAT_TONE[c.key]}" onclick="_tlCat('${c.key}')" aria-label="${c.label}"><span>${CAT_ICON[c.key]}</span>${c.label}</button>`;
  const usedCats = CATEGORIES.filter(c => list.some(t => t.category === c.key));
  // The filters stick just under the app bar (which is itself sticky inside <main>).
  const bar = document.getElementById('breadcrumbBar');
  const stick = bar && bar.offsetParent && getComputedStyle(bar).position !== 'static' ? bar.offsetHeight : 0;
  host.innerHTML = `
  <div class="tl-page${_hc ? ' tl-hc' : ''}" style="--tl-stick:${stick}px">
    <div class="tl-tiles">
      <button class="tl-tile green${V.filter === 'available' ? ' on' : ''}" onclick="_tlFilter('available')"><b>${counts.available}</b><span>Available</span></button>
      <button class="tl-tile amber${V.filter === 'in_use' ? ' on' : ''}" onclick="_tlFilter('in_use')"><b>${counts.in_use}</b><span>In use</span></button>
      <button class="tl-tile red${V.filter === 'maintenance' ? ' on' : ''}" onclick="_tlFilter('maintenance')"><b>${counts.maintenance}</b><span>Under repair</span></button>
    </div>
    <div class="tl-sticky">
      <div class="tl-search">
        <span class="tl-search-ic">${I.search}</span>
        <input id="tlSearch" type="search" enterkeyhint="search" placeholder="Search tool, tag or worker" value="${esc(V.q)}" oninput="_tlSearch(this.value)">
        <button class="tl-sun${_hc ? ' on' : ''}" onclick="_tlSunlight()" aria-label="Sunlight mode" title="Sunlight mode — maximum contrast">${I.sun}</button>
      </div>
      <div class="tl-pills">
        ${pill('all', 'All', counts.all)}${pill('available', 'Available', counts.available)}${pill('in_use', 'In use', counts.in_use)}${pill('maintenance', 'Repair', counts.maintenance)}
        ${pill('mine', 'My tools', mineN)}${pill('returnable', 'Returnable')}${pill('overdue', 'Overdue', counts.overdue)}
      </div>
      ${usedCats.length > 1 ? `<div class="tl-cats">${usedCats.map(cat).join('')}</div>` : ''}
    </div>
    ${list.length && !_hintSeen() ? `<div class="tl-hint"><span>Swipe a card <b>right →</b> to assign or return, <b>← left</b> to report it broken. Tap for details.</span><button onclick="_tlHintOk()" aria-label="Got it">${I.x}</button></div>` : ''}
    <div class="tl-list" id="tlList">
      ${shown.length ? shown.map(cardHTML).join('') : emptyHTML(list.length)}
    </div>
    <button class="tl-fab" onclick="_tlEdit()" aria-label="Add tool">${I.plus}<span>Add tool</span></button>
  </div>`;
  attachSwipe(document.getElementById('tlList'));
}
window.renderToolsModule = renderToolsModule;

function emptyHTML(any) {
  return any
    ? `<div class="tl-empty"><b>No tools match</b><span>Try another filter or clear the search.</span><button class="tl-btn ghost" onclick="_tlReset()">Show all tools</button></div>`
    : `<div class="tl-empty"><span class="tl-empty-ic">${CAT_ICON.hand}</span><b>Build your tool register</b><span>Add drills, levels, scaffolding and other gear once — then assign them to workers with a swipe.</span><button class="tl-btn primary" onclick="_tlEdit()">${I.plus} Add first tool</button></div>`;
}

function badge(t) {
  if (isOverdue(t)) return `<span class="tl-badge red">● Overdue</span>`;
  const s = STATUS[t.status] || STATUS.available;
  return `<span class="tl-badge ${s.tone}">● ${s.label}</span>`;
}
function whereLine(t) {
  if (t.status === 'in_use' && t.holder) {
    const d = daysSince(t.holder.since);
    const n = workerName(t.holder.labourId);
    return `<span class="tl-av">${esc(initials(n))}</span><b>${esc(n)}</b><span class="tl-dot">·</span><span class="${isOverdue(t) ? 'tl-late' : ''}">${d === 0 ? 'since today' : d === 1 ? '1 day' : d + ' days'}</span>`;
  }
  const last = (t.history || []).slice().reverse().find(h => h.type === 'broken' || h.type === 'lost');
  if (t.status === 'maintenance' || t.status === 'lost') return `<span class="tl-w-ic">${I.warn}</span><span>${esc(last?.note || (t.status === 'lost' ? 'Reported lost' : 'Reported broken'))}${last ? ' · ' + daysAgo(last.at) : ''}</span>`;
  return `<span class="tl-w-ic">${I.pin}</span><span>${esc(t.location || 'Site store')}</span>`;
}
function daysAgo(iso) { const d = daysSince(iso); return d === 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; }
function catLabel(k) { return (CATEGORIES.find(c => c.key === k) || CATEGORIES[CATEGORIES.length - 1]).label; }

function cardHTML(t) {
  const p = PRIMARY[t.status] || PRIMARY.available;
  const cat = CAT_ICON[t.category] ? t.category : 'other';
  return `<article class="tl-card s-${t.status}${isOverdue(t) ? ' overdue' : ''}" data-id="${t.id}">
    <div class="tl-under">
      <span class="tl-u left">${p.icon}<b>${p.label}</b></span>
      <span class="tl-u right"><b>${t.status === 'maintenance' ? 'Lost' : 'Broken'}</b>${I.warn}</span>
    </div>
    <div class="tl-face" role="button" tabindex="0" onclick="_tlOpen('${t.id}')" onkeydown="if(event.key==='Enter')_tlOpen('${t.id}')">
      <span class="tl-ic" style="--c:${CAT_TONE[cat]}">${CAT_ICON[cat]}</span>
      <div class="tl-main">
        <div class="tl-top"><b class="tl-name">${esc(t.name)}</b>${badge(t)}</div>
        <div class="tl-meta">${esc(t.code || '')}${t.qty > 1 ? ` · ${t.qty} nos` : ''} · ${catLabel(cat)}${Number(t.value) ? ' · ' + money(t.value) : ''}</div>
        <div class="tl-where">${whereLine(t)}</div>
      </div>
    </div>
  </article>`;
}

/* filters */
window._tlFilter = (k) => { V.filter = V.filter === k && k !== 'all' ? 'all' : k; renderToolsModule(); };
window._tlCat = (k) => { V.cat = V.cat === k ? '' : k; renderToolsModule(); };
window._tlReset = () => { V.q = ''; V.filter = 'all'; V.cat = ''; renderToolsModule(); };
window._tlSearch = (v) => {
  V.q = v;
  const box = document.getElementById('tlList'); if (!box) return;
  const shown = filterTools(tools(), { ...V, meId: me().id, nameOf: workerName });
  box.innerHTML = shown.length ? shown.map(cardHTML).join('') : emptyHTML(tools().length);
};
window._tlSunlight = () => { _hc = !_hc; try { localStorage.setItem('tss_tools_hc', _hc ? '1' : '0'); } catch {} renderToolsModule(); };
function _hintSeen() { try { return localStorage.getItem('tss_tools_hint') === '1'; } catch { return true; } }
window._tlHintOk = () => { try { localStorage.setItem('tss_tools_hint', '1'); } catch {} document.querySelector('.tl-hint')?.remove(); };

/* ═════════════ Swipe to act ═════════════ */
const TH = 96;                                 // px past which a release triggers the action
const rubber = (d) => { const a = Math.abs(d), s = Math.sign(d); return s * (a < TH ? a : TH + (a - TH) * 0.3); };
function attachSwipe(list) {
  if (!list) return;
  let g = null;
  list.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const card = e.target.closest('.tl-card'); if (!card) return;
    g = { card, face: card.querySelector('.tl-face'), x: e.clientX, y: e.clientY, dx: 0, lock: false, armed: 0, id: e.pointerId };
  }, { passive: true });
  list.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.lock) {
      if (Math.hypot(dx, dy) < 10) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) { g = null; return; }   // vertical: let the page scroll
      g.lock = true; g.face.style.transition = 'none'; g.card.classList.add('swiping');
      try { g.face.setPointerCapture(e.pointerId); } catch {}
    }
    const t = byId(g.card.dataset.id);
    let d = rubber(dx);
    if (d < 0 && t && t.status === 'lost') d = 0;                     // nothing to report on a lost tool
    g.dx = d;
    g.face.style.transform = `translate3d(${d}px,0,0)`;
    g.card.classList.toggle('dir-r', d > 0); g.card.classList.toggle('dir-l', d < 0);
    const armed = Math.abs(d) >= TH ? Math.sign(d) : 0;
    if (armed !== g.armed) { g.armed = armed; g.card.classList.toggle('armed', !!armed); if (armed) haptic(12); }
  }, { passive: true });
  const end = () => {
    if (!g) return;
    const { card, face, armed, lock } = g; g = null;
    if (!lock) return;
    face.style.transition = 'transform .45s cubic-bezier(.2,1.4,.4,1)';
    face.style.transform = '';
    setTimeout(() => { card.classList.remove('swiping', 'armed', 'dir-r', 'dir-l'); face.style.transition = ''; }, 460);
    // a swipe must not also count as a tap on the card
    const eat = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    card.addEventListener('click', eat, { capture: true, once: true }); setTimeout(() => card.removeEventListener('click', eat, { capture: true }), 60);
    if (armed > 0) primaryAction(card.dataset.id);
    else if (armed < 0) window._tlReport(card.dataset.id);
  };
  list.addEventListener('pointerup', end, { passive: true });
  list.addEventListener('pointercancel', end, { passive: true });
}
function primaryAction(id) {
  const t = byId(id); if (!t) return;
  const k = (PRIMARY[t.status] || PRIMARY.available).key;
  if (k === 'assign') window._tlAssign(id);
  else if (k === 'return') window._tlReturn(id);
  else setAvailable(t, k === 'found' ? 'found' : 'repaired');
}

/* ═════════════ Bottom sheet ═════════════ */
/**
 * Half-height sheet (drag the handle up for full height, down to close).
 * Back closes it (id ends with "Overlay" → mobileShell's back handler).
 */
function openSheet(inner, { tall = false } = {}) {
  closeSheet(true);
  const ov = document.createElement('div');
  ov.id = 'toolSheetOverlay'; ov.className = 'tl-ov' + (_hc ? ' tl-hc' : '');
  ov.innerHTML = `<div class="tl-sheet${tall ? ' tall' : ''}" role="dialog" aria-modal="true"><div class="tl-grab" aria-hidden="true"><i></i></div><div class="tl-sheet-in">${inner}</div></div>`;
  ov.__onBack = () => closeSheet();
  ov.addEventListener('click', (e) => { if (e.target === ov) closeSheet(); });
  document.body.appendChild(ov);
  const sheet = ov.querySelector('.tl-sheet'), grab = ov.querySelector('.tl-grab');
  let y0 = null, dy = 0;
  grab.addEventListener('pointerdown', (e) => { y0 = e.clientY; dy = 0; sheet.style.transition = 'none'; try { grab.setPointerCapture(e.pointerId); } catch {} });
  grab.addEventListener('pointermove', (e) => { if (y0 == null) return; dy = e.clientY - y0; sheet.style.transform = `translateY(${Math.max(dy, -40)}px)`; });
  const up = () => {
    if (y0 == null) return; y0 = null;
    sheet.style.transition = ''; sheet.style.transform = '';
    if (dy > 90) closeSheet(); else if (dy < -40) sheet.classList.add('tall');
  };
  grab.addEventListener('pointerup', up); grab.addEventListener('pointercancel', up);
  grab.addEventListener('click', () => sheet.classList.toggle('tall'));
  return ov;
}
function closeSheet(instant) {
  const ov = document.getElementById('toolSheetOverlay'); if (!ov) return;
  if (instant) { ov.remove(); return; }
  ov.classList.add('out'); setTimeout(() => ov.remove(), 220);
}
window._tlCloseSheet = () => closeSheet();

/* details */
window._tlOpen = (id) => {
  const t = byId(id); if (!t) return;
  const cat = CAT_ICON[t.category] ? t.category : 'other';
  const p = PRIMARY[t.status] || PRIMARY.available;
  const hist = (t.history || []).slice().reverse().slice(0, 25);
  const evText = (h) => ({
    created: 'Added to register', edited: 'Details edited', checkout: `Assigned to <b>${esc(workerName(h.labourId))}</b>`,
    return: `Returned by <b>${esc(workerName(h.labourId))}</b>${h.condition === 'damaged' ? ' — damaged' : ''}`,
    broken: 'Reported broken', lost: 'Reported lost', repaired: 'Repaired — back in store', found: 'Found — back in store',
  }[h.type] || esc(h.type));
  const holder = t.status === 'in_use' && t.holder ? `<div class="tl-holder${isOverdue(t) ? ' late' : ''}">
      <span class="tl-av lg">${esc(initials(workerName(t.holder.labourId)))}</span>
      <div><b>${esc(workerName(t.holder.labourId))}</b><small>Since ${fmtDate(t.holder.since)} · ${daysSince(t.holder.since)} day(s)${isOverdue(t) ? ' · overdue' : ''}</small></div></div>` : '';
  openSheet(`
    <header class="tl-sh-head">
      <span class="tl-ic lg" style="--c:${CAT_TONE[cat]}">${CAT_ICON[cat]}</span>
      <div class="tl-sh-title"><h3>${esc(t.name)}</h3><span>${esc(t.code || '')} · ${catLabel(cat)}</span><div class="tl-sh-badge">${badge(t)}</div></div>
    </header>
    <div class="tl-actions">
      <button class="tl-btn primary" onclick="_tlPrimary('${t.id}')">${p.icon}${p.label}</button>
      ${t.status !== 'lost' ? `<button class="tl-btn danger" onclick="_tlReport('${t.id}')">${I.warn}${t.status === 'maintenance' ? 'Lost' : 'Broken'}</button>` : ''}
      <button class="tl-btn ghost icon" onclick="_tlEdit('${t.id}')" aria-label="Edit">${I.edit}</button>
    </div>
    ${holder}
    <dl class="tl-dl">
      <div><dt>Tag</dt><dd>${esc(t.code || '—')}</dd></div>
      <div><dt>Value</dt><dd>${Number(t.value) ? money(t.value) : '—'}</dd></div>
      <div><dt>Quantity</dt><dd>${t.qty || 1}</dd></div>
      <div><dt>Location</dt><dd>${esc(t.location || 'Site store')}</dd></div>
      <div><dt>Returnable</dt><dd>${t.returnable === false ? 'No (consumable)' : 'Yes'}</dd></div>
      <div><dt>Times issued</dt><dd>${(t.history || []).filter(h => h.type === 'checkout').length}</dd></div>
    </dl>
    <h4 class="tl-h4">History</h4>
    <ol class="tl-tl">${hist.length ? hist.map(h => `<li class="ev-${h.type}"><i></i><div><span>${evText(h)}</span>${h.note && h.type !== 'created' ? `<em>${esc(h.note)}</em>` : ''}<small>${fmtDate(h.at)}${h.by ? ' · ' + esc(h.by) : ''}</small></div></li>`).join('') : '<li><div><span>No history yet</span></div></li>'}</ol>`);
};
window._tlPrimary = (id) => primaryAction(id);

/* assign */
window._tlAssign = (id) => {
  const t = byId(id); if (!t) return;
  const people = (typeof window._projectLabour === 'function' ? window._projectLabour() : (state.labourMaster || []).filter(l => l.projectId === state.currentProjectId));
  const row = (l) => `<button class="tl-person" data-id="${l.id}" data-q="${esc((l.name + ' ' + (l.trade || l.category || l.skill || '')).toLowerCase())}" onclick="_tlPick(this)">
    <span class="tl-av lg">${esc(initials(l.name))}</span><span class="tl-p-txt"><b>${esc(l.name)}</b><small>${esc(l.trade || l.category || l.skill || 'Worker')}</small></span><span class="tl-radio"></span></button>`;
  openSheet(`
    <header class="tl-sh-head compact"><div class="tl-sh-title"><h3>Assign ${esc(t.name)}</h3><span>${esc(t.code || '')} · pick who is taking it</span></div><button class="tl-x" onclick="_tlCloseSheet()" aria-label="Close">${I.x}</button></header>
    ${people.length > 6 ? `<div class="tl-search in-sheet"><span class="tl-search-ic">${I.search}</span><input type="search" placeholder="Search worker" oninput="_tlPeopleFilter(this.value)"></div>` : ''}
    <div class="tl-people">${people.length ? people.map(row).join('') : '<p class="tl-muted">No workers in this project yet — add them in Labour first.</p>'}</div>
    <label class="tl-field"><span>Note (optional)</span><input id="tlNote" class="tl-in" placeholder="e.g. for Block A shuttering"></label>
    <div class="tl-sheet-foot"><button class="tl-btn primary block" id="tlAssignGo" disabled onclick="_tlAssignSave('${t.id}')">${I.assign}Select a worker</button></div>`, { tall: people.length > 4 });
};
window._tlPeopleFilter = (v) => { const s = v.trim().toLowerCase(); document.querySelectorAll('.tl-person').forEach(b => { b.style.display = !s || b.dataset.q.includes(s) ? '' : 'none'; }); };
window._tlPick = (btn) => {
  document.querySelectorAll('.tl-person.on').forEach(b => b.classList.remove('on'));
  btn.classList.add('on'); haptic(8);
  const go = document.getElementById('tlAssignGo');
  if (go) { go.disabled = false; go.dataset.labour = btn.dataset.id; go.innerHTML = `${I.assign}Assign to ${esc(btn.querySelector('b').textContent)}`; }
};
window._tlAssignSave = (id) => {
  const t = byId(id); const go = document.getElementById('tlAssignGo');
  const labourId = go?.dataset.labour; if (!t || !labourId) return;
  const note = document.getElementById('tlNote')?.value.trim() || '';
  const issue = { id: 'tool_' + Date.now(), date: today(), labourId, tool: t.name, value: Number(t.value) || 0, returned: false, projectId: state.currentProjectId, toolId: t.id };
  window.stampCreate?.(issue);
  (state.toolIssues = state.toolIssues || []).push(issue);
  t.status = 'in_use'; t.holder = { labourId, since: today(), byId: me().id || '', issueId: issue.id };
  logEvent(t, { type: 'checkout', labourId, note });
  persist(); closeSheet(); haptic(14);
  renderToolsModule();
  showToast(`${t.name} assigned to ${workerName(labourId)}`, 'success');
};

/* return */
window._tlReturn = (id) => {
  const t = byId(id); if (!t || !t.holder) return;
  openSheet(`
    <header class="tl-sh-head compact"><div class="tl-sh-title"><h3>Return ${esc(t.name)}</h3><span>from ${esc(workerName(t.holder.labourId))} · out ${daysSince(t.holder.since)} day(s)</span></div><button class="tl-x" onclick="_tlCloseSheet()" aria-label="Close">${I.x}</button></header>
    <div class="tl-choice">
      <button class="tl-opt on" data-v="good" onclick="_tlCond(this)"><span class="tl-opt-ic green">${I.fix}</span><b>Good condition</b><small>Back to the store</small></button>
      <button class="tl-opt" data-v="damaged" onclick="_tlCond(this)"><span class="tl-opt-ic red">${I.warn}</span><b>Damaged</b><small>Send to repair</small></button>
    </div>
    <div id="tlDmg" class="tl-dmg hide">
      <label class="tl-field"><span>Penalty to deduct from wages (${esc(getCurrencySymbol().trim())})</span><input id="tlPenalty" class="tl-in" type="number" inputmode="decimal" placeholder="0"></label>
      <label class="tl-field"><span>What is wrong?</span><input id="tlDmgNote" class="tl-in" placeholder="e.g. chuck broken"></label>
    </div>
    <div class="tl-sheet-foot"><button class="tl-btn primary block" onclick="_tlReturnSave('${t.id}')">${I.ret}Confirm return</button></div>`);
};
window._tlCond = (btn) => {
  btn.parentElement.querySelectorAll('.tl-opt').forEach(b => b.classList.toggle('on', b === btn));
  document.getElementById('tlDmg')?.classList.toggle('hide', btn.dataset.v !== 'damaged');
  haptic(8);
};
window._tlReturnSave = (id) => {
  const t = byId(id); if (!t || !t.holder) return;
  const damaged = document.querySelector('.tl-opt.on')?.dataset.v === 'damaged';
  const penalty = damaged ? (parseFloat(document.getElementById('tlPenalty')?.value) || 0) : 0;
  const note = damaged ? (document.getElementById('tlDmgNote')?.value.trim() || 'Returned damaged') : '';
  closeIssue(t, penalty);
  const labourId = t.holder.labourId;
  logEvent(t, { type: 'return', labourId, condition: damaged ? 'damaged' : 'good', note });
  t.holder = null;
  if (damaged) { t.status = 'maintenance'; logEvent(t, { type: 'broken', note }); } else t.status = 'available';
  persist(); closeSheet(); haptic(14); renderToolsModule();
  showToast(damaged ? `${t.name} returned damaged — moved to repair` : `${t.name} returned`, damaged ? 'warning' : 'success');
};
/** Close the open issue record; a penalty becomes a worker deduction (as before). */
function closeIssue(t, penalty) {
  const iss = (state.toolIssues || []).find(i => i.id === t.holder?.issueId) || (state.toolIssues || []).find(i => i.toolId === t.id && !i.returned);
  if (iss) { iss.returned = true; iss.returnedDate = today(); }
  if (penalty > 0 && t.holder) {
    (state.labourDeductions = state.labourDeductions || []).push({ id: 'ded_' + Date.now(), labourId: t.holder.labourId, deductionType: 'Damaged Tool', amount: penalty, date: today(), note: t.name, settled: false });
    showToast(`Penalty ${getCurrencySymbol()}${penalty} added to ${workerName(t.holder.labourId)}'s deductions`, 'warning');
  }
}

/* report broken / lost */
window._tlReport = (id) => {
  const t = byId(id); if (!t || t.status === 'lost') return;
  const reasons = t.status === 'maintenance' ? [['lost', 'Lost / stolen']] : [['broken', 'Broken'], ['service', 'Needs service'], ['lost', 'Lost / stolen']];
  openSheet(`
    <header class="tl-sh-head compact"><div class="tl-sh-title"><h3>Report ${esc(t.name)}</h3><span>${esc(t.code || '')}${t.holder ? ' · with ' + esc(workerName(t.holder.labourId)) : ''}</span></div><button class="tl-x" onclick="_tlCloseSheet()" aria-label="Close">${I.x}</button></header>
    <div class="tl-reasons">${reasons.map(([v, l], i) => `<button class="tl-reason${i === 0 ? ' on' : ''}" data-v="${v}" onclick="this.parentElement.querySelectorAll('.tl-reason').forEach(b=>b.classList.toggle('on',b===this))">${l}</button>`).join('')}</div>
    <label class="tl-field"><span>Details</span><input id="tlRepNote" class="tl-in" placeholder="What happened?"></label>
    ${t.holder ? `<label class="tl-field"><span>Penalty to deduct from ${esc(workerName(t.holder.labourId))} (${esc(getCurrencySymbol().trim())})</span><input id="tlRepPenalty" class="tl-in" type="number" inputmode="decimal" placeholder="0"></label>` : ''}
    <div class="tl-sheet-foot"><button class="tl-btn danger solid block" onclick="_tlReportSave('${t.id}')">${I.warn}Report</button></div>`);
};
window._tlReportSave = (id) => {
  const t = byId(id); if (!t) return;
  const reason = document.querySelector('.tl-reason.on')?.dataset.v || 'broken';
  const typed = document.getElementById('tlRepNote')?.value.trim();
  const note = typed || { broken: 'Broken', service: 'Needs service', lost: 'Lost / stolen' }[reason];
  if (t.holder) {
    closeIssue(t, parseFloat(document.getElementById('tlRepPenalty')?.value) || 0);
    logEvent(t, { type: 'return', labourId: t.holder.labourId, condition: 'damaged', note });
    t.holder = null;
  }
  t.status = reason === 'lost' ? 'lost' : 'maintenance';
  logEvent(t, { type: reason === 'lost' ? 'lost' : 'broken', note });
  persist(); closeSheet(); haptic(16); renderToolsModule();
  showToast(`${t.name} marked ${reason === 'lost' ? 'lost' : 'for repair'}`, 'warning');
};
function setAvailable(t, type) {
  t.status = 'available'; t.holder = null;
  logEvent(t, { type });
  persist(); closeSheet(); haptic(14); renderToolsModule();
  showToast(`${t.name} is available again`, 'success');
}

/* add / edit */
window._tlEdit = (id) => {
  const t = id ? byId(id) : null;
  const cat = t?.category || 'power';
  openSheet(`
    <header class="tl-sh-head compact"><div class="tl-sh-title"><h3>${t ? 'Edit tool' : 'Add tool'}</h3><span>${t ? esc(t.code || '') : 'Tag ' + nextCode(tools())}</span></div><button class="tl-x" onclick="_tlCloseSheet()" aria-label="Close">${I.x}</button></header>
    <label class="tl-field"><span>Tool name *</span><input id="tlName" class="tl-in" value="${esc(t?.name || '')}" placeholder="e.g. Bosch drill 13 mm" oninput="_tlGuess(this.value)"></label>
    <div class="tl-field"><span>Category</span><div class="tl-catpick">${CATEGORIES.map(c => `<button type="button" class="tl-catopt${c.key === cat ? ' on' : ''}" data-v="${c.key}" style="--c:${CAT_TONE[c.key]}" onclick="_tlCatPick(this)"><span>${CAT_ICON[c.key]}</span>${c.label}</button>`).join('')}</div></div>
    <div class="tl-row2">
      <label class="tl-field"><span>Value (${esc(getCurrencySymbol().trim())})</span><input id="tlValue" class="tl-in" type="number" inputmode="decimal" value="${t?.value || ''}" placeholder="0"></label>
      <label class="tl-field"><span>Quantity</span><input id="tlQty" class="tl-in" type="number" inputmode="numeric" min="1" value="${t?.qty || 1}"></label>
    </div>
    <label class="tl-field"><span>Kept at</span><input id="tlLoc" class="tl-in" value="${esc(t?.location || 'Site store')}"></label>
    <label class="tl-switch"><input id="tlRet" type="checkbox" ${t?.returnable === false ? '' : 'checked'}><i></i><span><b>Returnable</b><small>Must come back to the store after use</small></span></label>
    <div class="tl-sheet-foot">
      ${t ? `<button class="tl-btn ghost icon danger-ink" onclick="_tlDelete('${t.id}')" aria-label="Delete">${I.trash}</button>` : ''}
      <button class="tl-btn primary block" onclick="_tlSave('${t?.id || ''}')">${t ? 'Save changes' : 'Add tool'}</button>
    </div>`, { tall: true });
  if (!t) setTimeout(() => document.getElementById('tlName')?.focus(), 250);
};
let _catTouched = false;
window._tlCatPick = (btn) => { _catTouched = true; btn.parentElement.querySelectorAll('.tl-catopt').forEach(b => b.classList.toggle('on', b === btn)); };
window._tlGuess = (v) => {
  if (_catTouched) return;
  const g = guessCategory(v);
  document.querySelectorAll('.tl-catopt').forEach(b => b.classList.toggle('on', b.dataset.v === g));
};
window._tlSave = (id) => {
  const name = document.getElementById('tlName')?.value.trim();
  if (!name) { showToast('Enter the tool name', 'error'); return; }
  const fields = {
    name, category: document.querySelector('.tl-catopt.on')?.dataset.v || guessCategory(name),
    value: parseFloat(document.getElementById('tlValue')?.value) || 0,
    qty: Math.max(1, parseInt(document.getElementById('tlQty')?.value, 10) || 1),
    location: document.getElementById('tlLoc')?.value.trim() || 'Site store',
    returnable: !!document.getElementById('tlRet')?.checked,
  };
  if (!Array.isArray(state.toolRegister)) state.toolRegister = [];
  let t = id ? byId(id) : null;
  if (t) { Object.assign(t, fields); logEvent(t, { type: 'edited' }); window.stampUpdate?.(t); }
  else {
    t = { id: uid(), projectId: state.currentProjectId, code: nextCode(tools()), status: 'available', holder: null, history: [], ...fields };
    window.stampCreate?.(t); logEvent(t, { type: 'created' });
    state.toolRegister.push(t);
  }
  _catTouched = false;
  persist(); closeSheet(); renderToolsModule();
  showToast(id ? 'Tool updated' : `${t.name} added as ${t.code}`, 'success');
};
window._tlDelete = (id) => {
  const t = byId(id); if (!t) return;
  if (t.status === 'in_use') { showToast('Return the tool before deleting it', 'error'); return; }
  if (!confirm(`Delete ${t.name} (${t.code})? It stays recoverable in the Recycle Bin.`)) return;
  if (typeof window.recycleDelete === 'function') window.recycleDelete('toolRegister', id, 'Tool', t.name);
  else state.toolRegister = state.toolRegister.filter(x => x.id !== id);
  persist(); closeSheet(); renderToolsModule();
};
