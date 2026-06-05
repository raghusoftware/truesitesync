/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Abstract / RA-Bill billing math (pure)
 * ═══════════════════════════════════════════════════════════
 * Pure, dependency-free functions for computing RA-bill rows:
 * previous-bill quantity, this-bill quantity, cumulative total,
 * and the corresponding amounts + grand totals.
 *
 * This is the money math, so it lives in one tested place and is
 * shared by every exporter (PDF + Excel) instead of being copied.
 * No DOM, no app state, no jsPDF — unit-testable in Node.
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Resolve a BOQ item from a project given an item reference.
 * Supports the new "boqGroupId:itemIndex" format and the legacy
 * flat numeric index into proj.boqItems.
 * @returns {object|null}
 */
export function lookupBoqItem(proj, ref) {
  if (ref === undefined || ref === null || ref === '') return null;
  const refStr = String(ref);
  // New format: "boqGroupId:itemIndex"
  if (refStr.includes(':') && proj?.boqs?.length) {
    const [gId, iStr] = refStr.split(':');
    const group = proj.boqs.find(g => g.id === gId);
    const idx = parseInt(iStr);
    if (group && !isNaN(idx) && group.items?.[idx]) return group.items[idx];
  }
  // Legacy format: flat numeric index into boqItems
  const idx = parseInt(refStr);
  const boqItems = proj?.boqItems || [];
  if (!isNaN(idx) && boqItems[idx]) return boqItems[idx];
  return null;
}

/** Stable key used to match the same line item across abstracts. */
export function abstractItemKey(item) {
  return item.boqIndex ?? item.code ?? item.desc;
}

/**
 * Sum quantities billed in all *earlier* abstracts for the same project,
 * keyed by item. "Earlier" = different abstract, same project, dated on
 * or before this abstract's date.
 * @returns {Object<string, number>} key -> cumulative previous quantity
 */
export function computePrevQtyMap(abstract, allAbstracts) {
  const map = {};
  const thisDate = new Date(abstract.date);
  (allAbstracts || []).forEach(ab => {
    if (ab.id === abstract.id) return;
    if (ab.projectId !== abstract.projectId) return;
    if (new Date(ab.date) > thisDate) return;
    (ab.items || []).forEach(item => {
      const key = abstractItemKey(item);
      map[key] = (map[key] || 0) + (item.qty || 0);
    });
  });
  return map;
}

/**
 * Compute the full set of detailed-abstract rows + grand totals.
 * @param {object} abstract      the abstract being billed
 * @param {object[]} allAbstracts every abstract (to derive previous qty)
 * @param {object} proj          the project (for BOQ qty lookup)
 * @returns {{rows: object[], totals: {grandPreAmt:number, grandThisAmt:number, grandTotalAmt:number}}}
 */
export function computeAbstractRows(abstract, allAbstracts, proj) {
  const prevQtyMap = computePrevQtyMap(abstract, allAbstracts);
  let grandPreAmt = 0, grandThisAmt = 0, grandTotalAmt = 0;

  const rows = (abstract.items || []).map((item, idx) => {
    const key = abstractItemKey(item);
    const boqItem = lookupBoqItem(proj, item.boqIndex);
    const boqQty = boqItem?.qty || 0;
    const rate = item.rate || 0;
    const thisBillQty = item.qty || 0;
    const prevQty = prevQtyMap[key] || 0;
    const totalQty = prevQty + thisBillQty;
    const preAmt = prevQty * rate;
    const thisAmt = thisBillQty * rate;
    const totalAmt = totalQty * rate;

    grandPreAmt += preAmt;
    grandThisAmt += thisAmt;
    grandTotalAmt += totalAmt;

    return {
      srNo: idx + 1,
      code: item.code || '',
      desc: item.desc || '',
      uom: item.uom || '',
      boqQty, prevQty, thisBillQty, totalQty,
      rate, preAmt, thisAmt, totalAmt
    };
  });

  return { rows, totals: { grandPreAmt, grandThisAmt, grandTotalAmt } };
}
