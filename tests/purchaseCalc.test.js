import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineAmount, computePurchaseTotal } from '../js/modules/purchaseCalc.js';

test('lineAmount multiplies qty * rate safely', () => {
  assert.equal(lineAmount(4, 25), 100);
  assert.equal(lineAmount(0, 25), 0);
  assert.equal(lineAmount(null, 25), 0);
  assert.equal(lineAmount(4, undefined), 0);
});

test('computePurchaseTotal adds all extras', () => {
  const r = computePurchaseTotal(1000, { transport: 100, loading: 50, gst: 180 });
  assert.equal(r.subtotal, 1000);
  assert.equal(r.transport, 100);
  assert.equal(r.loading, 50);
  assert.equal(r.gst, 180);
  assert.equal(r.extras, 330);
  assert.equal(r.totalAmount, 1330);
});

test('computePurchaseTotal with no extras equals subtotal', () => {
  const r = computePurchaseTotal(2500, {});
  assert.equal(r.extras, 0);
  assert.equal(r.totalAmount, 2500);
});

test('computePurchaseTotal handles missing args / bad input', () => {
  const r = computePurchaseTotal(null, { transport: 'x', loading: null, gst: undefined });
  assert.equal(r.subtotal, 0);
  assert.equal(r.extras, 0);
  assert.equal(r.totalAmount, 0);
});

test('computePurchaseTotal partial extras', () => {
  const r = computePurchaseTotal(500, { gst: 90 });
  assert.equal(r.extras, 90);
  assert.equal(r.totalAmount, 590);
});
