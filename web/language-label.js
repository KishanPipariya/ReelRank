const knownTmdbCodes = new Map([
  ['cn', 'yue'],
]);

export function languageLabel(code, locale = 'en') {
  const value = String(code || '').trim().toLowerCase();
  if (!value || value === 'unknown') return 'Unknown language';
  if (value === 'xx') return 'No language';
  const lookup = knownTmdbCodes.get(value) || value;
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(lookup);
    if (name && name.toLocaleLowerCase() !== lookup.toLocaleLowerCase()) return name;
  } catch { /* Unknown TMDB codes use a stable label below. */ }
  return `Unknown (${value})`;
}
