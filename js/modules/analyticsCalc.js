/**
 * analyticsCalc.js — figures for the Analytics / MIS dashboard, for the whole
 * company or for ONE project / site. Pure (no DOM); unit-tested in
 * tests/analyticsCalc.test.js.
 *
 * A record belongs to a project when its chosen site / projectId says so, or —
 * when untagged — through what it is linked to (client, vendor, labour,
 * contractor, measurement sheet, abstract). Records that can't be placed are
 * reported as "unallocated" instead of being silently counted everywhere.
 */
import { settledAmount } from './deductions.js';
import { accountBalance } from './paymentsEngine.js';

const _num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const _find = (list, id) => (list || []).find(x => x.id === id);

/** true / false, or null when the record can't be tied to any project. */
export function inProject(S, rec, pid) {
  if (!rec) return null;
  // The site picked on the entry (purchase bill / expense) is a deliberate
  // choice; projectId may only be the boot migration's default stamp
  // (state.migrateToProjects puts untagged records on the first project).
  if (rec.siteId) {
    if (rec.siteId === pid) return true;
    if ((S.projects || []).some(p => p.id === rec.siteId)) return false;
  }
  if (rec.projectId) return rec.projectId === pid;
  const viaParty = (list, id) => { const p = _find(list, id); return p && (p.projectId || p.siteId) ? (p.projectId || p.siteId) === pid : null; };
  if (rec.sheetId) { const r = viaParty(S.sheets, rec.sheetId); if (r !== null) return r; }
  if (Array.isArray(rec.abstractIds) && rec.abstractIds.length) {
    const abs = rec.abstractIds.map(id => _find(S.abstracts, id)).filter(Boolean);
    const r = abs.map(a => inProject(S, a, pid)).filter(x => x !== null);
    if (r.length) return r.includes(true);
  }
  if (rec.clientId) {
    const r = viaParty(S.clients, rec.clientId); if (r !== null) return r;
    // Client → Projects hierarchy: an untagged record of a client with exactly
    // one project belongs to that project.
    const ps = (S.projects || []).filter(p => p.clientId === rec.clientId);
    if (ps.length === 1) return ps[0].id === pid;
  }
  if (rec.vendorId) { const r = viaParty(S.vendors, rec.vendorId); if (r !== null) return r; }
  if (rec.labourId) { const r = viaParty(S.labourMaster, rec.labourId); if (r !== null) return r; }
  if (rec.gangId) { const r = viaParty(S.labourContractors, rec.gangId); if (r !== null) return r; }
  return null;
}

function _billed(S, keep) {
  let b = 0;
  (S.abstracts || []).filter(a => a.status !== 'invoiced' && keep(a)).forEach(a => b += _num(a.totalAmount));
  (S.invoices || []).filter(i => i.status !== 'Cancelled' && keep(i)).forEach(i => b += _num(i.taxAmount));
  (S.saleInvoices || []).filter(i => i.status !== 'Cancelled' && keep(i)).forEach(i => b += _num(i.grandTotal || i.total));
  return b;
}

/**
 * @param S   app state
 * @param pid project / site id, or '' for the whole company
 */
export function computeAnalytics(S, pid = '') {
  const keep = pid ? (r) => inProject(S, r, pid) === true : () => true;
  const sum = (arr, f) => (arr || []).filter(keep).reduce((s, r) => s + _num(typeof f === 'function' ? f(r) : r[f]), 0);

  const billed = _billed(S, keep);
  const received = sum(S.paymentsIn, 'amount');                 // cash collected
  const settled = (S.paymentsIn || []).filter(keep).reduce((s, p) => s + settledAmount(p), 0); // incl. TDS etc.
  const outstanding = billed - settled;
  const purchases = sum(S.vendorMaterials, r => r.totalAmount ?? r.amount);
  const labour = sum(S.labourPayments, 'amount');
  const expenses = sum(S.expenses, 'amount');
  const vendorPaid = sum(S.vendorPayments, 'amount');
  const netProfit = received - expenses - purchases - labour;

  // Cash: company → real bank/cash balances; project → its own cash in − out.
  const cash = pid
    ? received - vendorPaid - labour - expenses
    : (S.accounts || []).reduce((s, a) => s + accountBalance(S, a.id), 0);

  // Counts
  const projects = S.projects || [];
  const proj = pid ? _find(projects, pid) : null;
  const vendorIds = new Set();
  if (pid) {
    (S.vendorMaterials || []).filter(keep).forEach(m => m.vendorId && vendorIds.add(m.vendorId));
    (S.vendorPayments || []).filter(keep).forEach(m => m.vendorId && vendorIds.add(m.vendorId));
  }
  const counts = pid ? {
    projects: proj ? 1 : 0, activeProjects: proj && (proj.status || 'Active') === 'Active' ? 1 : 0,
    sheets: (S.sheets || []).filter(keep).length,
    clients: proj && proj.clientId ? 1 : 0,
    vendors: vendorIds.size,
    labour: (S.labourMaster || []).filter(l => (l.projectId || l.siteId) === pid).length,
    equipment: (S.equipmentList || []).filter(e => (e.projectId || e.siteId) === pid).length,
    purchaseOrders: (S.purchaseOrders || []).filter(keep).length,
  } : {
    projects: projects.length, activeProjects: projects.filter(p => (p.status || 'Active') === 'Active').length,
    sheets: (S.sheets || []).length, clients: (S.clients || []).length, vendors: (S.vendors || []).length,
    labour: (S.labourMaster || []).length, equipment: (S.equipmentList || []).length, purchaseOrders: (S.purchaseOrders || []).length,
  };

  // Expense breakdown: by site for the company, by head for one project.
  const map = {};
  (S.expenses || []).filter(keep).forEach(e => {
    const k = pid ? (e.head || e.category || 'Other') + (e.subHead ? ' · ' + e.subHead : '')
      : (e.siteName || (e.siteId ? '(removed site)' : 'General / Unallocated'));
    map[k] = (map[k] || 0) + _num(e.amount);
  });
  const expenseRows = Object.entries(map).sort((a, b) => b[1] - a[1]);

  // Project performance rows
  const projectRows = (pid ? projects.filter(p => p.id === pid) : projects).map(p => {
    const k = (r) => inProject(S, r, p.id) === true;
    const pb = _billed(S, k);
    const pr = (S.paymentsIn || []).filter(k).reduce((s, x) => s + _num(x.amount), 0);
    const ps = (S.paymentsIn || []).filter(k).reduce((s, x) => s + settledAmount(x), 0);
    return { id: p.id, name: p.name, status: p.status || 'Active', billed: pb, received: pr, outstanding: pb - ps };
  });

  // What couldn't be placed in any project (only meaningful when filtering)
  const unallocated = { count: 0, amount: 0 };
  if (pid) {
    [['paymentsIn', 'amount'], ['vendorMaterials', 'totalAmount'], ['vendorPayments', 'amount'], ['labourPayments', 'amount'], ['expenses', 'amount']].forEach(([k, f]) => {
      (S[k] || []).forEach(r => { if (inProject(S, r, pid) === null) { unallocated.count++; unallocated.amount += _num(r[f] ?? r.amount); } });
    });
  }

  return { billed, received, settled, outstanding, purchases, labour, expenses, vendorPaid, netProfit, cash, counts, expenseRows, projectRows, unallocated };
}
