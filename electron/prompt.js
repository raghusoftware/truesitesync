// HTML for the desktop prompt window (Electron has no window.prompt).
// Pure function so it can be unit-tested without Electron.

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildPromptHtml(id, message, defaultValue) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>True Site Sync</title>
<style>
*{box-sizing:border-box}
body{margin:0;padding:18px 20px 16px;font:14px/1.5 "Segoe UI",Inter,system-ui,sans-serif;color:#1c1917;background:#fff}
.msg{white-space:pre-wrap;word-break:break-word;margin:0 0 12px;max-height:340px;overflow:auto}
input{width:100%;padding:9px 11px;border:1px solid #d6d3d1;border-radius:8px;font:inherit;outline:none}
input:focus{border-color:#d6402c;box-shadow:0 0 0 3px rgba(214,64,44,.15)}
.row{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
button{padding:8px 18px;border-radius:8px;border:1px solid #d6d3d1;background:#fff;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer}
button.ok{background:#d6402c;border-color:#d6402c;color:#fff}
</style></head><body>
<p class="msg">${esc(message)}</p>
<input id="v" value="${esc(defaultValue)}" autocomplete="off">
<div class="row"><button id="c" type="button">Cancel</button><button id="o" class="ok" type="button">OK</button></div>
<script>
(function(){
  var id=${Number(id) || 0}, v=document.getElementById('v'), sent=false;
  function done(val){ if(sent) return; sent=true; window.tssPrompt.done(id, val); }
  document.getElementById('o').onclick=function(){ done(v.value); };
  document.getElementById('c').onclick=function(){ done(null); };
  document.addEventListener('keydown',function(e){
    if(e.key==='Enter'){ e.preventDefault(); done(v.value); }
    else if(e.key==='Escape'){ e.preventDefault(); done(null); }
  });
  v.focus(); v.select();
})();
</script></body></html>`;
}

module.exports = { buildPromptHtml, esc };
