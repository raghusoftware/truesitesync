/**
 * touchDnd.js — makes every native HTML5 drag-and-drop in the app work with a
 * finger. Phones never fire dragstart/dragover/drop from touch, so the Schedule
 * Builder board, the Planning board etc. were mouse-only.
 *
 * How it works (no changes needed in the screens themselves):
 *   • long-press (≈220 ms) on any [draggable="true"] element picks it up — a short
 *     swipe still scrolls the page as normal;
 *   • a lifted copy follows the finger; the drop zone under it is found by walking
 *     up to the nearest element with an ondragover/ondrop handler;
 *   • the element's own inline handlers (ondragstart, ondragover, ondragleave,
 *     ondrop, ondragend) are called with a small event object that has the same
 *     dataTransfer / preventDefault / currentTarget the screens already use;
 *   • the list auto-scrolls when the finger nears the top or bottom edge, and the
 *     phone gives a short vibration on pick-up and drop.
 * Mouse dragging is untouched — the browser's own drag-and-drop keeps working.
 */

const HOLD_MS = 220;          // press-and-hold before a drag starts
const MOVE_TOLERANCE = 10;    // px the finger may wander during the hold
const EDGE = 70;              // px from the scroller edge where auto-scroll starts

let _press = null;            // { el, x, y, timer, pointerId }
let _drag = null;             // { el, ghost, dx, dy, over, data, x, y, raf, armed }
let _quietUntil = 0;          // swallow the click a lifted finger fires right after a drop

function buzz(ms) { try { navigator.vibrate?.(ms); } catch { /* not supported */ } }

/** A minimal DragEvent stand-in carrying what the existing handlers read. */
function fakeEvent(type, currentTarget, relatedTarget) {
  const dt = _drag ? _drag.data : null;
  return {
    type, currentTarget, target: currentTarget, relatedTarget: relatedTarget || null,
    preventDefault() {}, stopPropagation() {},
    clientX: _drag ? _drag.x : 0, clientY: _drag ? _drag.y : 0,
    dataTransfer: dt,
  };
}
function makeDataTransfer() {
  const store = {};
  return {
    effectAllowed: 'all', dropEffect: 'move', types: [],
    setData(k, v) { store[k] = String(v); if (!this.types.includes(k)) this.types.push(k); },
    getData(k) { return store[k] ?? ''; },
    clearData() { Object.keys(store).forEach(k => delete store[k]); this.types = []; },
    setDragImage() {},
  };
}

/** Nearest ancestor (or self) that accepts drops. */
function dropZoneAt(x, y) {
  const el = document.elementFromPoint(x, y);
  let n = el;
  while (n && n !== document.body) {
    if (typeof n.ondragover === 'function' || typeof n.ondrop === 'function') return n;
    n = n.parentElement;
  }
  return null;
}

/** Nearest scrollable ancestor of the element under the finger (for auto-scroll). */
function scrollerAt(x, y) {
  let n = document.elementFromPoint(x, y);
  while (n && n !== document.documentElement) {
    const cs = getComputedStyle(n);
    if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 2) return n;
    n = n.parentElement;
  }
  return document.scrollingElement;
}

function startDrag() {
  const el = _press.el;
  const r = el.getBoundingClientRect();
  const ghost = el.cloneNode(true);
  ghost.removeAttribute('id');
  ghost.classList.add('tdnd-ghost');
  Object.assign(ghost.style, { width: r.width + 'px', left: r.left + 'px', top: r.top + 'px' });
  document.body.appendChild(ghost);
  _drag = { el, ghost, dx: _press.x - r.left, dy: _press.y - r.top, over: null, data: makeDataTransfer(), x: _press.x, y: _press.y, raf: 0, armed: false };
  el.classList.add('tdnd-source');
  document.documentElement.classList.add('tdnd-active');
  buzz(15);
  try { el.ondragstart && el.ondragstart(fakeEvent('dragstart', el)); } catch (e) { console.warn('[touchDnd] dragstart', e); }
  tick();
}

function moveTo(x, y) {
  _drag.x = x; _drag.y = y;
  _drag.ghost.style.transform = `translate(${x - _drag.dx - parseFloat(_drag.ghost.style.left)}px, ${y - _drag.dy - parseFloat(_drag.ghost.style.top)}px) scale(1.03)`;
  const zone = dropZoneAt(x, y);
  if (zone !== _drag.over) {
    const prev = _drag.over;
    if (prev) { try { prev.ondragleave && prev.ondragleave(fakeEvent('dragleave', prev, zone)); } catch {} prev.classList.remove('tdnd-over'); }
    _drag.over = zone;
    if (zone) zone.classList.add('tdnd-over');
  }
  if (zone) { try { zone.ondragover && zone.ondragover(fakeEvent('dragover', zone)); } catch {} }
}

/** Auto-scroll while the finger is held near the top/bottom of the scroller. */
function tick() {
  if (!_drag) return;
  const sc = scrollerAt(_drag.x, _drag.y);
  if (sc) {
    const box = sc === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : sc.getBoundingClientRect();
    const top = Math.max(box.top, 0), bottom = Math.min(box.bottom, window.innerHeight);
    // A drag picked up inside an edge band (e.g. from a tray docked at the bottom)
    // must not scroll until the finger has left that band once.
    const inBand = _drag.y < top + EDGE || _drag.y > bottom - EDGE;
    if (!inBand) _drag.armed = true;
    let dy = 0;
    if (_drag.y < top + EDGE) dy = -Math.ceil((top + EDGE - _drag.y) / 6);
    else if (_drag.y > bottom - EDGE) dy = Math.ceil((_drag.y - (bottom - EDGE)) / 6);
    if (dy && _drag.armed) { sc.scrollTop += dy; moveTo(_drag.x, _drag.y); }
  }
  _drag.raf = requestAnimationFrame(tick);
}

function endDrag(drop) {
  const d = _drag; _drag = null;
  cancelAnimationFrame(d.raf);
  const zone = drop ? d.over : null;
  if (d.over) d.over.classList.remove('tdnd-over');
  _drag = d;                                   // handlers below may read dataTransfer
  if (zone) { try { zone.ondrop && zone.ondrop(fakeEvent('drop', zone)); buzz(10); } catch (e) { console.warn('[touchDnd] drop', e); } }
  try { d.el.ondragend && d.el.ondragend(fakeEvent('dragend', d.el)); } catch {}
  _drag = null;
  _quietUntil = Date.now() + 500;
  d.ghost.remove();
  d.el.classList.remove('tdnd-source');
  document.documentElement.classList.remove('tdnd-active');
}

function cancelPress() { if (_press) { clearTimeout(_press.timer); _press = null; } }

function onPointerDown(e) {
  if (e.pointerType === 'mouse' || _drag) return;        // mouse keeps native DnD
  const el = e.target.closest && e.target.closest('[draggable="true"]');
  if (!el || e.target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
  cancelPress();
  _press = { el, x: e.clientX, y: e.clientY, pointerId: e.pointerId, timer: setTimeout(() => { if (_press) { startDrag(); _press = null; } }, HOLD_MS) };
  el.classList.add('tdnd-press');
  setTimeout(() => el.classList.remove('tdnd-press'), HOLD_MS + 80);
}
function onPointerMove(e) {
  if (_drag) { moveTo(e.clientX, e.clientY); return; }
  if (_press && Math.hypot(e.clientX - _press.x, e.clientY - _press.y) > MOVE_TOLERANCE) cancelPress();   // it's a scroll
}
function onPointerUp() { if (_drag) endDrag(true); cancelPress(); }
function onPointerCancel() { if (_drag) endDrag(false); cancelPress(); }

// While dragging, the finger must not scroll the page (needs a non-passive listener).
function onTouchMove(e) { if (_drag) e.preventDefault(); }
// Stop the long-press context menu / text selection from hijacking a pick-up.
function onClick(e) { if (Date.now() < _quietUntil) { e.preventDefault(); e.stopPropagation(); } }
function onContextMenu(e) { if (_drag || (_press && e.target.closest('[draggable="true"]'))) e.preventDefault(); }

if (typeof window !== 'undefined' && !window.__touchDnd) {
  window.__touchDnd = true;
  document.addEventListener('pointerdown', onPointerDown, { passive: true });
  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerup', onPointerUp, { passive: true });
  document.addEventListener('pointercancel', onPointerCancel, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('click', onClick, true);
}
