const grid = document.querySelector('#film-grid');
const topBilled = document.querySelector('#top-billed');
const topBilledGrid = document.querySelector('#top-billed-grid');
const statusMessage = document.querySelector('#status-message');
const searchInput = document.querySelector('#search-input');
const loadMoreButton = document.querySelector('#load-more');
const sortSelect = document.querySelector('#sort-select');
const backToFiltersButton = document.querySelector('#back-to-filters');
const clearSearchStateButton = document.querySelector('#clear-search-state');
const validFilters = new Set(['all', 'unwatched', 'watched']);
const validSorts = new Set(['rank', 'title', 'year-newest', 'year-oldest']);
let films = [];
let activeFilter = readUrlState().filter;
let activeSort = readUrlState().sort;
let rankedTotal = 0;
let visibleLimit = 40;
let searchUrlTimer;

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  const filter = params.get('filter');
  const sort = params.get('sort');
  return {
    query: params.get('q') || '',
    filter: validFilters.has(filter) ? filter : 'all',
    sort: validSorts.has(sort) ? sort : 'rank',
  };
}

function syncControls() {
  sortSelect.value = activeSort;
  document.querySelectorAll('.filter-button').forEach((button) => {
    const selected = button.dataset.filter === activeFilter;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function updateUrlState({ replace = false } = {}) {
  const url = new URL(window.location.href);
  const query = searchInput.value.trim();
  if (query) url.searchParams.set('q', query);
  else url.searchParams.delete('q');
  if (activeFilter === 'all') url.searchParams.delete('filter');
  else url.searchParams.set('filter', activeFilter);
  if (activeSort === 'rank') url.searchParams.delete('sort');
  else url.searchParams.set('sort', activeSort);
  if (url.href === window.location.href) return;
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method]({}, '', url);
}

function queueSearchUrlUpdate() {
  window.clearTimeout(searchUrlTimer);
  searchUrlTimer = window.setTimeout(() => updateUrlState(), 500);
}

function restoreUrlState() {
  window.clearTimeout(searchUrlTimer);
  const state = readUrlState();
  searchInput.value = state.query;
  activeFilter = state.filter;
  activeSort = state.sort;
  visibleLimit = 40;
  syncControls();
  render();
}

function safeUrl(value, allowedHosts) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return '';
    return url.href;
  } catch {
    return '';
  }
}

function listLabel(value) {
  try {
    const parts = new URL(value).pathname.split('/').filter(Boolean);
    const slug = parts[parts.indexOf('list') + 1] || 'Letterboxd list';
    return slug.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return 'Letterboxd list';
  }
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Refresh date unavailable';
  return `Updated ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)}`;
}

function searchPriority(film, query) {
  const title = (film.title || '').toLocaleLowerCase();
  const year = String(film.year || '').toLocaleLowerCase();
  return title.includes(query) || year.includes(query) ? 0 : 1;
}

function compareFilms(left, right, sort = activeSort) {
  const leftRank = films.indexOf(left);
  const rightRank = films.indexOf(right);
  if (sort === 'title') {
    return (left.title || '').localeCompare(right.title || '') || leftRank - rightRank;
  }
  if (sort === 'year-newest' || sort === 'year-oldest') {
    const leftYear = Number.parseInt(left.year, 10);
    const rightYear = Number.parseInt(right.year, 10);
    const leftHasYear = Number.isFinite(leftYear);
    const rightHasYear = Number.isFinite(rightYear);
    if (leftHasYear !== rightHasYear) return leftHasYear ? -1 : 1;
    const yearDifference = sort === 'year-newest' ? rightYear - leftYear : leftYear - rightYear;
    return yearDifference || leftRank - rightRank;
  }
  return leftRank - rightRank;
}

function updateBackToFiltersVisibility() {
  backToFiltersButton.hidden = visibleLimit <= 40 || window.scrollY < 600;
}

function makeLink(label, href, className = '') {
  const link = document.createElement('a');
  link.textContent = label;
  link.href = href;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.setAttribute('aria-label', `${label}, opens in a new tab`);
  if (className) link.className = className;
  return link;
}

function cardFor(film, index) {
  const rankNumber = films.indexOf(film) + 1;
  const card = document.createElement('article');
  card.className = 'film-card';
  card.style.animationDelay = `${Math.min(index * 22, 220)}ms`;

  const filmUrl = safeUrl(film.letterboxd_url, ['letterboxd.com']);
  const posterUrl = safeUrl(film.poster_url, ['image.tmdb.org']);
  const poster = document.createElement(filmUrl ? 'a' : 'div');
  poster.className = 'poster-link';
  if (filmUrl) {
    poster.href = filmUrl;
    poster.target = '_blank';
    poster.rel = 'noreferrer';
    poster.setAttribute('aria-label', `Open poster for ${film.title}, ranked ${rankNumber}, ${film.watched ? 'watched' : 'unwatched'}, on Letterboxd, opens in a new tab`);
  }

  if (posterUrl) {
    const image = document.createElement('img');
    image.className = 'poster-image';
    image.src = posterUrl;
    image.alt = `${film.title} poster from TMDB`;
    image.loading = activeFilter === 'watched' ? 'eager' : 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      const fallback = document.createElement('div');
      fallback.className = 'poster-fallback';
      fallback.textContent = film.title;
      image.replaceWith(fallback);
    }, { once: true });
    poster.append(image);
  } else {
    const fallback = document.createElement('div');
    fallback.className = 'poster-fallback';
    fallback.textContent = film.title;
    poster.append(fallback);
  }

  const rank = document.createElement('span');
  rank.className = 'rank-chip';
  rank.textContent = String(rankNumber).padStart(2, '0');
  poster.append(rank);
  if (film.watched) {
    const watched = document.createElement('span');
    watched.className = 'watched-chip';
    watched.textContent = 'Watched';
    poster.append(watched);
  }
  card.append(poster);

  const info = document.createElement('div');
  info.className = 'film-info';
  const titleRow = document.createElement('h3');
  titleRow.className = 'film-title-row';
  if (filmUrl) titleRow.append(makeLink(film.title, filmUrl, 'film-title'));
  else {
    const title = document.createElement('span');
    title.className = 'film-title';
    title.textContent = film.title;
    titleRow.append(title);
  }
  const year = document.createElement('span');
  year.className = 'film-year';
  year.textContent = film.year || '';
  titleRow.append(year);
  info.append(titleRow);

  const count = document.createElement('p');
  count.className = 'film-count';
  const countValue = document.createElement('strong');
  const likedListCount = Number(film.liked_in) || 0;
  countValue.textContent = likedListCount.toLocaleString();
  const countLabel = document.createElement('span');
  countLabel.textContent = likedListCount === 1 ? 'liked list' : 'liked lists';
  count.append(countValue, countLabel);
  count.setAttribute('aria-label', `Appears in ${likedListCount.toLocaleString()} ${likedListCount === 1 ? 'liked list' : 'liked lists'}`);
  info.append(count);

  if (film.overview) {
    const overview = document.createElement('p');
    overview.className = 'film-overview';
    overview.textContent = film.overview;
    info.append(overview);

    const fullOverview = document.createElement('p');
    fullOverview.className = 'film-full-overview';
    fullOverview.textContent = film.overview;
    fullOverview.hidden = true;
    info.append(fullOverview);

    const overviewToggle = document.createElement('button');
    overviewToggle.className = 'overview-toggle';
    overviewToggle.type = 'button';
    overviewToggle.textContent = 'Full synopsis';
    overviewToggle.setAttribute('aria-expanded', 'false');
    overviewToggle.addEventListener('click', () => {
      const expanded = fullOverview.hidden;
      fullOverview.hidden = !expanded;
      overview.hidden = expanded;
      overviewToggle.textContent = expanded ? 'Show less' : 'Full synopsis';
      overviewToggle.setAttribute('aria-expanded', String(expanded));
    });
    info.append(overviewToggle);
  }

  const lists = film.lists || [];
  const listDetails = document.createElement('details');
  listDetails.className = 'list-details';
  const listSummary = document.createElement('summary');
  listSummary.textContent = 'Browse source lists';
  listDetails.append(listSummary);
  const listLinks = document.createElement('div');
  listLinks.className = 'list-links';
  lists.forEach((url) => {
    const safeListUrl = safeUrl(url, ['letterboxd.com']);
    if (safeListUrl) listLinks.append(makeLink(listLabel(safeListUrl), safeListUrl));
  });
  if (listLinks.childElementCount) {
    listDetails.append(listLinks);
    info.append(listDetails);
  }
  const tmdbUrl = safeUrl(film.tmdb_url, ['themoviedb.org']);
  if (tmdbUrl) info.append(makeLink('TMDB ↗', tmdbUrl, 'tmdb-film-link'));
  card.append(info);
  return card;
}

function render() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const matching = films.filter((film) => {
    if (activeFilter === 'unwatched' && film.watched) return false;
    if (activeFilter === 'watched' && !film.watched) return false;
    if (!query) return true;
    const titleAndYear = `${film.title || ''} ${film.year || ''}`.toLocaleLowerCase();
    const overview = (film.overview || '').toLocaleLowerCase();
    const sourceLists = (film.lists || []).map(listLabel).join(' ').toLocaleLowerCase();
    return titleAndYear.includes(query) || overview.includes(query) || sourceLists.includes(query);
  });
  matching.sort((left, right) => (query ? searchPriority(left, query) - searchPriority(right, query) : 0) || compareFilms(left, right));
  const highlighted = activeFilter === 'all' && activeSort === 'rank' && !query ? matching.slice(0, 3) : [];
  const shown = matching.slice(0, visibleLimit + highlighted.length);
  topBilled.hidden = highlighted.length === 0;
  topBilledGrid.replaceChildren(...highlighted.map(cardFor));
  grid.replaceChildren(...shown.slice(highlighted.length).map((film, index) => cardFor(film, index)));
  document.querySelector('#heading-count').textContent = String(matching.length).padStart(2, '0');
  statusMessage.classList.toggle('is-visible', matching.length === 0);
  if (films.length === 0) statusMessage.textContent = 'No films are available in this snapshot yet.';
  else if (matching.length === 0 && query) statusMessage.textContent = 'No films match that search. Try another title.';
  else if (matching.length === 0 && activeFilter === 'unwatched') statusMessage.textContent = 'No unwatched films in this snapshot.';
  else if (matching.length === 0 && activeFilter === 'watched') statusMessage.textContent = 'No watched films in this snapshot.';
  else if (matching.length === 0) statusMessage.textContent = 'Everything in this snapshot is marked watched.';
  clearSearchStateButton.hidden = matching.length > 0 || (activeFilter === 'all' && activeSort === 'rank' && !searchInput.value.trim());
  loadMoreButton.hidden = matching.length <= shown.length;
  if (!loadMoreButton.hidden) {
    const remaining = matching.length - shown.length;
    loadMoreButton.textContent = `Show ${Math.min(40, remaining)} more films · ${remaining} left`;
  }
  updateBackToFiltersVisibility();
  const resultAnnouncement = document.querySelector('#results-announcement');
  const filterDescription = activeFilter === 'all' ? '' : `, ${activeFilter} only`;
  const sortDescription = activeSort === 'rank' ? '' : `, sorted by ${sortSelect.options[sortSelect.selectedIndex].text}`;
  resultAnnouncement.textContent = `Showing ${shown.length} of ${matching.length} matching ${matching.length === 1 ? 'film' : 'films'}${filterDescription}${sortDescription}${query ? ` for ${searchInput.value.trim()}` : ''}.`;
}

async function loadSnapshot() {
  try {
    const response = await fetch('/data/snapshot.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Snapshot request failed: ${response.status}`);
    const snapshot = await response.json();
    if (snapshot.username !== 'intelkishan' || !Array.isArray(snapshot.films)) throw new Error('Snapshot format is invalid');
    films = snapshot.films;
    rankedTotal = snapshot.film_count ?? films.length;
    document.querySelector('#film-total').textContent = rankedTotal.toLocaleString();
    document.querySelector('#list-total').textContent = snapshot.list_count ?? '—';
    const unwatchedCount = snapshot.unwatched_count ?? films.filter((film) => !film.watched).length;
    const watchedCount = Math.max(0, rankedTotal - unwatchedCount);
    document.querySelector('#unwatched-total').textContent = unwatchedCount.toLocaleString();
    document.querySelector('#unwatched-tab-count').textContent = (snapshot.displayed_unwatched_count ?? films.filter((film) => !film.watched).length).toLocaleString();
    document.querySelector('#watched-tab-count').textContent = (films.length - (snapshot.displayed_unwatched_count ?? films.filter((film) => !film.watched).length)).toLocaleString();
    document.querySelector('#watched-total').textContent = watchedCount.toLocaleString();
    document.querySelector('#progress-film-total').textContent = rankedTotal.toLocaleString();
    const progress = document.querySelector('#watch-progress');
    progress.max = rankedTotal || 1;
    progress.value = watchedCount;
    const progressPercent = rankedTotal ? Math.round((watchedCount / rankedTotal) * 100) : 0;
    document.querySelector('#watch-progress-percent').textContent = `${progressPercent}% watched`;
    progress.setAttribute('aria-label', `${watchedCount.toLocaleString()} of ${rankedTotal.toLocaleString()} films watched (${progressPercent} percent)`);
    document.querySelector('#refreshed-label').textContent = formatDate(snapshot.refreshed_at);
    const displayed = snapshot.displayed_film_count ?? films.length;
    document.querySelector('#watch-progress-scope').textContent = `Progress covers all ${rankedTotal.toLocaleString()} ranked films; the catalog shows the top ${displayed.toLocaleString()}.`;
    document.querySelector('#collection-footnote').textContent = `Showing the top ${displayed.toLocaleString()} of ${rankedTotal.toLocaleString()} ranked films. Film and poster details link back to Letterboxd; this page reflects public profile data.`;
    render();
  } catch (error) {
    statusMessage.textContent = 'The daily snapshot could not be loaded. Please try again later.';
    statusMessage.classList.add('is-visible');
    document.querySelector('#refreshed-label').textContent = 'Snapshot unavailable';
    console.error(error);
  }
}

document.querySelectorAll('.filter-button').forEach((button) => {
  button.addEventListener('click', () => {
    window.clearTimeout(searchUrlTimer);
    activeFilter = button.dataset.filter;
    visibleLimit = 40;
    syncControls();
    updateUrlState();
    render();
  });
});

searchInput.addEventListener('input', () => {
  visibleLimit = 40;
  render();
  queueSearchUrlUpdate();
});
sortSelect.addEventListener('change', () => {
  window.clearTimeout(searchUrlTimer);
  activeSort = sortSelect.value;
  visibleLimit = 40;
  updateUrlState();
  render();
});
clearSearchStateButton.addEventListener('click', () => {
  window.clearTimeout(searchUrlTimer);
  searchInput.value = '';
  activeFilter = 'all';
  activeSort = 'rank';
  visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
  searchInput.focus();
});
loadMoreButton.addEventListener('click', () => {
  visibleLimit += 40;
  render();
});
backToFiltersButton.addEventListener('click', () => {
  searchInput.focus({ preventScroll: true });
  document.querySelector('#collection-controls').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
window.addEventListener('scroll', updateBackToFiltersVisibility, { passive: true });
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === 'Escape' && document.activeElement === searchInput) {
    window.clearTimeout(searchUrlTimer);
    searchInput.value = '';
    searchInput.blur();
    updateUrlState();
    render();
  }
});

window.addEventListener('popstate', restoreUrlState);
searchInput.value = readUrlState().query;
syncControls();
loadSnapshot();
