const grid = document.querySelector('#film-grid');
const filmLedgerView = document.querySelector('#film-ledger-view');
const filmLedgerRows = document.querySelector('#film-ledger-rows');
const topBilled = document.querySelector('#top-billed');
const topBilledFeature = document.querySelector('#top-billed-feature');
const topBilledGrid = document.querySelector('#top-billed-grid');
const statusMessage = document.querySelector('#status-message');
const posterDisplayButton = document.querySelector('#poster-display-button');
const ledgerDisplayButton = document.querySelector('#ledger-display-button');
const directorFilmography = document.querySelector('#director-filmography');
const searchInput = document.querySelector('#search-input');
const loadMoreButton = document.querySelector('#load-more');
const sortSelect = document.querySelector('#sort-select');
const countrySelect = document.querySelector('#country-select');
const decadeOptions = document.querySelector('#decade-options');
const genreFilter = document.querySelector('#genre-filter');
const genreFilterTrigger = document.querySelector('#genre-filter > summary');
const genreFilterSummary = document.querySelector('#genre-filter-summary');
const genreOptions = document.querySelector('#genre-options');
const genreSearchInput = document.querySelector('#genre-search');
const genreEmptyState = document.querySelector('#genre-empty-state');
const clearGenresButton = document.querySelector('#clear-genres');
const closeGenresButton = document.querySelector('#close-genres');
const selectedGenres = document.querySelector('#selected-genres');
const activeViewTools = document.querySelector('#active-view-tools');
const activeGenreFilters = document.querySelector('#active-genre-filters');
const activeDirectorFilters = document.querySelector('#active-director-filters');
const collectionScope = document.querySelector('#collection-scope');
const topBilledEyebrow = document.querySelector('#top-billed-eyebrow');
const topBilledTitle = document.querySelector('#top-billed-title');
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
const validViews = new Set(['posters', 'ledger']);
let films = [];
let activeFilter = readUrlState().filter;
let activeSort = readUrlState().sort;
let activeView = readUrlState().view;
let activeGenres = readUrlState().genres;
let activeDirectors = readUrlState().directors;
let activeCountry = readUrlState().country;
let activeDecade = readUrlState().decade;
let availableGenres = [];
let availableDirectors = [];
let availableDecades = [];
let rankedTotal = 0;
let visibleLimit = 40;
let searchUrlTimer;
let searchEditing = false;
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
    directors: [...new Set(params.getAll('director'))],
    country: params.get('country') || '',
    decade: /^\d{4}$/.test(params.get('decade') || '') ? Number(params.get('decade')) : '',
    view: validViews.has(params.get('view')) ? params.get('view') : 'posters',
  };
}

function syncControls() {
  sortSelect.value = activeSort;
  countrySelect.value = activeCountry;
  posterDisplayButton.classList.toggle('is-active', activeView === 'posters');
  posterDisplayButton.setAttribute('aria-pressed', String(activeView === 'posters'));
  ledgerDisplayButton.classList.toggle('is-active', activeView === 'ledger');
  ledgerDisplayButton.setAttribute('aria-pressed', String(activeView === 'ledger'));
  decadeOptions.querySelectorAll('[data-decade]').forEach((button) => {
    const selected = button.dataset.decade === (activeDecade === '' ? '' : String(activeDecade));
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('.filter-button').forEach((button) => {
    const selected = button.dataset.filter === activeFilter;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  genreOptions.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = activeGenres.includes(input.value);
  });
  genreFilterSummary.textContent = activeGenres.length
    ? `${activeGenres[0]}${activeGenres.length > 1 ? ` +${activeGenres.length - 1}` : ''}`
    : 'Any';
  clearGenresButton.hidden = activeGenres.length === 0;
  renderSelectedGenres();
  renderActiveViewFilters();
}

function renderSelectedGenres() {
  selectedGenres.replaceChildren();
  if (activeGenres.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'selected-genres-empty';
    empty.textContent = 'No genres selected';
    selectedGenres.append(empty);
    return;
  }
  activeGenres.forEach((genre) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'selected-genre-chip';
    chip.textContent = `${genre} ×`;
    chip.setAttribute('aria-label', `Remove ${genre} genre filter`);
    chip.addEventListener('click', () => toggleGenre(genre));
    selectedGenres.append(chip);
  });
}

function renderActiveViewFilters() {
  const hasActiveView = Boolean(searchInput.value.trim()) || activeFilter !== 'all' || activeSort !== 'rank'
    || activeGenres.length > 0 || activeDirectors.length > 0 || Boolean(activeCountry) || activeDecade !== '';
  activeViewTools.hidden = !hasActiveView;
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
  activeDirectorFilters.replaceChildren();
  activeDirectorFilters.hidden = activeDirectors.length === 0;
  activeDirectors.forEach((director) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'active-genre-chip';
    chip.textContent = `Director: ${director} ×`;
    chip.setAttribute('aria-label', `Remove ${director} director filter`);
    chip.addEventListener('click', () => toggleDirector(director));
    activeDirectorFilters.append(chip);
  });
  if (activeCountry) appendFacetChip(activeGenreFilters, `Country: ${activeCountry}`, 'Remove production country filter', () => setCountry(''));
  if (activeDecade !== '') appendFacetChip(activeGenreFilters, `${activeDecade}s`, 'Remove decade filter', () => setDecade(''));
}

function appendFacetChip(container, label, ariaLabel, onRemove) {
  container.hidden = false;
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'active-genre-chip';
  chip.textContent = `${label} ×`;
  chip.setAttribute('aria-label', ariaLabel);
  chip.addEventListener('click', onRemove);
  container.append(chip);
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
    count.className = 'genre-option-count';
    count.textContent = counts.get(genre).toLocaleString();
    label.append(checkbox, name, count);
    genreOptions.append(label);
  });
  updateGenreOptionVisibility();
  buildCatalogFilters();
  syncControls();
}

function buildCatalogFilters() {
  const countries = [...new Set(films.flatMap((film) => Array.isArray(film.countries) ? film.countries : []))]
    .filter((country) => typeof country === 'string' && country.trim())
    .sort((left, right) => left.localeCompare(right));
  const decadeCounts = new Map();
  films.forEach((film) => {
    const decade = filmDecade(film);
    if (decade !== null) decadeCounts.set(decade, (decadeCounts.get(decade) || 0) + 1);
  });
  const decades = [...decadeCounts.keys()].sort((a, b) => a - b);
  availableDecades = decades;
  countrySelect.replaceChildren(new Option('Any country', ''), ...countries.map((country) => new Option(country, country)));
  const allEras = document.createElement('button');
  allEras.type = 'button';
  allEras.className = 'decade-option decade-option-all';
  allEras.dataset.decade = '';
  allEras.setAttribute('aria-pressed', 'true');
  allEras.append(decadeOptionLabel('All eras', films.length));
  decadeOptions.replaceChildren(allEras, ...decades.map((decade) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'decade-option';
    button.dataset.decade = String(decade);
    button.setAttribute('aria-pressed', 'false');
    button.append(decadeOptionLabel(`${decade}s`, decadeCounts.get(decade)));
    return button;
  }));
  activeCountry = countries.includes(activeCountry) ? activeCountry : '';
  activeDecade = decades.includes(Number(activeDecade)) ? Number(activeDecade) : '';
  availableDirectors = [...new Set(films.flatMap((film) => Array.isArray(film.directors) ? film.directors : []))]
    .filter((director) => typeof director === 'string' && director.trim())
    .sort((left, right) => left.localeCompare(right));
  activeDirectors = activeDirectors.filter((director) => availableDirectors.includes(director));
  updateUrlState({ replace: true });
}

function decadeOptionLabel(label, count) {
  const name = document.createElement('span');
  name.className = 'decade-option-label';
  name.textContent = label;
  const total = document.createElement('small');
  total.className = 'decade-option-count';
  total.textContent = count.toLocaleString();
  const fragment = document.createDocumentFragment();
  fragment.append(name, total);
  return fragment;
}

function filmDecade(film) {
  const year = Number.parseInt(film.year, 10);
  return Number.isFinite(year) && year >= 1000 ? Math.floor(year / 10) * 10 : null;
}

function updateGenreOptionVisibility() {
  const query = genreSearchInput.value.trim().toLocaleLowerCase();
  const options = [...genreOptions.querySelectorAll('.genre-option')];
  let visibleCount = 0;
  options.forEach((option) => {
    const matches = option.querySelector('input').value.toLocaleLowerCase().includes(query);
    option.hidden = !matches;
    if (matches) visibleCount += 1;
  });
  genreEmptyState.hidden = visibleCount > 0;
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

function toggleDirector(director) {
  activeDirectors = activeDirectors.includes(director)
    ? activeDirectors.filter((selected) => selected !== director)
    : [...activeDirectors, director].sort((left, right) => left.localeCompare(right));
  visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
  const collectionTitle = document.querySelector('#collection-title');
  collectionTitle.focus({ preventScroll: true });
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  collectionTitle.scrollIntoView({ behavior, block: 'start' });
}

function setCountry(country) {
  activeCountry = country;
  visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
}

function toggleCountry(country) {
  activeCountry = activeCountry === country ? '' : country;
  visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
  const collectionTitle = document.querySelector('#collection-title');
  collectionTitle.focus({ preventScroll: true });
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  collectionTitle.scrollIntoView({ behavior, block: 'start' });
}

function setDecade(decade) {
  activeDecade = decade === '' ? '' : Number(decade);
  visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
}

function setView(view) {
  activeView = validViews.has(view) ? view : 'posters';
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
  url.searchParams.delete('director');
  activeDirectors.forEach((director) => url.searchParams.append('director', director));
  if (activeCountry) url.searchParams.set('country', activeCountry);
  else url.searchParams.delete('country');
  if (activeDecade !== '') url.searchParams.set('decade', String(activeDecade));
  else url.searchParams.delete('decade');
  if (activeView === 'ledger') url.searchParams.set('view', activeView);
  else url.searchParams.delete('view');
  if (url.href === window.location.href) return;
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method]({}, '', url);
}

function queueSearchUrlUpdate() {
  window.clearTimeout(searchUrlTimer);
  searchUrlTimer = window.setTimeout(() => updateUrlState({ replace: true }), 500);
}

function beginSearchEdit() {
  if (searchEditing) return;
  searchEditing = true;
  // Keep the previous committed view in history while the live query replaces
  // the current entry, so Back returns to the prior view instead of each pause.
  window.history.pushState({}, '', window.location.href);
}

function commitSearchEdit() {
  window.clearTimeout(searchUrlTimer);
  if (!searchEditing) return;
  updateUrlState({ replace: true });
  searchEditing = false;
}

function restoreUrlState() {
  window.clearTimeout(searchUrlTimer);
  searchEditing = false;
  const state = readUrlState();
  searchInput.value = state.query;
  activeFilter = state.filter;
  activeSort = state.sort;
  activeView = state.view;
  activeGenres = state.genres.filter((genre) => availableGenres.includes(genre));
  activeDirectors = state.directors.filter((director) => availableDirectors.includes(director));
  activeCountry = state.country && [...countrySelect.options].some((option) => option.value === state.country)
    ? state.country
    : '';
  const decadeValue = state.decade === '' ? '' : String(state.decade);
  activeDecade = decadeValue && availableDecades.includes(Number(decadeValue))
    ? Number(decadeValue)
    : '';
  visibleLimit = 40;
  syncControls();
  updateUrlState({ replace: true });
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
  const elapsedSeconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  let amount;
  let unit;
  if (elapsedSeconds < 45) return `Updated just now · ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)}`;
  if (elapsedSeconds < 90) [amount, unit] = [1, 'minute'];
  else if (elapsedSeconds < 60 * 60) [amount, unit] = [Math.round(elapsedSeconds / 60), 'minute'];
  else if (elapsedSeconds < 90 * 60) [amount, unit] = [1, 'hour'];
  else if (elapsedSeconds < 24 * 60 * 60) [amount, unit] = [Math.round(elapsedSeconds / (60 * 60)), 'hour'];
  else if (elapsedSeconds < 36 * 60 * 60) [amount, unit] = [1, 'day'];
  else if (elapsedSeconds < 30 * 24 * 60 * 60) [amount, unit] = [Math.round(elapsedSeconds / (24 * 60 * 60)), 'day'];
  else if (elapsedSeconds < 45 * 24 * 60 * 60) [amount, unit] = [1, 'month'];
  else if (elapsedSeconds < 365 * 24 * 60 * 60) [amount, unit] = [Math.round(elapsedSeconds / (30 * 24 * 60 * 60)), 'month'];
  else if (elapsedSeconds < 545 * 24 * 60 * 60) [amount, unit] = [1, 'year'];
  else [amount, unit] = [Math.round(elapsedSeconds / (365 * 24 * 60 * 60)), 'year'];
  const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-amount, unit);
  const exactTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  return `Updated ${relativeTime} · ${exactTime}`;
}

function formatEditionDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function matchesSearchAndGenres(film, query, selectedGenreList = activeGenres) {
  const filmGenres = Array.isArray(film.genres) ? film.genres : [];
  if (selectedGenreList.length && !selectedGenreList.some((genre) => filmGenres.includes(genre))) return false;
  const directors = Array.isArray(film.directors) ? film.directors : [];
  if (activeDirectors.length && !activeDirectors.some((director) => directors.includes(director))) return false;
  if (activeCountry && !(Array.isArray(film.countries) && film.countries.includes(activeCountry))) return false;
  if (activeDecade !== '' && filmDecade(film) !== activeDecade) return false;
  if (!query) return true;
  const titleAndYear = `${film.title || ''} ${film.year || ''}`.toLocaleLowerCase();
  const overview = (film.overview || '').toLocaleLowerCase();
  const sourceLists = (film.lists || []).map(listLabel).join(' ').toLocaleLowerCase();
  const genres = filmGenres.join(' ').toLocaleLowerCase();
  const directorNames = directors.join(' ').toLocaleLowerCase();
  return titleAndYear.includes(query) || (film.original_title || '').toLocaleLowerCase().includes(query)
    || overview.includes(query) || sourceLists.includes(query) || genres.includes(query) || directorNames.includes(query);
}

function updateWatchFilterCounts(query) {
  const contextualFilms = films.filter((film) => matchesSearchAndGenres(film, query));
  const watchedCount = contextualFilms.filter((film) => film.watched).length;
  const unwatchedCount = contextualFilms.length - watchedCount;
  document.querySelector('#unwatched-tab-count').textContent = unwatchedCount.toLocaleString();
  document.querySelector('#watched-tab-count').textContent = watchedCount.toLocaleString();
}

function updateGenreOptionCounts(query) {
  const contextFilms = films.filter((film) => {
    if (activeFilter === 'unwatched' && film.watched) return false;
    if (activeFilter === 'watched' && !film.watched) return false;
    return matchesSearchAndGenres(film, query, []);
  });
  genreOptions.querySelectorAll('.genre-option').forEach((option) => {
    const genre = option.querySelector('input').value;
    const count = contextFilms.filter((film) => Array.isArray(film.genres) && film.genres.includes(genre)).length;
    option.querySelector('.genre-option-count').textContent = count.toLocaleString();
  });
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
  const activeView = [
    `${filterLabel} filter`,
    activeGenres.length ? `genres ${activeGenres.join(' or ')}` : '',
    activeDirectors.length ? `directors ${activeDirectors.join(' or ')}` : '',
    activeCountry ? `country ${activeCountry}` : '',
    activeDecade !== '' ? `decade ${activeDecade}s` : '',
    searchInput.value.trim() ? `search ${searchInput.value.trim()}` : '',
    activeSort !== 'rank' ? `sorted by ${sortSelect.options[sortSelect.selectedIndex].text}` : '',
  ].filter(Boolean).join(', ');
  backToFiltersButton.textContent = `${currentShownCount} of ${currentMatchCount} · Filters ↑`;
  backToFiltersButton.setAttribute('aria-label', `Showing ${currentShownCount} of ${currentMatchCount} matching films. ${activeView}. Return to search and filters.`);
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

function genreChipFor(genre) {
  const tag = document.createElement('button');
  tag.type = 'button';
  tag.className = 'genre-tag';
  tag.textContent = genre;
  tag.setAttribute('aria-label', `Filter by ${genre}`);
  tag.setAttribute('aria-pressed', String(activeGenres.includes(genre)));
  tag.addEventListener('click', () => {
    toggleGenre(genre);
    const collectionTitle = document.querySelector('#collection-title');
    collectionTitle.focus({ preventScroll: true });
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    collectionTitle.scrollIntoView({ behavior, block: 'start' });
  });
  return tag;
}

function directorCreditFor(directors, className) {
  if (!directors.length) return null;
  const credit = document.createElement('p');
  credit.className = className;
  credit.append(document.createTextNode('Directed by '));
  directors.forEach((director, index) => {
    if (index) credit.append(document.createTextNode(', '));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'director-filter';
    button.textContent = director;
    button.setAttribute('aria-pressed', String(activeDirectors.includes(director)));
    button.setAttribute('aria-label', `Filter by director ${director}`);
    button.addEventListener('click', () => toggleDirector(director));
    credit.append(button);
  });
  return credit;
}

function languageNameFor(languageCode) {
  if (!languageCode) return '';
  try {
    return new Intl.DisplayNames(undefined, { type: 'language' }).of(languageCode) || languageCode;
  } catch {
    return languageCode;
  }
}

function hasInlineOriginalTitle(film) {
  const originalTitle = typeof film.original_title === 'string' ? film.original_title.trim() : '';
  const languageCode = typeof film.original_language === 'string' ? film.original_language.trim() : '';
  const isNonEnglish = languageCode && languageCode.toLocaleLowerCase().split('-')[0] !== 'en';
  return Boolean(isNonEnglish && originalTitle
    && originalTitle.localeCompare(film.title || '', undefined, { sensitivity: 'accent' }) !== 0);
}

function originalTitleCreditFor(film, className) {
  if (!hasInlineOriginalTitle(film)) return null;
  const languageCode = film.original_language.trim();
  const credit = document.createElement('p');
  credit.className = className;
  credit.setAttribute('role', 'group');
  credit.setAttribute('aria-label', `Original title in ${languageNameFor(languageCode)}`);
  const label = document.createElement('span');
  label.className = 'original-title-credit-label';
  label.textContent = languageCode.toLocaleUpperCase();
  label.setAttribute('aria-hidden', 'true');
  const divider = document.createElement('span');
  divider.className = 'original-title-credit-divider';
  divider.textContent = '·';
  divider.setAttribute('aria-hidden', 'true');
  const title = document.createElement('span');
  title.className = 'original-title-credit-title';
  title.lang = languageCode;
  title.textContent = film.original_title.trim();
  credit.append(label, divider, title);
  return credit;
}

function originalDetailsFor(film) {
  const originalTitle = typeof film.original_title === 'string' ? film.original_title.trim() : '';
  const languageCode = typeof film.original_language === 'string' ? film.original_language.trim() : '';
  const hasDistinctTitle = originalTitle && originalTitle.localeCompare(film.title || '', undefined, { sensitivity: 'accent' }) !== 0;
  if (languageCode.toLocaleLowerCase().split('-')[0] === 'en') return null;
  if (hasInlineOriginalTitle(film)) return null;
  if (!hasDistinctTitle && !languageCode) return null;
  const languageName = languageNameFor(languageCode);
  const details = document.createElement('details');
  details.className = 'film-original-details';
  const summary = document.createElement('summary');
  summary.textContent = 'Original title & language';
  details.append(summary);
  const facts = document.createElement('dl');
  facts.className = 'original-film-facts';
  if (hasDistinctTitle) {
    const titleLabel = document.createElement('dt');
    titleLabel.textContent = 'Original title';
    const titleValue = document.createElement('dd');
    titleValue.lang = languageCode || '';
    titleValue.textContent = originalTitle;
    facts.append(titleLabel, titleValue);
  }
  if (languageCode) {
    const languageLabel = document.createElement('dt');
    languageLabel.textContent = 'Original language';
    const languageValue = document.createElement('dd');
    languageValue.textContent = `${languageName} (${languageCode.toUpperCase()})`;
    facts.append(languageLabel, languageValue);
  }
  details.append(facts);
  return details;
}

function countryRuntimeMetaFor(film, className) {
  const countries = [...new Set(Array.isArray(film.countries) ? film.countries.filter((name) => typeof name === 'string' && name.trim()) : [])];
  const runtime = Number.isInteger(film.runtime_minutes) && film.runtime_minutes > 0 ? film.runtime_minutes : null;
  if (!countries.length && !runtime) return null;

  const meta = document.createElement('p');
  meta.className = className;
  if (countries.length) {
    const countryGroup = document.createElement('span');
    countryGroup.className = 'cinephile-country-group';
    countryGroup.setAttribute('role', 'group');
    countryGroup.setAttribute('aria-label', `Production countries for ${film.title}`);
    const countryButtonFor = (country, className, tabIndex = 0) => {
      const button = document.createElement('button');
      button.className = className;
      button.type = 'button';
      button.textContent = country;
      button.tabIndex = tabIndex;
      button.setAttribute('aria-label', `Filter by production country ${country}`);
      button.setAttribute('aria-pressed', String(activeCountry === country));
      button.addEventListener('click', () => toggleCountry(country));
      return button;
    };
    const primaryCountry = countryButtonFor(countries[0], 'cinephile-country-primary country-filter-button');
    countryGroup.append(primaryCountry);

    if (countries.length > 1) {
      countryGroup.classList.add('has-more');
      const extraCountries = document.createElement('span');
      extraCountries.className = 'cinephile-country-extra';
      extraCountries.setAttribute('aria-hidden', 'true');
      extraCountries.inert = true;
      countries.slice(1).forEach((country, index) => {
        if (index) extraCountries.append(document.createTextNode(', '));
        extraCountries.append(countryButtonFor(country, 'country-filter-button', -1));
      });
      const toggle = document.createElement('button');
      toggle.className = 'country-more-button';
      toggle.type = 'button';
      toggle.textContent = `+${countries.length - 1}`;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', `Show ${countries.length - 1} more ${countries.length === 2 ? 'country' : 'countries'} for ${film.title}`);
      toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') !== 'true';
        extraCountries.setAttribute('aria-hidden', String(!expanded));
        extraCountries.inert = !expanded;
        extraCountries.querySelectorAll('.country-filter-button').forEach((button) => {
          button.tabIndex = expanded ? 0 : -1;
        });
        meta.classList.toggle('is-expanded', expanded);
        countryGroup.classList.toggle('is-expanded', expanded);
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.textContent = expanded ? 'Show fewer' : `+${countries.length - 1}`;
        toggle.setAttribute('aria-label', expanded
          ? `Show fewer countries for ${film.title}`
          : `Show ${countries.length - 1} more ${countries.length === 2 ? 'country' : 'countries'} for ${film.title}`);
      });
      countryGroup.append(toggle, extraCountries);
    }
    meta.append(countryGroup);
  }

  if (runtime) {
    const runtimeLabel = document.createElement('span');
    runtimeLabel.className = 'cinephile-runtime';
    runtimeLabel.textContent = `${runtime} min`;
    meta.append(runtimeLabel);
  }
  return meta;
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
    poster.setAttribute('aria-label', `Open poster for ${film.title}, overall rank ${rankNumber}, ${film.watched ? 'watched' : 'unwatched'}, on Letterboxd, opens in a new tab`);
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
  rank.textContent = activeSort === 'rank' ? `No. ${rankNumber}` : `Overall ${rankNumber}`;
  rank.setAttribute('aria-label', activeSort === 'rank' ? `Catalogue number ${rankNumber}` : `Overall rank ${rankNumber}`);
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

  const originalTitleCredit = originalTitleCreditFor(film, 'original-title-credit');
  if (originalTitleCredit) info.append(originalTitleCredit);

  const directors = [...new Set(Array.isArray(film.directors) ? film.directors.filter((name) => typeof name === 'string' && name.trim()) : [])];
  const directorCredit = directorCreditFor(directors, 'director-credit');
  if (directorCredit) info.append(directorCredit);

  const cinephileMeta = countryRuntimeMetaFor(film, 'cinephile-meta');
  if (cinephileMeta) info.append(cinephileMeta);

  const count = document.createElement('p');
  count.className = 'film-count';
  const countValue = document.createElement('strong');
  const likedListCount = Number(film.liked_in) || 0;
  countValue.textContent = likedListCount.toLocaleString();
  const countLabel = document.createElement('span');
  countLabel.textContent = likedListCount === 1 ? 'list appearance' : 'list appearances';
  count.append(countValue, countLabel);
  count.setAttribute('aria-label', `Overall list-appearance score: ${likedListCount.toLocaleString()}`);
  info.append(count);

  const genres = [...new Set(Array.isArray(film.genres) ? film.genres.filter((genre) => typeof genre === 'string' && genre) : [])];
  if (genres.length) {
    const genreTags = document.createElement('div');
    genreTags.className = 'genre-tags';
    genreTags.setAttribute('role', 'group');
    genreTags.setAttribute('aria-label', `Genres: ${genres.join(', ')}`);
    genres.slice(0, 2).forEach((genre) => genreTags.append(genreChipFor(genre)));
    if (genres.length > 2) {
      const hiddenGenres = genres.slice(2);
      const hiddenTags = hiddenGenres.map((genre) => {
        const tag = genreChipFor(genre);
        tag.classList.add('genre-extra-tag');
        return tag;
      });
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'genre-tag genre-tag-more';
      more.textContent = `+${hiddenGenres.length}`;
      more.setAttribute('aria-expanded', 'false');
      more.setAttribute('aria-label', `Show ${hiddenGenres.length} more ${hiddenGenres.length === 1 ? 'genre' : 'genres'}`);
      more.addEventListener('click', () => {
        const expanded = genreTags.classList.toggle('is-expanded');
        more.textContent = expanded ? '−' : `+${hiddenGenres.length}`;
        more.setAttribute('aria-expanded', String(expanded));
        more.setAttribute('aria-label', expanded ? 'Hide additional genres' : `Show ${hiddenGenres.length} more ${hiddenGenres.length === 1 ? 'genre' : 'genres'}`);
      });
      genreTags.append(more);
      hiddenTags.forEach((tag) => genreTags.append(tag));
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

  const originalDetails = originalDetailsFor(film);
  if (originalDetails) info.append(originalDetails);

  const lists = film.lists || [];
  const listDetails = document.createElement('details');
  listDetails.className = 'list-details';
  const listSummary = document.createElement('summary');
  const listLinks = document.createElement('ol');
  listLinks.className = 'list-links';
  const sourceListLinks = lists.map((url) => {
    const safeListUrl = safeUrl(url, ['letterboxd.com']);
    if (!safeListUrl) return null;
    const item = document.createElement('li');
    item.append(makeLink(listLabel(safeListUrl), safeListUrl));
    return item;
  }).filter(Boolean);
  const visibleListCount = 4;
  listLinks.append(...sourceListLinks.slice(0, visibleListCount));
  const hiddenListLinks = sourceListLinks.slice(visibleListCount);
  hiddenListLinks.forEach((link) => {
    link.hidden = true;
    listLinks.append(link);
  });
  listSummary.textContent = listLinks.childElementCount
    ? `Seen on ${listLinks.childElementCount.toLocaleString()} liked ${listLinks.childElementCount === 1 ? 'list' : 'lists'}`
    : 'Film details';
  listDetails.append(listSummary);
  if (listLinks.childElementCount) listDetails.append(listLinks);
  if (hiddenListLinks.length) {
    const listLinksToggle = document.createElement('button');
    listLinksToggle.className = 'list-links-toggle';
    listLinksToggle.type = 'button';
    listLinksToggle.textContent = `Show all ${sourceListLinks.length.toLocaleString()} lists`;
    listLinksToggle.setAttribute('aria-expanded', 'false');
    listLinksToggle.addEventListener('click', () => {
      const expanded = listLinksToggle.getAttribute('aria-expanded') !== 'true';
      hiddenListLinks.forEach((item) => { item.hidden = !expanded; });
      listLinksToggle.setAttribute('aria-expanded', String(expanded));
      listLinksToggle.textContent = expanded ? 'Show fewer lists' : `Show all ${sourceListLinks.length.toLocaleString()} lists`;
    });
    listDetails.append(listLinksToggle);
  }
  const tmdbUrl = safeUrl(film.tmdb_url, ['themoviedb.org']);
  if (tmdbUrl) listDetails.append(makeLink('Film data on TMDB ↗', tmdbUrl, 'tmdb-film-link'));
  if (listDetails.childElementCount > 1) info.append(listDetails);
  card.append(info);
  return card;
}

function ledgerRowFor(film) {
  const rankNumber = films.indexOf(film) + 1;
  const row = document.createElement('tr');

  const catalogueCell = document.createElement('th');
  catalogueCell.scope = 'row';
  catalogueCell.className = 'ledger-catalogue-number';
  catalogueCell.textContent = `No. ${String(rankNumber).padStart(3, '0')}`;

  const filmCell = document.createElement('td');
  filmCell.className = 'ledger-film-cell';
  const posterUrl = safeUrl(film.poster_url, ['image.tmdb.org', 'ltrbxd.com', 'letterboxd.com']);
  const filmUrl = safeUrl(film.letterboxd_url, ['letterboxd.com']);
  if (posterUrl) {
    const poster = document.createElement(filmUrl ? 'a' : 'span');
    poster.className = 'ledger-poster';
    if (filmUrl) {
      poster.href = filmUrl;
      poster.target = '_blank';
      poster.rel = 'noreferrer';
      poster.setAttribute('aria-label', `Open ${film.title} on Letterboxd, opens in a new tab`);
    }
    const image = document.createElement('img');
    image.src = posterUrl;
    image.alt = '';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    poster.append(image);
    filmCell.append(poster);
  }
  const titleBlock = document.createElement('div');
  titleBlock.className = 'ledger-film-copy';
  const title = document.createElement('h3');
  if (filmUrl) title.append(makeLink(film.title, filmUrl, 'ledger-film-title'));
  else {
    const titleText = document.createElement('span');
    titleText.className = 'ledger-film-title';
    titleText.textContent = film.title;
    title.append(titleText);
  }
  const year = document.createElement('span');
  year.className = 'ledger-film-year';
  year.textContent = film.year || 'Year unknown';
  title.append(year);
  titleBlock.append(title);
  const originalTitleCredit = originalTitleCreditFor(film, 'original-title-credit ledger-original-title-credit');
  if (originalTitleCredit) titleBlock.append(originalTitleCredit);
  filmCell.append(titleBlock);

  const directorCell = document.createElement('td');
  directorCell.className = 'ledger-director-cell';
  const directors = [...new Set(Array.isArray(film.directors) ? film.directors.filter((name) => typeof name === 'string' && name.trim()) : [])];
  if (directors.length) {
    directors.forEach((director, index) => {
      if (index) directorCell.append(document.createTextNode(', '));
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'director-filter';
      button.textContent = director;
      button.setAttribute('aria-pressed', String(activeDirectors.includes(director)));
      button.setAttribute('aria-label', `Filter by director ${director}`);
      button.addEventListener('click', () => toggleDirector(director));
      directorCell.append(button);
    });
  } else directorCell.textContent = '—';

  const productionCell = document.createElement('td');
  productionCell.className = 'ledger-production-cell';
  const production = countryRuntimeMetaFor(film, 'ledger-production');
  if (production) productionCell.append(production);
  else productionCell.textContent = '—';

  const countCell = document.createElement('td');
  countCell.className = 'ledger-appearance-cell';
  const count = document.createElement('strong');
  const likedListCount = Number(film.liked_in) || 0;
  count.textContent = likedListCount.toLocaleString();
  const countLabel = document.createElement('span');
  countLabel.textContent = likedListCount === 1 ? 'list' : 'lists';
  countCell.append(count, countLabel);
  countCell.setAttribute('aria-label', `Overall list-appearance score: ${likedListCount.toLocaleString()}`);

  row.append(catalogueCell, filmCell, directorCell, productionCell, countCell);
  return row;
}

function featuredFilmFor(film) {
  const rankNumber = films.indexOf(film) + 1;
  const filmUrl = safeUrl(film.letterboxd_url, ['letterboxd.com']);
  const backdropUrl = safeUrl(film.backdrop_url, ['image.tmdb.org']);
  const posterUrl = safeUrl(film.poster_url, ['image.tmdb.org', 'ltrbxd.com', 'letterboxd.com']);
  const feature = document.createElement('article');
  feature.className = 'featured-film';

  if (backdropUrl) {
    const backdrop = document.createElement('img');
    backdrop.className = 'featured-film-backdrop';
    backdrop.src = backdropUrl;
    backdrop.alt = '';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.loading = 'eager';
    backdrop.referrerPolicy = 'no-referrer';
    feature.append(backdrop);
  }

  const poster = document.createElement(filmUrl ? 'a' : 'div');
  poster.className = 'featured-film-poster';
  if (filmUrl) {
    poster.href = filmUrl;
    poster.target = '_blank';
    poster.rel = 'noreferrer';
    poster.setAttribute('aria-label', `Open poster for ${film.title}, overall rank ${rankNumber}, ${film.watched ? 'watched' : 'unwatched'}, on Letterboxd, opens in a new tab`);
  }
  if (posterUrl) {
    const image = document.createElement('img');
    image.src = posterUrl;
    image.alt = `Poster for ${film.title}`;
    image.loading = 'eager';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.className = 'poster-fallback';
      fallback.textContent = film.title;
      image.replaceWith(fallback);
    }, { once: true });
    poster.append(image);
  } else {
    const fallback = document.createElement('span');
    fallback.className = 'poster-fallback';
    fallback.textContent = film.title;
    poster.append(fallback);
  }
  const rank = document.createElement('span');
  rank.className = 'rank-chip';
  rank.textContent = activeSort === 'rank' ? `No. ${rankNumber}` : `Overall ${rankNumber}`;
  rank.setAttribute('aria-label', activeSort === 'rank' ? `Catalogue number ${rankNumber}` : `Overall rank ${rankNumber}`);
  poster.append(rank);
  if (film.watched) {
    const watched = document.createElement('span');
    watched.className = 'watched-chip';
    watched.textContent = 'Watched';
    poster.append(watched);
  }
  feature.append(poster);

  const copy = document.createElement('div');
  copy.className = 'featured-film-copy';
  const label = document.createElement('p');
  label.className = 'featured-film-label';
  label.textContent = `Program selection · Overall rank ${rankNumber}`;
  copy.append(label);
  const title = document.createElement('h4');
  if (filmUrl) title.append(makeLink(film.title, filmUrl, 'featured-film-title'));
  else {
    const titleText = document.createElement('span');
    titleText.className = 'featured-film-title';
    titleText.textContent = film.title;
    title.append(titleText);
  }
  const year = document.createElement('span');
  year.className = 'featured-film-year';
  year.textContent = film.year || '';
  title.append(year);
  copy.append(title);

  const originalTitleCredit = originalTitleCreditFor(film, 'original-title-credit featured-original-title-credit');
  if (originalTitleCredit) copy.append(originalTitleCredit);

  const directors = [...new Set(Array.isArray(film.directors) ? film.directors.filter((name) => typeof name === 'string' && name.trim()) : [])];
  const directorCredit = directorCreditFor(directors, 'featured-film-director');
  if (directorCredit) copy.append(directorCredit);
  const featuredFacts = countryRuntimeMetaFor(film, 'featured-film-facts');
  if (featuredFacts) copy.append(featuredFacts);
  if (film.overview) {
    const overview = document.createElement('p');
    overview.className = 'featured-film-overview';
    overview.textContent = film.overview;
    copy.append(overview);
  }
  const count = document.createElement('p');
  count.className = 'featured-film-count';
  const countValue = document.createElement('strong');
  const likedListCount = Number(film.liked_in) || 0;
  countValue.textContent = likedListCount.toLocaleString();
  count.append(countValue, ` ${likedListCount === 1 ? 'list appearance' : 'list appearances'}`);
  count.setAttribute('aria-label', `Overall list-appearance score: ${likedListCount.toLocaleString()}`);
  copy.append(count);
  const sourceLists = (Array.isArray(film.lists) ? film.lists : []).map((url) => safeUrl(url, ['letterboxd.com'])).filter(Boolean);
  if (sourceLists.length) {
    const sources = document.createElement('div');
    sources.className = 'featured-film-sources';
    const sourcesLabel = document.createElement('p');
    sourcesLabel.className = 'featured-film-sources-label';
    sourcesLabel.textContent = 'From the programme of your liked lists';
    const sourceLinks = document.createElement('div');
    sourceLinks.className = 'featured-film-source-links';
    sourceLists.slice(0, 2).forEach((url) => sourceLinks.append(makeLink(listLabel(url), url)));
    sources.append(sourcesLabel, sourceLinks);
    copy.append(sources);
  }
  const originalDetails = originalDetailsFor(film);
  if (originalDetails) copy.append(originalDetails);
  feature.append(copy);
  return feature;
}

function validateSnapshot(snapshot) {
  const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
  const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
  const isStringList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
  const requiredCounts = ['list_count', 'film_count', 'displayed_film_count', 'unwatched_count', 'displayed_unwatched_count', 'tmdb_match_count'];
  const requiredFilmStrings = ['title', 'year', 'letterboxd_title', 'letterboxd_year', 'letterboxd_url', 'poster_url', 'backdrop_url', 'overview', 'tmdb_url'];
  const validFilm = (film) => isRecord(film)
    && requiredFilmStrings.every((field) => typeof film[field] === 'string')
    && film.title.trim().length > 0
    && typeof film.watched === 'boolean'
    && isCount(film.liked_in)
    && isStringList(film.genres)
    && isStringList(film.lists)
    && (film.directors === undefined || isStringList(film.directors))
    && (film.countries === undefined || isStringList(film.countries))
    && (film.original_title === undefined || typeof film.original_title === 'string')
    && (film.original_language === undefined || typeof film.original_language === 'string')
    && (film.runtime_minutes === undefined || film.runtime_minutes === null || (isCount(film.runtime_minutes) && film.runtime_minutes > 0))
    && (film.tmdb_id === null || isCount(film.tmdb_id))
    && (film.tmdb_rating === null || (typeof film.tmdb_rating === 'number' && Number.isFinite(film.tmdb_rating)));

  if (!isRecord(snapshot) || snapshot.schema_version !== 1) {
    throw new Error(`Unsupported snapshot schema version: ${snapshot?.schema_version ?? 'missing'}`);
  }
  if (typeof snapshot.username !== 'string' || !snapshot.username.trim()
      || typeof snapshot.profile_url !== 'string' || !snapshot.profile_url.trim()
      || typeof snapshot.refreshed_at !== 'string' || !snapshot.refreshed_at.trim()
      || requiredCounts.some((field) => !isCount(snapshot[field]))
      || !Array.isArray(snapshot.films) || !snapshot.films.every(validFilm)
      || snapshot.displayed_film_count !== snapshot.films.length
      || snapshot.displayed_film_count > snapshot.film_count
      || snapshot.unwatched_count > snapshot.film_count
      || snapshot.displayed_unwatched_count > snapshot.displayed_film_count
      || snapshot.tmdb_match_count > snapshot.displayed_film_count
      || snapshot.displayed_unwatched_count !== snapshot.films.filter((film) => !film.watched).length) {
    throw new Error('Snapshot does not match schema version 1');
  }
  return snapshot;
}

function renderDirectorFilmography() {
  directorFilmography.replaceChildren();
  directorFilmography.hidden = activeDirectors.length !== 1;
  if (activeDirectors.length !== 1) return;

  const director = activeDirectors[0];
  const titles = films.filter((film) => Array.isArray(film.directors) && film.directors.includes(director));
  const years = titles.map((film) => Number.parseInt(film.year, 10)).filter(Number.isFinite).sort((a, b) => a - b);
  const label = document.createElement('span');
  label.className = 'director-filmography-label';
  label.textContent = 'Filmography';
  const name = document.createElement('strong');
  name.textContent = director;
  const details = document.createElement('span');
  details.className = 'director-filmography-details';
  const yearSpan = years.length
    ? ` · ${years[0] === years[years.length - 1] ? years[0] : `${years[0]}–${years[years.length - 1]}`}`
    : '';
  details.textContent = `${titles.length} ${titles.length === 1 ? 'film' : 'films'} in this catalogue${yearSpan}`;
  directorFilmography.append(label, name, details);
}

function render() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  renderActiveViewFilters();
  renderDirectorFilmography();
  updateWatchFilterCounts(query);
  updateGenreOptionCounts(query);
  const matching = films.filter((film) => {
    if (activeFilter === 'unwatched' && film.watched) return false;
    if (activeFilter === 'watched' && !film.watched) return false;
    return matchesSearchAndGenres(film, query);
  });
  matching.sort((left, right) => compareFilms(left, right));
  const highlighted = matching.slice(0, 3);
  const ledgerView = activeView === 'ledger';
  const shown = matching.slice(0, visibleLimit + (ledgerView ? 0 : highlighted.length));
  currentShownCount = shown.length;
  currentMatchCount = matching.length;
  topBilled.hidden = ledgerView || highlighted.length === 0;
  grid.hidden = ledgerView;
  filmLedgerView.hidden = !ledgerView;
  const defaultRankedView = activeFilter === 'all' && activeSort === 'rank' && !query && activeGenres.length === 0 && activeDirectors.length === 0 && !activeCountry && activeDecade === '';
  topBilledEyebrow.textContent = defaultRankedView ? 'Opening credits' : 'Filtered view';
  topBilledTitle.textContent = defaultRankedView ? 'Most listed' : 'Top results';
  if (ledgerView) {
    filmLedgerRows.replaceChildren(...shown.map((film) => ledgerRowFor(film)));
  } else {
    topBilledFeature.replaceChildren(...(highlighted.length ? [featuredFilmFor(highlighted[0])] : []));
    topBilledGrid.replaceChildren(...highlighted.slice(1).map((film, index) => cardFor(film, index)));
    grid.replaceChildren(...shown.slice(highlighted.length).map((film, index) => cardFor(film, index)));
  }
  document.querySelector('#heading-count').textContent = String(matching.length).padStart(2, '0');
  statusMessage.classList.toggle('is-visible', matching.length === 0);
  const hasFacetFilters = activeGenres.length > 0 || activeDirectors.length > 0 || Boolean(activeCountry) || activeDecade !== '';
  const emptyContext = query && hasFacetFilters
    ? 'this search and the selected filters'
    : query ? 'this search' : 'the selected filters';
  if (films.length === 0) statusMessage.textContent = 'No films are available in this snapshot yet.';
  else if (matching.length === 0 && activeFilter === 'unwatched') {
    statusMessage.textContent = query || hasFacetFilters
      ? `No unwatched films match ${emptyContext}.`
      : 'No unwatched films in this snapshot.';
  } else if (matching.length === 0 && activeFilter === 'watched') {
    statusMessage.textContent = query || hasFacetFilters
      ? `No watched films match ${emptyContext}.`
      : 'No watched films in this snapshot.';
  } else if (matching.length === 0 && query && hasFacetFilters) {
    statusMessage.textContent = 'No films match this search and the selected filters.';
  } else if (matching.length === 0 && query) {
    statusMessage.textContent = 'No films match that search. Try another title.';
  } else if (matching.length === 0 && hasFacetFilters) {
    statusMessage.textContent = 'No films match the selected filters.';
  } else if (matching.length === 0) {
    statusMessage.textContent = 'No films match the current view.';
  }
  loadMoreButton.hidden = matching.length <= shown.length;
  if (!loadMoreButton.hidden) {
    const remaining = matching.length - shown.length;
    loadMoreButton.textContent = `Show ${Math.min(40, remaining)} more films · ${remaining} left`;
  }
  updateBackToFiltersVisibility();
  const resultAnnouncement = document.querySelector('#results-announcement');
  const filterDescription = [activeFilter === 'all' ? '' : `${activeFilter} only`, activeGenres.length ? `genres: ${activeGenres.join(' or ')}` : '', activeDirectors.length ? `directors: ${activeDirectors.join(' or ')}` : '', activeCountry ? `country: ${activeCountry}` : '', activeDecade !== '' ? `decade: ${activeDecade}s` : ''].filter(Boolean).join(', ');
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
    const snapshot = validateSnapshot(await response.json());
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
    document.querySelector('#watched-total').textContent = watchedCount.toLocaleString();
    document.querySelector('#progress-film-total').textContent = rankedTotal.toLocaleString();
    const progress = document.querySelector('#watch-progress');
    progress.max = rankedTotal || 1;
    progress.value = watchedCount;
    const progressPercent = rankedTotal ? Math.round((watchedCount / rankedTotal) * 100) : 0;
    document.querySelector('#watch-progress-percent').textContent = `${progressPercent}% watched`;
    progress.setAttribute('aria-label', `${watchedCount.toLocaleString()} of ${rankedTotal.toLocaleString()} films watched (${progressPercent} percent)`);
  const editionDate = document.querySelector('#refreshed-label');
  editionDate.textContent = formatEditionDate(snapshot.refreshed_at);
  editionDate.title = formatDate(snapshot.refreshed_at);
    const displayed = snapshot.displayed_film_count ?? films.length;
    collectionScope.textContent = `Search covers all ${displayed.toLocaleString()} films by title, original title, director, year, genre, synopsis, and source list. Refine by production country or decade.`;
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
  beginSearchEdit();
  visibleLimit = 40;
  render();
  queueSearchUrlUpdate();
});
searchInput.addEventListener('blur', commitSearchEdit);
sortSelect.addEventListener('change', () => {
  window.clearTimeout(searchUrlTimer);
  activeSort = sortSelect.value;
  visibleLimit = 40;
  updateUrlState();
  render();
});
genreSearchInput.addEventListener('input', updateGenreOptionVisibility);
clearSearchStateButton.addEventListener('click', () => {
  window.clearTimeout(searchUrlTimer);
  searchEditing = false;
  searchInput.value = '';
  genreSearchInput.value = '';
  updateGenreOptionVisibility();
  activeFilter = 'all';
  activeSort = 'rank';
  activeGenres = [];
  activeDirectors = [];
  activeCountry = '';
  activeDecade = '';
  activeView = 'posters';
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
countrySelect.addEventListener('change', () => setCountry(countrySelect.value));
posterDisplayButton.addEventListener('click', () => setView('posters'));
ledgerDisplayButton.addEventListener('click', () => setView('ledger'));
decadeOptions.addEventListener('click', (event) => {
  const button = event.target.closest('[data-decade]');
  if (button) setDecade(button.dataset.decade);
});
closeGenresButton.addEventListener('click', () => {
  genreFilter.open = false;
  genreFilterTrigger.focus();
});
document.addEventListener('pointerdown', (event) => {
  if (genreFilter.open && !genreFilter.contains(event.target)) genreFilter.open = false;
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
  if (event.key === 'Escape' && genreFilter.open) {
    event.preventDefault();
    genreFilter.open = false;
    genreFilterTrigger.focus();
    return;
  }
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === 'Escape' && document.activeElement === searchInput) {
    window.clearTimeout(searchUrlTimer);
    if (!searchEditing && !searchInput.value.trim()) {
      searchInput.blur();
      return;
    }
    if (!searchEditing) beginSearchEdit();
    searchInput.value = '';
    updateUrlState({ replace: true });
    searchEditing = false;
    searchInput.blur();
    render();
  }
  if (event.key === 'Enter' && document.activeElement === searchInput) {
    commitSearchEdit();
    searchInput.blur();
  }
});

window.addEventListener('popstate', restoreUrlState);
searchInput.value = readUrlState().query;
syncControls();
loadSnapshot();
