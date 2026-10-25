/**
 * reportCards.js — phone layout for register-style reports (GST registers,
 * stock registers, …). Turns the rows of a wide table into one card per entry
 * so nothing scrolls sideways:
 *
 *   ┌───────────────────────────────────────────┐
 *   │ INV-1042                         [ B2B ]  │  title · badge
 *   │ 12 Oct 2026 · Shree Builders     ₹1,18,000│  meta · hero amount
 *   ├─────────────────────┬─────────────────────┤
 *   │ Taxable  ₹1,00,000  │ IGST          ₹0    │  2-column micro-grid
 *   │ CGST       ₹9,000   │ SGST      ₹9,000    │  with hairline dividers
 *   ├─────────────────────┴─────────────────────┤
 *   │ View details ▾   (GSTIN, POS, HSN, …)     │  <details> accordion
 *   └───────────────────────────────────────────┘
 *
 * Which column goes where is worked out from the column types; a report can
 * override it with `card: { title, hero, grid: [...] }` in its definition.
 * No DOM access — returns an HTML string (unit-tested).
 */

const NUMERIC = new Set(['currency', 'number', 'percent']);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const empty = (v) => v === undefined || v === null || v === '' || v === '—';

/**
 * Decide the card layout for a set of columns.
 * @returns {{ title, badge, meta: [], hero, grid: [], details: [] }} column objects
 */
export function cardLayout(columns, hint = {}) {
  const byKey = (k) => columns.find(c => c.key === k);
  const used = new Set();
  const take = (c) => { if (c) used.add(c.key); return c || null; };
  const title = take(byKey(hint.title) || columns[0]);
  const badge = take(columns.find(c => c.type === 'badge' && !used.has(c.key)));
  const hero = take(byKey(hint.hero) || columns.find(c => c.type === 'currency' && !used.has(c.key)) || columns.find(c => NUMERIC.has(c.type) && !used.has(c.key)));
  const meta = [];
  const date = columns.find(c => c.type === 'date' && !used.has(c.key));
  if (date) meta.push(take(date));
  const text = columns.find(c => !NUMERIC.has(c.type) && c.type !== 'date' && c.type !== 'badge' && !used.has(c.key) && !/gstin|code|hsn|pos\b|uqc/i.test(c.key + c.label));
  if (text) meta.push(take(text));
  const grid = (hint.grid ? hint.grid.map(byKey).filter(Boolean) : columns.filter(c => NUMERIC.has(c.type) && !used.has(c.key)).slice(0, 4)).map(take);
  const details = columns.filter(c => !used.has(c.key));
  return { title, badge, meta, hero, grid, details };
}

/** "Taxable Value (₹)" → "Taxable Value" — the currency is shown in the value. */
const shortLabel = (c) => String(c.label || c.key).replace(/\s*\((₹|%|Rs\.?)\)\s*$/i, '');

/**
 * Cards for every row (+ a totals card).
 * @param {Array<Object>} rows
 * @param {Array<{key,label,type}>} columns
 * @param {Object|null} aggregateRow  { key: total }
 * @param {Object} hint               optional `card` override from the report definition
 * @param {(col, value, row) => string} fmt  formats a cell exactly like the table does
 */
export function reportCardsHtml(rows, columns, aggregateRow, hint, fmt) {
  if (!columns.length) return '';
  const L = cardLayout(columns, hint || {});
  const cell = (c, r) => (c && !empty(r[c.key]) ? fmt(c, r[c.key], r) : '');
  const kv = (c, r) => {
    const v = cell(c, r);
    return `<div class="rc-kv"><span>${esc(shortLabel(c))}</span><b>${v || '—'}</b></div>`;
  };
  const card = (r) => {
    const isTotal = r.type === 'Total' || r._isTotal;
    const meta = L.meta.map(c => cell(c, r)).filter(Boolean);
    const details = L.details.filter(c => !empty(r[c.key]));
    return `<article class="rc-card${isTotal ? ' total' : ''}">
      <div class="rc-top">
        <div class="rc-id"><b>${cell(L.title, r) || '—'}</b>${meta.length ? `<small>${meta.join('<i>·</i>')}</small>` : ''}</div>
        <div class="rc-right">${L.badge ? cell(L.badge, r) : ''}${L.hero ? `<div class="rc-hero"><span>${esc(shortLabel(L.hero))}</span><b>${cell(L.hero, r) || '—'}</b></div>` : ''}</div>
      </div>
      ${L.grid.length ? `<div class="rc-grid">${L.grid.map(c => kv(c, r)).join('')}</div>` : ''}
      ${details.length ? `<details class="rc-more"><summary>View details <em>${details.length}</em></summary><div class="rc-grid">${details.map(c => kv(c, r)).join('')}</div></details>` : ''}
    </article>`;
  };
  let html = `<div class="rpt-cards">${rows.map(card).join('')}`;
  if (aggregateRow && Object.keys(aggregateRow).length) {
    const cols = columns.filter(c => aggregateRow[c.key] !== undefined);
    html += `<article class="rc-card total"><div class="rc-top"><div class="rc-id"><b>Total</b><small>${rows.length} record${rows.length === 1 ? '' : 's'}</small></div></div>
      <div class="rc-grid">${cols.map(c => kv(c, aggregateRow)).join('')}</div></article>`;
  }
  return html + '</div>';
}
