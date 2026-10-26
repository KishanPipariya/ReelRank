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
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .toLocaleLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

const normalizedSearchCache = new WeakMap();

export function matchesFilm(film, filters, sourceListUrls = film.lists || [], sourceListLabels = [], searchText = buildSearchText(film, sourceListLabels)) {
  const genres = Array.isArray(film.genres) ? film.genres : [];
  if (filters.genres?.length && !filters.genres.some((genre) => genres.includes(genre))) return false;
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
  const query = normalizeSearchText(filters.query);
  if (!query) return true;
  let cached = normalizedSearchCache.get(film);
  if (!cached || cached.source !== searchText) {
    cached = { source: searchText, normalized: normalizeSearchText(searchText) };
    normalizedSearchCache.set(film, cached);
  }
  const normalizedText = cached.normalized;
  return query.split(' ').every((term) => normalizedText.includes(term));
}

export function compareFilms(left, right, sort, rankByFilm) {
  const leftRank = rankByFilm.get(left) ?? 0;
  const rightRank = rankByFilm.get(right) ?? 0;
  if (sort === 'title') return (left.title || '').localeCompare(right.title || '') || leftRank - rightRank;
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
  if (!normalizedQuery) return 99;
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
