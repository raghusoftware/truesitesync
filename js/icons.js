/**
 * ═══════════════════════════════════════════════════════════════
 * icons.js — Bundled line-icon set (offline, brandable)
 * ───────────────────────────────────────────────────────────────
 * One consistent single-weight stroke set (24×24, round caps,
 * stroke-width 2) that replaces emoji across the app. Every icon
 * uses stroke="currentColor", so it takes the colour of its
 * container — white on a red tile chip, brand-red or grey inline.
 *
 * Usage:
 *   window.tssIcon('truck')                     → <svg> string
 *   window.tssIcon('truck', { size: 20 })       → sized
 *   window.tssIcon('truck', { cls: 'ico-lg' })  → extra class
 * Unknown names fall back to a neutral dot so nothing ever breaks.
 * ═══════════════════════════════════════════════════════════════
 */

// Inner SVG markup per icon (paths only; wrapper added by tssIcon()).
const TSS_ICON_PATHS = {
  // ── navigation / shell ──
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2Z"/>',
  back: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',

  // ── project modules ──
  planning: '<path d="M8 2h8l2 2v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4Z"/><path d="M9 2v3h6V2"/><path d="M9 11h6M9 15h4"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1Z"/><path d="M4 22V4"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-4-.9L3 21l1.1-4a8.4 8.4 0 0 1-.9-4 8.4 8.4 0 0 1 8.4-8.4h.5A8.4 8.4 0 0 1 21 11v.5Z"/>',
  execution: '<path d="M2 18a10 10 0 0 1 20 0"/><path d="M12 8V4M12 4l3 1.5M12 4 9 5.5"/><path d="M2 18h20"/><path d="M12 13a2 2 0 0 1 2 2"/>',
  labour: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"/><path d="M17 11a3 3 0 0 0 0-6"/><path d="M21 21v-1a5 5 0 0 0-3-4.5"/>',
  truck: '<path d="M14 17V5a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v12h3"/><path d="M14 8h4l3 3v6h-2"/><path d="M9 17h6"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  inventory: '<path d="m7.5 4.3 9 5.2v9L12 21l-4.5-2.5v-9Z"/><path d="M12 21v-9M3 7.3l9 5.2 9-5.2"/><path d="m7.5 4.3 9 5.2"/>',
  flask: '<path d="M9 3h6M10 3v6L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M7.5 14h9"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5l-9.9 9.9a2.1 2.1 0 0 1-3-3L16.7 8.3Z"/>',
  ruler: '<path d="M3 15 15 3l6 6L9 21Z"/><path d="M8 8l1.5 1.5M11 5l2 2M5 11l2 2"/>',
  file: '<path d="M8 2h6l4 4v14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3Z" transform="translate(-1 0)"/><path d="M13 2v4h4"/><path d="M8 13h6M8 17h4"/>',
  boxes: '<path d="M3 8 7 6l4 2v4l-4 2-4-2Z"/><path d="M13 8l4-2 4 2v4l-4 2-4-2Z"/><path d="M8 15l4 2 4-2"/><path d="M12 11v6"/>',
  warehouse: '<path d="M3 21V9l9-5 9 5v12"/><path d="M7 21v-8h10v8"/><path d="M7 17h10"/>',
  transfer: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  audit: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M9 2h6v3H9z"/><path d="m9 13 2 2 4-4"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
  trending: '<path d="m3 17 6-6 4 4 7-7"/><path d="M15 8h5v5"/>',
  recipe: '<path d="M4 3h16v4H4z"/><path d="M5 7v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7"/><path d="M9 12h6M9 16h4"/>',
  document: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 2h6v3H9z"/><path d="M9 11h6M9 15h4"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/>',

  // ── business hubs ──
  receipt: '<path d="M5 3v18l2-1.3L9 21l2-1.3L13 21l2-1.3L17 21l2-1.3V3l-2 1.3L15 3l-2 1.3L11 3 9 4.3 7 3Z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 13h11l1.8-9H6"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M16 14h3"/><path d="M3 6V5a1 1 0 0 1 1-1h12"/>',
  bank: '<path d="m3 10 9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 21h18"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.2a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4.6 15a1.6 1.6 0 0 0-1.4-.9H3a2 2 0 0 1 0-4h.2a1.6 1.6 0 0 0 1.4-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 4.6a1.6 1.6 0 0 0 .9-1.4V3a2 2 0 0 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 0 1 0 4h-.2a1.6 1.6 0 0 0-1.4.9Z"/>',
  analytics: '<path d="M3 3v18h18"/><path d="m7 14 3-4 4 3 5-7"/>',
  report: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8"/><path d="M8 15h4"/>',
  equipment: '<path d="M14 17V5a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v12h3"/><path d="M14 8h4l3 3v6h-2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 16 0v1"/>',
  handshake: '<path d="m11 17 2 2a1 1 0 0 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 0 0 3-3L15 9h-2l-3 3"/><path d="m8 8 2.5-2.5a1 1 0 0 1 3 0"/><path d="M3 13 8 8"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4"/><path d="M8 6h2M14 6h2M8 10h2M14 10h2M8 14h2M14 14h2"/>',
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.1 10.4a6 6 0 0 1 0 11.2"/><path d="M8.5 5.5v5M6 8h5"/>',
  shield: '<path d="M12 2 4 5v6c0 5 3.5 8 8 11 4.5-3 8-6 8-11V5Z"/><path d="m9 12 2 2 4-4"/>',
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
};

/** Build an <svg> string for a named icon. */
function tssIcon(name, opts) {
  opts = opts || {};
  const size = opts.size || 24;
  const sw = opts.stroke || 2;
  const cls = opts.cls ? ` ${opts.cls}` : '';
  const inner = TSS_ICON_PATHS[name] || '<circle cx="12" cy="12" r="2"/>';
  return `<svg class="tss-ico${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

if (typeof window !== 'undefined') {
  window.tssIcon = tssIcon;
  window.TSS_ICON_PATHS = TSS_ICON_PATHS;
}
export { tssIcon, TSS_ICON_PATHS };
