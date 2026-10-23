import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/modules/constructionCalc.js';

const row = (res, key) => res.rows.find(r => r.key === key);

test('bar weight d²/162', () => {
  assert.equal(C.barKgPerM(12), 0.889);
  assert.equal(C.barKgPerM(16), 1.58);
  const s = C.steelBars({ dia: 12, length: 12, count: 10, wastage: 0 });
  assert.equal(row(s, 'steel').qty, 106.67);
});

test('concrete M20 per 1 m³ (≈ 8.06 bags, 14.8 cft sand, 29.7 cft aggregate)', () => {
  const r = C.concrete({ volume: 1, grade: 'M20', wastage: 0 });
  assert.equal(r.mix, '1 : 1.5 : 3');
  assert.equal(row(r, 'cement').qty, 9);           // 8.06 bags → buy 9
  assert.equal(row(r, 'cement').exact, 8.06);
  assert.ok(Math.abs(row(r, 'sand').qty - 14.83) < 0.05);
  assert.ok(Math.abs(row(r, 'aggregate').qty - 29.66) < 0.05);
  assert.equal(row(r, 'water').qty, 202);
});

test('steel from concrete and slab mesh', () => {
  assert.equal(row(C.steelFromConcrete({ volume: 10, element: 'Beam' }), 'steel').qty, 1570);
  assert.equal(row(C.steelFromConcrete({ volume: 10, element: 'Slab', percent: 1.2 }), 'steel').qty, 942);
  const m = C.slabMesh({ lx: 4, ly: 5, cover: 0.025, mainDia: 10, mainSpacing: 150, distDia: 8, distSpacing: 200, wastage: 0 });
  assert.equal(m.mainBars, 34);  // floor(4.95/0.15)+1
  assert.equal(m.distBars, 20);  // floor(3.95/0.2)+1
  assert.equal(row(m, 'steel').qty, Math.round((100 / 162 * 3.95 * 34 + 64 / 162 * 4.95 * 20) * 100) / 100);
});

test('brickwork: 500 modular bricks per m³, 1:6 mortar', () => {
  const r = C.brickwork({ length: 10, height: 3, thickness: 0.2, wastage: 0 });
  assert.equal(r.perM3, 500);
  assert.equal(r.volume, 6);
  assert.equal(row(r, 'bricks').qty, 3000);
  assert.ok(row(r, 'cement').exact > 7 && row(r, 'cement').exact < 8.5); // ≈1.3 bags per m³
  // openings are deducted
  assert.equal(C.brickwork({ length: 10, height: 3, thickness: 0.2, openings: 5 }).volume, 5);
});

test('plaster 100 m² · 12 mm · 1:6 ≈ 7–8 bags', () => {
  const r = C.plaster({ area: 100, thickness: 12, ratio: [1, 6] });
  assert.equal(r.wet, 1.2);
  assert.equal(row(r, 'cement').exact, Math.round(1.2 * 1.2 * 1.27 / 7 / (50 / 1440) * 100) / 100);
  assert.equal(row(r, 'cement').qty, 8);
});

test('flooring tiles, boxes and bedding', () => {
  const r = C.flooring({ area: 20, tileL: 600, tileW: 600, wastage: 5, perBox: 4 });
  assert.equal(row(r, 'tiles').qty, 59);   // 55.56 × 1.05 = 58.3 → 59
  assert.equal(row(r, 'boxes').qty, 15);
  assert.ok(row(r, 'cement'));
  const a = C.flooring({ area: 20, bedding: 'adhesive', adhesiveCoverage: 4.5 });
  assert.equal(row(a, 'adhesive').qty, 5);
  assert.equal(row(a, 'cement'), undefined);
});

test('paint, excavation and whole-building estimate', () => {
  assert.equal(row(C.paint({ area: 93, coats: 2, coverage: 9.3 }), 'paint').qty, 20);
  const e = C.excavation({ length: 10, width: 2, depth: 1.5, swell: 25, truckCum: 6 });
  assert.equal(row(e, 'earth').qty, 30);
  assert.equal(row(e, 'trips').qty, 7);
  const b = C.buildingEstimate({ area: 1000, quality: 'Standard', floors: 2 });
  assert.equal(b.sqft, 2000);
  assert.equal(b.total, 4000000);
  assert.equal(b.breakdown.reduce((s, x) => s + x.pct, 0).toFixed(1), '100.0');
  assert.equal(row(b, 'cement').qty, 800);
  assert.equal(row(b, 'steel').qty, 8000);
});

test('priceRows uses rates and skips totals rows', () => {
  const r = C.concrete({ volume: 1, grade: 'M20', wastage: 0 });
  const p = C.priceRows(r.rows, { cement: 400, sand: 50, aggregate: 40 });
  assert.equal(p.rows.find(x => x.key === 'cement').cost, 3600);
  assert.equal(p.rows.find(x => x.key === 'water').cost, null);
  const m = C.slabMesh({ lx: 4, ly: 5 });
  const pm = C.priceRows(m.rows, { steel: 65 });
  assert.equal(pm.rows.find(x => x.key === 'steel').cost, null);
  assert.equal(pm.total, pm.rows.filter(x => x.cost).reduce((s, x) => s + x.cost, 0));
});
