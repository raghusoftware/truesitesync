/**
 * constructionCalc.js — engineer's site calculators (pure, no DOM; unit-tested
 * in tests/constructionCalc.test.js). Standard Indian site practice / IS rules
 * of thumb; every factor is exported so the screens can show what was assumed.
 *
 * All lengths in metres, areas in m², volumes in m³ unless named otherwise.
 * Each calculator returns { rows: [{ key, label, qty, unit }], ... } where the
 * rows are the materials to buy.
 */

export const M3_TO_CFT = 35.3147;
export const SQM_TO_SQFT = 10.7639;
export const FT_TO_M = 0.3048;
export const CEMENT_DENSITY = 1440;          // kg/m³ (loose)
export const CEMENT_BAG_KG = 50;
export const CEMENT_BAG_M3 = CEMENT_BAG_KG / CEMENT_DENSITY; // ≈ 0.0347 m³
export const STEEL_DENSITY = 7850;           // kg/m³
export const CONCRETE_DRY_FACTOR = 1.54;     // wet → dry volume (voids + wastage)
export const MORTAR_DRY_FACTOR = 1.33;       // brickwork mortar: wet → dry
export const PLASTER_JOINT_FACTOR = 1.2;     // +20 % for joints & uneven surface
export const PLASTER_DRY_FACTOR = 1.27;      // wet → dry (bulkage)

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pos = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const ceil = (n) => Math.ceil(n - 1e-9);

/** Nominal concrete mixes (cement : sand : aggregate). */
export const CONCRETE_GRADES = {
  M5: [1, 5, 10], 'M7.5': [1, 4, 8], M10: [1, 3, 6], M15: [1, 2, 4], M20: [1, 1.5, 3], M25: [1, 1, 2],
};

/** Typical steel as % of concrete volume, by element. */
export const STEEL_PERCENT = { Slab: 1.0, Beam: 2.0, Column: 2.5, Footing: 0.8, Staircase: 1.5, Lintel: 1.0 };

/** Length in the chosen unit → metres. */
export const toM = (v, unit) => pos(v) * (unit === 'ft' ? FT_TO_M : 1);

/** Unit weight of a bar: d² / 162 kg per metre (d in mm). */
export const barKgPerM = (dia) => Math.round(pos(dia) ** 2 / 162 * 1000) / 1000;

function cementSand(dryM3, c, s) {
  const parts = c + s;
  const cementM3 = dryM3 * c / parts;
  return { bags: cementM3 / CEMENT_BAG_M3, sandM3: dryM3 * s / parts };
}

/* ── Concrete / RCC ───────────────────────────────────────────────────── */
export function concrete({ volume, grade = 'M20', ratio, wastage = 2, wcRatio = 0.5 }) {
  const [c, s, a] = ratio || CONCRETE_GRADES[grade] || CONCRETE_GRADES.M20;
  const wet = pos(volume) * (1 + pos(wastage) / 100);
  const dry = wet * CONCRETE_DRY_FACTOR;
  const sum = c + s + a;
  const cementM3 = dry * c / sum;
  const bags = cementM3 / CEMENT_BAG_M3;
  const sandM3 = dry * s / sum, aggM3 = dry * a / sum;
  const water = bags * CEMENT_BAG_KG * pos(wcRatio);
  return {
    wet: r2(wet), dry: r2(dry), mix: `${c} : ${s} : ${a}`,
    rows: [
      { key: 'cement', label: 'Cement', qty: ceil(bags), unit: 'bags', exact: r2(bags) },
      { key: 'sand', label: 'Sand', qty: r2(sandM3 * M3_TO_CFT), unit: 'cft', alt: `${r2(sandM3)} m³` },
      { key: 'aggregate', label: 'Aggregate (20 mm)', qty: r2(aggM3 * M3_TO_CFT), unit: 'cft', alt: `${r2(aggM3)} m³` },
      { key: 'water', label: 'Water', qty: Math.round(water), unit: 'litres' },
    ],
  };
}

/* ── Steel ────────────────────────────────────────────────────────────── */
/** n bars of a diameter and length (+ lap / wastage %). */
export function steelBars({ dia, length, count = 1, wastage = 3 }) {
  const kgm = pos(dia) ** 2 / 162;
  const len = pos(length) * pos(count);
  const kg = kgm * len * (1 + pos(wastage) / 100);
  return {
    kgPerM: r2(kgm), totalLength: r2(len),
    rows: [{ key: 'steel', label: `Steel ${pos(dia)} mm`, qty: r2(kg), unit: 'kg', alt: `${r2(kg / 1000)} t` }],
  };
}

/** Steel from concrete volume and element type (thumb rule). */
export function steelFromConcrete({ volume, element = 'Slab', percent }) {
  const pct = percent != null && percent !== '' ? pos(percent) : (STEEL_PERCENT[element] || 1);
  const kg = pos(volume) * pct / 100 * STEEL_DENSITY;
  return { percent: pct, rows: [{ key: 'steel', label: `Steel (${element}, ${pct}%)`, qty: r2(kg), unit: 'kg', alt: `${r2(kg / 1000)} t` }] };
}

/**
 * Slab mesh: main bars along the short span, distribution along the long
 * span. Spans and cover in metres, spacing in mm.
 */
export function slabMesh({ lx, ly, cover = 0.025, mainDia = 10, mainSpacing = 150, distDia = 8, distSpacing = 200, wastage = 3 }) {
  const short = Math.min(pos(lx), pos(ly)), long = Math.max(pos(lx), pos(ly));
  const c2 = 2 * pos(cover);
  const mainLen = Math.max(0, short - c2), distLen = Math.max(0, long - c2);
  const mainN = pos(mainSpacing) ? Math.floor(distLen / (pos(mainSpacing) / 1000)) + 1 : 0;
  const distN = pos(distSpacing) ? Math.floor(mainLen / (pos(distSpacing) / 1000)) + 1 : 0;
  const w = 1 + pos(wastage) / 100;
  const mainKg = pos(mainDia) ** 2 / 162 * mainLen * mainN * w;
  const distKg = pos(distDia) ** 2 / 162 * distLen * distN * w;
  return {
    mainBars: mainN, distBars: distN,
    rows: [
      { key: 'main', label: `Main bars ${pos(mainDia)} mm @ ${pos(mainSpacing)} c/c`, qty: r2(mainKg), unit: 'kg', alt: `${mainN} nos × ${r2(mainLen)} m` },
      { key: 'dist', label: `Distribution ${pos(distDia)} mm @ ${pos(distSpacing)} c/c`, qty: r2(distKg), unit: 'kg', alt: `${distN} nos × ${r2(distLen)} m` },
      { key: 'steel', label: 'Total steel', qty: r2(mainKg + distKg), unit: 'kg', alt: `${r2((mainKg + distKg) / 1000)} t` },
    ],
  };
}

/* ── Brickwork ────────────────────────────────────────────────────────── */
/**
 * Wall volume minus openings. Brick size and joint in mm.
 * Default: modular brick 190 × 90 × 90 with 10 mm joints (500 / m³).
 */
export function brickwork({ length, height, thickness = 0.23, openings = 0, brickL = 190, brickW = 90, brickH = 90, joint = 10, ratio = [1, 6], wastage = 5 }) {
  const vol = Math.max(0, pos(length) * pos(height) * pos(thickness) - pos(openings) * pos(thickness));
  const j = pos(joint) / 1000;
  const withMortar = (pos(brickL) / 1000 + j) * (pos(brickW) / 1000 + j) * (pos(brickH) / 1000 + j);
  const bricksNet = withMortar ? vol / withMortar : 0;
  const brickOnly = (pos(brickL) / 1000) * (pos(brickW) / 1000) * (pos(brickH) / 1000);
  const wetMortar = Math.max(0, vol - bricksNet * brickOnly);
  const dry = wetMortar * MORTAR_DRY_FACTOR;
  const { bags, sandM3 } = cementSand(dry, ratio[0], ratio[1]);
  return {
    volume: r2(vol), perM3: withMortar ? Math.round(1 / withMortar) : 0, mortarWet: r2(wetMortar),
    rows: [
      { key: 'bricks', label: 'Bricks', qty: ceil(bricksNet * (1 + pos(wastage) / 100)), unit: 'nos', alt: `${Math.round(bricksNet)} + ${pos(wastage)}% wastage` },
      { key: 'cement', label: `Cement (mortar ${ratio[0]}:${ratio[1]})`, qty: ceil(bags), unit: 'bags', exact: r2(bags) },
      { key: 'sand', label: 'Sand', qty: r2(sandM3 * M3_TO_CFT), unit: 'cft', alt: `${r2(sandM3)} m³` },
    ],
  };
}

/* ── Plaster ──────────────────────────────────────────────────────────── */
export function plaster({ area, thickness = 12, ratio = [1, 6], wastage = 0 }) {
  const wet = pos(area) * pos(thickness) / 1000;
  const dry = wet * PLASTER_JOINT_FACTOR * PLASTER_DRY_FACTOR * (1 + pos(wastage) / 100);
  const { bags, sandM3 } = cementSand(dry, ratio[0], ratio[1]);
  return {
    wet: r2(wet), dry: r2(dry),
    rows: [
      { key: 'cement', label: `Cement (${ratio[0]}:${ratio[1]})`, qty: ceil(bags), unit: 'bags', exact: r2(bags) },
      { key: 'sand', label: 'Sand', qty: r2(sandM3 * M3_TO_CFT), unit: 'cft', alt: `${r2(sandM3)} m³` },
    ],
  };
}

/* ── Flooring / tiles ─────────────────────────────────────────────────── */
/**
 * Tiles for an area. Tile size in mm. Bedding: 'mortar' (cement-sand bed of
 * bedThickness mm, 1:ratio) or 'adhesive' (20 kg bag per adhesiveCoverage m²).
 */
export function flooring({ area, tileL = 600, tileW = 600, wastage = 5, perBox = 4, bedding = 'mortar', bedThickness = 40, ratio = [1, 6], adhesiveCoverage = 4.5 }) {
  const a = pos(area);
  const tileArea = (pos(tileL) / 1000) * (pos(tileW) / 1000);
  const tiles = tileArea ? ceil(a / tileArea * (1 + pos(wastage) / 100)) : 0;
  const rows = [
    { key: 'tiles', label: `Tiles ${pos(tileL)} × ${pos(tileW)} mm`, qty: tiles, unit: 'nos', alt: `${r2(a * SQM_TO_SQFT)} sqft + ${pos(wastage)}%` },
  ];
  if (pos(perBox)) rows.push({ key: 'boxes', label: `Boxes (${pos(perBox)} per box)`, qty: ceil(tiles / pos(perBox)), unit: 'boxes' });
  if (bedding === 'adhesive') {
    rows.push({ key: 'adhesive', label: 'Tile adhesive (20 kg)', qty: ceil(a / (pos(adhesiveCoverage) || 4.5)), unit: 'bags' });
  } else {
    const dry = a * pos(bedThickness) / 1000 * MORTAR_DRY_FACTOR;
    const { bags, sandM3 } = cementSand(dry, ratio[0], ratio[1]);
    // neat cement slurry under the tiles: 3.3 kg / m²
    const slurryBags = a * 3.3 / CEMENT_BAG_KG;
    rows.push({ key: 'cement', label: `Cement (bed ${ratio[0]}:${ratio[1]} + slurry)`, qty: ceil(bags + slurryBags), unit: 'bags', exact: r2(bags + slurryBags) });
    rows.push({ key: 'sand', label: 'Sand', qty: r2(sandM3 * M3_TO_CFT), unit: 'cft', alt: `${r2(sandM3)} m³` });
  }
  rows.push({ key: 'grout', label: 'Grout / joint filler', qty: r2(a * 0.25), unit: 'kg' });
  return { area: r2(a), areaSqft: r2(a * SQM_TO_SQFT), rows };
}

/* ── Paint ────────────────────────────────────────────────────────────── */
export function paint({ area, coats = 2, coverage = 9.3, primer = true, primerCoverage = 9.3, putty = false }) {
  const a = pos(area);
  const rows = [{ key: 'paint', label: `Paint (${pos(coats)} coats)`, qty: r2(pos(coverage) ? a * pos(coats) / pos(coverage) : 0), unit: 'litres' }];
  if (primer) rows.push({ key: 'primer', label: 'Primer (1 coat)', qty: r2(pos(primerCoverage) ? a / pos(primerCoverage) : 0), unit: 'litres' });
  if (putty) rows.push({ key: 'putty', label: 'Wall putty (2 coats)', qty: r2(a * 1.0), unit: 'kg' });
  return { area: r2(a), areaSqft: r2(a * SQM_TO_SQFT), rows };
}

/* ── Excavation ───────────────────────────────────────────────────────── */
export function excavation({ length, width, depth, swell = 25, truckCum = 6 }) {
  const v = pos(length) * pos(width) * pos(depth);
  const loose = v * (1 + pos(swell) / 100);
  return {
    volume: r2(v),
    rows: [
      { key: 'earth', label: 'Excavation (in place)', qty: r2(v), unit: 'm³', alt: `${r2(v * M3_TO_CFT)} cft` },
      { key: 'loose', label: `Loose soil (+${pos(swell)}% swell)`, qty: r2(loose), unit: 'm³', alt: `${r2(loose * M3_TO_CFT)} cft` },
      { key: 'trips', label: `Truck trips (${pos(truckCum)} m³ each)`, qty: pos(truckCum) ? ceil(loose / pos(truckCum)) : 0, unit: 'trips' },
    ],
  };
}

/* ── Whole-building cost & material estimate (thumb rules) ───────────── */
export const BUILD_RULES = {           // per sqft of built-up area
  cement: { label: 'Cement', per: 0.4, unit: 'bags' },
  sand: { label: 'Sand', per: 0.816, unit: 'cft' },
  aggregate: { label: 'Aggregate', per: 0.608, unit: 'cft' },
  steel: { label: 'Steel', per: 4, unit: 'kg' },
  bricks: { label: 'Bricks', per: 8, unit: 'nos' },
  paint: { label: 'Paint', per: 0.18, unit: 'litres' },
  tiles: { label: 'Flooring tiles', per: 1.3, unit: 'sqft' },
};
export const COST_SHARE = [          // % of total construction cost
  ['Cement', 16.4], ['Sand', 12.3], ['Aggregate', 7.4], ['Steel', 24.6],
  ['Finishing (paint, tiles, doors, windows)', 16.5], ['Fittings (electrical, plumbing, sanitary)', 22.8],
];
export const QUALITY_RATE = { Basic: 1600, Standard: 2000, Premium: 2600 }; // ₹ / sqft

export function buildingEstimate({ area, unit = 'sqft', rate, quality = 'Standard', floors = 1 }) {
  const perFloor = unit === 'sqm' ? pos(area) * SQM_TO_SQFT : pos(area);
  const sqft = perFloor * (pos(floors) || 1);
  const r = pos(rate) || QUALITY_RATE[quality] || QUALITY_RATE.Standard;
  const total = sqft * r;
  return {
    sqft: r2(sqft), rate: r, total: Math.round(total),
    breakdown: COST_SHARE.map(([label, pct]) => ({ label, pct, amount: Math.round(total * pct / 100) })),
    rows: Object.entries(BUILD_RULES).map(([key, x]) => ({ key, label: x.label, qty: key === 'cement' || key === 'bricks' ? ceil(sqft * x.per) : r2(sqft * x.per), unit: x.unit })),
  };
}

/* ── Material cost from rates ─────────────────────────────────────────── */
export const DEFAULT_RATES = { cement: 380, sand: 60, aggregate: 50, steel: 65, bricks: 9, paint: 250, primer: 180, tiles: 45, adhesive: 450, putty: 20 };
const RATE_KEY = { main: 'steel', dist: 'steel', boxes: null, grout: null, water: null, loose: null, earth: null, trips: null };

/** Cost of each row using rates (₹ per bag / cft / kg / no / litre / sqft). */
export function priceRows(rows, rates = DEFAULT_RATES) {
  let total = 0;
  const out = rows.map(row => {
    const k = row.key in RATE_KEY ? RATE_KEY[row.key] : row.key;
    if (row.key === 'steel' && rows.some(x => x.key === 'main')) return { ...row, cost: null }; // total row of slab mesh
    const rate = k ? pos(rates[k]) : 0;
    const cost = rate ? Math.round((row.key === 'cement' ? row.qty : row.qty) * rate) : null;
    if (cost) total += cost;
    return { ...row, cost };
  });
  return { rows: out, total };
}
