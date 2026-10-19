import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  convert, evalExpression, parseFeetInches, formatFeetInches, parseValue, CONVERT_CATEGORIES
} from '../js/modules/unitConvertCalc.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('evalExpression handles arithmetic, precedence, brackets, ×/÷', () => {
  assert.equal(evalExpression('2+3*4'), 14);
  assert.equal(evalExpression('(2+3)*4'), 20);
  assert.equal(evalExpression('10 × 2 ÷ 4'), 5);
  assert.equal(evalExpression('-3+5'), 2);
  assert.equal(evalExpression('2^3'), 8);
  assert.equal(evalExpression('200*10%'), 20);
  assert.equal(evalExpression('1,000+1'), 1001);
});

test('evalExpression rejects junk and code', () => {
  assert.ok(Number.isNaN(evalExpression('')));
  assert.ok(Number.isNaN(evalExpression('2+')));
  assert.ok(Number.isNaN(evalExpression('alert(1)')));
  assert.ok(Number.isNaN(evalExpression('1/0')));
});

test('parseFeetInches accepts common site notations', () => {
  near(parseFeetInches(`5'6"`), 5.5);
  near(parseFeetInches(`5' 6`), 5.5);
  near(parseFeetInches('5 6'), 5.5);
  near(parseFeetInches('5-6'), 5.5);
  near(parseFeetInches('5ft 6in'), 5.5);
  near(parseFeetInches(`6"`), 0.5);
  near(parseFeetInches('10'), 10);
  near(parseFeetInches(`5'`), 5);
});

test('formatFeetInches rounds to 1/16 inch', () => {
  assert.equal(formatFeetInches(5.5), `5' 6"`);
  assert.equal(formatFeetInches(1000 / 304.8), `3' 3-3/8"`);
  assert.equal(formatFeetInches(0), `0' 0"`);
});

test('core construction conversions', () => {
  near(convert(1, 'ft', 'mm', 'length'), 304.8);
  near(convert(parseValue(`5'6"`, { ftin: true }), 'ftin', 'mm', 'length'), 1676.4);
  near(convert(1, 'sqm', 'sqft', 'area'), 10.763910417, 1e-8);
  near(convert(1, 'cum', 'cft', 'volume'), 35.314666721, 1e-8);
  near(convert(1, 'brass', 'cft', 'volume'), 100);
  near(convert(1, 'acre', 'guntha', 'area'), 40);
  near(convert(1, 'tonne', 'quintal', 'weight'), 10);
  assert.ok(Number.isNaN(convert(1, 'ft', 'kg', 'length')));
});

test('every unit has a positive factor', () => {
  for (const c of Object.values(CONVERT_CATEGORIES)) for (const u of c.units) assert.ok(u.f > 0, u.id);
});
