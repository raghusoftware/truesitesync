/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Unit converter + calculator math (pure, no DOM)
 * ───────────────────────────────────────────────────────────
 * Every unit carries `f` = how many BASE units are in ONE of it.
 * Base units: Length → metre, Area → sqm, Volume → cum, Weight → kg.
 * Used by unitConverter.js (the floating popup) and by tests.
 * ═══════════════════════════════════════════════════════════
 */

const IN = 0.0254, FT = 0.3048, YD = 0.9144;

export const CONVERT_CATEGORIES = {
  length: {
    label: 'Length',
    units: [
      { id: 'mm', label: 'Millimetre (mm)', f: 0.001 },
      { id: 'cm', label: 'Centimetre (cm)', f: 0.01 },
      { id: 'm', label: 'Metre (m)', f: 1 },
      { id: 'km', label: 'Kilometre (km)', f: 1000 },
      { id: 'in', label: 'Inch (in)', f: IN },
      { id: 'ft', label: 'Foot (ft)', f: FT },
      { id: 'ftin', label: "Feet-Inches (5'6\")", f: FT, ftin: true },
      { id: 'yd', label: 'Yard (yd)', f: YD },
      { id: 'mile', label: 'Mile', f: 1609.344 }
    ]
  },
  area: {
    label: 'Area',
    units: [
      { id: 'sqmm', label: 'Sq. Millimetre', f: 1e-6 },
      { id: 'sqcm', label: 'Sq. Centimetre', f: 1e-4 },
      { id: 'sqm', label: 'Sq. Metre (sqm)', f: 1 },
      { id: 'sqin', label: 'Sq. Inch', f: IN * IN },
      { id: 'sqft', label: 'Sq. Foot (sqft)', f: FT * FT },
      { id: 'sqyd', label: 'Sq. Yard / Gaj', f: YD * YD },
      { id: 'cent', label: 'Cent', f: 40.468564224 },
      { id: 'guntha', label: 'Guntha', f: 101.17141056 },
      { id: 'acre', label: 'Acre', f: 4046.8564224 },
      { id: 'hectare', label: 'Hectare', f: 10000 }
    ]
  },
  volume: {
    label: 'Volume',
    units: [
      { id: 'cum', label: 'Cubic Metre (cum)', f: 1 },
      { id: 'cft', label: 'Cubic Foot (cft)', f: FT * FT * FT },
      { id: 'cuin', label: 'Cubic Inch', f: IN * IN * IN },
      { id: 'cuyd', label: 'Cubic Yard', f: YD * YD * YD },
      { id: 'brass', label: 'Brass (100 cft)', f: 100 * FT * FT * FT },
      { id: 'ltr', label: 'Litre', f: 0.001 },
      { id: 'ml', label: 'Millilitre', f: 1e-6 },
      { id: 'gal', label: 'Gallon (US)', f: 0.003785411784 }
    ]
  },
  weight: {
    label: 'Weight',
    units: [
      { id: 'g', label: 'Gram (g)', f: 0.001 },
      { id: 'kg', label: 'Kilogram (kg)', f: 1 },
      { id: 'quintal', label: 'Quintal', f: 100 },
      { id: 'tonne', label: 'Tonne (MT)', f: 1000 },
      { id: 'lb', label: 'Pound (lb)', f: 0.45359237 },
      { id: 'bag', label: 'Cement Bag (50 kg)', f: 50 }
    ]
  }
};

/**
 * Safely evaluate a simple arithmetic expression (+ - * / % ^ and brackets;
 * also accepts × ÷ x). Returns a finite number or NaN — never runs code.
 */
export function evalExpression(src) {
  const s = String(src ?? '').replace(/[×xX]/g, '*').replace(/÷/g, '/').replace(/,/g, '').trim();
  if (!s) return NaN;
  let i = 0;
  const peek = () => { while (s[i] === ' ') i++; return s[i]; };
  function primary() {
    const c = peek();
    if (c === '(') { i++; const v = sum(); if (peek() !== ')') throw 0; i++; return v; }
    if (c === '-') { i++; return -primary(); }
    if (c === '+') { i++; return primary(); }
    const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (!m) throw 0;
    i += m[0].length;
    let v = parseFloat(m[0]);
    if (peek() === '%') { i++; v /= 100; }
    return v;
  }
  function power() {
    const b = primary();
    if (peek() === '^') { i++; return Math.pow(b, power()); }
    return b;
  }
  function product() {
    let v = power();
    for (let c = peek(); c === '*' || c === '/'; c = peek()) {
      i++;
      v = c === '*' ? v * power() : v / power();
    }
    return v;
  }
  function sum() {
    let v = product();
    for (let c = peek(); c === '+' || c === '-'; c = peek()) {
      i++;
      v = c === '+' ? v + product() : v - product();
    }
    return v;
  }
  try {
    const v = sum();
    if (peek() !== undefined) return NaN;
    return Number.isFinite(v) ? v : NaN;
  } catch { return NaN; }
}

/**
 * Parse a feet-inches value into decimal feet. Accepts 5'6", 5' 6, 5-6,
 * 5ft 6in, 5 6 (two numbers), 6" or a plain number / expression (= feet).
 */
export function parseFeetInches(src) {
  const s = String(src ?? '').trim().toLowerCase();
  if (!s) return NaN;
  const m = /^(-?\d+(?:\.\d+)?)\s*(?:'|′|ft|feet|foot|-|\s)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|″|in|inch|inches)?)?$/.exec(s);
  if (m) return parseFloat(m[1]) + (m[2] ? parseFloat(m[2]) / 12 : 0) * Math.sign(parseFloat(m[1]) || 1);
  const inch = /^(\d+(?:\.\d+)?)\s*(?:"|″|in|inch|inches)$/.exec(s);
  if (inch) return parseFloat(inch[1]) / 12;
  return evalExpression(s);
}

/** Format decimal feet as 5' 6-1/2" (rounded to the nearest 1/16"). */
export function formatFeetInches(feet) {
  if (!Number.isFinite(feet)) return '';
  const neg = feet < 0;
  let sixteenths = Math.round(Math.abs(feet) * 12 * 16);
  const ft = Math.floor(sixteenths / (12 * 16));
  sixteenths -= ft * 12 * 16;
  const inch = Math.floor(sixteenths / 16);
  let frac = sixteenths % 16, den = 16;
  while (frac && frac % 2 === 0) { frac /= 2; den /= 2; }
  const inStr = inch + (frac ? `-${frac}/${den}` : '');
  return `${neg ? '-' : ''}${ft}' ${inStr}"`;
}

/** Read a user-typed value in the given unit (feet-inches aware). */
export function parseValue(src, unit) {
  return unit && unit.ftin ? parseFeetInches(src) : evalExpression(src);
}

/** Convert `value` between two unit ids of a category. NaN on bad input. */
export function convert(value, fromId, toId, category) {
  const cat = CONVERT_CATEGORIES[category];
  const from = cat && cat.units.find(u => u.id === fromId);
  const to = cat && cat.units.find(u => u.id === toId);
  if (!from || !to || !Number.isFinite(value)) return NaN;
  return value * from.f / to.f;
}

/** Tidy number for display: up to 6 significant decimals, no trailing zeros. */
export function formatNumber(v) {
  if (!Number.isFinite(v)) return '';
  if (v !== 0 && (Math.abs(v) >= 1e12 || Math.abs(v) < 1e-6)) return v.toExponential(6).replace(/\.?0+e/, 'e');
  const r = Math.round(v * 1e6) / 1e6;
  return r.toLocaleString('en-IN', { maximumFractionDigits: 6 });
}

/** Display a converted value in the target unit (feet-inches aware). */
export function formatValue(v, unit) {
  return unit && unit.ftin ? formatFeetInches(v) : formatNumber(v);
}
