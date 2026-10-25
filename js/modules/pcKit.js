/**
 * pcKit.js — "premium card" building blocks for module screens (Tools,
 * Material Transfer, Physical Audit). Plain HTML-string helpers; the look
 * lives in css/shell.css under "Premium cards" (design tokens --pc-*).
 *
 *   pcPage(...)   vertical stack with the standard gap between cards
 *   pcStats([..]) row of 3 summary tiles
 *   pcCard({..})  card with icon, title, subtitle, optional header action
 *   pcField(..)   labelled form control;  pcForm(..) responsive field grid
 *   pcItem({..})  one history row (icon · title/meta · value · action)
 */

export const pcEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
/** 2026-10-25 → "25 Oct 2026" */
export function pcDate(d) {
  const [y, m, dd] = String(d || '').split('-').map(Number);
  return y && m ? `${dd} ${MON[m - 1]} ${y}` : '—';
}

export const pcPage = (...parts) => `<div class="pc-page">${parts.filter(Boolean).join('')}</div>`;

/** stats: [{ label, value, tone: 'brand'|'green'|'amber'|'red'|'slate', hint }] */
export const pcStats = (stats) => `<div class="pc-stats">${stats.map(s =>
  `<div class="pc-stat ${s.tone || 'slate'}"><span>${pcEsc(s.label)}</span><b>${s.value}</b>${s.hint ? `<small>${pcEsc(s.hint)}</small>` : ''}</div>`).join('')}</div>`;

/** A card. tone colours the icon tile; action is optional header HTML (e.g. a count). */
export const pcCard = ({ icon, title, sub, body, tone = 'brand', action = '', flush = false }) =>
  `<section class="pc-card">
    <header class="pc-head"><span class="pc-ic ${tone}" data-keep-emoji>${icon}</span>
      <div class="pc-ttl"><h4>${pcEsc(title)}</h4>${sub ? `<p>${pcEsc(sub)}</p>` : ''}</div>${action}</header>
    <div class="pc-body${flush ? ' flush' : ''}">${body}</div>
  </section>`;

export const pcField = (label, control, { wide = false, hint = '' } = {}) =>
  `<label class="pc-field${wide ? ' wide' : ''}"><span>${pcEsc(label)}</span>${control}${hint ? `<small>${hint}</small>` : ''}</label>`;

export const pcForm = (...fields) => `<div class="pc-form">${fields.join('')}</div>`;

/** A status pill. tone: green | amber | red | slate | blue */
export const pcPill = (text, tone = 'slate') => `<span class="pc-pill ${tone}">${pcEsc(text)}</span>`;

/** One history row. right = value / pill / button HTML. */
export const pcItem = ({ icon, title, meta = [], right = '', tone = 'slate' }) =>
  `<div class="pc-item"><span class="pc-item-ic ${tone}" data-keep-emoji>${icon}</span>
    <div class="pc-item-txt"><b>${pcEsc(title)}</b>${meta.length ? `<small>${meta.filter(Boolean).join('&nbsp;<i>·</i> ')}</small>` : ''}</div>
    <div class="pc-item-r">${right}</div></div>`;

export const pcList = (items, empty) => items.length
  ? `<div class="pc-list">${items.join('')}</div>`
  : `<div class="pc-empty">${pcEsc(empty)}</div>`;
