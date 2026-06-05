import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeGst, splitTaxForDisplay } from '../js/modules/gstCalc.js';

// ── computeGst: intra-state (CGST + SGST) ──────────────────
test('computeGst intra-state splits CGST + SGST', () => {
  const r = computeGst(1000, { type: 'intra', cgst: 9, sgst: 9 });
  assert.equal(r.subtotal, 1000);
  assert.equal(r.cgstAmount, 90);
  assert.equal(r.sgstAmount, 90);
  assert.equal(r.igstAmount, 0);
  assert.equal(r.taxAmount, 180);
  assert.equal(r.total, 1180);
  assert.equal(r.type, 'intra');
});

test('computeGst intra-state with unequal CGST/SGST', () => {
  const r = computeGst(2000, { type: 'intra', cgst: 6, sgst: 9 });
  assert.equal(r.cgstAmount, 120);
  assert.equal(r.sgstAmount, 180);
  assert.equal(r.taxAmount, 300);
  assert.equal(r.total, 2300);
});

// ── computeGst: inter-state (IGST) ─────────────────────────
test('computeGst inter-state applies IGST only', () => {
  const r = computeGst(1000, { type: 'inter', igst: 18 });
  assert.equal(r.igstAmount, 180);
  assert.equal(r.cgstAmount, 0);
  assert.equal(r.sgstAmount, 0);
  assert.equal(r.taxAmount, 180);
  assert.equal(r.total, 1180);
  assert.equal(r.type, 'inter');
});

// ── computeGst: edge cases ─────────────────────────────────
test('computeGst defaults to intra and zero rates', () => {
  const r = computeGst(500, {});
  assert.equal(r.type, 'intra');
  assert.equal(r.taxAmount, 0);
  assert.equal(r.total, 500);
});

test('computeGst handles bad subtotal', () => {
  assert.equal(computeGst(null, { type: 'inter', igst: 18 }).total, 0);
  assert.equal(computeGst('abc', { type: 'inter', igst: 18 }).taxAmount, 0);
});

test('computeGst handles fractional rupees (raw float, rounded at display)', () => {
  const r = computeGst(1234.5, { type: 'inter', igst: 18 });
  // Stored as a raw float; rounding to paise happens in the formatter.
  assert.ok(Math.abs(r.igstAmount - 222.21) < 0.005);
  assert.ok(Math.abs(r.total - 1456.71) < 0.005);
});

// ── splitTaxForDisplay ─────────────────────────────────────
test('splitTaxForDisplay halves tax for intra-state', () => {
  assert.deepEqual(splitTaxForDisplay(180, 'intra'), { cgst: 90, sgst: 90, igst: 0 });
});

test('splitTaxForDisplay returns all IGST for inter-state', () => {
  assert.deepEqual(splitTaxForDisplay(180, 'inter'), { cgst: 0, sgst: 0, igst: 180 });
});

test('splitTaxForDisplay handles bad input', () => {
  assert.deepEqual(splitTaxForDisplay(null, 'intra'), { cgst: 0, sgst: 0, igst: 0 });
});

// ── round-trip consistency ─────────────────────────────────
test('computeGst tax round-trips through splitTaxForDisplay (intra)', () => {
  const r = computeGst(5000, { type: 'intra', cgst: 9, sgst: 9 });
  const parts = splitTaxForDisplay(r.taxAmount, 'intra');
  assert.equal(parts.cgst, r.cgstAmount);
  assert.equal(parts.sgst, r.sgstAmount);
});
