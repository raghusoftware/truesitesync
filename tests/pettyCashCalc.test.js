import { test } from 'node:test';
import assert from 'node:assert/strict';
import { txnEffect, walletStats, ownerSummary, runningBalances, afterSpend, chronological } from '../js/modules/pettyCashCalc.js';

const T = [
  { id: 't1', type: 'TRANSFER', custodianId: 'a', amount: 1000, date: '2026-10-01', createdAt: 1 },              // legacy → accepted
  { id: 'e1', type: 'EXPENSE', custodianId: 'a', amount: 300, date: '2026-10-02', createdAt: 3 },
  { id: 't2', type: 'TRANSFER', custodianId: 'a', amount: 500, date: '2026-10-02', createdAt: 2, status: 'pending' },
  { id: 'r1', type: 'RETURN', custodianId: 'a', amount: 100, date: '2026-10-03', createdAt: 4 },
  { id: 't3', type: 'TRANSFER', custodianId: 'b', amount: 2000, date: '2026-10-01', createdAt: 5, status: 'accepted' },
  { id: 'e2', type: 'EXPENSE', custodianId: 'b', amount: 2500.5, date: '2026-10-04', createdAt: 6 },
  { id: 't4', type: 'TRANSFER', custodianId: 'b', amount: 50, date: '2026-10-05', createdAt: 7, status: 'disputed' },
];

test('txnEffect: pending / disputed transfers do not count, spends and returns deduct', () => {
  assert.equal(txnEffect(T[0]), 1000);
  assert.equal(txnEffect(T[2]), 0);
  assert.equal(txnEffect(T[6]), 0);
  assert.equal(txnEffect(T[1]), -300);
  assert.equal(txnEffect(T[3]), -100);
});

test('walletStats splits given / reconciled / in hand', () => {
  const a = walletStats(T, 'a');
  assert.deepEqual([a.issued, a.confirmed, a.pending, a.spent, a.returned, a.reconciled, a.balance], [1500, 1000, 500, 300, 100, 400, 600]);
  const b = walletStats(T, 'b');
  assert.equal(b.balance, -500.5); assert.equal(b.disputed, 50); assert.equal(b.count, 3);
});

test('ownerSummary: funds given vs reconciled across supervisors', () => {
  const s = ownerSummary(T, ['a', 'b']);
  assert.equal(s.given, 3550); assert.equal(s.confirmed, 3000); assert.equal(s.pending, 500);
  assert.equal(s.reconciled, 2900.5); assert.equal(s.inField, 99.5); assert.equal(s.pct, 97);
  assert.equal(ownerSummary([], []).pct, 0);
});

test('runningBalances walk each wallet in date order', () => {
  const r = runningBalances(T);
  assert.deepEqual([r.t1, r.t2, r.e1, r.r1], [1000, 1000, 700, 600]);
  assert.deepEqual([r.t3, r.e2, r.t4], [2000, -500.5, -500.5]);
  assert.deepEqual(chronological(T).map(t => t.id).slice(0, 3), ['t1', 't3', 't2']);
});

test('afterSpend previews the deduction live', () => {
  assert.deepEqual(afterSpend(1000, 250), { after: 750, short: 0, ok: true });
  assert.deepEqual(afterSpend(100, 250), { after: -150, short: 150, ok: true });
  assert.deepEqual(afterSpend(100, ''), { after: 100, short: 0, ok: false });
});
