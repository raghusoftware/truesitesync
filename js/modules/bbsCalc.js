/**
 * bbsCalc.js — bar bending schedule maths for the BBS PDF (no DOM, unit-tested).
 *   bbsModel(rows) → rows with weight per row, the diameters used, a per-diameter summary, totals.
 */
import { bbsKgPerM, bbsRowsOf } from './sheetCalc.js?v=1.1.0';

const N = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
const r2 = v => Math.round(N(v) * 100) / 100;

/**
 * @param {Array} rows  saved BBS rows ({ mark, dia, noBar, no, totalBars, a, b, c, d, hook, cutLen, totalLen })
 */
export function bbsModel(rows) {
  const list = bbsRowsOf(rows).map((r, i) => {
    const dia = Math.round(N(r.dia));
    const bars = N(r.totalBars) || N(r.noBar) * (N(r.no) || 1);
    const len = N(r.totalLen) || bars * N(r.cutLen);
    const kgm = bbsKgPerM(dia);
    return { sn: i + 1, mark: String(r.mark || '').trim(), dia, noBar: N(r.noBar), no: N(r.no), bars, a: N(r.a), b: N(r.b), c: N(r.c), d: N(r.d), hook: N(r.hook), cutLen: N(r.cutLen), len: r2(len), kgm, kg: r2(len * kgm) };
  });
  const dias = [...new Set(list.map(r => r.dia).filter(Boolean))].sort((a, b) => a - b);
  const byDia = dias.map(d => {
    const rs = list.filter(r => r.dia === d);
    const len = r2(rs.reduce((t, r) => t + r.len, 0)), kgm = bbsKgPerM(d);
    return { dia: d, bars: rs.reduce((t, r) => t + r.bars, 0), len, kgm, kg: r2(len * kgm) };
  });
  const totalKg = r2(byDia.reduce((t, g) => t + g.kg, 0));
  return { rows: list, dias, byDia, totalBars: list.reduce((t, r) => t + r.bars, 0), totalLen: r2(list.reduce((t, r) => t + r.len, 0)), totalKg, totalMt: Math.round(totalKg) / 1000 };
}

