/*
 * Website analytics (public pages only — not loaded in the app).
 *
 * Paste your IDs below and deploy. Until then this file does nothing.
 *   GA4_ID     — Google Analytics 4 → Admin → Data streams → Measurement ID (G-XXXXXXXXXX)
 *   CLARITY_ID — Microsoft Clarity → Settings → Overview → Project ID (e.g. abcd1234ef)
 *
 * Events sent (mark generate_lead and trial_click as key events in GA4):
 *   trial_click        "Start free trial" / "Open Web App" / "Login" links to /app.html
 *   demo_click         links to /demo/
 *   generate_lead      demo form submitted (sent from demo/index.html)
 *   play_store_click   links to the Google Play listing
 *   app_download_click Windows / Android download buttons on the homepage
 *   calculator_use     first change to any calculator on a page
 */
(function () {
  var GA4_ID = '';
  var CLARITY_ID = '';

  var enabled = !!(GA4_ID || CLARITY_ID);
  window.tssTrack = function (name, params) {
    if (window.gtag && GA4_ID) window.gtag('event', name, params || {});
    if (window.clarity && CLARITY_ID) window.clarity('event', name);
  };
  if (!enabled) return;

  if (GA4_ID) {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA4_ID);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA4_ID);
  }

  if (CLARITY_ID) {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', CLARITY_ID);
  }

  function label(a) { return (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60); }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var where = { page: location.pathname, link_text: label(a) };
    if (a.classList.contains('dl-btn')) {
      window.tssTrack('app_download_click', Object.assign({ platform: a.classList.contains('windows') ? 'windows' : 'other' }, where));
    } else if (href.indexOf('play.google.com') !== -1) {
      window.tssTrack('play_store_click', where);
    } else if (/(^|\/)app\.html/.test(href)) {
      window.tssTrack('trial_click', where);
    } else if (/(^|\/)demo\/?$/.test(href) || href.indexOf('/demo/') === 0) {
      window.tssTrack('demo_click', where);
    }
  }, true);

  var calcSent = false;
  document.addEventListener('input', function (e) {
    if (calcSent || !e.target.closest || !e.target.closest('.calc')) return;
    calcSent = true;
    window.tssTrack('calculator_use', { page: location.pathname });
  }, true);
})();
