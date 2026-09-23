/* True Site Sync — shared modern navbar with mega-menu dropdowns.
   Self-contained: injects its own scoped styles (prefix .tssn-) and
   replaces any existing <nav> on the page. Include once per page:
     <script src="/js/site-nav.js" defer></script>
*/
(function () {
  if (window.__tssNavMounted) return;
  window.__tssNavMounted = true;

  /* ---------- data ---------- */
  var FEATURES = [
    { group: 'Site operations', items: [
      { ic: '👷', t: 'Attendance & labour', d: 'Punch in, gang muster, wages', h: '/features/' },
      { ic: '📦', t: 'Material & inventory', d: 'Stock, GRN, purchase orders', h: '/solutions/material-management-software-for-construction/' },
      { ic: '🚜', t: 'Equipment & fuel', d: 'Machinery logs, diesel, hours', h: '/solutions/construction-equipment-management-software/' },
      { ic: '📋', t: 'Daily progress (DPR)', d: 'Day-wise site work log', h: '/solutions/construction-daily-report-app/' },
      { ic: '✅', t: 'Quality & safety', d: 'Checklists, snags, inspections', h: '/features/' }
    ]},
    { group: 'Billing & measurement', items: [
      { ic: '📐', t: 'Measurement book', d: 'Digital MB, BBS, abstracts', h: '/solutions/measurement-book-software/' },
      { ic: '🧱', t: 'BOQ', d: 'Rate analysis, item library', h: '/solutions/boq-management-software/' },
      { ic: '🧾', t: 'RA billing', d: 'Running bills, retention, deviation', h: '/solutions/ra-bill-software/' },
      { ic: '🏷️', t: 'GST invoicing', d: 'GST bills, e-invoice ready', h: '/solutions/gst-billing-software-for-contractors/' },
      { ic: '📊', t: 'Estimation', d: 'Tender & budget estimates', h: '/solutions/construction-estimation-software-india/' }
    ]},
    { group: 'Project management', items: [
      { ic: '🗂️', t: 'Planning & tasks', d: 'Priorities, deadlines, drawings', h: '/solutions/construction-project-management-software/' },
      { ic: '📈', t: 'Site progress', d: 'Physical vs planned tracking', h: '/solutions/site-progress-tracking-software/' },
      { ic: '🏗️', t: 'Site management', d: 'Run a site end to end', h: '/solutions/site-management-software/' }
    ]},
    { group: 'Accounts & finance', items: [
      { ic: '💳', t: 'Payments', d: 'Contractor & supplier dues', h: '/features/' },
      { ic: '💰', t: 'Petty cash', d: 'Category-wise expense control', h: '/features/' },
      { ic: '🤝', t: 'Vendors & POs', d: 'Suppliers, purchase orders', h: '/solutions/contractor-management-software/' },
      { ic: '📉', t: 'Cost, profit & reports', d: 'Per-project profit, cash flow', h: '/solutions/construction-cash-flow-software/' }
    ]}
  ];

  var MODULE_CHIPS = ['Attendance','Material','Equipment','DPR','Measurement','BOQ','RA billing','GST','Payments','Petty cash','Reports','Cost & profit'];

  var PERSONAS = [
    { ic: '🏢', t: 'Builders & developers', d: 'Residential & commercial', h: '/solutions/construction-project-management-software/' },
    { ic: '🏛️', t: 'Civil contractors', d: 'Executing work for a client', h: '/solutions/ra-bill-software/' },
    { ic: '🛣️', t: 'Infra companies', d: 'Roads, bridges, utilities', h: '/solutions/construction-management-software/' },
    { ic: '🛋️', t: 'Interior & fit-out', d: 'Turnkey interiors, MEP', h: '/solutions/boq-management-software/' },
    { ic: '⚙️', t: 'EPC companies', d: 'Engineering & procurement', h: '/solutions/construction-erp-software/' },
    { ic: '📐', t: 'PMC firms', d: 'Project management consultants', h: '/solutions/site-progress-tracking-software/' },
    { ic: '🏗️', t: 'Site engineers', d: 'On the ground, on mobile', h: '/solutions/construction-app-for-site-engineers/' },
    { ic: '🔩', t: 'Sub-contractors', d: 'Electrical, plumbing, finishing', h: '/solutions/contractor-management-software/' }
  ];

  var CITIES = [
    ['Mumbai','mumbai'],['Delhi NCR','delhi-ncr'],['Bengaluru','bengaluru'],['Hyderabad','hyderabad'],
    ['Pune','pune'],['Ahmedabad','ahmedabad'],['Chennai','chennai'],['Surat','surat']
  ];

  var RESOURCES = [
    { ic: '📝', t: 'Blog', d: 'Billing, sites & software', h: '/blog/' },
    { ic: '🧭', t: 'Guides', d: 'RA bills, GST, MB, site ops', h: '/resources/' },
    { ic: '🧮', t: 'Free tools', d: 'GST & unit calculators', h: '/solutions/gst-calculator/' },
    { ic: '⚖️', t: 'Compare', d: 'vs Procore, Zoho, Excel', h: '/solutions/true-site-sync-vs-procore/' },
    { ic: '💻', t: 'Downloads', d: 'Android & Windows apps', h: '/#download' },
    { ic: 'ℹ️', t: 'About us', d: 'Who builds True Site Sync', h: '/about/' }
  ];

  /* ---------- helpers ---------- */
  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function itemCol(list) {
    return list.map(function (it) {
      return '<a class="tssn-item" href="' + it.h + '"><span class="tssn-ic">' + it.ic + '</span>' +
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
        '<div class="tssn-pv-top"><div><div class="tssn-pv-brand">True Site Sync</div><div class="tssn-pv-sub">One platform, every module</div></div><span class="tssn-live">● Live</span></div>' +
        '<div class="tssn-chips">' + MODULE_CHIPS.map(function (c) { return '<span class="tssn-chip">' + esc(c) + '</span>'; }).join('') + '</div>' +
        '<div class="tssn-pv-foot"><span>Runs offline on site</span><span class="tssn-pv-strong">Built for India</span></div>' +
        '<a class="tssn-pv-cta" href="/app.html">Start free →</a>' +
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
          '<a class="tssn-browse" href="/solutions/">Browse all solutions →</a>' +
        '</div>' +
      '</div>' +
    '</div>';

  var resourcesPanel =
    '<div class="tssn-mega">' +
      '<div class="tssn-res-grid">' + itemCol(RESOURCES) + '</div>' +
    '</div>';

  /* ---------- nav shell ---------- */
  var navHTML =
    '<nav class="tssn" id="tssn">' +
      '<div class="tssn-inner">' +
        '<a class="tssn-logo" href="/"><img src="/assets/logo.png" alt="True Site Sync" onerror="this.style.display=\'none\'"><span>True Site Sync</span></a>' +
        '<button class="tssn-burger" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>' +
        '<div class="tssn-menu">' +
          '<div class="tssn-drop" data-drop="features"><button class="tssn-top">Features<svg viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>' + featuresPanel + '</div>' +
          '<div class="tssn-drop" data-drop="solutions"><button class="tssn-top">Solutions<svg viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>' + solutionsPanel + '</div>' +
          '<a class="tssn-top tssn-link" href="/about/">About us</a>' +
          '<a class="tssn-top tssn-link" href="/#pricing">Pricing</a>' +
          '<div class="tssn-drop" data-drop="resources"><button class="tssn-top">Resources<svg viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>' + resourcesPanel + '</div>' +
          '<div class="tssn-ctas"><a class="tssn-login" href="/app.html">Login</a><a class="tssn-cta" href="/app.html">Open Web App</a></div>' +
        '</div>' +
      '</div>' +
    '</nav>';

  /* ---------- styles ---------- */
  var css =
    '.tssn{position:sticky;top:0;z-index:1000;background:rgba(255,255,255,.9);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-bottom:1px solid #e6ece8;font-family:"Inter",system-ui,sans-serif}' +
    '.tssn *{box-sizing:border-box}' +
    '.tssn-inner{max-width:1200px;margin:0 auto;padding:12px 24px;display:flex;align-items:center;gap:18px}' +
    '.tssn-logo{display:flex;align-items:center;gap:10px;text-decoration:none;flex:0 0 auto}' +
    '.tssn-logo img{width:32px;height:32px;object-fit:contain;border-radius:8px}' +
    '.tssn-logo span{font-weight:800;font-size:17px;color:#0e1a13;letter-spacing:-.01em}' +
    '.tssn-menu{display:flex;align-items:center;gap:6px;margin-left:auto}' +
    '.tssn-top{display:inline-flex;align-items:center;gap:5px;background:none;border:0;cursor:pointer;font:inherit;font-size:14.5px;font-weight:600;color:#334155;padding:9px 12px;border-radius:9px;text-decoration:none;transition:.15s}' +
    '.tssn-top:hover{color:#0e1a13;background:#f1f5f3}' +
    '.tssn-top svg{width:10px;height:6px;opacity:.6;transition:transform .2s}' +
    '.tssn-drop{position:relative}' +
    '.tssn-drop.open .tssn-top svg{transform:rotate(180deg)}' +
    '.tssn-drop.open .tssn-top{color:#0e1a13;background:#f1f5f3}' +
    '.tssn-ctas{display:flex;align-items:center;gap:10px;margin-left:8px}' +
    '.tssn-login{font-size:14.5px;font-weight:600;color:#334155;text-decoration:none;padding:9px 6px}' +
    '.tssn-login:hover{color:#0e1a13}' +
    '.tssn-cta{background:linear-gradient(135deg,#10b981,#059669);color:#fff!important;padding:10px 18px;border-radius:10px;font-weight:700;font-size:14.5px;text-decoration:none;box-shadow:0 4px 14px rgba(16,185,129,.28);transition:.15s;white-space:nowrap}' +
    '.tssn-cta:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(16,185,129,.36)}' +
    /* mega */
    '.tssn-mega{position:absolute;top:calc(100% + 12px);left:50%;transform:translateX(-50%) translateY(8px);opacity:0;visibility:hidden;pointer-events:none;background:#fff;border:1px solid #e6ece8;border-radius:18px;box-shadow:0 24px 60px rgba(13,40,28,.16);padding:20px;transition:opacity .18s ease,transform .18s ease;z-index:1001}' +
    '.tssn-drop.open .tssn-mega{opacity:1;visibility:visible;pointer-events:auto;transform:translateX(-50%) translateY(0)}' +
    '.tssn-drop::after{content:"";position:absolute;top:100%;left:0;right:0;height:14px}' +
    '.tssn-mega-wide{width:min(940px,calc(100vw - 40px))}' +
    '.tssn-mega-cols{display:grid;grid-template-columns:repeat(4,1fr) 1.1fr;gap:8px 14px}' +
    '.tssn-col-h{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#047857;padding:4px 8px 8px}' +
    '.tssn-item{display:flex;align-items:flex-start;gap:10px;padding:8px;border-radius:11px;text-decoration:none;transition:background .13s}' +
    '.tssn-item:hover{background:#f1f5f3}' +
    '.tssn-ic{flex:0 0 auto;width:34px;height:34px;display:grid;place-items:center;font-size:17px;background:#f0fdf4;border:1px solid #d9f2e5;border-radius:9px}' +
    '.tssn-it-txt{display:flex;flex-direction:column;line-height:1.25}' +
    '.tssn-it-t{font-size:14px;font-weight:700;color:#0e1a13}' +
    '.tssn-it-d{font-size:12px;color:#7c8a99;margin-top:1px}' +
    /* preview */
    '.tssn-preview{background:linear-gradient(160deg,#0e1a13,#12241a);border-radius:14px;padding:16px;display:flex;flex-direction:column;color:#fff}' +
    '.tssn-pv-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}' +
    '.tssn-pv-brand{font-weight:800;font-size:14px}' +
    '.tssn-pv-sub{font-size:11.5px;color:#9fb8ab;margin-top:2px}' +
    '.tssn-live{font-size:10px;font-weight:700;color:#6ee7b7;background:rgba(16,185,129,.15);padding:3px 8px;border-radius:100px;white-space:nowrap}' +
    '.tssn-chips{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px}' +
    '.tssn-chip{font-size:10.5px;font-weight:600;color:#d7e5dd;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);padding:4px 8px;border-radius:7px}' +
    '.tssn-pv-foot{display:flex;justify-content:space-between;font-size:11px;color:#9fb8ab;margin-top:auto;padding-top:6px}' +
    '.tssn-pv-strong{color:#6ee7b7;font-weight:700}' +
    '.tssn-pv-cta{margin-top:12px;display:block;text-align:center;background:#10b981;color:#fff;font-weight:700;font-size:13px;padding:9px;border-radius:9px;text-decoration:none}' +
    '.tssn-pv-cta:hover{background:#059669}' +
    /* solutions */
    '.tssn-sol{display:grid;grid-template-columns:1fr .5fr;gap:22px}' +
    '.tssn-persona-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px}' +
    '.tssn-sol-side{border-left:1px solid #eef2f0;padding-left:22px}' +
    '.tssn-city-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px}' +
    '.tssn-city{font-size:13px;font-weight:600;color:#334155;text-decoration:none;padding:6px 8px;border-radius:8px;transition:background .13s}' +
    '.tssn-city:hover{background:#f1f5f3;color:#0e1a13}' +
    '.tssn-browse{display:inline-block;font-size:13px;font-weight:700;color:#047857;text-decoration:none}' +
    '.tssn-browse:hover{text-decoration:underline}' +
    '.tssn-res-grid{display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));gap:6px;width:min(640px,calc(100vw - 40px))}' +
    /* mobile */
    '.tssn-burger{display:none;flex-direction:column;gap:5px;background:none;border:0;cursor:pointer;padding:8px;margin-left:auto}' +
    '.tssn-burger span{width:22px;height:2px;background:#0e1a13;border-radius:2px;transition:.2s}' +
    '.tssn-burger[aria-expanded="true"] span:nth-child(1){transform:translateY(7px) rotate(45deg)}' +
    '.tssn-burger[aria-expanded="true"] span:nth-child(2){opacity:0}' +
    '.tssn-burger[aria-expanded="true"] span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}' +
    '@media(max-width:960px){' +
      '.tssn-burger{display:flex}' +
      '.tssn-menu{position:fixed;top:0;right:0;bottom:0;width:min(360px,86vw);flex-direction:column;align-items:stretch;gap:2px;background:#fff;padding:76px 16px 24px;box-shadow:-20px 0 60px rgba(13,40,28,.2);transform:translateX(100%);transition:transform .25s ease;overflow-y:auto;margin-left:0}' +
      '.tssn.open .tssn-menu{transform:translateX(0)}' +
      '.tssn-top{width:100%;justify-content:space-between;font-size:16px;padding:13px 10px}' +
      '.tssn-drop{width:100%}' +
      '.tssn-mega{position:static;transform:none;opacity:1;visibility:visible;pointer-events:auto;box-shadow:none;border:0;border-radius:0;padding:0 0 6px;width:100%!important;max-height:0;overflow:hidden;transition:max-height .25s ease}' +
      '.tssn-drop.open .tssn-mega{transform:none;max-height:1400px}' +
      '.tssn-mega-cols,.tssn-sol,.tssn-persona-grid,.tssn-city-grid,.tssn-res-grid{grid-template-columns:1fr!important;width:auto!important;display:grid}' +
      '.tssn-sol-side{border-left:0;border-top:1px solid #eef2f0;padding-left:0;padding-top:12px;margin-top:6px}' +
      '.tssn-preview{display:none}' +
      '.tssn-col-h{padding:12px 8px 4px}' +
      '.tssn-ctas{flex-direction:column;align-items:stretch;margin:12px 0 0;gap:8px}' +
      '.tssn-cta,.tssn-login{text-align:center;padding:13px}' +
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

    var isMobile = function () { return window.matchMedia('(max-width:960px)').matches; };
    var drops = nav.querySelectorAll('.tssn-drop');

    // desktop: hover; mobile: click to expand
    drops.forEach(function (d) {
      var btn = d.querySelector('.tssn-top');
      d.addEventListener('mouseenter', function () { if (!isMobile()) { closeAll(); d.classList.add('open'); } });
      d.addEventListener('mouseleave', function () { if (!isMobile()) d.classList.remove('open'); });
      btn.addEventListener('click', function (e) {
        if (isMobile()) { e.preventDefault(); var was = d.classList.contains('open'); closeAll(); if (!was) d.classList.add('open'); }
      });
    });

    function closeAll() { drops.forEach(function (d) { d.classList.remove('open'); }); }

    document.addEventListener('click', function (e) { if (!nav.contains(e.target)) { closeAll(); closeMenu(); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeAll(); closeMenu(); } });

    // burger
    var burger = nav.querySelector('.tssn-burger');
    function openMenu() { nav.classList.add('open'); burger.setAttribute('aria-expanded', 'true'); document.body.classList.add('tssn-lock'); }
    function closeMenu() { nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); document.body.classList.remove('tssn-lock'); closeAll(); }
    burger.addEventListener('click', function () { nav.classList.contains('open') ? closeMenu() : openMenu(); });

    // reset drops when crossing breakpoint
    window.addEventListener('resize', function () { if (!isMobile()) { closeMenu(); } });

    // highlight active top-level link
    try {
      var p = location.pathname;
      if (p.indexOf('/solutions/') === 0) markActive('solutions');
      else if (p.indexOf('/features') === 0) markActive('features');
      else if (p.indexOf('/blog') === 0 || p.indexOf('/resources') === 0) markActive('resources');
    } catch (e) {}
    function markActive(name) {
      var d = nav.querySelector('.tssn-drop[data-drop="' + name + '"] .tssn-top');
      if (d) { d.style.color = '#047857'; }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
