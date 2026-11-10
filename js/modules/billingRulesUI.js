/**
 * billingRulesUI.js — the "Billing & Compliance Rules" block shared by the Add / Edit Client form,
 * the party edit sheet and the project form. Three rules, each with quick chips and a line that
 * says where the number goes:
 *   Payment terms  → due date → Cash Flow
 *   TDS %          → deducted on every bill → TDS receivable (tax credit)
 *   Retention %    → withheld on every bill → Retention receivable (locked cash)
 * A project block can inherit: blank fields fall back to the client's rule (shown as the placeholder).
 * Maths and storage rules: billingRules.js.
 */
import { TDS_PRESETS, RETENTION_PRESETS } from './billingRules.js?v=1.0.0';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const has = v => v != null && v !== '';
const TERMS = [[0, 'Immediate'], [7, 'Net 7'], [15, 'Net 15'], [30, 'Net 30'], [45, 'Net 45'], [60, 'Net 60']];
const termsLbl = d => (+d === 0 ? 'Immediate' : `Net ${+d}`);

function chips(id, list, cur, fmt) {
  return `<div class="br-chips" data-for="${id}">${list.map(v => `<button type="button" class="br-chip${has(cur) && +cur === +v ? ' on' : ''}" data-v="${v}" onclick="window._brPick('${id}', ${v})">${fmt(v)}</button>`).join('')}</div>`;
}

/**
 * @param {string} p  id prefix → inputs `${p}Terms`, `${p}Tds`, `${p}Ret` (+ `${p}CreditLimit` when credit)
 * @param {{terms?, tds?, ret?, credit?, showCredit?:boolean, inherit?:{terms?, tds?, ret?, from:string}, required?:boolean}} v
 */
export function rulesBlockHTML(p, v = {}) {
  const inh = v.inherit;
  const ph = (k, f) => (inh && has(inh[k]) ? `Client: ${f(inh[k])}` : inh ? 'Client: not set' : '');
  const field = (id, label, val, list, fmt, unit, hint, tone, phTxt) => `
    <div class="br-rule ${tone}">
      <div class="br-rule-h"><label for="${id}">${label}</label><span class="br-flow">${hint}</span></div>
      <div class="br-in"><input id="${id}" type="number" inputmode="decimal" min="0" max="${unit === 'days' ? 365 : 100}" step="${unit === 'days' ? 1 : 0.5}" value="${esc(has(val) ? val : '')}" placeholder="${esc(phTxt || (unit === 'days' ? 'e.g. 30' : '0'))}" oninput="window._brSync('${id}')"><em>${unit === 'days' ? 'days' : '%'}</em></div>
      ${chips(id, list, val, fmt)}
    </div>`;
  return `<section class="br-card" aria-label="Billing and compliance rules">
    <header><span class="br-ic" aria-hidden="true">⚖️</span><div><b>Billing &amp; compliance rules</b><small>${inh ? `Leave blank to use ${esc(inh.from)}'s rules` : 'Applied automatically to every RA bill and invoice'}</small></div></header>
    ${field(p + 'Terms', `Payment terms${v.required ? ' *' : ''}`, v.terms, TERMS.map(t => t[0]), termsLbl, 'days', '→ Cash Flow due dates', 't', ph('terms', termsLbl))}
    <div class="br-row2">
      ${field(p + 'Tds', 'TDS deducted by client', v.tds, TDS_PRESETS, x => x + '%', '%', '→ TDS receivable', 'x', ph('tds', x => x + '%'))}
      ${field(p + 'Ret', 'Retention withheld', v.ret, RETENTION_PRESETS, x => x + '%', '%', '→ Locked cash', 'r', ph('ret', x => x + '%'))}
    </div>
    ${v.showCredit ? `<div class="br-rule"><div class="br-rule-h"><label for="${p}CreditLimit">Credit limit</label><span class="br-flow">optional</span></div>
      <div class="br-in"><input id="${p}CreditLimit" type="number" inputmode="decimal" min="0" value="${esc(v.credit || '')}" placeholder="Max outstanding"><em>₹</em></div></div>` : ''}
    <p class="br-note">On each bill: GST is added first, then TDS and retention are worked out on the taxable value and shown as <b>Net receivable</b>. Retention stays out of the 30-day cash forecast until you raise a release bill.</p>
  </section>`;
}

/** Read a block back: blank → null (inherit / not set). */
export function readRules(p) {
  const g = id => { const el = document.getElementById(p + id); const s = el ? String(el.value).trim() : ''; return s === '' ? null : Math.max(0, parseFloat(s) || 0); };
  return { paymentTermsDays: g('Terms') == null ? null : Math.round(g('Terms')), defaultTdsRate: g('Tds'), defaultRetentionRate: g('Ret') };
}

window._brSync = id => {
  const el = document.getElementById(id), box = document.querySelector(`.br-chips[data-for="${id}"]`); if (!el || !box) return;
  box.querySelectorAll('.br-chip').forEach(b => b.classList.toggle('on', el.value !== '' && +el.value === +b.dataset.v));
};
window._brPick = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = String(el.value) !== '' && +el.value === v ? '' : v; window._brSync(id); el.dispatchEvent(new Event('change', { bubbles: true })); };
window.billingRulesBlock = rulesBlockHTML;
window.readBillingRules = readRules;
