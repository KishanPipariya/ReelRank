const canonicalCodes = new Map([
  ['cn', 'yue'],
  ['mo', 'ro'],
  ['iw', 'he'],
  ['in', 'id'],
  ['ji', 'yi'],
  ['sh', 'sr-latn'],
]);

export function canonicalLanguageCode(code) {
  const value = String(code || '').trim().toLowerCase();
  if (!value) return '';
  if (value === 'unknown' || value === 'und') return 'unknown';
  let localeCode = value;
  try {
    localeCode = Intl.getCanonicalLocales(value)[0]?.toLowerCase() || value;
  } catch { /* Invalid provider codes stay stable and use the fallback label. */ }
  return canonicalCodes.get(value) || canonicalCodes.get(localeCode) || localeCode;
}

export function languageLabel(code, locale = 'en') {
  const value = canonicalLanguageCode(code);
  if (!value || value === 'unknown') return 'Unknown language';
  if (value === 'xx') return 'No language';
  const lookup = value;
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(lookup);
    if (name && name.toLocaleLowerCase() !== lookup.toLocaleLowerCase()) return name;
  } catch { /* Unknown TMDB codes use a stable label below. */ }
  return `Unknown (${value})`;
}
