/**
 * equipmentCalc.js — pure helpers for the Equipment Usage History cards.
 * No DOM; unit-tested in tests/equipmentCalc.test.js.
 * Log records: { type, hours, km, litres, amount, startTime, finishTime, … }
 */

const _n = (v) => parseFloat(v) || 0;

/** The headline figures of one log, in display order (only the ones it has). */
export function logMetrics(l) {
  const out = [];
  if (_n(l.hours)) out.push({ key: 'hours', label: 'Hours', value: _n(l.hours) });
  if (_n(l.km)) out.push({ key: 'km', label: 'KM run', value: _n(l.km) });
  if (_n(l.litres)) out.push({ key: 'litres', label: 'Fuel', value: _n(l.litres) });
  if (_n(l.amount)) out.push({ key: 'amount', label: 'Amount', value: _n(l.amount) });
  return out;
}

/** Totals over a list of logs (for the summary tiles). */
export function usageTotals(logs = []) {
  const r2 = (x) => Math.round(x * 100) / 100;
  const t = logs.reduce((s, l) => ({
    hours: s.hours + _n(l.hours), km: s.km + _n(l.km), litres: s.litres + _n(l.litres), amount: s.amount + _n(l.amount),
  }), { hours: 0, km: 0, litres: 0, amount: 0 });
  return { count: logs.length, hours: r2(t.hours), km: r2(t.km), litres: r2(t.litres), amount: r2(t.amount) };
}

/** Colour family for a log type label. */
export function logTone(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'runbook') return 'green';
  if (t === 'fuel') return 'amber';
  if (t === 'maintenance' || t === 'repair') return 'blue';
  if (t === 'breakdown') return 'red';
  return 'slate';
}
