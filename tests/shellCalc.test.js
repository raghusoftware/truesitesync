import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  projectBucket, chipCounts, filterProjects, contractValue, projectProgress, initials, dateRange, tabOf, viewTitle,
} from '../js/modules/shellCalc.js';

test('projectBucket maps statuses to chips', () => {
  assert.equal(projectBucket({}), 'ongoing');
  assert.equal(projectBucket({ status: 'Active' }), 'ongoing');
  assert.equal(projectBucket({ status: 'Completed' }), 'completed');
  assert.equal(projectBucket({ status: 'On Hold' }), 'hold');
  assert.equal(projectBucket({ status: 'Planning' }), 'planning');
});

test('chipCounts and filterProjects', () => {
  const ps = [
    { id: 'a', name: 'Nexcel Chemical', location: 'Poicha Sakarda', clientId: 'c1' },
    { id: 'b', name: 'City Mall', status: 'Completed', boqs: [{ woNumber: 'WO-77' }] },
    { id: 'c', name: 'Bridge', status: 'On Hold' },
  ];
  assert.deepEqual(chipCounts(ps), { all: 3, ongoing: 1, completed: 1, hold: 1, planning: 0 });
  assert.deepEqual(filterProjects(ps, { chip: 'completed' }).map(p => p.id), ['b']);
  assert.deepEqual(filterProjects(ps, { q: 'poicha' }).map(p => p.id), ['a']);
  assert.deepEqual(filterProjects(ps, { q: 'wo-77' }).map(p => p.id), ['b']);
  assert.deepEqual(filterProjects(ps, { q: 'acme', clients: [{ id: 'c1', name: 'Acme Ltd' }] }).map(p => p.id), ['a']);
  assert.deepEqual(filterProjects(ps, { q: 'mall', chip: 'ongoing' }), []);
});

test('contractValue and projectProgress', () => {
  const p = { id: 'P', boqs: [{ poValue: 1000 }] };
  assert.equal(contractValue(p), 1000);
  assert.equal(contractValue({ boqs: [{ items: [{ amount: 200 }, { amount: '300' }] }] }), 500);
  const S = { abstracts: [{ projectId: 'P', totalAmount: 250 }, { projectId: 'X', totalAmount: 900 }], invoices: [{ projectId: 'P', taxAmount: 100, status: 'Cancelled' }] };
  assert.equal(projectProgress(S, p), 25);
  assert.equal(projectProgress(S, { ...p, progress: 60 }), 60);
  assert.equal(projectProgress(S, { ...p, status: 'Completed' }), 100);
  assert.equal(projectProgress(S, { id: 'Z' }), 0);
  assert.equal(projectProgress({ abstracts: [{ projectId: 'P', totalAmount: 5000 }] }, p), 100);
});

test('initials, dateRange, tabs and titles', () => {
  assert.equal(initials('Nexcel Chemical'), 'NC');
  assert.equal(initials('shankar'), 'SH');
  assert.equal(initials(''), '?');
  assert.equal(dateRange({ startDate: '2025-09-01', endDate: '2026-06-30' }), '01 Sep 2025 – 30 Jun 2026');
  assert.equal(dateRange({}), '');
  assert.equal(tabOf('paymentOutView'), 'workspace');
  assert.equal(tabOf('settingsView'), 'master');
  assert.equal(tabOf('labourView'), 'projects');
  assert.equal(viewTitle('inventoryView'), 'Manage Materials');
  assert.equal(viewTitle('fooBarView'), 'Foo Bar');
});
