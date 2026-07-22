import { syncPush, syncPullAll, syncPushAll, registerStorageKeys, getLocalKeyTs, setLocalKeyTs, markSyncReady, seedSyncBaseline, hasPendingPush } from '../database/sync.js';

const STORAGE_KEYS = {
  clients: 'mes_clients',
  items: 'mes_items',
  accounts: 'mes_accounts',
  estimates: 'mes_estimates',
  sheets: 'mes_sheets',
  abstracts: 'mes_abstracts',
  raBills: 'mes_ra_bills',
  recycleBin: 'mes_recycle_bin',
  invoices: 'mes_invoices',
  paymentsIn: 'mes_pay_in',
  expenses: 'mes_exp',
  vendors: 'mes_vendors',
  vendorMaterials: 'mes_ven_mat',
  vendorPayments: 'mes_ven_pay',
  rawMaterials: 'mes_raw_materials',
  units: 'mes_units',
  recipes: 'mes_recipes',
  inventoryTx: 'mes_inv_tx',
  locations: 'mes_locations',
  itemTransfers: 'mes_item_transfers',
  maintenanceLogs: 'mes_maintenance',
  labourMaster: 'mes_labourMaster',
  attendanceLogs: 'mes_attendance',
  companyProfile: 'mes_companyProfile',
  equipmentList: 'mes_equipment',
  equipmentLogs: 'mes_equipmentLogs',
  labourSalaries: 'mes_labour_salaries',
  labourPayments: 'mes_labour_payments',
  purchaseOrders: 'mes_purchase_orders',
  purchaseReturns: 'mes_purchase_returns',
  fixedAssets: 'mes_fixed_assets',
  saleInvoices: 'mes_sale_invoices',
  proformaInvoices: 'mes_proforma_invoices',
  saleOrders: 'mes_sale_orders',
  deliveryChallans: 'mes_delivery_challans',
  saleReturns: 'mes_sale_returns',
  saleFixedAssets: 'mes_sale_fixed_assets',
  otherIncome: 'mes_other_income',
  itemsMaster: 'mes_items_master',
  itemCategories: 'mes_item_categories',
  savedPOs: 'mes_saved_pos',
  projects: 'mes_projects',
  bbsData: 'mes_bbs_data',
  sheetAttachments: 'mes_sheet_attachments',
  projectDocs: 'mes_project_docs',
  leads: 'mes_leads',
  tenders: 'mes_tenders',
  cubeTests: 'mes_cube_tests',
  ncrReports: 'mes_ncr_reports',
  incidents: 'mes_incidents',
  ppeChecks: 'mes_ppe_checks',
  equipUtilization: 'mes_equip_utilization',
  dailyProgress: 'mes_daily_progress',
  milestones: 'mes_milestones',
  qualityChecks: 'mes_quality_checks',
  concretePours: 'mes_concrete_pours',
  planningTasks: 'mes_planning_tasks',
  taskMaterials: 'mes_task_materials',
  taskEquipment: 'mes_task_equipment',
  rbacUsers: 'mes_rbac_users',
  rbacRoles: 'mes_rbac_roles',
  printSettings: 'mes_print_settings',
  pdfThemePrefs: 'mes_pdf_theme_prefs',
  currencySettings: 'mes_currency_settings',
  autoNumbering: 'mes_auto_numbering',
  microPlanAllocations: 'mes_micro_alloc',
  microPlanProgress: 'mes_micro_progress',
  productivityMatrix: 'mes_prod_matrix',
  microTasks: 'mes_micro_tasks',
  headerSettings: 'mes_header_settings',
  accountTransfers: 'mes_account_transfers',
  labourAdvances: 'mes_labour_advances',
  labourDeductions: 'mes_labour_deductions',
  labourContractors: 'mes_labour_contractors',
  labourPPE: 'mes_labour_ppe',
  workItemRates: 'mes_work_item_rates',
  workMeasurements: 'mes_work_measurements',
  fuelStorages: 'mes_fuel_storages',
  fuelTxns: 'mes_fuel_txns',
  grnRecords: 'mes_grn_records',
  materialIssues: 'mes_material_issues',
  toolIssues: 'mes_tool_issues',
  stockAudits: 'mes_stock_audits',
  savedPlans: 'mes_saved_plans',
  pettyCashCustodians: 'mes_petty_cash_custodians',
  pettyCashTxns: 'mes_petty_cash_txns',
  issues: 'mes_issues',
  cashFlowSettings: 'mes_cashflow_settings'
};

// Register keys so sync engine can map state key → localStorage key
registerStorageKeys(STORAGE_KEYS);

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export const state = {
  cashFlowSettings: load(STORAGE_KEYS.cashFlowSettings, {}),
  clients: load(STORAGE_KEYS.clients, []),
  items: load(STORAGE_KEYS.items, {}),
  accounts: load(STORAGE_KEYS.accounts, [{ id: 'acc_cash', name: 'Main Cash Book', type: 'Cash' }]),
  estimates: load(STORAGE_KEYS.estimates, []),
  sheets: load(STORAGE_KEYS.sheets, []),
  abstracts: load(STORAGE_KEYS.abstracts, []),
  raBills: load(STORAGE_KEYS.raBills, []),
  recycleBin: load(STORAGE_KEYS.recycleBin, []),
  invoices: load(STORAGE_KEYS.invoices, []),
  paymentsIn: load(STORAGE_KEYS.paymentsIn, []),
  expenses: load(STORAGE_KEYS.expenses, []),
  vendors: load(STORAGE_KEYS.vendors, []),
  vendorMaterials: load(STORAGE_KEYS.vendorMaterials, []),
  vendorPayments: load(STORAGE_KEYS.vendorPayments, []),
  rawMaterials: load(STORAGE_KEYS.rawMaterials, []),
  units: load(STORAGE_KEYS.units, ['Nos', 'Kg', 'Tonne', 'Bag', 'Ltr', 'M3', 'M2', 'RMT', 'MT', 'Cft', 'Sqft', 'Sqm', 'Quintal', 'Piece', 'Set', 'Roll', 'Box', 'Drum', 'Coil', 'Meter', 'Inch', 'Foot']),
  recipes: load(STORAGE_KEYS.recipes, {}),
  inventoryTx: load(STORAGE_KEYS.inventoryTx, []),
  locations: load(STORAGE_KEYS.locations, []),
  itemTransfers: load(STORAGE_KEYS.itemTransfers, []),
  maintenanceLogs: load(STORAGE_KEYS.maintenanceLogs, []),
  labourMaster: load(STORAGE_KEYS.labourMaster, []),
  attendanceLogs: load(STORAGE_KEYS.attendanceLogs, []),
  companyProfile: load(STORAGE_KEYS.companyProfile, {}),
  equipmentList: load(STORAGE_KEYS.equipmentList, []),
  equipmentLogs: load(STORAGE_KEYS.equipmentLogs, []),
  labourSalaries: load(STORAGE_KEYS.labourSalaries, []),
  labourPayments: load(STORAGE_KEYS.labourPayments, []),
  purchaseOrders: load(STORAGE_KEYS.purchaseOrders, []),
  purchaseReturns: load(STORAGE_KEYS.purchaseReturns, []),
  fixedAssets: load(STORAGE_KEYS.fixedAssets, []),
  saleInvoices: load(STORAGE_KEYS.saleInvoices, []),
  proformaInvoices: load(STORAGE_KEYS.proformaInvoices, []),
  saleOrders: load(STORAGE_KEYS.saleOrders, []),
  deliveryChallans: load(STORAGE_KEYS.deliveryChallans, []),
  saleReturns: load(STORAGE_KEYS.saleReturns, []),
  saleFixedAssets: load(STORAGE_KEYS.saleFixedAssets, []),
  otherIncome: load(STORAGE_KEYS.otherIncome, []),
  itemsMaster: load(STORAGE_KEYS.itemsMaster, []),
  itemCategories: load(STORAGE_KEYS.itemCategories, ['Purchase Materials', 'Sales Items', 'Tools & Equipment', 'Services']),
  savedPOs: load(STORAGE_KEYS.savedPOs, []),
  projects: load(STORAGE_KEYS.projects, []),
  bbsData: load(STORAGE_KEYS.bbsData, {}),
  sheetAttachments: load(STORAGE_KEYS.sheetAttachments, {}),
  projectDocs: load(STORAGE_KEYS.projectDocs, {}),
  leads: load(STORAGE_KEYS.leads, []),
  tenders: load(STORAGE_KEYS.tenders, []),
  cubeTests: load(STORAGE_KEYS.cubeTests, []),
  ncrReports: load(STORAGE_KEYS.ncrReports, []),
  incidents: load(STORAGE_KEYS.incidents, []),
  ppeChecks: load(STORAGE_KEYS.ppeChecks, []),
  equipUtilization: load(STORAGE_KEYS.equipUtilization, []),
  dailyProgress: load(STORAGE_KEYS.dailyProgress, []),
  milestones: load(STORAGE_KEYS.milestones, []),
  qualityChecks: load(STORAGE_KEYS.qualityChecks, []),
  concretePours: load(STORAGE_KEYS.concretePours, []),
  planningTasks: load(STORAGE_KEYS.planningTasks, []),
  taskMaterials: load(STORAGE_KEYS.taskMaterials, []),
  taskEquipment: load(STORAGE_KEYS.taskEquipment, []),
  rbacUsers: load(STORAGE_KEYS.rbacUsers, []),
  rbacRoles: load(STORAGE_KEYS.rbacRoles, {}),
  printSettings: load(STORAGE_KEYS.printSettings, {}),
  pdfThemePrefs: load(STORAGE_KEYS.pdfThemePrefs, {}),
  currencySettings: load(STORAGE_KEYS.currencySettings, {}),
  autoNumbering: load(STORAGE_KEYS.autoNumbering, {}),
  microPlanAllocations: load(STORAGE_KEYS.microPlanAllocations, {}),
  microPlanProgress: load(STORAGE_KEYS.microPlanProgress, {}),
  productivityMatrix: load(STORAGE_KEYS.productivityMatrix, {}),
  microTasks: load(STORAGE_KEYS.microTasks, []),
  headerSettings: load(STORAGE_KEYS.headerSettings, {}),
  accountTransfers: load(STORAGE_KEYS.accountTransfers, []),
  labourAdvances: load(STORAGE_KEYS.labourAdvances, []),
  labourDeductions: load(STORAGE_KEYS.labourDeductions, []),
  labourContractors: load(STORAGE_KEYS.labourContractors, []),
  labourPPE: load(STORAGE_KEYS.labourPPE, []),
  workItemRates: load(STORAGE_KEYS.workItemRates, []),
  workMeasurements: load(STORAGE_KEYS.workMeasurements, []),
  fuelStorages: load(STORAGE_KEYS.fuelStorages, []),
  fuelTxns: load(STORAGE_KEYS.fuelTxns, []),
  grnRecords: load(STORAGE_KEYS.grnRecords, []),
  materialIssues: load(STORAGE_KEYS.materialIssues, []),
  toolIssues: load(STORAGE_KEYS.toolIssues, []),
  stockAudits: load(STORAGE_KEYS.stockAudits, []),
  savedPlans: load(STORAGE_KEYS.savedPlans, []),
  pettyCashCustodians: load(STORAGE_KEYS.pettyCashCustodians, []),
  pettyCashTxns: load(STORAGE_KEYS.pettyCashTxns, []),
  issues: load(STORAGE_KEYS.issues, []),

  currentProjectId: null,
  currentSheetId: null,
  pendingAbstractData: null,
  currentEstimateId: null,
  currentSelectedParty: null,
  activeAutocompleteInput: null
};

/**
 * Recycle Bin is the source of truth for "what's deleted". Deleting moves an item
 * into state.recycleBin (see recycleBin.js) and removes it from its source array.
 * This reconciler re-applies those deletes after any load/sync, so a stale device
 * that re-pushed a deleted item can never resurrect it — the item is stripped from
 * its source array again as long as its bin entry still exists.
 * Returns the number of stray items removed.
 */
export function reconcileRecycleBin() {
  const bin = state.recycleBin;
  if (!Array.isArray(bin) || !bin.length) return 0;
  let removed = 0;
  for (const e of bin) {
    if (!e || !e.key || e.id == null) continue;
    const arr = state[e.key];
    if (!Array.isArray(arr)) continue;
    const before = arr.length;
    state[e.key] = arr.filter(x => x && x.id !== e.id);
    if (state[e.key].length !== before) {
      removed++;
      try { const sk = STORAGE_KEYS[e.key]; if (sk) localStorage.setItem(sk, JSON.stringify(state[e.key])); } catch {}
    }
  }
  return removed;
}
if (typeof window !== 'undefined') window.reconcileRecycleBin = reconcileRecycleBin;

/** True for "no data" values: null/undefined, [], or {}. Used by the anti-clobber
 *  guard so an EMPTY cloud value can never silently wipe populated local data
 *  (the root cause of the invite-join data-loss bug). Primitives count as data. */
function _isEmptyVal(v) {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

let _quotaWarned = false;

/** Persist all data to localStorage + async push to Supabase.
 *  Each key is isolated so one oversized key (e.g. KYC photos hitting the
 *  ~5MB localStorage quota) cannot abort the whole save or block cloud sync. */
export function saveAllData() {
  for (const [key, storageKey] of Object.entries(STORAGE_KEYS)) {
    if (state[key] === undefined) continue;
    const json = JSON.stringify(state[key]);
    try {
      localStorage.setItem(storageKey, json);
    } catch (e) {
      // QuotaExceededError — local cache is full, but cloud is still authoritative.
      console.warn(`[state] localStorage save failed for "${key}" (quota?):`, e?.name || e);
      if (!_quotaWarned && typeof window !== 'undefined' && window.showToast) {
        _quotaWarned = true;
        try { window.showToast('Local storage is full — your data is still being saved to the cloud. Consider clearing old data.', 'error'); } catch {}
      }
    }
    // Always push to cloud regardless of local success.
    syncPush(key, state[key]);
  }
}

/** Persist labour-specific data */
export function saveLabourData() {
  const keys = ['labourMaster', 'attendanceLogs', 'labourSalaries', 'labourPayments'];
  keys.forEach(k => {
    localStorage.setItem(STORAGE_KEYS[k], JSON.stringify(state[k]));
    syncPush(k, state[k]);
  });
}

/** Persist equipment data */
export function saveEquipmentData() {
  const keys = ['equipmentList', 'equipmentLogs'];
  keys.forEach(k => {
    localStorage.setItem(STORAGE_KEYS[k], JSON.stringify(state[k]));
    syncPush(k, state[k]);
  });
}

/**
 * Load all data from Supabase cloud and merge into local state.
 * Cloud data wins over local if it exists (cloud is authoritative).
 * Returns true if cloud data was loaded.
 */
export async function loadFromCloud() {
  try {
    const cloudData = await syncPullAll();
    if (!cloudData || !Object.keys(cloudData).length) { markSyncReady(); return false; }

    let merged = 0, kept = 0;
    for (const [key, storageKey] of Object.entries(STORAGE_KEYS)) {
      const c = cloudData[key];
      if (!c || c.data === undefined || c.data === null) continue;
      const cloudTs = Date.parse(c.updatedAt) || 0;
      const localTs = getLocalKeyTs(key);
      let newJson; try { newJson = JSON.stringify(c.data); } catch { newJson = null; }
      let curJson; try { curJson = JSON.stringify(state[key]); } catch { curJson = null; }
      // Keep local ONLY if it genuinely differs AND is newer (un-synced offline
      // edits from this device). Otherwise the cloud copy wins so every device —
      // and every module — converges to the same data.
      if (newJson !== null && curJson === newJson) { setLocalKeyTs(key, cloudTs); seedSyncBaseline(key, c.data); continue; }
      // ANTI-CLOBBER / RECOVERY: never let an EMPTY cloud value overwrite populated
      // local data. If a buggy/empty client wiped the shared cloud copy, the device
      // that still holds the real data restores it by re-pushing instead of adopting.
      if (_isEmptyVal(c.data) && !_isEmptyVal(state[key])) {
        syncPush(key, state[key]);
        kept++;
        continue;
      }
      if (localTs && localTs > cloudTs + 1000 && curJson !== null) {
        syncPush(key, state[key]); // local newer & different → re-push (queued until ready)
        kept++;
        continue;
      }
      state[key] = c.data;
      localStorage.setItem(storageKey, newJson);
      setLocalKeyTs(key, cloudTs);
      seedSyncBaseline(key, c.data); // adopted cloud → don't re-push unchanged
      merged++;
    }
    console.log(`[sync] Loaded ${merged} keys from cloud (kept ${kept} newer-local)`);
    markSyncReady();
    // If login booted the app before this slow cloud pull finished, the current
    // view was rendered from empty state (the "Add Client" screen). Now that the
    // real data is in, refresh the view so it appears without the user navigating.
    if (merged > 0 && typeof window !== 'undefined' && typeof window.refreshCurrentView === 'function') {
      try { window.refreshCurrentView(); } catch {}
    }
    return merged > 0;
  } catch (e) {
    console.warn('[sync] loadFromCloud failed:', e);
    markSyncReady();
    return false;
  }
}

/**
 * Push all current local data to Supabase (full upload).
 * Use after first signup or backup restore.
 */
export async function pushAllToCloud() {
  return syncPushAll(state, STORAGE_KEYS);
}

/** Demo seeding is disabled — new accounts start empty. Kept as a no-op
 *  so existing imports/window bindings don't break. */
export function seedDemoData() { /* no demo data — fresh start for all users */ }

/**
 * One-time removal of the legacy built-in demo data ("City Mall Phase 1" /
 * "DEMO" client / "Demo Supplier Co." etc.) that older builds seeded into
 * accounts. Matches on the exact seed signatures only, so real user records
 * named similarly are never touched. Returns true if anything was removed.
 */
export function purgeDemoData() {
  const n0 = state.clients.length + state.projects.length + state.vendors.length + state.rawMaterials.length + (state.locations || []).length;

  // Default seeded "Main HQ Store" location — remove it (inventory/tools/assets/purchase)
  state.locations = (state.locations || []).filter(l =>
    !((l.id === 'loc_store_1') || (l.name === 'Main HQ Store' && l.type === 'Warehouse')));

  // Demo client: name 'DEMO' tied to the demo project name
  const demoClientIds = (state.clients || [])
    .filter(c => c.name === 'DEMO' && c.projectName === 'City Mall Phase 1')
    .map(c => c.id);
  if (demoClientIds.length) {
    state.clients = state.clients.filter(c => !demoClientIds.includes(c.id));
    demoClientIds.forEach(id => { if (state.items && state.items[id]) delete state.items[id]; });
  }

  // Demo project (exact name + code)
  state.projects = (state.projects || []).filter(p => !(p.name === 'City Mall Phase 1' && p.code === 'CMP-001'));

  // Demo vendor (exact name + GST)
  state.vendors = (state.vendors || []).filter(v => !(v.name === 'Demo Supplier Co.' && v.gst === '24AAAAA0000A1Z5'));

  // Demo raw material / tool (exact seed ids + names)
  state.rawMaterials = (state.rawMaterials || []).filter(r =>
    !((r.id === 'rm_1' && r.name === 'Cement') || (r.id === 'rm_2' && r.name === 'Drill Machine')));

  const n1 = state.clients.length + state.projects.length + state.vendors.length + state.rawMaterials.length + (state.locations || []).length;
  return n1 !== n0;
}
if (typeof window !== 'undefined') window.purgeDemoData = purgeDemoData;

/**
 * Link existing projects to the shared client master (Client → Projects).
 * For each project that has a clientName but no valid clientId, find a client
 * by name (case-insensitive) or create one from the project's embedded client
 * fields, then set project.clientId. Idempotent. Returns true if it changed data.
 */
export function migrateClientsProjects() {
  let changed = false;
  if (!state.clients) state.clients = [];
  const clients = state.clients;
  const byName = (nm) => clients.find(c => (c.name || '').trim().toLowerCase() === (nm || '').trim().toLowerCase());
  (state.projects || []).forEach(p => {
    if (p.clientId && clients.some(c => c.id === p.clientId)) return;
    const nm = (p.clientName || '').trim();
    if (!nm) return;
    let c = byName(nm);
    if (!c) {
      c = {
        id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name: nm, contact: p.clientContact || '', phone: p.clientPhone || '', email: p.clientEmail || '',
        gst: p.clientGst || '', pan: p.clientPan || '', address: p.clientAddress || '',
        createdAt: new Date().toISOString(),
      };
      clients.push(c); changed = true;
    }
    if (p.clientId !== c.id) { p.clientId = c.id; changed = true; }
  });
  return changed;
}
if (typeof window !== 'undefined') window.migrateClientsProjects = migrateClientsProjects;

/** Apply a change pushed from another device/tab (realtime) into local state. */
let _rtRefreshTimer = null;
let _rtChangedKeys = new Set();
export function applyRemoteChange(key, data) {
  const storageKey = STORAGE_KEYS[key];
  if (!storageKey) { console.warn('[rt] unknown module key:', key); return; }
  // ANTI-CLOBBER: ignore a realtime event that would replace our populated local
  // data with an empty value (another device wiped it) — and re-push to heal it.
  if (_isEmptyVal(data) && !_isEmptyVal(state[key])) {
    console.warn('[rt] ignoring empty remote value for "' + key + '" — keeping local data');
    try { syncPush(key, state[key]); } catch {}
    return;
  }
  console.log('[rt] applying remote change → state.' + key, Array.isArray(data) ? data.length + ' rows' : typeof data);
  state[key] = data;
  try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch {}
  reconcileRecycleBin();  // a remote push may have re-added a binned item — strip it again
  _rtChangedKeys.add(key);
  // Debounce a single UI refresh after a burst of remote changes. Kept short so
  // realtime changes appear near-instantly (only long enough to coalesce a burst
  // of keys arriving together).
  if (_rtRefreshTimer) clearTimeout(_rtRefreshTimer);
  _rtRefreshTimer = setTimeout(() => {
    const keys = [..._rtChangedKeys]; _rtChangedKeys.clear();
    try { _renderForKeys(keys); } catch (e) { console.warn('[rt] render error:', e); }
    if (typeof window !== 'undefined' && typeof window.refreshCurrentView === 'function') window.refreshCurrentView();
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') window.showToast('🔄 Updated from another device', 'info');
  }, 120);
}

/**
 * Route changed module keys to their renderers so the live screen updates even
 * if it isn't the "current view" switchView would refresh. Renderers are on
 * window (set by their modules); guarded so a missing one never throws.
 */
function _renderForKeys(keys) {
  if (typeof window === 'undefined') return;
  const call = (fn) => { try { if (typeof window[fn] === 'function') window[fn](); } catch (e) { console.warn('[rt] ' + fn, e); } };
  const map = {
    clients: ['renderPartiesList', 'renderProjectsHome', 'renderClientHub'],
    projects: ['renderProjectsHome', 'renderProjectDashboard'],
    saleInvoices: ['renderSaleInvoices', 'renderSalesLedger', 'renderPartiesList'],
    invoices: ['renderInvoiceHistory', 'renderPartiesList'],
    abstracts: ['renderAbstractsList', 'renderPartiesList'],
    paymentsIn: ['renderPaymentInList', 'renderPartiesList'],
    vendors: ['renderVendorLedger', 'renderPartiesList'],
    vendorMaterials: ['renderVendorLedger', 'renderPartiesList'],
    vendorPayments: ['renderVendorLedger', 'renderPartiesList'],
    labourMaster: ['renderLabourMasterList', 'renderMonthlyMuster', 'renderPartiesList'],
    attendanceLogs: ['renderMonthlyMuster'],
    labourPayments: ['renderPartiesList'],
    accounts: ['renderAccounts'],
    expenses: ['renderExpenseCategories'],
    issues: ['renderIssues'],
    rawMaterials: ['renderLiveInventory', 'renderItemsMasterView'],
    inventoryTx: ['renderLiveInventory'],
    equipmentList: ['renderEquipmentView'],
    itemsMaster: ['renderItemsMasterView'],
    itemCategories: ['renderItemsMasterView'],
    projectDocs: ['renderProjectDocs'],
  };
  const seen = new Set();
  keys.forEach(k => (map[k] || []).forEach(fn => { if (!seen.has(fn)) { seen.add(fn); call(fn); } }));
  // Parties list + closing balance always reflect the latest if it's open.
  if (document.getElementById('partyTransactionsBody') && typeof window.renderPartyTransactions === 'function') {
    try { window.renderPartyTransactions(); } catch {}
  }
}
/** Start live cloud sync (other devices' changes appear instantly). */
export function startCloudRealtime() {
  if (typeof window !== 'undefined' && typeof window.startRealtime === 'function') window.startRealtime(applyRemoteChange);
}
if (typeof window !== 'undefined') window.startCloudRealtime = startCloudRealtime;

/**
 * Pull the latest cloud data and apply any keys that are newer than the local
 * copy. This is the reliable cross-device safety net: realtime (postgres_changes)
 * delivers instant updates when the socket is healthy, but a periodic pull +
 * pull-on-focus guarantees every module (not just clients/projects) shows the
 * newest data within seconds on every device — even if the realtime socket
 * dropped or the device was asleep.
 */
let _pulling = false;
export async function pullRemoteUpdates() {
  if (_pulling) return 0;
  _pulling = true;
  try {
    const cloud = await syncPullAll();
    if (!cloud) return 0;
    let applied = 0;
    for (const [key, storageKey] of Object.entries(STORAGE_KEYS)) {
      const c = cloud[key];
      if (!c || c.data === undefined || c.data === null) continue;
      let newJson; try { newJson = JSON.stringify(c.data); } catch { continue; }
      let curJson; try { curJson = JSON.stringify(state[key]); } catch { curJson = null; }
      const cloudTs = Date.parse(c.updatedAt) || 0;
      if (curJson === newJson) { setLocalKeyTs(key, cloudTs); seedSyncBaseline(key, c.data); continue; } // already in sync
      // ANTI-CLOBBER / RECOVERY: an empty cloud value must never wipe populated
      // local data — re-push our copy to restore the shared cloud instead.
      if (_isEmptyVal(c.data) && !_isEmptyVal(state[key])) { syncPush(key, state[key]); continue; }
      // Cloud differs from local. Keep local if we have a genuine un-synced edit
      // (it will be pushed).
      if (hasPendingPush(key)) continue;
      // TIMESTAMP GUARD (symmetric to the push-side anti-clobber): if OUR copy is
      // newer than the cloud's, the cloud has gone backwards (a stale device
      // clobbered it) — heal it by re-pushing our copy instead of adopting the
      // older data. Only adopt when the cloud is genuinely newer, so no device can
      // resurrect old data or drop newer data.
      const localTs = getLocalKeyTs(key) || 0;
      if (localTs && cloudTs && localTs > cloudTs) { syncPush(key, state[key]); continue; }
      state[key] = c.data;
      try { localStorage.setItem(storageKey, newJson); } catch {}
      setLocalKeyTs(key, cloudTs);
      seedSyncBaseline(key, c.data);                          // adopted → don't re-push
      applied++;
    }
    if (applied && typeof window !== 'undefined') {
      reconcileRecycleBin();     // re-strip binned items a stale device may have re-pushed
      if (typeof window.refreshCurrentView === 'function') window.refreshCurrentView();
      // Silent: data refreshes in place; no popup for routine background pulls.
    }
    return applied;
  } catch (e) {
    console.warn('[sync] pullRemoteUpdates failed:', e);
    return 0;
  } finally { _pulling = false; }
}
if (typeof window !== 'undefined') window.pullRemoteUpdates = pullRemoteUpdates;

/**
 * Near-real-time cross-device sync safety net: pull every 20s while online,
 * and immediately whenever the app/tab/window regains focus (i.e. the moment
 * you switch to another device). Idempotent.
 */
export function startPeriodicSync() {
  if (typeof window === 'undefined' || window.__periodicSyncStarted) return;
  window.__periodicSyncStarted = true;
  setInterval(() => { if (navigator.onLine) pullRemoteUpdates(); }, 20000);
  window.addEventListener('focus', () => { if (navigator.onLine) pullRemoteUpdates(); });
  window.addEventListener('online', () => pullRemoteUpdates());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) pullRemoteUpdates();
  });
}
if (typeof window !== 'undefined') window.startPeriodicSync = startPeriodicSync;

/** Migrate existing data — assign projectId to records that don't have one */
export function migrateToProjects() {
  const defaultProjId = state.projects[0]?.id;
  if (!defaultProjId) return;
  const arrKeys = ['clients','estimates','sheets','abstracts','invoices','paymentsIn','expenses',
    'vendors','vendorMaterials','vendorPayments','rawMaterials','inventoryTx','locations',
    'itemTransfers','maintenanceLogs','labourMaster','attendanceLogs','equipmentList','equipmentLogs',
    'labourSalaries','labourPayments','purchaseOrders','purchaseReturns','fixedAssets',
    'saleInvoices','proformaInvoices','saleOrders','deliveryChallans','saleReturns',
    'saleFixedAssets','otherIncome','itemsMaster','savedPOs',
    'leads','tenders','cubeTests','ncrReports','incidents','ppeChecks',
    'equipUtilization','dailyProgress','milestones','qualityChecks',
    'planningTasks','taskMaterials','taskEquipment','issues','concretePours'];
  arrKeys.forEach(key => {
    if (Array.isArray(state[key])) {
      state[key].forEach(rec => { if (!rec.projectId) rec.projectId = defaultProjId; });
    }
  });
}

export { STORAGE_KEYS };
