/**
 * calcTools.js — "Engineer Tools": site calculators for construction cost,
 * concrete, steel, brickwork, plaster, flooring, paint and excavation, with
 * material costing from editable rates. All maths lives in the pure, tested
 * constructionCalc.js; this file is the screen (tile grid → tool form with
 * live results → copy / share).
 */
import * as C from './constructionCalc.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cur = () => (typeof window.getCurrencySymbol === 'function' ? window.getCurrencySymbol() : '₹');
const inr = (n) => cur() + Math.round(Number(n) || 0).toLocaleString('en-IN');
const fmt = (n) => (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

let _unit = store.get('tss_calc_unit', 'm');     // 'm' | 'ft' for lengths & areas
let _tool = null;                                // open tool id
let _mode = {};                                  // tool id → mode id
const _vals = {};                                // tool id → { field: value }
const rates = () => ({ ...C.DEFAULT_RATES, ...store.get('tss_calc_rates', {}) });

const lenU = () => (_unit === 'ft' ? 'ft' : 'm');
const areaU = () => (_unit === 'ft' ? 'sqft' : 'm²');
const area = (v) => (parseFloat(v) || 0) / (_unit === 'ft' ? C.SQM_TO_SQFT : 1);  // → m²
const len = (v) => C.toM(v, _unit);                                                // → m
const n = (v) => parseFloat(v) || 0;

const DIAS = [6, 8, 10, 12, 16, 20, 25, 32].map(d => [d, d + ' mm']);
const RATIOS = (list) => list.map(r => [r, '1 : ' + r]);
const BRICKS = { modular: [190, 90, 90, 'Modular 190×90×90'], traditional: [230, 110, 75, 'Traditional 230×110×75'], flyash: [230, 100, 75, 'Fly ash 230×100×75'], aac: [600, 200, 200, 'AAC block 600×200×200'] };
const TILES = { '300x300': [300, 300], '600x600': [600, 600], '600x1200': [600, 1200], '800x800': [800, 800], '400x400': [400, 400], '1200x1800': [1200, 1800] };

/* Field types: len (m/ft) · area (m²/sqft) · num (with suffix) · sel · chk */
const TOOLS = {
  cost: {
    icon: '🏠', title: 'Construction Cost', desc: 'Budget, cost split & materials for a building',
    fields: [
      { k: 'area', l: 'Built-up area per floor', t: 'area', d: _unit === 'ft' ? 1000 : 93 },
      { k: 'floors', l: 'Floors', t: 'num', d: 1 },
      { k: 'quality', l: 'Quality', t: 'sel', d: 'Standard', o: Object.keys(C.QUALITY_RATE).map(q => [q, `${q} (${cur()}${C.QUALITY_RATE[q]}/sqft)`]) },
      { k: 'rate', l: `Your rate (${cur()}/sqft, optional)`, t: 'num', d: '' },
    ],
    calc: (v) => C.buildingEstimate({ area: area(v.area) * C.SQM_TO_SQFT, unit: 'sqft', floors: n(v.floors) || 1, quality: v.quality, rate: n(v.rate) }),
  },
  concrete: {
    icon: '🏗️', title: 'Concrete / RCC', desc: 'Cement, sand, aggregate & water for any grade',
    modes: [
      { id: 'size', label: 'By size', fields: [{ k: 'l', l: 'Length', t: 'len', d: 3 }, { k: 'w', l: 'Width', t: 'len', d: 3 }, { k: 'd', l: 'Depth / thickness (mm)', t: 'num', d: 150 }] },
      { id: 'vol', label: 'By volume', fields: [{ k: 'vol', l: 'Volume (m³)', t: 'num', d: 1 }] },
    ],
    fields: [
      { k: 'grade', l: 'Grade', t: 'sel', d: 'M20', o: Object.keys(C.CONCRETE_GRADES).map(g => [g, `${g} (${C.CONCRETE_GRADES[g].join(':')})`]) },
      { k: 'wastage', l: 'Wastage', t: 'num', suf: '%', d: 2 },
    ],
    calc: (v, mode) => {
      const vol = mode === 'vol' ? n(v.vol) : len(v.l) * len(v.w) * n(v.d) / 1000;
      const r = C.concrete({ volume: vol, grade: v.grade, wastage: n(v.wastage) });
      return { ...r, stats: [['Volume', fmt(vol) + ' m³'], ['Mix', r.mix], ['Dry volume', fmt(r.dry) + ' m³']] };
    },
  },
  steel: {
    icon: '🔩', title: 'Steel Quantity', desc: 'Bar weight, steel from concrete, slab mesh',
    modes: [
      { id: 'bars', label: 'Bar weight', fields: [
        { k: 'dia', l: 'Bar diameter', t: 'sel', d: 12, o: DIAS }, { k: 'blen', l: 'Length of one bar', t: 'len', d: 12 },
        { k: 'count', l: 'Number of bars', t: 'num', d: 10 }, { k: 'waste', l: 'Laps & wastage', t: 'num', suf: '%', d: 3 }] },
      { id: 'rcc', label: 'From concrete', fields: [
        { k: 'vol', l: 'Concrete volume (m³)', t: 'num', d: 10 },
        { k: 'el', l: 'Element', t: 'sel', d: 'Slab', o: Object.keys(C.STEEL_PERCENT).map(e => [e, `${e} (~${C.STEEL_PERCENT[e]}%)`]) },
        { k: 'pct', l: 'Steel % (optional)', t: 'num', d: '' }] },
      { id: 'mesh', label: 'Slab mesh', fields: [
        { k: 'lx', l: 'Slab length', t: 'len', d: 5 }, { k: 'ly', l: 'Slab width', t: 'len', d: 4 }, { k: 'cover', l: 'Cover (mm)', t: 'num', d: 25 },
        { k: 'md', l: 'Main bar', t: 'sel', d: 10, o: DIAS }, { k: 'ms', l: 'Main spacing (mm c/c)', t: 'num', d: 150 },
        { k: 'dd', l: 'Distribution bar', t: 'sel', d: 8, o: DIAS }, { k: 'ds', l: 'Distribution spacing (mm c/c)', t: 'num', d: 200 }] },
    ],
    calc: (v, mode) => {
      if (mode === 'rcc') { const r = C.steelFromConcrete({ volume: n(v.vol), element: v.el, percent: v.pct }); return { ...r, stats: [['Steel ratio', r.percent + '%'], ['Density', '7850 kg/m³']] }; }
      if (mode === 'mesh') {
        const r = C.slabMesh({ lx: len(v.lx), ly: len(v.ly), cover: n(v.cover) / 1000, mainDia: n(v.md), mainSpacing: n(v.ms), distDia: n(v.dd), distSpacing: n(v.ds) });
        return { ...r, stats: [['Main bars', r.mainBars + ' nos'], ['Distribution', r.distBars + ' nos']] };
      }
      const r = C.steelBars({ dia: n(v.dia), length: len(v.blen), count: n(v.count), wastage: n(v.waste) });
      return { ...r, stats: [['Weight per metre', fmt(r.kgPerM) + ' kg/m'], ['Total length', fmt(r.totalLength) + ' m'], ['Formula', 'D² / 162']] };
    },
  },
  brick: {
    icon: '🧱', title: 'Brick Work', desc: 'Bricks, cement & sand for a wall',
    fields: [
      { k: 'l', l: 'Wall length', t: 'len', d: 10 }, { k: 'h', l: 'Wall height', t: 'len', d: 3 },
      { k: 't', l: 'Wall thickness', t: 'sel', d: 230, o: [[115, '115 mm (half brick)'], [230, '230 mm (full brick)'], [150, '150 mm block'], [200, '200 mm block']] },
      { k: 'open', l: 'Doors / windows area', t: 'area', d: 0 },
      { k: 'brick', l: 'Brick / block', t: 'sel', d: 'traditional', o: Object.entries(BRICKS).map(([k, b]) => [k, b[3]]) },
      { k: 'ratio', l: 'Mortar', t: 'sel', d: 6, o: RATIOS([4, 5, 6]) },
      { k: 'waste', l: 'Brick wastage', t: 'num', suf: '%', d: 5 },
    ],
    calc: (v) => {
      const b = BRICKS[v.brick] || BRICKS.traditional;
      const r = C.brickwork({ length: len(v.l), height: len(v.h), thickness: n(v.t) / 1000, openings: area(v.open), brickL: b[0], brickW: b[1], brickH: b[2], ratio: [1, n(v.ratio) || 6], wastage: n(v.waste) });
      return { ...r, stats: [['Wall volume', fmt(r.volume) + ' m³'], ['Bricks per m³', r.perM3], ['Wet mortar', fmt(r.mortarWet) + ' m³']] };
    },
  },
  plaster: {
    icon: '🪣', title: 'Plaster', desc: 'Cement & sand for wall or ceiling plaster',
    modes: [
      { id: 'area', label: 'By area', fields: [{ k: 'a', l: 'Plaster area', t: 'area', d: _unit === 'ft' ? 1000 : 100 }] },
      { id: 'wall', label: 'By wall', fields: [{ k: 'l', l: 'Wall length', t: 'len', d: 10 }, { k: 'h', l: 'Wall height', t: 'len', d: 3 }, { k: 'sides', l: 'Sides', t: 'sel', d: 2, o: [[1, 'One side'], [2, 'Both sides']] }, { k: 'open', l: 'Openings area', t: 'area', d: 0 }] },
    ],
    fields: [
      { k: 'th', l: 'Thickness', t: 'sel', d: 12, o: [[6, '6 mm (ceiling)'], [12, '12 mm (internal)'], [15, '15 mm'], [20, '20 mm (external)']] },
      { k: 'ratio', l: 'Mix', t: 'sel', d: 6, o: RATIOS([3, 4, 5, 6]) },
    ],
    calc: (v, mode) => {
      const a = mode === 'wall' ? Math.max(0, len(v.l) * len(v.h) * (n(v.sides) || 1) - area(v.open)) : area(v.a);
      const r = C.plaster({ area: a, thickness: n(v.th), ratio: [1, n(v.ratio) || 6] });
      return { ...r, stats: [['Area', fmt(a) + ' m² · ' + fmt(a * C.SQM_TO_SQFT) + ' sqft'], ['Wet volume', fmt(r.wet) + ' m³'], ['Dry volume', fmt(r.dry) + ' m³']] };
    },
  },
  floor: {
    icon: '🟫', title: 'Flooring & Tiles', desc: 'Tiles, boxes, bedding mortar or adhesive',
    modes: [
      { id: 'room', label: 'By room', fields: [{ k: 'l', l: 'Room length', t: 'len', d: 4 }, { k: 'w', l: 'Room width', t: 'len', d: 3.5 }] },
      { id: 'area', label: 'By area', fields: [{ k: 'a', l: 'Floor area', t: 'area', d: _unit === 'ft' ? 200 : 20 }] },
    ],
    fields: [
      { k: 'tile', l: 'Tile size (mm)', t: 'sel', d: '600x600', o: Object.keys(TILES).map(t => [t, t.replace('x', ' × ')]) },
      { k: 'box', l: 'Tiles per box', t: 'num', d: 4 },
      { k: 'bed', l: 'Fixing', t: 'sel', d: 'mortar', o: [['mortar', 'Cement-sand bed (40 mm, 1:6)'], ['adhesive', 'Tile adhesive']] },
      { k: 'waste', l: 'Wastage (cutting)', t: 'num', suf: '%', d: 5 },
    ],
    calc: (v, mode) => {
      const a = mode === 'area' ? area(v.a) : len(v.l) * len(v.w);
      const [tl, tw] = TILES[v.tile] || TILES['600x600'];
      return C.flooring({ area: a, tileL: tl, tileW: tw, perBox: n(v.box), bedding: v.bed, wastage: n(v.waste) });
    },
    stats: (r) => [['Area', fmt(r.area) + ' m² · ' + fmt(r.areaSqft) + ' sqft']],
  },
  paint: {
    icon: '🎨', title: 'Paint', desc: 'Paint, primer & putty for walls',
    fields: [
      { k: 'a', l: 'Paint area', t: 'area', d: _unit === 'ft' ? 1000 : 93 },
      { k: 'coats', l: 'Coats', t: 'num', d: 2 },
      { k: 'cov', l: 'Coverage per coat (m² / litre)', t: 'num', d: 9.3 },
      { k: 'primer', l: 'Primer coat', t: 'chk', d: true },
      { k: 'putty', l: 'Wall putty', t: 'chk', d: false },
    ],
    calc: (v) => C.paint({ area: area(v.a), coats: n(v.coats), coverage: n(v.cov), primer: !!v.primer, putty: !!v.putty }),
    stats: (r) => [['Area', fmt(r.area) + ' m² · ' + fmt(r.areaSqft) + ' sqft']],
  },
  dig: {
    icon: '⛏️', title: 'Excavation', desc: 'Earthwork volume, loose soil & truck trips',
    fields: [
      { k: 'l', l: 'Length', t: 'len', d: 10 }, { k: 'w', l: 'Width', t: 'len', d: 2 }, { k: 'd', l: 'Depth', t: 'len', d: 1.5 },
      { k: 'swell', l: 'Swell factor', t: 'num', suf: '%', d: 25 }, { k: 'truck', l: 'Truck capacity (m³)', t: 'num', d: 6 },
    ],
    calc: (v) => C.excavation({ length: len(v.l), width: len(v.w), depth: len(v.d), swell: n(v.swell), truckCum: n(v.truck) }),
  },
};

const TILE_ORDER = ['cost', 'concrete', 'steel', 'brick', 'plaster', 'floor', 'paint', 'dig'];

function fieldsOf(id) {
  const t = TOOLS[id];
  const m = t.modes ? (t.modes.find(x => x.id === _mode[id]) || t.modes[0]) : null;
  return [...(m ? m.fields : []), ...(t.fields || [])];
}
function values(id) {
  const v = (_vals[id] = _vals[id] || {});
  fieldsOf(id).forEach(f => { if (!(f.k in v)) v[f.k] = f.d; });
  return v;
}

function fieldHTML(id, f, v) {
  const val = v[f.k];
  const on = `window._calcSet('${id}','${f.k}',this)`;
  if (f.t === 'sel') return `<label class="ct-f ct-wide"><span>${esc(f.l)}</span><select onchange="${on}">${f.o.map(([o, l]) => `<option value="${esc(o)}" ${String(o) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  if (f.t === 'chk') return `<label class="ct-f ct-chk"><input type="checkbox" ${val ? 'checked' : ''} onchange="${on}"><span>${esc(f.l)}</span></label>`;
  const suf = f.t === 'len' ? lenU() : f.t === 'area' ? areaU() : (f.suf || '');
  return `<label class="ct-f"><span>${esc(f.l)}</span><div class="ct-in"><input type="number" inputmode="decimal" step="any" min="0" value="${esc(val)}" oninput="${on}">${suf ? `<i>${esc(suf)}</i>` : ''}</div></label>`;
}

function compute(id) {
  const t = TOOLS[id];
  const res = t.calc(values(id), _mode[id] || (t.modes && t.modes[0].id));
  if (t.stats) res.stats = t.stats(res);
  return res;
}

function resultHTML(id) {
  let res;
  try { res = compute(id); } catch (e) { console.warn(e); return '<div class="ct-res"><p class="ct-note">Check the values above.</p></div>'; }
  // whole-building rows are thumb-rule quantities (tiles in sqft), so they aren't priced
  const priced = id === 'cost' ? { rows: res.rows, total: 0 } : C.priceRows(res.rows, rates());
  const rows = priced.rows.map(r => `<div class="ct-row"><div><b>${esc(r.label)}</b>${r.alt ? `<small>${esc(r.alt)}</small>` : ''}</div>
    <div class="ct-q"><b>${fmt(r.qty)}</b> <span>${esc(r.unit)}</span>${r.cost ? `<small>${inr(r.cost)}</small>` : ''}</div></div>`).join('');
  let head = '';
  if (id === 'cost') {
    head = `<div class="ct-big"><small>Estimated construction cost</small><b>${inr(res.total)}</b><span>${fmt(res.sqft)} sqft × ${cur()}${fmt(res.rate)}/sqft</span></div>
      <div class="ct-sec">Cost split</div>${res.breakdown.map(x => `<div class="ct-row"><div><b>${esc(x.label)}</b><div class="ct-bar"><i style="width:${x.pct * 3}%"></i></div></div><div class="ct-q"><b>${inr(x.amount)}</b><small>${x.pct}%</small></div></div>`).join('')}
      <div class="ct-sec">Materials needed</div>`;
  } else if (res.stats) {
    head = `<div class="ct-stats">${res.stats.map(([l, val]) => `<div><small>${esc(l)}</small><b>${esc(val)}</b></div>`).join('')}</div><div class="ct-sec">Materials needed</div>`;
  } else head = '<div class="ct-sec">Materials needed</div>';
  const totalRow = id !== 'cost' && priced.total ? `<div class="ct-total"><span>Approx. material cost</span><b>${inr(priced.total)}</b></div>` : '';
  return `<div class="ct-res">${head}${rows}${totalRow}
    <p class="ct-note">${id === 'cost' ? 'Thumb-rule estimate for planning; actual cost depends on design, location and finishes.' : 'Quantities include the wastage shown. Costs use your material rates.'}
      <button type="button" class="ts-link" onclick="window._calcOpen('rates')">Edit rates</button></p></div>`;
}

function renderTool(root, id) {
  const t = TOOLS[id];
  const v = values(id);
  const modeId = _mode[id] || (t.modes && t.modes[0].id);
  const usesLen = fieldsOf(id).some(f => f.t === 'len' || f.t === 'area');
  root.innerHTML = `<div class="ts-page ct">
    <div class="ct-card">
      <div class="ct-hd"><span class="ct-ic" data-keep-emoji>${t.icon}</span><div><b>${esc(t.title)}</b><small>${esc(t.desc)}</small></div></div>
      ${t.modes ? `<div class="ts-chips" style="padding-top:4px">${t.modes.map(m => `<button type="button" class="ts-chip ${m.id === modeId ? 'on' : ''}" onclick="window._calcMode('${id}','${m.id}')">${esc(m.label)}</button>`).join('')}</div>` : ''}
      ${usesLen ? `<div class="ct-units"><span>Units</span><button type="button" class="${_unit === 'm' ? 'on' : ''}" onclick="window._calcUnit('m')">Metre</button><button type="button" class="${_unit === 'ft' ? 'on' : ''}" onclick="window._calcUnit('ft')">Feet</button></div>` : ''}
      <div class="ct-grid">${fieldsOf(id).map(f => fieldHTML(id, f, v)).join('')}</div>
    </div>
    <div id="ctResult">${resultHTML(id)}</div>
    <div class="ct-actions">
      <button type="button" class="ts-btn ghost" onclick="window._calcReset('${id}')">Reset</button>
      <button type="button" class="ts-btn ghost" onclick="window._calcShare('${id}', true)">Copy</button>
      <button type="button" class="ts-btn" onclick="window._calcShare('${id}')">Share</button>
    </div>
  </div>`;
}

function renderRates(root) {
  const r = rates();
  const L = { cement: 'Cement (per bag)', sand: 'Sand (per cft)', aggregate: 'Aggregate (per cft)', steel: 'Steel (per kg)', bricks: 'Brick (each)', paint: 'Paint (per litre)', primer: 'Primer (per litre)', tiles: 'Tile (each)', adhesive: 'Tile adhesive (per bag)', putty: 'Putty (per kg)' };
  root.innerHTML = `<div class="ts-page ct"><div class="ct-card">
    <div class="ct-hd"><span class="ct-ic" data-keep-emoji>💲</span><div><b>Material Rates</b><small>Used to price every calculator. Saved on this device.</small></div></div>
    <div class="ct-grid">${Object.keys(C.DEFAULT_RATES).map(k => `<label class="ct-f"><span>${esc(L[k] || k)}</span><div class="ct-in"><input type="number" inputmode="decimal" min="0" step="any" value="${esc(r[k])}" oninput="window._calcRate('${k}',this.value)"><i>${esc(cur())}</i></div></label>`).join('')}</div>
    <div class="ct-actions" style="margin-top:14px"><button type="button" class="ts-btn ghost" onclick="window._calcRatesReset()">Reset to defaults</button></div>
  </div></div>`;
}

export function renderCalcTools() {
  const root = document.getElementById('calcView');
  if (!root) return;
  if (_tool === 'rates') return renderRates(root);
  if (_tool && TOOLS[_tool]) return renderTool(root, _tool);
  root.innerHTML = `<div class="ts-page">
    <div class="ct-intro"><b>Engineer Tools</b><small>Quick site calculations — material quantities and cost in seconds.</small></div>
    <div class="ts-tiles">${TILE_ORDER.map(id => `<div class="ts-tile" role="button" tabindex="0" onclick="window._calcOpen('${id}')" onkeydown="if(event.key==='Enter')this.click()">
      <span class="ts-emo" data-keep-emoji>${TOOLS[id].icon}</span><span class="ts-lbl">${esc(TOOLS[id].title)}</span></div>`).join('')}
      <div class="ts-tile" role="button" tabindex="0" onclick="window.openUnitConverter&&window.openUnitConverter()"><span class="ts-emo" data-keep-emoji>📏</span><span class="ts-lbl">Unit Converter</span></div>
      <div class="ts-tile" role="button" tabindex="0" onclick="window._calcOpen('rates')"><span class="ts-emo" data-keep-emoji>💲</span><span class="ts-lbl">Material Rates</span></div>
    </div></div>`;
}

function shareText(id) {
  const t = TOOLS[id], res = compute(id), priced = id === 'cost' ? { rows: res.rows, total: 0 } : C.priceRows(res.rows, rates());
  const v = values(id);
  const inputs = fieldsOf(id).filter(f => f.t !== 'chk' || v[f.k]).map(f => {
    const val = f.t === 'sel' ? ((f.o.find(([o]) => String(o) === String(v[f.k])) || [])[1] || v[f.k]) : v[f.k];
    const suf = f.t === 'len' ? lenU() : f.t === 'area' ? areaU() : (f.suf || '');
    return f.t === 'chk' ? `• ${f.l}` : `• ${f.l}: ${val}${suf ? ' ' + suf : ''}`;
  }).join('\n');
  const lines = priced.rows.map(r => `• ${r.label}: ${fmt(r.qty)} ${r.unit}${r.cost ? ` (${inr(r.cost)})` : ''}`).join('\n');
  let out = `*${t.title}* — True Site Sync\n${inputs}\n\n*Materials*\n${lines}`;
  if (id === 'cost') out += `\n\n*Estimated cost: ${inr(res.total)}*`;
  else if (priced.total) out += `\n\n*Approx. material cost: ${inr(priced.total)}*`;
  return out;
}

if (typeof window !== 'undefined') {
  window.renderCalcTools = renderCalcTools;
  window._calcOpen = (id) => { _tool = id; renderCalcTools(); window.shellSectionChanged?.(); document.querySelector('main')?.scrollTo?.(0, 0); };
  window._calcIsOpen = () => !!_tool;
  window._calcClose = () => { _tool = null; renderCalcTools(); window.shellSectionChanged?.(); };
  window._calcTitle = () => (_tool === 'rates' ? 'Material Rates' : _tool && TOOLS[_tool] ? TOOLS[_tool].title : null);
  window._calcMode = (id, m) => { _mode[id] = m; renderCalcTools(); };
  window._calcUnit = (u) => { _unit = u; store.set('tss_calc_unit', u); renderCalcTools(); };
  window._calcSet = (id, k, el) => {
    values(id)[k] = el.type === 'checkbox' ? el.checked : el.value;
    const box = document.getElementById('ctResult');
    if (box) box.innerHTML = resultHTML(id);   // live, without losing input focus
  };
  window._calcReset = (id) => { delete _vals[id]; renderCalcTools(); };
  window._calcRate = (k, val) => { const r = store.get('tss_calc_rates', {}); r[k] = parseFloat(val) || 0; store.set('tss_calc_rates', r); };
  window._calcRatesReset = () => { store.set('tss_calc_rates', {}); renderCalcTools(); window.showToast?.('Rates reset', 'info'); };
  window._calcShare = async (id, copyOnly) => {
    const text = shareText(id);
    if (!copyOnly && navigator.share) { try { await navigator.share({ title: TOOLS[id].title, text }); return; } catch {} }
    if (!copyOnly) { window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank'); return; }
    try { await navigator.clipboard.writeText(text); window.showToast?.('Copied', 'success'); } catch { window.showToast?.('Could not copy', 'error'); }
  };
}
