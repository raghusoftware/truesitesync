/**
 * bankCashCalc.js — Bank & Cash maths (no DOM, unit-tested).
 *
 *   accountKind(acc)          'cash' | 'bank' | 'credit'   (CC / OD / loan / credit card = borrowed money)
 *   balances(S)               per-account balance (opening + every movement) and the header totals:
 *                             Total available = cash in hand + bank balance (credit lines shown apart)
 *   movements(S)              every money movement as one signed list, newest first
 *   applyFilter(list, f, today)  the chip + advanced filters, applied client-side in one pass
 *   groupByDay(list, today)   date sections with the day's net
 *   PERIODS / TYPES           filter vocabularies shared with the UI
 */

const N = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
const r2 = v => Math.round(N(v) * 100) / 100;

export const CREDIT_TYPES = ['CC', 'OD', 'Loan', 'CreditCard'];
export const accountKind = a => (CREDIT_TYPES.includes(a?.type) ? 'credit' : a?.type === 'Cash' ? 'cash' : 'bank');

/** Movement types (what the money was for). */
export const TYPES = {
  receipt: 'Client receipts', income: 'Other income', supplier: 'Supplier payments', labour: 'Labour & wages',
  expense: 'Expenses', equipment: 'Equipment', transfer: 'Transfers', petty: 'Petty cash',
};

const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Period presets → [from, to] (inclusive ISO dates). */
export const PERIODS = {
  today: { label: 'Today', range: t => [t, t] },
  '7d': { label: 'Last 7 days', range: t => [addDays(t, -6), t] },
  '30d': { label: 'Last 30 days', range: t => [addDays(t, -29), t] },
  month: { label: 'This month', range: t => [t.slice(0, 8) + '01', t] },
  lastMonth: { label: 'Last month', range: t => { const first = t.slice(0, 8) + '01'; const end = addDays(first, -1); return [end.slice(0, 8) + '01', end]; } },
  fy: { label: 'This FY', range: t => { const y = +t.slice(0, 4), m = +t.slice(5, 7); const s = m >= 4 ? y : y - 1; return [`${s}-04-01`, t]; } },
};

/** Every movement touching a bank / cash account, signed (+ in, − out), newest first. */
export function movements(S) {
  const acc = {}; (S.accounts || []).forEach(a => { acc[a.id] = a; });
  const name = (k, id) => (S[k] || []).find(x => x.id === id)?.name || '';
  const out = [];
  const add = (r, accountId, amount, o) => {
    if (!accountId || !acc[accountId] || !(N(amount) > 0)) return;
    const a = acc[accountId];
    out.push({ id: r.id, src: o.src, accountId, accountName: a.name || 'Account', kind: accountKind(a), date: (r.date || '').slice(0, 10),
      amount: r2(o.dir === 'in' ? N(amount) : -N(amount)), dir: o.dir, type: o.type, party: o.party || '', note: o.note || '', leg: o.leg || '' });
  };
  (S.paymentsIn || []).forEach(p => add(p, p.accountId, p.amount, { src: 'paymentsIn', dir: 'in', type: p.clientId ? 'receipt' : 'income', party: name('clients', p.clientId) || p.ref || 'Deposit', note: p.clientId ? p.ref : '' }));
  (S.otherIncome || []).forEach(o => add(o, o.accountId, o.amount, { src: 'otherIncome', dir: 'in', type: 'income', party: o.source || 'Other income', note: o.ref }));
  (S.vendorPayments || []).forEach(v => add(v, v.accountId, v.amount, { src: 'vendorPayments', dir: 'out', type: 'supplier', party: name('vendors', v.vendorId) || 'Supplier', note: v.ref }));
  (S.labourPayments || []).forEach(l => add(l, l.accountId, l.amount, { src: 'labourPayments', dir: 'out', type: 'labour', party: name('labourMaster', l.labourId) || 'Labour', note: l.ref }));
  (S.expenses || []).forEach(e => add(e, e.accountId, e.amount, {
    src: 'expenses', dir: 'out', type: e.gangId || e.head === 'Labour' ? 'labour' : 'expense',
    party: e.party || (e.gangId ? name('labourContractors', e.gangId) : '') || e.category || 'Expense', note: [e.subHead, e.remarks || e.ref].filter(Boolean).join(' · ') }));
  (S.equipmentLogs || []).forEach(e => add(e, e.accountId, e.amount, { src: 'equipmentLogs', dir: 'out', type: 'equipment', party: name('equipmentList', e.assetId) || 'Equipment', note: e.type }));
  (S.accountTransfers || []).forEach(t => {
    add(t, t.fromAccountId, t.amount, { src: 'accountTransfers', dir: 'out', type: 'transfer', party: 'To ' + (acc[t.toAccountId]?.name || 'account'), note: t.note || t.ref, leg: 'from' });
    add(t, t.toAccountId, t.amount, { src: 'accountTransfers', dir: 'in', type: 'transfer', party: 'From ' + (acc[t.fromAccountId]?.name || 'account'), note: t.note || t.ref, leg: 'to' });
  });
  (S.pettyCashTxns || []).forEach(t => {
    const who = (S.pettyCashCustodians || []).find(c => c.id === t.custodianId)?.name || 'custodian';
    if (t.type === 'TRANSFER') add(t, t.fromAccountId, t.amount, { src: 'pettyCashTxns', dir: 'out', type: 'petty', party: 'Petty cash → ' + who, note: t.note });
    if (t.type === 'RETURN') add(t, t.toAccountId, t.amount, { src: 'pettyCashTxns', dir: 'in', type: 'petty', party: 'Petty cash ← ' + who, note: t.note });
  });
  return out.sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
}

/** Balances per account and the header split. */
export function balances(S, list = movements(S)) {
  const per = {};
  (S.accounts || []).forEach(a => { per[a.id] = { id: a.id, name: a.name || 'Account', type: a.type || 'Cash', kind: accountKind(a), balance: N(a.openingBalance), limit: N(a.sanctionedLimit) }; });
  list.forEach(m => { if (per[m.accountId]) per[m.accountId].balance += m.amount; });
  const accounts = Object.values(per).map(a => ({ ...a, balance: r2(a.balance) }));
  const sum = k => r2(accounts.filter(a => a.kind === k).reduce((s, a) => s + a.balance, 0));
  const cash = sum('cash'), bank = sum('bank'), credit = sum('credit');
  return { accounts, cash, bank, credit, available: r2(cash + bank) };
}

/**
 * Filters (all optional): { period, from, to, kind:'cash'|'bank', dir:'in'|'out', accounts:[ids], types:[keys],
 *   hideTransfers, q, min, max }
 */
export function applyFilter(list, f = {}, today = new Date().toISOString().slice(0, 10)) {
  let [from, to] = f.period && PERIODS[f.period] ? PERIODS[f.period].range(today) : [f.from || '', f.to || ''];
  const acc = f.accounts && f.accounts.length ? new Set(f.accounts) : null;
  const types = f.types && f.types.length ? new Set(f.types) : null;
  const q = String(f.q || '').trim().toLowerCase();
  const min = N(f.min), max = N(f.max);
  return list.filter(m => (!from || m.date >= from) && (!to || m.date <= to)
    && (!f.kind || m.kind === f.kind) && (!f.dir || m.dir === f.dir)
    && (!acc || acc.has(m.accountId)) && (!types || types.has(m.type))
    && !(f.hideTransfers && m.type === 'transfer')
    && (!min || Math.abs(m.amount) >= min) && (!max || Math.abs(m.amount) <= max)
    && (!q || [m.party, m.note, m.accountName, TYPES[m.type], String(Math.abs(m.amount))].join(' ').toLowerCase().includes(q)));
}

/** How many advanced filters are on (for the filter button badge). */
export function filterCount(f = {}) {
  return ['period', 'kind', 'dir'].filter(k => f[k]).length + (f.from || f.to ? 1 : 0) + ((f.accounts || []).length ? 1 : 0)
    + ((f.types || []).length ? 1 : 0) + (f.hideTransfers ? 1 : 0) + (f.q ? 1 : 0) + (N(f.min) || N(f.max) ? 1 : 0);
}

/** Date sections, newest first: [{ date, label, net, in, out, items }] */
export function groupByDay(list, today = new Date().toISOString().slice(0, 10)) {
  const yest = addDays(today, -1), map = new Map();
  list.forEach(m => { if (!map.has(m.date)) map.set(m.date, []); map.get(m.date).push(m); });
  return [...map.entries()].map(([date, items]) => {
    const inn = r2(items.filter(m => m.amount > 0).reduce((s, m) => s + m.amount, 0)), out = r2(items.filter(m => m.amount < 0).reduce((s, m) => s - m.amount, 0));
    return { date, label: date === today ? 'Today' : date === yest ? 'Yesterday' : '', in: inn, out, net: r2(inn - out), items };
  });
}

/** Totals of a filtered list (for the result summary). */
export function totals(list) {
  const inn = r2(list.filter(m => m.amount > 0).reduce((s, m) => s + m.amount, 0)), out = r2(list.filter(m => m.amount < 0).reduce((s, m) => s - m.amount, 0));
  return { in: inn, out, net: r2(inn - out), count: list.length };
}
