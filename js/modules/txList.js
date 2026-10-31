/**
 * txList.js — the shared transaction list (TransactionListCard) used by Sale Invoices, Purchase Bills,
 * Proforma Invoices, Purchase Orders and Purchase Returns. Same look as the Estimates list:
 *
 *   ┌ No. + date ┬ party + sub-line (truncates) ┬ amount (never truncates) + status badge ┬ ⋯ ┐
 *
 * The amount column is sized to its content (`auto`, flex-shrink 0) so long figures push the party
 * name aside instead of being cut; on a narrow phone the card becomes two lines and the amount keeps
 * its own column. A cancelled document stays in the list, struck through and dimmed, with a red badge.
 *
 *   txCard(row)                    → one card
 *   txMount(tbody, html, summary)  → hides the screen's old <table> and renders the cards beside it
 */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const txDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]} ${MON[+m[2] - 1] || m[2]} ${m[1]}` : (iso || '—'); };

/** Badge tones: good · warn · bad · info · muted · cancel */
export const TONE = { Paid: 'good', Completed: 'good', Converted: 'good', Processed: 'good', Active: 'info', Partial: 'warn', Pending: 'warn', Unpaid: 'bad', Overdue: 'bad', Cancelled: 'cancel', Draft: 'muted' };

/**
 * @param {{ id:string, no:string, date?:string, party:string, sub?:string, amount:string, amountSub?:string,
 *           badge?:string, tone?:string, extra?:string, cancelled?:boolean, tap?:string, menu?:string, label?:string }} r
 *   amount / amountSub are pre-formatted strings; tap / menu are JS expressions (already escaped for an attribute)
 */
export function txCard(r) {
  const tone = r.cancelled ? 'cancel' : (r.tone || TONE[r.badge] || 'muted');
  const badge = r.cancelled ? 'Cancelled' : r.badge;
  return `<div class="txl${r.cancelled ? ' is-cancel' : ''}" role="button" tabindex="0" data-id="${esc(r.id)}"
      aria-label="${esc(r.label || `${r.no} · ${r.party} · ${r.amount}${badge ? ' · ' + badge : ''}`)}"
      ${r.tap ? `onclick="${r.tap}" onkeydown="if(event.key==='Enter'){${r.tap}}"` : ''}>
    <div class="txl-id"><b>${esc(r.no || '—')}</b><small>${esc(txDate(r.date))}</small></div>
    <div class="txl-who"><b>${esc(r.party || '—')}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}${r.extra || ''}</div>
    <div class="txl-amt"><b>${esc(r.amount)}</b>${badge ? `<span class="txl-badge ${tone}">${esc(badge)}</span>` : ''}${r.amountSub ? `<small>${esc(r.amountSub)}</small>` : ''}</div>
    ${r.menu ? `<button type="button" class="txl-more" aria-label="Actions for ${esc(r.no)}" onclick="event.stopPropagation();${r.menu}">⋯</button>` : '<span></span>'}
  </div>`;
}

/**
 * Render cards where a screen used to render table rows. The <table> is hidden (kept for print
 * layouts that still read it) and a `.txl-list` is placed right after it.
 */
export function txMount(tbody, cardsHTML, { summary = '', empty = 'Nothing here yet' } = {}) {
  if (!tbody) return null;
  const table = tbody.closest('table');
  if (!table) return null;
  table.classList.add('txl-hidden-table');
  let list = table.nextElementSibling;
  if (!list || !list.classList.contains('txl-list')) {
    list = document.createElement('div');
    list.className = 'txl-list';
    table.after(list);
  }
  list.innerHTML = (summary ? `<div class="txl-sum">${summary}</div>` : '')
    + (cardsHTML || `<div class="txl-empty"><b>${esc(empty)}</b><span>Try clearing the filters, or add a new one.</span></div>`);
  return list;
}

if (typeof window !== 'undefined') { window.txCard = txCard; window.txMount = txMount; }
