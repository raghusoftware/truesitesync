import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partyRows, balanceSide, partyTotals, filterParties, partyEntries } from '../js/modules/partyCalc.js';

const S = {
  clients: [{ id: 'c1', name: 'Nexcel' }],
  abstracts: [{ id: 'a1', clientId: 'c1', totalAmount: 1000, date: '2026-01-05' }],
  paymentsIn: [{ id: 'p1', clientId: 'c1', amount: 600, deductions: [{ type: 'tds', amount: 100 }], date: '2026-02-01' }],
  vendors: [{ id: 'v1', name: 'Steel Co', phone: '98250' }],
  vendorMaterials: [{ id: 'm1', vendorId: 'v1', totalAmount: 500, date: '2026-01-02' }],
  vendorPayments: [{ id: 'vp1', vendorId: 'v1', amount: 700, date: '2026-01-03' }],
  labourMaster: [{ id: 'l1', name: 'Dharmendrasinh', trade: 'Carpenter' }, { id: 'l2', name: 'Under gang', contractorId: 'g1' }],
  labourSalaries: [{ id: 's1', labourId: 'l1', amount: 800, date: '2026-01-31' }, { id: 's2', labourId: 'l2', amount: 300 }],
  labourPayments: [],
  labourContractors: [{ id: 'g1', name: 'Ramesh Gang' }, { id: 'g2', name: 'Idle Gang' }],
};

test('partyRows balances (settled amount includes deductions)', () => {
  const rows = partyRows(S);
  const by = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.equal(by.c1.balance, 300);          // 1000 billed − (600 cash + 100 TDS)
  assert.equal(by.v1.balance, -200);         // overpaid supplier → advance
  assert.equal(by.l1.balance, 800);
  assert.equal(by.l2, undefined);            // settles through the contractor
  assert.equal(by.g1.balance, 300);          // wages of workers under the gang
  assert.equal(by.g2, undefined);            // no activity → hidden
  assert.deepEqual(rows.map(r => r.name), ['Dharmendrasinh', 'Nexcel', 'Ramesh Gang', 'Steel Co']);
});

test('balanceSide and totals', () => {
  const rows = partyRows(S);
  const side = Object.fromEntries(rows.map(r => [r.id, balanceSide(r)]));
  assert.deepEqual(side, { l1: 'payable', c1: 'receivable', g1: 'payable', v1: 'receivable' });
  assert.deepEqual(partyTotals(rows), { receivable: 500, payable: 1100 });
  assert.equal(balanceSide({ type: 'Client', balance: 0.001 }), 'settled');
});

test('filterParties by chip and text', () => {
  const rows = partyRows(S);
  assert.deepEqual(filterParties(rows, { type: 'Vendor' }).map(r => r.id), ['v1']);
  assert.deepEqual(filterParties(rows, { q: 'carp' }).map(r => r.id), ['l1']);
  assert.deepEqual(filterParties(rows, { q: '98250' }).map(r => r.id), ['v1']);
});

test('partyEntries running balance', () => {
  const c = partyEntries(S, 'c1', 'Client');
  assert.deepEqual(c.map(e => [e.type, e.total, e.running]), [['Sale (Abstract)', 1000, 1000], ['Payment In', 700, 300]]);
  const v = partyEntries(S, 'v1', 'Vendor');
  assert.deepEqual(v.map(e => e.running), [500, -200]);
  const g = partyEntries(S, 'g1', 'Contractor');
  assert.equal(g[0].type, 'Labour Wages');
  assert.equal(g[0].running, 300);
});
