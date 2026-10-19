/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Estimate math (pure, no DOM / app state)
 * ═══════════════════════════════════════════════════════════
 *  - projectBoqRate: the rate of a measured item in its project's BOQ / PO
 *  - estimateTotals: subtotal → discount (% or flat) → net total
 * ═══════════════════════════════════════════════════════════
 */

import { lookupBoqItem } from './abstractCalc.js';

const _rate = (it) => {
  const r = parseFloat(it?.rate);
  return Number.isFinite(r) && r > 0 ? r : null;   // 0 = unpriced line
};

/**
 * Rate of a measurement entry in its project's BOQ / PO. Uses the exact BOQ line
 * the entry was picked from (boqIndex), then falls back to matching the item code.
 * @returns {number|null} null when the project has no rate for this item
 */
export function projectBoqRate(project, entry) {
  if (!project || !entry) return null;
  const r = _rate(lookupBoqItem(project, entry.boqIndex));
  if (r !== null) return r;
  const code = String(entry.code || '').trim().toLowerCase();
  if (!code) return null;
  const same = (it) => String(it.code || it.itemNo || '').trim().toLowerCase() === code;
  for (const it of [...(project.boqs || []).flatMap(g => g.items || []), ...(project.boqItems || [])]) {
    if (same(it) && _rate(it) !== null) return _rate(it);
  }
  return null;
}

/**
 * Estimate totals with an optional discount.
 * @param {Array<{qty:number, rate:number}>} items
 * @param {'pct'|'amt'} discountType  percentage of subtotal, or a flat amount
 * @param {number} discountValue
 */
export function estimateTotals(items, discountType, discountValue) {
  const r2 = (n) => Math.round(n * 100) / 100;
  const subTotal = r2((items || []).reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.rate) || 0), 0));
  const v = Math.max(0, parseFloat(discountValue) || 0);
  let discountAmount = discountType === 'pct' ? subTotal * Math.min(v, 100) / 100 : Math.min(v, subTotal);
  discountAmount = r2(discountAmount);
  return { subTotal, discountAmount, total: r2(subTotal - discountAmount) };
}
