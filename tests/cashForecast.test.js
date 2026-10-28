import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, fifoOpen, buildForecast, bucketize, forecastSummary, termsLabel } from '../js/modules/cashForecast.js';

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
const O = { today: TODAY, horizonDays: 90, bufferDays: 5, defaultTermsDays: 30, labourPayDay: wd(TODAY), weeklyWages: 80000, labourDueNow: 25000 };

test('buildForecast dates every movement from terms', () => {
  const ev = buildForecast(S, O);
  const find = (k, lbl) => ev.find(e => e.kind === k && e.label.includes(lbl));
  assert.deepEqual([find('bill', 'INV-9').date, find('bill', 'INV-9').amount], ['2026-11-19', 60000]);   // 40k paid FIFO
  const late = find('bill', 'S-1'); assert.equal(late.date, TODAY); assert.equal(late.overdue, true);   // delivery basis, overdue → today
  assert.deepEqual([find('grn', 'GRN-0007').date, find('grn', 'GRN-0007').amount], ['2026-12-01', 20000]);
  assert.equal(ev.some(e => e.label.includes('GRN-0008')), false);                                       // billed GRNs never double count
  assert.deepEqual([find('invoice', 'INV-1').date, find('invoice', 'INV-1').amount], ['2026-11-20', 200000]);
  const ra = find('ra', 'RA-04'); assert.equal(ra.date, addDays(TODAY, 50)); assert.equal(ra.sure, false);
  const pay = ev.filter(e => e.kind === 'labour' && e.date === TODAY).map(e => e.amount).sort((a, b) => a - b);
  assert.deepEqual(pay, [15000, 25000, 80000]);                                                          // advance + dues + weekly bill
  assert.equal(ev.filter(e => e.label === 'Weekly wage bill').length, 13);
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
  const m = bucketize(ev, { today: TODAY, mode: 'month', count: 2, openingCash: 10000 });
  assert.equal(m[0].label, 'Nov 2026'); assert.equal(m[0].crunch, 'negative'); assert.equal(m[0].start, TODAY);
  const s = forecastSummary(b); assert.equal(s.lowest, 30000); assert.equal(s.firstCrunch, null); assert.equal(s.firstLow.label, 'This week');
});
