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
