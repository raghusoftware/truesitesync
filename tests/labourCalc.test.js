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
