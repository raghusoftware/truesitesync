import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daySummary, checklistResult, QC_TEMPLATES } from '../js/modules/endOfDayCalc.js';

const D = '2026-10-29';
const S = {
  labourContractors: [{ id: 'gA', name: 'Ramesh Plaster Gang' }],
  labourMaster: [{ id: 'l1', trade: 'Mason', contractorId: 'gA' }, { id: 'l2', trade: 'Helper' }, { id: 'l3', trade: 'Mason' }],
  attendanceLogs: [
    { date: D, labourId: 'l1', status: 'P', siteId: 'p1', ot: 2 }, { date: D, labourId: 'l2', status: 'H', siteId: 'p1' },
    { date: D, labourId: 'l3', status: 'A', siteId: 'p1' }, { date: D, labourId: 'l1', status: 'P', siteId: 'p2' },
    { date: '2026-10-28', labourId: 'l2', status: 'P', siteId: 'p1' }],
  staffMaster: [{ id: 's1', projectId: 'p1' }, { id: 's2', projectId: 'p1' }],
  staffAttendance: [{ staffId: 's1', date: D, inAt: 'x' }, { staffId: 's2', date: D }],
  dailyProgress: [{ id: 'd1', projectId: 'p1', date: D, measurements: [{ code: '1.1', qty: 120, gangId: 'gA' }, { code: '2.1', qty: 4 }] }],
  concretePours: [{ projectId: 'p1', date: D, volume: 18.5 }, { projectId: 'p1', date: D, volume: 6 }, { projectId: 'p2', date: D, volume: 99 }],
  qualityChecks: [{ projectId: 'p1', date: D, status: 'Pass' }],
  incidents: [{ projectId: 'p1', date: D, severity: 'Medium' }, { projectId: 'p1', date: D, severity: 'High' }],
};

test('daySummary: one project, one date', () => {
  const s = daySummary(S, 'p1', D);
  assert.deepEqual(s.work.map(w => [w.code, w.qty, w.doneBy]), [['1.1', 120, 'Ramesh Plaster Gang'], ['2.1', 4, 'Own labour']]);
  assert.equal(s.pours.length, 2); assert.equal(s.pourM3, 24.5);
  assert.equal(s.worstSeverity, 'High');
  const w = s.workforce;
  assert.deepEqual([w.present, w.half, w.absent, w.ot, w.staff, w.headcount, w.manDays], [1, 1, 1, 2, 1, 3, 2.5]);
  assert.deepEqual(w.byGroup, { 'Ramesh Plaster Gang': 1, 'Direct labour': 0.5 });
  assert.deepEqual(w.byTrade, { Mason: 1, Helper: 0.5 });
  assert.deepEqual(s.done, { progress: true, pour: true, quality: true, workforce: true });
  assert.deepEqual(daySummary(S, 'p1', '2026-10-27').done, { progress: false, pour: false, quality: false, workforce: false });
});

test('checklistResult', () => {
  assert.equal(checklistResult([{ result: 'Pass' }, { result: 'NA' }]), 'Pass');
  assert.equal(checklistResult([{ result: 'Pass' }, { result: 'Fail' }]), 'Fail');
  assert.equal(checklistResult([{ result: 'Pass' }, { result: '' }]), 'Open');
  assert.equal(checklistResult([{ result: 'NA' }]), 'Open');
  assert.ok(QC_TEMPLATES['Pre-pour'].length >= 5);
});
