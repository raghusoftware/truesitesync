/**
 * estimateDocUI.js — Estimate editor additions:
 *   • Document style picker (Classic / Modern) — saved on the estimate;
 *   • Saved T&C: dropdown that fills the Terms box, "Save as preset", and a
 *     Manage window (edit / delete / set default). The default preset is put in
 *     automatically on a new estimate;
 *   • Preview — renders the real PDF (the preview IS the export).
 * Presets: state.termsPresets (synced like every other module key).
 */
import { state, saveAllData } from './state.js';
import { showToast, mobileSavePDF } from './utils.js';
import { estimateTotals } from './estimateCalc.js';
import { TEMPLATES, DEFAULT_TEMPLATE, upsertPreset, removePreset, defaultPreset, sortedPresets } from './estimateDoc.js?v=1.1.0';
import { renderEstimateDoc } from './estimatePdf.js?v=1.0.0';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LAST_TPL = 'tss_est_template';
let _tpl = DEFAULT_TEMPLATE;

function presets() {
  if (!Array.isArray(state.termsPresets)) {
    try { state.termsPresets = JSON.parse(localStorage.getItem('mes_terms_presets') || '[]'); } catch { state.termsPresets = []; }
  }
  return state.termsPresets;
}
function persist() {
  saveAllData();
  try { localStorage.setItem('mes_terms_presets', JSON.stringify(state.termsPresets || [])); } catch {}
}

/* ── one-time DOM additions inside #estimateEditor ── */
function ensureControls() {
  const ta = document.getElementById('estTerms');
  if (!ta || document.getElementById('estTermsPreset')) return;
  ta.insertAdjacentHTML('beforebegin', `
    <div class="ed-tc-bar">
      <select id="estTermsPreset" class="ed-tc-sel" onchange="window._estPickTerms(this.value)" aria-label="Saved terms & conditions"></select>
      <button type="button" class="ed-tc-btn" onclick="window._estSaveTerms()" title="Save these terms as a preset">Save as preset</button>
      <button type="button" class="ed-tc-btn ghost" onclick="window._estManageTerms()" title="Edit, delete or set the default preset">Manage</button>
    </div>`);
  ta.classList.add('ed-tc-text');
  ta.placeholder = 'Type terms one per line, or pick a saved set above…';
  ta.addEventListener('input', () => { ta.dataset.edited = '1'; });
  // Style picker + preview, just above the Save row.
  const save = document.querySelector('#estimateEditor button[onclick="saveEstimate()"]');
  const row = save && save.parentElement;
  if (row) {
    row.insertAdjacentHTML('beforebegin', `
      <div class="ed-doc">
        <div class="ed-doc-h"><b>Document style</b><span>Locked brand colours · applies to PDF</span></div>
        <div class="ed-tpls">
          <button type="button" class="ed-tpl" data-t="classic" onclick="window._estSetTemplate('classic')">
            <span class="ed-thumb classic"><i class="h"></i><i class="r"></i><i class="l"></i><i class="l"></i><i class="l s"></i></span>
            <span class="ed-tpl-t"><b>Classic</b><small>Clean letterhead, ruled table</small></span></button>
          <button type="button" class="ed-tpl" data-t="modern" onclick="window._estSetTemplate('modern')">
            <span class="ed-thumb modern"><i class="h"></i><i class="c"></i><i class="l"></i><i class="l"></i><i class="l s"></i></span>
            <span class="ed-tpl-t"><b>Modern</b><small>Colour header, cards, watermark</small></span></button>
        </div>
        <button type="button" class="ed-preview" onclick="window._estPreview()">👁 Preview PDF</button>
      </div>`);
  }
}

function fillPresetSelect(selectedId) {
  const sel = document.getElementById('estTermsPreset'); if (!sel) return;
  const list = sortedPresets(presets());
  sel.innerHTML = `<option value="">${list.length ? 'Saved T&C…' : 'No saved T&C yet'}</option>` +
    list.map(p => `<option value="${esc(p.id)}">${esc(p.title)}${p.isDefault ? '  ★ default' : ''}</option>`).join('');
  sel.value = list.some(p => p.id === selectedId) ? selectedId : '';
}
function paintTemplate() {
  document.querySelectorAll('#estimateEditor .ed-tpl').forEach(b => b.classList.toggle('on', b.dataset.t === _tpl));
}

/** Called each time the editor opens. est = the estimate being edited, or null for a new one. */
export function setupEstimateEditor(est) {
  ensureControls();
  let last = DEFAULT_TEMPLATE; try { last = localStorage.getItem(LAST_TPL) || DEFAULT_TEMPLATE; } catch {}
  _tpl = TEMPLATES[est?.template] ? est.template : (TEMPLATES[last] ? last : DEFAULT_TEMPLATE);
  paintTemplate();
  const ta = document.getElementById('estTerms');
  let pid = est?.termsPresetId || '';
  if (!est && ta && !ta.value.trim()) {                 // new estimate → default terms in automatically
    const d = defaultPreset(presets());
    if (d) { ta.value = d.body; pid = d.id; }
  }
  if (ta) delete ta.dataset.edited;
  fillPresetSelect(pid);
}
/** Extra fields saveEstimate() stores on the record. */
export function readEstimateDocFields() {
  return { template: _tpl, termsPresetId: document.getElementById('estTermsPreset')?.value || '' };
}

window._estSetTemplate = (t) => {
  if (!TEMPLATES[t]) return;
  _tpl = t; paintTemplate();
  try { localStorage.setItem(LAST_TPL, t); } catch {}
};
window._estPickTerms = (id) => {
  const ta = document.getElementById('estTerms'); if (!ta) return;
  if (!id) return;
  const p = presets().find(x => x.id === id); if (!p) return;
  const cur = ta.value.trim();
  if (cur && cur !== p.body.trim() && ta.dataset.edited && !confirm(`Replace the current terms with "${p.title}"?`)) { fillPresetSelect(''); return; }
  ta.value = p.body; delete ta.dataset.edited;
  ta.classList.remove('ed-flash'); void ta.offsetWidth; ta.classList.add('ed-flash');
};
window._estSaveTerms = () => {
  const ta = document.getElementById('estTerms');
  const body = (ta?.value || '').trim();
  if (!body) { showToast('Type the terms first, then save them as a preset', 'error'); return; }
  const curId = document.getElementById('estTermsPreset')?.value;
  const cur = presets().find(p => p.id === curId);
  const title = prompt('Name for this T&C preset (e.g. "Road Construction", "Standard Building Rules"):', cur ? cur.title : '');
  if (title == null || !title.trim()) return;
  const exists = presets().find(p => p.title.trim().toLowerCase() === title.trim().toLowerCase());
  if (exists && exists.id !== cur?.id && !confirm(`A preset called "${exists.title}" already exists. Overwrite it?`)) return;
  const { list, preset } = upsertPreset(presets(), { id: exists?.id, title, body, isDefault: presets().length ? undefined : true });
  state.termsPresets = list; persist();
  fillPresetSelect(preset.id); delete ta.dataset.edited;
  showToast(`Saved T&C preset "${preset.title}"`, 'success');
};

/* ── Manage presets (centred window; Back / backdrop / ✕ close it) ── */
window._estManageTerms = (editId) => {
  document.getElementById('termsPresetOverlay')?.remove();
  const list = sortedPresets(presets());
  const edit = editId === 'new' ? { id: '', title: '', body: '' } : list.find(p => p.id === editId);
  const ov = document.createElement('div');
  ov.id = 'termsPresetOverlay'; ov.className = 'rcp-ov';
  ov.innerHTML = `<div class="rcp-modal" role="dialog" aria-modal="true">
    <header class="rcp-head"><div class="rcp-head-txt"><h3>${edit ? (edit.id ? 'Edit preset' : 'New preset') : 'Saved T&C presets'}</h3><p>${edit ? 'One clause per line — numbering is added in the PDF.' : 'Pick one in any estimate to fill the terms instantly.'}</p></div>
      <button class="rcp-x" onclick="document.getElementById('termsPresetOverlay').__onBack()" aria-label="Close"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
    <div class="rcp-body">${edit ? `
      <label class="ed-f"><span>Title</span><input id="tpTitle" class="rcp-in" value="${esc(edit.title)}" placeholder="e.g. Road Construction"></label>
      <label class="ed-f"><span>Terms & conditions</span><textarea id="tpBody" class="ed-tp-body" placeholder="1. Rates valid for 30 days.&#10;2. GST extra as applicable.">${esc(edit.body)}</textarea></label>
      <label class="ed-chk"><input id="tpDefault" type="checkbox" ${edit.isDefault ? 'checked' : ''}> Use automatically on new estimates</label>`
      : (list.length ? list.map(p => `<div class="ed-tp">
          <div class="ed-tp-t"><b>${esc(p.title)}${p.isDefault ? ' <em>Default</em>' : ''}</b><small>${esc(p.body.split('\n').filter(Boolean).length)} clause(s) · ${esc(p.body.replace(/\s+/g, ' ').slice(0, 90))}${p.body.length > 90 ? '…' : ''}</small></div>
          <div class="ed-tp-a">
            <button onclick="window._estManageTerms('${esc(p.id)}')" aria-label="Edit">Edit</button>
            ${p.isDefault ? '' : `<button onclick="window._estPresetDefault('${esc(p.id)}')" aria-label="Make default">★</button>`}
            <button class="del" onclick="window._estPresetDelete('${esc(p.id)}')" aria-label="Delete">🗑</button>
          </div></div>`).join('') : '<p class="ed-empty">No presets yet. Type your terms in an estimate and tap <b>Save as preset</b>, or create one here.</p>')}
    </div>
    <footer class="rcp-foot">${edit
      ? `<button class="rcp-btn ghost" onclick="window._estManageTerms()">Back</button><button class="rcp-btn primary" onclick="window._estPresetSave('${esc(edit.id)}')">Save preset</button>`
      : `<button class="rcp-btn ghost" onclick="document.getElementById('termsPresetOverlay').__onBack()">Close</button><button class="rcp-btn primary" onclick="window._estManageTerms('new')">+ New preset</button>`}</footer>
  </div>`;
  ov.__onBack = () => { ov.remove(); fillPresetSelect(document.getElementById('estTermsPreset')?.value || ''); };
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.__onBack(); });
  document.body.appendChild(ov);
  if (edit) setTimeout(() => document.getElementById(edit.id ? 'tpBody' : 'tpTitle')?.focus(), 150);
};
window._estPresetSave = (id) => {
  const title = document.getElementById('tpTitle')?.value || '';
  const body = (document.getElementById('tpBody')?.value || '').trim();
  if (!title.trim() || !body) { showToast('Give the preset a title and some terms', 'error'); return; }
  try {
    const { list } = upsertPreset(presets(), { id: id || undefined, title, body, isDefault: !!document.getElementById('tpDefault')?.checked });
    state.termsPresets = list; persist();
  } catch (e) { showToast(e.message, 'error'); return; }
  window._estManageTerms();
  showToast('Preset saved', 'success');
};
window._estPresetDefault = (id) => {
  const p = presets().find(x => x.id === id); if (!p) return;
  state.termsPresets = upsertPreset(presets(), { ...p, isDefault: true }).list; persist(); window._estManageTerms();
};
window._estPresetDelete = (id) => {
  const p = presets().find(x => x.id === id); if (!p) return;
  if (!confirm(`Delete the preset "${p.title}"? Estimates that already use these terms keep them.`)) return;
  state.termsPresets = removePreset(presets(), id); persist(); window._estManageTerms();
};

/* ── Preview: the real PDF from what is on screen now ── */
function draftFromEditor() {
  const items = [];
  document.querySelectorAll('#estTableBody tr').forEach(tr => {
    const desc = tr.querySelector('.desc-input')?.value || '';
    const qty = parseFloat(tr.querySelector('.est-qty')?.value) || 0;
    const rate = parseFloat(tr.querySelector('.est-rate')?.value) || 0;
    if (desc && qty > 0) items.push({ code: tr.querySelector('.est-code')?.value || '', desc, qty, unit: tr.querySelector('.est-unit')?.value || '', rate, amount: qty * rate });
  });
  const discountType = document.getElementById('estDiscountType')?.value === 'amt' ? 'amt' : 'pct';
  const discountValue = parseFloat(document.getElementById('estDiscount')?.value) || 0;
  const t = estimateTotals(items, discountType, discountValue);
  const prev = state.currentEstimateId ? (state.estimates || []).find(e => e.id === state.currentEstimateId) : null;
  return { estNum: document.getElementById('estNum')?.value || 'DRAFT', clientId: document.getElementById('estClient')?.value || '', date: document.getElementById('estDate')?.value || '',
    items, discountType, discountValue, ...t, terms: document.getElementById('estTerms')?.value || '', template: _tpl, projectId: prev?.projectId || null };
}
window._estPreview = async () => {
  const d = draftFromEditor();
  if (!d.items.length) { showToast('Add at least one item to preview', 'error'); return; }
  return _showEstimatePreview(d);
};
/** Preview a saved estimate (tap on its row in the Estimates list). */
window._estPreviewById = (id) => {
  const e = (state.estimates || []).find(x => x.id === id);
  if (!e) { showToast('Estimate not found', 'error'); return; }
  return _showEstimatePreview(e);
};
async function _showEstimatePreview(d) {
  const _tpl = TEMPLATES[d.template] ? d.template : DEFAULT_TEMPLATE;
  showToast('Preparing preview…', 'info');
  let doc;
  try { doc = await renderEstimateDoc(d); } catch (e) { console.error(e); showToast('Preview failed: ' + (e.message || e), 'error'); return; }
  const native = !!(window.Capacitor?.isNativePlatform?.());
  // Phones can't show a PDF inside the page — open it in the PDF viewer instead.
  if (native || matchMedia('(max-width: 768px)').matches) { mobileSavePDF(doc, `${d.estNum}-preview.pdf`); return; }
  document.getElementById('estPreviewOverlay')?.remove();
  const url = doc.output('bloburl');
  const ov = document.createElement('div'); ov.id = 'estPreviewOverlay'; ov.className = 'rcp-ov';
  ov.innerHTML = `<div class="ed-pv"><header><b>Preview · ${esc(TEMPLATES[_tpl])}</b><span>This is the exact PDF your client receives.</span>
    <button onclick="document.getElementById('estPreviewOverlay').__onBack()" aria-label="Close">✕</button></header><iframe title="Estimate preview" src="${url}"></iframe></div>`;
  ov.__onBack = () => { ov.remove(); try { URL.revokeObjectURL(url); } catch {} };
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.__onBack(); });
  document.body.appendChild(ov);
}
