import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCAPack, fyRange } from '../js/modules/caExport.js';
import { normalizeDeductions } from '../js/modules/deductions.js';

const state = {
  accounts: [{ id: 'a1', name: 'HDFC' }],
  clients: [{ id: 'c1', name: 'ABC Infra', pan: 'AAACA1234A' }],
  vendors: [{ id: 'v1', name: 'Steel Co', pan: 'AAFCS9876K' }],
  invoices: [{ id: 'i1', clientId: 'c1', invoiceNum: 'RA-3', taxAmount: 18000, status: 'Final' }],
  abstracts: [{ id: 'ab1', clientId: 'c1', totalAmount: 100000 }],
  vendorMaterials: [{ id: 'b1', vendorId: 'v1', totalAmount: 50000 }],
  paymentsIn: [{ id: 'p1', clientId: 'c1', accountId: 'a1', date: '2026-10-05', amount: 108000, againstBillRef: 'RA-3',
    deductions: normalizeDeductions([{ type: 'tds', rate: 2, amount: 2000 }, { type: 'retention', amount: 5000 }, { type: 'ld_penalty', amount: 3000, remark: 'delay' }]) }],
  vendorPayments: [{ id: 'p2', vendorId: 'v1', accountId: 'a1', date: '2026-10-06', amount: 49500, deductions: normalizeDeductions([{ type: 'tds', rate: 1, amount: 500 }]) },
    { id: 'p3', vendorId: 'v1', accountId: 'a1', date: '2025-01-01', amount: 999 }],
  expenses: [{ id: 'e1', head: 'Statutory', subHead: 'TDS', settlesDeduction: 'tds', challanNo: 'CIN9', accountId: 'a1', date: '2026-11-07', amount: 500 }],
  otherIncome: [],
};

test('CA pack: all sheets, period filter, settled = cash + deductions', () => {
  const { sheets } = buildCAPack(state, { from: '2026-04-01', to: '2027-03-31' });
  const S = Object.fromEntries(sheets);
  assert.deepEqual(sheets.map(s => s[0]), ['Summary', 'Receipts', 'Payments', 'Deductions', 'TDS Receivable', 'TDS Payable', 'Retention & Deposits', 'Penalties', 'Party Balances']);
  assert.equal(S.Receipts.length, 2);
  assert.deepEqual(S.Receipts[1].slice(4, 7), [108000, 10000, 118000]);
  assert.equal(S.Payments.length, 3); // vendor payment + tax deposit; 2025 payment filtered out
  assert.equal(S.Deductions.length, 5);
  assert.equal(S['TDS Receivable'][1][3], 'AAACA1234A');
  assert.equal(S['TDS Payable'][1][10], '2026-11-07');
  assert.equal(S.Penalties[1][6], 'delay');
  // client: billed 100000 + 18000, settled 118000 → 0 ; vendor: 50000 − (50000 + 999) = −999 (all-time)
  const client = S['Party Balances'].find(r => r[1] === 'ABC Infra');
  assert.equal(client[5], 0);
  const vendor = S['Party Balances'].find(r => r[1] === 'Steel Co');
  assert.equal(vendor[5], -999);
  const tdsOutRow = S.Summary.find(r => r[0] === 'TDS Payable');
  assert.deepEqual(tdsOutRow.slice(2), [500, 500, 0]);
});

test('fyRange', () => {
  assert.deepEqual(fyRange('2026-10-11'), { from: '2026-04-01', to: '2027-03-31', label: 'FY 2026-27' });
  assert.deepEqual(fyRange('2027-02-01', -1), { from: '2025-04-01', to: '2026-03-31', label: 'FY 2025-26' });
});
