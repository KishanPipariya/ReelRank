const grid = document.querySelector('#film-grid');
const topBilled = document.querySelector('#top-billed');
const topBilledGrid = document.querySelector('#top-billed-grid');
const statusMessage = document.querySelector('#status-message');
const searchInput = document.querySelector('#search-input');
const loadMoreButton = document.querySelector('#load-more');
const sortSelect = document.querySelector('#sort-select');
const genreFilter = document.querySelector('#genre-filter');
const genreFilterSummary = document.querySelector('#genre-filter-summary');
const genreOptions = document.querySelector('#genre-options');
const clearGenresButton = document.querySelector('#clear-genres');
const activeGenreFilters = document.querySelector('#active-genre-filters');
const backToFiltersButton = document.querySelector('#back-to-filters');
const clearSearchStateButton = document.querySelector('#clear-search-state');
const setupState = document.querySelector('#setup-state');
const setupTitle = document.querySelector('#setup-title');
const setupCopy = document.querySelector('#setup-copy');
const demoPreviewLink = document.querySelector('#demo-preview-link');
const siteShell = document.querySelector('#site-shell');
const demoBanner = document.querySelector('#demo-banner');
const validFilters = new Set(['all', 'unwatched', 'watched']);
const validSorts = new Set(['rank', 'title', 'year-newest', 'year-oldest']);
let films = [];
let activeFilter = readUrlState().filter;
let activeSort = readUrlState().sort;
let activeGenres = readUrlState().genres;
let availableGenres = [];
let rankedTotal = 0;
let visibleLimit = 40;
let searchUrlTimer;
let currentShownCount = 0;
let currentMatchCount = 0;

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  const filter = params.get('filter');
  const sort = params.get('sort');
  return {
    query: params.get('q') || '',
    filter: validFilters.has(filter) ? filter : 'all',
    sort: validSorts.has(sort) ? sort : 'rank',
    genres: [...new Set(params.getAll('genre'))],
  };
}

function syncControls() {
  sortSelect.value = activeSort;
  document.querySelectorAll('.filter-button').forEach((button) => {
    const selected = button.dataset.filter === activeFilter;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  genreOptions.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = activeGenres.includes(input.value);
  });
  genreFilterSummary.textContent = activeGenres.length ? `${activeGenres.length} selected` : 'Any';
  clearGenresButton.hidden = activeGenres.length === 0;
  renderActiveGenreFilters();
}

function renderActiveGenreFilters() {
  activeGenreFilters.replaceChildren();
  activeGenreFilters.hidden = activeGenres.length === 0;
  activeGenres.forEach((genre) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'active-genre-chip';
    chip.textContent = `${genre} ×`;
    chip.setAttribute('aria-label', `Remove ${genre} genre filter`);
    chip.addEventListener('click', () => toggleGenre(genre));
    activeGenreFilters.append(chip);
  });
}

function buildGenreFilter() {
  const counts = new Map();
  films.forEach((film) => {
    [...new Set(Array.isArray(film.genres) ? film.genres : [])].forEach((genre) => {
      if (typeof genre === 'string' && genre.trim()) counts.set(genre, (counts.get(genre) || 0) + 1);
    });
  });
  availableGenres = [...counts.keys()].sort((left, right) => left.localeCompare(right));
  activeGenres = activeGenres.filter((genre) => availableGenres.includes(genre));
  genreFilter.hidden = availableGenres.length === 0;
  genreOptions.replaceChildren();
  availableGenres.forEach((genre) => {
    const label = document.createElement('label');
    label.className = 'genre-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = genre;
    checkbox.addEventListener('change', () => toggleGenre(genre));
    const name = document.createElement('span');
    name.textContent = genre;
    const count = document.createElement('small');
    count.textContent = counts.get(genre).toLocaleString();
    label.append(checkbox, name, count);
    genreOptions.append(label);
  });
  syncControls();
}

function toggleGenre(genre) {
  activeGenres = activeGenres.includes(genre)
    ? activeGenres.filter((selected) => selected !== genre)
    : [...activeGenres, genre].sort((left, right) => left.localeCompare(right));
  visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
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
  url.searchParams.delete('genre');
  activeGenres.forEach((genre) => url.searchParams.append('genre', genre));
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
  activeGenres = state.genres.filter((genre) => availableGenres.includes(genre));
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
  const filterLabel = activeFilter === 'all' ? 'All films' : `${activeFilter[0].toLocaleUpperCase()}${activeFilter.slice(1)}`;
  const genreLabel = activeGenres.length ? ` · ${activeGenres.join(' or ')}` : '';
  backToFiltersButton.textContent = `${currentShownCount} / ${currentMatchCount} · ${filterLabel}${genreLabel} · ↑ Filters`;
  backToFiltersButton.setAttribute('aria-label', `Showing ${currentShownCount} of ${currentMatchCount} matching films, ${filterLabel} filter${activeGenres.length ? `, genres ${activeGenres.join(' or ')}` : ''}. Return to search and filters.`);
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
  const posterUrl = safeUrl(film.poster_url, ['image.tmdb.org', 'ltrbxd.com', 'letterboxd.com']);
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
    image.alt = `Poster for ${film.title}`;
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

  const genres = [...new Set(Array.isArray(film.genres) ? film.genres.filter((genre) => typeof genre === 'string' && genre) : [])];
  if (genres.length) {
    const genreTags = document.createElement('div');
    genreTags.className = 'genre-tags';
    genreTags.setAttribute('role', 'group');
    genreTags.setAttribute('aria-label', `Genres: ${genres.join(', ')}`);
    genres.slice(0, 2).forEach((genre) => {
      const tag = document.createElement('button');
      tag.type = 'button';
      tag.className = 'genre-tag';
      tag.textContent = genre;
      tag.setAttribute('aria-label', `Filter by ${genre}`);
      tag.setAttribute('aria-pressed', String(activeGenres.includes(genre)));
      tag.addEventListener('click', () => toggleGenre(genre));
      genreTags.append(tag);
    });
    if (genres.length > 2) {
      const more = document.createElement('span');
      more.className = 'genre-tag genre-tag-more';
      more.textContent = `+${genres.length - 2}`;
      more.title = genres.slice(2).join(', ');
      more.setAttribute('aria-label', `${genres.length - 2} more genres: ${genres.slice(2).join(', ')}`);
      genreTags.append(more);
    }
    info.append(genreTags);
  }

  if (film.overview) {
    const overview = document.createElement('p');
    overview.className = 'film-overview';
    overview.textContent = film.overview;
    overview.hidden = true;
    info.append(overview);

    const overviewToggle = document.createElement('button');
    overviewToggle.className = 'overview-toggle';
    overviewToggle.type = 'button';
    overviewToggle.textContent = 'Show synopsis';
    overviewToggle.setAttribute('aria-expanded', 'false');
    overviewToggle.addEventListener('click', () => {
      const expanded = overview.hidden;
      overview.hidden = !expanded;
      overviewToggle.textContent = expanded ? 'Hide synopsis' : 'Show synopsis';
      overviewToggle.setAttribute('aria-expanded', String(expanded));
    });
    info.append(overviewToggle);
  }

  const lists = film.lists || [];
  const listDetails = document.createElement('details');
  listDetails.className = 'list-details';
  const listSummary = document.createElement('summary');
  listSummary.textContent = 'Film and source details';
  listDetails.append(listSummary);
  const listLinks = document.createElement('div');
  listLinks.className = 'list-links';
  lists.forEach((url) => {
    const safeListUrl = safeUrl(url, ['letterboxd.com']);
    if (safeListUrl) listLinks.append(makeLink(listLabel(safeListUrl), safeListUrl));
  });
  if (listLinks.childElementCount) listDetails.append(listLinks);
  const tmdbUrl = safeUrl(film.tmdb_url, ['themoviedb.org']);
  if (tmdbUrl) listDetails.append(makeLink('Film data on TMDB ↗', tmdbUrl, 'tmdb-film-link'));
  if (listDetails.childElementCount > 1) info.append(listDetails);
  card.append(info);
  return card;
}

function render() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const matching = films.filter((film) => {
    if (activeFilter === 'unwatched' && film.watched) return false;
    if (activeFilter === 'watched' && !film.watched) return false;
    const filmGenres = Array.isArray(film.genres) ? film.genres : [];
    if (activeGenres.length && !activeGenres.some((genre) => filmGenres.includes(genre))) return false;
    if (!query) return true;
    const titleAndYear = `${film.title || ''} ${film.year || ''}`.toLocaleLowerCase();
    const overview = (film.overview || '').toLocaleLowerCase();
    const sourceLists = (film.lists || []).map(listLabel).join(' ').toLocaleLowerCase();
    const genres = (Array.isArray(film.genres) ? film.genres : []).join(' ').toLocaleLowerCase();
    return titleAndYear.includes(query) || overview.includes(query) || sourceLists.includes(query) || genres.includes(query);
  });
  matching.sort((left, right) => (query ? searchPriority(left, query) - searchPriority(right, query) : 0) || compareFilms(left, right));
  const highlighted = activeFilter === 'all' && activeSort === 'rank' && !query && activeGenres.length === 0 ? matching.slice(0, 3) : [];
  const shown = matching.slice(0, visibleLimit + highlighted.length);
  currentShownCount = shown.length;
  currentMatchCount = matching.length;
  topBilled.hidden = highlighted.length === 0;
  topBilledGrid.replaceChildren(...highlighted.map(cardFor));
  grid.replaceChildren(...shown.slice(highlighted.length).map((film, index) => cardFor(film, index)));
  document.querySelector('#heading-count').textContent = String(matching.length).padStart(2, '0');
  statusMessage.classList.toggle('is-visible', matching.length === 0);
  if (films.length === 0) statusMessage.textContent = 'No films are available in this snapshot yet.';
  else if (matching.length === 0 && query) statusMessage.textContent = 'No films match that search. Try another title.';
  else if (matching.length === 0 && activeGenres.length) statusMessage.textContent = `No films match ${activeGenres.join(' or ')}.`;
  else if (matching.length === 0 && activeFilter === 'unwatched') statusMessage.textContent = 'No unwatched films in this snapshot.';
  else if (matching.length === 0 && activeFilter === 'watched') statusMessage.textContent = 'No watched films in this snapshot.';
  else if (matching.length === 0) statusMessage.textContent = 'Everything in this snapshot is marked watched.';
  clearSearchStateButton.hidden = matching.length > 0 || (activeFilter === 'all' && activeSort === 'rank' && !searchInput.value.trim() && activeGenres.length === 0);
  loadMoreButton.hidden = matching.length <= shown.length;
  if (!loadMoreButton.hidden) {
    const remaining = matching.length - shown.length;
    loadMoreButton.textContent = `Show ${Math.min(40, remaining)} more films · ${remaining} left`;
  }
  updateBackToFiltersVisibility();
  const resultAnnouncement = document.querySelector('#results-announcement');
  const filterDescription = [activeFilter === 'all' ? '' : `${activeFilter} only`, activeGenres.length ? `genres: ${activeGenres.join(' or ')}` : ''].filter(Boolean).join(', ');
  const sortDescription = activeSort === 'rank' ? '' : `, sorted by ${sortSelect.options[sortSelect.selectedIndex].text}`;
  resultAnnouncement.textContent = `Showing ${shown.length} of ${matching.length} matching ${matching.length === 1 ? 'film' : 'films'}${filterDescription ? `, ${filterDescription}` : ''}${sortDescription}${query ? ` for ${searchInput.value.trim()}` : ''}.`;
}

async function loadSnapshot() {
  try {
    const configResponse = await fetch('/site-config.json', { cache: 'no-store' });
    if (!configResponse.ok) throw new Error(`Site configuration request failed: ${configResponse.status}`);
    const config = await configResponse.json();
    const configuredUsername = typeof config.letterboxd_username === 'string' ? config.letterboxd_username.trim() : '';
    if (!configuredUsername) throw new Error('Site configuration does not include a Letterboxd username');
    setupTitle.textContent = `Preparing @${configuredUsername}'s ReelRank`;
    setupCopy.textContent = 'Checking the latest snapshot. The first refresh can take a few minutes while public lists and watched films are gathered.';

    const response = await fetch('/data/snapshot.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Snapshot request failed: ${response.status}`);
    const snapshot = await response.json();
    if (typeof snapshot.username !== 'string' || !snapshot.username.trim() || !Array.isArray(snapshot.films)) throw new Error('Snapshot format is invalid');
    const snapshotUsername = snapshot.username.trim();
    const snapshotMatchesConfig = snapshotUsername.toLocaleLowerCase() === configuredUsername.toLocaleLowerCase();
    const demoRequested = new URLSearchParams(window.location.search).get('demo') === '1';
    if (!snapshotMatchesConfig) {
      const demoUrl = new URL(window.location.href);
      demoUrl.searchParams.set('demo', '1');
      demoPreviewLink.href = demoUrl.href;
      demoPreviewLink.textContent = `Preview sample data from @${snapshotUsername}`;
      demoPreviewLink.hidden = false;
      setupCopy.textContent = `The snapshot for @${configuredUsername} is still being prepared. Your site will appear here when its username matches the generated snapshot.`;
      if (!demoRequested) return;
      document.querySelector('#demo-banner-copy').textContent = `Demo preview: showing @${snapshotUsername}'s public data. @${configuredUsername}'s site is still being prepared.`;
      demoBanner.hidden = false;
      const exitDemoUrl = new URL(window.location.href);
      exitDemoUrl.searchParams.delete('demo');
      document.querySelector('#exit-demo-link').href = exitDemoUrl.href;
    } else if (demoRequested) {
      document.querySelector('#demo-banner-copy').textContent = `Demo preview of @${snapshotUsername}'s public snapshot.`;
      demoBanner.hidden = false;
      const exitDemoUrl = new URL(window.location.href);
      exitDemoUrl.searchParams.delete('demo');
      document.querySelector('#exit-demo-link').href = exitDemoUrl.href;
    }
    setupState.hidden = true;
    siteShell.hidden = false;
    films = snapshot.films;
    buildGenreFilter();
    const username = snapshotUsername;
    const profileUrl = safeUrl(snapshot.profile_url, ['letterboxd.com']) || `https://letterboxd.com/${encodeURIComponent(username)}/`;
    const profileLink = document.querySelector('#profile-link');
    profileLink.href = profileUrl;
    profileLink.setAttribute('aria-label', `Letterboxd profile for ${username}, opens in a new tab`);
    document.querySelector('#profile-username').textContent = username;
    document.querySelector('#profile-stamp').textContent = username;
    const footerProfileLink = document.querySelector('#footer-profile-link');
    footerProfileLink.href = profileUrl;
    footerProfileLink.textContent = `${username} on Letterboxd ↗`;
    footerProfileLink.setAttribute('aria-label', `Letterboxd profile for ${username}, opens in a new tab`);
    document.title = `ReelRank — ${username}`;
    document.querySelector('#tmdb-credit').hidden = !(snapshot.tmdb_match_count > 0);
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
    document.querySelector('#collection-footnote').textContent = `Showing the top ${displayed.toLocaleString()} of ${rankedTotal.toLocaleString()} ranked films. Your public liked lists, watched status, and source-list links appear here; this site is public.`;
    render();
  } catch (error) {
    setupTitle.textContent = 'This site is still being prepared';
    setupCopy.textContent = 'The username configuration or film snapshot could not be loaded. Check that the initial refresh has completed, then try again.';
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
  activeGenres = [];
  visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
  searchInput.focus();
});
clearGenresButton.addEventListener('click', () => {
  activeGenres = [];
  visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
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
