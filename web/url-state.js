const validFilters = new Set(['all', 'unwatched', 'watched']);
const validSorts = new Set(['rank', 'title', 'year-newest', 'year-oldest', 'relevance']);
const validViews = new Set(['posters', 'ledger']);
const validRuntimes = new Set(['under-90', '90-120', 'over-120']);
// Leave room for a film-detail identifier or an explicit shared-view value.
export const maxStateUrlLength = 7800;

export function normalizeViewFacets({ query = '', sort = 'rank', genres = [], directors = [], country = '', language = '', decade = '' }) {
  const nonblank = (values) => [...new Set(values.filter((value) => value.trim()))];
  const search = query.trim();
  return {
    query: search,
    sort: validSorts.has(sort) && (sort !== 'relevance' || search) ? sort : 'rank',
    genres: nonblank(genres),
    directors: nonblank(directors),
    country: country.trim() ? country : '',
    language: language.trim(),
    decade: Number.isInteger(decade) && decade >= 1000 && decade <= 9999 ? decade : '',
  };
}

export function parseUrlState(search) {
  const params = new URLSearchParams(search);
  const filter = params.get('filter');
  const decade = params.get('decade') || '';
  return {
    ...normalizeViewFacets({
      query: params.get('q') || '',
      sort: params.get('sort'),
      genres: params.getAll('genre'),
      directors: params.getAll('director'),
      country: params.get('country') || '',
      language: params.get('language') || '',
      decade: /^\d{4}$/.test(decade) ? Number(decade) : '',
    }),
    filter: validFilters.has(filter) ? filter : 'all',
    sourceLists: [...new Set(params.getAll('list'))],
    runtime: validRuntimes.has(params.get('runtime')) ? params.get('runtime') : '',
    view: validViews.has(params.get('view')) ? params.get('view') : 'posters',
  };
}

export function fitStateUrlBudget(url, { preserve = [] } = {}) {
  const kept = new Set(preserve);
  if (url.href.length > maxStateUrlLength) {
    url.hash = '';
    const stateKeys = new Set([
      'q', 'filter', 'sort', 'genre', 'director', 'list', 'country', 'language',
      'decade', 'runtime', 'view', 'film', 'data', 'demo',
    ]);
    for (const key of new Set(url.searchParams.keys())) {
      if (url.href.length <= maxStateUrlLength) break;
      if (!stateKeys.has(key)) url.searchParams.delete(key);
    }
  }
  if (url.href.length > maxStateUrlLength && !kept.has('q')) url.searchParams.delete('q');
  for (const key of ['list', 'director', 'genre']) {
    while (url.href.length > maxStateUrlLength && url.searchParams.has(key) && !kept.has(key)) {
      const values = url.searchParams.getAll(key);
      url.searchParams.delete(key);
      values.slice(0, -1).forEach((value) => url.searchParams.append(key, value));
    }
  }
  for (const key of ['country', 'language', 'decade', 'runtime', 'sort', 'filter', 'view', 'data', 'demo']) {
    if (url.href.length <= maxStateUrlLength) break;
    if (!kept.has(key)) url.searchParams.delete(key);
  }
  if (url.href.length > maxStateUrlLength) {
    for (const key of new Set(url.searchParams.keys())) {
      if (url.href.length <= maxStateUrlLength) break;
      if (!kept.has(key)) url.searchParams.delete(key);
    }
  }
  if (url.href.length > maxStateUrlLength) {
    const preserved = [...kept].flatMap((key) => url.searchParams.getAll(key).map((value) => [key, value]));
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    preserved.forEach(([key, value]) => url.searchParams.append(key, value));
  }
  return url;
}

export function urlForState(href, state, query) {
  const url = new URL(href);
  if (query.trim()) url.searchParams.set('q', query.trim());
  else url.searchParams.delete('q');
  if (state.filter === 'all') url.searchParams.delete('filter');
  else url.searchParams.set('filter', state.filter);
  if (state.sort === 'rank') url.searchParams.delete('sort');
  else url.searchParams.set('sort', state.sort);
  for (const [key, values] of [['genre', state.genres], ['director', state.directors], ['list', state.sourceLists]]) {
    url.searchParams.delete(key);
    values.forEach((value) => url.searchParams.append(key, value));
  }
  if (state.country) url.searchParams.set('country', state.country);
  else url.searchParams.delete('country');
  if (state.language) url.searchParams.set('language', state.language);
  else url.searchParams.delete('language');
  if (state.decade !== '') url.searchParams.set('decade', String(state.decade));
  else url.searchParams.delete('decade');
  if (state.runtime) url.searchParams.set('runtime', state.runtime);
  else url.searchParams.delete('runtime');
  if (state.view === 'ledger') url.searchParams.set('view', state.view);
  else url.searchParams.delete('view');
  return fitStateUrlBudget(url);
}
