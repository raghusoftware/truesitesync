import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lookupBoqItem, abstractItemKey, computePrevQtyMap, computeAbstractRows
} from '../js/modules/abstractCalc.js';

// ── lookupBoqItem ──────────────────────────────────────────
test('lookupBoqItem resolves new "groupId:index" format', () => {
  const proj = { boqs: [{ id: 'g1', items: [{ qty: 10 }, { qty: 20 }] }] };
  assert.equal(lookupBoqItem(proj, 'g1:1').qty, 20);
});

test('lookupBoqItem resolves legacy flat index', () => {
  const proj = { boqItems: [{ qty: 5 }, { qty: 8 }] };
  assert.equal(lookupBoqItem(proj, 1).qty, 8);
});

test('lookupBoqItem returns null for empty/invalid refs', () => {
  assert.equal(lookupBoqItem({}, ''), null);
  assert.equal(lookupBoqItem({}, null), null);
  assert.equal(lookupBoqItem({}, undefined), null);
  assert.equal(lookupBoqItem({ boqs: [{ id: 'g1', items: [] }] }, 'g1:9'), null);
});

// ── abstractItemKey ────────────────────────────────────────
test('abstractItemKey prefers boqIndex, then code, then desc', () => {
  assert.equal(abstractItemKey({ boqIndex: 'g1:0', code: 'A', desc: 'x' }), 'g1:0');
  assert.equal(abstractItemKey({ code: 'A', desc: 'x' }), 'A');
  assert.equal(abstractItemKey({ desc: 'x' }), 'x');
});

// ── computePrevQtyMap ──────────────────────────────────────
test('computePrevQtyMap sums earlier same-project abstracts only', () => {
  const a3 = { id: 'a3', projectId: 'p1', date: '2026-03-01', items: [{ code: 'X', qty: 5 }] };
  const all = [
    { id: 'a1', projectId: 'p1', date: '2026-01-01', items: [{ code: 'X', qty: 10 }] },
    { id: 'a2', projectId: 'p1', date: '2026-02-01', items: [{ code: 'X', qty: 7 }] },
    { id: 'a4', projectId: 'p1', date: '2026-04-01', items: [{ code: 'X', qty: 99 }] }, // later → excluded
    { id: 'b1', projectId: 'p2', date: '2026-01-01', items: [{ code: 'X', qty: 50 }] }, // other project → excluded
    a3 // self → excluded
  ];
  const map = computePrevQtyMap(a3, all);
  assert.equal(map['X'], 17); // 10 + 7
});

test('computePrevQtyMap includes abstracts dated on the same day', () => {
  const a2 = { id: 'a2', projectId: 'p1', date: '2026-02-01', items: [{ code: 'X', qty: 1 }] };
  const all = [
    { id: 'a1', projectId: 'p1', date: '2026-02-01', items: [{ code: 'X', qty: 4 }] },
    a2
  ];
  assert.equal(computePrevQtyMap(a2, all)['X'], 4);
});

// ── computeAbstractRows (the money math) ───────────────────
test('computeAbstractRows computes qty + amounts + grand totals', () => {
  const proj = { boqItems: [{ qty: 100 }] };
  const a2 = {
    id: 'a2', projectId: 'p1', date: '2026-02-01',
    items: [{ boqIndex: 0, code: 'EXC', desc: 'Excavation', uom: 'CUM', qty: 30, rate: 200 }]
  };
  const all = [
    { id: 'a1', projectId: 'p1', date: '2026-01-01', items: [{ boqIndex: 0, code: 'EXC', qty: 20, rate: 200 }] },
    a2
  ];
  const { rows, totals } = computeAbstractRows(a2, all, proj);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.srNo, 1);
  assert.equal(row.boqQty, 100);
  assert.equal(row.prevQty, 20);
  assert.equal(row.thisBillQty, 30);
  assert.equal(row.totalQty, 50);
  assert.equal(row.preAmt, 4000);   // 20 * 200
  assert.equal(row.thisAmt, 6000);  // 30 * 200
  assert.equal(row.totalAmt, 10000); // 50 * 200
  assert.deepEqual(totals, { grandPreAmt: 4000, grandThisAmt: 6000, grandTotalAmt: 10000 });
});

test('computeAbstractRows handles first bill (no previous qty)', () => {
  const a1 = {
    id: 'a1', projectId: 'p1', date: '2026-01-01',
    items: [{ code: 'A', qty: 10, rate: 5 }, { code: 'B', qty: 4, rate: 25 }]
  };
  const { rows, totals } = computeAbstractRows(a1, [a1], {});
  assert.equal(rows[0].prevQty, 0);
  assert.equal(rows[0].thisAmt, 50);
  assert.equal(rows[1].totalAmt, 100);
  assert.equal(totals.grandThisAmt, 150);
  assert.equal(totals.grandPreAmt, 0);
});

test('computeAbstractRows tolerates missing rate/qty', () => {
  const a = { id: 'a', projectId: 'p1', date: '2026-01-01', items: [{ code: 'A' }] };
  const { rows, totals } = computeAbstractRows(a, [a], {});
  assert.equal(rows[0].thisBillQty, 0);
  assert.equal(rows[0].totalAmt, 0);
  assert.equal(totals.grandTotalAmt, 0);
});

test('computeAbstractRows handles empty items', () => {
  const a = { id: 'a', projectId: 'p1', date: '2026-01-01', items: [] };
  const { rows, totals } = computeAbstractRows(a, [a], {});
  assert.equal(rows.length, 0);
  assert.equal(totals.grandTotalAmt, 0);
});
