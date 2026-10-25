import { test } from 'node:test';
import assert from 'node:assert/strict';
import { materialKind, materialLocation, stockStatus, stockMeter, stockRows, statusCounts, filterRows } from '../js/modules/inventoryCalc.js';

const materials = [
  { id: 'cem', name: 'Portland Cement (Grade 43)', unit: 'Bag', type: 'Cement', minStock: 500, locations: { S1: 'Yard A - Section 3', S2: 'Store B' } },
  { id: 'tmt', name: 'TMT Steel Rebar (12mm)', unit: 'Kg', type: 'Steel', minStock: 1000 },
  { id: 'snd', name: 'River Sand', unit: 'Cft', type: 'Aggregate' },
  { id: 'kap', name: 'Kapchi', unit: 'Ton', type: 'Aggregate', minStock: 10 },
  { id: 'unused', name: 'Unused item', unit: 'Nos' },
];
const tx = [
  { rawMaterialId: 'cem', siteId: 'S1', type: 'IN', qty: 1500 },
  { rawMaterialId: 'cem', siteId: 'S1', type: 'CONSUME', qty: 250 },
  { rawMaterialId: 'cem', siteId: 'S2', type: 'IN', qty: 100 },
  { rawMaterialId: 'tmt', siteId: 'S1', type: 'IN', qty: 800 },
  { rawMaterialId: 'snd', siteId: 'S1', type: 'IN', qty: 50 },
  { rawMaterialId: 'snd', siteId: 'S1', type: 'OUT', qty: 50 },
];
const transfers = [{ assetId: 'cem', fromLocId: 'S1', toLocId: 'S2', qty: 100 }];

test('materialLocation: one site, or every distinct location across sites', () => {
  assert.equal(materialLocation(materials[0], 'S1'), 'Yard A - Section 3');
  assert.equal(materialLocation(materials[0], 'S9'), '');
  assert.equal(materialLocation(materials[0], ''), 'Yard A - Section 3 · Store B');
  assert.equal(materialLocation(materials[1], 'S1'), '');
});

test('stockStatus and stockMeter', () => {
  assert.equal(stockStatus(0, 10), 'out');
  assert.equal(stockStatus(5, 10), 'low');
  assert.equal(stockStatus(10, 10), 'ok');
  assert.equal(stockStatus(5, 0), 'ok');
  assert.equal(stockMeter(0, 10), 0);
  assert.equal(stockMeter(10, 10), 50);   // minimum sits mid-bar
  assert.equal(stockMeter(99, 10), 100);
  assert.equal(stockMeter(3, 0), 100);
});

test('stockRows for one site counts tx + transfers and keeps out-of-stock items with a minimum', () => {
  const rows = stockRows({ materials, tx, transfers, siteId: 'S1' });
  const by = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.equal(by.cem.stock, 1500 - 250 - 100);
  assert.equal(by.cem.status, 'ok');
  assert.equal(by.cem.location, 'Yard A - Section 3');
  assert.equal(by.tmt.status, 'low');
  assert.equal(by.snd.status, 'out');
  assert.equal(by.kap.status, 'out');      // never received, has a minimum
  assert.equal(by.unused, undefined);       // no movement, no minimum
});

test('stockRows across all sites ignores transfers', () => {
  const by = Object.fromEntries(stockRows({ materials, tx, transfers }).map(r => [r.id, r]));
  assert.equal(by.cem.stock, 1500 - 250 + 100);
});

test('filterRows: search by location, status chips, sort most urgent first', () => {
  const rows = stockRows({ materials, tx, transfers, siteId: 'S1' });
  assert.deepEqual(filterRows(rows, { q: 'yard a' }).map(r => r.id), ['cem']);
  assert.deepEqual(filterRows(rows, { status: 'low' }).map(r => r.id), ['tmt']);
  assert.deepEqual(filterRows(rows, { status: 'noloc', sort: 'name' }).map(r => r.id), ['kap', 'snd', 'tmt']);
  assert.deepEqual(filterRows(rows, { sort: 'low' }).map(r => r.status), ['out', 'out', 'low', 'ok']);
  assert.deepEqual(filterRows(rows, { type: 'Aggregate', sort: 'name' }).map(r => r.id), ['kap', 'snd']);
  assert.deepEqual(statusCounts(rows), { all: 4, ok: 1, low: 1, out: 2, noloc: 3, raw: 0, consumable: 4, tool: 0 });
});

test('materialKind: raw material, consumable (miscellaneous / other) or tool', () => {
  assert.equal(materialKind('Raw Material'), 'raw');
  assert.equal(materialKind('Tools'), 'tool');
  assert.equal(materialKind('Miscellaneous'), 'consumable');
  assert.equal(materialKind(''), 'consumable');
});

test('filterRows by kind, and search matches the kind label', () => {
  const mats = [
    { id: 'a', name: 'Cement', type: 'Raw Material', minStock: 1 },
    { id: 'b', name: 'Shovel', type: 'Tools', minStock: 1 },
    { id: 'c', name: 'Cutting disc', type: 'Miscellaneous', minStock: 1 },
  ];
  const rows = stockRows({ materials: mats });
  assert.deepEqual(filterRows(rows, { kind: 'tool' }).map(r => r.id), ['b']);
  assert.deepEqual(filterRows(rows, { kind: 'consumable' }).map(r => r.id), ['c']);
  assert.deepEqual(filterRows(rows, { q: 'tool' }).map(r => r.id), ['b']);
  const c = statusCounts(rows);
  assert.deepEqual([c.raw, c.consumable, c.tool], [1, 1, 1]);
});

import { materialIcon, pendingOrders } from '../js/modules/inventoryCalc.js';

test('materialIcon picks a category icon from the name', () => {
  assert.equal(materialIcon({ name: 'Portland Cement (Grade 43)' }), '🧱');
  assert.equal(materialIcon({ name: 'TMT Steel Rebar 12mm' }), '🏗️');
  assert.equal(materialIcon({ name: 'Kapchi 20mm' }), '🪨');
  assert.equal(materialIcon({ name: 'Power drill', type: 'Tools' }), '🔧');
  assert.equal(materialIcon({ name: 'Something else' }), '📦');
});

test('pendingOrders: open PO lines minus quantity received against them', () => {
  const pos = [
    { id: 'p1', deliveryStatus: 'Pending', items: [{ rawMatId: 'cem', qty: 100 }, { rawMatId: 'snd', qty: 50 }] },
    { id: 'p2', deliveryStatus: 'Pending', items: [{ rawMatId: 'cem', qty: 20 }] },
    { id: 'p3', deliveryStatus: 'Delivered', items: [{ rawMatId: 'cem', qty: 999 }] },
  ];
  const grns = [
    { poId: 'p1', matId: 'cem', qty: 70 },
    { poId: 'p1', matId: 'snd', qty: 60 },     // over-received → nothing pending
    { matId: 'cem', qty: 5 },                   // not against a PO
  ];
  assert.deepEqual(pendingOrders(pos, grns), { cem: 30 + 20 });
});
