import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markDay, daySummary, dayState, shiftDate, dayLabel } from '../js/modules/labourCalc.js';

const id = () => 'x' + Math.random();

test('markDay creates, changes and toggles off a status', () => {
  const logs = [];
  markDay(logs, { labourId: 'L1', date: '2026-10-23', siteId: 'P1', status: 'P' }, id);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].status, 'P');
  assert.equal(logs[0].siteId, 'P1');
  markDay(logs, { labourId: 'L1', date: '2026-10-23', status: 'H' }, id);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].status, 'H');
  const r = markDay(logs, { labourId: 'L1', date: '2026-10-23', status: 'H' }, id);
  assert.equal(r.log, null);
  assert.equal(r.remove, logs[0]); // caller deletes it via keepOnly
});

test('OT marks an unmarked or absent worker present and is clamped', () => {
  const logs = [];
  markDay(logs, { labourId: 'L1', date: '2026-10-23', ot: 3 }, id);
  assert.deepEqual([logs[0].status, logs[0].ot], ['P', 3]);
  markDay(logs, { labourId: 'L2', date: '2026-10-23', status: 'A' }, id);
  markDay(logs, { labourId: 'L2', date: '2026-10-23', ot: 40 }, id);
  const l2 = logs.find(l => l.labourId === 'L2');
  assert.deepEqual([l2.status, l2.ot], ['P', 24]);
  // re-tapping P keeps the worker while OT is recorded
  markDay(logs, { labourId: 'L1', date: '2026-10-23', status: 'P' }, id);
  assert.equal(logs.filter(l => l.labourId === 'L1').length, 1);
});

test('daySummary and dayState', () => {
  const logs = [
    { labourId: 'A', date: '2026-10-23', status: 'P', ot: 2 },
    { labourId: 'B', date: '2026-10-23', status: 'A' },
    { labourId: 'C', date: '2026-10-23', status: 'H' },
    { labourId: 'A', date: '2026-10-22', status: 'P' },
    { labourId: 'Z', date: '2026-10-23', status: 'P' },
  ];
  assert.deepEqual(daySummary(logs, ['A', 'B', 'C', 'D'], '2026-10-23'), { P: 1, A: 1, H: 1, unmarked: 1, ot: 2 });
  assert.equal(dayState(logs, 'D', '2026-10-23'), 'none');
  assert.equal(dayState(logs, 'C', '2026-10-23'), 'H');
});

test('dates', () => {
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  assert.equal(dayLabel('2026-10-23', '2026-10-23'), 'Today, 23 Oct 2026');
  assert.equal(dayLabel('2026-10-22', '2026-10-23'), 'Yesterday, 22 Oct 2026');
  assert.equal(dayLabel('2026-10-20', '2026-10-23'), 'Tue, 20 Oct 2026');
});

import { wagesFor, dateRange, periodRange, workerPeriod } from '../js/modules/labourCalc.js';

test('wagesFor: half day = half, OT at 1.5x of rate/8', () => {
  assert.equal(wagesFor(800, 2, 1, 0), 2000);
  assert.equal(wagesFor(800, 1, 0, 2), 800 + 300);
  assert.equal(wagesFor('', 3, 0, 0), 0);
});

test('dateRange is inclusive and crosses month ends', () => {
  assert.deepEqual(dateRange('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  assert.deepEqual(dateRange('2026-11-02', '2026-11-01'), []);
});

test('periodRange: month offsets, week from Monday, custom swaps', () => {
  assert.deepEqual(periodRange('month', {}, '2026-10-25'), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(periodRange('month', { offset: -1 }, '2026-03-15'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(periodRange('month', { offset: -1 }, '2026-01-10'), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(periodRange('week', {}, '2026-10-25'), { from: '2026-10-19', to: '2026-10-25' }); // Sunday
  assert.deepEqual(periodRange('week', {}, '2026-10-19'), { from: '2026-10-19', to: '2026-10-19' }); // Monday
  assert.deepEqual(periodRange('custom', { from: '2026-10-20', to: '2026-10-05' }), { from: '2026-10-05', to: '2026-10-20' });
});

test('workerPeriod counts days, wages and amount paid inside the period only', () => {
  const worker = { id: 'L1', dayRate: 800 };
  const logs = [
    { labourId: 'L1', date: '2026-10-01', status: 'P', ot: 2 },
    { labourId: 'L1', date: '2026-10-02', status: 'H' },
    { labourId: 'L1', date: '2026-10-03', status: 'A' },
    { labourId: 'L1', date: '2026-09-30', status: 'P' },   // before period
    { labourId: 'L2', date: '2026-10-01', status: 'P' },   // other worker
  ];
  const payments = [
    { labourId: 'L1', date: '2026-10-10', amount: 500, deductions: [{ amount: 50 }] },
    { labourId: 'L1', date: '2026-10-04', amount: 300 },
    { labourId: 'L1', date: '2026-11-01', amount: 999 },  // after period
  ];
  const advances = [{ labourId: 'L1', date: '2026-10-05', amount: 200 }];
  const settle = (p) => p.amount + (p.deductions || []).reduce((s, d) => s + d.amount, 0);
  const r = workerPeriod({ worker, logs, payments, advances, from: '2026-10-01', to: '2026-10-31', settle });
  assert.equal(r.days.length, 31);
  assert.deepEqual([r.present, r.half, r.absent, r.unmarked, r.otHours], [1, 1, 1, 28, 2]);
  assert.equal(r.earned, 800 + 400 + 300);
  assert.equal(r.paid, 850);
  assert.deepEqual(r.payments.map(p => p.date), ['2026-10-04', '2026-10-10']);  // oldest first
  assert.equal(r.advance, 200);
  assert.equal(r.balance, 1500 - 850 - 200);
});
