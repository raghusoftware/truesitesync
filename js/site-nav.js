/* True Site Sync — shared premium navbar with mega-menu dropdowns.
   Self-contained: injects its own scoped styles (prefix .tssn-) and
   replaces any existing <nav> on the page. Include once per page:
     <script src="/js/site-nav.js" defer></script>
*/
(function () {
  if (window.__tssNavMounted) return;
  window.__tssNavMounted = true;

  /* ---------- line icons (24px grid, inherit currentColor) ---------- */
  function svg(inner) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }
  var ICONS = {
    attendance: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16.3 12.6l1.8 1.8 3.4-3.8"/>',
    material: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M4 7.5l8 4.5 8-4.5"/><path d="M12 12v9"/>',
    equipment: '<path d="M3 6h11v9H3z"/><path d="M14 9h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.7"/><circle cx="17.3" cy="18" r="1.7"/>',
    dpr: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a1.4 1.4 0 0 1 1.4-1.4h3.2A1.4 1.4 0 0 1 15 4"/><path d="M8.5 10h7M8.5 14h7M8.5 18h4"/>',
    quality: '<path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
    measure: '<rect x="2.5" y="9" width="19" height="6" rx="1.6"/><path d="M6 9v2.2M10 9v3M14 9v2.2M18 9v3"/>',
    boq: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M9 4v16"/>',
    receipt: '<path d="M6 3h12v18l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L6 21V3z"/><path d="M9 8h6M9 12h6"/>',
    gst: '<path d="M3 12.5V5a2 2 0 0 1 2-2h7.5L21 11.5a2 2 0 0 1 0 2.8l-6.7 6.7a2 2 0 0 1-2.8 0L3 12.5z"/><circle cx="8" cy="8" r="1.3"/>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5v3"/>',
    planning: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M8 3v4M16 3v4"/><path d="M9.3 14l1.8 1.8 3.4-3.8"/>',
    progress: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    building: '<path d="M4 21V6l8-3 8 3v15"/><path d="M9 21v-4h6v4"/><path d="M8 9h.01M12 9h.01M16 9h.01M8 13h.01M16 13h.01"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18"/><path d="M7 15h4"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h13a2 2 0 0 1 2 2 2 2 0 0 1-2 2H3"/><circle cx="16" cy="12.5" r=".9"/>',
    vendors: '<circle cx="8" cy="9" r="3"/><path d="M2.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 6.6a3 3 0 0 1 0 5.8"/><path d="M17 13.4a5.5 5.5 0 0 1 4.5 5.6"/>',
    chart: '<path d="M4 20h16"/><rect x="5" y="12" width="3" height="6" rx="1"/><rect x="10.5" y="8" width="3" height="10" rx="1"/><rect x="16" y="5" width="3" height="13" rx="1"/>',
    bank: '<path d="M4 9l8-5 8 5"/><path d="M4 9h16"/><path d="M6 9v8M10 9v8M14 9v8M18 9v8"/><path d="M3 20h18"/>',
    road: '<path d="M6 21L9 3M18 21l-3-18"/><path d="M12 5v2M12 11v2M12 17v2"/>',
    sofa: '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M3 11a2 2 0 0 1 2 2v3h14v-3a2 2 0 0 1 2-2"/><path d="M6 19v1.5M18 19v1.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2L17 7M7 17l-1.8 1.8"/>',
    square: '<path d="M5 5v14h14z"/><path d="M9 15h2.5M9 12h4.5"/>',
    hardhat: '<path d="M4 16a8 8 0 0 1 16 0"/><path d="M3 16h18v2.2H3z"/><path d="M10 8.2V6a2 2 0 0 1 4 0v2.2"/>',
    wrench: '<path d="M15 6.5a3.6 3.6 0 0 0-4.8 4.6l-6.5 6.5 2.2 2.2 6.5-6.5A3.6 3.6 0 0 0 17 8.5l-2.3 2.3-1.6-.4-.4-1.6L15 6.5z"/>',
    doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h5"/>',
    book: '<path d="M12 6.2C10 4.7 6.6 4.7 4 5.2v13c2.6-.5 6-.5 8 1 2-1.5 5.4-1.5 8-1v-13c-2.6-.5-6-.5-8 1z"/><path d="M12 6.2V19.2"/>',
    compare: '<path d="M7 4L3 8l4 4"/><path d="M3 8h13"/><path d="M17 20l4-4-4-4"/><path d="M21 16H8"/>',
    download: '<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.6h.01"/>',
    calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M8 3v4M16 3v4"/>'
  };
  function ico(name) { return svg(ICONS[name] || ICONS.info); }

  /* ---------- data ---------- */
  var FEATURES = [
    { group: 'Site operations', items: [
      { ic: 'attendance', t: 'Attendance & labour', d: 'Punch in, gang muster, wages', h: '/features/' },
      { ic: 'material', t: 'Material & inventory', d: 'Stock, GRN, purchase orders', h: '/solutions/material-management-software-for-construction/' },
      { ic: 'equipment', t: 'Equipment & fuel', d: 'Machinery logs, diesel, hours', h: '/solutions/construction-equipment-management-software/' },
      { ic: 'dpr', t: 'Daily progress (DPR)', d: 'Day-wise site work log', h: '/solutions/construction-daily-report-app/' },
      { ic: 'quality', t: 'Quality & safety', d: 'Checklists, snags, inspections', h: '/features/' }
    ]},
    { group: 'Billing & measurement', items: [
      { ic: 'measure', t: 'Measurement book', d: 'Digital MB, BBS, abstracts', h: '/solutions/measurement-book-software/' },
      { ic: 'boq', t: 'BOQ', d: 'Rate analysis, item library', h: '/solutions/boq-management-software/' },
      { ic: 'receipt', t: 'RA billing', d: 'Running bills, retention, deviation', h: '/solutions/ra-bill-software/' },
      { ic: 'gst', t: 'GST invoicing', d: 'GST bills, e-invoice ready', h: '/solutions/gst-billing-software-for-contractors/' },
      { ic: 'calc', t: 'Estimation', d: 'Tender & budget estimates', h: '/solutions/construction-estimation-software-india/' }
    ]},
    { group: 'Project management', items: [
      { ic: 'planning', t: 'Planning & tasks', d: 'Priorities, deadlines, drawings', h: '/solutions/construction-project-management-software/' },
      { ic: 'progress', t: 'Site progress', d: 'Physical vs planned tracking', h: '/solutions/site-progress-tracking-software/' },
      { ic: 'building', t: 'Site management', d: 'Run a site end to end', h: '/solutions/site-management-software/' }
    ]},
    { group: 'Accounts & finance', items: [
      { ic: 'card', t: 'Payments', d: 'Contractor & supplier dues', h: '/features/' },
      { ic: 'wallet', t: 'Petty cash', d: 'Category-wise expense control', h: '/features/' },
      { ic: 'vendors', t: 'Vendors & POs', d: 'Suppliers, purchase orders', h: '/solutions/contractor-management-software/' },
      { ic: 'chart', t: 'Cost, profit & reports', d: 'Per-project profit, cash flow', h: '/solutions/construction-cash-flow-software/' }
    ]}
  ];

  var MODULE_CHIPS = ['Attendance','Material','Equipment','DPR','Measurement','BOQ','RA billing','GST','Payments','Petty cash','Reports','Cost & profit'];

  var PERSONAS = [
    { ic: 'building', t: 'Builders & developers', d: 'Residential & commercial', h: '/solutions/construction-project-management-software/' },
    { ic: 'bank', t: 'Civil contractors', d: 'Executing work for a client', h: '/solutions/ra-bill-software/' },
    { ic: 'road', t: 'Infra companies', d: 'Roads, bridges, utilities', h: '/solutions/construction-management-software/' },
    { ic: 'sofa', t: 'Interior & fit-out', d: 'Turnkey interiors, MEP', h: '/solutions/boq-management-software/' },
    { ic: 'gear', t: 'EPC companies', d: 'Engineering & procurement', h: '/solutions/construction-erp-software/' },
    { ic: 'square', t: 'PMC firms', d: 'Project management consultants', h: '/solutions/site-progress-tracking-software/' },
    { ic: 'hardhat', t: 'Site engineers', d: 'On the ground, on mobile', h: '/solutions/construction-app-for-site-engineers/' },
    { ic: 'wrench', t: 'Sub-contractors', d: 'Electrical, plumbing, finishing', h: '/solutions/contractor-management-software/' }
  ];

  var CITIES = [
    ['Mumbai','mumbai'],['Delhi NCR','delhi-ncr'],['Bengaluru','bengaluru'],['Hyderabad','hyderabad'],
    ['Pune','pune'],['Ahmedabad','ahmedabad'],['Chennai','chennai'],['Surat','surat']
  ];

  var RESOURCES = [
    { ic: 'doc', t: 'Blog', d: 'Billing, sites & software', h: '/blog/' },
    { ic: 'book', t: 'Guides', d: 'RA bills, GST, MB, site ops', h: '/resources/' },
    { ic: 'calc', t: 'Free tools', d: 'GST & unit calculators', h: '/solutions/gst-calculator/' },
    { ic: 'compare', t: 'Compare', d: 'vs Procore, Zoho, Excel', h: '/solutions/true-site-sync-vs-procore/' },
    { ic: 'download', t: 'Downloads', d: 'Android & Windows apps', h: '/#download' },
    { ic: 'info', t: 'About us', d: 'Who builds True Site Sync', h: '/about/' }
  ];

  /* ---------- helpers ---------- */
  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function itemCol(list) {
    return list.map(function (it) {
      return '<a class="tssn-item" href="' + it.h + '"><span class="tssn-ic">' + ico(it.ic) + '</span>' +
        '<span class="tssn-it-txt"><span class="tssn-it-t">' + esc(it.t) + '</span>' +
        '<span class="tssn-it-d">' + esc(it.d) + '</span></span></a>';
    }).join('');
  }

  /* ---------- mega panels ---------- */
  var featuresPanel =
    '<div class="tssn-mega tssn-mega-wide">' +
      '<div class="tssn-mega-cols">' +
        FEATURES.map(function (g) {
          return '<div class="tssn-col"><div class="tssn-col-h">' + esc(g.group) + '</div>' + itemCol(g.items) + '</div>';
        }).join('') +
      '</div>' +
      '<div class="tssn-preview">' +
        '<div class="tssn-pv-top"><div><div class="tssn-pv-brand">True Site Sync</div><div class="tssn-pv-sub">One platform, every module</div></div><span class="tssn-live"><i></i>Live</span></div>' +
        '<div class="tssn-chips">' + MODULE_CHIPS.map(function (c) { return '<span class="tssn-chip">' + esc(c) + '</span>'; }).join('') + '</div>' +
        '<div class="tssn-pv-foot"><span>Runs offline on site</span><span class="tssn-pv-strong">Built for India</span></div>' +
        '<a class="tssn-pv-cta" href="/app.html">Start free ' + svg('<path d="M5 12h14M13 6l6 6-6 6"/>') + '</a>' +
      '</div>' +
    '</div>';

  var solutionsPanel =
    '<div class="tssn-mega tssn-mega-wide">' +
      '<div class="tssn-sol">' +
        '<div class="tssn-sol-main">' +
          '<div class="tssn-col-h">By who you are</div>' +
          '<div class="tssn-persona-grid">' + itemCol(PERSONAS) + '</div>' +
        '</div>' +
        '<div class="tssn-sol-side">' +
          '<div class="tssn-col-h">Popular cities</div>' +
          '<div class="tssn-city-grid">' +
            CITIES.map(function (c) { return '<a class="tssn-city" href="/solutions/construction-management-software-' + c[1] + '/">' + esc(c[0]) + '</a>'; }).join('') +
          '</div>' +
          '<a class="tssn-browse" href="/solutions/">Browse all solutions ' + svg('<path d="M5 12h14M13 6l6 6-6 6"/>') + '</a>' +
        '</div>' +
      '</div>' +
    '</div>';

  var resourcesPanel =
    '<div class="tssn-mega">' +
      '<div class="tssn-res-grid">' + itemCol(RESOURCES) + '</div>' +
    '</div>';

  /* ---------- nav shell ---------- */
  var caret = svg('<path d="M6 9l6 6 6-6"/>');
  var navHTML =
    '<nav class="tssn" id="tssn">' +
      '<div class="tssn-inner">' +
        '<a class="tssn-logo" href="/"><img src="/assets/logo.png" alt="True Site Sync" onerror="this.style.display=\'none\'"><span>True Site Sync</span></a>' +
        '<button class="tssn-burger" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>' +
        '<div class="tssn-menu">' +
          '<div class="tssn-drop" data-drop="features"><button class="tssn-top">Features<span class="tssn-car">' + caret + '</span></button>' + featuresPanel + '</div>' +
          '<div class="tssn-drop" data-drop="solutions"><button class="tssn-top">Solutions<span class="tssn-car">' + caret + '</span></button>' + solutionsPanel + '</div>' +
          '<a class="tssn-top tssn-link" href="/about/">About us</a>' +
          '<a class="tssn-top tssn-link" href="/#pricing">Pricing</a>' +
          '<div class="tssn-drop" data-drop="resources"><button class="tssn-top">Resources<span class="tssn-car">' + caret + '</span></button>' + resourcesPanel + '</div>' +
          '<div class="tssn-ctas">' +
            '<a class="tssn-login" href="/app.html">Login</a>' +
            '<a class="tssn-demo" href="/demo/">Book a demo ' + svg('<path d="M5 12h14M13 6l6 6-6 6"/>') + '</a>' +
            '<a class="tssn-cta" href="/app.html">Open Web App</a>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</nav>';

  /* ---------- styles ---------- */
  var css =
    '.tssn{position:sticky;top:0;z-index:1000;background:rgba(255,255,255,.82);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);border-bottom:1px solid rgba(13,40,28,.07);font-family:"Inter",system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}' +
    '.tssn *{box-sizing:border-box}' +
    '.tssn svg{display:block}' +
    '.tssn-inner{max-width:1240px;margin:0 auto;padding:13px 32px;display:flex;align-items:center;gap:16px}' +
    '.tssn-logo{display:flex;align-items:center;gap:10px;text-decoration:none;flex:0 0 auto}' +
    '.tssn-logo img{width:30px;height:30px;object-fit:contain;border-radius:8px}' +
    '.tssn-logo span{font-weight:800;font-size:17px;color:#0e1a13;letter-spacing:-.02em}' +
    '.tssn-menu{display:flex;align-items:center;gap:2px;margin-left:auto}' +
    '.tssn-top{display:inline-flex;align-items:center;gap:5px;background:none;border:0;cursor:pointer;font:inherit;font-size:14.5px;font-weight:550;color:#3a4a42;padding:9px 13px;border-radius:10px;text-decoration:none;transition:color .15s,background .15s;white-space:nowrap}' +
    '.tssn-top:hover{color:#0e1a13;background:rgba(13,40,28,.045)}' +
    '.tssn-car{display:inline-flex;width:13px;height:13px;opacity:.5;transition:transform .2s;margin-top:1px}' +
    '.tssn-car svg{width:13px;height:13px}' +
    '.tssn-drop.open .tssn-car{transform:rotate(180deg);opacity:.9}' +
    '.tssn-drop.open>.tssn-top{color:#0e1a13;background:rgba(13,40,28,.045)}' +
    '.tssn-ctas{display:flex;align-items:center;gap:8px;margin-left:10px}' +
    '.tssn-login{font-size:14.5px;font-weight:550;color:#3a4a42;text-decoration:none;padding:9px 8px;border-radius:9px}' +
    '.tssn-login:hover{color:#0e1a13}' +
    '.tssn-demo{display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:650;color:#0e1a13;text-decoration:none;padding:9px 15px;border:1px solid rgba(13,40,28,.16);border-radius:11px;transition:.15s;white-space:nowrap}' +
    '.tssn-demo svg{width:15px;height:15px;transition:transform .15s}' +
    '.tssn-demo:hover{border-color:#0e1a13;background:#0e1a13;color:#fff}' +
    '.tssn-demo:hover svg{transform:translateX(2px)}' +
    '.tssn-cta{display:inline-flex;align-items:center;background:linear-gradient(135deg,#10b981,#059669);color:#fff!important;padding:10px 18px;border-radius:11px;font-weight:700;font-size:14px;text-decoration:none;box-shadow:0 6px 18px rgba(16,185,129,.32);transition:.15s;white-space:nowrap}' +
    '.tssn-cta:hover{transform:translateY(-1px);box-shadow:0 9px 24px rgba(16,185,129,.4)}' +
    /* mega */
    '.tssn-mega{position:absolute;top:calc(100% + 14px);left:50%;transform:translateX(-50%) translateY(10px);opacity:0;visibility:hidden;pointer-events:none;background:#fff;border:1px solid rgba(13,40,28,.06);border-radius:22px;box-shadow:0 2px 4px rgba(13,40,28,.04),0 30px 80px rgba(13,40,28,.16);padding:24px 26px;transition:opacity .2s cubic-bezier(.4,0,.2,1),transform .2s cubic-bezier(.4,0,.2,1);z-index:1001}' +
    '.tssn-drop.open .tssn-mega{opacity:1;visibility:visible;pointer-events:auto;transform:translateX(-50%) translateY(0)}' +
    '.tssn-drop::after{content:"";position:absolute;top:100%;left:-20px;right:-20px;height:16px}' +
    '.tssn-mega-wide{width:min(980px,calc(100vw - 40px))}' +
    '.tssn-mega-cols{display:grid;grid-template-columns:repeat(4,1fr) 1.08fr;gap:6px 16px;align-items:start}' +
    '.tssn-col-h{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:#9aa8a1;padding:2px 8px 10px}' +
    '.tssn-item{display:flex;align-items:flex-start;gap:11px;padding:9px 8px;border-radius:12px;text-decoration:none;transition:background .14s}' +
    '.tssn-item:hover{background:#f5faf7}' +
    '.tssn-ic{flex:0 0 auto;width:38px;height:38px;display:grid;place-items:center;color:#059669;background:#f4faf7;border:1px solid #e6f2ec;border-radius:11px;transition:.14s}' +
    '.tssn-ic svg{width:20px;height:20px}' +
    '.tssn-item:hover .tssn-ic{background:#ecfdf5;border-color:#c9efdc;color:#047857}' +
    '.tssn-it-txt{display:flex;flex-direction:column;line-height:1.3;padding-top:1px}' +
    '.tssn-it-t{font-size:14px;font-weight:650;color:#101c16;letter-spacing:-.01em}' +
    '.tssn-it-d{font-size:12.5px;color:#7c8a83;margin-top:2px}' +
    /* preview */
    '.tssn-preview{background:linear-gradient(155deg,#0e1a13,#14261b);border-radius:16px;padding:18px;display:flex;flex-direction:column;color:#fff}' +
    '.tssn-pv-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px}' +
    '.tssn-pv-brand{font-weight:750;font-size:14px;letter-spacing:-.01em}' +
    '.tssn-pv-sub{font-size:11.5px;color:#9fb8ab;margin-top:3px}' +
    '.tssn-live{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;color:#6ee7b7;background:rgba(16,185,129,.14);padding:3px 9px;border-radius:100px;white-space:nowrap}' +
    '.tssn-live i{width:6px;height:6px;border-radius:50%;background:#34d399;box-shadow:0 0 0 0 rgba(52,211,153,.6);animation:tssnpulse 1.8s infinite}' +
    '@keyframes tssnpulse{0%{box-shadow:0 0 0 0 rgba(52,211,153,.5)}70%{box-shadow:0 0 0 6px rgba(52,211,153,0)}100%{box-shadow:0 0 0 0 rgba(52,211,153,0)}}' +
    '.tssn-chips{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:16px}' +
    '.tssn-chip{font-size:10.5px;font-weight:600;color:#d7e5dd;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);padding:4px 9px;border-radius:8px}' +
    '.tssn-pv-foot{display:flex;justify-content:space-between;font-size:11px;color:#9fb8ab;margin-top:auto;padding-top:4px}' +
    '.tssn-pv-strong{color:#6ee7b7;font-weight:700}' +
    '.tssn-pv-cta{margin-top:13px;display:flex;align-items:center;justify-content:center;gap:6px;background:#10b981;color:#fff;font-weight:700;font-size:13px;padding:10px;border-radius:10px;text-decoration:none;transition:.15s}' +
    '.tssn-pv-cta svg{width:15px;height:15px;transition:transform .15s}' +
    '.tssn-pv-cta:hover{background:#059669}.tssn-pv-cta:hover svg{transform:translateX(2px)}' +
    /* solutions */
    '.tssn-sol{display:grid;grid-template-columns:1fr .48fr;gap:26px}' +
    '.tssn-persona-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px}' +
    '.tssn-sol-side{border-left:1px solid #eef3f0;padding-left:26px}' +
    '.tssn-city-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px;margin-bottom:16px}' +
    '.tssn-city{font-size:13px;font-weight:600;color:#3a4a42;text-decoration:none;padding:8px 10px;border-radius:9px;transition:background .13s}' +
    '.tssn-city:hover{background:#f5faf7;color:#0e1a13}' +
    '.tssn-browse{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:#047857;text-decoration:none;padding:0 10px}' +
    '.tssn-browse svg{width:14px;height:14px;transition:transform .15s}' +
    '.tssn-browse:hover svg{transform:translateX(2px)}' +
    '.tssn-res-grid{display:grid;grid-template-columns:repeat(3,minmax(185px,1fr));gap:2px;width:min(660px,calc(100vw - 40px))}' +
    /* mobile */
    '.tssn-burger{display:none;flex-direction:column;gap:5px;background:none;border:0;cursor:pointer;padding:8px;margin-left:auto}' +
    '.tssn-burger span{width:22px;height:2px;background:#0e1a13;border-radius:2px;transition:.2s}' +
    '.tssn-burger[aria-expanded="true"] span:nth-child(1){transform:translateY(7px) rotate(45deg)}' +
    '.tssn-burger[aria-expanded="true"] span:nth-child(2){opacity:0}' +
    '.tssn-burger[aria-expanded="true"] span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}' +
    '@media(max-width:1040px){' +
      '.tssn-burger{display:flex}' +
      '.tssn-menu{position:fixed;top:0;right:0;bottom:0;width:min(380px,88vw);flex-direction:column;align-items:stretch;gap:1px;background:#fff;padding:78px 16px 28px;box-shadow:-20px 0 60px rgba(13,40,28,.2);transform:translateX(100%);transition:transform .28s cubic-bezier(.4,0,.2,1);overflow-y:auto;margin-left:0}' +
      '.tssn.open .tssn-menu{transform:translateX(0)}' +
      '.tssn-top{width:100%;justify-content:space-between;font-size:16px;padding:14px 12px;border-radius:12px}' +
      '.tssn-drop{width:100%}' +
      '.tssn-mega{position:static;transform:none;opacity:1;visibility:visible;pointer-events:auto;box-shadow:none;border:0;border-radius:0;padding:0 0 8px;width:100%!important;max-height:0;overflow:hidden;transition:max-height .28s ease}' +
      '.tssn-drop.open .tssn-mega{transform:none;max-height:1600px}' +
      '.tssn-mega-cols,.tssn-sol,.tssn-persona-grid,.tssn-city-grid,.tssn-res-grid{grid-template-columns:1fr!important;width:auto!important;display:grid}' +
      '.tssn-sol-side{border-left:0;border-top:1px solid #eef3f0;padding-left:0;padding-top:12px;margin-top:6px}' +
      '.tssn-preview{display:none}' +
      '.tssn-col-h{padding:14px 10px 4px}' +
      '.tssn-ctas{flex-direction:column;align-items:stretch;margin:14px 0 0;gap:9px}' +
      '.tssn-cta,.tssn-login,.tssn-demo{justify-content:center;text-align:center;padding:14px}' +
      '.tssn-drop::after{display:none}' +
      'body.tssn-lock{overflow:hidden}' +
    '}';

  /* ---------- mount ---------- */
  function mount() {
    var style = document.createElement('style');
    style.id = 'tssn-style';
    style.textContent = css;
    document.head.appendChild(style);

    var nav = el(navHTML);
    var existing = document.querySelector('nav:not(.tssn)');
    if (existing) existing.replaceWith(nav);
    else document.body.insertBefore(nav, document.body.firstChild);

    var isMobile = function () { return window.matchMedia('(max-width:1040px)').matches; };
    var drops = nav.querySelectorAll('.tssn-drop');

    function closeAll() { drops.forEach(function (d) { d.classList.remove('open'); }); }

    drops.forEach(function (d) {
      var btn = d.querySelector('.tssn-top');
      d.addEventListener('mouseenter', function () { if (!isMobile()) { closeAll(); d.classList.add('open'); } });
      d.addEventListener('mouseleave', function () { if (!isMobile()) d.classList.remove('open'); });
      btn.addEventListener('click', function (e) {
        if (isMobile()) { e.preventDefault(); var was = d.classList.contains('open'); closeAll(); if (!was) d.classList.add('open'); }
      });
    });

    var burger = nav.querySelector('.tssn-burger');
    function openMenu() { nav.classList.add('open'); burger.setAttribute('aria-expanded', 'true'); document.body.classList.add('tssn-lock'); }
    function closeMenu() { nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); document.body.classList.remove('tssn-lock'); closeAll(); }
    burger.addEventListener('click', function () { nav.classList.contains('open') ? closeMenu() : openMenu(); });

    document.addEventListener('click', function (e) { if (!nav.contains(e.target)) { closeAll(); closeMenu(); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeAll(); closeMenu(); } });
    window.addEventListener('resize', function () { if (!isMobile()) closeMenu(); });

    try {
      var p = location.pathname;
      if (p.indexOf('/solutions/') === 0) markActive('solutions');
      else if (p.indexOf('/features') === 0) markActive('features');
      else if (p.indexOf('/blog') === 0 || p.indexOf('/resources') === 0) markActive('resources');
    } catch (e) {}
    function markActive(name) {
      var d = nav.querySelector('.tssn-drop[data-drop="' + name + '"] .tssn-top');
      if (d) d.style.color = '#047857';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
