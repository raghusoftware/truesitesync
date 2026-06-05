/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Purchase / PO total math (pure)
 * ═══════════════════════════════════════════════════════════
 * Pure helper for purchase bills: line subtotal + extra charges
 * (transport, loading, GST). Shared by the live total preview and
 * the save path so the grand total is computed in one place.
 * No DOM, no app state.
 * ═══════════════════════════════════════════════════════════
 */

/** Amount for a single line = qty * rate (safe). */
export function lineAmount(qty, rate) {
  return (Number(qty) || 0) * (Number(rate) || 0);
}

/**
 * Compute purchase bill totals.
 * @param {number} subtotal sum of line amounts
 * @param {{transport?:number, loading?:number, gst?:number}} extras
 * @returns {{subtotal:number, transport:number, loading:number, gst:number, extras:number, totalAmount:number}}
 */
export function computePurchaseTotal(subtotal, extras = {}) {
  const sub = Number(subtotal) || 0;
  const transport = Number(extras.transport) || 0;
  const loading = Number(extras.loading) || 0;
  const gst = Number(extras.gst) || 0;
  const extrasTotal = transport + loading + gst;
  return {
    subtotal: sub,
    transport,
    loading,
    gst,
    extras: extrasTotal,
    totalAmount: sub + extrasTotal
  };
}
