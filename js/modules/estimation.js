/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Estimation Module (rate-analysis based)
 * ───────────────────────────────────────────────────────────
 * Professional estimating: Project Information → BOQ → per-item
 * Rate Analysis across cost heads (Material, Labour, Equipment,
 * Subcontract, Transport, Fuel, Consumables, Temporary Works,
 * Quality, Safety) → Overhead/Contingency/Profit → auto Cost
 * Summary & Budget Summary. Stored in state.estimations, synced.
 *
 * Rate analysis is a PER-UNIT build-up: each line's amount =
 * qtyPerUnit × rate × (1 + wastage%). The heads sum to the base
 * cost/unit; overhead, contingency and profit % are layered on to
 * give the final rate/unit. BOQ amount = final rate/unit × BOQ qty.
 * ═══════════════════════════════════════════════════════════
 */
import { state, saveAllData } from './state.js';
import { showToast, getCurrencySymbol } from './utils.js';

const _uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const _n = (v) => { const x = parseFloat(v); return isNaN(x) ? 0 : x; };
const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _cur = () => { try { return getCurrencySymbol(); } catch { return '₹'; } };
const _money = (n) => _cur() + _n(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

// Direct-cost heads (each is a per-unit line-item list on the BOQ item's `ra`).
const HEADS = [
  { key: 'material', label: 'Material', icon: '🧱', unit: true, wastage: true, master: 'itemsMaster' },
  { key: 'labour', label: 'Labour', icon: '👷', master: 'labourMaster' },
  { key: 'equipment', label: 'Equipment', icon: '🚜', master: 'equipmentList' },
  { key: 'subcontract', label: 'Subcontract', icon: '🤝' },
  { key: 'transport', label: 'Transport', icon: '🚚' },
  { key: 'fuel', label: 'Fuel & Utilities', icon: '⛽' },
  { key: 'consumables', label: 'Consumables', icon: '🔩' },
  { key: 'temporary', label: 'Temporary Works', icon: '🏗️' },
  { key: 'quality', label: 'Quality Control', icon: '🔬' },
  { key: 'safety', label: 'Safety', icon: '🦺' }
];

function _ensureArr() { if (!Array.isArray(state.estimations)) state.estimations = []; }
function _blankRA() {
  const ra = { overheadPct: 0, contingencyPct: 0, profitPct: 0, notes: '' };
  HEADS.forEach(h => ra[h.key] = []);
  return ra;
}
function _blankBOQ() { return { id: _uid('boq_'), code: '', desc: '', unit: '', qty: 0, rate: 0, amount: 0, ra: _blankRA() }; }
function _blankEstimate() {
  const seq = (state.estimations || []).length + 1;
  const cs = state.currencySettings || {};
  return {
    id: _uid('est_'), estNo: 'EST-' + String(seq).padStart(4, '0'), version: 1,
    projectName: '', clientId: '', location: '', tenderNo: '',
    currency: cs.code || 'INR', taxStructure: 'GST 18%',
    profitPct: 12, contingencyPct: 3, overheadPct: 8, escalationPct: 0,
    remarks: '', createdAt: new Date().toISOString(),
    boqItems: []
  };
}

// ── Calculations ──
function headSubtotal(rows) { return (rows || []).reduce((s, r) => s + _n(r.qty) * _n(r.rate) * (1 + _n(r.w) / 100), 0); }
function itemBaseRate(item) { return HEADS.reduce((s, h) => s + headSubtotal(item.ra?.[h.key]), 0); }
function itemFinalRate(item) {
  const base = itemBaseRate(item);
  const oh = base * _n(item.ra?.overheadPct) / 100;
  const con = (base + oh) * _n(item.ra?.contingencyPct) / 100;
  const prof = (base + oh + con) * _n(item.ra?.profitPct) / 100;
  return { base, oh, con, prof, final: base + oh + con + prof };
}
function recalcItem(item) { const f = itemFinalRate(item); item.rate = f.final; item.amount = f.final * _n(item.qty); return item; }
function estTotal(est) { return (est.boqItems || []).reduce((s, it) => s + _n(it.amount), 0); }

// ═══ State handle for the editor ═══
let _cur_est = null;   // estimate being edited
let _cur_boq = null;   // BOQ item open in rate analysis

// ═══ LIST + EDITOR ═══
export function renderEstimationView() {
  const c = document.getElementById('estimationContent');
  if (!c) return;
  _ensureArr();
  if (_cur_est) { _renderEditor(c); return; }
  const list = state.estimations.slice().reverse();
  c.innerHTML = `
    <div class="flex items-center justify-between mb-5">
      <div><h2 class="text-2xl font-extrabold text-slate-800">Estimation</h2>
        <p class="text-slate-500 text-sm font-medium mt-1">Rate-analysis costing — BOQ → cost heads → budget.</p></div>
      <button onclick="window._estNew()" class="px-5 py-2.5 text-white rounded-xl font-bold text-sm" style="background:linear-gradient(135deg,#7C5CFC,#5B34D9);">+ New Estimate</button>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      ${list.length ? list.map(e => `
        <div onclick="window._estOpen('${e.id}')" class="bg-white border rounded-2xl p-5 cursor-pointer" style="box-shadow:0 8px 22px -16px rgba(91,52,217,.4);">
          <div class="flex justify-between items-start">
            <div><p class="font-extrabold text-slate-800">${_esc(e.projectName || 'Untitled project')}</p>
              <p class="text-xs text-slate-400 font-mono font-bold mt-0.5">${_esc(e.estNo)} · v${e.version || 1}</p></div>
            <span class="text-[10px] font-bold px-2 py-1 rounded-full bg-violet-50 text-violet-700">${(e.boqItems || []).length} items</span>
          </div>
          <p class="text-2xl font-extrabold text-violet-700 mt-3">${_money(estTotal(e))}</p>
          <p class="text-[11px] text-slate-400 mt-1">Profit ${_n(e.profitPct)}% · OH ${_n(e.overheadPct)}% · Cont ${_n(e.contingencyPct)}%</p>
        </div>`).join('')
      : '<div class="col-span-full text-center py-16 text-slate-400"><div style="font-size:44px;opacity:.3">📐</div><p class="mt-2 font-semibold">No estimates yet. Click “New Estimate”.</p></div>'}
    </div>`;
}

function _renderEditor(c) {
  const e = _cur_est;
  const clientOpts = (state.clients || []).map(cl => `<option value="${cl.id}" ${cl.id === e.clientId ? 'selected' : ''}>${_esc(cl.name)}</option>`).join('');
  c.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <button onclick="window._estClose()" class="text-sm font-bold text-slate-500">← All estimates</button>
      <div class="flex gap-2">
        <button onclick="window._estSave()" class="px-5 py-2 text-white rounded-lg font-bold text-sm" style="background:linear-gradient(135deg,#7C5CFC,#5B34D9);">💾 Save</button>
      </div>
    </div>

    <!-- 1. Project Information -->
    <div class="bg-white border rounded-2xl p-5 mb-5" style="box-shadow:0 8px 22px -18px rgba(91,52,217,.4);">
      <h3 class="font-extrabold text-slate-800 mb-3">1 · Project Information</h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        ${_pi('Estimate No.', `<input id="ei_estNo" class="est-in" value="${_esc(e.estNo)}">`)}
        ${_pi('Project Name', `<input id="ei_projectName" class="est-in" value="${_esc(e.projectName)}" placeholder="Project name">`)}
        ${_pi('Client', `<select id="ei_clientId" class="est-in"><option value="">— Select —</option>${clientOpts}</select>`)}
        ${_pi('Location', `<input id="ei_location" class="est-in" value="${_esc(e.location)}">`)}
        ${_pi('Tender No.', `<input id="ei_tenderNo" class="est-in" value="${_esc(e.tenderNo)}">`)}
        ${_pi('Version', `<input id="ei_version" type="number" class="est-in" value="${_n(e.version) || 1}">`)}
        ${_pi('Tax Structure', `<input id="ei_taxStructure" class="est-in" value="${_esc(e.taxStructure)}">`)}
        ${_pi('Overhead %', `<input id="ei_overheadPct" type="number" class="est-in" value="${_n(e.overheadPct)}">`)}
        ${_pi('Contingency %', `<input id="ei_contingencyPct" type="number" class="est-in" value="${_n(e.contingencyPct)}">`)}
        ${_pi('Profit %', `<input id="ei_profitPct" type="number" class="est-in" value="${_n(e.profitPct)}">`)}
        ${_pi('Escalation %', `<input id="ei_escalationPct" type="number" class="est-in" value="${_n(e.escalationPct)}">`)}
        ${_pi('Remarks', `<input id="ei_remarks" class="est-in" value="${_esc(e.remarks)}">`)}
      </div>
    </div>

    <!-- 2. BOQ -->
    <div class="bg-white border rounded-2xl p-5 mb-5" style="box-shadow:0 8px 22px -18px rgba(91,52,217,.4);">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-extrabold text-slate-800">2 · Bill of Quantities</h3>
        <button onclick="window._estAddBOQ()" class="text-xs bg-violet-50 text-violet-700 border border-violet-200 px-3 py-1.5 rounded-lg font-bold">+ Add Item</button>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm" id="estBoqTable">
          <thead><tr class="text-left text-[10px] uppercase font-bold text-slate-400 border-b">
            <th class="p-2 w-24">Code</th><th class="p-2">Description</th><th class="p-2 w-20">Unit</th>
            <th class="p-2 w-24 text-right">Qty</th><th class="p-2 w-28 text-right">Rate</th><th class="p-2 w-32 text-right">Amount</th><th class="p-2 w-32"></th></tr></thead>
          <tbody id="estBoqBody"></tbody>
        </table>
      </div>
      <div class="flex justify-end mt-4 pt-3 border-t">
        <div class="text-right"><p class="text-xs font-bold text-slate-400 uppercase">Estimate Total</p>
          <p class="text-3xl font-extrabold text-violet-700" id="estGrandTotal">${_money(estTotal(e))}</p></div>
      </div>
    </div>

    <!-- 4. Budget Summary -->
    <div id="estBudgetSummary"></div>`;
  _renderBOQBody();
  _renderBudget();
}
function _pi(label, field) { return `<div><label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">${label}</label>${field}</div>`; }

function _renderBOQBody() {
  const tb = document.getElementById('estBoqBody'); if (!tb || !_cur_est) return;
  const items = _cur_est.boqItems || [];
  tb.innerHTML = items.length ? items.map((it, i) => `
    <tr class="border-b" data-id="${it.id}">
      <td class="p-2" data-col="Code"><input class="est-cell" value="${_esc(it.code)}" onchange="window._estBoqField('${it.id}','code',this.value)" placeholder="Code"></td>
      <td class="p-2" data-col="Description"><input class="est-cell" value="${_esc(it.desc)}" onchange="window._estBoqField('${it.id}','desc',this.value)" placeholder="Work item"></td>
      <td class="p-2" data-col="Unit"><input class="est-cell" value="${_esc(it.unit)}" onchange="window._estBoqField('${it.id}','unit',this.value)" placeholder="Cum"></td>
      <td class="p-2" data-col="Qty"><input class="est-cell text-right" type="number" value="${it.qty || ''}" onchange="window._estBoqField('${it.id}','qty',this.value)" placeholder="0"></td>
      <td class="p-2 text-right" data-col="Rate"><span class="font-bold text-slate-700">${_money(it.rate)}</span><div class="text-[9px] text-slate-400">auto</div></td>
      <td class="p-2 text-right" data-col="Amount"><span class="font-extrabold text-violet-700">${_money(it.amount)}</span></td>
      <td class="p-2" data-col=""><div class="flex gap-1 justify-end">
        <button onclick="window._estAnalyse('${it.id}')" class="text-[11px] font-bold bg-violet-600 text-white px-2.5 py-1.5 rounded-lg">Rate Analysis</button>
        <button onclick="window._estDelBOQ('${it.id}')" class="text-[11px] font-bold bg-red-50 text-red-600 px-2 py-1.5 rounded-lg">Del</button>
      </div></td>
    </tr>`).join('') : '<tr><td colspan="7" class="p-6 text-center text-slate-400">No BOQ items. Click “Add Item”.</td></tr>';
  const gt = document.getElementById('estGrandTotal'); if (gt) gt.textContent = _money(estTotal(_cur_est));
}

function _renderBudget() {
  const el = document.getElementById('estBudgetSummary'); if (!el || !_cur_est) return;
  const e = _cur_est;
  const heads = {}; HEADS.forEach(h => heads[h.key] = 0);
  let base = 0, oh = 0, con = 0, prof = 0;
  (e.boqItems || []).forEach(it => {
    const q = _n(it.qty);
    HEADS.forEach(h => heads[h.key] += headSubtotal(it.ra?.[h.key]) * q);
    const f = itemFinalRate(it);
    base += f.base * q; oh += f.oh * q; con += f.con * q; prof += f.prof * q;
  });
  const total = base + oh + con + prof;
  const row = (l, v, strong) => `<div class="flex justify-between py-1.5 ${strong ? 'border-t mt-1 pt-2' : ''}"><span class="${strong ? 'font-extrabold text-slate-800' : 'text-slate-500'}">${l}</span><span class="${strong ? 'font-extrabold text-violet-700' : 'font-bold text-slate-700'}">${_money(v)}</span></div>`;
  el.innerHTML = `
    <div class="bg-white border rounded-2xl p-5" style="box-shadow:0 8px 22px -18px rgba(91,52,217,.4);">
      <h3 class="font-extrabold text-slate-800 mb-3">4 · Budget Summary</h3>
      <div class="text-sm">
        ${HEADS.map(h => heads[h.key] > 0 ? row(h.icon + ' ' + h.label, heads[h.key]) : '').join('')}
        ${row('Base cost', base, true)}
        ${row('Overhead', oh)}
        ${row('Contingency', con)}
        ${row('Profit', prof)}
        ${row('Grand Total', total, true)}
      </div>
    </div>`;
}

// ═══ RATE ANALYSIS MODAL ═══
function _renderRA() {
  const it = _cur_boq; if (!it) return;
  let host = document.getElementById('estRAModal');
  if (!host) { host = document.createElement('div'); host.id = 'estRAModal'; document.body.appendChild(host); }
  const f = itemFinalRate(it);
  host.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(20,10,50,.5);z-index:100000;display:flex;flex-direction:column;" onclick="if(event.target===this)window._estCloseRA()">
      <div style="background:#F5F3FB;margin:auto;width:100%;max-width:900px;max-height:94vh;border-radius:20px;overflow:hidden;display:flex;flex-direction:column;">
        <div style="background:#fff;padding:16px 20px;border-bottom:1px solid #ECE7F7;display:flex;justify-content:space-between;align-items:center;">
          <div><div style="font-size:16px;font-weight:800;color:#241E45;">Rate Analysis</div>
            <div style="font-size:12px;color:#8B86A8;">${_esc(it.code || '')} ${_esc(it.desc || 'BOQ item')} · per ${_esc(it.unit || 'unit')} (qty ${_n(it.qty)})</div></div>
          <button onclick="window._estCloseRA()" style="background:#f1f5f9;border:none;border-radius:10px;padding:8px 12px;font-weight:800;cursor:pointer;">Done</button>
        </div>
        <div style="overflow:auto;padding:16px 18px;flex:1;">
          ${HEADS.map(h => _raHeadTable(it, h)).join('')}
          <!-- % layers -->
          <div style="background:#fff;border:1px solid #ECE7F7;border-radius:14px;padding:14px;margin-bottom:14px;">
            <div style="font-weight:800;color:#241E45;margin-bottom:8px;">Overhead · Contingency · Profit</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
              <div><label style="font-size:11px;font-weight:700;color:#8B86A8;">Overhead %</label><input class="est-in" type="number" value="${_n(it.ra.overheadPct)}" onchange="window._estPct('overheadPct',this.value)"></div>
              <div><label style="font-size:11px;font-weight:700;color:#8B86A8;">Contingency %</label><input class="est-in" type="number" value="${_n(it.ra.contingencyPct)}" onchange="window._estPct('contingencyPct',this.value)"></div>
              <div><label style="font-size:11px;font-weight:700;color:#8B86A8;">Profit %</label><input class="est-in" type="number" value="${_n(it.ra.profitPct)}" onchange="window._estPct('profitPct',this.value)"></div>
            </div>
          </div>
          <div style="background:#fff;border:1px solid #ECE7F7;border-radius:14px;padding:14px;margin-bottom:14px;">
            <label style="font-size:11px;font-weight:700;color:#8B86A8;">Notes / assumptions</label>
            <textarea class="est-in" style="min-height:60px" onchange="window._estRANotes(this.value)" placeholder="Material brand, productivity assumptions, method…">${_esc(it.ra.notes)}</textarea>
          </div>
        </div>
        <!-- Cost summary footer -->
        <div id="estRASummary" style="background:#fff;border-top:1px solid #ECE7F7;padding:14px 20px;">
          ${_raSummaryHtml(f, it)}
        </div>
      </div>
    </div>`;
}
function _raHeadTable(it, h) {
  const rows = it.ra[h.key] || [];
  const sub = headSubtotal(rows);
  const suggest = _suggestList(h);
  return `
    <div style="background:#fff;border:1px solid #ECE7F7;border-radius:14px;padding:14px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="font-weight:800;color:#241E45;">${h.icon} ${h.label}</div>
        <div style="font-size:13px;font-weight:800;color:#5B34D9;">${_money(sub)}</div>
      </div>
      ${suggest}
      <div style="overflow-x:auto;"><table style="width:100%;font-size:13px;">
        <thead><tr style="text-align:left;color:#9B95BD;font-size:9px;text-transform:uppercase;">
          <th style="padding:4px;">${h.master === 'labourMaster' ? 'Labour' : h.master === 'equipmentList' ? 'Equipment' : 'Item'}</th>
          ${h.unit ? '<th style="padding:4px;width:60px;">Unit</th>' : ''}
          <th style="padding:4px;width:70px;">Qty/unit</th><th style="padding:4px;width:80px;">Rate</th>
          ${h.wastage ? '<th style="padding:4px;width:60px;">Wast%</th>' : ''}
          <th style="padding:4px;width:90px;text-align:right;">Amount</th><th style="width:28px;"></th></tr></thead>
        <tbody>${rows.length ? rows.map((r, i) => `
          <tr>
            <td style="padding:3px;"><input class="est-cell" value="${_esc(r.name)}" list="estsug_${h.key}" onchange="window._estRAField('${h.key}',${i},'name',this.value)"></td>
            ${h.unit ? `<td style="padding:3px;"><input class="est-cell" value="${_esc(r.unit)}" onchange="window._estRAField('${h.key}',${i},'unit',this.value)"></td>` : ''}
            <td style="padding:3px;"><input class="est-cell text-right" type="number" value="${r.qty || ''}" onchange="window._estRAField('${h.key}',${i},'qty',this.value)"></td>
            <td style="padding:3px;"><input class="est-cell text-right" type="number" value="${r.rate || ''}" onchange="window._estRAField('${h.key}',${i},'rate',this.value)"></td>
            ${h.wastage ? `<td style="padding:3px;"><input class="est-cell text-right" type="number" value="${r.w || ''}" onchange="window._estRAField('${h.key}',${i},'w',this.value)"></td>` : ''}
            <td style="padding:3px;text-align:right;font-weight:700;color:#334155;">${_money(_n(r.qty) * _n(r.rate) * (1 + _n(r.w) / 100))}</td>
            <td style="text-align:center;"><button onclick="window._estRADel('${h.key}',${i})" style="border:none;background:transparent;color:#cbd5e1;cursor:pointer;">✕</button></td>
          </tr>`).join('') : `<tr><td colspan="9" style="padding:6px;color:#c4bfe0;font-size:12px;">No ${h.label.toLowerCase()} lines.</td></tr>`}</tbody>
      </table></div>
      <button onclick="window._estRAAdd('${h.key}')" style="margin-top:6px;font-size:11px;font-weight:800;color:#5B34D9;background:#F3F0FD;border:none;padding:6px 12px;border-radius:8px;cursor:pointer;">+ Add ${h.label} line</button>
    </div>`;
}
function _suggestList(h) {
  let items = [];
  try {
    if (h.master === 'itemsMaster') items = (state.itemsMaster || []).map(i => i.name || i.desc).filter(Boolean);
    else if (h.master === 'labourMaster') items = [...new Set((state.labourMaster || []).map(l => l.trade || l.role || l.name).filter(Boolean))];
    else if (h.master === 'equipmentList') items = (state.equipmentList || []).map(e => e.name).filter(Boolean);
  } catch {}
  if (!items.length) return '';
  return `<datalist id="estsug_${h.key}">${items.slice(0, 200).map(n => `<option value="${_esc(n)}">`).join('')}</datalist>`;
}
function _raSummaryHtml(f, it) {
  const q = _n(it.qty);
  const line = (l, v) => `<span style="color:#8B86A8;">${l}</span> <b style="color:#334155;">${_money(v)}</b>`;
  return `
    <div style="display:flex;flex-wrap:wrap;gap:8px 18px;font-size:12px;margin-bottom:8px;">
      ${line('Base/unit', f.base)} ${line('OH', f.oh)} ${line('Cont', f.con)} ${line('Profit', f.prof)}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div><div style="font-size:11px;color:#8B86A8;font-weight:700;">FINAL RATE / ${_esc(it.unit || 'unit')}</div>
        <div style="font-size:22px;font-weight:900;color:#5B34D9;">${_money(f.final)}</div></div>
      <div style="text-align:right;"><div style="font-size:11px;color:#8B86A8;font-weight:700;">ITEM AMOUNT (× ${q})</div>
        <div style="font-size:18px;font-weight:900;color:#241E45;">${_money(f.final * q)}</div></div>
    </div>`;
}
function _refreshRASummary() {
  const el = document.getElementById('estRASummary'); if (!el || !_cur_boq) return;
  el.innerHTML = _raSummaryHtml(itemFinalRate(_cur_boq), _cur_boq);
}

// ═══ WINDOW BINDINGS ═══
window._estNew = function () { _ensureArr(); _cur_est = _blankEstimate(); renderEstimationView(); };
window._estOpen = function (id) { _ensureArr(); _cur_est = state.estimations.find(e => e.id === id) || null; renderEstimationView(); };
window._estClose = function () { _cur_est = null; renderEstimationView(); };
window._estAddBOQ = function () { if (!_cur_est) return; (_cur_est.boqItems = _cur_est.boqItems || []).push(_blankBOQ()); _renderBOQBody(); _renderBudget(); };
window._estDelBOQ = function (id) { if (!_cur_est) return; _cur_est.boqItems = (_cur_est.boqItems || []).filter(x => x.id !== id); _renderBOQBody(); _renderBudget(); };
window._estBoqField = function (id, field, val) {
  const it = (_cur_est?.boqItems || []).find(x => x.id === id); if (!it) return;
  it[field] = (field === 'qty') ? _n(val) : val;
  recalcItem(it); _renderBOQBody(); _renderBudget();
};
window._estAnalyse = function (id) {
  const it = (_cur_est?.boqItems || []).find(x => x.id === id); if (!it) return;
  if (!it.ra) it.ra = _blankRA(); HEADS.forEach(h => { if (!Array.isArray(it.ra[h.key])) it.ra[h.key] = []; });
  _cur_boq = it; _renderRA();
};
window._estCloseRA = function () {
  if (_cur_boq) recalcItem(_cur_boq);
  const m = document.getElementById('estRAModal'); if (m) m.remove();
  _cur_boq = null; _renderBOQBody(); _renderBudget();
};
window._estRAAdd = function (key) { if (!_cur_boq) return; (_cur_boq.ra[key] = _cur_boq.ra[key] || []).push({ name: '', unit: '', qty: 0, rate: 0, w: 0 }); _renderRA(); };
window._estRADel = function (key, i) { if (!_cur_boq) return; _cur_boq.ra[key].splice(i, 1); _renderRA(); };
window._estRAField = function (key, i, field, val) {
  if (!_cur_boq) return; const r = _cur_boq.ra[key][i]; if (!r) return;
  r[field] = (['qty', 'rate', 'w'].includes(field)) ? _n(val) : val;
  recalcItem(_cur_boq); _refreshRASummary();
  // live-update just this head subtotal + the row amount without full re-render (keeps focus flow ok on blur)
};
window._estPct = function (field, val) { if (!_cur_boq) return; _cur_boq.ra[field] = _n(val); recalcItem(_cur_boq); _refreshRASummary(); };
window._estRANotes = function (val) { if (_cur_boq) _cur_boq.ra.notes = val; };
window._estSave = function () {
  if (!_cur_est) return;
  const g = id => document.getElementById(id);
  const map = { ei_estNo: 'estNo', ei_projectName: 'projectName', ei_clientId: 'clientId', ei_location: 'location', ei_tenderNo: 'tenderNo', ei_taxStructure: 'taxStructure', ei_remarks: 'remarks' };
  for (const [el, k] of Object.entries(map)) { if (g(el)) _cur_est[k] = g(el).value; }
  ['version', 'overheadPct', 'contingencyPct', 'profitPct', 'escalationPct'].forEach(k => { const el = g('ei_' + k); if (el) _cur_est[k] = _n(el.value); });
  (_cur_est.boqItems || []).forEach(recalcItem);
  _ensureArr();
  const idx = state.estimations.findIndex(e => e.id === _cur_est.id);
  if (idx >= 0) state.estimations[idx] = _cur_est; else state.estimations.push(_cur_est);
  try { saveAllData(); } catch (e) { console.warn('[estimation] save', e); }
  showToast('Estimate saved', 'success');
  _cur_est = null; renderEstimationView();
};
window.renderEstimationView = renderEstimationView;
