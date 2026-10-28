import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocDate, groupByMonth, monthLabel, gstStateCode, taxScopeFor } from '../js/modules/pendingGroups.js';

test('parseDocDate reads ISO and Indian day-first dates, rejects junk', () => {
  assert.equal(parseDocDate('2026-03-24'), '2026-03-24');
  assert.equal(parseDocDate('2026-03-24T10:00:00Z'), '2026-03-24');
  assert.equal(parseDocDate('03/02/2026'), '2026-02-03');
  assert.equal(parseDocDate('3-2-2026'), '2026-02-03');
  assert.equal(parseDocDate('31/02/2026'), '');
  assert.equal(parseDocDate('soon'), '');
  assert.equal(parseDocDate(''), '');
});

test('groupByMonth sorts oldest first and groups by month (the screenshot order)', () => {
  const grns = [
    { no: 'GRN-7', date: '2026-01-25' }, { no: 'GRN-9', date: '24/03/2026' }, { no: 'GRN-8', date: '2026-02-03' },
    { no: 'GRN-6', date: '2026-01-05' }, { no: 'GRN-X', date: '' }, { no: 'GRN-10', date: '2026-03-02' },
  ];
  const g = groupByMonth(grns, x => x.date);
  assert.deepEqual(g.map(x => x.label), ['January 2026', 'February 2026', 'March 2026', 'No date']);
  assert.deepEqual(g.map(x => x.items.map(i => i.no)), [['GRN-6', 'GRN-7'], ['GRN-8'], ['GRN-10', 'GRN-9'], ['GRN-X']]);
  const d = groupByMonth(grns, x => x.date, { order: 'desc' });
  assert.deepEqual(d.map(x => x.key), ['2026-03', '2026-02', '2026-01', '']);
  assert.equal(monthLabel('2025-12'), 'December 2025');
  assert.deepEqual(groupByMonth([], x => x), []);
});

test('same-day items keep their original order', () => {
  const g = groupByMonth([{ n: 1, d: '2026-05-01' }, { n: 2, d: '2026-05-01' }, { n: 3, d: '2026-04-30' }], x => x.d);
  assert.deepEqual(g.flatMap(x => x.items.map(i => i.n)), [3, 1, 2]);
});

test('taxScopeFor: same state → CGST+SGST, different → IGST, unknown → blank', () => {
  assert.equal(gstStateCode('24ABCDE1234F1Z5'), '24');
  assert.equal(gstStateCode('99ABCDE1234F1Z5'), '');
  assert.equal(taxScopeFor('24ABCDE1234F1Z5', '24PQRSX9876K1Z2'), 'CGST_SGST');
  assert.equal(taxScopeFor('24ABCDE1234F1Z5', '27PQRSX9876K1Z2'), 'IGST');
  assert.equal(taxScopeFor('24ABCDE1234F1Z5', ''), '');
});
