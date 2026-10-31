import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movements, balances, applyFilter, groupByDay, filterCount, totals, accountKind } from '../js/modules/bankCashCalc.js';

const T = '2026-10-31';
const S = {
  accounts: [
    { id: 'a1', name: 'HDFC Current', type: 'Current', openingBalance: 100000 },
    { id: 'a2', name: 'Site Cash', type: 'Cash', openingBalance: 5000 },
    { id: 'a3', name: 'SBI OD', type: 'OD', openingBalance: 0, sanctionedLimit: 500000 },
  ],
  clients: [{ id: 'c1', name: 'L&T' }], vendors: [{ id: 'v1', name: 'UltraTech' }], labourMaster: [{ id: 'l1', name: 'Ramesh' }],
  paymentsIn: [{ id: 'p1', clientId: 'c1', accountId: 'a1', amount: 50000, date: '2026-10-30', ref: 'RA-3' }],
  otherIncome: [{ id: 'o1', accountId: 'a1', amount: 20000, date: '2026-10-01', source: 'Owner capital' }],
  vendorPayments: [{ id: 'v1p', vendorId: 'v1', accountId: 'a3', amount: 80000, date: '2026-10-29' }],
  labourPayments: [{ id: 'lp', labourId: 'l1', accountId: 'a2', amount: 1200, date: T }],
  expenses: [{ id: 'e1', accountId: 'a2', amount: 300, date: T, category: 'Site', subHead: 'Tea' }, { id: 'e2', amount: 999, date: T }],
  accountTransfers: [{ id: 't1', fromAccountId: 'a1', toAccountId: 'a2', amount: 10000, date: '2026-10-30' }],
  pettyCashTxns: [{ id: 'pc', type: 'TRANSFER', fromAccountId: 'a2', custodianId: 'k1', amount: 2000, date: T }],
  pettyCashCustodians: [{ id: 'k1', name: 'Amit' }],
};

test('accountKind', () => {
  assert.deepEqual(['Cash', 'Current', 'Wallet', 'OD', 'Loan'].map(t => accountKind({ type: t })), ['cash', 'bank', 'bank', 'credit', 'credit']);
});

test('movements + balances: signed, newest first, every source, available = cash + bank', () => {
  const m = movements(S);
  assert.equal(m.length, 8);                                  // expense without account is ignored; transfer = 2 legs
  assert.equal(m[0].date, T);
  assert.deepEqual(m.find(x => x.id === 'p1'), { ...m.find(x => x.id === 'p1'), amount: 50000, dir: 'in', type: 'receipt', party: 'L&T', kind: 'bank' });
  assert.equal(m.find(x => x.id === 'v1p').amount, -80000);
  const b = balances(S, m);
  const by = Object.fromEntries(b.accounts.map(a => [a.id, a.balance]));
  assert.deepEqual(by, { a1: 160000, a2: 11500, a3: -80000 });
  assert.deepEqual([b.cash, b.bank, b.credit, b.available], [11500, 160000, -80000, 171500]);
});

test('applyFilter + groupByDay + totals + filterCount', () => {
  const m = movements(S);
  assert.equal(applyFilter(m, { period: '7d' }, T).length, 7);           // owner capital on the 1st drops out
  assert.equal(applyFilter(m, { kind: 'cash' }, T).length, 4);
  assert.deepEqual(applyFilter(m, { dir: 'in', hideTransfers: true }, T).map(x => x.id), ['p1', 'o1']);
  assert.deepEqual(applyFilter(m, { types: ['labour', 'expense'] }, T).map(x => x.id).sort(), ['e1', 'lp']);
  assert.deepEqual(applyFilter(m, { q: 'ultratech' }, T).map(x => x.id), ['v1p']);
  assert.deepEqual(applyFilter(m, { min: 10000, max: 60000 }, T).map(x => x.amount).sort((a, b) => a - b), [-10000, 10000, 20000, 50000]);
  assert.deepEqual(applyFilter(m, { accounts: ['a3'] }, T).map(x => x.id), ['v1p']);
  assert.deepEqual(applyFilter(m, { from: '2026-10-29', to: '2026-10-30' }, T).length, 4);
  const g = groupByDay(applyFilter(m, { kind: 'cash' }, T), T);
  assert.deepEqual(g.map(d => [d.date, d.label, d.net]), [[T, 'Today', -3500], ['2026-10-30', 'Yesterday', 10000]]);
  assert.deepEqual(totals(m), { in: 80000, out: 93500, net: -13500, count: 8 });
  assert.equal(filterCount({ period: '7d', kind: 'cash', accounts: ['a1'], q: 'x', min: 5 }), 5);
  assert.equal(filterCount({}), 0);
});
