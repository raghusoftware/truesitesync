/**
 * businessMode.js — the active business type (Construction / Shop /
 * Manufacturing) bound to the app state. Rules and calculations live in the
 * pure, unit-tested bizCalc.js.
 */
import { state } from './state.js';
import * as C from './bizCalc.js';

export { BUSINESS_MODES, MODE_HIDDEN, stockOnHand, lowStockItems, stockValue, customerDues, salesBetween, whatsappReminderLink } from './bizCalc.js';
export const activeMode = () => C.activeMode(state);
export const isConstruction = () => C.activeMode(state) === 'construction';
export const modeAllows = (id) => C.modeAllows(id, state);
export const modeTerm = (key) => C.modeTerm(key, state);

if (typeof window !== 'undefined') {
  window.businessModeAllows = modeAllows;
  window.activeBusinessMode = activeMode;
  window.modeTerm = modeTerm;
}
