/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — COUNTRY RULES LAYER
 * ═══════════════════════════════════════════════════════════
 * The Global Core Engine (Project / Finance / Field) stays the same
 * everywhere; this layer adapts wording, tax and enabled features to the
 * user's country. India is the default so existing users see no change.
 *
 * A country pack defines:
 *   currency   — { symbol, code, locale, decimals }
 *   terms      — billing-doc name, tax label, tax-id label, retention word…
 *   features   — booleans the UI reads to show/hide country-specific tools
 * ═══════════════════════════════════════════════════════════
 */
import { state } from './state.js';

export const COUNTRY_RULES = {
  IN: {
    name: 'India', region: 'IN', flag: '🇮🇳',
    currency: { symbol: '₹', code: 'INR', locale: 'en-IN', decimals: 2 },
    terms: { billingDoc: 'RA Bill', billingDocShort: 'RA', tax: 'GST', taxLong: 'GST', taxId: 'GSTIN', wht: 'TDS', retention: 'Retention', measurement: 'Measurement', abstract: 'Abstract', boq: 'BOQ' },
    features: { measurement: true, abstract: true, boq: true, raBill: true, gst: true, retention: true, sov: false, payApp: false, lienWaiver: false, eInvoice: true },
  },
  US: {
    name: 'United States', region: 'US', flag: '🇺🇸',
    currency: { symbol: '$', code: 'USD', locale: 'en-US', decimals: 2 },
    terms: { billingDoc: 'Pay Application', billingDocShort: 'Pay App', tax: 'Sales Tax', taxLong: 'Sales Tax', taxId: 'Tax ID / EIN', wht: 'Backup WH', retention: 'Retainage', measurement: 'Quantities', abstract: 'Schedule of Values', boq: 'SOV' },
    features: { measurement: false, abstract: false, boq: false, raBill: false, gst: false, retention: true, sov: true, payApp: true, lienWaiver: true, eInvoice: false },
  },
  AE: {
    name: 'United Arab Emirates', region: 'GCC', flag: '🇦🇪',
    currency: { symbol: 'AED ', code: 'AED', locale: 'en-AE', decimals: 2 },
    terms: { billingDoc: 'Payment Certificate', billingDocShort: 'IPC', tax: 'VAT', taxLong: 'VAT', taxId: 'TRN', wht: 'WHT', retention: 'Retention', measurement: 'Measurement', abstract: 'Valuation', boq: 'BOQ' },
    features: { measurement: true, abstract: true, boq: true, raBill: true, gst: true, retention: true, sov: false, payApp: false, lienWaiver: false, eInvoice: true },
  },
  SA: {
    name: 'Saudi Arabia', region: 'GCC', flag: '🇸🇦',
    currency: { symbol: 'SAR ', code: 'SAR', locale: 'en-SA', decimals: 2 },
    terms: { billingDoc: 'Payment Certificate', billingDocShort: 'IPC', tax: 'VAT', taxLong: 'VAT', taxId: 'VAT No. (TRN)', wht: 'WHT', retention: 'Retention', measurement: 'Measurement', abstract: 'Valuation', boq: 'BOQ' },
    features: { measurement: true, abstract: true, boq: true, raBill: true, gst: true, retention: true, sov: false, payApp: false, lienWaiver: false, eInvoice: true },
  },
  GB: {
    name: 'United Kingdom', region: 'UK', flag: '🇬🇧',
    currency: { symbol: '£', code: 'GBP', locale: 'en-GB', decimals: 2 },
    terms: { billingDoc: 'Interim Payment Certificate', billingDocShort: 'IPC', tax: 'VAT', taxLong: 'VAT', taxId: 'VAT No.', wht: 'CIS', retention: 'Retention', measurement: 'Measurement', abstract: 'Valuation', boq: 'BOQ' },
    features: { measurement: true, abstract: true, boq: true, raBill: true, gst: true, retention: true, sov: false, payApp: false, lienWaiver: false, eInvoice: false },
  },
  CA: {
    name: 'Canada', region: 'CA', flag: '🇨🇦',
    currency: { symbol: 'C$', code: 'CAD', locale: 'en-CA', decimals: 2 },
    terms: { billingDoc: 'Progress Claim', billingDocShort: 'PC', tax: 'GST/HST', taxLong: 'GST/HST', taxId: 'GST/HST No.', wht: 'WHT', retention: 'Holdback', measurement: 'Quantities', abstract: 'Schedule of Values', boq: 'SOV' },
    features: { measurement: false, abstract: false, boq: false, raBill: false, gst: true, retention: true, sov: true, payApp: true, lienWaiver: false, eInvoice: false },
  },
  INTL: {
    name: 'International', region: 'INTL', flag: '🌐',
    currency: { symbol: '$', code: 'USD', locale: 'en-US', decimals: 2 },
    terms: { billingDoc: 'Progress Claim', billingDocShort: 'PC', tax: 'Tax', taxLong: 'Sales Tax', taxId: 'Tax ID', wht: 'WHT', retention: 'Retention', measurement: 'Measurement', abstract: 'Valuation', boq: 'BOQ' },
    features: { measurement: true, abstract: true, boq: true, raBill: true, gst: true, retention: true, sov: false, payApp: false, lienWaiver: false, eInvoice: false },
  },
};

/**
 * Tax engine config per country. Drives the sale-invoice tax UI + math:
 *   mode        'gst'   — India: per-line CGST+SGST (intra) or IGST (inter)
 *               'vat'   — GCC/UK/INTL: a single VAT line per item
 *               'sales' — US/CA: a single sales-tax / GST-HST line
 *   idLabel     what the customer/supplier tax number is called
 *   rates       the rate slabs offered in the dropdown (percent)
 *   defaultRate the rate pre-selected on a new line
 *   types       the tax-type options in the per-line selector {v,l}
 *   defaultType the type pre-selected on a new line
 *   singleLabel label for the single (non-split) tax row / column
 */
export const TAX_RULES = {
  IN:   { mode: 'gst',   idLabel: 'GSTIN', rates: [0, 0.25, 3, 5, 12, 18, 28], defaultRate: 18,
          types: [{ v: 'CGST_SGST', l: 'CGST+SGST' }, { v: 'IGST', l: 'IGST' }, { v: 'NONE', l: 'None' }],
          defaultType: 'CGST_SGST', singleLabel: 'IGST' },
  AE:   { mode: 'vat',   idLabel: 'TRN', rates: [0, 5], defaultRate: 5,
          types: [{ v: 'VAT', l: 'VAT' }, { v: 'NONE', l: 'None' }], defaultType: 'VAT', singleLabel: 'VAT' },
  SA:   { mode: 'vat',   idLabel: 'VAT No. (TRN)', rates: [0, 15], defaultRate: 15,
          types: [{ v: 'VAT', l: 'VAT' }, { v: 'NONE', l: 'None' }], defaultType: 'VAT', singleLabel: 'VAT' },
  GB:   { mode: 'vat',   idLabel: 'VAT No.', rates: [0, 5, 20], defaultRate: 20,
          types: [{ v: 'VAT', l: 'VAT' }, { v: 'NONE', l: 'None' }], defaultType: 'VAT', singleLabel: 'VAT' },
  US:   { mode: 'sales', idLabel: 'Tax ID / EIN', rates: [0], defaultRate: 0,
          types: [{ v: 'TAX', l: 'Sales Tax' }, { v: 'NONE', l: 'None' }], defaultType: 'TAX', singleLabel: 'Sales Tax' },
  CA:   { mode: 'sales', idLabel: 'GST/HST No.', rates: [0, 5, 13, 15], defaultRate: 5,
          types: [{ v: 'TAX', l: 'GST/HST' }, { v: 'NONE', l: 'None' }], defaultType: 'TAX', singleLabel: 'GST/HST' },
  INTL: { mode: 'vat',   idLabel: 'Tax ID', rates: [0, 5, 10, 15, 20], defaultRate: 0,
          types: [{ v: 'VAT', l: 'Tax' }, { v: 'NONE', l: 'None' }], defaultType: 'VAT', singleLabel: 'Tax' },
};

/** Tax config for the active country (falls back to India). */
export function getTaxConfig(code) { return TAX_RULES[code || activeCountry()] || TAX_RULES.IN; }

/** Active country code from settings (default India). */
export function activeCountry() {
  const cs = state.currencySettings || {};
  if (cs.country && COUNTRY_RULES[cs.country]) return cs.country;
  // fall back: map legacy region → a country
  const byRegion = { IN: 'IN', GCC: 'AE', UK: 'GB', US: 'US', CA: 'CA', INTL: 'INTL' };
  return byRegion[cs.region] || 'IN';
}
export function getCountryRule(code) { return COUNTRY_RULES[code || activeCountry()] || COUNTRY_RULES.IN; }

/** Region-aware label. Back-compat: 'raBill' maps to the country's billing doc. */
export function getTerm(key) {
  const t = getCountryRule().terms;
  if (key === 'raBill') return t.billingDoc;
  if (key === 'raBillShort') return t.billingDocShort;
  return t[key] || COUNTRY_RULES.IN.terms[key] || key;
}
export function getRegion() { return getCountryRule().region; }
/** Feature flag for the active country, e.g. feat('sov'), feat('measurement'). */
export function feat(flag) { const f = getCountryRule().features || {}; return !!f[flag]; }

if (typeof window !== 'undefined') {
  window.getTerm = getTerm;
  window.getRegion = getRegion;
  window.getCountryRule = getCountryRule;
  window.activeCountry = activeCountry;
  window.feat = feat;
  window.getTaxConfig = getTaxConfig;
}
