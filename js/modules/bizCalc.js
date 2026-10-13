/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Business type rules & shop calculations (pure)
 * ═══════════════════════════════════════════════════════════
 * One setting (Settings → Business Type, stored in currencySettings so it
 * syncs to the whole organisation) decides which modules a company sees:
 *
 *   construction  — the full app (default; nothing changes for existing users)
 *   shop          — retail / wholesale: no projects, measurement, execution…
 *                   adds a shop Home, Udhaar (credit) book, stock alerts
 *   manufacturing — like shop, plus recipes / production, tools & machines
 *
 * MODE_HIDDEN lists view ids and report ids / report categories to hide;
 * rbac.js applies it alongside the country gate (sidebar, hub tiles and direct
 * navigation). The calc helpers at the bottom are pure and unit-tested.
 * ═══════════════════════════════════════════════════════════
 */
import { settledAmount } from './deductions.js';

export const BUSINESS_MODES = {
  construction: { label: 'Construction', icon: '🏗️', tagline: 'Construction Management',
    desc: 'Projects, measurement, RA bills, execution, labour & equipment — the full contractor suite.' },
  shop: { label: 'Shop / Trading', icon: '🏪', tagline: 'Shop & Trading',
    desc: 'Retail or wholesale: billing, purchase, stock with low-stock alerts, udhaar (credit) book, staff & accounts.' },
  manufacturing: { label: 'Manufacturing', icon: '🏭', tagline: 'Manufacturing',
    desc: 'Everything in Shop, plus recipes / bill of materials, production builds, tools & machines.' },
};

// Construction-only screens.
const CONSTRUCTION_VIEWS = [
  'projectsHome', 'projectDashboard', 'execEngineView', 'scheduleBuilderView', 'executionView', 'issuesView',
  'measurementListView', 'abstractsView', 'estimationView', 'billingView', 'documentsView', 'entrySheet',
  'guaranteesView', 'subcontractorsView', 'wpsView', 'planningView', 'microPlanView',
];
// Construction-only report categories and reports.
const CONSTRUCTION_REPORT_CATS = ['project', 'execution', 'measurement', 'quality'];
const CONSTRUCTION_REPORTS = ['retention_recovery', 'held_tracker'];

export const MODE_HIDDEN = {
  construction: [],
  shop: [...CONSTRUCTION_VIEWS, 'equipmentView', 'recipeView', 'assetsView', 'saleFixedAssetsView', ...CONSTRUCTION_REPORTS,
    ...CONSTRUCTION_REPORT_CATS.map(c => 'cat:' + c), 'cat:equipment'],
  // recipeView is the construction BOQ-item recipe tool; a factory's bill of
  // materials lives in Items → Production Items (Build / Assemble).
  manufacturing: [...CONSTRUCTION_VIEWS, 'recipeView', ...CONSTRUCTION_REPORTS, ...CONSTRUCTION_REPORT_CATS.map(c => 'cat:' + c)],
};

export function activeMode(S) {
  const m = S && S.currencySettings && S.currencySettings.businessMode;
  return BUSINESS_MODES[m] ? m : 'construction';
}
export const isConstruction = (S) => activeMode(S) === 'construction';

/** Is a view / report id (or 'cat:<reportCategory>') available in the active business type? */
export function modeAllows(id, S = state) {
  return !(MODE_HIDDEN[activeMode(S)] || []).includes(id);
}

/** Words that change with the business type (sidebar, headings). */
export function modeTerm(key, S = state) {
  const shopLike = activeMode(S) !== 'construction';
  const T = { labour: shopLike ? 'Staff' : 'Labour', client: shopLike ? 'Customer' : 'Client', clients: shopLike ? 'Customers' : 'Clients' };
  return T[key] || key;
}

/* ─────────────── pure calculations (unit-tested) ─────────────── */

const _num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

/** Stock on hand per stock item across all stores (IN − everything else). */
export function stockOnHand(S) {
  const map = {};
  (S.inventoryTx || []).forEach(tx => {
    if (!tx.rawMaterialId) return;
    map[tx.rawMaterialId] = (map[tx.rawMaterialId] || 0) + (tx.type === 'IN' ? 1 : -1) * _num(tx.qty);
  });
  return map;
}

/** Stock items at or below their minimum stock (only items with a minimum set). */
export function lowStockItems(S) {
  const soh = stockOnHand(S);
  return (S.rawMaterials || [])
    .filter(m => (m.status || 'Active') !== 'Inactive' && _num(m.minStock) > 0 && (soh[m.id] || 0) <= _num(m.minStock))
    .map(m => ({ id: m.id, name: m.name, unit: m.unit || '', stock: Math.round((soh[m.id] || 0) * 1000) / 1000, minStock: _num(m.minStock),
      shortBy: Math.max(0, _num(m.minStock) - (soh[m.id] || 0)) }))
    .sort((a, b) => (a.stock / (a.minStock || 1)) - (b.stock / (b.minStock || 1)));
}

/** Total stock value at the last purchase rate (fallback: item rate). */
export function stockValue(S) {
  const soh = stockOnHand(S);
  const lastRate = {};
  (S.inventoryTx || []).forEach(tx => {
    if (tx.type === 'IN' && tx.rate && (!lastRate[tx.rawMaterialId] || (tx.date || '') >= lastRate[tx.rawMaterialId].d)) lastRate[tx.rawMaterialId] = { d: tx.date || '', r: _num(tx.rate) };
  });
  return (S.rawMaterials || []).reduce((s, m) => s + Math.max(0, soh[m.id] || 0) * (lastRate[m.id]?.r || _num(m.rate)), 0);
}

/**
 * Udhaar (credit) book: what each customer still owes = billed − settled
 * (cash + deductions), same basis as the Parties ledger. Only customers with
 * something due, biggest first.
 */
export function customerDues(S) {
  return (S.clients || []).map(c => {
    const billed = (S.abstracts || []).filter(a => a.clientId === c.id && a.status !== 'invoiced').reduce((s, a) => s + _num(a.totalAmount), 0)
      + (S.invoices || []).filter(i => i.clientId === c.id && i.status !== 'Cancelled').reduce((s, i) => s + _num(i.taxAmount), 0)
      + (S.saleInvoices || []).filter(i => i.clientId === c.id && i.status !== 'Cancelled').reduce((s, i) => s + _num(i.grandTotal || i.total), 0);
    const pays = (S.paymentsIn || []).filter(p => p.clientId === c.id);
    const paid = pays.reduce((s, p) => s + settledAmount(p), 0);
    const lastPay = pays.map(p => p.date || '').sort().pop() || '';
    const lastBill = (S.saleInvoices || []).filter(i => i.clientId === c.id && i.status !== 'Cancelled').map(i => i.date || '').sort().pop() || '';
    const due = Math.round((billed - paid) * 100) / 100;
    return { id: c.id, name: c.name || '—', phone: c.phone || c.mobile || '', billed, paid, due, lastPay, lastBill };
  }).filter(r => r.due > 0.5).sort((a, b) => b.due - a.due);
}

/** Sales total (non-cancelled sale invoices) between two yyyy-mm-dd dates inclusive. */
export function salesBetween(S, from, to) {
  return (S.saleInvoices || []).filter(i => i.status !== 'Cancelled' && (i.date || '') >= from && (i.date || '') <= to)
    .reduce((s, i) => s + _num(i.grandTotal || i.total), 0);
}

/** WhatsApp link with a polite payment reminder. Indian 10-digit numbers get +91. */
export function whatsappReminderLink({ phone = '', name = '', due = 0, business = '', fmt } = {}) {
  const f = typeof fmt === 'function' ? fmt : (n) => '₹' + Math.round(_num(n)).toLocaleString('en-IN');
  let digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) digits = '91' + digits;
  if (digits.length === 11 && digits.startsWith('0')) digits = '91' + digits.slice(1);
  const msg = `Namaste ${name || ''}, this is a gentle reminder that ${f(due)} is pending${business ? ' with ' + business : ''}. Kindly pay at your earliest convenience. Thank you!`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
}

