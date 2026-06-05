import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sheetPrevQtyKey, sheetGroupKey, computeSheetPrevQtyMap,
  groupSheetEntries, sheetPrevQtyFor, sumEntryQty
} from '../js/modules/sheetCalc.js';

// ── key helpers ────────────────────────────────────────────
test('sheetPrevQtyKey prefers boqIndex then code (no description fallback)', () => {
  assert.equal(sheetPrevQtyKey({ boqIndex: 'g1:0', code: 'A', description: 'd' }), 'g1:0');
  assert.equal(sheetPrevQtyKey({ code: 'A', description: 'd' }), 'A');
  assert.equal(sheetPrevQtyKey({ description: 'd' }), undefined);
});

test('sheetGroupKey falls back to description', () => {
  assert.equal(sheetGroupKey({ boqIndex: 'g1:0' }), 'g1:0');
  assert.equal(sheetGroupKey({ code: 'A' }), 'A');
  assert.equal(sheetGroupKey({ description: 'Brickwork' }), 'Brickwork');
});

// ── computeSheetPrevQtyMap ─────────────────────────────────
test('computeSheetPrevQtyMap sums earlier same-project sheets only', () => {
  const s3 = { id: 's3', projectId: 'p1', date: '2026-03-01', entries: [{ code: 'X', qty: 5 }] };
  const all = [
    { id: 's1', projectId: 'p1', date: '2026-01-01', entries: [{ code: 'X', qty: 10 }] },
    { id: 's2', projectId: 'p1', date: '2026-02-01', entries: [{ code: 'X', qty: 7 }] },
    { id: 's4', projectId: 'p1', date: '2026-04-01', entries: [{ code: 'X', qty: 99 }] }, // later → excluded
    { id: 'o1', projectId: 'p2', date: '2026-01-01', entries: [{ code: 'X', qty: 50 }] }, // other project
    s3 // self → excluded
  ];
  assert.equal(computeSheetPrevQtyMap(s3, all)['X'], 17);
});

test('computeSheetPrevQtyMap keys by boqIndex when present', () => {
  const s2 = { id: 's2', projectId: 'p1', date: '2026-02-01', entries: [] };
  const all = [
    { id: 's1', projectId: 'p1', date: '2026-01-01', entries: [{ boqIndex: 'g1:0', code: 'X', qty: 12 }] },
    s2
  ];
  const map = computeSheetPrevQtyMap(s2, all);
  assert.equal(map['g1:0'], 12);
  assert.equal(map['X'], undefined);
});

// ── groupSheetEntries ──────────────────────────────────────
test('groupSheetEntries groups by item and skips blank rows', () => {
  const entries = [
    { code: 'A', qty: 1 },
    { code: 'A', qty: 2 },
    { code: 'B', qty: 3 },
    { nos: 5 }, // no code or description → skipped
  ];
  const grouped = groupSheetEntries(entries);
  assert.equal(Object.keys(grouped).length, 2);
  assert.equal(grouped['A'].length, 2);
  assert.equal(grouped['B'].length, 1);
});

test('groupSheetEntries handles empty/undefined input', () => {
  assert.deepEqual(groupSheetEntries([]), {});
  assert.deepEqual(groupSheetEntries(undefined), {});
});

// ── sheetPrevQtyFor ────────────────────────────────────────
test('sheetPrevQtyFor matches group key, falls back to code, then 0', () => {
  const map = { 'g1:0': 8, 'CODE': 3 };
  assert.equal(sheetPrevQtyFor(map, 'g1:0', { code: 'CODE' }), 8);
  assert.equal(sheetPrevQtyFor(map, 'MISSING', { code: 'CODE' }), 3);
  assert.equal(sheetPrevQtyFor(map, 'MISSING', { code: 'NOPE' }), 0);
  assert.equal(sheetPrevQtyFor(map, 'MISSING', undefined), 0);
});

// ── sumEntryQty ────────────────────────────────────────────
test('sumEntryQty totals entry quantities safely', () => {
  assert.equal(sumEntryQty([{ qty: 1.5 }, { qty: 2.5 }, {}]), 4);
  assert.equal(sumEntryQty([]), 0);
  assert.equal(sumEntryQty(undefined), 0);
});

// ── integration: prev + this + total ───────────────────────
test('previous + this-bill + total flow matches manual math', () => {
  const s2 = {
    id: 's2', projectId: 'p1', date: '2026-02-01',
    entries: [{ code: 'EXC', qty: 12 }, { code: 'EXC', qty: 8 }]
  };
  const all = [
    { id: 's1', projectId: 'p1', date: '2026-01-01', entries: [{ code: 'EXC', qty: 30 }] },
    s2
  ];
  const prevMap = computeSheetPrevQtyMap(s2, all);
  const grouped = groupSheetEntries(s2.entries);
  const key = Object.keys(grouped)[0];
  const thisBill = sumEntryQty(grouped[key]);
  const prev = sheetPrevQtyFor(prevMap, key, grouped[key][0]);
  assert.equal(thisBill, 20);
  assert.equal(prev, 30);
  assert.equal(prev + thisBill, 50);
});
