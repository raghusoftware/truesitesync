/* True Site Sync — premium icon layer.
   Swaps emoji used as UI icons for consistent inline line-icons (Lucide-style)
   that inherit the surrounding text color and font-size. One include covers the
   whole app; dynamic re-renders are handled via a MutationObserver.
   Typographic symbols (arrows, plain check/cross) are intentionally left alone. */
(function () {
  if (window.__tssIcons) return;
  window.__tssIcons = true;

  var S = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var E = '</svg>';
  // icon name -> inner SVG
  var I = {
    box:'<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M4 7.5l8 4.5 8-4.5"/><path d="M12 12v9"/>',
    ruler:'<rect x="2.5" y="9" width="19" height="6" rx="1.6"/><path d="M6 9v2.2M10 9v3M14 9v2.2M18 9v3"/>',
    truck:'<path d="M3 6h11v9H3z"/><path d="M14 9h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.7"/><circle cx="17.3" cy="18" r="1.7"/>',
    clipboard:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a1.4 1.4 0 0 1 1.4-1.4h3.2A1.4 1.4 0 0 1 15 4"/><path d="M8.5 10h7M8.5 14h7M8.5 18h4"/>',
    receipt:'<path d="M6 3h12v18l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L6 21V3z"/><path d="M9 8h6M9 12h6"/>',
    money:'<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9v6M18 9v6"/>',
    coins:'<ellipse cx="9" cy="7" rx="5.5" ry="2.6"/><path d="M3.5 7v5c0 1.4 2.5 2.6 5.5 2.6"/><path d="M3.5 12v0"/><ellipse cx="15" cy="15" rx="5.5" ry="2.6"/><path d="M9.5 15v0M20.5 15v5c0 1.4-2.5 2.6-5.5 2.6s-5.5-1.2-5.5-2.6v-3"/>',
    bank:'<path d="M4 9l8-5 8 5"/><path d="M4 9h16"/><path d="M6 9v8M10 9v8M14 9v8M18 9v8"/><path d="M3 20h18"/>',
    chart:'<path d="M4 20h16"/><rect x="5" y="12" width="3" height="6" rx="1"/><rect x="10.5" y="8" width="3" height="10" rx="1"/><rect x="16" y="5" width="3" height="13" rx="1"/>',
    up:'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    down:'<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
    building:'<path d="M4 21V6l8-3 8 3v15"/><path d="M9 21v-4h6v4"/><path d="M8 9h.01M12 9h.01M16 9h.01M8 13h.01M16 13h.01"/>',
    factory:'<path d="M3 21V10l6 4V10l6 4V6l6 3v12z"/><path d="M7 17h.01M12 17h.01M17 17h.01"/>',
    users:'<circle cx="8" cy="9" r="3"/><path d="M2.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 6.6a3 3 0 0 1 0 5.8"/><path d="M17 13.4a5.5 5.5 0 0 1 4.5 5.6"/>',
    user:'<circle cx="12" cy="8" r="3.4"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    hardhat:'<path d="M4 16a8 8 0 0 1 16 0"/><path d="M3 16h18v2.2H3z"/><path d="M10 8.2V6a2 2 0 0 1 4 0v2.2"/>',
    wrench:'<path d="M15 6.5a3.6 3.6 0 0 0-4.8 4.6l-6.5 6.5 2.2 2.2 6.5-6.5A3.6 3.6 0 0 0 17 8.5l-2.3 2.3-1.6-.4-.4-1.6L15 6.5z"/>',
    cashout:'<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.4"/><path d="M19 3l3 3-3 3"/>',
    cart:'<circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M2.5 3h2l2.2 12.2a1.5 1.5 0 0 0 1.5 1.3h8.2a1.5 1.5 0 0 0 1.5-1.2L20.5 7H6"/>',
    printer:'<path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 17h10v4H7z"/><path d="M17.5 12.5h.01"/>',
    upload:'<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 20h16"/>',
    download:'<path d="M12 4v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    trash:'<path d="M4 7h16"/><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2"/><path d="M6 7l1 13a1.5 1.5 0 0 0 1.5 1.4h7A1.5 1.5 0 0 0 17 20L18 7"/><path d="M10 11v6M14 11v6"/>',
    edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
    lock:'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    unlock:'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-1.9"/>',
    refresh:'<path d="M20 11a8 8 0 0 0-14-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14 4.5L20 16"/><path d="M20 20v-4h-4"/>',
    calendar:'<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M8 3v4M16 3v4"/>',
    pin:'<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.6a16 16 0 0 0 6 6l1.1-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    mobile:'<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    doc:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h5"/>',
    folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2L17 7M7 17l-1.8 1.8"/>',
    card:'<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18"/><path d="M7 15h4"/>',
    wallet:'<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h13a2 2 0 0 1 2 2 2 2 0 0 1-2 2H3"/><circle cx="16" cy="12.5" r=".9"/>',
    fuel:'<path d="M4 20V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14"/><path d="M3 20h12"/><path d="M6 11h6"/><path d="M14 8l3 3v6a2 2 0 0 0 3 0v-8l-3-3"/>',
    brick:'<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 12h18M9 5v3.5M15 8.5V12M9 15.5V19M15 12v3.5M9 8.5h6"/>',
    bolt:'<path d="M13 2L4 14h7l-2 8 9-12h-7z"/>',
    fire:'<path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-1.5.6-2.7 1.3-3.6C9 10 9 11.5 10 12c.6-2.3-.5-4.2 2-9z"/>',
    globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 3.8 5.7 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3z"/>',
    bell:'<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10.5 19a1.8 1.8 0 0 0 3 0"/>',
    chat:'<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
    eye:'<path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="3"/>',
    robot:'<rect x="4" y="8" width="16" height="11" rx="2.5"/><path d="M12 4v4M8.5 13h.01M15.5 13h.01M9 17h6"/><circle cx="12" cy="4" r="1.2"/>',
    camera:'<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.2"/>',
    mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/>',
    star:'<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    idea:'<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .9 1.6h5.2c.1-.6.4-1.2.9-1.6A6 6 0 0 0 12 3z"/>',
    gift:'<rect x="3.5" y="9" width="17" height="4" rx="1"/><path d="M5 13v7h14v-7"/><path d="M12 9v11"/><path d="M12 9S10.5 4 8 5s1 4 4 4zM12 9s1.5-5 4-4-1 4-4 4z"/>',
    drop:'<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    flask:'<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 15h9"/>',
    image:'<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-4 4 3 3-2 4 3"/>',
    link:'<path d="M9 15l6-6"/><path d="M11 6l1-1a4 4 0 0 1 6 6l-1 1"/><path d="M13 18l-1 1a4 4 0 0 1-6-6l1-1"/>',
    tag:'<path d="M3 12.5V5a2 2 0 0 1 2-2h7.5L21 11.5a2 2 0 0 1 0 2.8l-6.7 6.7a2 2 0 0 1-2.8 0L3 12.5z"/><circle cx="8" cy="8" r="1.3"/>',
    clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
    home:'<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/>',
    warn:'<path d="M12 3L2.5 20h19z"/><path d="M12 10v4M12 17.5h.01"/>',
    check:'<circle cx="12" cy="12" r="9"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/>',
    close:'<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    doc2:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v4h4"/>',
    shield:'<path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z"/>',
    location:'<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    paint:'<rect x="4" y="3" width="16" height="7" rx="1.5"/><path d="M8 10v3a2 2 0 0 0 2 2h1v3.5a2 2 0 0 0 4 0V13a2 2 0 0 0-2-2H4"/>',
    save:'<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3"/><rect x="8" y="13" width="8" height="5"/>',
    pushpin:'<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/>',
    cloud:'<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.4A3.8 3.8 0 0 1 18 18z"/>'
  };

  // emoji -> icon name (colorful pictographs only; plain arrows/ticks left as text)
  var MAP = {
    '📦':'box','🗃':'box','📥':'download','📤':'upload','⬇':'download','⬆':'upload','⇪':'upload',
    '📐':'ruler','📏':'ruler','🚜':'truck','🚚':'truck','🚛':'truck',
    '📋':'clipboard','🧾':'receipt','💰':'money','💵':'money','💴':'money','🪙':'coins',
    '🏦':'bank','🏛':'bank','📊':'chart','📈':'up','📉':'down',
    '🏢':'building','🏗':'building','🏬':'building','🏭':'factory','🏠':'home',
    '👥':'users','👤':'user','🧑':'user','👷':'hardhat','🦺':'shield',
    '🔧':'wrench','🔨':'wrench','🛠':'wrench','⚙':'gear',
    '💸':'cashout','🛒':'cart','🖨':'printer','➕':'plus','🗑':'trash','✏':'edit','✎':'edit','📝':'edit',
    '🔒':'lock','🔓':'unlock','🔄':'refresh','↻':'refresh','🔁':'refresh',
    '📅':'calendar','🗓':'calendar','📍':'location','🔍':'search','📞':'phone','📱':'mobile',
    '📄':'doc','📃':'doc','📑':'doc','📁':'folder','📂':'folder','🗂':'folder','🗄':'folder',
    '💳':'card','👛':'wallet','⛽':'fuel','🛢':'fuel','🧱':'brick','⚡':'bolt','🔥':'fire',
    '🌐':'globe','🔔':'bell','🔕':'bell','💬':'chat','👁':'eye','🤖':'robot',
    '📷':'camera','🎬':'camera','🎙':'mic','🎤':'mic','⭐':'star','🌟':'star','💡':'idea','🎉':'gift','🎊':'gift',
    '💧':'drop','🚰':'drop','🧪':'flask','⚗':'flask','🖼':'image','🔗':'link','🏷':'tag',
    '🕒':'clock','🕓':'clock','⏱':'clock','⏰':'clock','⚠':'warn','🚨':'warn',
    '✅':'check','❌':'close','🛡':'shield','🎨':'paint','💾':'save','📌':'pushpin','☁':'cloud','📡':'globe','🛰':'globe',
    '📕':'doc','📘':'doc','📗':'doc','📙':'doc','📚':'doc','📖':'doc','🗜':'folder','🧩':'gear','🔩':'wrench'
  };

  var keys = Object.keys(MAP).filter(function (k) { return I[MAP[k]]; });
  // build match regex (escape + optional variation selector / ZWJ trailing)
  function esc(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
  var RE = new RegExp('(' + keys.map(esc).join('|') + ')\\uFE0F?', 'g');
  var HAS = new RegExp('(' + keys.map(esc).join('|') + ')');

  function iconSpan(emoji){
    var name = MAP[emoji];
    var span = document.createElement('span');
    span.className = 'tss-ic';
    span.setAttribute('data-emoji', emoji);
    span.innerHTML = S + I[name] + E;
    return span;
  }

  var SKIP = { SCRIPT:1, STYLE:1, TEXTAREA:1, INPUT:1, SELECT:1, OPTION:1, NOSCRIPT:1, SVG:1 };

  function replaceInText(node){
    var text = node.nodeValue;
    if (!text || !HAS.test(text)) return;
    var frag = document.createDocumentFragment();
    var last = 0, m; RE.lastIndex = 0;
    while ((m = RE.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      frag.appendChild(iconSpan(m[1]));
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }

  function walk(root){
    if (!root) return;
    if (root.nodeType === 3) { replaceInText(root); return; }
    if (root.nodeType !== 1) return;
    if (SKIP[root.nodeName]) return;
    if (root.isContentEditable) return;
    if (root.classList && root.classList.contains('tss-ic')) return;
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p || SKIP[p.nodeName] || (p.classList && p.classList.contains('tss-ic')) || (p.closest && p.closest('[contenteditable="true"],[contenteditable=""]'))) return NodeFilter.FILTER_REJECT;
        return HAS.test(n.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var list = [], n;
    while ((n = tw.nextNode())) list.push(n);
    list.forEach(replaceInText);
  }

  // styles
  var st = document.createElement('style');
  st.textContent = '.tss-ic{display:inline-flex;align-items:center;justify-content:center;width:1em;height:1em;line-height:1;vertical-align:-.14em;flex:0 0 auto}.tss-ic svg{width:1em;height:1em;display:block}';
  (document.head || document.documentElement).appendChild(st);

  // batched observer for dynamic renders
  var queue = [], scheduled = false;
  function flush(){ scheduled = false; var q = queue; queue = []; q.forEach(walk); }
  function schedule(node){ queue.push(node); if (!scheduled){ scheduled = true; (window.requestAnimationFrame || setTimeout)(flush, 16); } }

  function start(){
    walk(document.body);
    try {
      var mo = new MutationObserver(function (muts){
        for (var i = 0; i < muts.length; i++){
          var a = muts[i].addedNodes;
          for (var j = 0; j < a.length; j++){ if (a[j].nodeType === 1 || a[j].nodeType === 3) schedule(a[j]); }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
