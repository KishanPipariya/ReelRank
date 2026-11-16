import { fitStateUrlBudget, maxStateUrlLength, parseUrlState, urlForState } from './url-state.js';

function languageLabel(code) {
  if (code === 'unknown') return 'Unknown language';
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
    return name && name.toLocaleLowerCase() !== code.toLocaleLowerCase() ? name : `Unknown (${code})`;
  } catch { return `Unknown (${code})`; }
}

export function programmeStateIsPreserved(href, state, query) {
  const restored = parseUrlState(new URL(href).search);
  const sameValues = (left = [], right = []) => JSON.stringify([...new Set(left || [])]) === JSON.stringify(right);
  return restored.query === query.trim()
    && restored.filter === state.filter
    && restored.sort === state.sort
    && sameValues(state.genres, restored.genres)
    && sameValues(state.directors, restored.directors)
    && sameValues(state.sourceLists, restored.sourceLists)
    && restored.country === state.country
    && restored.language === state.language
    && restored.decade === state.decade
    && restored.runtime === state.runtime
    && restored.view === (state.view === 'ledger' ? 'ledger' : 'posters');
}

export function programmeShare(href, state, query, sourceLists = [], publicSiteUrl = '') {
  const parts = [
    state.country,
    state.language ? `Original language: ${languageLabel(state.language)}` : '',
    state.decade !== '' ? `${state.decade}s` : '',
    state.directors.length ? `Directed by ${state.directors.join(' or ')}` : '',
    state.genres.join(' and '),
    state.sourceLists.length ? `From ${state.sourceLists.map((url) => sourceLists.find((list) => list.url === url)?.label || url).join(' or ')}` : '',
    state.runtime === 'under-90' ? 'Under 90 minutes' : state.runtime === '90-120' ? '90–120 minutes' : state.runtime === 'over-120' ? 'Over 120 minutes' : '',
    state.filter === 'watched' ? 'Watched' : state.filter === 'unwatched' ? 'Unwatched' : '',
    query.trim() ? `Search: “${query.trim()}”` : '',
  ].filter(Boolean);
  const description = parts.join(' · ') || 'All films';
  const current = new URL(href);
  let base = current;
  if (typeof publicSiteUrl === 'string' && publicSiteUrl.trim()) {
    try {
      const configured = new URL(publicSiteUrl.trim());
      if (['http:', 'https:'].includes(configured.protocol) && !configured.username && !configured.password) base = configured;
    } catch { /* Invalid optional config safely falls back to this page's address. */ }
  }
  const path = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  const clean = new URL(path, base.origin);
  if (current.searchParams.get('demo') === '1') clean.searchParams.set('demo', '1');
  const sharedUrl = urlForState(clean.href, state, query);
  // Shared links describe an explicit layout, including the default Poster Wall,
  // so the recipient's saved local layout cannot override the programme.
  sharedUrl.searchParams.set('view', state.view === 'ledger' ? 'ledger' : 'posters');
  fitStateUrlBudget(sharedUrl);
  const url = sharedUrl.href;
  const shareable = url.length <= maxStateUrlLength
    && programmeStateIsPreserved(url, state, query)
    && sharedUrl.pathname === path;
  return { description, url: shareable ? url : '', reducedUrl: url, shareable };
}
