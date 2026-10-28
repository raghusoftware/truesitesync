import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, fifoOpen, buildForecast, bucketize, forecastSummary, termsLabel, dayWage, nextPayDay, wageRunRate, rentByMonth, forecastAudit } from '../js/modules/cashForecast.js';

const TODAY = '2026-11-02';
const wd = iso => new Date(iso + 'T00:00:00Z').getUTCDay();

test('addDays / termsLabel / fifoOpen', () => {
  assert.equal(addDays('2026-01-30', 30), '2026-03-01');
  assert.equal(termsLabel(0), 'Immediate'); assert.equal(termsLabel(45), 'Net 45'); assert.equal(termsLabel(null), '—');
  const open = fifoOpen([{ id: 'b2', date: '2026-10-05', total: 300 }, { id: 'b1', date: '2026-09-01', total: 500 }], 600);
  assert.deepEqual(open.map(o => [o.id, o.open]), [['b2', 200]]);   // oldest paid first
});

const S = {
  vendors: [{ id: 'v1', name: 'Ganesh', paymentTermsDays: 30 }, { id: 'v2', name: 'Steel Co', paymentTermsDays: 15, termsBasis: 'delivery' }],
  clients: [{ id: 'c1', name: 'Nexcel', paymentTermsDays: 45 }],
  vendorMaterials: [
    { id: 'b1', vendorId: 'v1', billNo: 'INV-9', date: '2026-10-20', totalAmount: 100000 },            // due 19 Nov
    { id: 'b2', vendorId: 'v2', billNo: 'S-1', date: '2026-10-25', grnDate: '2026-10-10', totalAmount: 50000 }, // delivery basis → 25 Oct → overdue
  ],
  vendorPayments: [{ vendorId: 'v1', amount: 40000 }],
  grnRecords: [
    { id: 'g1', grnNo: 'GRN-0007', supplierId: 'v1', date: '2026-11-01', amount: 20000, sourceType: 'Supplier' }, // unbilled → 1 Dec
    { id: 'g2', grnNo: 'GRN-0008', supplierId: 'v1', date: '2026-11-01', amount: 9999, billed: true },
  ],
  saleInvoices: [{ id: 'i1', clientId: 'c1', invoiceNo: 'INV-1', date: '2026-10-01', total: 300000 }],   // due 15 Nov (+5 buffer → 20 Nov)
  paymentsIn: [{ clientId: 'c1', amount: 100000 }],
  abstracts: [{ id: 'a1', clientId: 'c1', abstractNum: 'RA-04', date: '2026-10-30', totalAmount: 250000 }],   // billed today → +45+5
  labourContractors: [{ name: 'Ramesh gang', weeklyAdvance: 15000 }],
  accounts: [{ type: 'Loan', name: 'JCB loan', emi: 42000, emiDay: 31 }],
  recurring: [{ name: 'Crane hire', amount: 60000, freq: 'monthly', day: 5 }],
};
const O = { today: TODAY, horizonDays: 90, bufferDays: 5, defaultTermsDays: 30, labourPayDay: wd(TODAY), weeklyWages: 80000 };

test('buildForecast dates every movement from terms', () => {
  const ev = buildForecast(S, O);
  const find = (k, lbl) => ev.find(e => e.kind === k && e.label.includes(lbl));
  assert.deepEqual([find('bill', 'INV-9').date, find('bill', 'INV-9').amount], ['2026-11-19', 60000]);   // 40k paid FIFO
  const late = find('bill', 'S-1'); assert.equal(late.date, TODAY); assert.equal(late.overdue, true);   // delivery basis, overdue → today
  assert.deepEqual([find('grn', 'GRN-0007').date, find('grn', 'GRN-0007').amount], ['2026-12-01', 20000]);
  assert.equal(ev.some(e => e.label.includes('GRN-0008')), false);                                       // billed GRNs never double count
  assert.deepEqual([find('invoice', 'INV-1').date, find('invoice', 'INV-1').amount], ['2026-11-20', 200000]);
  const ra = find('ra', 'RA-04'); assert.equal(ra.date, addDays(TODAY, 50)); assert.equal(ra.sure, false);
  assert.ok(ev.find(e => e.kind === 'labour' && e.date === TODAY && e.amount === 15000));                // gang advance on pay day
  // weekly override → 13 future pay days of run-rate wages (≈ 80k each; today's pay day has none)
  const ahead = ev.filter(e => e.label === 'Wages — days ahead (run-rate)');
  assert.equal(ahead.length, 12); assert.ok(ahead.every(e => Math.abs(e.amount - 80000) < 1));
  assert.ok(ev.find(e => e.kind === 'emi' && e.date === '2026-11-30'));                                  // 31st → last day of Nov
  assert.ok(ev.find(e => e.kind === 'recurring' && e.date === '2026-12-05'));
  assert.equal(buildForecast(S, { ...O, includeExpected: false }).some(e => e.kind === 'ra'), false);
});

test('bucketize rolls cash forward and flags the crunch', () => {
  const ev = [
    { date: TODAY, dir: 'out', amount: 70000, sure: true },
    { date: addDays(TODAY, 8), dir: 'in', amount: 20000, sure: true },
    { date: addDays(TODAY, 9), dir: 'in', amount: 5000, sure: false },
    { date: addDays(TODAY, 15), dir: 'out', amount: 10000, sure: true },
  ];
  const b = bucketize(ev, { today: TODAY, mode: 'week', count: 3, openingCash: 100000, reserve: 40000 });
  assert.deepEqual(b.map(x => [x.startCash, x.in, x.out, x.endCash, x.crunch]), [[100000, 0, 70000, 30000, 'low'], [30000, 25000, 0, 55000, ''], [55000, 0, 10000, 45000, '']]);
  assert.equal(b[1].inExpected, 5000); assert.equal(b[0].label, 'This week');
  assert.deepEqual(b[0].outBy, { materials: 0, labour: 0, equipment: 0, fuel: 0, other: 70000 });
  const k = bucketize([{ date: TODAY, dir: 'out', amount: 10, kind: 'grn', sure: true }, { date: TODAY, dir: 'out', amount: 5, kind: 'bill', sure: true },
    { date: TODAY, dir: 'out', amount: 7, kind: 'fuel', sure: true }, { date: TODAY, dir: 'out', amount: 3, kind: 'labour', sure: true }], { today: TODAY, mode: 'week', count: 1, openingCash: 0 });
  assert.deepEqual(k[0].outBy, { materials: 15, labour: 3, equipment: 0, fuel: 7, other: 0 });
  const m = bucketize(ev, { today: TODAY, mode: 'month', count: 2, openingCash: 10000 });
  assert.equal(m[0].label, 'Nov 2026'); assert.equal(m[0].crunch, 'negative'); assert.equal(m[0].start, TODAY);
  const s = forecastSummary(b); assert.equal(s.lowest, 30000); assert.equal(s.firstCrunch, null); assert.equal(s.firstLow.label, 'This week');
});


test('wage rules: day wage, pay day, run-rate', () => {
  assert.equal(dayWage(800, 'P', 0), 800); assert.equal(dayWage(800, 'H', 0), 400); assert.equal(dayWage(800, 'A', 0), 0);
  assert.equal(dayWage(800, 'P', 2), 1100);                                         // 2h OT at 1.5 × 100/h
  const sat = 6;
  const d = nextPayDay(TODAY, sat); assert.equal(wd(d), sat); assert.ok(d >= TODAY && d <= addDays(TODAY, 6));
  assert.equal(nextPayDay(d, sat), d);                                               // a pay day maps to itself
  const S2 = { labourMaster: [{ id: 'w1', dayRate: 700 }], attendanceLogs: [{ labourId: 'w1', date: addDays(TODAY, -1), status: 'P' }, { labourId: 'w1', date: addDays(TODAY, -20), status: 'P' }] };
  assert.equal(wageRunRate(S2, TODAY), 350);                                         // one 700 day in 14 → 350 / week
});

test('attendance → wages owed on the next pay day, oldest days paid first', () => {
  const payDay = wd(addDays(TODAY, 3));
  const days = [-9, -8, -2, -1, 0].map(n => addDays(TODAY, n));
  const S3 = {
    labourMaster: [{ id: 'w1', dayRate: 1000 }, { id: 'w2', dayRate: 600 }],
    attendanceLogs: [...days.map(d => ({ labourId: 'w1', date: d, status: 'P' })), { labourId: 'w2', date: addDays(TODAY, -1), status: 'H', ot: 4 }],
    labourPayments: [{ labourId: 'w1', amount: 1500 }], labourAdvances: [{ labourId: 'w1', amount: 500 }],
  };
  const ev = buildForecast(S3, { today: TODAY, horizonDays: 14, labourPayDay: payDay, weeklyWages: 0 }).filter(e => e.kind === 'labour');
  // w1: 5 days = 5000 − 2000 cleared (two oldest days) → 3000 left, all due on this week's pay day; w2: 300 + 450 OT
  const due = nextPayDay(addDays(TODAY, -2), payDay);
  const line = ev.find(e => e.date === due);
  assert.equal(line.amount, 3750); assert.match(line.label, /2 workers/);
  assert.equal(ev.length, 1);                                                          // the paid-off old days left nothing
});

test('machine hire, fuel khata, net receivable, retention, weekly vendor', () => {
  const m0 = TODAY.slice(0, 7), prev = addDays(TODAY.slice(0, 8) + '01', -1).slice(0, 7);
  const eq = { id: 'e1', name: 'JCB', ownership: 'RENTED', vendorId: 'hv', rentRate: 1200, rentBasis: 'hourly', status: 'ACTIVE' };
  const logs = [{ assetId: 'e1', type: 'Runbook', date: prev + '-20', hours: 10 }, { assetId: 'e1', type: 'Runbook', date: TODAY, hours: 5 }];
  assert.deepEqual(rentByMonth(eq, logs).map(r => [r.month, r.amount]), [[prev, 12000], [m0, 6000]]);
  const S4 = {
    vendors: [{ id: 'hv', name: 'Hire Co', paymentTermsDays: 0 }, { id: 'wk', name: 'Sand Supplier', termsType: 'weekly', payWeekday: 1 }],
    equipmentList: [eq], equipmentLogs: logs, vendorPayments: [{ vendorId: 'hv', amount: 12000 }],
    fuelTxns: [{ type: 'PUMP', onCredit: true, pumpName: 'HP Karjan', amount: 9000, date: addDays(TODAY, -3) }, { type: 'PUMP', onCredit: true, pumpName: 'HP Karjan', amount: 4000, date: TODAY }],
    expenses: [{ category: 'Fuel', party: 'HP Karjan', amount: 9000 }],
    grnRecords: [{ id: 'g', supplierId: 'wk', date: TODAY, amount: 5000 }],
    invoices: [{ clientId: 'c', date: TODAY, totalAmount: 118000, netPayable: 104000 }], clients: [{ id: 'c', name: 'C', paymentTermsDays: 0 }],
    projects: [{ id: 'p', boqs: [{ retention: 5 }] }], abstracts: [{ clientId: 'c', projectId: 'p', date: TODAY, totalAmount: 200000 }],
  };
  const ev = buildForecast(S4, { today: TODAY, horizonDays: 40, weeklyWages: 0, fuelTermsDays: 15 });
  const rent = ev.filter(e => e.kind === 'equipment' && !/projected/.test(e.label));
  assert.deepEqual(rent.map(e => e.amount), [6000]);                                  // last month's 12k paid FIFO; this month's 6k owed
  assert.ok(ev.some(e => e.kind === 'equipment' && /projected/.test(e.label)));
  assert.deepEqual(ev.filter(e => e.kind === 'fuel').map(e => [e.amount, e.date]), [[4000, addDays(TODAY, 15)]]);
  assert.equal(wd(ev.find(e => e.kind === 'grn').date), 1);                            // weekly terms → next Monday
  assert.equal(ev.find(e => e.kind === 'invoice').amount, 104000);                    // net payable, not the gross
  assert.equal(ev.find(e => e.kind === 'ra').amount, 190000);                         // less 5% retention
});

test('forecastAudit counts sources and flags gaps', () => {
  const a = forecastAudit({
    labourMaster: [{ id: 'w1', dayRate: 0 }, { id: 'w2', dayRate: 500 }], attendanceLogs: [{ labourId: 'w1' }, { labourId: 'w2' }],
    equipmentList: [{ id: 'e', ownership: 'RENTED' }, { id: 'f', ownership: 'RENTED', vendorId: 'v' }],
    vendors: [{ id: 'v' }, { id: 'x', paymentTermsDays: 30 }], clients: [{ id: 'c', paymentTermsDays: 0 }],
  });
  assert.equal(a.counts.attendance, 2); assert.equal(a.counts.machines, 2);
  assert.deepEqual(a.gaps.map(g => g.count), [1, 1, 1, 1]);   // no day rate · no vendor · no rate · supplier without terms
});
