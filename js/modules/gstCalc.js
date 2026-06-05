/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — GST / tax math (pure)
 * ═══════════════════════════════════════════════════════════
 * Pure, dependency-free GST computation for tax invoices.
 *   - intra-state: CGST + SGST on the subtotal
 *   - inter-state: IGST on the subtotal
 *
 * Shared by the live bill preview and the invoice PDF so the tax
 * figures are computed in one tested place. No DOM, no app state.
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Compute GST on a subtotal.
 * @param {number} subtotal
 * @param {{type:'intra'|'inter', cgst?:number, sgst?:number, igst?:number}} rates
 *        Percentage rates (e.g. cgst: 9, sgst: 9, igst: 18).
 * @returns {{subtotal:number, type:string, taxAmount:number,
 *            cgstAmount:number, sgstAmount:number, igstAmount:number, total:number}}
 */
export function computeGst(subtotal, rates = {}) {
  const sub = Number(subtotal) || 0;
  const type = rates.type === 'inter' ? 'inter' : 'intra';
  let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;

  if (type === 'intra') {
    const cgst = Number(rates.cgst) || 0;
    const sgst = Number(rates.sgst) || 0;
    cgstAmount = sub * (cgst / 100);
    sgstAmount = sub * (sgst / 100);
  } else {
    const igst = Number(rates.igst) || 0;
    igstAmount = sub * (igst / 100);
  }

  const taxAmount = cgstAmount + sgstAmount + igstAmount;
  return {
    subtotal: sub,
    type,
    cgstAmount,
    sgstAmount,
    igstAmount,
    taxAmount,
    total: sub + taxAmount
  };
}

/**
 * Split a stored total tax amount back into display components.
 * Intra-state splits the tax equally into CGST + SGST; inter-state
 * is all IGST. Used when rendering an invoice from its stored figures.
 * @param {number} taxAmount
 * @param {string} gstType  'intra' | 'inter'
 * @returns {{cgst:number, sgst:number, igst:number}}
 */
export function splitTaxForDisplay(taxAmount, gstType) {
  const tax = Number(taxAmount) || 0;
  if (gstType === 'intra') {
    return { cgst: tax / 2, sgst: tax / 2, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: tax };
}
