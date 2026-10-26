import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessCategory, daysSince, nextCode, registerFromIssues, filterTools, statusCounts, isOverdue } from '../js/modules/toolsCalc.js';

const now = new Date(2026, 9, 26);
const tool = (o) => ({ id: o.id || o.name, projectId: 'p', name: 'X', code: 'T-001', category: 'other', returnable: true, status: 'available', holder: null, history: [], ...o });

test('category guess from names', () => {
  assert.equal(guessCategory('Bosch drill 13mm'), 'power');
  assert.equal(guessCategory('50 scaffold tubes'), 'scaffold');
  assert.equal(guessCategory('Measuring tape 30m'), 'measure');
  assert.equal(guessCategory('Safety harness'), 'safety');
  assert.equal(guessCategory('Mystery thing'), 'other');
});

test('days since and overdue', () => {
  assert.equal(daysSince('2026-10-20', now), 6);
  assert.equal(daysSince('', now), 0);
  assert.equal(isOverdue(tool({ status: 'in_use', holder: { since: '2026-10-10' } }), now), true);
  assert.equal(isOverdue(tool({ status: 'in_use', holder: { since: '2026-10-22' } }), now), false);
  assert.equal(isOverdue(tool({ status: 'in_use', returnable: false, holder: { since: '2026-10-01' } }), now), false);
});

test('next code continues the T- series', () => {
  assert.equal(nextCode([]), 'T-001');
  assert.equal(nextCode([{ code: 'T-009' }, { code: 'X' }, { code: 'T-003' }]), 'T-010');
});

test('old issue log becomes register entries', () => {
  const issues = [
    { id: 'i1', projectId: 'p', tool: 'Drill', labourId: 'w1', date: '2026-10-01', returned: true, returnedDate: '2026-10-03', value: 4000 },
    { id: 'i2', projectId: 'p', tool: 'drill ', labourId: 'w2', date: '2026-10-05', returned: false },
    { id: 'i3', projectId: 'p', tool: 'Drill', labourId: 'w3', date: '2026-10-06', returned: false },
    { id: 'i4', projectId: 'other', tool: 'Saw', labourId: 'w1', date: '2026-10-06' },
  ];
  const { created, links } = registerFromIssues([], issues, 'p');
  assert.equal(created.length, 2);                 // the drill is reused once, then a 2nd drill is needed
  assert.equal(links.i1, links.i2);
  assert.notEqual(links.i2, links.i3);
  assert.equal(created[0].status, 'in_use');
  assert.equal(created[0].holder.labourId, 'w2');
  assert.deepEqual(created.map(t => t.code), ['T-001', 'T-002']);
  assert.equal(links.i4, undefined);
});

test('filters, search and ordering', () => {
  const list = [
    tool({ id: 'a', name: 'Grinder', status: 'available', category: 'power' }),
    tool({ id: 'b', name: 'Drill', status: 'in_use', holder: { labourId: 'w1', since: '2026-10-25', byId: 'me' } }),
    tool({ id: 'c', name: 'Level', status: 'maintenance' }),
    tool({ id: 'd', name: 'Tubes', status: 'in_use', holder: { labourId: 'w2', since: '2026-10-01', byId: 'x' } }),
  ];
  const nameOf = (id) => ({ w1: 'Ravi', w2: 'Suresh' })[id] || '';
  assert.deepEqual(filterTools(list, { now }).map(t => t.id), ['d', 'c', 'b', 'a']);   // overdue first, then repair, in use, available
  assert.deepEqual(filterTools(list, { filter: 'mine', meId: 'me', now }).map(t => t.id), ['b']);
  assert.deepEqual(filterTools(list, { q: 'suresh', nameOf, now }).map(t => t.id), ['d']);
  assert.deepEqual(filterTools(list, { cat: 'power', now }).map(t => t.id), ['a']);
  const c = statusCounts(list, now);
  assert.deepEqual([c.all, c.available, c.in_use, c.maintenance, c.overdue], [4, 1, 2, 1, 1]);
});
