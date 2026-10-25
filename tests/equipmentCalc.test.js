import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logMetrics, usageTotals, logTone } from '../js/modules/equipmentCalc.js';

test('logMetrics lists only the figures a log has, in a fixed order', () => {
  assert.deepEqual(logMetrics({ type: 'Runbook', hours: 8.5, km: 0, amount: '' }).map(m => [m.key, m.value]), [['hours', 8.5]]);
  assert.deepEqual(logMetrics({ type: 'Fuel', litres: '60', amount: 5400 }).map(m => m.key), ['litres', 'amount']);
  assert.deepEqual(logMetrics({ type: 'Breakdown', amount: 0 }), []);
});

test('usageTotals sums hours, km, fuel and spend', () => {
  const t = usageTotals([{ hours: 8.5, km: 12 }, { litres: 60, amount: 5400 }, { hours: '1.25', amount: '600.50' }]);
  assert.deepEqual(t, { count: 3, hours: 9.75, km: 12, litres: 60, amount: 6000.5 });
  assert.deepEqual(usageTotals(), { count: 0, hours: 0, km: 0, litres: 0, amount: 0 });
});

test('logTone maps types to colours', () => {
  assert.equal(logTone('Runbook'), 'green');
  assert.equal(logTone('Fuel'), 'amber');
  assert.equal(logTone('Repair'), 'blue');
  assert.equal(logTone('Breakdown'), 'red');
  assert.equal(logTone('Movement'), 'slate');
});
