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

/* ───────────────────────── Back navigation ───────────────────────── */

/** Return the top-most visible modal/overlay element, or null. */
function topVisibleModal() {
  const nodes = document.querySelectorAll('[id$="Modal"], [id$="Overlay"], .modal-backdrop');
  let best = null, bestZ = -1;
  nodes.forEach(el => {
    if (el.id === 'mobileOverlay') return;            // handled as the drawer scrim
    if (el.classList.contains('hidden') || el.classList.contains('hide')) return;
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return;
    if (getComputedStyle(el).display === 'none') return;
    const z = parseInt(getComputedStyle(el).zIndex) || 0;
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

  // 4. Pop the view history
  if (window.__viewHistory && window.__viewHistory.length) { goBackView(); return true; }

  // 5. At the root → press-back-again-to-exit
  const now = Date.now();
  if (now - _lastBack < 2000) {
    if (isNativeApp()) { try { window.Capacitor.Plugins.App.exitApp(); } catch {} }
    return true;
  }
  _lastBack = now;
  if (typeof window.showToast === 'function') window.showToast('Press back again to exit', 'info');
  return true;
}

/** Navigate to the previous view in history without re-pushing it. */
export function goBackView() {
  const hist = window.__viewHistory || [];
  const prev = hist.pop();
  if (!prev) return;
  window.__navBack = true;
  if (typeof window.switchView === 'function') window.switchView(prev);
}

/* ───────────────────────── Bottom navigation ───────────────────────── */

// The bottom bar is CONTEXT-AWARE. Icons are EMOJI (not FontAwesome) — app.html
// never loads FA and the APK runs offline, so emoji are the only glyphs that
// always render.
//
// Inside an open project → project modules (Labour/Inventory/Equipment need a
// project). Everywhere else (home / all-projects / business ledgers) → the
// business-level shortcuts, so the project items never sit dead on a screen
// with no project.
const PROJECT_NAV = [
  { id: 'home',      label: 'Home',      icon: '🏠', action: () => navTo('projectsHome') },
  { id: 'labour',    label: 'Labour',    icon: '👷', action: () => navTo('labourView') },
  { id: 'add',       label: 'Menu',      icon: '+',  fab: true, action: () => openDrawer() },
  { id: 'inventory', label: 'Inventory', icon: '📦', action: () => navTo('inventoryView') },
  { id: 'equipment', label: 'Equipment', icon: '🚚', action: () => navTo('equipmentView') },
];
const GLOBAL_NAV = [
  { id: 'home',     label: 'Home',     icon: '🏠', action: () => navTo('projectsHome') },
  { id: 'sales',    label: 'Sales',    icon: '🧾', action: () => navTo('salesLedgerView') },
  { id: 'add',      label: 'Menu',     icon: '+',  fab: true, action: () => openDrawer() },
  { id: 'purchase', label: 'Purchase', icon: '🛒', action: () => navTo('purchaseBillsView') },
  { id: 'reports',  label: 'Reports',  icon: '📊', action: () => navTo('reportsView') },
];

// Views that live INSIDE a project → show the project bar.
const PROJECT_VIEWS = new Set([
  'projectDashboard','planningView','microPlanView','issuesView','executionView',
  'labourView','equipmentView','inventoryView','recipeView','assetsView',
  'measurementListView','abstractsView','pettyCashView','documentsView','entrySheet',
]);
function currentNav() {
  return PROJECT_VIEWS.has(window.__currentViewId || '') ? PROJECT_NAV : GLOBAL_NAV;
}

function navTo(viewId) {
  if (typeof window.switchView === 'function') window.switchView(viewId);
}
function openDrawer() {
  document.getElementById('appSidebar')?.classList.add('mobile-open');
  document.getElementById('mobileOverlay')?.classList.add('active');
}

let _navMode = null; // 'project' | 'global' — which item set is currently rendered
function buildBottomNav() {
  const items = currentNav();
  const mode = items === PROJECT_NAV ? 'project' : 'global';
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
           <span class="mbn-ico">${item.icon}</span><span>${item.label}</span>
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
  const map = {
    home: ['projectsHome', 'projectDashboard'],
    labour: ['labourView'],
    inventory: ['inventoryView'],
    equipment: ['equipmentView'],
    sales: ['salesLedgerView','estimatesView','proformaInvoiceView','paymentInView','saleOrderView','deliveryChallanView','saleReturnView','saleFixedAssetsView','otherIncomeView','billingView'],
    purchase: ['purchaseBillsView','paymentOutView','expensesView','purchaseOrderView','purchaseReturnView','purchaseAssetsView','vendorView'],
    reports: ['reportsView','analyticsView'],
  };
  document.querySelectorAll('#mobileBottomNav .mbn-item').forEach(btn => {
    const ids = map[btn.dataset.nav] || [];
    btn.classList.toggle('active', ids.includes(v));
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
      history.pushState({ mShell: true }, '');
      window.addEventListener('popstate', () => {
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
}

// Auto-init once the DOM is ready (app.js also calls initMobileShell after boot).
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initMobileShell, 0));
  } else {
    setTimeout(initMobileShell, 0);
  }
}
