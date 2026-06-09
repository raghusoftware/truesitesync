/* ============================================================================
 * True Site Sync — CASH FLOW (Phase 1: Command Center)
 * ----------------------------------------------------------------------------
 * An intelligence layer — NOT a data-entry screen. It reads live from every
 * money-touching module (Sales, Purchase, Expenses, Payments, Labour, Bank) and
 * computes Net Cash Position, AR/AP Days, the Cash Conversion Cycle, a Profit
 * Scorecard, a 30-day inflow/outflow forecast, and where cash is stuck.
 * No new storage — pure derived analytics on the org-shared state.
 * ==========================================================================*/
import { state } from './state.js';
import { getCurrencySymbol } from './utils.js';

const N = (v) => parseFloat(v) || 0;
const _days = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; };
const _inLast = (dateStr, n) => dateStr && dateStr >= _days(n);
const fmt = (v) => getCurrencySymbol() + Math.round(N(v)).toLocaleString('en-IN');
const fmt1 = (v) => Math.round(N(v) * 10) / 10;

// ── DATA AGGREGATIONS (the engine) ─────────────────────────────────────────

/** Total billed to clients (receivables side). */
function _billed(period) {
  const inP = (d) => period == null ? true : _inLast(d, period);
  let v = 0;
  (state.saleInvoices || []).filter(i => i.status !== 'Cancelled' && inP(i.date)).forEach(i => v += N(i.total));
  (state.invoices || []).filter(i => i.status !== 'Cancelled' && inP(i.date)).forEach(i => v += N(i.taxAmount));
  (state.abstracts || []).filter(a => a.status !== 'invoiced' && inP(a.date)).forEach(a => v += N(a.totalAmount));
  return v;
}
/** Receipts from clients. */
function _received(period) {
  const inP = (d) => period == null ? true : _inLast(d, period);
  return (state.paymentsIn || []).filter(p => p.clientId && inP(p.date)).reduce((s, p) => s + N(p.amount), 0);
}
/** Purchases billed by vendors (payables side). */
function _purchased(period) {
  const inP = (d) => period == null ? true : _inLast(d, period);
  return (state.vendorMaterials || []).filter(m => inP(m.date)).reduce((s, m) => s + (N(m.totalAmount) || N(m.amount)), 0);
}
function _vendorPaid(period) {
  const inP = (d) => period == null ? true : _inLast(d, period);
  return (state.vendorPayments || []).filter(p => inP(p.date)).reduce((s, p) => s + N(p.amount), 0);
}
function _expenses(period) {
  const inP = (d) => period == null ? true : _inLast(d, period);
  return (state.expenses || []).filter(e => inP(e.date)).reduce((s, e) => s + N(e.amount), 0);
}
function _labourBilled(period) {
  const inP = (d) => period == null ? true : _inLast(d, period);
  return (state.labourSalaries || []).filter(l => inP(l.date)).reduce((s, l) => s + N(l.amount), 0);
}
function _labourPaid(period) {
  const inP = (d) => period == null ? true : _inLast(d, period);
  return (state.labourPayments || []).filter(l => inP(l.date)).reduce((s, l) => s + N(l.amount), 0);
}

/** Current cash position = all money in − all money out (across accounts). */
function cashPosition() {
  const inAll = (state.paymentsIn || []).reduce((s, p) => s + N(p.amount), 0);
  const out = _vendorPaid(null) + _expenses(null) + _labourPaid(null);
  return inAll - out;
}

/** Outstanding receivables / payables. */
function arOutstanding() { return Math.max(0, _billed(null) - _received(null)); }
function apOutstanding() { return Math.max(0, _purchased(null) - _vendorPaid(null)); }
function labourDue() { return Math.max(0, _labourBilled(null) - _labourPaid(null)); }

/** AR Days (DSO) and AP Days (DPO) over a 90-day run-rate. */
function arDays() { const rev = _billed(90); return rev > 0 ? Math.round(arOutstanding() / (rev / 90)) : 0; }
function apDays() { const pur = _purchased(90); return pur > 0 ? Math.round(apOutstanding() / (pur / 90)) : 0; }
/** Inventory days — value of stock / daily COGS run-rate (rough). */
function inventoryValue() {
  return (state.rawMaterials || []).reduce((s, r) => s + (N(r.qty || r.stock) * N(r.rate || r.cost || r.price)), 0);
}
function inventoryDays() {
  const cogs90 = _purchased(90) + _labourBilled(90);
  return cogs90 > 0 ? Math.round(inventoryValue() / (cogs90 / 90)) : 0;
}

/** Profit Scorecard over a period (days). */
function profitScorecard(period) {
  const revenue = _billed(period);
  const cogs = _purchased(period) + _labourBilled(period);
  const opex = _expenses(period);
  const gross = revenue - cogs;
  const net = gross - opex;
  return { revenue, cogs, gross, opex, net, margin: revenue > 0 ? (net / revenue) * 100 : 0 };
}

/** 30-day forecast. */
function forecast30() {
  const inflow = arOutstanding();                                   // what clients owe
  const expenseRunRate = _expenses(90) / 3;                         // ~monthly OpEx
  const outflow = apOutstanding() + labourDue() + expenseRunRate;   // vendors + labour + opex
  const opening = cashPosition();
  return { opening, inflow, outflow, net: inflow - outflow, projected: opening + inflow - outflow };
}

/** Where cash is stuck — top clients by outstanding (leak preview). */
function topReceivables(limit = 5) {
  const rows = (state.clients || []).map(c => {
    const billed = (state.saleInvoices || []).filter(i => i.clientId === c.id && i.status !== 'Cancelled').reduce((s, i) => s + N(i.total), 0)
      + (state.invoices || []).filter(i => i.clientId === c.id && i.status !== 'Cancelled').reduce((s, i) => s + N(i.taxAmount), 0)
      + (state.abstracts || []).filter(a => a.clientId === c.id && a.status !== 'invoiced').reduce((s, a) => s + N(a.totalAmount), 0);
    const received = (state.paymentsIn || []).filter(p => p.clientId === c.id).reduce((s, p) => s + N(p.amount), 0);
    return { name: c.name, outstanding: billed - received };
  }).filter(r => r.outstanding > 1).sort((a, b) => b.outstanding - a.outstanding);
  return rows.slice(0, limit);
}

// ── UI ──────────────────────────────────────────────────────────────────────

const _tile = (label, value, sub, color, icon) => `
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,.04);">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div style="min-width:0;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;">${label}</div>
        <div style="font-size:24px;font-weight:800;color:${color};margin-top:4px;line-height:1.1;">${value}</div>
        ${sub ? `<div style="font-size:11px;color:#64748b;margin-top:3px;">${sub}</div>` : ''}
      </div>
      <div style="font-size:22px;opacity:.3;flex-shrink:0;">${icon}</div>
    </div>
  </div>`;

const _scoreRow = (label, value, bold, color) => `
  <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #f1f5f9;">
    <span style="font-size:13px;${bold ? 'font-weight:800;color:#0f172a;' : 'color:#475569;'}">${label}</span>
    <span style="font-size:14px;font-weight:${bold ? '800' : '700'};color:${color || '#0f172a'};">${value}</span>
  </div>`;

export function renderCashFlow() {
  const root = document.getElementById('cashFlowRoot');
  if (!root) return;

  const cash = cashPosition();
  const ar = arOutstanding(), ap = apOutstanding();
  const dso = arDays(), dpo = apDays(), invD = inventoryDays();
  const ccc = dso + invD - dpo;                          // cash conversion cycle
  const f = forecast30();
  const ps = profitScorecard(90);
  const recv = topReceivables(5);

  const projColor = f.projected >= 0 ? '#059669' : '#dc2626';
  const cccColor = ccc <= 30 ? '#059669' : ccc <= 60 ? '#d97706' : '#dc2626';

  root.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:10px;margin-bottom:18px;">
      <div>
        <h2 class="text-2xl font-extrabold text-slate-800">Cash Flow Command Center</h2>
        <p class="text-slate-500 text-sm font-medium mt-0.5">Live across Sales, Purchase, Expenses, Payroll & Bank — speed of money is everything.</p>
      </div>
      <button onclick="window.renderCashFlow()" class="text-xs font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 px-3 py-2 rounded-lg hover:bg-emerald-100 transition">↻ Refresh</button>
    </div>

    <!-- Top KPIs -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:14px;">
      ${_tile('Net Cash Position', fmt(cash), 'Money in − money out (all accounts)', cash >= 0 ? '#0f172a' : '#dc2626', '🏦')}
      ${_tile('Expected Inflow · 30d', fmt(f.inflow), 'Outstanding receivables', '#059669', '📥')}
      ${_tile('Expected Outflow · 30d', fmt(f.outflow), 'Vendors + labour + run-rate OpEx', '#dc2626', '📤')}
      ${_tile('Projected Cash · 30d', fmt(f.projected), f.net >= 0 ? 'Surplus expected' : 'Gap — act now', projColor, f.projected >= 0 ? '✅' : '⚠️')}
    </div>

    <!-- Speed-of-money row -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:14px;">
      ${_tile('Receivables (AR)', fmt(ar), dso + ' AR days (DSO)', '#2563eb', '⏳')}
      ${_tile('Payables (AP)', fmt(ap), dpo + ' AP days (DPO)', '#ea580c', '🧾')}
      ${_tile('Inventory Locked', fmt(inventoryValue()), invD + ' inventory days', '#7c3aed', '📦')}
      ${_tile('Cash Conversion Cycle', ccc + ' days', ccc <= 30 ? 'Healthy' : ccc <= 60 ? 'Watch' : 'Too slow', cccColor, '🔄')}
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;">
      <!-- Profit Scorecard -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <h3 style="font-size:14px;font-weight:800;color:#0f172a;">📊 Profit Scorecard</h3>
          <span style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;">Last 90 days</span>
        </div>
        ${_scoreRow('Revenue', fmt(ps.revenue))}
        ${_scoreRow('− Direct cost (materials + labour)', fmt(ps.cogs), false, '#64748b')}
        ${_scoreRow('= Gross Profit', fmt(ps.gross), true, ps.gross >= 0 ? '#059669' : '#dc2626')}
        ${_scoreRow('− Operating expenses', fmt(ps.opex), false, '#64748b')}
        ${_scoreRow('= Net Profit', fmt(ps.net), true, ps.net >= 0 ? '#059669' : '#dc2626')}
        <div style="margin-top:10px;padding:10px;border-radius:10px;background:${ps.margin >= 10 ? '#ecfdf5' : ps.margin >= 0 ? '#fffbeb' : '#fef2f2'};display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;font-weight:700;color:#334155;">Net Margin</span>
          <span style="font-size:18px;font-weight:800;color:${ps.margin >= 10 ? '#059669' : ps.margin >= 0 ? '#d97706' : '#dc2626'};">${fmt1(ps.margin)}%</span>
        </div>
      </div>

      <!-- Where cash is stuck -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;">
        <h3 style="font-size:14px;font-weight:800;color:#0f172a;margin-bottom:10px;">💧 Where your cash is stuck</h3>
        ${recv.length ? recv.map(r => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #f1f5f9;">
            <span style="font-size:13px;color:#334155;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:62%;">${r.name}</span>
            <span style="font-size:14px;font-weight:800;color:#dc2626;">${fmt(r.outstanding)}</span>
          </div>`).join('') : '<p style="font-size:12px;color:#94a3b8;padding:8px 0;">No outstanding receivables — clean book! 🎉</p>'}
        ${recv.length ? `<p style="font-size:11px;color:#64748b;margin-top:10px;">👉 Chase your top 1–2 here first — fastest cash. <b>Speed beats size.</b></p>` : ''}
      </div>
    </div>

    <p style="font-size:11px;color:#94a3b8;margin-top:14px;text-align:center;">Phase 1 · Net position, AR/AP days, profit & 30-day forecast. Coming next: client A/B/C scorecard, leak detector, weekly planner & finance calendar.</p>
  `;
}

if (typeof window !== 'undefined') window.renderCashFlow = renderCashFlow;
