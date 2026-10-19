import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectBoqRate, estimateTotals } from '../js/modules/estimateCalc.js';

const proj = {
  boqs: [
    { id: 'g1', items: [{ code: 'PCC', rate: 5200 }, { code: 'BW', rate: 0 }] },
    { id: 'g2', items: [{ code: 'PLS', rate: 310 }] }
  ],
  boqItems: [{ code: 'OLD', rate: 99 }]
};

test('projectBoqRate uses the exact BOQ line the entry was picked from', () => {
  assert.equal(projectBoqRate(proj, { boqIndex: 'g2:0', code: 'X' }), 310);
  assert.equal(projectBoqRate(proj, { boqIndex: '0', code: 'X' }), 99);
});

test('projectBoqRate falls back to code match, case-insensitive', () => {
  assert.equal(projectBoqRate(proj, { code: 'pcc' }), 5200);
  assert.equal(projectBoqRate(proj, { boqIndex: 'gone:3', code: 'PLS' }), 310);
});

test('projectBoqRate returns null when the project has no usable rate', () => {
  assert.equal(projectBoqRate(proj, { code: 'BW' }), null);       // rate 0 = unpriced
  assert.equal(projectBoqRate(proj, { code: 'NOPE' }), null);
  assert.equal(projectBoqRate(null, { code: 'PCC' }), null);
});

test('estimateTotals applies percentage and flat discounts', () => {
  const items = [{ qty: 10, rate: 100 }, { qty: 2, rate: 250 }];
  assert.deepEqual(estimateTotals(items, 'pct', 10), { subTotal: 1500, discountAmount: 150, total: 1350 });
  assert.deepEqual(estimateTotals(items, 'amt', 200), { subTotal: 1500, discountAmount: 200, total: 1300 });
  assert.deepEqual(estimateTotals(items, 'pct', ''), { subTotal: 1500, discountAmount: 0, total: 1500 });
});

test('estimateTotals never discounts below zero', () => {
  const items = [{ qty: 1, rate: 100 }];
  assert.equal(estimateTotals(items, 'amt', 500).total, 0);
  assert.equal(estimateTotals(items, 'pct', 150).total, 0);
  assert.equal(estimateTotals(items, 'pct', -5).total, 100);
});
