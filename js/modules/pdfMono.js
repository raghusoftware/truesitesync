/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Global PDF monochrome mode
 * ═══════════════════════════════════════════════════════════
 * Forces EVERY generated PDF to pure black & white: black text,
 * black lines, no colour fills. Wraps the jsPDF constructor so
 * every `new window.jspdf.jsPDF()` instance gets its colour
 * setters overridden as own-properties (jsPDF defines these
 * per-instance, so patching the prototype does nothing).
 *
 * This covers every template — invoices, estimates, measurement,
 * abstract, reports, purchase orders, muster rolls — so they all
 * match the plain measurement/abstract sheets. jsPDF-autoTable
 * routes its cell fills/text/borders through the instance's
 * setFillColor/setTextColor/setDrawColor, so tables come out as
 * clean black grids on white.
 *
 * Company logos (addImage) are intentionally left untouched.
 * ═══════════════════════════════════════════════════════════
 */

let _installed = false;

export function installPdfMonochrome() {
  if (_installed) return;
  const ns = window.jspdf;
  if (!ns || typeof ns.jsPDF !== 'function') return; // jsPDF not loaded yet

  const Orig = ns.jsPDF;

  function PatchedJsPDF(...args) {
    const inst = new Orig(...args);
    _forceMono(inst);
    return inst;
  }
  // Preserve prototype chain + static members (API, version, AcroForm, etc.)
  PatchedJsPDF.prototype = Orig.prototype;
  Object.setPrototypeOf(PatchedJsPDF, Orig);
  for (const k of Object.keys(Orig)) { try { PatchedJsPDF[k] = Orig[k]; } catch (_) {} }

  ns.jsPDF = PatchedJsPDF;
  ns.__monoOrig = Orig;
  _installed = true;
  console.log('[MES] PDF monochrome mode active — all exports render black & white');
}

function _forceMono(inst) {
  const st = inst.setTextColor.bind(inst);
  const sf = inst.setFillColor.bind(inst);
  const sd = inst.setDrawColor.bind(inst);
  // own-properties shadow the prototype, so these always win
  inst.setTextColor = function () { return st(0, 0, 0); };       // text → black
  inst.setFillColor = function () { return sf(255, 255, 255); }; // fills → white (no colour bands/shading)
  inst.setDrawColor = function () { return sd(0, 0, 0); };       // lines → black
}
