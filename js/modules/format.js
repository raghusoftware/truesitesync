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
 * Convert a number to words in the Indian numbering system (lakh/crore).
 * e.g. 123450.6 -> "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty
 *                   and Sixty Paise Only"
 */
export function amountToWordsINR(amount) {
  const num = Math.abs(Math.round((Number(amount) || 0) * 100) / 100);
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const twoDigit = (n) => n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  const threeDigit = (n) => (n >= 100 ? ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + twoDigit(n % 100) : '') : twoDigit(n));
  const inWords = (n) => {
    if (n === 0) return 'Zero';
    let str = '';
    const crore = Math.floor(n / 10000000); n %= 10000000;
    const lakh = Math.floor(n / 100000); n %= 100000;
    const thousand = Math.floor(n / 1000); n %= 1000;
    const hundred = n;
    if (crore) str += threeDigit(crore) + ' Crore ';
    if (lakh) str += twoDigit(lakh) + ' Lakh ';
    if (thousand) str += twoDigit(thousand) + ' Thousand ';
    if (hundred) str += threeDigit(hundred) + ' ';
    return str.trim();
  };
  let result = 'Rupees ' + inWords(rupees);
  if (paise > 0) result += ' and ' + twoDigit(paise) + ' Paise';
  return result + ' Only';
}
