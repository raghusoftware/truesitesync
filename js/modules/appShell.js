/**
 * appShell.js — the clean app shell, same on web and mobile:
 *   • navy app bar: organisation on the tab roots, ← title / project elsewhere
 *   • three tabs: Sites · Business · Setup (bottom bar on phones, sidebar on desktop)
 *   • project-first home: search, status chips, project cards, + Options sheet
 *   • tile grids for Business, Setup and Project Home
 *   • My Profile page (company, subscription, help & support, log out)
 * Pure rules (titles, tabs, filters, progress) live in shellCalc.js.
 */
import { state } from './state.js';
import * as SC from './shellCalc.js';
import { computeAnalytics } from './analyticsCalc.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const go = (v) => window.switchView?.(v);
const isShop = () => typeof window.activeBusinessMode === 'function' && window.activeBusinessMode() !== 'construction';
const cur = () => (typeof window.getCurrencySymbol === 'function' ? window.getCurrencySymbol() : '₹');
const money = (n) => cur() + (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
/** ₹52,000 · ₹3.00 L · ₹1.25 Cr — fits the 3-column summary on phones */
const moneyShort = (n) => {
  const v = Number(n) || 0, a = Math.abs(v);
  if (a >= 1e7) return cur() + (v / 1e7).toFixed(2) + ' Cr';
  if (a >= 1e5) return cur() + (v / 1e5).toFixed(2) + ' L';
  return money(v);
};

/** Can the signed-in user open this view? (no user yet → don't hide anything) */
function allowed(viewId) {
  try {
    if (typeof window.businessModeAllows === 'function' && !window.businessModeAllows(viewId)) return false;
    if (typeof window.getCurrentUser === 'function' && window.getCurrentUser() && typeof window.hasAccess === 'function') {
      if (['workspaceView', 'masterView', 'profileView'].includes(viewId)) return true;
      return window.hasAccess(viewId);
    }
  } catch {}
  return true;
}

function orgInfo() {
  const cp = state.companyProfile || {};
  let name = cp.CompanyName || cp.name || '';
  try { if (!name) name = window.getCurrentOrg?.()?.name || ''; } catch {}
  return { name: name || 'My Company', logo: cp.logo || '', cp };
}
function user() {
  try { return (typeof window.getCurrentUser === 'function' && window.getCurrentUser()) || {}; } catch { return {}; }
}
const svg = {
  back: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/></svg>',
  chev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  go: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  dots: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
  search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  pin: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  cal: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  plus: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  copy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
};

/* ── App bar ──────────────────────────────────────────────────────────────── */

function currentProject() {
  return state.currentProjectId ? (state.projects || []).find(p => p.id === state.currentProjectId) : null;
}

export function renderAppBar(viewId) {
  const left = document.getElementById('tsbLeft');
  if (!left) return;
  const org = orgInfo();
  const u = user();
  const av = document.getElementById('tsbAvatar');
  if (av) av.textContent = SC.initials(u.name || u.username || org.name);
  if (SC.ROOT_VIEWS.includes(viewId)) {
    // Top-left: your profile (opens the profile menu), then the organisation.
    // Company logo (Settings → Company) first, then your photo, then initials.
    const pic = org.logo || u.photo;
    const me = pic ? `<img src="${esc(pic)}" alt="">` : esc(SC.initials(u.name || u.username || org.name));
    left.innerHTML = `<button type="button" class="tsb-me" onclick="window._shellDrawer()" aria-label="Profile menu" title="Profile menu">
        <span class="tsb-logo" data-keep-emoji>${me}</span></button>
      <button type="button" class="tsb-org" onclick="switchView('profileView')" title="Company profile">
      <span class="tsb-txt"><span class="tsb-cap" style="display:block">Company</span>
        <span class="tsb-title" style="display:flex;align-items:center;gap:6px">${esc(org.name)} ${svg.chev}</span></span>
    </button>`;
    return;
  }
  const proj = currentProject();
  let title = SC.viewTitle(viewId), sub = org.name;
  const sec = openSection(viewId);
  if (sec) title = sec;
  if (viewId === 'paymentsHubView' && window._pmtIsForm?.()) title = window._pmtFormTitle?.() || title;
  if (viewId === 'calcView' && window._calcTitle?.()) title = window._calcTitle();
  if (viewId === 'partiesLedgerView' && !state.currentSelectedParty && window._partyDrillTitle?.()) title = window._partyDrillTitle();
  if (viewId === 'projectDashboard' && proj) { title = proj.name || 'Project'; sub = ['Project Home', proj.location].filter(Boolean).join(' · '); }
  else if (proj && SC.tabOf(viewId) === 'projects') sub = proj.name || sub;
  left.innerHTML = `<button type="button" class="tsb-ic tsb-back" onclick="window._navBack()" aria-label="Back">${svg.back}</button>
    <div class="tsb-txt"><div class="tsb-title">${esc(title)}</div><div class="tsb-sub">${esc(sub)}</div></div>`;
}

/* ── Profile drawer (top-left avatar) ──────────────────────────────────────── */

export function openDrawer() {
  closeDrawer();
  const org = orgInfo(), u = user();
  const name = u.name || u.username || 'My account';
  let role = u.role || '';
  try { const r = window.getCurrentOrg?.()?._userRole; if (r) role = r; } catch {}
  const pic = u.photo || org.logo;
  const me = pic ? `<img src="${esc(pic)}" alt="">` : esc(SC.initials(name));
  const items = [
    ['🏠', 'Home', "switchView('projectsHome')"],
    ['🙂', 'My Profile', "switchView('profileView')"],
    ['👥', 'Roles & Access', "switchView('masterData')", 'masterData'],
    ['🏢', 'Company Settings', "switchView('settingsView')", 'settingsView'],
    ['⚙️', 'Setup', "switchView('masterView')"],
    ['💳', 'Subscription', "switchView('planBillingView')", 'planBillingView'],
    ['🧮', 'Engineer Tools', "switchView('calcView')"],
    ['🎧', 'Customer Support', 'window._shellSupport()'],
    ['💾', 'Backup (download)', 'window.exportJSONBackup&&window.exportJSONBackup()'],
    ['☁️', 'Cloud Sync', 'window._openSyncDoctor&&window._openSyncDoctor()'],
    ['🗑️', 'Recycle Bin', "switchView('recycleBinView')", 'recycleBinView'],
  ].filter(i => !i[3] || allowed(i[3]));
  document.body.insertAdjacentHTML('beforeend', `<div id="tsDrawer" class="ts-drawer-scrim" onclick="if(event.target===this)window._shellCloseDrawer()">
    <div class="ts-drawer" role="dialog" aria-label="Profile menu">
      <div class="ts-drawer-hd">
        <span class="ts-drawer-av" data-keep-emoji>${me}</span>
        <div style="flex:1;min-width:0"><b>${esc(name)}</b><small>${esc([role && String(role).replace(/^./, c => c.toUpperCase()), org.name].filter(Boolean).join(' · '))}</small></div>
        <button type="button" class="ts-kebab" title="Edit profile" onclick="window._shellCloseDrawer();switchView('profileView')">✎</button>
      </div>
      <nav class="ts-drawer-nav">${items.map(([ic, l, fn]) => `<button type="button" class="ts-drawer-it" onclick="window._shellCloseDrawer();${fn}"><span data-keep-emoji>${ic}</span>${l}</button>`).join('')}
        <button type="button" class="ts-drawer-it danger" onclick="window._shellCloseDrawer();window._rbacLogout&&window._rbacLogout()"><span data-keep-emoji>🚪</span>Logout</button>
      </nav>
      <div class="ts-drawer-ft">True Site Sync</div>
    </div></div>`);
}
export function closeDrawer() { document.getElementById('tsDrawer')?.remove(); }

function supportSheet() {
  openSheet('Customer Support', [
    { icon: '💬', title: 'WhatsApp us', desc: '+91 73835 03062', run: () => window.open('https://wa.me/917383503062', '_blank') },
    { icon: '📞', title: 'Call us', desc: '+91 73835 03062', run: () => { location.href = 'tel:+917383503062'; } },
    { icon: '📞', title: 'Call us', desc: '+91 70432 74323', run: () => { location.href = 'tel:+917043274323'; } },
    { icon: '🌐', title: 'Visit our website', desc: 'truesitesync.com', run: () => window.open('https://truesitesync.com', '_blank') },
  ]);
}

/* ── Options bottom-sheet ─────────────────────────────────────────────────── */

let _sheetActions = [];
/** items: [{ icon, title, desc, run, danger }] */
export function openSheet(title, items) {
  closeSheet();
  _sheetActions = items.map(i => i.run);
  const html = `<div id="tsSheet" class="ts-sheet-scrim" onclick="if(event.target===this)window._shellCloseSheet()">
    <div class="ts-sheet-wrap"><button type="button" class="ts-sheet-x" onclick="window._shellCloseSheet()" aria-label="Close">${svg.x}</button>
    <div class="ts-sheet" role="dialog" aria-label="${esc(title)}">
      <h3>${esc(title)}</h3>
      ${items.map((i, n) => `<button type="button" class="ts-opt ${i.danger ? 'danger' : ''}" onclick="window._shellSheetRun(${n})">
        <span class="ts-opt-ic" data-keep-emoji>${i.icon}</span><span><b>${esc(i.title)}</b>${i.desc ? `<small>${esc(i.desc)}</small>` : ''}</span></button>`).join('')}
    </div></div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}
export function closeSheet() { document.getElementById('tsSheet')?.remove(); }

/** Make sure a project is open before a project-level action; else ask which. */
function withProject(fn) {
  if (state.currentProjectId) { fn(); return; }
  const ps = (typeof window.getVisibleProjects === 'function' ? window.getVisibleProjects() : state.projects) || [];
  if (!ps.length) { window.showToast?.('Create a project first', 'info'); newProject(); return; }
  if (ps.length === 1) { window.openProject?.(ps[0].id); fn(); return; }
  openSheet('Select project', ps.map(p => ({
    icon: '🏗️', title: p.name || 'Project', desc: p.location || '',
    run: () => { window.openProject?.(p.id); fn(); },
  })));
}
function newProject() {
  const clients = state.clients || [];
  if (!clients.length) { window.showToast?.('Add the client first, then the project', 'info'); window.openClientModal?.(); return; }
  window.openProjectForm?.(null, clients.length === 1 ? clients[0].id : undefined);
}

function quickActions() {
  const acts = [
    { icon: '🏗️', title: 'Add New Project', desc: 'Create a project for this organization', run: newProject, view: 'projectsHome' },
    { icon: '🤝', title: 'Add New Client', desc: 'Add a client to put projects under', run: () => window.openClientModal?.(), view: 'projectsHome' },
    { icon: '📝', title: 'Daily Progress', desc: "Record today's site work", run: () => withProject(() => go('executionView')), view: 'executionView' },
    { icon: '🚚', title: 'Material Received', desc: 'Log a delivery (GRN) against a project', run: () => withProject(() => { go('inventoryView'); window._openInvSection?.('grn'); }), view: 'inventoryView' },
    { icon: '👷', title: 'Labour Attendance', desc: 'Mark present / absent / half day / OT', run: () => withProject(() => { go('labourView'); window._openLabourSection?.('markAtt'); }), view: 'labourView' },
    { icon: '👛', title: 'Petty Cash', desc: 'Add a site cash entry', run: () => go('pettyCashView'), view: 'pettyCashView' },
    { icon: '⬇️', title: 'Payment In', desc: 'Money received from a client', run: () => { go('paymentsHubView'); window._pmtSetMode?.('in'); }, view: 'paymentsHubView' },
    { icon: '⬆️', title: 'Payment Out', desc: 'Pay a vendor, labour or contractor', run: () => { go('paymentsHubView'); window._pmtSetMode?.('out'); }, view: 'paymentsHubView' },
  ];
  return acts.filter(a => allowed(a.view));
}

/* ── Projects home ────────────────────────────────────────────────────────── */

let _q = '', _chip = 'ongoing', _chipPicked = false;
const PALETTE = [['#efe9ff', '#6d28d9'], ['#e6f4ff', '#0b63c5'], ['#e8f8ef', '#15803d'], ['#fff2e5', '#c2410c'], ['#fdeef3', '#be185d'], ['#eef2f6', '#334155']];
const tint = (s) => { let h = 0; for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };

function ring(pct) {
  const r = 11, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  return `<svg width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="${r}" fill="none" stroke="#dbe3ef" stroke-width="3"/>
    <circle cx="14" cy="14" r="${r}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 14 14)"/></svg>`;
}

/** Render the project-first home into #tsProjects. */
export function renderProjectList() {
  const host = document.getElementById('tsProjects');
  if (!host) return;
  const all = (typeof window.getVisibleProjects === 'function' ? window.getVisibleProjects() : state.projects) || [];
  const clients = state.clients || [];
  const counts = SC.chipCounts(all);
  if (!_chipPicked && !counts[_chip] && counts.all) _chip = 'all';
  const list = SC.filterProjects(all, { q: _q, chip: _chip, clients }).slice().reverse();
  const chips = SC.PROJECT_CHIPS.filter(c => c.id === 'all' || c.id === 'ongoing' || c.id === 'completed' || counts[c.id])
    .map(c => `<button type="button" class="ts-chip ${_chip === c.id ? 'on' : ''}" onclick="window._shellChip('${c.id}')">${c.label}<b>${counts[c.id]}</b></button>`).join('');
  const cards = list.map(p => {
    const [bg, fg] = tint(p.name);
    const client = clients.find(c => c.id === p.clientId);
    const pct = SC.projectProgress(state, p);
    const b = SC.projectBucket(p);
    const tag = b === 'ongoing' ? '' : `<span class="ts-ptag" style="background:${b === 'completed' ? '#e8f8ef;color:#15803d' : b === 'hold' ? '#fff4e5;color:#b45309' : '#eef2ff;color:#4338ca'}">${esc(p.status)}</span>`;
    const where = [p.location, client && client.name].filter(Boolean).join(' · ');
    const dates = SC.dateRange(p);
    return `<div class="ts-pcard" onclick="openProject('${esc(p.id)}')">
      <div class="ts-pcard-top">
        <div class="ts-pav" style="background:${bg};color:${fg}">${esc(SC.initials(p.name))}</div>
        <div class="ts-pmeta"><div class="ts-pname">${esc(p.name || 'Project')}${tag}</div>
          ${where ? `<div class="ts-ploc">${svg.pin}<span style="overflow:hidden;text-overflow:ellipsis">${esc(where)}</span></div>` : ''}</div>
        <button type="button" class="ts-kebab" onclick="event.stopPropagation();window._shellProjectMenu('${esc(p.id)}')" aria-label="Project options">${svg.dots}</button>
      </div>
      <div class="ts-pcard-bot"><span class="ts-pdate">${dates ? svg.cal + ' ' + esc(dates) : `<span style="color:var(--ts-muted)">${esc(p.woNumber ? 'WO: ' + p.woNumber : 'No dates set')}</span>`}</span>
        <span class="ts-ring">${ring(pct)}${pct}%</span></div>
    </div>`;
  }).join('');
  const empty = !all.length
    ? `<div class="ts-empty"><div class="ts-emo" data-keep-emoji>🏗️</div><h3>No projects yet</h3><p style="margin-bottom:18px">Add your first client and project to get started.</p>
        <button type="button" class="ts-btn" onclick="window._shellNewProject()">+ Add New Project</button></div>`
    : `<div class="ts-empty"><div class="ts-emo" data-keep-emoji>🔍</div><h3>No project found</h3><p>Try another search or status.</p></div>`;
  const keepFocus = document.activeElement && document.activeElement.id === 'tsProjSearch';
  host.innerHTML = `<div class="ts-page">
    <div class="ts-search">${svg.search}<input id="tsProjSearch" type="search" placeholder="Search projects" value="${esc(_q)}" oninput="window._shellSearch(this.value)" autocomplete="off"></div>
    <div class="ts-chips">${chips}<button type="button" class="ts-chip" style="color:var(--ts-blue)" onclick="window._shellClients()">By client ›</button></div>
    ${list.length ? `<div class="ts-plist">${cards}</div>` : empty}
  </div>`;
  if (keepFocus) { const i = document.getElementById('tsProjSearch'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}

/* ── Tile grids ───────────────────────────────────────────────────────────── */

function tilesHTML(tiles) {
  return `<div class="ts-tiles">${tiles.map((t, n) => `<div class="ts-tile ${t.cls || ''}" role="button" tabindex="0"
      onclick="window._shellTile(${n})" onkeydown="if(event.key==='Enter')window._shellTile(${n})">
      ${t.count ? `<span class="ts-cnt">${t.count}</span>` : ''}
      <span class="ts-emo" data-keep-emoji>${t.icon}</span><span class="ts-lbl">${esc(t.label)}</span></div>`).join('')}</div>`;
}
let _tileRuns = [];
function sectionsHTML(sections) {
  _tileRuns = [];
  return sections.map(([title, tiles]) => {
    const vis = tiles.filter(t => !t.view || allowed(t.view)).filter(t => !t.when || t.when());
    if (!vis.length) return '';
    const base = _tileRuns.length;
    vis.forEach(t => _tileRuns.push(t.run || (() => go(t.view))));
    return (title ? `<div class="ts-sec">${esc(title)}</div>` : '') + tilesHTML(vis).replace(/_shellTile\((\d+)\)/g, (_, i) => `_shellTile(${base + +i})`);
  }).join('');
}

export function renderWorkspace() {
  const el = document.getElementById('workspaceView');
  if (!el) return;
  const shop = isShop();
  el.innerHTML = `<div class="ts-page">${sectionsHTML([
    // Sales & Purchase hold documents only (invoices, orders, bills). Money in/out
    // is recorded in Finance → Payments; the old Payment In/Out screens redirect there.
    ['Sales', [
      { icon: '🧾', label: 'Sale Invoices', view: 'salesLedgerView' },
      { icon: '📝', label: 'Estimates / Quotation', view: 'estimatesView' },
      { icon: '📄', label: 'Proforma Invoice', view: 'proformaInvoiceView' },
      { icon: '📋', label: 'Sale Orders', view: 'saleOrderView' },
      { icon: '🚚', label: 'Delivery Challan', view: 'deliveryChallanView' },
      { icon: '🔄', label: 'Sale Returns', view: 'saleReturnView' },
      { icon: '💰', label: 'Other Income', view: 'otherIncomeView' },
      { icon: '📒', label: 'Udhaar Book', view: 'creditBookView', when: () => shop },
    ]],
    ['Purchase', [
      { icon: '🛒', label: 'Purchase Bills', view: 'purchaseBillsView' },
      { icon: '📋', label: 'Purchase Orders', view: 'purchaseOrderView' },
      { icon: '💳', label: 'Expenses', view: 'expensesView' },
      { icon: '↩️', label: 'Purchase Returns', view: 'purchaseReturnView' },
      { icon: '🏗️', label: 'Fixed Assets', view: 'purchaseAssetsView' },
    ]],
    ['Finance', [
      { icon: '💸', label: 'Payments', view: 'paymentsHubView' },
      { icon: '🤝', label: 'Party', view: 'partiesLedgerView' },
      { icon: '🏦', label: 'Bank & Cash', view: 'accountsManagerView' },
      { icon: '🌊', label: 'Cash Flow', view: 'cashFlowView' },
      { icon: '💹', label: 'Cost & Profit', view: 'costProfitView' },
    ]],
    [shop ? 'Shop' : '', [
      { icon: '📦', label: 'Stock', view: 'inventoryView', when: () => shop },
      { icon: '🏷️', label: 'Items', view: 'itemsMasterView', when: () => shop },
      { icon: '🧬', label: 'Production (BOM)', view: 'itemsMasterView', when: () => shop && window.activeBusinessMode?.() === 'manufacturing', run: () => { go('itemsMasterView'); window.setItemCategoryFilter?.('Production Items'); } },
      { icon: '👷', label: window.modeTerm?.('labour') || 'Staff', view: 'labourView', when: () => shop },
      { icon: '👛', label: 'Petty Cash', view: 'pettyCashView', when: () => shop },
      { icon: '🔧', label: 'Tools', view: 'assetsView', when: () => shop },
      { icon: '🚜', label: 'Machines', view: 'equipmentView', when: () => shop },
    ]],
    ['Reports & insights', [
      { icon: '📈', label: 'Charts & Performance', view: 'analyticsView' },
      { icon: '📊', label: 'Reports', view: 'reportsView' },
    ]],
    ['Tools', [
      { icon: '🧮', label: 'Engineer Tools', view: 'calcView' },
      { icon: '📏', label: 'Unit Converter', run: () => window.openUnitConverter?.() },
    ]],
  ])}</div>`;
}

export function renderMaster() {
  const el = document.getElementById('masterView');
  if (!el) return;
  const superAdmin = () => { const n = document.getElementById('superAdminNav'); return !!(n && n.style.display !== 'none'); };
  el.innerHTML = `<div class="ts-page">${sectionsHTML([
    ['', [
      { icon: '🙂', label: 'My Profile', view: 'profileView' },
      { icon: '🤝', label: 'Clients', view: 'projectsHome', when: () => !isShop(), run: () => window._shellClients() },
      { icon: '📇', label: 'Parties', view: 'partiesLedgerView' },
      { icon: '🧱', label: 'Materials & Items', view: 'itemsMasterView' },
      { icon: '🏦', label: "Company's Bank A/C", view: 'accountsManagerView' },
      { icon: '👥', label: 'Team & Roles', view: 'masterData' },
      { icon: '⚙️', label: 'Settings', view: 'settingsView' },
      { icon: '💳', label: 'Subscription', view: 'planBillingView' },
      { icon: '🗑️', label: 'Recycle Bin', view: 'recycleBinView' },
      { icon: '🛡️', label: 'Admin Panel', view: 'superAdminView', when: superAdmin },
    ]],
  ])}</div>`;
}

/* ── Project home ─────────────────────────────────────────────────────────── */

const PROJECT_TILES = [
  { icon: '📊', label: 'Dashboard', view: 'analyticsView', cls: 'hl', run: () => { go('analyticsView'); window._setAnalyticsSite?.(state.currentProjectId); } },
  { icon: '📝', label: 'Daily Progress', view: 'executionView' },
  { icon: '👷', label: 'Attendance', view: 'labourView' },
  { icon: '📦', label: 'Manage Materials', view: 'inventoryView' },
  { icon: '🚜', label: 'Equipment Usage', view: 'equipmentView' },
  { icon: '💸', label: 'Payments', view: 'paymentsHubView' },
  { icon: '👛', label: 'Petty Cash', view: 'pettyCashView' },
  { icon: '⚠️', label: 'Issues & Snags', view: 'issuesView', count: (pid) => (state.issues || []).filter(i => i.projectId === pid && !['Solved', 'Closed', 'Resolved'].includes(i.status)).length },
  { icon: '📐', label: 'Measurement', view: 'measurementListView' },
  { icon: '🧾', label: 'RA Bills / Abstracts', view: 'abstractsView' },
  { icon: '🗓️', label: 'Planning', view: 'execEngineView' },
  { icon: '📅', label: 'Scheduling', view: 'scheduleBuilderView' },
  { icon: '📁', label: 'Drawings & Docs', view: 'documentsView' },
  { icon: '💬', label: 'Chat', view: 'chatView' },
  { icon: '🤝', label: 'Subcontractors', view: 'subcontractorsView' },
  { icon: '🔧', label: 'Tools & Assets', view: 'assetsView' },
  { icon: '🧪', label: 'Mix Design', view: 'recipeView' },
  { icon: '🏛️', label: 'Guarantees', view: 'guaranteesView' },
  { icon: '💳', label: 'WPS Salary', view: 'wpsView' },
  { icon: '📑', label: 'Reports', view: 'reportsView' },
  { icon: '🧮', label: 'Engineer Tools', view: 'calcView' },
];

export function renderProjectHome() {
  const proj = currentProject();
  const host = document.getElementById('projTiles');
  if (!proj || !host) return;
  const sum = document.getElementById('projDashKPIs');
  if (sum) {
    let a = null;
    try { a = computeAnalytics(state, proj.id); } catch {}
    const spent = a ? a.purchases + a.labour + a.expenses : 0;
    sum.innerHTML = a ? `<div title="${money(a.received)}"><b style="color:var(--ts-green)">${moneyShort(a.received)}</b><small>Received</small></div>
      <div title="${money(spent)}"><b style="color:var(--ts-red)">${moneyShort(spent)}</b><small>Spent</small></div>
      <div title="${money(a.outstanding)}"><b>${moneyShort(a.outstanding)}</b><small>To receive</small></div>` : '';
  }
  const tiles = PROJECT_TILES.map(t => ({ ...t, count: t.count ? t.count(proj.id) : 0 }));
  host.innerHTML = sectionsHTML([['', tiles]]);
}

/* ── Profile ──────────────────────────────────────────────────────────────── */

const SUPPORT = { phones: ['+917383503062', '+917043274323'], whatsapp: '917383503062', site: 'https://truesitesync.com' };

export function renderProfile() {
  const el = document.getElementById('profileView');
  if (!el) return;
  const org = orgInfo(), cp = org.cp, u = user();
  let role = u.role || '';
  try { const r = window.getCurrentOrg?.()?._userRole; if (r) role = r; } catch {}
  const copyRow = (ic, bg, label, val) => val ? `<div class="ts-row"><span class="ts-row-ic" style="background:${bg}" data-keep-emoji>${ic}</span>
      <span class="ts-row-tx"><small>${label}</small><b>${esc(val)}</b></span>
      <button type="button" class="ts-kebab" title="Copy" onclick="window._shellCopy(${esc(JSON.stringify(String(val)))})">${svg.copy}</button></div>` : '';
  const link = (ic, bg, title, desc, attrs) => `<${attrs.startsWith('href') ? 'a' : 'button type="button"'} class="ts-row" ${attrs}>
      <span class="ts-row-ic" style="background:${bg}" data-keep-emoji>${ic}</span>
      <span class="ts-row-tx"><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}</span><span class="ts-row-go">${svg.go}</span></${attrs.startsWith('href') ? 'a' : 'button'}>`;
  const logo = org.logo ? `<img src="${esc(org.logo)}" alt="">` : esc(SC.initials(org.name));
  const company = [
    copyRow('🏢', '#eef3ff', 'Company Name', org.name),
    copyRow('📞', '#e8f8ef', 'Mobile', cp.Phone),
    copyRow('✉️', '#fdeef3', 'Email', cp.Email),
    copyRow('🧾', '#e8f8ef', 'GSTIN', cp.GST),
    copyRow('🪪', '#fff2e5', 'Company PAN', cp.PAN),
    copyRow('📍', '#f3eefe', 'Address', cp.Address),
  ].join('') || `<div class="ts-row"><span class="ts-row-tx"><small>No company details yet — tap ✎ to add them.</small></span></div>`;
  el.innerHTML = `<div class="ts-page" style="max-width:720px">
    <div class="ts-prof-hd">
      <div class="ts-prof-logo" data-keep-emoji>${logo}</div>
      <h2>${esc(org.name)}</h2>
      ${role ? `<span class="ts-role">${esc(String(role).replace(/^./, c => c.toUpperCase()))}</span>` : ''}
      <div style="color:var(--ts-muted);font-size:14px;margin-top:4px">${esc(u.name || u.username || '')}${u.email && u.email !== u.username ? ' · ' + esc(u.email) : ''}</div>
    </div>
    <div class="ts-card"><div class="ts-card-h">Company information
      <button type="button" class="ts-kebab" title="Edit" onclick="switchView('settingsView')" style="color:var(--ts-blue)">✎</button></div>${company}</div>
    <div class="ts-card"><div class="ts-card-h">Subscription &amp; data</div>
      ${link('💳', '#eef3ff', 'Subscription', 'Plan, usage &amp; billing', `onclick="switchView('planBillingView')"`)}
      ${link('☁️', '#e8f8ef', 'Cloud sync', 'Sync status &amp; force sync', `onclick="window._openSyncDoctor&&window._openSyncDoctor()"`)}
      ${link('👥', '#f3eefe', 'Team &amp; roles', 'Invite people, set permissions', `onclick="switchView('masterData')"`)}
      ${link('🗑️', '#fdeef3', 'Recycle bin', 'Restore deleted records', `onclick="switchView('recycleBinView')"`)}
    </div>
    <div class="ts-card"><div class="ts-card-h">Help &amp; support</div>
      ${link('💬', '#e8f8ef', 'WhatsApp us', '+91 73835 03062', `href="https://wa.me/${SUPPORT.whatsapp}" target="_blank" rel="noopener"`)}
      ${SUPPORT.phones.map(p => link('📞', '#eef3ff', 'Call us', p.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2'), `href="tel:${p}"`)).join('')}
      ${link('🌐', '#f3eefe', 'Visit our website', SUPPORT.site.replace('https://', ''), `href="${SUPPORT.site}" target="_blank" rel="noopener"`)}
    </div>
    <div class="ts-card"><div class="ts-card-h danger">Danger zone</div>
      <button type="button" class="ts-row" onclick="window._rbacLogout&&window._rbacLogout()">
        <span class="ts-row-ic" style="background:#fdecea" data-keep-emoji>🚪</span>
        <span class="ts-row-tx"><b class="red">Log out</b><small>Sign out of this device</small></span><span class="ts-row-go">${svg.go}</span></button>
    </div>
    <div style="text-align:center;color:var(--ts-muted);font-size:13px;padding:6px 0 20px"><b style="color:var(--ts-ink2)">True Site Sync</b></div>
  </div>`;
}

/* ── View hook (called by switchView) ─────────────────────────────────────── */

export function onView(viewId) {
  document.body.classList.toggle('ts-root', SC.ROOT_VIEWS.includes(viewId));
  const more = document.getElementById('tsbMore');
  if (more) more.style.display = viewId === 'projectDashboard' && state.currentProjectId ? '' : 'none';
  renderAppBar(viewId);
  if (viewId === 'workspaceView') renderWorkspace();
  if (viewId === 'masterView') renderMaster();
  if (viewId === 'profileView') renderProfile();
  if (viewId === 'calcView') { if (!window.__navBack) window._calcClose?.(); else window.renderCalcTools?.(); }
  wrapSections();
  if (viewId === 'equipmentView') renderEquipSummary();
  // Party / Payments open on their list unless a caller asks for a detail / form right after.
  if (viewId === 'partiesLedgerView' && !window.__navBack) { state.currentSelectedParty = null; window._partyDrillReset?.(); }
  if (viewId === 'paymentsHubView' && !window.__navBack) window._pmtShowList?.(false);
  syncFab(viewId);
  const lbl = document.getElementById('sbProjectsLbl');
  if (lbl) lbl.textContent = isShop() ? 'Home' : 'Sites';
}

/* ── Module sections (tile grid → section in place) ─────────────────────── */

// Each module opens its sections in place; the app bar shows the section name
// and Back closes the section before leaving the module.
const SECTIONS = {
  labourView: { grid: 'labHomeWrap', fn: '_openLabourSection', titles: { markAtt: 'Mark Attendance', sheet: 'Monthly Attendance', master: 'All Labour', contractors: 'Contractors / Gangs', piecerate: 'Piece-Rate Work' } },
  inventoryView: { grid: 'invTiles', fn: '_openInvSection', titles: { stock: 'Current Inventory', stores: 'Central Store', grn: 'Material Received', grnregister: 'GRN Register', gang: 'Material Issue', tools: 'Tools', transfer: 'Material Transfer', audit: 'Physical Audit', statement: 'Stock Register' } },
  equipmentView: { grid: 'eqTiles', fn: '_openEquipSection', titles: { fleet: 'Equipment List', log: 'Usage Entry', activity: 'Usage History', fuel: 'Fuel' } },
};
const _openSec = {};
function wrapSections() {
  Object.entries(SECTIONS).forEach(([view, d]) => {
    const orig = window[d.fn];
    if (typeof orig !== 'function' || orig.__shell) return;
    const w = function (sec, ...rest) {
      _openSec[view] = sec || null;
      const r = orig.call(this, sec, ...rest);
      if (window.__currentViewId === view) { renderAppBar(view); syncFab(view); }
      return r;
    };
    w.__shell = true;
    window[d.fn] = w;
  });
}
/** Title of the open section of a module view, or null. */
function openSection(viewId) {
  const d = SECTIONS[viewId];
  if (!d) return null;
  const g = document.getElementById(d.grid);
  if (!g || g.style.display !== 'none') return null;
  return d.titles[_openSec[viewId]] || SC.viewTitle(viewId);
}
/** Back pressed: close an open section first. true = handled. */
export function closeSection() {
  if (document.getElementById('tsDrawer')) { closeDrawer(); return true; }
  if (document.getElementById('tsSheet')) { closeSheet(); return true; }
  const v = window.__currentViewId;
  const d = SECTIONS[v];
  if (d && openSection(v)) { window[d.fn]?.(null); return true; }
  // Execution: DPR / Pour Card / Quality / Safety / Staff → back to the Execution menu
  if (v === 'executionView' && window._exSection?.() !== 'home') { window._exOpen?.('home'); return true; }
  if (v === 'pettyCashView' && window._pcIsOpen?.()) { window._pcOpen?.(null); renderAppBar(v); syncFab(v); return true; }
  if (v === 'partiesLedgerView' && state.currentSelectedParty) { window._partyBack?.(); return true; }
  // Receivable / Payable drill-down list → back to the party list
  if (v === 'partiesLedgerView' && window._partyDrillOpen?.()) { window._partyDrill(null); return true; }
  if (v === 'calcView' && window._calcIsOpen?.()) { window._calcClose?.(); return true; }
  if (v === 'paymentsHubView' && window._pmtIsForm?.()) { window._pmtShowList?.(); renderAppBar(v); return true; }
  return false;
}

/* ── Floating + per screen ─────────────────────────────────────────────────── */

const FAB = {
  projectsHome: () => !isShop() && (() => openSheet('Options', quickActions())),
  labourView: () => !openSection('labourView') && (() => window.labourOptionsSheet?.()),
  inventoryView: () => !openSection('inventoryView') && invSheet,
  equipmentView: () => !openSection('equipmentView') && eqAddSheet,
  pettyCashView: () => !window._pcIsOpen?.() && (() => window.pettyOptionsSheet?.()),
  partiesLedgerView: () => !state.currentSelectedParty && !window._partyDrillOpen?.() && (() => window._addPartyChooser?.()),
};
let _fabRun = null;
function syncFab(viewId) {
  const f = FAB[viewId] ? FAB[viewId]() : null;
  _fabRun = typeof f === 'function' ? f : null;
  let fab = document.getElementById('tsFab');
  if (_fabRun && !fab) {
    document.body.insertAdjacentHTML('beforeend', `<button type="button" id="tsFab" class="ts-fab no-print" aria-label="Options" onclick="window._shellFab()">${svg.plus}</button>`);
    fab = document.getElementById('tsFab');
  }
  if (fab) fab.classList.toggle('on', !!_fabRun);
}

function invSheet() {
  openSheet('Material Options', [
    { icon: '🚚', title: 'Material Received', desc: 'Log a delivery (GRN) against this project', run: () => window._openInvSection?.('grn') },
    { icon: '🧱', title: 'Material Issue', desc: 'Issue material to a gang / activity', run: () => window._openInvSection?.('gang') },
    { icon: '🔄', title: 'Material Transfer', desc: 'Send stock to another site', run: () => window._openInvSection?.('transfer') },
    { icon: '🧾', title: 'Purchase Order', desc: 'Raise a PO to a vendor', run: () => go('purchaseOrderView') },
    { icon: '📦', title: 'Adjust stock', desc: 'Opening stock or a manual correction', run: () => window._openInvSection?.('stock') },
  ]);
}

function eqAddSheet() {
  const add = (own) => {
    window.openEquipmentModal?.();
    const sel = document.getElementById('eqOwnership');
    if (sel) { sel.value = own; try { window._eqToggleRental?.(); } catch {} sel.dispatchEvent(new Event('change')); }
  };
  openSheet('Select Equipment Type', [
    { icon: '🏗️', title: 'Company Owned', desc: 'Machines and vehicles you own', run: () => add('OWNED') },
    { icon: '🤝', title: 'Rented', desc: 'Hired by the hour, day or month — rent is worked out for you', run: () => add('RENTED') },
    { icon: '📝', title: 'Usage entry', desc: 'Hours, fuel or movement for a machine', run: () => window._openEquipSection?.('log') },
  ]);
}

function renderEquipSummary() {
  const el = document.getElementById('equipSummary');
  if (!el) return;
  const list = (state.equipmentList || []).filter(e => !e.projectId || e.projectId === state.currentProjectId);
  const rented = list.filter(e => e.ownership === 'RENTED').length;
  const today = new Date().toISOString().slice(0, 10);
  const used = new Set((state.equipmentLogs || []).filter(l => l.date === today && list.some(e => e.id === (l.equipmentId || l.assetId))).map(l => l.equipmentId || l.assetId)).size;
  el.innerHTML = `<div class="tsp-sum" style="margin-bottom:14px"><div><b>${list.length - rented}</b><small>Company owned</small></div>
    <div><b style="color:#7c3aed">${rented}</b><small>Rented</small></div><div><b style="color:var(--ts-green)">${used}</b><small>Used today</small></div></div>`;
}

if (typeof window !== 'undefined') {
  window.shellSheet = openSheet;
  window._shellDrawer = openDrawer;
  window._shellCloseDrawer = closeDrawer;
  window._shellSupport = supportSheet;
  window.shellCloseSection = closeSection;
  window.shellSectionChanged = () => { const v = window.__currentViewId; renderAppBar(v); syncFab(v); };
  window._shellFab = () => { try { _fabRun?.(); } catch (e) { console.warn(e); } };
  window._eqAddSheet = eqAddSheet;
  window.shellOnView = onView;
  window.shellTabOf = SC.tabOf;
  window.renderShellProjects = renderProjectList;
  window.renderShellProjectHome = renderProjectHome;
  window._shellCloseSheet = closeSheet;
  window._shellSheetRun = (n) => { const f = _sheetActions[n]; closeSheet(); try { f?.(); } catch (e) { console.warn(e); } };
  window._shellTile = (n) => { try { _tileRuns[n]?.(); } catch (e) { console.warn(e); } };
  window._shellOptions = () => openSheet('Options', quickActions());
  wrapSections();
  window._shellNewProject = newProject;
  window._shellChip = (c) => { _chip = c; _chipPicked = true; renderProjectList(); };
  window._shellSearch = (q) => { _q = q; renderProjectList(); };
  window._shellClients = () => { window.showClientsList?.(); };
  window._shellChat = () => withProject(() => go('chatView'));
  window._shellCopy = (t) => {
    try { navigator.clipboard.writeText(t); window.showToast?.('Copied', 'success'); } catch { window.showToast?.(t, 'info'); }
  };
  window._shellProjectMenu = (pid) => {
    const p = (state.projects || []).find(x => x.id === pid);
    if (!p) return;
    openSheet(p.name || 'Project', [
      { icon: '📂', title: 'Open project', desc: 'Go to project home', run: () => window.openProject?.(pid) },
      { icon: '✏️', title: 'Edit project', desc: 'Name, client, dates, BOQ / PO, team', run: () => window.openProjectForm?.(pid) },
      { icon: '🗑️', title: 'Delete project', desc: 'Moves it to the Recycle Bin', danger: true, run: () => window.deleteProject?.(pid) },
    ]);
  };
}
