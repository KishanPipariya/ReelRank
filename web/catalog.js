export function filmDecade(film) {
  const year = Number.parseInt(film.year, 10);
  return Number.isFinite(year) && year >= 1000 ? Math.floor(year / 10) * 10 : null;
}

export function buildSearchText(film, sourceListLabels = []) {
  return [
    film.title, film.year, film.original_title, film.overview,
    ...(Array.isArray(film.genres) ? film.genres : []),
    ...(Array.isArray(film.directors) ? film.directors : []),
    ...sourceListLabels,
  ].filter(Boolean).join(' ').toLocaleLowerCase();
}

export function normalizeSearchText(value) {
  return String(value || '').normalize('NFKD')
    .replace(/\p{Variation_Selector}/gu, '')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .toLocaleLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function literalSearchText(value) {
  return String(value || '').normalize('NFKC').replace(/\p{Variation_Selector}/gu, '').trim();
}

const normalizedSearchCache = new WeakMap();
let lastSearchQuery;

function searchQueryFor(value) {
  if (lastSearchQuery?.value === value) return lastSearchQuery;
  const normalized = normalizeSearchText(value);
  lastSearchQuery = {
    value,
    terms: normalized ? normalized.split(' ') : [],
    literal: normalized ? '' : literalSearchText(value),
  };
  return lastSearchQuery;
}

export function matchesFilm(film, filters, sourceListUrls = film.lists || [], sourceListLabels = [], searchText = buildSearchText(film, sourceListLabels)) {
  const genres = Array.isArray(film.genres) ? film.genres : [];
  if (filters.genres?.length && !filters.genres.every((genre) => genres.includes(genre))) return false;
  const directors = Array.isArray(film.directors) ? film.directors : [];
  if (filters.directors?.length && !filters.directors.some((director) => directors.includes(director))) return false;
  if (filters.sourceLists?.length && !filters.sourceLists.some((url) => sourceListUrls.includes(url))) return false;
  if (filters.country && !(Array.isArray(film.countries) && film.countries.includes(filters.country))) return false;
  if (filters.language) {
    const code = String(film.original_language || '').trim();
    if (filters.language === 'unknown' ? Boolean(code) : code !== filters.language) return false;
  }
  if (filters.decade !== undefined && filters.decade !== '' && filmDecade(film) !== filters.decade) return false;
  if (filters.runtime) {
    const runtime = Number(film.runtime_minutes);
    if (!Number.isInteger(runtime) || runtime <= 0) return false;
    if (filters.runtime === 'under-90' && runtime >= 90) return false;
    if (filters.runtime === '90-120' && (runtime < 90 || runtime > 120)) return false;
    if (filters.runtime === 'over-120' && runtime <= 120) return false;
  }
  if (!filters.query) return true;
  const { terms, literal } = searchQueryFor(filters.query);
  if (!terms.length) return !literal || literalSearchText(searchText).includes(literal);
  let cached = normalizedSearchCache.get(film);
  if (!cached || cached.source !== searchText) {
    cached = { source: searchText, normalized: normalizeSearchText(searchText) };
    normalizedSearchCache.set(film, cached);
  }
  const normalizedText = cached.normalized;
  return terms.every((term) => normalizedText.includes(term));
}

function titleSortKey(value) {
  const title = String(value || '').trim();
  const withoutArticle = title.replace(/^the\s+(.+)$/i, '$1');
  return withoutArticle || title;
}

export function compareAlphabeticallyIgnoringThe(left, right) {
  const leftText = String(left || '').trim();
  const rightText = String(right || '').trim();
  return titleSortKey(leftText).localeCompare(titleSortKey(rightText))
    || leftText.localeCompare(rightText);
}

export function compareFilms(left, right, sort, rankByFilm) {
  const leftRank = rankByFilm.get(left) ?? 0;
  const rightRank = rankByFilm.get(right) ?? 0;
  if (sort === 'title') return compareAlphabeticallyIgnoringThe(left.title, right.title) || leftRank - rightRank;
  if (sort === 'year-newest' || sort === 'year-oldest') {
    const leftYear = Number.parseInt(left.year, 10);
    const rightYear = Number.parseInt(right.year, 10);
    const leftHasYear = Number.isFinite(leftYear);
    const rightHasYear = Number.isFinite(rightYear);
    if (leftHasYear !== rightHasYear) return leftHasYear ? -1 : 1;
    const difference = sort === 'year-newest' ? rightYear - leftYear : leftYear - rightYear;
    return difference || leftRank - rightRank;
  }
  return leftRank - rightRank;
}

export function relevanceScore(film, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    const literal = literalSearchText(query);
    if (!literal) return 99;
    const titles = [film.title, film.original_title].map(literalSearchText);
    if (titles.includes(literal)) return 0;
    return titles.some((value) => value.includes(literal)) ? 1 : 3;
  }
  const terms = normalizedQuery.split(' ');
  const title = normalizeSearchText(film.title);
  const originalTitle = normalizeSearchText(film.original_title);
  const directors = (Array.isArray(film.directors) ? film.directors : []).map(normalizeSearchText);
  if (title === normalizedQuery || originalTitle === normalizedQuery) return 0;
  const withoutYear = terms.filter((term) => !/^\d{4}$/.test(term)).join(' ');
  const yearsMatch = terms.filter((term) => /^\d{4}$/.test(term)).every((term) => term === String(film.year || '').trim());
  if (yearsMatch && (title === withoutYear || originalTitle === withoutYear)) return 0;
  const meaningfulTerms = terms.filter((term) => term.length >= 3);
  if ([title, originalTitle].some((value) => value && withoutYear && value === withoutYear)) return 1;
  if ([title, originalTitle].some((value) => value && meaningfulTerms.some((term) => value.includes(term)))) return 1;
  const yearTerms = terms.filter((term) => /^\d{4}$/.test(term));
  const directorTerms = terms.filter((term) => !yearTerms.includes(term) && term.length >= 3);
  if (directorTerms.length && directors.some((value) => directorTerms.every((term) => value.includes(term)))) return 2;
  return 3;
}

export function compareRelevance(left, right, query, rankByFilm) {
  return relevanceScore(left, query) - relevanceScore(right, query)
    || compareFilms(left, right, 'rank', rankByFilm);
}
