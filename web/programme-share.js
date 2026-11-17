import { fitStateUrlBudget, maxStateUrlLength, parseUrlState, urlForState } from './url-state.js';
import { graphemePrefix } from './display-text.js';
import { languageLabel } from './language-label.js';

export function programmeStateOmissions(href, state, query) {
  const restored = parseUrlState(new URL(href).search);
  const sameValues = (left = [], right = []) => JSON.stringify([...new Set(left || [])]) === JSON.stringify(right);
  const omissions = [];
  if (restored.query !== query.trim()) omissions.push('search');
  const filtersMatch = restored.filter === state.filter
    && sameValues(state.genres, restored.genres)
    && sameValues(state.directors, restored.directors)
    && sameValues(state.sourceLists, restored.sourceLists)
    && restored.country === state.country
    && restored.language === state.language
    && restored.decade === state.decade
    && restored.runtime === state.runtime;
  if (!filtersMatch) omissions.push('filters');
  if (restored.sort !== state.sort) omissions.push('sort');
  if (restored.view !== (state.view === 'ledger' ? 'ledger' : 'posters')) omissions.push('layout');
  return omissions;
}

export function programmeStateIsPreserved(href, state, query) {
  return programmeStateOmissions(href, state, query).length === 0;
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
  const fullDescription = parts.join(' · ') || 'All films';
  const descriptionExcerpt = graphemePrefix(fullDescription, 120);
  const description = descriptionExcerpt === fullDescription ? fullDescription : `${descriptionExcerpt}…`;
  const current = new URL(href);
  const localFixture = ['localhost', '127.0.0.1', '[::1]'].includes(current.hostname)
    && ['worst', 'empty', 'one', '100000'].includes(current.searchParams.get('data'));
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
    && sharedUrl.pathname === path
    && !localFixture;
  return { description, url: shareable ? url : '', reducedUrl: url, shareable, localFixture };
}
