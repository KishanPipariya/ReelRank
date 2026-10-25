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

export function matchesFilm(film, filters, sourceListUrls = film.lists || [], sourceListLabels = [], searchText = buildSearchText(film, sourceListLabels)) {
  const genres = Array.isArray(film.genres) ? film.genres : [];
  if (filters.genres?.length && !filters.genres.some((genre) => genres.includes(genre))) return false;
  const directors = Array.isArray(film.directors) ? film.directors : [];
  if (filters.directors?.length && !filters.directors.some((director) => directors.includes(director))) return false;
  if (filters.sourceLists?.length && !filters.sourceLists.some((url) => sourceListUrls.includes(url))) return false;
  if (filters.country && !(Array.isArray(film.countries) && film.countries.includes(filters.country))) return false;
  if (filters.decade !== undefined && filters.decade !== '' && filmDecade(film) !== filters.decade) return false;
  const query = (filters.query || '').toLocaleLowerCase();
  if (!query) return true;
  return searchText.includes(query);
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
