/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — "Modern Design" PDF theme (shared)
 * ═══════════════════════════════════════════════════════════
 * Exact palette + drawing helpers for the client-supplied Modern Design
 * templates (Measurement Sheet & Abstract Sheet). Colours were sampled
 * from the template PDFs — DO NOT change them; the design must look the
 * same on every export. Only the data (company, client, items) varies.
 * ═══════════════════════════════════════════════════════════
 */

import { state } from './state.js';

export const MD = {
  // Shared
  ORANGE:    [247, 150, 70],   // #F79646 company name / titles / address
  LABEL:     [89, 89, 89],     // #595959 labels, table head, item headers
  INK:       [0, 0, 0],        // #000000 values / measurement lines
  RULE:      [166, 166, 166],  // #A6A6A6 row rules
  // Measurement sheet
  TEAL:      [75, 172, 198],   // #4BACC6 rule under the letterhead
  BOX:       [191, 191, 191],  // #BFBFBF info-box border + item accent bar
  HEADBOX:   [217, 217, 217],  // #D9D9D9 table-head rounded box + info separators
  TOTFILL:   [220, 230, 241],  // #DCE6F1 item total fill
  TOTLINE:   [79, 129, 189],   // #4F81BD item total rules
  TOTTEXT:   [36, 64, 98],     // #244062 item total text
  // Abstract sheet
  PEACH:     [253, 234, 218],  // #FDEADA header band
  PEACH2:    [253, 233, 217],  // #FDE9D9 total-in-words row
  NAVY:      [23, 55, 94],     // #17375E table head fill
  NAVYLINE:  [56, 93, 138],    // #385D8A box borders / head border
  SHADOW:    [79, 129, 189],   // #4F81BD reference-box shadow
  BODY:      [64, 64, 64],     // #404040 abstract body text
};

/** Draw an image inside a box, keeping its aspect ratio (top-left anchored, centred on the cross axis). */
export function fitImage(doc, img, x, y, maxW, maxH, alignX = 'left') {
  if (!img) return null;
  let w = maxW, h = maxH;
  try {
    const p = doc.getImageProperties(img);
    if (p && p.width && p.height) {
      const r = Math.min(maxW / p.width, maxH / p.height);
      w = p.width * r; h = p.height * r;
    }
  } catch { /* fall back to the full box */ }
  const dx = alignX === 'center' ? (maxW - w) / 2 : 0;
  const dy = (maxH - h) / 2;
  const fmt = /^data:image\/jpe?g/i.test(String(img)) ? 'JPEG' : 'PNG';
  try { doc.addImage(img, fmt, x + dx, y + dy, w, h); } catch { return null; }
  return { x: x + dx, y: y + dy, w, h };
}

/** Currency symbol the template shows. */
export function curSymbol() { return (state.currencySettings || {}).symbol || '₹'; }

/**
 * Draw the currency symbol with its left edge at x and baseline at y.
 * With the embedded template fonts ₹ is real text; on the Helvetica fallback
 * (core PDF fonts have no ₹ glyph) it is drawn as a small vector glyph.
 */
export function drawCurSym(doc, x, y, sizePt, color, F, style = 'normal') {
  const sym = curSymbol();
  doc.setTextColor(color[0], color[1], color[2]);
  if (F && F.custom) { doc.setFont(F.sans, style); doc.setFontSize(sizePt); doc.text(sym, x, y); return; }
  if (sym !== '₹') { doc.text(sym, x, y); return; }
  const h = sizePt * 0.3528 * 0.72;   // cap height in mm
  const w = h * 0.66;
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(h * 0.11);
  doc.setLineCap('butt');
  const top = y - h;
  doc.line(x, top + h * 0.05, x + w, top + h * 0.05);              // top bar
  doc.line(x, top + h * 0.3, x + w, top + h * 0.3);                // second bar
  // Bowl: from the top bar, round to the right, back to the stem at mid-height.
  const sx = x + w * 0.3, sy = top + h * 0.05;
  const ex = x + w * 0.08, ey = top + h * 0.55;
  doc.lines([[w * 0.6, 0, w * 0.6, h * 0.5, ex - sx, ey - sy]], sx, sy, [1, 1], 'S', false);
  doc.line(ex, ey, x + w * 0.82, y);                                // leg
}

// ── Template fonts ──────────────────────────────────────────────────────────
// The templates use Century Gothic (headings/labels) and Calibri / Segoe UI
// (values, figures). Those are proprietary, so we embed close open equivalents
// from assets/fonts: URW Gothic (Century Gothic look) and TSS Doc Sans (a
// Carlito subset — metric-compatible with Calibri). Loaded once, on demand.
const _FONT_FILES = ['URWGothic-Book.ttf', 'URWGothic-Demi.ttf', 'TSSDocSans-Regular.ttf', 'TSSDocSans-Bold.ttf'];
let _fontPromise = null;
function _toB64(buf) {
  const b = new Uint8Array(buf); let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
/** Fetch the template fonts (base64), cached. Resolves null when unavailable (falls back to Helvetica). */
export function loadModernFonts() {
  if (!_fontPromise) {
    _fontPromise = (async () => {
      try {
        const base = new URL('../../assets/fonts/', import.meta.url);
        const bufs = await Promise.all(_FONT_FILES.map(n => fetch(new URL(n, base)).then(r => {
          if (!r.ok) throw new Error(n + ' ' + r.status);
          return r.arrayBuffer();
        })));
        const out = {};
        _FONT_FILES.forEach((n, i) => { out[n] = _toB64(bufs[i]); });
        return out;
      } catch (e) {
        console.warn('[Modern PDF] template fonts unavailable — using Helvetica', e);
        _fontPromise = null; // retry on the next export
        return null;
      }
    })();
  }
  return _fontPromise;
}

/**
 * New A4 portrait document for the Modern Design. Built from the ORIGINAL
 * jsPDF constructor so the global monochrome mode (pdfMono.js) does not strip
 * the template colours, with the template fonts registered when available.
 * Returns { doc, F } where F.gothic / F.sans are the font families to use.
 */
export function newModernDoc(fonts) {
  const ns = window.jspdf;
  const J = ns.__monoOrig || ns.jsPDF;
  const doc = new J('portrait', 'mm', 'a4');
  const F = { gothic: 'helvetica', sans: 'helvetica', arial: 'helvetica', custom: false };
  if (fonts) {
    try {
      const reg = (file, fam, style) => { doc.addFileToVFS(file, fonts[file]); doc.addFont(file, fam, style); };
      reg('URWGothic-Book.ttf', 'MDGothic', 'normal');
      reg('URWGothic-Demi.ttf', 'MDGothic', 'bold');
      reg('TSSDocSans-Regular.ttf', 'MDSans', 'normal');
      reg('TSSDocSans-Bold.ttf', 'MDSans', 'bold');
      Object.assign(F, { gothic: 'MDGothic', sans: 'MDSans', custom: true });
    } catch (e) { console.warn('[Modern PDF] font registration failed — using Helvetica', e); }
  }
  return { doc, F };
}

/** Format a number the Indian/locale way with 2 decimals (no symbol). */
export function money2(n) {
  const cs = state.currencySettings || {};
  const locale = cs.locale || 'en-IN';
  return (Number(n) || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Grand total as the template prints it: whole numbers without decimals ("3,25,000"). */
export function moneyTotal(n) {
  const cs = state.currencySettings || {};
  const locale = cs.locale || 'en-IN';
  const v = Number(n) || 0;
  const whole = Math.abs(v - Math.round(v)) < 0.005;
  return v.toLocaleString(locale, whole ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "05 June 2026" from an ISO / dd-mm-yyyy / Date-parsable string. */
export function fmtLongDate(v) {
  if (!v) return '';
  const M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  let d, m, y;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(v));
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(String(v).trim()))) { d = +r[1]; m = +r[2]; y = +r[3]; if (y < 100) y += 2000; }
  else { const dt = new Date(v); if (isNaN(dt)) return String(v); d = dt.getDate(); m = dt.getMonth() + 1; y = dt.getFullYear(); }
  if (!(m >= 1 && m <= 12)) return String(v);
  return String(d).padStart(2, '0') + ' ' + M[m - 1] + ' ' + y;
}
