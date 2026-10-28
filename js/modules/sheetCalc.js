/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Measurement-sheet aggregation (pure)
 * ═══════════════════════════════════════════════════════════
 * Pure, dependency-free helpers for measurement-book exports:
 *   - grouping a sheet's raw measurement entries by line item
 *   - summing previous-bill quantities from earlier sheets
 *
 * Shared by the detailed measurement PDF + Excel exporters so the
 * "previous / this bill / total done" quantities are computed in
 * exactly one tested place. No DOM, no app state, no jsPDF.
 * ═══════════════════════════════════════════════════════════
 */

/** Key used to accumulate previous-bill quantities (BOQ ref, else code). */
export function sheetPrevQtyKey(entry) {
  return entry.boqIndex ?? entry.code;
}

/** Key used to group entries of the current sheet into line items. */
export function sheetGroupKey(entry) {
  return entry.boqIndex ?? entry.code ?? entry.description;
}

/**
 * Sum quantities measured in all *earlier* sheets of the same project.
 * "Earlier" = different sheet, same project, dated on or before this sheet.
 * @returns {Object<string, number>} key -> cumulative previous quantity
 */
export function computeSheetPrevQtyMap(sheet, allSheets) {
  const map = {};
  const thisDate = new Date(sheet.date);
  (allSheets || []).forEach(sh => {
    if (sh.id === sheet.id) return;
    if (sh.projectId !== sheet.projectId) return;
    if (new Date(sh.date) > thisDate) return;
    (sh.entries || []).forEach(e => {
      const key = sheetPrevQtyKey(e);
      map[key] = (map[key] || 0) + (e.qty || 0);
    });
  });
  return map;
}

/**
 * Group a sheet's entries into line items. Entries with neither a code
 * nor a description are ignored (blank rows).
 * @returns {Object<string, object[]>} key -> array of entries
 */
export function groupSheetEntries(entries) {
  const grouped = {};
  (entries || []).forEach(e => {
    if (!e.code && !e.description) return;
    const key = sheetGroupKey(e);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  });
  return grouped;
}

/**
 * Resolve the previous-bill quantity for a grouped line item, matching the
 * group key first and falling back to the first entry's code.
 */
export function sheetPrevQtyFor(prevQtyMap, groupKey, firstEntry) {
  return prevQtyMap[groupKey] || prevQtyMap[firstEntry?.code] || 0;
}

/** Sum of quantities across a list of entries (this-bill quantity). */
export function sumEntryQty(entries) {
  return (entries || []).reduce((t, e) => t + (e.qty || 0), 0);
}

/* ── Bar Bending Schedule summary (Simple PDF / Excel) ─────────────────── */

/** Unit weight (kg/m) of TMT bars by diameter (mm) — d²/162, the standard
 *  table values for common sizes so totals match the detailed BBS page. */
const BBS_KG_PER_M = { 6: 0.222, 8: 0.395, 10: 0.617, 12: 0.889, 16: 1.580, 20: 2.469, 25: 3.858, 28: 4.834, 32: 6.313, 36: 7.990, 40: 9.864 };
export const bbsKgPerM = (dia) => BBS_KG_PER_M[dia] || (dia > 0 ? Math.round(dia * dia / 162 * 1000) / 1000 : 0);

const _num = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };

/** Usable BBS bar rows only (a mark or a diameter, like the sheet editor saves). */
export function bbsRowsOf(rows) {
  return (Array.isArray(rows) ? rows : []).filter(r => r && (String(r.mark || '').trim() || _num(r.dia) > 0));
}

/**
 * One line per bar diameter + grand total, for the compact "steel summary"
 * the Simple documents append. Lengths come from the saved Total Len; if that
 * is missing it is rebuilt from total bars × cut length.
 * @returns {{ rows: Array<{dia, bars, lengthM, kgPerM, kg}>, totalBars, totalLengthM, totalKg, totalMt, count }}
 */
export function bbsSummary(rows) {
  const by = {};
  const list = bbsRowsOf(rows);
  list.forEach(r => {
    const dia = Math.round(_num(r.dia));
    if (!dia) return;
    const bars = _num(r.totalBars) || (_num(r.noBar ?? r.nobar) * (_num(r.no) || 1));
    const len = _num(r.totalLen) || bars * _num(r.cutLen);
    const g = by[dia] || (by[dia] = { dia, bars: 0, lengthM: 0 });
    g.bars += bars; g.lengthM += len;
  });
  const out = Object.values(by).sort((a, b) => a.dia - b.dia).map(g => {
    const kgPerM = bbsKgPerM(g.dia);
    return { dia: g.dia, bars: Math.round(g.bars), lengthM: Math.round(g.lengthM * 100) / 100, kgPerM, kg: Math.round(g.lengthM * kgPerM * 100) / 100 };
  });
  const totalKg = Math.round(out.reduce((s, r) => s + r.kg, 0) * 100) / 100;
  return {
    rows: out, count: list.length,
    totalBars: out.reduce((s, r) => s + r.bars, 0),
    totalLengthM: Math.round(out.reduce((s, r) => s + r.lengthM, 0) * 100) / 100,
    totalKg, totalMt: Math.round(totalKg) / 1000,
  };
}
