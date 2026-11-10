import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, openAmounts, forecastItems, bucketize, forecastSummary, termsLabel, dayWage, nextPayDay, wageRunRate, isLive, VIEWS } from '../js/modules/cashForecast.js';

const TODAY = '2026-11-02';   // a Monday
const wd = iso => new Date(iso + 'T00:00:00Z').getUTCDay();

test('dates, terms, live documents', () => {
  assert.equal(addDays('2026-01-30', 30), '2026-03-01');
  assert.equal(termsLabel(0), 'Immediate'); assert.equal(termsLabel(45), 'Net 45'); assert.equal(termsLabel(null), '—');
  assert.equal(nextPayDay(TODAY, 6), '2026-11-07'); assert.equal(nextPayDay('2026-11-07', 6), '2026-11-07');
  assert.equal(dayWage(800, 'P', 0), 800); assert.equal(dayWage(800, 'H', 2), 700); assert.equal(dayWage(800, 'A', 0), 0);
  assert.ok(isLive({ status: 'Active' })); assert.ok(isLive({ status: 'Final' })); assert.ok(isLive({}));
  assert.ok(!isLive({ status: 'Draft' })); assert.ok(!isLive({ status: 'Cancelled' })); assert.ok(!isLive({ isDraft: true }));
});

test('openAmounts: a payment naming a document clears it first, the rest pays oldest first', () => {
  const docs = [{ id: 'b1', date: '2026-09-01', total: 500 }, { id: 'b2', date: '2026-10-05', total: 300 }, { id: 'b3', date: '2026-10-09', total: 100 }];
  assert.deepEqual(openAmounts(docs, 600).map(o => [o.id, o.open]), [['b2', 200], ['b3', 100]]);
  assert.deepEqual(openAmounts(docs, [{ amount: 300, ref: 'b2' }, { amount: 100 }]).map(o => [o.id, o.open]), [['b1', 400], ['b3', 100]]);
});

const S = () => ({
  clients: [{ id: 'c1', name: 'Nexcel', paymentTermsDays: 30 }, { id: 'c2', name: 'Shakti' }],
  vendors: [{ id: 'v1', name: 'Ganesh', paymentTermsDays: 15 }, { id: 'v2', name: 'Shree Steel', paymentTermsDays: 30, termsBasis: 'delivery' }, { id: 'v3', name: 'Pump', termsType: 'weekly', payWeekday: 6 }],
  saleInvoices: [
    { id: 's1', clientId: 'c1', invoiceNo: 'INV-1', date: '2026-10-20', total: 100000, status: 'Active' },
    { id: 's2', clientId: 'c1', invoiceNo: 'INV-2', date: '2026-10-25', total: 50000, status: 'Cancelled' },
    { id: 's3', clientId: 'c2', invoiceNo: 'INV-3', date: '2026-09-01', total: 40000, status: 'Draft' },
  ],
  invoices: [{ id: 'r1', clientId: 'c2', invoiceNum: 'INV-RA4', date: '2026-10-10', totalAmount: 900000, netPayable: 837000, status: 'Final' }],
  paymentsIn: [{ clientId: 'c1', amount: 30000 }],
  grnRecords: [{ id: 'g1', date: '2026-10-01' }],
  vendorMaterials: [
    { id: 'b1', vendorId: 'v1', billNo: 'GT-1', date: '2026-10-25', totalAmount: 60000 },
    { id: 'b2', vendorId: 'v2', billNo: 'SS-7', date: '2026-10-28', totalAmount: 200000, items: [{ grnId: 'g1' }] },
    { id: 'b3', vendorId: 'v3', billNo: 'HP-9', date: '2026-11-03', totalAmount: 9500 },
    { id: 'b4', vendorId: 'v1', billNo: 'GT-2', date: '2026-10-30', totalAmount: 5000, isDraft: true },
  ],
  vendorPayments: [{ vendorId: 'v1', amount: 10000 }],
  subcontracts: [{ id: 'sc1', name: 'Ravi Shuttering' }],
  labourContractors: [{ id: 'gA', name: 'Group A' }],
  labourBills: [{ id: 'lb1', billNo: 'LB-001', gangId: 'gA', date: '2026-11-03', status: 'approved', gross: 10000 }, { id: 'lb2', billNo: 'LB-002', gangId: 'gA', date: '2026-11-03', status: 'draft', gross: 800 }],
  expenses: [{ gangId: 'gA', category: 'Piece-Rate Gang Payout', amount: 4000 }],
  subPayments: [{ id: 'sp1', subcontractId: 'sc1', no: 'SPC-2', net: 75000, date: '2026-10-31', paid: false }, { id: 'sp2', subcontractId: 'sc1', no: 'SPC-1', net: 50000, date: '2026-10-01', paid: true }],
});

test('forecastItems: formal documents only, dated by terms, net of payments', () => {
  const it = forecastItems(S(), { today: TODAY, defaultTermsDays: 30, weeklyPayroll: 0 });
  const by = k => it.find(e => e.key === k);
  assert.deepEqual([by('inv:s1').amount, by('inv:s1').date], [70000, '2026-11-19']);          // 1L − 30k received, Net 30
  assert.equal(by('inv:s2'), undefined); assert.equal(by('inv:s3'), undefined);                  // cancelled / draft ignored
  assert.deepEqual([by('inv:r1').amount, by('inv:r1').date, by('inv:r1').src], [837000, '2026-11-09', 'ra']);   // net payable, default 30 days
  assert.deepEqual([by('bill:b1').amount, by('bill:b1').date], [50000, '2026-11-09']);          // Net 15 from bill
  assert.deepEqual([by('bill:b2').date, by('bill:b2').overdue], [TODAY, true]);                  // Net 30 from GRN (1 Oct) → overdue → today
  assert.equal(by('bill:b3').date, '2026-11-07');                                                 // weekly supplier → Saturday
  assert.equal(by('bill:b4'), undefined);
  assert.deepEqual([by('sub:sp1').amount, by('sub:sp1').date, by('sub:sp2')], [75000, '2026-11-30', undefined]);
  assert.deepEqual([by('lbill:lb1').amount, by('lbill:lb1').date, by('lbill:lb1').party, by('lbill:lb2')], [6000, '2026-11-07', 'Group A', undefined]);   // approved, part-paid, due Saturday
  // the owner delays a bill
  const moved = forecastItems(S(), { today: TODAY, weeklyPayroll: 0, payOn: { 'bill:b1': '2026-11-20' } });
  assert.deepEqual([moved.find(e => e.key === 'bill:b1').date, moved.find(e => e.key === 'bill:b1').moved], ['2026-11-20', '2026-11-20']);
});

test('payroll: earned wages on the pay day (missed pay days today), plus the weekly run-rate', () => {
  const st = {
    labourMaster: [{ id: 'w1', dayRate: 1000 }, { id: 'w2', dayRate: 500 }],
    attendanceLogs: [
      { date: '2026-10-27', labourId: 'w1', status: 'P' },   // Tue → pay day Sat 31 Oct (missed)
      { date: '2026-10-28', labourId: 'w1', status: 'P' },
      { date: '2026-11-02', labourId: 'w2', status: 'P' },   // today → Sat 7 Nov
    ],
    labourPayments: [{ labourId: 'w1', amount: 1000 }],
  };
  const it = forecastItems(st, { today: TODAY, weeklyPayroll: 7000, horizonDays: 14 }).filter(e => e.src === 'payroll');
  assert.equal(it[0].date, TODAY); assert.equal(it[0].detail.overdue, 1000); assert.equal(it[0].amount, 1000);
  const sat = it.find(e => e.date === '2026-11-07');
  assert.deepEqual([sat.detail.earned, sat.detail.projected, sat.amount], [500, 5000, 5500]);   // 5 days ahead (Tue–Sat) at 1000/day
  assert.ok(it.every(e => e.date === TODAY || wd(e.date) === 6));
  assert.equal(wageRunRate({ labourMaster: st.labourMaster, attendanceLogs: st.attendanceLogs }, TODAY), 1250);
});

test('bucketize: 7- and 30-day buckets, cash rolls forward, first shortfall', () => {
  const items = forecastItems(S(), { today: TODAY, weeklyPayroll: 0 });
  const w = bucketize(items, { today: TODAY, ...VIEWS['4w'], openingCash: 150000 });
  assert.deepEqual(w.map(b => b.name), ['Week 1', 'Week 2', 'Week 3', 'Week 4']);
  assert.equal(w[0].range, '2 Nov – 8 Nov');
  assert.deepEqual(w.map(b => [b.in, b.out]), [[0, 215500], [837000, 50000], [70000, 0], [0, 0]]);
  assert.deepEqual(w.map(b => b.endCash), [-65500, 721500, 791500, 791500]);
  assert.equal(w[1].startCash, w[0].endCash);
  const s = forecastSummary(w);
  assert.equal(s.shortfall.name, 'Week 1'); assert.equal(s.lowest, -65500);
  const m = bucketize(items, { today: TODAY, ...VIEWS['3m'], openingCash: 0 });
  assert.deepEqual(m.map(b => b.name), ['Next 30 days', 'Days 31–60', 'Days 61–90']);
  assert.equal(m[0].out, 340500); assert.equal(m[0].outItems.length, 5);
  assert.equal(forecastSummary(bucketize([], { today: TODAY, ...VIEWS.week, openingCash: 10 })).shortfall, null);
});
