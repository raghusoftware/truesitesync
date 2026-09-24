/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Pure formatting helpers
 * ═══════════════════════════════════════════════════════════
 * Zero dependencies, no DOM, no app state. Everything here is a
 * pure function so it can be unit-tested in Node directly.
 * Currency-symbol-aware wrappers live in utils.js and call these.
 * ═══════════════════════════════════════════════════════════
 */

/** Format a number with a fixed number of decimals (no currency symbol). */
export function formatNumber(n, decimals = 0, locale = 'en-IN') {
  return (Number(n) || 0).toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/** Format a number with exactly 2 decimals (no currency symbol). */
export function formatNumber2(n, locale = 'en-IN') {
  return (Number(n) || 0).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Per-currency wording: the major/minor unit names and which numbering
 * system to spell in. India (INR) uses lakh/crore; everyone else uses the
 * international short scale (thousand/million/billion). Pure data — no state.
 */
export const CURRENCY_WORDS = {
  INR: { major: 'Rupees', minor: 'Paise', system: 'indian' },
  USD: { major: 'Dollars', minor: 'Cents', system: 'western' },
  AED: { major: 'Dirhams', minor: 'Fils', system: 'western' },
  SAR: { major: 'Riyals', minor: 'Halalas', system: 'western' },
  GBP: { major: 'Pounds', minor: 'Pence', system: 'western' },
  CAD: { major: 'Dollars', minor: 'Cents', system: 'western' },
};

/**
 * Convert a number to words for the given currency code.
 *   amountToWords(123450.6, 'INR') -> "Rupees One Lakh Twenty Three Thousand
 *                                      Four Hundred Fifty and Sixty Paise Only"
 *   amountToWords(1234567.5, 'AED') -> "Dirhams One Million Two Hundred Thirty
 *                                       Four Thousand Five Hundred Sixty Seven
 *                                       and Fifty Fils Only"
 * Unknown codes fall back to international wording with the code as the unit.
 */
export function amountToWords(amount, code = 'INR') {
  const cfg = CURRENCY_WORDS[String(code || 'INR').toUpperCase()]
    || { major: String(code || '').toUpperCase() || 'Units', minor: '', system: 'western' };
  const num = Math.abs(Math.round((Number(amount) || 0) * 100) / 100);
  const major = Math.floor(num);
  const minor = Math.round((num - major) * 100);
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const twoDigit = (n) => n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  const threeDigit = (n) => (n >= 100 ? ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + twoDigit(n % 100) : '') : twoDigit(n));
  const inWordsIndian = (n) => {
    if (n === 0) return 'Zero';
    let str = '';
    const crore = Math.floor(n / 10000000); n %= 10000000;
    const lakh = Math.floor(n / 100000); n %= 100000;
    const thousand = Math.floor(n / 1000); n %= 1000;
    if (crore) str += threeDigit(crore) + ' Crore ';
    if (lakh) str += twoDigit(lakh) + ' Lakh ';
    if (thousand) str += twoDigit(thousand) + ' Thousand ';
    if (n) str += threeDigit(n) + ' ';
    return str.trim();
  };
  const inWordsWestern = (n) => {
    if (n === 0) return 'Zero';
    let str = '';
    const billion = Math.floor(n / 1000000000); n %= 1000000000;
    const million = Math.floor(n / 1000000); n %= 1000000;
    const thousand = Math.floor(n / 1000); n %= 1000;
    if (billion) str += threeDigit(billion) + ' Billion ';
    if (million) str += threeDigit(million) + ' Million ';
    if (thousand) str += threeDigit(thousand) + ' Thousand ';
    if (n) str += threeDigit(n) + ' ';
    return str.trim();
  };
  const inWords = cfg.system === 'indian' ? inWordsIndian : inWordsWestern;
  let result = (cfg.major ? cfg.major + ' ' : '') + inWords(major);
  if (minor > 0) result += ' and ' + twoDigit(minor) + (cfg.minor ? ' ' + cfg.minor : '');
  return result + ' Only';
}

/**
 * Back-compat: Indian-rupee wording. Existing PDF exporters import this name.
 * @deprecated prefer the currency-aware amountToWordsCur() wrapper in utils.js
 */
export function amountToWordsINR(amount) {
  return amountToWords(amount, 'INR');
}
