import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateFor, priceLogs, unbilledLogs, draftBillLines, billSettlement, boqLabourReport, reportTotals, GANG_PAYOUT } from '../js/modules/pieceRateCalc.js';

const rates = [
  { id: 'r1', woNo: 'LWO-001', gangId: 'gA', boqCode: '1.1', workCategory: 'Internal plaster', uom: 'Sqft', rate: 20 },
  { id: 'r2', woNo: 'LWO-002', gangId: 'gB', boqCode: '1.1', workCategory: 'Internal plaster', uom: 'Sqft', rate: 18 },
  { id: 'r3', itemCode: '2.1', workCategory: 'Brickwork', uom: 'Cum', rate: 900 },           // generic (old rate card)
  { id: 'r4', gangId: 'gA', boqCode: '3.1', workCategory: 'Tiling', uom: 'Sqft', rate: 30, status: 'closed' },
];
const logs = [
  { id: 'm1', date: '2026-10-20', gangId: 'gA', rateId: 'r1', boqCode: '1.1', quantity: 300 },
  { id: 'm2', date: '2026-10-22', gangId: 'gA', rateId: 'r1', boqCode: '1.1', quantity: 200 },
  { id: 'm3', date: '2026-10-23', gangId: 'gA', rateId: 'r3', boqCode: '2.1', quantity: 4 },
  { id: 'm4', date: '2026-10-23', gangId: 'gB', rateId: 'r2', boqCode: '1.1', quantity: 100 },
  { id: 'm5', date: '2026-09-30', gangId: 'gA', rateId: 'r1', boqCode: '1.1', quantity: 50, paid: true },   // paid by the old payout
  { id: 'm6', date: '2026-10-29', gangId: 'gA', rateId: 'r1', boqCode: '1.1', quantity: 40 },               // after the period
];

test('rateFor: the gang\'s own line, else a generic rate; closed lines never price new work', () => {
  assert.equal(rateFor(rates, 'gA', '1.1').id, 'r1');
  assert.equal(rateFor(rates, 'gB', '1.1').id, 'r2');
  assert.equal(rateFor(rates, 'gB', '2.1').id, 'r3');
  assert.equal(rateFor(rates, 'gA', '3.1'), null);
  assert.equal(rateFor(rates, 'gC', '1.1'), null);
  assert.deepEqual(priceLogs([{ gangId: 'gB', boqCode: '1.1' }, { gangId: 'gC', boqCode: '1.1' }, { rateId: 'r3', gangId: 'gA' }], rates).map(m => m.rateId), ['r2', '', 'r3']);
});

test('unbilledLogs + draftBillLines: 500 sqft × ₹20 = ₹10,000', () => {
  const u = unbilledLogs(logs, 'gA', '2026-10-01', '2026-10-28');
  assert.deepEqual(u.map(m => m.id), ['m1', 'm2', 'm3']);
  const lines = draftBillLines(u, rates);
  assert.deepEqual(lines.map(l => [l.boqCode, l.qty, l.rate, l.amount]), [['1.1', 500, 20, 10000], ['2.1', 4, 900, 3600]]);
  assert.deepEqual(lines[0].logIds, ['m1', 'm2']);
  assert.equal(unbilledLogs([{ ...logs[0], billId: 'b1' }], 'gA').length, 0);
});

const bills = [
  { id: 'b1', billNo: 'LB-001', gangId: 'gA', date: '2026-10-24', status: 'approved', gross: 13600,
    lines: [{ boqCode: '1.1', description: 'Internal plaster', uom: 'Sqft', qty: 500, rate: 20, amount: 10000 }, { boqCode: '2.1', description: 'Brickwork', uom: 'Cum', qty: 4, rate: 900, amount: 3600 }] },
  { id: 'b2', billNo: 'LB-002', gangId: 'gB', date: '2026-10-24', status: 'approved', gross: 1800, lines: [{ boqCode: '1.1', qty: 100, rate: 18, amount: 1800 }] },
  { id: 'b3', billNo: 'LB-003', gangId: 'gA', date: '2026-10-31', status: 'draft', gross: 800, lines: [] },
];

test('billSettlement: payouts and advances settle approved bills (named bill first, then oldest)', () => {
  const S = {
    expenses: [
      { gangId: 'gA', category: GANG_PAYOUT, amount: 5000, ref: 'LB-001' },
      { gangId: 'gA', category: GANG_PAYOUT, amount: 999, payoutId: 'old' },          // legacy payout — already used
      { gangId: 'gB', category: GANG_PAYOUT, amount: 1800 },
      { gangId: 'gA', category: 'Fuel', amount: 50000 },
    ],
    labourAdvances: [{ labourId: 'gA', amount: 1600 }, { labourId: 'gA', amount: 700, settled: true }],
  };
  const s = billSettlement(bills, S);
  const a = s.find(b => b.id === 'b1'), b = s.find(x => x.id === 'b2');
  assert.deepEqual([a.paid, a.open, a.state], [6600, 7000, 'part']);
  assert.deepEqual([b.paid, b.open, b.state], [1800, 0, 'paid']);
  assert.equal(s.find(x => x.id === 'b3'), undefined);     // drafts are not payables
});

test('boqLabourReport: rolls many daily logs into one row per BOQ item', () => {
  const S = { expenses: [{ gangId: 'gA', category: GANG_PAYOUT, amount: 6800 }] };     // half of LB-001
  const rows = boqLabourReport({
    boq: [{ code: '1.1', description: 'Internal plaster', uom: 'Sqft', qty: 2000, rate: 45 }, { code: '2.1', description: 'Brickwork', uom: 'Cum', qty: 20, rate: 5200 }, { code: '9.9', description: 'Painting', uom: 'Sqft', qty: 0, rate: 0 }],
    rates, logs: logs.filter(m => m.id !== 'm6'), bills, S,
    budget: { '1.1': 22, '2.1': 850 }, measured: { '1.1': 700 }, gangName: id => ({ gA: 'Group A', gB: 'Group B' }[id]),
  });
  assert.deepEqual(rows.map(r => r.code), ['1.1', '2.1', '3.1']);
  const p = rows[0];
  assert.deepEqual([p.boqQty, p.boqValue, p.budget, p.done, p.cost], [2000, 90000, 44000, 650, 12800]);    // 300+200+50 @20 + 100 @18
  assert.deepEqual([p.billed, p.paid, p.budgetDone, p.variance, p.pctDone, p.untagged], [11800, 5000, 14300, 1500, 33, 50]);
  assert.deepEqual(p.gangs.map(g => [g.name, g.qty, g.cost]), [['Group A', 550, 11000], ['Group B', 100, 1800]]);
  const b = rows[1];
  assert.deepEqual([b.done, b.cost, b.variance, b.paid], [4, 3600, -200, 1800]);                         // labour over budget by ₹200
  assert.equal(rows[2].budget, null);
  const t = reportTotals(rows);
  assert.deepEqual([t.cost, t.paid, t.variance], [16400, 6800, 1300]);
});
