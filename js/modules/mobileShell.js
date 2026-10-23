/**
 * mobileShell.js — Native-app shell for the Android (Capacitor) build and the
 * mobile web/PWA experience. Adds:
 *   1. Hardware/back-gesture handling (Capacitor App plugin + browser popstate)
 *   2. A bottom navigation bar (mobile only)
 *   3. Safe-area (notch / status bar / gesture bar) handling
 *   4. Back-aware modal & drawer dismissal
 *
 * Desktop/web ≥769px is unaffected — the bottom bar hides via CSS and the back
 * handler is a no-op there (no hardware back button).
 */

const MOBILE_BP = 768;

function isMobileViewport() {
  return window.innerWidth <= MOBILE_BP || isNativeApp();
}
function isNativeApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

/* ─────────────────── Back HIERARCHY (not flat history) ───────────────────
 * Back should walk the menu tree — a leaf view goes up to its hub/section, a
 * hub goes to Home — instead of replaying whatever screens were opened recently.
 * Every view maps to its parent; anything unlisted falls back to Home.
 */
const HOME_VIEW = 'projectsHome';

const _childrenOf = {
  // Home's direct children (hubs + top-level views)
  [HOME_VIEW]: ['projectDashboard', 'workspaceView', 'masterView'],
  // Workspace tab
  workspaceView: [
    'analyticsView', 'reportsView', 'paymentsHubView', 'salesHubView', 'purchaseHubView', 'financeHubView',
    'creditBookView',
  ],
  // Master tab
  masterView: ['profileView', 'systemHubView', 'superAdminView'],
  // Inside an open project
  projectDashboard: [
    'planningView', 'microPlanView', 'execEngineView', 'scheduleBuilderView', 'executionView',
    'issuesView', 'chatView', 'labourView', 'equipmentView', 'assetsView', 'inventoryView',
    'recipeView', 'measurementListView', 'abstractsView', 'pettyCashView', 'documentsView',
    'clientDashboardView', 'savedSheets', 'billingView',
  ],
  measurementListView: ['entrySheet'],
  // Sales
  salesHubView: [
    'salesLedgerView', 'saleOrderView', 'proformaInvoiceView', 'deliveryChallanView',
    'estimatesView', 'estimationView', 'paymentInView', 'saleReturnView', 'otherIncomeView',
    'saleFixedAssetsView',
  ],
  // Purchase
  purchaseHubView: [
    'purchaseBillsView', 'purchaseOrderView', 'paymentOutView', 'purchaseReturnView',
    'expensesView', 'purchaseAssetsView', 'vendorView',
  ],
  // Finance
  financeHubView: ['partiesLedgerView', 'accountsManagerView', 'cashFlowView', 'costProfitView'],
  // (Workspace / Master tiles that open a leaf directly come back to their tab — see parentOf)
  // System / masters
  systemHubView: ['itemsMasterView', 'masterData', 'planBillingView', 'settingsView', 'recycleBinView'],
};

// Invert the children map into a view → parent lookup (built once).
const VIEW_PARENT = (() => {
  const m = {};
  for (const parent in _childrenOf) for (const child of _childrenOf[parent]) m[child] = parent;
  return m;
})();

/** The logical parent of a view for Back, or null at the root. */
// Leaves opened straight from a Workspace / Master tile (not via a hub) go back
// to that tab instead of the hub they nominally sit under.
let _tabOrigin = null; // { view, tab }
function parentOf(viewId) {
  if (!viewId || viewId === HOME_VIEW || viewId === 'bizHomeView') return null;
  if (viewId === 'workspaceView' || viewId === 'masterView') return HOME_VIEW;
  if (_tabOrigin && _tabOrigin.view === viewId) return _tabOrigin.tab;
  // Project modules return to the project's home while a project is open
  if (PROJECT_VIEWS.has(viewId) && viewId !== 'projectDashboard' && window.state?.currentProjectId) return 'projectDashboard';
  return VIEW_PARENT[viewId] || HOME_VIEW;
}
// switchView reports every navigation; remember when a leaf was opened from a tab.
if (typeof window !== 'undefined') {
  window.__noteNav = function (from, to) {
    if (from === 'workspaceView' || from === 'masterView') {
      if (to !== from && VIEW_PARENT[to] !== from) _tabOrigin = { view: to, tab: from };
    } else if (_tabOrigin && _tabOrigin.view !== to && !window.__navBack) {
      // moving deeper keeps the origin only for the leaf itself
      if (from !== _tabOrigin.view) _tabOrigin = null;
    }
  };
}

/* ───────────────────────── Back navigation ───────────────────────── */

/** Return the top-most visible modal/overlay element, or null. */
function topVisibleModal() {
  const nodes = document.querySelectorAll('[id$="Modal"], [id$="Overlay"], .modal-backdrop');
  let best = null, bestZ = -1;
  nodes.forEach(el => {
    if (el.id === 'mobileOverlay') return;            // handled as the drawer scrim
    if (el.classList.contains('hidden') || el.classList.contains('hide')) return;
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
    // Zero-size element = not actually on screen (a hidden panel that lost its
    // .hidden class), so it must not swallow the Back press.
    if (el.offsetWidth === 0 && el.offsetHeight === 0 && el.getClientRects().length === 0) return;
    const z = parseInt(cs.zIndex) || 0;
    if (z >= bestZ) { bestZ = z; best = el; }
  });
  return best;
}

function sidebarOpen() {
  const sb = document.getElementById('appSidebar');
  return sb && sb.classList.contains('mobile-open');
}
function closeSidebar() {
  document.getElementById('appSidebar')?.classList.remove('mobile-open');
  document.getElementById('mobileOverlay')?.classList.remove('active');
}

let _lastBack = 0;

/**
 * Unified back handler. Priority:
 *   modal → drawer → fullscreen sheet → view history → exit (double-press).
 * Returns true if it handled the event (caller should preventDefault).
 */
export function handleBack() {
  // 1. Close the top-most open modal
  const modal = topVisibleModal();
  if (modal) {
    modal.classList.add('hidden');
    return true;
  }
  // 2. Close the slide-in sidebar drawer
  if (sidebarOpen()) { closeSidebar(); return true; }

  // 3. Leave a full-screen sheet (e.g. measurement entry)
  const sheet = document.querySelector('.fullscreen-sheet');
  if (sheet) { goBackView(); return true; }

  // 4. Walk UP the menu tree: leaf → its hub/section → Home.
  if (parentOf(window.__currentViewId)) { goBackView(); return true; }

  // 5. At the root (Home) → press-back-again-to-exit
  const now = Date.now();
  if (now - _lastBack < 2000) {
    if (isNativeApp()) { try { window.Capacitor.Plugins.App.exitApp(); } catch {} }
    return true;
  }
  _lastBack = now;
  if (typeof window.showToast === 'function') window.showToast('Press back again to exit', 'info');
  return true;
}

/** Go UP one level in the menu tree (leaf → hub → Home), not back through history. */
export function goBackView() {
  const cur = window.__currentViewId || '';
  let target = parentOf(cur);
  if (!target) return;                                   // already at Home
  // If a mapped parent section doesn't exist in the DOM, fall back to Home.
  if (target !== HOME_VIEW && !document.getElementById(target)) target = HOME_VIEW;
  window.__navBack = true;
  if (typeof window.switchView === 'function') window.switchView(target);
}

/* ───────────────────────── Bottom navigation ───────────────────────── */

// Three tabs — Projects · Workspace · Master — the same on every screen.
// Icons are inline SVG (app.html never loads an icon font; the APK runs offline).
const ICON = {
  projects: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.2 2.8 11h2.7v9h5v-6h3v6h5v-9h2.7z"/></svg>',
  workspace: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2"/></svg>',
  master: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="6" y="3.5" width="14" height="16" rx="1.5"/><path d="M3.5 7v13.5H17"/><path d="M9.5 8h7M9.5 11.5h7M9.5 15h4"/></svg>',
};
// Three tabs, same as the desktop sidebar (appShell.js renders the tab pages).
const TABS = [
  { id: 'projects',  label: 'Projects',  icon: ICON.projects,  action: () => navTo('projectsHome') },
  { id: 'workspace', label: 'Workspace', icon: ICON.workspace, action: () => navTo('workspaceView') },
  { id: 'master',    label: 'Master',    icon: ICON.master,    action: () => navTo('masterView') },
];
// Views that live INSIDE a project → show the project bar.
const PROJECT_VIEWS = new Set([
  'projectDashboard','planningView','microPlanView','execEngineView','scheduleBuilderView','issuesView','executionView',
  'labourView','equipmentView','inventoryView','recipeView','assetsView',
  'measurementListView','abstractsView','pettyCashView','documentsView','entrySheet',
]);
function currentNav() { return TABS; }

function navTo(viewId) {
  if (typeof window.switchView === 'function') window.switchView(viewId);
}

let _navMode = null; // 'construction' | 'shop' — first tab reads Projects / Home
function buildBottomNav() {
  const items = currentNav();
  const shop = typeof window.activeBusinessMode === 'function' && window.activeBusinessMode() !== 'construction';
  const mode = shop ? 'shop' : 'construction';
  const existing = document.getElementById('mobileBottomNav');
  if (existing && _navMode === mode) return; // right bar already up
  _navMode = mode;
  const nav = existing || document.createElement('nav');
  nav.id = 'mobileBottomNav';
  nav.className = 'mobile-bottom-nav no-print';
  nav.innerHTML = items.map(item =>
    item.fab
      ? `<button type="button" class="mbn-item mbn-fab" data-nav="${item.id}" aria-label="${item.label}">
           <span class="mbn-fab-circle">${item.icon}</span>
         </button>`
      : `<button type="button" class="mbn-item" data-nav="${item.id}" aria-label="${item.label}">
           <span class="mbn-ico">${item.icon}</span><span>${item.id === 'projects' && shop ? 'Home' : item.label}</span>
         </button>`).join('');
  if (!existing) document.body.appendChild(nav);
  nav.querySelectorAll('.mbn-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = items.find(i => i.id === btn.dataset.nav);
      item?.action();
      highlightBottomNav();
    });
  });
}

/** Swap the bar to the right context, then mark the active item. */
function highlightBottomNav() {
  buildBottomNav(); // rebuilds if the project↔global context changed
  const v = window.__currentViewId || '';
  const tab = typeof window.shellTabOf === 'function' ? window.shellTabOf(v) : 'projects';
  document.querySelectorAll('#mobileBottomNav .mbn-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.nav === tab);
  });
}

/* ───────────────────────── Safe areas / status bar ───────────────────────── */

async function setupStatusBar() {
  const SB = window.Capacitor?.Plugins?.StatusBar;
  if (!SB) return;
  try {
    await SB.setOverlaysWebView({ overlay: false });
    await SB.setBackgroundColor({ color: '#0f172a' });
    if (SB.setStyle) await SB.setStyle({ style: 'LIGHT' }); // light icons on dark bar
  } catch {}
}

/* ───────────────────────── Init ───────────────────────── */

let _inited = false;
export function initMobileShell() {
  if (_inited) return;
  _inited = true;

  // Bottom nav (CSS keeps it hidden on ≥769px)
  buildBottomNav();
  highlightBottomNav();

  // Hardware back button (Capacitor)
  const App = window.Capacitor?.Plugins?.App;
  if (App && App.addListener) {
    App.addListener('backButton', () => { handleBack(); });
  }

  // Browser / PWA back: keep one extra history entry to intercept
  if (!isNativeApp()) {
    try {
      // Android WebView/Chrome fire a spurious `popstate` when a native <select>
      // dropdown is opened & dismissed. Without this guard the app treats that as
      // a Back press and jumps to the previous screen. Record the last <select>
      // interaction and ignore any popstate that lands right after one.
      let _selectGuardTs = 0;
      ['focusin', 'change', 'mousedown', 'touchstart'].forEach(ev =>
        document.addEventListener(ev, (e) => {
          if (e.target && e.target.tagName === 'SELECT') _selectGuardTs = Date.now();
        }, true));
      history.pushState({ mShell: true }, '');
      window.addEventListener('popstate', () => {
        if (Date.now() - _selectGuardTs < 1200) {
          // Spurious popstate from a dropdown dismiss — stay on the page, re-arm.
          history.pushState({ mShell: true }, '');
          return;
        }
        const handled = handleBack();
        // Re-arm so the next back press is also caught
        if (handled) history.pushState({ mShell: true }, '');
      });
    } catch {}
  }

  setupStatusBar();

  window.addEventListener('resize', () => highlightBottomNav());
}

// Expose for inline handlers / app.js boot
if (typeof window !== 'undefined') {
  window.initMobileShell = initMobileShell;
  window.handleAppBack = handleBack;
  window.goBackView = goBackView;
  window.highlightBottomNav = highlightBottomNav;
  // Generic "back" for in-view back buttons: go UP one level in the menu tree
  // (leaf → hub → Home), matching the hardware back button.
  window._navBack = function () {
    if (parentOf(window.__currentViewId)) goBackView();
    else if (typeof window.switchView === 'function') window.switchView(HOME_VIEW);
  };
}

// Auto-init once the DOM is ready (app.js also calls initMobileShell after boot).
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initMobileShell, 0));
  } else {
    setTimeout(initMobileShell, 0);
  }
}
