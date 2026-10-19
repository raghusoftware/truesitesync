/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Floating Unit Converter + Calculator
 * ───────────────────────────────────────────────────────────
 * A small draggable popup (opened from the Measurement screens) with two tabs:
 *  • Convert    — Length / Area / Volume / Weight, feet-inches aware, plus a
 *                 live "all units" list.
 *  • Calculator — typeable expression calculator with a keypad.
 * "Insert" puts the result into the measurement cell that was last focused.
 * Exposes window.openUnitConverter / closeUnitConverter / toggleUnitConverter.
 * ═══════════════════════════════════════════════════════════
 */
import {
  CONVERT_CATEGORIES, convert, parseValue, formatValue, evalExpression, formatNumber
} from './unitConvertCalc.js';
import { showToast } from './utils.js';

const POS_KEY = 'tss_unitconv_pos';
const PREF_KEY = 'tss_unitconv_pref';

let root = null;
let lastCell = null;          // last focused input in a measurement table
let lastResult = NaN;         // raw number shown as the current result
let pref = { tab: 'convert', cat: 'length', from: 'ftin', to: 'mm' };

function loadJSON(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ } }

// Remember the last measurement cell the user was typing in, so "Insert" can fill it.
document.addEventListener('focusin', (e) => {
  const t = e.target;
  if (t instanceof HTMLInputElement && !t.closest('#unitConvPop') &&
      t.closest('#entryTable, #groupedEntryContainer')) lastCell = t;
});

const CSS = `
#unitConvPop{position:fixed;z-index:10000;width:320px;max-width:calc(100vw - 16px);background:#fff;border:1px solid #cbd5e1;border-radius:14px;box-shadow:0 18px 40px rgba(15,23,42,.28);font-size:13px;color:#0f172a;display:flex;flex-direction:column;overflow:hidden}
#unitConvPop .uc-head{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#1e3a8a;color:#fff;cursor:move;user-select:none;touch-action:none}
#unitConvPop .uc-head b{flex:1;font-size:13px}
#unitConvPop .uc-x{background:rgba(255,255,255,.15);border:0;color:#fff;width:26px;height:26px;border-radius:7px;font-size:15px;cursor:pointer;line-height:1}
#unitConvPop .uc-x:hover{background:#ef4444}
#unitConvPop .uc-tabs{display:flex;border-bottom:1px solid #e2e8f0}
#unitConvPop .uc-tabs button{flex:1;padding:8px;border:0;background:#f8fafc;font-weight:700;color:#64748b;cursor:pointer}
#unitConvPop .uc-tabs button.on{background:#fff;color:#1e3a8a;box-shadow:inset 0 -2px #1e3a8a}
#unitConvPop .uc-body{padding:10px;max-height:min(70vh,520px);overflow:auto}
#unitConvPop .uc-cats{display:flex;gap:4px;margin-bottom:8px}
#unitConvPop .uc-cats button{flex:1;padding:5px 0;border:1px solid #cbd5e1;border-radius:7px;background:#fff;font-weight:600;font-size:12px;cursor:pointer}
#unitConvPop .uc-cats button.on{background:#1e3a8a;border-color:#1e3a8a;color:#fff}
#unitConvPop input,#unitConvPop select{width:100%;padding:7px 8px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;font-size:14px;outline:none;box-sizing:border-box}
#unitConvPop input:focus,#unitConvPop select:focus{border-color:#2563eb;background:#fff}
#unitConvPop .uc-row{display:flex;gap:6px;align-items:center;margin-bottom:6px}
#unitConvPop .uc-swap{flex:none;width:34px;height:34px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer;font-size:15px}
#unitConvPop .uc-res{display:flex;align-items:center;gap:6px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:8px 10px;margin:6px 0 8px}
#unitConvPop .uc-res span{flex:1;font-size:18px;font-weight:800;color:#1e3a8a;word-break:break-all}
#unitConvPop .uc-btn{border:0;border-radius:7px;padding:5px 8px;font-weight:700;font-size:11px;cursor:pointer;background:#1e3a8a;color:#fff}
#unitConvPop .uc-btn.alt{background:#e2e8f0;color:#0f172a}
#unitConvPop .uc-all{border-top:1px dashed #e2e8f0;padding-top:6px}
#unitConvPop .uc-all div{display:flex;justify-content:space-between;gap:8px;padding:3px 4px;border-radius:5px;cursor:pointer}
#unitConvPop .uc-all div:hover{background:#f1f5f9}
#unitConvPop .uc-all em{font-style:normal;color:#64748b}
#unitConvPop .uc-all b{text-align:right}
#unitConvPop .uc-hint{font-size:11px;color:#64748b;margin:2px 0 6px}
#unitConvPop .uc-keys{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:8px}
#unitConvPop .uc-keys button{padding:10px 0;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;font-size:15px;font-weight:700;cursor:pointer}
#unitConvPop .uc-keys button:active{background:#dbeafe}
#unitConvPop .uc-keys .op{background:#eef2ff;color:#1e3a8a}
#unitConvPop .uc-keys .eq{background:#1e3a8a;color:#fff}
#unitConvPop .uc-keys .clr{background:#fee2e2;color:#b91c1c}
#unitConvFab{position:fixed;right:18px;bottom:96px;z-index:9990;width:48px;height:48px;border-radius:50%;border:0;background:#1e3a8a;color:#fff;font-size:21px;box-shadow:0 8px 20px rgba(30,58,138,.4);cursor:pointer}
#unitConvFab:hover{background:#1d4ed8}
`;

function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const plain = (v) => Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : '';

function build() {
  if (!document.getElementById('unitConvCss')) {
    const st = document.createElement('style'); st.id = 'unitConvCss'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  root = el(`
    <div id="unitConvPop" role="dialog" aria-label="Unit converter and calculator">
      <div class="uc-head"><span>&#128208;</span><b>Converter &amp; Calculator</b><button class="uc-x" title="Close (Esc)" data-act="close">&#10005;</button></div>
      <div class="uc-tabs"><button data-tab="convert">Convert</button><button data-tab="calc">Calculator</button></div>
      <div class="uc-body"></div>
    </div>`);
  document.body.appendChild(root);

  root.addEventListener('click', onClick);
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeUnitConverter(); });
  makeDraggable(root, root.querySelector('.uc-head'));

  const pos = loadJSON(POS_KEY);
  if (pos) { root.style.left = pos.left + 'px'; root.style.top = pos.top + 'px'; }
  else { root.style.right = '18px'; root.style.top = '90px'; }
  keepInView();
}

function keepInView() {
  if (!root || !root.style.left) return;
  const r = root.getBoundingClientRect();
  const left = Math.min(Math.max(8, r.left), window.innerWidth - Math.min(r.width, window.innerWidth) - 8);
  const top = Math.min(Math.max(8, r.top), window.innerHeight - 48);
  root.style.left = Math.max(0, left) + 'px'; root.style.top = Math.max(0, top) + 'px';
}
window.addEventListener('resize', keepInView);

function makeDraggable(box, handle) {
  let sx, sy, ox, oy, dragging = false;
  handle.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = box.getBoundingClientRect();
    dragging = true; sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
    box.style.right = 'auto'; box.style.left = ox + 'px'; box.style.top = oy + 'px';
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const left = Math.min(Math.max(0, ox + e.clientX - sx), window.innerWidth - 60);
    const top = Math.min(Math.max(0, oy + e.clientY - sy), window.innerHeight - 40);
    box.style.left = left + 'px'; box.style.top = top + 'px';
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    saveJSON(POS_KEY, { left: parseFloat(box.style.left), top: parseFloat(box.style.top) });
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

function render() {
  root.querySelectorAll('.uc-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === pref.tab));
  const body = root.querySelector('.uc-body');
  body.innerHTML = pref.tab === 'convert' ? convertHtml() : calcHtml();
  if (pref.tab === 'convert') {
    const inp = body.querySelector('#ucVal');
    inp.addEventListener('input', updateConvert);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') insertResult(); });
    body.querySelector('#ucFrom').addEventListener('change', (e) => { pref.from = e.target.value; savePref(); updateConvert(); });
    body.querySelector('#ucTo').addEventListener('change', (e) => { pref.to = e.target.value; savePref(); updateConvert(); });
    updateConvert();
    inp.focus();
  } else {
    const inp = body.querySelector('#ucExpr');
    inp.addEventListener('input', updateCalc);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); calcEquals(); } });
    updateCalc();
    inp.focus();
  }
}

function unitOptions(sel) {
  return CONVERT_CATEGORIES[pref.cat].units
    .map(u => `<option value="${u.id}"${u.id === sel ? ' selected' : ''}>${esc(u.label)}</option>`).join('');
}

function convertHtml() {
  const cats = Object.entries(CONVERT_CATEGORIES)
    .map(([k, c]) => `<button data-cat="${k}" class="${k === pref.cat ? 'on' : ''}">${c.label}</button>`).join('');
  const prevVal = root.querySelector('#ucVal')?.value ?? '1';
  return `
    <div class="uc-cats">${cats}</div>
    <input id="ucVal" type="text" inputmode="decimal" autocomplete="off" value="${esc(prevVal)}" placeholder="Type a value, e.g. 5'6&quot; or 12.5*3">
    <div class="uc-hint">Maths allowed (e.g. 10*12+4). Feet-inches: 5'6&quot;, 5 6 or 5-6</div>
    <div class="uc-row"><select id="ucFrom">${unitOptions(pref.from)}</select>
      <button class="uc-swap" data-act="swap" title="Swap units">&#8646;</button>
      <select id="ucTo">${unitOptions(pref.to)}</select></div>
    <div class="uc-res"><span id="ucOut">—</span>
      <button class="uc-btn alt" data-act="copy" title="Copy result">Copy</button>
      <button class="uc-btn" data-act="insert" title="Put result into the measurement cell you last clicked">Insert</button></div>
    <div class="uc-all" id="ucAll"></div>`;
}

function unitById(id) { return CONVERT_CATEGORIES[pref.cat].units.find(u => u.id === id); }

function updateConvert() {
  const from = unitById(pref.from), to = unitById(pref.to);
  const v = parseValue(root.querySelector('#ucVal').value, from);
  lastResult = convert(v, pref.from, pref.to, pref.cat);
  const out = root.querySelector('#ucOut');
  out.textContent = Number.isFinite(lastResult) ? formatValue(lastResult, to) : '—';
  root.querySelector('#ucAll').innerHTML = Number.isFinite(v)
    ? CONVERT_CATEGORIES[pref.cat].units.filter(u => u.id !== pref.from).map(u => {
        const r = convert(v, pref.from, u.id, pref.cat);
        return `<div data-pick="${u.id}" title="Use this unit"><em>${esc(u.label)}</em><b>${esc(formatValue(r, u))}</b></div>`;
      }).join('')
    : '';
}

function calcHtml() {
  const prev = root.querySelector('#ucExpr')?.value ?? '';
  const keys = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '⌫', '='];
  const cls = (k) => k === '=' ? 'eq' : k === 'C' ? 'clr' : '÷×−+()'.includes(k) ? 'op' : '';
  return `
    <input id="ucExpr" type="text" inputmode="decimal" autocomplete="off" value="${esc(prev)}" placeholder="Type e.g. 12.5*3.2+4" style="font-size:17px;text-align:right">
    <div class="uc-res"><span id="ucCalcOut">0</span>
      <button class="uc-btn alt" data-act="copy">Copy</button>
      <button class="uc-btn" data-act="insert" title="Put result into the measurement cell you last clicked">Insert</button></div>
    <div class="uc-keys">${keys.map(k => `<button data-key="${k}" class="${cls(k)}">${k}</button>`).join('')}</div>`;
}

function updateCalc() {
  const v = evalExpression(root.querySelector('#ucExpr').value.replace(/−/g, '-'));
  lastResult = v;
  root.querySelector('#ucCalcOut').textContent = Number.isFinite(v) ? formatNumber(v) : (root.querySelector('#ucExpr').value ? '…' : '0');
}

function calcEquals() {
  const inp = root.querySelector('#ucExpr');
  if (Number.isFinite(lastResult)) inp.value = plain(lastResult);
  updateCalc();
}

function calcKey(k) {
  const inp = root.querySelector('#ucExpr');
  if (k === 'C') inp.value = '';
  else if (k === '⌫') inp.value = inp.value.slice(0, -1);
  else if (k === '=') return calcEquals();
  else inp.value += ({ '×': '*', '÷': '/', '−': '-' }[k] || k);
  updateCalc();
  inp.focus();
}

function insertResult() {
  if (!Number.isFinite(lastResult)) return toast('Nothing to insert yet');
  if (!lastCell || !document.body.contains(lastCell)) return toast('Click a measurement cell first, then press Insert');
  lastCell.value = plain(lastResult);
  lastCell.dispatchEvent(new Event('input', { bubbles: true }));
  lastCell.dispatchEvent(new Event('change', { bubbles: true }));
  toast('Inserted ' + plain(lastResult));
}

function copyResult() {
  if (!Number.isFinite(lastResult)) return;
  const txt = pref.tab === 'convert' ? root.querySelector('#ucOut').textContent.replace(/,/g, '') : plain(lastResult);
  const ok = () => toast('Copied ' + txt);
  if (navigator.clipboard) navigator.clipboard.writeText(txt).then(ok, () => toast('Copy failed'));
}

function toast(msg) { showToast(msg); }

function savePref() { saveJSON(PREF_KEY, pref); }

function onClick(e) {
  const b = e.target.closest('button, [data-pick]');
  if (!b) return;
  if (b.dataset.act === 'close') return closeUnitConverter();
  if (b.dataset.tab) { pref.tab = b.dataset.tab; savePref(); return render(); }
  if (b.dataset.cat) {
    pref.cat = b.dataset.cat;
    const u = CONVERT_CATEGORIES[pref.cat].units;
    pref.from = u[0].id; pref.to = (u[2] || u[1]).id;
    if (pref.cat === 'length') { pref.from = 'ftin'; pref.to = 'mm'; }
    if (pref.cat === 'area') { pref.from = 'sqm'; pref.to = 'sqft'; }
    if (pref.cat === 'volume') { pref.from = 'cum'; pref.to = 'cft'; }
    if (pref.cat === 'weight') { pref.from = 'kg'; pref.to = 'tonne'; }
    savePref(); return render();
  }
  if (b.dataset.pick) { pref.to = b.dataset.pick; root.querySelector('#ucTo').value = pref.to; savePref(); return updateConvert(); }
  if (b.dataset.key) return calcKey(b.dataset.key);
  if (b.dataset.act === 'swap') {
    const val = root.querySelector('#ucVal');
    if (Number.isFinite(lastResult)) val.value = plain(lastResult);
    [pref.from, pref.to] = [pref.to, pref.from];
    root.querySelector('#ucFrom').value = pref.from; root.querySelector('#ucTo').value = pref.to;
    savePref(); return updateConvert();
  }
  if (b.dataset.act === 'copy') return copyResult();
  if (b.dataset.act === 'insert') return insertResult();
}

export function openUnitConverter() {
  const saved = loadJSON(PREF_KEY);
  if (saved && CONVERT_CATEGORIES[saved.cat]) pref = { ...pref, ...saved };
  if (!root) build();
  root.style.display = 'flex';
  render();
}

export function closeUnitConverter() { if (root) root.style.display = 'none'; }

export function toggleUnitConverter() {
  if (root && root.style.display !== 'none') closeUnitConverter(); else openUnitConverter();
}

/** Floating round button shown on the Measurement screens. */
function addFab() {
  const host = document.getElementById('entrySheet');
  if (!host || document.getElementById('unitConvFab')) return;
  const fab = el('<button id="unitConvFab" type="button" title="Unit Converter &amp; Calculator (Alt+U)">&#129518;</button>');
  fab.addEventListener('click', toggleUnitConverter);
  host.appendChild(fab);   // lives inside the view, so it hides with it
}

// Alt+U opens/closes from anywhere.
document.addEventListener('keydown', (e) => {
  if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); toggleUnitConverter(); }
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addFab); else addFab();

window.openUnitConverter = openUnitConverter;
window.closeUnitConverter = closeUnitConverter;
window.toggleUnitConverter = toggleUnitConverter;
