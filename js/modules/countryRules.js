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
}
