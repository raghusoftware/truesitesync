/**
 * docNumbering.js — document number sequences (no DOM, unit-tested).
 *
 * Settings → Auto-Numbering stores, per document type:
 *   state.autoNumbering[key] = { prefix: 'GRN-', nextNum: 54, digits: 4 }
 *
 *   formatDocNo(prefix, n, digits)   → 'GRN-0054'
 *   seqOf(no, prefix)                → 54 for 'GRN-0054' under 'GRN-', else null
 *   nextDocNo(cfg, existingNos)      → { no, n } — never reuses a number already
 *                                      issued under this prefix: next = max(counter,
 *                                      highest used + 1). Data is saved offline-first
 *                                      and synced, so the counter alone can lag behind
 *                                      numbers that arrived from another device.
 *   parseStart('0001')               → { nextNum: 1, digits: 4 } (the typed width sets the padding)
 */

export const MAX_DIGITS = 9;
const _int = v => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : null; };

export function formatDocNo(prefix, n, digits = 4) {
  const d = Math.min(MAX_DIGITS, Math.max(1, _int(digits) || 4));
  return String(prefix ?? '') + String(Math.max(0, _int(n) ?? 1)).padStart(d, '0');
}

export function seqOf(no, prefix) {
  const s = String(no ?? ''), p = String(prefix ?? '');
  if (!s.startsWith(p)) return null;
  const rest = s.slice(p.length);
  return /^\d+$/.test(rest) ? parseInt(rest, 10) : null;
}

/**
 * @param {{ prefix?: string, nextNum?: number, digits?: number }} cfg
 * @param {string[]} existingNos  numbers already issued (any prefix — others are ignored)
 */
export function nextDocNo(cfg = {}, existingNos = []) {
  const prefix = cfg.prefix ?? '';
  let n = Math.max(1, _int(cfg.nextNum) ?? 1);
  (existingNos || []).forEach(no => { const k = seqOf(no, prefix); if (k != null && k >= n) n = k + 1; });
  return { no: formatDocNo(prefix, n, cfg.digits ?? 4), n };
}

/** Starting-number box: '0001' → { nextNum: 1, digits: 4 }; '54' → { 54, 2 }; junk → null. */
export function parseStart(text) {
  const t = String(text ?? '').trim();
  if (!/^\d{1,9}$/.test(t)) return null;
  return { nextNum: Math.max(1, parseInt(t, 10)), digits: Math.max(1, t.length) };
}
