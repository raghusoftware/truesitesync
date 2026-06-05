import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber, formatNumber2, amountToWordsINR } from '../js/modules/format.js';

test('formatNumber2 always shows two decimals', () => {
  assert.equal(formatNumber2(1000), '1,000.00');
  assert.equal(formatNumber2(1234.5), '1,234.50');
  assert.equal(formatNumber2(0), '0.00');
});

test('formatNumber2 uses Indian grouping', () => {
  // 12,34,567.89 in en-IN grouping
  assert.equal(formatNumber2(1234567.89), '12,34,567.89');
});

test('formatNumber2 handles bad input safely', () => {
  assert.equal(formatNumber2(null), '0.00');
  assert.equal(formatNumber2(undefined), '0.00');
  assert.equal(formatNumber2('abc'), '0.00');
});

test('formatNumber respects decimals argument', () => {
  assert.equal(formatNumber(1000), '1,000');
  assert.equal(formatNumber(1000, 2), '1,000.00');
  assert.equal(formatNumber(1234567, 0), '12,34,567');
});

test('amountToWordsINR basic rupees', () => {
  assert.equal(amountToWordsINR(0), 'Rupees Zero Only');
  assert.equal(amountToWordsINR(1), 'Rupees One Only');
  assert.equal(amountToWordsINR(100), 'Rupees One Hundred Only');
  assert.equal(amountToWordsINR(999), 'Rupees Nine Hundred Ninety Nine Only');
});

test('amountToWordsINR thousands, lakhs, crores', () => {
  assert.equal(amountToWordsINR(1000), 'Rupees One Thousand Only');
  assert.equal(amountToWordsINR(100000), 'Rupees One Lakh Only');
  assert.equal(amountToWordsINR(10000000), 'Rupees One Crore Only');
  assert.equal(
    amountToWordsINR(123450),
    'Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Only'
  );
});

test('amountToWordsINR includes paise', () => {
  assert.equal(amountToWordsINR(50.75), 'Rupees Fifty and Seventy Five Paise Only');
  assert.equal(
    amountToWordsINR(123450.6),
    'Rupees One Lakh Twenty Three Thousand Four Hundred Fifty and Sixty Paise Only'
  );
});

test('amountToWordsINR handles negatives by magnitude', () => {
  assert.equal(amountToWordsINR(-500), 'Rupees Five Hundred Only');
});

test('amountToWordsINR handles bad input', () => {
  assert.equal(amountToWordsINR(null), 'Rupees Zero Only');
  assert.equal(amountToWordsINR('xyz'), 'Rupees Zero Only');
});
