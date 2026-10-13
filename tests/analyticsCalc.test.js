import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inProject, computeAnalytics } from '../js/modules/analyticsCalc.js';

const S = {
  projects: [{ id: 'P1', name: 'Bhatpur Compound Wall', clientId: 'c1' }, { id: 'P2', name: 'Mall', clientId: 'c2', status: 'Completed' }],
  clients: [{ id: 'c1', name: 'ABC' }, { id: 'c2', name: 'XYZ' }],
  vendors: [{ id: 'v1', name: 'Steel' }, { id: 'v2', name: 'Sand', projectId: 'P2' }],
  labourMaster: [{ id: 'l1', name: 'Ram', projectId: 'P1' }, { id: 'l2', name: 'Shyam', projectId: 'P2' }],
  sheets: [{ id: 's1', projectId: 'P1' }, { id: 's2', projectId: 'P2' }],
  abstracts: [{ id: 'a1', projectId: 'P1', totalAmount: 100000 }, { id: 'a2', projectId: 'P2', totalAmount: 500000 }],
  invoices: [{ id: 'i1', clientId: 'c1', abstractIds: ['a1'], taxAmount: 18000, status: 'Final' }],
  saleInvoices: [{ id: 'si1', projectId: 'P2', total: 200000 }],
  paymentsIn: [
    { id: 'r1', clientId: 'c1', accountId: 'A', amount: 98000, deductions: [{ type: 'tds', amount: 2000 }] },   // via client→single project
    { id: 'r2', projectId: 'P2', clientId: 'c2', accountId: 'A', amount: 300000 },
  ],
  vendorMaterials: [{ id: 'b1', vendorId: 'v1', siteId: 'P1', totalAmount: 40000 }, { id: 'b2', vendorId: 'v2', totalAmount: 90000 }, { id: 'b3', vendorId: 'v1', totalAmount: 5000 }],
  vendorPayments: [{ id: 'vp1', vendorId: 'v1', projectId: 'P1', accountId: 'A', amount: 30000 }],
  labourPayments: [{ id: 'lp1', labourId: 'l1', accountId: 'A', amount: 10000 }, { id: 'lp2', labourId: 'l2', accountId: 'A', amount: 7000 }],
  expenses: [{ id: 'e1', projectId: 'P1', head: 'Site', subHead: 'Fuel', accountId: 'A', amount: 3000 }, { id: 'e2', siteId: 'P2', category: 'Misc', accountId: 'A', amount: 1000 }],
  equipmentList: [{ id: 'q1', siteId: 'P1' }], purchaseOrders: [{ id: 'po1', siteId: 'P1' }, { id: 'po2', projectId: 'P2' }],
  accounts: [{ id: 'A', name: 'HDFC' }],
};

test('inProject: own tag, party links, single-project client, unknown', () => {
  assert.equal(inProject(S, { projectId: 'P1' }, 'P1'), true);
  assert.equal(inProject(S, { siteId: 'P2' }, 'P1'), false);
  assert.equal(inProject(S, { clientId: 'c1' }, 'P1'), true);
  assert.equal(inProject(S, { vendorId: 'v2' }, 'P2'), true);
  assert.equal(inProject(S, { labourId: 'l1' }, 'P2'), false);
  assert.equal(inProject(S, { abstractIds: ['a1'] }, 'P1'), true);
  assert.equal(inProject(S, { vendorId: 'v1' }, 'P1'), null); // vendor not tied to a project
});

test('project P1: every figure is scoped', () => {
  const a = computeAnalytics(S, 'P1');
  assert.equal(a.billed, 118000);          // abstract 100000 + RA GST 18000
  assert.equal(a.received, 98000);
  assert.equal(a.outstanding, 18000);      // 118000 − (98000 + 2000 TDS)
  assert.equal(a.purchases, 40000);
  assert.equal(a.labour, 10000);
  assert.equal(a.expenses, 3000);
  assert.equal(a.netProfit, 98000 - 3000 - 40000 - 10000);
  assert.equal(a.cash, 98000 - 30000 - 10000 - 3000);
  assert.deepEqual(a.counts, { projects: 1, activeProjects: 1, sheets: 1, clients: 1, vendors: 1, labour: 1, equipment: 1, purchaseOrders: 1 });
  assert.deepEqual(a.expenseRows, [['Site · Fuel', 3000]]);
  assert.equal(a.projectRows.length, 1);
  assert.equal(a.unallocated.count, 1);    // b3 (vendor v1, no site)
  assert.equal(a.unallocated.amount, 5000);
});

test('company view: totals across everything, real bank balance', () => {
  const a = computeAnalytics(S, '');
  assert.equal(a.billed, 100000 + 500000 + 18000 + 200000);
  assert.equal(a.purchases, 135000);
  assert.equal(a.counts.projects, 2);
  assert.equal(a.counts.activeProjects, 1);
  assert.equal(a.cash, 98000 + 300000 - 30000 - 17000 - 4000);
  assert.equal(a.projectRows.length, 2);
  assert.equal(a.unallocated.count, 0);
});

test('chosen site beats a migration-stamped projectId; warehouse site falls back to projectId', () => {
  assert.equal(inProject(S, { siteId: 'P2', projectId: 'P1' }, 'P1'), false);
  assert.equal(inProject(S, { siteId: 'P2', projectId: 'P1' }, 'P2'), true);
  assert.equal(inProject(S, { siteId: 'WH1', projectId: 'P1' }, 'P1'), true);
  assert.equal(inProject(S, { siteId: 'WH1', projectId: 'P1' }, 'WH1'), true);
});
