/* ============================================================================
 * True Site Sync — CASH FLOW
 * Phase 1: Command Center (Net cash, AR/AP days, profit, 30-day forecast)
 * Phase 2: Client A/B/C Scorecard + 3-Leak Detector
 * Intelligence layer — reads live from every money module, no new storage.
 * ==========================================================================*/
import { state } from './state.js';
import { getCurrencySymbol } from './utils.js';

const N = (v) => parseFloat(v) || 0;
const _days = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; };
const _inLast = (dateStr, n) => dateStr && dateStr >= _days(n);
const _age = (d) => d ? Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 86400000)) : 0;
const fmt = (v) => getCurrencySymbol() + Math.round(N(v)).toLocaleString('en-IN');
const fmt1 = (v) => Math.round(N(v) * 10) / 10;

let _cfTab = 'overview';

// ── AGGREGATIONS ────────────────────────────────────────────────────────────
function _billed(period) {
  const inP = (d) => period == null ? true : _inLast(d, period);
  let v = 0;
  (state.saleInvoices || []).filter(i => i.status !== 'Cancelled' && inP(i.date)).forEach(i => v += N(i.total));
  (state.invoices || []).filter(i => i.status !== 'Cancelled' && inP(i.date)).forEach(i => v += N(i.taxAmount));
  (state.abstracts || []).filter(a => a.status !== 'invoiced' && inP(a.date)).forEach(a => v += N(a.totalAmount));
  return v;
}
function _received(period) {
  const inP = (d) => period == null ? true : _inLast(d, period);
  return (state.paymentsIn || []).filter(p => p.clientId && inP(p.date)).reduce((s, p) => s + N(p.amount), 0);
}
function _purchased(period) { const inP = (d) => period == null ? true : _inLast(d, period); return (state.vendorMaterials || []).filter(m => inP(m.date)).reduce((s, m) => s + (N(m.totalAmount) || N(m.amount)), 0); }
function _vendorPaid(period) { const inP = (d) => period == null ? true : _inLast(d, period); return (state.vendorPayments || []).filter(p => inP(p.date)).reduce((s, p) => s + N(p.amount), 0); }
function _expenses(period) { const inP = (d) => period == null ? true : _inLast(d, period); return (state.expenses || []).filter(e => inP(e.date)).reduce((s, e) => s + N(e.amount), 0); }
function _labourBilled(period) { const inP = (d) => period == null ? true : _inLast(d, period); return (state.labourSalaries || []).filter(l => inP(l.date)).reduce((s, l) => s + N(l.amount), 0); }
function _labourPaid(period) { const inP = (d) => period == null ? true : _inLast(d, period); return (state.labourPayments || []).filter(l => inP(l.date)).reduce((s, l) => s + N(l.amount), 0); }

function cashPosition() {
  const inAll = (state.paymentsIn || []).reduce((s, p) => s + N(p.amount), 0);
  return inAll - (_vendorPaid(null) + _expenses(null) + _labourPaid(null));
}
function arOutstanding() { return Math.max(0, _billed(null) - _received(null)); }
function apOutstanding() { return Math.max(0, _purchased(null) - _vendorPaid(null)); }
function labourDue() { return Math.max(0, _labourBilled(null) - _labourPaid(null)); }
function arDays() { const rev = _billed(90); return rev > 0 ? Math.round(arOutstanding() / (rev / 90)) : 0; }
function apDays() { const pur = _purchased(90); return pur > 0 ? Math.round(apOutstanding() / (pur / 90)) : 0; }

/** Live stock by material (derived from inventoryTx: IN adds, OUT subtracts). */
function _stockByMaterial() {
  const map = {};
  (state.inventoryTx || []).forEach(tx => {
    const id = tx.rawMaterialId || tx.itemId; if (!id) return;
    if (!map[id]) map[id] = { qty: 0, rate: 0, lastDate: '' };
    const q = N(tx.qty);
    if (tx.type === 'OUT') map[id].qty -= q; else { map[id].qty += q; if (N(tx.rate)) map[id].rate = N(tx.rate); }
    if (tx.date && tx.date > map[id].lastDate) map[id].lastDate = tx.date;
  });
  return map;
}
function inventoryValue() { return Object.values(_stockByMaterial()).reduce((s, x) => s + Math.max(0, x.qty) * x.rate, 0); }
function inventoryDays() { const c = _purchased(90) + _labourBilled(90); return c > 0 ? Math.round(inventoryValue() / (c / 90)) : 0; }

function profitScorecard(period) {
  const revenue = _billed(period), cogs = _purchased(period) + _labourBilled(period), opex = _expenses(period);
  const gross = revenue - cogs, net = gross - opex;
  return { revenue, cogs, gross, opex, net, margin: revenue > 0 ? (net / revenue) * 100 : 0 };
}
function forecast30() {
  const inflow = arOutstanding(), runRate = _expenses(90) / 3;
  const outflow = apOutstanding() + labourDue() + runRate, opening = cashPosition();
  return { opening, inflow, outflow, net: inflow - outflow, projected: opening + inflow - outflow };
}

// ── CLIENT SCORECARD (Phase 2) ──────────────────────────────────────────────
function clientScores() {
  const invForClient = (id) => {
    const rows = [];
    (state.saleInvoices || []).filter(i => i.clientId === id && i.status !== 'Cancelled').forEach(i => rows.push({ date: i.date, amount: N(i.total) }));
    (state.invoices || []).filter(i => i.clientId === id && i.status !== 'Cancelled').forEach(i => rows.push({ date: i.date, amount: N(i.taxAmount) }));
    (state.abstracts || []).filter(a => a.clientId === id && a.status !== 'invoiced').forEach(a => rows.push({ date: a.date, amount: N(a.totalAmount) }));
    return rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  };
  const out = (state.clients || []).map(c => {
    const invs = invForClient(c.id);
    const billed = invs.reduce((s, i) => s + i.amount, 0);
    const received = (state.paymentsIn || []).filter(p => p.clientId === c.id).reduce((s, p) => s + N(p.amount), 0);
    // FIFO: apply receipts to the oldest invoices first → remaining are the real unpaid.
    let pool = received; const unpaid = [];
    invs.forEach(iv => { if (pool >= iv.amount) { pool -= iv.amount; } else { unpaid.push({ date: iv.date, amount: iv.amount - pool }); pool = 0; } });
    const totUnpaid = unpaid.reduce((s, u) => s + u.amount, 0);
    const avgDays = totUnpaid > 0 ? Math.round(unpaid.reduce((s, u) => s + u.amount * _age(u.date), 0) / totUnpaid) : 0;
    return { id: c.id, name: c.name, billed, received, outstanding: Math.max(0, billed - received), orders: invs.length, avgDays };
  }).filter(c => c.billed > 0 || c.received > 0);
  const maxBilled = Math.max(1, ...out.map(c => c.billed));
  out.forEach(c => {
    const paymentSpeed = c.outstanding <= 1 ? 100 : Math.max(0, Math.min(100, 100 - c.avgDays));  // pays fast → high
    const value = Math.round(c.billed / maxBilled * 100);                                          // revenue contribution
    const freq = Math.min(100, c.orders * 25);                                                     // repeat business
    const score = Math.round(0.45 * paymentSpeed + 0.30 * value + 0.25 * freq);
    Object.assign(c, { paymentSpeed: Math.round(paymentSpeed), value, freq: Math.round(freq), score, grade: score >= 70 ? 'A' : score >= 45 ? 'B' : 'C' });
  });
  return out.sort((a, b) => b.score - a.score);
}

// ── 3-LEAK DETECTOR (Phase 2) ───────────────────────────────────────────────
function detectLeaks() {
  const scores = clientScores();
  const late = scores.filter(c => c.outstanding > 1 && c.avgDays > 45);
  const m = _stockByMaterial(), cutoff = _days(60);
  let slowVal = 0, slowCount = 0;
  Object.values(m).forEach(x => { const v = Math.max(0, x.qty) * x.rate; if (v > 0 && (!x.lastDate || x.lastDate < cutoff)) { slowVal += v; slowCount++; } });
  const redCats = ['bulk', 'misc', 'repair', 'maintenance', 'penalty', 'fine', 'unplanned', 'withdrawal'];
  const waste = (state.expenses || []).filter(e => _inLast(e.date, 90) && redCats.some(r => (e.category || '').toLowerCase().includes(r)));
  return {
    late: { amount: late.reduce((s, c) => s + c.outstanding, 0), count: late.length, items: late },
    slowInv: { amount: slowVal, count: slowCount },
    waste: { amount: waste.reduce((s, e) => s + N(e.amount), 0), count: waste.length, items: waste },
  };
}

// ── UI HELPERS ──────────────────────────────────────────────────────────────
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
const _gradeBadge = (g) => { const c = g === 'A' ? '#059669' : g === 'B' ? '#d97706' : '#dc2626'; const bg = g === 'A' ? '#ecfdf5' : g === 'B' ? '#fffbeb' : '#fef2f2'; return `<span style="display:inline-flex;width:26px;height:26px;border-radius:8px;background:${bg};color:${c};font-weight:800;font-size:13px;align-items:center;justify-content:center;border:1px solid ${c}33;">${g}</span>`; };

// ── SECTION RENDERERS ─────────────────────────────────────────────────────────
function _renderOverview() {
  const cash = cashPosition(), ar = arOutstanding(), ap = apOutstanding();
  const dso = arDays(), dpo = apDays(), invD = inventoryDays(), ccc = dso + invD - dpo;
  const f = forecast30(), ps = profitScorecard(90);
  const projColor = f.projected >= 0 ? '#059669' : '#dc2626';
  const cccColor = ccc <= 30 ? '#059669' : ccc <= 60 ? '#d97706' : '#dc2626';
  const recv = clientScores().filter(c => c.outstanding > 1).slice(0, 5);
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:14px;">
      ${_tile('Net Cash Position', fmt(cash), 'Money in − money out', cash >= 0 ? '#0f172a' : '#dc2626', '🏦')}
      ${_tile('Expected Inflow · 30d', fmt(f.inflow), 'Outstanding receivables', '#059669', '📥')}
      ${_tile('Expected Outflow · 30d', fmt(f.outflow), 'Vendors + labour + OpEx', '#dc2626', '📤')}
      ${_tile('Projected Cash · 30d', fmt(f.projected), f.net >= 0 ? 'Surplus expected' : 'Gap — act now', projColor, f.projected >= 0 ? '✅' : '⚠️')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:14px;">
      ${_tile('Receivables (AR)', fmt(ar), dso + ' AR days (DSO)', '#2563eb', '⏳')}
      ${_tile('Payables (AP)', fmt(ap), dpo + ' AP days (DPO)', '#ea580c', '🧾')}
      ${_tile('Inventory Locked', fmt(inventoryValue()), invD + ' inventory days', '#7c3aed', '📦')}
      ${_tile('Cash Conversion Cycle', ccc + ' days', ccc <= 30 ? 'Healthy' : ccc <= 60 ? 'Watch' : 'Too slow', cccColor, '🔄')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><h3 style="font-size:14px;font-weight:800;color:#0f172a;">📊 Profit Scorecard</h3><span style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;">Last 90 days</span></div>
        ${_scoreRow('Revenue', fmt(ps.revenue))}
        ${_scoreRow('− Direct cost (materials + labour)', fmt(ps.cogs), false, '#64748b')}
        ${_scoreRow('= Gross Profit', fmt(ps.gross), true, ps.gross >= 0 ? '#059669' : '#dc2626')}
        ${_scoreRow('− Operating expenses', fmt(ps.opex), false, '#64748b')}
        ${_scoreRow('= Net Profit', fmt(ps.net), true, ps.net >= 0 ? '#059669' : '#dc2626')}
        <div style="margin-top:10px;padding:10px;border-radius:10px;background:${ps.margin >= 10 ? '#ecfdf5' : ps.margin >= 0 ? '#fffbeb' : '#fef2f2'};display:flex;justify-content:space-between;align-items:center;"><span style="font-size:12px;font-weight:700;color:#334155;">Net Margin</span><span style="font-size:18px;font-weight:800;color:${ps.margin >= 10 ? '#059669' : ps.margin >= 0 ? '#d97706' : '#dc2626'};">${fmt1(ps.margin)}%</span></div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;">
        <h3 style="font-size:14px;font-weight:800;color:#0f172a;margin-bottom:10px;">💧 Where your cash is stuck</h3>
        ${recv.length ? recv.map(r => `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #f1f5f9;"><span style="font-size:13px;color:#334155;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:55%;">${r.name} <span style="font-size:10px;color:#94a3b8;">· ${r.avgDays}d</span></span><span style="font-size:14px;font-weight:800;color:#dc2626;">${fmt(r.outstanding)}</span></div>`).join('') : '<p style="font-size:12px;color:#94a3b8;padding:8px 0;">No outstanding receivables — clean book! 🎉</p>'}
        ${recv.length ? `<p style="font-size:11px;color:#64748b;margin-top:10px;">👉 Chase your top 1–2 first. <b>Speed beats size.</b></p>` : ''}
      </div>
    </div>`;
}

function _renderClients() {
  const rows = clientScores();
  const cur = getCurrencySymbol();
  const aCount = rows.filter(r => r.grade === 'A').length;
  if (!rows.length) return '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;text-align:center;color:#94a3b8;font-size:13px;">No client billing yet — create sales invoices to score your clients.</div>';
  return `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
      <div style="padding:14px 18px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div><h3 style="font-size:14px;font-weight:800;color:#0f172a;">⭐ Client Scorecard (A / B / C)</h3><p style="font-size:11px;color:#94a3b8;">Payment speed (45%) · revenue value (30%) · order frequency (25%)</p></div>
        <span style="font-size:11px;font-weight:700;color:#059669;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:999px;padding:4px 10px;">${aCount} A-grade client${aCount === 1 ? '' : 's'}</span>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:640px;">
          <thead><tr style="background:#f8fafc;color:#64748b;text-transform:uppercase;font-size:10px;font-weight:800;">
            <th style="padding:9px 12px;text-align:left;">Client</th><th style="padding:9px 12px;text-align:center;">Orders</th><th style="padding:9px 12px;text-align:right;">Billed</th><th style="padding:9px 12px;text-align:right;">Outstanding</th><th style="padding:9px 12px;text-align:center;">Pays in</th><th style="padding:9px 12px;text-align:center;">Speed</th><th style="padding:9px 12px;text-align:center;">Value</th><th style="padding:9px 12px;text-align:center;">Score</th><th style="padding:9px 12px;text-align:center;">Grade</th>
          </tr></thead>
          <tbody>
          ${rows.map(c => `<tr style="border-top:1px solid #f1f5f9;">
            <td style="padding:9px 12px;font-weight:700;color:#0f172a;">${c.name}</td>
            <td style="padding:9px 12px;text-align:center;color:#475569;">${c.orders}</td>
            <td style="padding:9px 12px;text-align:right;color:#334155;">${cur}${Math.round(c.billed).toLocaleString('en-IN')}</td>
            <td style="padding:9px 12px;text-align:right;font-weight:700;color:${c.outstanding > 1 ? '#dc2626' : '#94a3b8'};">${cur}${Math.round(c.outstanding).toLocaleString('en-IN')}</td>
            <td style="padding:9px 12px;text-align:center;color:${c.avgDays > 45 ? '#dc2626' : c.avgDays > 0 ? '#d97706' : '#059669'};font-weight:700;">${c.outstanding <= 1 ? '✓ paid' : c.avgDays + 'd'}</td>
            <td style="padding:9px 12px;text-align:center;">${_bar(c.paymentSpeed)}</td>
            <td style="padding:9px 12px;text-align:center;">${_bar(c.value)}</td>
            <td style="padding:9px 12px;text-align:center;font-weight:800;color:#0f172a;">${c.score}</td>
            <td style="padding:9px 12px;text-align:center;">${_gradeBadge(c.grade)}</td>
          </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="padding:14px 18px;background:#f0fdf4;border-top:1px solid #dcfce7;font-size:12px;color:#166534;"><b>Grow your A-clients:</b> give them priority service & flexible terms — they pay fast and order often. Put <b>C-clients</b> on advance/partial payment.</div>
    </div>`;
}
const _bar = (pct) => `<div style="display:inline-block;width:54px;height:7px;border-radius:4px;background:#e2e8f0;overflow:hidden;vertical-align:middle;"><div style="width:${Math.max(3, pct)}%;height:100%;background:${pct >= 70 ? '#059669' : pct >= 45 ? '#d97706' : '#dc2626'};"></div></div>`;

function _renderLeaks() {
  const L = detectLeaks();
  const card = (icon, title, amount, count, desc, action, color) => `
    <div style="background:#fff;border:1px solid #e2e8f0;border-left:4px solid ${color};border-radius:16px;padding:18px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <div><div style="font-size:22px;">${icon}</div><h3 style="font-size:14px;font-weight:800;color:#0f172a;margin-top:6px;">${title}</h3></div>
        <div style="text-align:right;"><div style="font-size:22px;font-weight:800;color:${color};">${fmt(amount)}</div><div style="font-size:10px;color:#94a3b8;font-weight:700;">${count} item${count === 1 ? '' : 's'}</div></div>
      </div>
      <p style="font-size:12px;color:#64748b;margin:6px 0;">${desc}</p>
      <p style="font-size:12px;font-weight:700;color:${color};">👉 ${action}</p>
    </div>`;
  const total = L.late.amount + L.slowInv.amount + L.waste.amount;
  return `
    <div style="background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:16px;padding:18px;margin-bottom:14px;color:#fff;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;">Total cash leaking</div><div style="font-size:28px;font-weight:800;color:#fca5a5;">${fmt(total)}</div></div>
      <div style="font-size:12px;color:#cbd5e1;max-width:300px;">Plug these 3 leaks and the cash returns to your bank — no new sales needed.</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;">
      ${card('⏳', 'Late-paying customers', L.late.amount, L.late.count, 'Receivables aged over 45 days — the slowest cash in your business.', 'Run the 3-strike follow-up: friendly reminder → confirm release date → escalate.', '#dc2626')}
      ${card('📦', 'Slow-moving inventory', L.slowInv.amount, L.slowInv.count, 'Stock with no movement in 60+ days — cash frozen on the shelf.', 'Use it on the next project, return to vendor, or stop re-ordering it.', '#7c3aed')}
      ${card('🔥', 'Wasteful expenses', L.waste.amount, L.waste.count, 'Red-flag spends (bulk/unplanned/repair/penalty) in the last 90 days.', 'Review each — convert unplanned buys into planned, budgeted purchases.', '#ea580c')}
    </div>`;
}

// ── ENTRY ──────────────────────────────────────────────────────────────────
window._cfSwitchTab = function (t) { _cfTab = t; renderCashFlow(); };

export function renderCashFlow() {
  const root = document.getElementById('cashFlowRoot');
  if (!root) return;
  const tab = (id, label, icon) => `<button onclick="window._cfSwitchTab('${id}')" style="padding:8px 16px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;border:1px solid ${_cfTab === id ? 'transparent' : '#e2e8f0'};background:${_cfTab === id ? 'linear-gradient(135deg,#059669,#10b981)' : '#fff'};color:${_cfTab === id ? '#fff' : '#475569'};">${icon} ${label}</button>`;
  const body = _cfTab === 'clients' ? _renderClients() : _cfTab === 'leaks' ? _renderLeaks() : _renderOverview();
  root.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
      <div>
        <h2 class="text-2xl font-extrabold text-slate-800">Cash Flow Command Center</h2>
        <p class="text-slate-500 text-sm font-medium mt-0.5">Live across Sales, Purchase, Expenses, Payroll & Bank — speed of money is everything.</p>
      </div>
      <button onclick="window.renderCashFlow()" class="text-xs font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 px-3 py-2 rounded-lg hover:bg-emerald-100 transition">↻ Refresh</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
      ${tab('overview', 'Overview', '🎯')}${tab('clients', 'Client Scorecard', '⭐')}${tab('leaks', 'Leak Detector', '💧')}
    </div>
    ${body}
    <p style="font-size:11px;color:#94a3b8;margin-top:14px;text-align:center;">Coming next: 30-day tiered forecast · weekly cash planner · finance calendar · vendor &amp; credit policy.</p>`;
}

if (typeof window !== 'undefined') window.renderCashFlow = renderCashFlow;
