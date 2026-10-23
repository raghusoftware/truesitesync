/**
 * shellCalc.js — pure helpers for the app shell (Projects / Workspace / Master
 * tabs, app-bar titles, the project list). No DOM; unit-tested in
 * tests/shellCalc.test.js.
 */

const _num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

/** Status chip a project falls under: ongoing | completed | hold | planning. */
export function projectBucket(p) {
  const s = String((p && p.status) || 'Active').toLowerCase();
  if (s.startsWith('complete') || s === 'closed') return 'completed';
  if (s.includes('hold')) return 'hold';
  if (s.startsWith('plan')) return 'planning';
  return 'ongoing';
}

export const PROJECT_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'ongoing', label: 'Ongoing' },
  { id: 'completed', label: 'Completed' },
  { id: 'hold', label: 'On Hold' },
  { id: 'planning', label: 'Planning' },
];

export function chipCounts(projects) {
  const c = { all: 0, ongoing: 0, completed: 0, hold: 0, planning: 0 };
  (projects || []).forEach(p => { c.all++; c[projectBucket(p)]++; });
  return c;
}

/** Projects matching the search text (name, location, client, WO) and chip. */
export function filterProjects(projects, { q = '', chip = 'all', clients = [] } = {}) {
  const needle = String(q || '').trim().toLowerCase();
  return (projects || []).filter(p => {
    if (chip !== 'all' && projectBucket(p) !== chip) return false;
    if (!needle) return true;
    const client = (clients || []).find(c => c.id === p.clientId);
    const wo = (p.boqs || []).map(g => g.woNumber).join(' ') + ' ' + (p.woNumber || '');
    return [p.name, p.location, p.code, client && client.name, p.clientName, wo]
      .some(v => String(v || '').toLowerCase().includes(needle));
  });
}

/** Contract value: explicit value → PO/BOQ value → BOQ item amounts. */
export function contractValue(p) {
  if (!p) return 0;
  const v = _num(p.contractValue) || _num(p.budget) || (p.boqs || []).reduce((s, g) => s + _num(g.poValue), 0);
  if (v) return v;
  return (p.boqs || []).reduce((s, g) => s + (g.items || []).reduce((a, it) => a + _num(it.amount), 0), 0);
}

/**
 * Progress % shown on the project card: a manual % if set, 100 when
 * completed, else work billed (abstracts + invoices) against contract value.
 */
export function projectProgress(S, p) {
  if (!p) return 0;
  if (p.progress != null && p.progress !== '') return Math.max(0, Math.min(100, Math.round(_num(p.progress))));
  if (projectBucket(p) === 'completed') return 100;
  const value = contractValue(p);
  if (!value) return 0;
  const mine = (r) => r.projectId === p.id;
  const billed = (S.abstracts || []).filter(a => mine(a) && a.status !== 'invoiced').reduce((s, a) => s + _num(a.totalAmount), 0)
    + (S.invoices || []).filter(i => mine(i) && i.status !== 'Cancelled').reduce((s, i) => s + _num(i.taxAmount), 0)
    + (S.saleInvoices || []).filter(i => mine(i) && i.status !== 'Cancelled').reduce((s, i) => s + _num(i.subTotal ?? i.total), 0);
  return Math.max(0, Math.min(100, Math.round(billed / value * 100)));
}

export function initials(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[1][0]).toUpperCase();
}

/** "01 Sep 2025" */
export function fmtDate(d) {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (!m || +m[2] < 1 || +m[2] > 12) return '';
  return `${m[3]} ${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[+m[2] - 1]} ${m[1]}`;
}

export function dateRange(p) {
  const a = fmtDate(p && (p.startDate || p.start)), b = fmtDate(p && (p.endDate || p.end || p.completionDate));
  return a && b ? `${a} – ${b}` : a ? `From ${a}` : b ? `Till ${b}` : '';
}

/* ── Tabs & titles ──────────────────────────────────────────────────────── */

export const ROOT_VIEWS = ['projectsHome', 'bizHomeView', 'workspaceView', 'masterView'];

const WORKSPACE_VIEWS = new Set([
  'workspaceView', 'salesHubView', 'purchaseHubView', 'financeHubView', 'paymentsHubView', 'analyticsView', 'reportsView',
  'salesLedgerView', 'saleOrderView', 'proformaInvoiceView', 'deliveryChallanView', 'estimatesView', 'estimationView',
  'paymentInView', 'saleReturnView', 'otherIncomeView', 'saleFixedAssetsView', 'purchaseBillsView', 'purchaseOrderView',
  'paymentOutView', 'purchaseReturnView', 'expensesView', 'purchaseAssetsView', 'vendorView', 'partiesLedgerView',
  'accountsManagerView', 'cashFlowView', 'costProfitView', 'creditBookView',
]);
const MASTER_VIEWS = new Set([
  'masterView', 'systemHubView', 'itemsMasterView', 'masterData', 'planBillingView', 'settingsView', 'recycleBinView',
  'profileView', 'superAdminView', 'clientsView',
]);

/** Which bottom tab a view belongs to. */
export function tabOf(viewId) {
  if (WORKSPACE_VIEWS.has(viewId)) return 'workspace';
  if (MASTER_VIEWS.has(viewId)) return 'master';
  return 'projects';
}

export const VIEW_TITLES = {
  projectsHome: 'Projects', bizHomeView: 'Home', workspaceView: 'Workspace', masterView: 'Master', profileView: 'My Profile',
  projectDashboard: 'Project Home', execEngineView: 'Planning', scheduleBuilderView: 'Scheduling', executionView: 'Daily Progress',
  issuesView: 'Issues & Snags', chatView: 'Chat', labourView: 'Labour & Attendance', equipmentView: 'Equipment',
  inventoryView: 'Manage Materials', recipeView: 'Mix Design', assetsView: 'Tools & Assets', measurementListView: 'Measurement',
  entrySheet: 'Measurement Entry', abstractsView: 'Abstracts', documentsView: 'Drawings & Documents', pettyCashView: 'Petty Cash',
  planningView: 'Planning', microPlanView: 'Micro Plan', wpsView: 'WPS Salary', guaranteesView: 'Guarantees',
  subcontractorsView: 'Subcontractors', savedSheets: 'Saved Sheets', billingView: 'Billing', clientDashboardView: 'Client',
  salesHubView: 'Sales', purchaseHubView: 'Purchase', financeHubView: 'Finance', systemHubView: 'System', paymentsHubView: 'Payments',
  analyticsView: 'Charts & Performance', reportsView: 'Reports', salesLedgerView: 'Sale Invoices', saleOrderView: 'Sale Orders',
  proformaInvoiceView: 'Proforma Invoices', deliveryChallanView: 'Delivery Challans', estimatesView: 'Estimates',
  estimationView: 'Estimation', paymentInView: 'Payment In', saleReturnView: 'Sale Returns', otherIncomeView: 'Other Income',
  saleFixedAssetsView: 'Sale Fixed Assets', purchaseBillsView: 'Purchase Bills', purchaseOrderView: 'Purchase Orders',
  paymentOutView: 'Payment Out', purchaseReturnView: 'Purchase Returns', expensesView: 'Expenses', purchaseAssetsView: 'Fixed Assets',
  vendorView: 'Vendor Purchase', partiesLedgerView: 'Party', accountsManagerView: 'Bank & Cash', cashFlowView: 'Cash Flow',
  costProfitView: 'Cost & Profit', creditBookView: 'Udhaar Book', itemsMasterView: 'Materials & Items', masterData: 'Team & Roles',
  planBillingView: 'Subscription', settingsView: 'Settings', recycleBinView: 'Recycle Bin', superAdminView: 'Admin Panel',
};

export function viewTitle(viewId) {
  if (VIEW_TITLES[viewId]) return VIEW_TITLES[viewId];
  return String(viewId || '').replace(/View$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
}
