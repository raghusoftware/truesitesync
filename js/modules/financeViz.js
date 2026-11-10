/**
 * financeViz.js — hand-drawn SVG charts for the finance screens (no library, works offline in the APK).
 *
 *   donutSVG(slices, o)   share of a whole (cost breakdown, income by category); fixed slice order,
 *                         2px surface gaps, centre total, a <title> tooltip per slice
 *   areaSVG(points, o)    smooth trend of one measure over time (monthly profit / income); a single ₹
 *                         axis, green above zero and red below, a dot + tooltip per month
 *   legendHTML(slices)    the always-visible legend (label · value · %), so colour is never the only cue
 *
 * Colours (validated with the dataviz validator, light surface):
 *   SERIES  blue / orange / aqua pass every pairing (CVD ΔE ≥ 9.1, normal ≥ 22.9); a 4th category
 *           folds into NEUTRAL grey ("Other" / "Miscellaneous"). Aqua is under 3:1 contrast →
 *           the legend always shows labels and values.
 *   GAIN / LOSS  #059669 / #dc2626 (CVD ΔE 8.6).
 */

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'];
export const NEUTRAL = '#a8b0bd';
export const GAIN = '#059669', LOSS = '#dc2626';
const INK = '#0f172a', MUTE = '#64748b', GRID = '#e8ecf1';

const N = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** ₹12.4L / ₹3.2Cr / ₹85k — chart labels. */
export function shortMoney(v, sym = '₹') {
  const a = Math.abs(N(v)), s = N(v) < 0 ? '−' : '';
  if (a >= 1e7) return `${s}${sym}${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `${s}${sym}${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `${s}${sym}${Math.round(a / 1e3)}k`;
  return `${s}${sym}${Math.round(a)}`;
}

/**
 * @param {Array<{label:string, value:number, color:string}>} slices  fixed order; zero slices are skipped
 * @param {{ size?:number, thick?:number, center?:string, sub?:string, money?:(n)=>string, title?:string }} o
 */
export function donutSVG(slices, o = {}) {
  const size = o.size || 200, thick = o.thick || 26, r = size / 2 - 2, ri = r - thick, c = size / 2;
  const live = slices.filter(s => N(s.value) > 0);
  const total = live.reduce((t, s) => t + N(s.value), 0);
  const money = o.money || (n => shortMoney(n));
  if (!total) {
    return `<svg viewBox="0 0 ${size} ${size}" class="fx-donut" role="img" aria-label="${esc(o.title || 'No data')}">
      <circle cx="${c}" cy="${c}" r="${(r + ri) / 2}" fill="none" stroke="${GRID}" stroke-width="${thick}"/>
      <text x="${c}" y="${c + 4}" text-anchor="middle" class="fx-donut-sub">No data yet</text></svg>`;
  }
  const gap = live.length > 1 ? 2 / r : 0;                 // ~2px surface gap between slices
  let a0 = -Math.PI / 2;
  const pt = (rad, a) => `${(c + rad * Math.cos(a)).toFixed(2)},${(c + rad * Math.sin(a)).toFixed(2)}`;
  const arcs = live.map(s => {
    const sweep = (N(s.value) / total) * Math.PI * 2;
    const a1 = a0 + sweep;
    const s0 = a0 + gap / 2, s1 = Math.max(s0 + 0.0001, a1 - gap / 2);
    a0 = a1;
    const large = s1 - s0 > Math.PI ? 1 : 0;
    const d = live.length === 1
      ? `M${pt(r, -Math.PI / 2)} A${r},${r} 0 1 1 ${pt(r, Math.PI * 1.5 - 0.0001)} L${pt(ri, Math.PI * 1.5 - 0.0001)} A${ri},${ri} 0 1 0 ${pt(ri, -Math.PI / 2)} Z`
      : `M${pt(r, s0)} A${r},${r} 0 ${large} 1 ${pt(r, s1)} L${pt(ri, s1)} A${ri},${ri} 0 ${large} 0 ${pt(ri, s0)} Z`;
    const pct = Math.round(N(s.value) / total * 100);
    return `<path d="${d}" fill="${s.color}" class="fx-slice"><title>${esc(s.label)}: ${esc(money(s.value))} (${pct}%)</title></path>`;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" class="fx-donut" role="img" aria-label="${esc(o.title || 'Breakdown')}: ${live.map(s => `${esc(s.label)} ${Math.round(N(s.value) / total * 100)}%`).join(', ')}">
    ${arcs}
    <text x="${c}" y="${c - 2}" text-anchor="middle" class="fx-donut-val">${esc(o.center ?? money(total))}</text>
    <text x="${c}" y="${c + 16}" text-anchor="middle" class="fx-donut-sub">${esc(o.sub || 'total')}</text>
  </svg>`;
}

/** Legend rows: swatch · label · value · share. Text stays in ink colours, the swatch carries identity. */
export function legendHTML(slices, money = (n => shortMoney(n))) {
  const total = slices.reduce((t, s) => t + Math.max(0, N(s.value)), 0) || 1;
  return `<ul class="fx-legend">${slices.map(s => `<li><i style="background:${s.color}"></i><span>${esc(s.label)}</span><b>${esc(money(s.value))}</b><em>${Math.round(Math.max(0, N(s.value)) / total * 100)}%</em></li>`).join('')}</ul>`;
}

/**
 * Smooth area for one measure over time. Negative values dip below a zero baseline in red.
 * @param {Array<{label:string, value:number, tip?:string}>} points
 * @param {{ width?:number, height?:number, money?:(n)=>string, title?:string }} o
 */
export function areaSVG(points, o = {}) {
  const W = o.width || 640, H = o.height || 220, padL = 52, padR = 12, padT = 14, padB = 26;
  const money = o.money || (n => shortMoney(n));
  if (!points.length) return '';
  const vals = points.map(p => N(p.value));
  let max = Math.max(0, ...vals), min = Math.min(0, ...vals);
  if (max === min) max = min + 1;
  const span = max - min; max += span * 0.08; if (min < 0) min -= span * 0.08;
  const x = i => padL + (points.length === 1 ? (W - padL - padR) / 2 : i * (W - padL - padR) / (points.length - 1));
  const y = v => padT + (max - v) / (max - min) * (H - padT - padB);
  const P = points.map((p, i) => [x(i), y(N(p.value))]);
  // Monotone cubic (no overshoot past real values); the zero line itself counts as gain colour
  const path = (() => {
    if (P.length < 2) return `M${P[0][0]},${P[0][1]}`;
    const n = P.length, m = new Array(n), d = [];
    for (let i = 0; i < n - 1; i++) d.push((P[i + 1][1] - P[i][1]) / (P[i + 1][0] - P[i][0]));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    let s = `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const h = (P[i + 1][0] - P[i][0]) / 3;
      s += ` C${(P[i][0] + h).toFixed(1)},${(P[i][1] + m[i] * h).toFixed(1)} ${(P[i + 1][0] - h).toFixed(1)},${(P[i + 1][1] - m[i + 1] * h).toFixed(1)} ${P[i + 1][0].toFixed(1)},${P[i + 1][1].toFixed(1)}`;
    }
    return s;
  })();
  const y0 = y(0), id = 'fx' + Math.random().toString(36).slice(2, 8);
  const area = `${path} L${P[P.length - 1][0].toFixed(1)},${y0} L${P[0][0].toFixed(1)},${y0} Z`;
  const ticks = 4, grid = Array.from({ length: ticks + 1 }, (_, i) => min + (max - min) * i / ticks);
  const every = points.length > 8 ? 2 : 1;
  return `<svg viewBox="0 0 ${W} ${H}" class="fx-area" role="img" aria-label="${esc(o.title || 'Trend')}">
    <defs>
      <clipPath id="${id}a"><rect x="0" y="0" width="${W}" height="${y0 + 1.5}"/></clipPath>
      <clipPath id="${id}b"><rect x="0" y="${y0 + 1.5}" width="${W}" height="${Math.max(0, H - y0 - 1.5)}"/></clipPath>
      <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${GAIN}" stop-opacity=".28"/><stop offset="1" stop-color="${GAIN}" stop-opacity=".03"/></linearGradient>
      <linearGradient id="${id}r" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${LOSS}" stop-opacity=".28"/><stop offset="1" stop-color="${LOSS}" stop-opacity=".03"/></linearGradient>
    </defs>
    ${grid.map(g => `<line x1="${padL}" x2="${W - padR}" y1="${y(g).toFixed(1)}" y2="${y(g).toFixed(1)}" stroke="${GRID}"/><text x="${padL - 8}" y="${(y(g) + 4).toFixed(1)}" text-anchor="end" class="fx-ax">${esc(money(g))}</text>`).join('')}
    <line x1="${padL}" x2="${W - padR}" y1="${y0}" y2="${y0}" stroke="#94a3b8" stroke-width="1.2"/>
    <path d="${area}" fill="url(#${id}g)" clip-path="url(#${id}a)"/>
    <path d="${area}" fill="url(#${id}r)" clip-path="url(#${id}b)"/>
    <path d="${path}" fill="none" stroke="${GAIN}" stroke-width="2.2" clip-path="url(#${id}a)"/>
    <path d="${path}" fill="none" stroke="${LOSS}" stroke-width="2.2" clip-path="url(#${id}b)"/>
    ${P.map(([px, py], i) => `<g class="fx-pt"><rect x="${(px - 16).toFixed(1)}" y="${padT}" width="32" height="${H - padT - padB}" fill="transparent"/><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="${N(points[i].value) < 0 ? LOSS : GAIN}" stroke="#fff" stroke-width="2"/><title>${esc(points[i].label)}: ${esc(points[i].tip || money(points[i].value))}</title></g>`).join('')}
    ${points.map((p, i) => i % every ? '' : `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="fx-ax">${esc(p.label)}</text>`).join('')}
  </svg>`;
}

/** Last n calendar months as { key:'YYYY-MM', label:'Nov', from, to } (oldest first). */
export function lastMonths(n, today = new Date()) {
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getFullYear(), today.getMonth() - i, 1));
    const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    out.push({ key: d.toISOString().slice(0, 7), label: MON[d.getUTCMonth()], from: d.toISOString().slice(0, 10), to: e.toISOString().slice(0, 10) });
  }
  return out;
}
