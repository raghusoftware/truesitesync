const listeners = new Map();

/** @param {string} event @param {Function} fn */
export function subscribe(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}

/** @param {string} event @param {*} [data] */
export function publish(event, data) {
  const fns = listeners.get(event);
  if (fns) fns.forEach(fn => fn(data));
}

export const EVENTS = {
  DATA_CHANGED: 'data:changed',
  VIEW_CHANGED: 'view:changed',
  TOAST: 'ui:toast',
  DASHBOARD_UPDATE: 'dashboard:update'
};
