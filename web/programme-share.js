import { urlForState } from './url-state.js';

export function programmeShare(href, state, query, sourceLists = [], publicSiteUrl = '') {
  const parts = [
    state.country,
    state.decade !== '' ? `${state.decade}s` : '',
    state.directors.length ? `Directed by ${state.directors.join(' or ')}` : '',
    state.genres.join(' or '),
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
  const url = urlForState(clean.href, state, query).href;
  return { description, url };
}
