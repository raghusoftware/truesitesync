import { syncPush, syncPullAll, syncPushAll, registerStorageKeys } from '../database/sync.js';

const STORAGE_KEYS = {
  clients: 'mes_clients',
  items: 'mes_items',
  accounts: 'mes_accounts',
  estimates: 'mes_estimates',
  sheets: 'mes_sheets',
  abstracts: 'mes_abstracts',
  invoices: 'mes_invoices',
  paymentsIn: 'mes_pay_in',
  expenses: 'mes_exp',
  vendors: 'mes_vendors',
  vendorMaterials: 'mes_ven_mat',
  vendorPayments: 'mes_ven_pay',
  rawMaterials: 'mes_raw_materials',
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
  savedPOs: 'mes_saved_pos',
  projects: 'mes_projects',
  bbsData: 'mes_bbs_data',
  sheetAttachments: 'mes_sheet_attachments',
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
  savedPlans: 'mes_saved_plans'
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
  clients: load(STORAGE_KEYS.clients, []),
  items: load(STORAGE_KEYS.items, {}),
  accounts: load(STORAGE_KEYS.accounts, [{ id: 'acc_cash', name: 'Main Cash Book', type: 'Cash' }]),
  estimates: load(STORAGE_KEYS.estimates, []),
  sheets: load(STORAGE_KEYS.sheets, []),
  abstracts: load(STORAGE_KEYS.abstracts, []),
  invoices: load(STORAGE_KEYS.invoices, []),
  paymentsIn: load(STORAGE_KEYS.paymentsIn, []),
  expenses: load(STORAGE_KEYS.expenses, []),
  vendors: load(STORAGE_KEYS.vendors, []),
  vendorMaterials: load(STORAGE_KEYS.vendorMaterials, []),
  vendorPayments: load(STORAGE_KEYS.vendorPayments, []),
  rawMaterials: load(STORAGE_KEYS.rawMaterials, []),
  recipes: load(STORAGE_KEYS.recipes, {}),
  inventoryTx: load(STORAGE_KEYS.inventoryTx, []),
  locations: load(STORAGE_KEYS.locations, [{ id: 'loc_store_1', name: 'Main HQ Store', type: 'Warehouse' }]),
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
  savedPOs: load(STORAGE_KEYS.savedPOs, []),
  projects: load(STORAGE_KEYS.projects, []),
  bbsData: load(STORAGE_KEYS.bbsData, {}),
  sheetAttachments: load(STORAGE_KEYS.sheetAttachments, {}),
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

  currentProjectId: null,
  currentSheetId: null,
  pendingAbstractData: null,
  currentEstimateId: null,
  currentSelectedParty: null,
  activeAutocompleteInput: null
};

/** Persist all data to localStorage + async push to Supabase */
export function saveAllData() {
  for (const [key, storageKey] of Object.entries(STORAGE_KEYS)) {
    if (state[key] !== undefined) {
      localStorage.setItem(storageKey, JSON.stringify(state[key]));
      syncPush(key, state[key]);
    }
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
    if (!cloudData || !Object.keys(cloudData).length) return false;

    let merged = 0;
    for (const [key, storageKey] of Object.entries(STORAGE_KEYS)) {
      if (cloudData[key] !== undefined && cloudData[key] !== null) {
        state[key] = cloudData[key];
        localStorage.setItem(storageKey, JSON.stringify(cloudData[key]));
        merged++;
      }
    }
    console.log(`[sync] Loaded ${merged} keys from cloud`);
    return merged > 0;
  } catch (e) {
    console.warn('[sync] loadFromCloud failed:', e);
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

/** Seed demo data on first run */
export function seedDemoData() {
  if (state.clients.length > 0 && state.projects.length > 0) return;
  const pId = 'proj_' + Date.now();
  const cId = 'c_' + Date.now();
  const boqGroupId = 'boq_' + Date.now();
  const boqItems = [
    { code: 'EXC-001', description: 'Excavation in all types of soil', uom: 'M3', qty: 500, rate: 250 },
    { code: 'RCC-001', description: 'RCC M20 Grade concrete', uom: 'M3', qty: 200, rate: 5000 },
    { code: 'STL-001', description: 'Structural Steel TMT bars', uom: 'MT', qty: 50, rate: 52000 },
    { code: 'BRK-001', description: 'Brick masonry in CM 1:6', uom: 'M3', qty: 150, rate: 4500 },
    { code: 'PLT-001', description: 'Internal cement plaster 12mm', uom: 'M2', qty: 3000, rate: 180 },
    { code: 'PNT-001', description: 'Exterior weather coat paint', uom: 'M2', qty: 2500, rate: 85 },
    { code: 'TLE-001', description: 'Vitrified floor tiles 600x600', uom: 'M2', qty: 1200, rate: 950 },
    { code: 'PLB-001', description: 'Plumbing CPVC pipe supply & fixing', uom: 'RM', qty: 800, rate: 120 },
    { code: 'ELC-001', description: 'Electrical wiring with conduit', uom: 'Point', qty: 200, rate: 650 },
    { code: 'WTP-001', description: 'Waterproofing treatment', uom: 'M2', qty: 400, rate: 350 }
  ];
  if (!state.projects.length) {
    state.projects.push({
      id: pId, name: 'City Mall Phase 1', code: 'CMP-001',
      clientName: 'DEMO', location: 'Mumbai, Maharashtra',
      startDate: new Date().toISOString().split('T')[0], endDate: '',
      manager: '', budget: 5000000, status: 'Active',
      description: 'Demo project — City Mall construction phase 1',
      color: '#3b82f6', createdAt: new Date().toISOString(),
      boqs: [{ id: boqGroupId, name: 'Main BOQ', type: 'BOQ', woNumber: 'WO-2026-001', woDate: new Date().toISOString().split('T')[0], items: boqItems, poValue: boqItems.reduce((s, i) => s + (i.qty * i.rate), 0) }],
      boqItems: boqItems
    });
  }
  if (!state.clients.length) {
    state.clients.push({ id: cId, name: 'DEMO', projectName: 'City Mall Phase 1', projectId: pId });
    state.items[cId] = {
      'EXC-001': { code: 'EXC-001', description: 'Excavation in all types of soil', uom: 'M3', rate: 250 },
      'RCC-001': { code: 'RCC-001', description: 'RCC M20 Grade concrete', uom: 'M3', rate: 5000 }
    };
    state.rawMaterials.push(
      { id: 'rm_1', name: 'Cement', type: 'Raw Material', unit: 'Bag', minStock: 50, projectId: pId },
      { id: 'rm_2', name: 'Drill Machine', type: 'Tools', unit: 'Nos', minStock: 2, projectId: pId }
    );
    state.vendors.push({ id: 'v_1', name: 'Demo Supplier Co.', contact: '9876543210', gst: '24AAAAA0000A1Z5', address: 'Demo Address', projectId: pId });
  }
  migrateToProjects();
  saveAllData();
}

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
    'planningTasks','taskMaterials','taskEquipment'];
  arrKeys.forEach(key => {
    if (Array.isArray(state[key])) {
      state[key].forEach(rec => { if (!rec.projectId) rec.projectId = defaultProjId; });
    }
  });
}

export { STORAGE_KEYS };
