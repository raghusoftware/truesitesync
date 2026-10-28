/**
 * pendingGroups.js — pure rules for the bill forms' "pending" pickers and tax
 * scope (no DOM, unit-tested).
 *
 *   parseDocDate(v)                     → 'YYYY-MM-DD' from ISO / dd/mm/yyyy / dd-mm-yyyy / Date, else ''
 *   groupByMonth(items, getDate, opts)  → [{ key:'2026-01', label:'January 2026', items }] in date order,
 *                                         undated items last under 'No date'
 *   gstStateCode(gstin)                 → '24' (first two digits of a valid-looking GSTIN) or ''
 *   taxScopeFor(ourGstin, partyGstin)   → 'CGST_SGST' (same state) | 'IGST' (different) | '' (unknown)
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const _p2 = n => String(n).padStart(2, '0');

export function parseDocDate(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return isNaN(v) ? '' : `${v.getFullYear()}-${_p2(v.getMonth() + 1)}-${_p2(v.getDate())}`;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return _valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);      // Indian order: day first
  if (m) return _valid(+m[3], +m[2], +m[1]);
  return '';
}
function _valid(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1 ? `${y}-${_p2(mo)}-${_p2(d)}` : '';
}

export function monthLabel(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(key || '');
  return m ? `${MONTHS[+m[2] - 1]} ${m[1]}` : 'No date';
}

/**
 * Sort by date (oldest first by default — the order bills are settled in) and
 * group under month headers. Same-day items keep their original order.
 * @param {Array} items
 * @param {(it) => any} getDate
 * @param {{ order?: 'asc' | 'desc' }} [opts]
 */
export function groupByMonth(items, getDate, opts = {}) {
  const dir = opts.order === 'desc' ? -1 : 1;
  const rows = (items || []).map((it, i) => ({ it, i, d: parseDocDate(getDate(it)) }));
  rows.sort((a, b) => {
    if (!a.d !== !b.d) return a.d ? -1 : 1;                 // undated always last
    return (a.d === b.d ? 0 : (a.d < b.d ? -1 : 1) * dir) || a.i - b.i;
  });
  const groups = [];
  rows.forEach(r => {
    const key = r.d ? r.d.slice(0, 7) : '';
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) { g = { key, label: monthLabel(key), items: [] }; groups.push(g); }
    g.items.push(r.it);
  });
  return groups;
}

export function gstStateCode(gstin) {
  const s = String(gstin || '').trim().toUpperCase();
  return /^\d{2}[A-Z0-9]{13}$/.test(s) && +s.slice(0, 2) > 0 && +s.slice(0, 2) <= 38 ? s.slice(0, 2) : '';
}

export function taxScopeFor(ourGstin, partyGstin) {
  const a = gstStateCode(ourGstin), b = gstStateCode(partyGstin);
  if (!a || !b) return '';
  return a === b ? 'CGST_SGST' : 'IGST';
}
