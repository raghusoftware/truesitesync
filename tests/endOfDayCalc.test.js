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

test('daySummary.report: pulls measurement sheets + equipment, groups BOQ, separates non-BOQ, lock', () => {
  const S2 = {
    ...S,
    dailyProgress: [{ id: 'd1', projectId: 'p1', date: D, eodSubmitted: { at: 'x', by: 'Ravi' }, measurements: [
      { code: '1.1', description: 'PCC', uom: 'Cum', qty: 2 }, { code: 'NB:Debris removal', description: 'Debris removal', uom: 'Trip', qty: 3, isNonBoq: true }] }],
    sheets: [
      // running sheet: own DPR line (skip), another line today (pull), yesterday (skip), non-BOQ (skip)
      { id: 'sh1', projectId: 'p1', sheetNum: 'M-1', entries: [
        { code: '1.1', qty: 2, _date: D, _dprId: 'd1' }, { code: '1.1', description: 'PCC', uom: 'Cum', qty: 1.5, _date: D },
        { code: '1.1', qty: 9, _date: '2026-10-28' }, { code: 'NB:x', qty: 1, _date: D }] },
      // classic sheet dated today
      { id: 'sh2', projectId: 'p1', date: D, sheetNum: 'M-2', entries: [{ code: '3.1', description: 'Brickwork', uom: 'Cum', qty: 4 }] },
      { id: 'sh3', projectId: 'p2', date: D, entries: [{ code: '3.1', qty: 50 }] },
    ],
    equipmentList: [{ id: 'e1', name: 'JCB Excavator', projectId: 'p1' }, { id: 'e2', name: 'Tractor', unit: 'KM' }],
    equipmentLogs: [
      { assetId: 'e1', date: D, type: 'Runbook', hours: 4, projectId: 'p1' }, { assetId: 'e1', date: D, type: 'Runbook', hours: 2 },
      { assetId: 'e1', date: D, type: 'Fuel', litres: 40, projectId: 'p1' }, { assetId: 'e2', date: D, type: 'Runbook', km: 12, projectId: 'p1' },
      { assetId: 'e2', date: D, type: 'Runbook', km: 99, projectId: 'p2' }, { assetId: 'e1', date: '2026-10-28', hours: 8, projectId: 'p1' }],
  };
  const r = daySummary(S2, 'p1', D).report;
  assert.deepEqual(r.groups.map(g => [g.code, g.qty, g.lines.map(l => l.src).join(',')]), [['1.1', 3.5, 'dpr,sheet'], ['3.1', 4, 'sheet']]);
  assert.deepEqual(r.nonBoq.map(n => [n.description, n.qty]), [['Debris removal', 3]]);
  assert.deepEqual(r.equipment.map(m => [m.name, m.hours, m.km, m.litres]), [['JCB Excavator', 6, 0, 40], ['Tractor', 0, 12, 0]]);
  assert.equal(r.equipHours, 6);
  assert.equal(r.locked, true);
  assert.equal(daySummary(S, 'p1', D).report.locked, false);
});
