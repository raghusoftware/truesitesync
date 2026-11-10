import { test } from 'node:test';
import assert from 'node:assert/strict';
import { donutSVG, areaSVG, legendHTML, lastMonths, shortMoney, SERIES } from '../js/modules/financeViz.js';

test('shortMoney', () => {
  assert.equal(shortMoney(1250000), '₹13L'); assert.equal(shortMoney(-45000), '−₹45k'); assert.equal(shortMoney(32000000), '₹3.2Cr');
});

test('donut: one path per non-zero slice, totals and shares in the tooltips', () => {
  const svg = donutSVG([{ label: 'Material', value: 600, color: SERIES[0] }, { label: 'Labour', value: 0, color: SERIES[1] }, { label: 'Other', value: 400, color: SERIES[2] }], { money: n => '₹' + n });
  assert.equal((svg.match(/<path /g) || []).length, 2);
  assert.match(svg, /Material: ₹600 \(60%\)/); assert.match(svg, /Other: ₹400 \(40%\)/); assert.ok(!/NaN/.test(svg));
  assert.match(donutSVG([], {}), /No data yet/);
  assert.match(donutSVG([{ label: 'All', value: 5, color: '#000' }]), /<path d="M/);
});

test('area: smooth path, negative months dip below zero, no NaN', () => {
  const svg = areaSVG([{ label: 'Sep', value: 100 }, { label: 'Oct', value: -50 }, { label: 'Nov', value: 200 }]);
  assert.ok(!/NaN/.test(svg)); assert.match(svg, / C/); assert.equal((svg.match(/<circle/g) || []).length, 3);
  assert.ok(areaSVG([{ label: 'Nov', value: 0 }]).length > 0);
});

test('legend + lastMonths', () => {
  assert.match(legendHTML([{ label: 'A', value: 1, color: '#000' }, { label: 'B', value: 3, color: '#111' }]), /<em>75%<\/em>/);
  const m = lastMonths(3, new Date(2026, 0, 15));
  assert.deepEqual(m.map(x => x.key), ['2025-11', '2025-12', '2026-01']);
  assert.deepEqual([m[2].from, m[2].to, m[0].label], ['2026-01-01', '2026-01-31', 'Nov']);
});
