/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Units of Measure + per-material conversions
 * ───────────────────────────────────────────────────────────
 * • state.units    = the company-wide list of allowed unit names (managed in
 *   Settings → Units). Every material's base/alt unit is picked from this list.
 * • material.unit  = the BASE unit stock is tracked in.
 * • material.altUnits = [{ unit, factor }] where `factor` = how many BASE units
 *   are in ONE of this alt unit. e.g. base 'Kg', alt {unit:'Tonne', factor:1000}
 *   means 1 Tonne = 1000 Kg. Users enter a purchase/issue in EITHER unit; we
 *   always convert to the base unit before storing, so all existing stock math
 *   (stock levels, recipe consumption, reports) is unchanged.
 * ═══════════════════════════════════════════════════════════
 */
import { state, saveAllData } from './state.js';
import { showToast } from './utils.js';

export const DEFAULT_UNITS = ['Nos', 'Kg', 'Tonne', 'Bag', 'Ltr', 'M3', 'M2', 'RMT', 'MT', 'Cft', 'Sqft', 'Sqm', 'Quintal', 'Piece', 'Set', 'Roll', 'Box', 'Drum', 'Coil', 'Meter', 'Inch', 'Foot'];

/** The company unit list (seed defaults if empty). */
export function getUnits() {
  if (!Array.isArray(state.units) || !state.units.length) state.units = [...DEFAULT_UNITS];
  return state.units;
}

/** Add a unit to the master. Returns true if newly added. */
export function addUnit(name) {
  name = String(name == null ? '' : name).trim();
  if (!name) return false;
  getUnits();
  if (state.units.some(u => u.toLowerCase() === name.toLowerCase())) return false;
  state.units.push(name);
  saveAllData();
  return true;
}

/** Remove a unit from the master (does not touch materials already using it). */
export function deleteUnit(name) {
  state.units = getUnits().filter(u => u !== name);
  saveAllData();
}

/** <option> list of the whole unit master, `selected` pre-selected. */
export function unitMasterOptions(selected) {
  return getUnits().map(u => `<option value="${u}" ${selected === u ? 'selected' : ''}>${u}</option>`).join('');
}

/** Every unit a material can be ENTERED in: base (factor 1) first, then its alts. */
export function materialUnits(material) {
  if (!material) return [];
  const out = [{ unit: material.unit || '', factor: 1, base: true }];
  (material.altUnits || []).forEach(a => {
    const f = parseFloat(a && a.factor);
    if (a && a.unit && isFinite(f) && f > 0) out.push({ unit: a.unit, factor: f });
  });
  return out;
}

/** Convert a qty typed in `fromUnit` into the material's BASE unit. */
export function toBaseQty(material, qty, fromUnit) {
  const q = parseFloat(qty) || 0;
  if (!material || !fromUnit || fromUnit === material.unit) return q;
  const a = (material.altUnits || []).find(x => x.unit === fromUnit);
  const f = a ? parseFloat(a.factor) : NaN;
  return isFinite(f) && f > 0 ? q * f : q;
}

/** <option> list of a material's entry units for a qty unit-picker. */
export function materialUnitOptions(material, selected) {
  return materialUnits(material).map(u =>
    `<option value="${u.unit}" ${selected === u.unit ? 'selected' : ''}>${u.unit}${u.base ? '' : ' (1 = ' + u.factor + ' ' + (material.unit || '') + ')'}</option>`
  ).join('');
}

if (typeof window !== 'undefined') {
  window.getUnits = getUnits;
  window.unitMasterOptions = unitMasterOptions;
  window.materialUnits = materialUnits;
  window.toBaseQty = toBaseQty;
  window.materialUnitOptions = materialUnitOptions;
  window._addUnitMaster = function (inputId) {
    const el = inputId ? document.getElementById(inputId) : null;
    const name = el ? el.value : prompt('New unit name (e.g. Tonne, Bundle):', '');
    if (addUnit(name)) {
      if (el) el.value = '';
      showToast('Unit added', 'success');
      window.renderUnitsTab && window.renderUnitsTab();
    } else if (name) {
      showToast('That unit already exists', 'info');
    }
  };
  window._deleteUnitMaster = function (name) {
    deleteUnit(name);
    window.renderUnitsTab && window.renderUnitsTab();
  };
}
