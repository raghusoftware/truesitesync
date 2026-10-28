/**
 * estimateDoc.js — pure rules for estimate documents (no DOM, unit-tested).
 *
 *   buildEstimateModel(est, S)  → everything a template prints, already resolved
 *                                 (client, project, rows, totals, terms list)
 *   parseTerms(text)            → T&C text → clean list of clauses (numbering stripped)
 *   Saved T&C presets           → upsertPreset / removePreset / defaultPreset
 *
 * Presets live in state.termsPresets: [{ id, title, body, isDefault, updatedAt }].
 */

export const TEMPLATES = { classic: 'Classic', modern: 'Modern' };
export const DEFAULT_TEMPLATE = 'classic';

const _n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const _r2 = (v) => Math.round(_n(v) * 100) / 100;
const _r3 = (v) => Math.round(_n(v) * 1000) / 1000;

/**
 * T&C text → clauses. One clause per line; a line that does not start a new
 * point (no number / bullet) and follows a clause continues it, so pasted
 * paragraphs that wrap onto several lines stay one clause.
 */
export function parseTerms(text) {
  const out = [];
  String(text || '').replace(/\r/g, '').split('\n').forEach(raw => {
    const line = raw.trim();
    if (!line) { out.push(null); return; }                        // blank line ends a clause
    const m = /^(?:\(?\d{1,3}[.)\]:-]|\(?[a-z][.)]|[-•*▪●–])\s+(.*)$/i.exec(line);
    const prev = out[out.length - 1];
    if (m) out.push(m[1].trim());
    else if (prev != null && out.length && !/[.:;!?]$/.test(prev)) out[out.length - 1] = prev + ' ' + line;
    else out.push(line);
  });
  return out.filter(Boolean);
}

/** Everything the PDF / Excel templates print for one estimate. */
export function buildEstimateModel(est, S = {}) {
  const e = est || {};
  const client = (S.clients || []).find(c => c.id === e.clientId) || {};
  const project = (S.projects || []).find(p => p.id === e.projectId || p.id === client.projectId) || {};
  const cp = S.companyProfile || {};
  const items = (e.items || []).map((it, i) => {
    const qty = _r3(it.qty), rate = _r2(it.rate);
    return { sn: i + 1, code: it.code || '', desc: String(it.desc || '').trim(), qty, unit: it.unit || '', rate, amount: _r2(it.amount != null ? it.amount : qty * rate) };
  });
  const subTotal = _r2(e.subTotal != null ? e.subTotal : items.reduce((s, r) => s + r.amount, 0));
  const discountAmount = _r2(e.discountAmount);
  const total = _r2(e.total != null ? e.total : subTotal - discountAmount);
  return {
    number: e.estNum || '', date: e.date || '',
    template: TEMPLATES[e.template] ? e.template : DEFAULT_TEMPLATE,
    company: { name: cp.CompanyName || '', address: cp.Address || '', phone: cp.Phone || '', email: cp.Email || '', gst: String(cp.GST || '').toUpperCase(), logo: cp.logo || '' },
    client: { name: client.name || e.clientName || '', address: client.address || '', gst: String(client.gst || '').toUpperCase(), phone: client.contact || client.phone || '' },
    project: project.name || client.projectName || e.projectName || '',
    items, subTotal,
    discountLabel: discountAmount > 0 ? (e.discountType === 'pct' && _n(e.discountValue) ? `Discount (${_n(e.discountValue)}%)` : 'Discount') : '',
    discountAmount, total,
    terms: parseTerms(e.terms),
  };
}

/* ── Saved T&C presets ── */
const _key = (t) => String(t || '').trim().toLowerCase();

/** Add or update a preset by title (case-insensitive). Returns { list, preset }. */
export function upsertPreset(list, { id, title, body, isDefault }, mkId = () => 'tc_' + Date.now().toString(36), now = Date.now()) {
  const t = String(title || '').trim();
  if (!t) throw new Error('Title required');
  const arr = (list || []).map(p => ({ ...p }));
  let p = (id && arr.find(x => x.id === id)) || arr.find(x => _key(x.title) === _key(t));
  if (p) Object.assign(p, { title: t, body: String(body || ''), updatedAt: now });
  else { p = { id: mkId(), title: t, body: String(body || ''), isDefault: false, updatedAt: now }; arr.push(p); }
  if (isDefault != null) arr.forEach(x => { x.isDefault = isDefault ? x.id === p.id : (x.id === p.id ? false : x.isDefault); });
  return { list: arr, preset: p };
}
export function removePreset(list, id) { return (list || []).filter(p => p.id !== id); }
export function defaultPreset(list) { return (list || []).find(p => p.isDefault) || null; }
/** Presets sorted for the dropdown: default first, then A–Z. */
export function sortedPresets(list) {
  return (list || []).slice().sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || String(a.title).localeCompare(String(b.title)));
}

/* ── List status + duplicate ── */
export const STATUSES = { draft: 'Draft', sent: 'Sent', approved: 'Approved', rejected: 'Rejected' };
/** An estimate's status: the one set by the user, else Approved once it became a project/order, else Draft. */
export function estimateStatus(e) {
  if (e && STATUSES[e.status]) return e.status;
  return e && e.saleOrderId ? 'approved' : 'draft';
}
/** A fresh copy to edit: new id + number, today's date, back to Draft, no order / PO links. */
export function duplicateEstimate(e, { id, estNum, date }) {
  const copy = JSON.parse(JSON.stringify(e || {}));
  ['saleOrderId', 'projectId', 'orderedMaterials', 'status', 'statusAt', 'createdAt', 'createdBy', 'createdById', 'updatedAt', 'updatedBy', 'updatedById'].forEach(k => delete copy[k]);
  return { ...copy, id, estNum, date, status: 'draft', duplicatedFrom: e?.id || null };
}
