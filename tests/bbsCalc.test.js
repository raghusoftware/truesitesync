import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bbsModel } from '../js/modules/bbsCalc.js';

test('bbsModel: per-row weight, only the diameters used, totals', () => {
  const m = bbsModel([
    { mark: 'FC1 FOOTING', dia: '10', noBar: 13, no: 6, totalBars: 78, a: 2.4384, b: 0.762, c: 0.762, cutLen: 3.96, totalLen: 309.07 },
    { mark: '', dia: '10', noBar: 15, no: 6, cutLen: 3.66 },                 // continuation, total rebuilt from bars × cut length
    { mark: 'C9', dia: '12', noBar: 11, no: 22, totalBars: 242, cutLen: 3.35, totalLen: 811.38 },
    { mark: '', dia: '' },                                                     // empty row ignored
  ]);
  assert.equal(m.rows.length, 3);
  assert.deepEqual(m.dias, [10, 12]);
  assert.deepEqual(m.rows.map(r => [r.bars, r.len, r.kg]), [[78, 309.07, 190.7], [90, 329.4, 203.24], [242, 811.38, 721.32]]);
  assert.deepEqual(m.byDia.map(g => [g.dia, g.bars, g.len, g.kg]), [[10, 168, 638.47, 393.94], [12, 242, 811.38, 721.32]]);
  assert.equal(m.totalKg, 1115.26); assert.equal(m.totalMt, 1.115); assert.equal(m.totalBars, 410);
});
