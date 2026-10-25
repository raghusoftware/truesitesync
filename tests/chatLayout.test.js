import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupMessages, joins, mediaGridClass, tileFor, dayLabel } from '../js/modules/chatLayout.js';

const at = (h, m) => new Date(2026, 9, 25, h, m).toISOString();
const msg = (user_id, created_at, extra = {}) => ({ user_id, created_at, ...extra });

test('consecutive messages from one sender within 5 min form a group', () => {
  const g = groupMessages([msg('a', at(9, 0)), msg('a', at(9, 2)), msg('a', at(9, 4))]);
  assert.deepEqual(g.map(x => x.pos), ['first', 'mid', 'last']);
  assert.deepEqual(g.map(x => x.showName), [true, false, false]);
  assert.deepEqual(g.map(x => x.showAvatar), [false, false, true]);
});

test('a gap over 5 minutes or a new sender starts a new group', () => {
  const g = groupMessages([msg('a', at(9, 0)), msg('a', at(9, 6)), msg('b', at(9, 7)), msg('b', at(9, 8))]);
  assert.deepEqual(g.map(x => x.pos), ['single', 'single', 'first', 'last']);
});

test('day change inserts a separator and breaks the group', () => {
  const g = groupMessages([msg('a', new Date(2026, 9, 24, 23, 58).toISOString()), msg('a', new Date(2026, 9, 25, 0, 1).toISOString())]);
  assert.deepEqual(g.map(x => x.dayBreak), [true, true]);
  assert.deepEqual(g.map(x => x.pos), ['single', 'single']);
});

test('system and priority messages always stand alone', () => {
  assert.equal(joins(msg('a', at(9, 0)), msg('a', at(9, 1), { priority: 'safety' })), false);
  assert.equal(joins(msg('a', at(9, 0), { kind: 'system' }), msg('a', at(9, 1))), false);
  assert.equal(joins(msg('a', at(9, 0), { priority: 'normal' }), msg('a', at(9, 1))), true);
});

test('media grid layout by photo count', () => {
  assert.deepEqual([1, 2, 3, 4, 9].map(mediaGridClass), ['g1', 'g2', 'g3', 'g4', 'g4']);
});

test('map tile for a known point', () => {
  const t = tileFor(0, 0, 1);
  assert.deepEqual([t.x, t.y, t.px, t.py], [1, 1, 0, 0]);
  const m = tileFor(19.076, 72.8777, 16);   // Mumbai
  assert.ok(m.x > 0 && m.y > 0 && m.px >= 0 && m.px < 256 && m.py >= 0 && m.py < 256);
});

test('day labels', () => {
  const now = new Date(2026, 9, 25, 12);
  assert.equal(dayLabel(new Date(2026, 9, 25, 8).toISOString(), now), 'Today');
  assert.equal(dayLabel(new Date(2026, 9, 24, 8).toISOString(), now), 'Yesterday');
  assert.match(dayLabel(new Date(2026, 7, 2).toISOString(), now), /2026/);
});
