/** @param {string} sel @returns {Element|null} */
export const $ = (sel, ctx = document) => ctx.querySelector(sel);

/** @param {string} sel @returns {NodeListOf<Element>} */
export const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

/** @param {Element} el @param {string} evt @param {Function} fn @param {object} [opts] */
export const on = (el, evt, fn, opts) => el.addEventListener(evt, fn, opts);

/** @param {string} tag @param {object} [attrs] @param {...(string|Element)} children @returns {Element} */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  for (const child of children) {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else if (child) el.appendChild(child);
  }
  return el;
}

/** @param {Function} fn - runs multiple DOM writes in a single frame */
export function batch(fn) {
  requestAnimationFrame(fn);
}
