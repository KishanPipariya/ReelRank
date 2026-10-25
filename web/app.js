import { programmeShare } from './programme-share.js';
import { buildSearchText, compareFilms as compareCatalogFilms, filmDecade, matchesFilm } from './catalog.js';
import { validateSnapshot } from './snapshot.js';
import { cardFor as createFilmCard, updateFilmCard } from './film-components.js';
import { parseUrlState, urlForState } from './url-state.js';
import { createFilterControls } from './filter-controls.js';
import { createFilmViews } from './film-views.js';

const clearQueryButton = document.querySelector('#clear-query');
const emptyResultActions = document.querySelector('#empty-result-actions');
const emptyClearQuery = document.querySelector('#empty-clear-query');
const emptyClearFilters = document.querySelector('#empty-clear-filters');
const selectionEnd = document.querySelector('#selection-end');

const programmeShareDetails = document.querySelector('#programme-share');
const programmeShareDescription = document.querySelector('#programme-share-description');
const programmeShareUrl = document.querySelector('#programme-share-url');
const programmeShareCopy = document.querySelector('#programme-share-copy');
const programmeShareStatus = document.querySelector('#programme-share-status');
let currentShare;
let publicSiteUrl = '';
let shareAttempt = 0;

const grid = document.querySelector('#film-grid');
const filmLedgerView = document.querySelector('#film-ledger-view');
const filmLedgerRows = document.querySelector('#film-ledger-rows');
const topBilled = document.querySelector('#top-billed');
const topBilledFeature = document.querySelector('#top-billed-feature');
const topBilledGrid = document.querySelector('#top-billed-grid');
const statusMessage = document.querySelector('#status-message');
const statusMessageCopy = document.querySelector('#status-message-copy');
const programmeNote = document.querySelector('#programme-note');
const programmeNoteCopy = document.querySelector('#programme-note-copy');
const posterDisplayButton = document.querySelector('#poster-display-button');
const ledgerDisplayButton = document.querySelector('#ledger-display-button');
const printProgrammeButton = document.querySelector('#print-programme-button');
const printFormatSelect = document.querySelector('#print-format-select');
const countryIndexToggle = document.querySelector('#country-index-toggle');
const countryIndex = document.querySelector('.country-index');
const countryIndexHeading = document.querySelector('.country-index-heading');
const countryIndexSearch = document.querySelector('#country-index-search');
const countryIndexSearchControl = document.querySelector('#country-index-search-control');
const countryIndexEmpty = document.querySelector('#country-index-empty');
const directorFilmography = document.querySelector('#director-filmography');
const printProgrammeTitle = document.querySelector('#print-programme-title');
const printProgrammeUsername = document.querySelector('#print-programme-username');
const printProgrammeDate = document.querySelector('#print-programme-date');
const printProgrammeContainer = document.querySelector('#print-programme');
const printProgrammeContext = document.querySelector('#print-programme-context');
const printProgrammeFilms = document.querySelector('#print-programme-films');
const filmDetailDialog = document.querySelector('#film-detail-dialog');
const filmDetailContent = document.querySelector('#film-detail-content');
const filmDetailClose = document.querySelector('#film-detail-close');
const posterViewerDialog = document.querySelector('#poster-viewer-dialog');
const posterViewerImage = document.querySelector('#poster-viewer-image');
const posterViewerTitle = document.querySelector('#poster-viewer-title');
const posterViewerCaption = document.querySelector('#poster-viewer-caption');
const posterViewerZoom = document.querySelector('#poster-viewer-zoom');
const posterViewerClose = document.querySelector('#poster-viewer-close');
const posterViewerStatus = document.querySelector('#poster-viewer-status');
const posterViewerGallery = document.querySelector('#poster-viewer-gallery');
const searchInput = document.querySelector('#search-input');
const loadMoreButton = document.querySelector('#load-more');
const sortSelect = document.querySelector('#sort-select');
const countryIndexOptions = document.querySelector('#country-index-options');
const decadeOptions = document.querySelector('#decade-options');
const runtimeFilter = document.querySelector('#runtime-filter');
const runtimeOptions = document.querySelector('#runtime-options');
const genreFilter = document.querySelector('#genre-filter');
const genreFilterTrigger = document.querySelector('#genre-filter > summary');
const genreFilterSummary = document.querySelector('#genre-filter-summary');
const genreOptions = document.querySelector('#genre-options');
const genreSearchInput = document.querySelector('#genre-search');
const genreEmptyState = document.querySelector('#genre-empty-state');
const clearGenresButton = document.querySelector('#clear-genres');
const closeGenresButton = document.querySelector('#close-genres');
const sourceListFilter = document.querySelector('#source-list-filter');
const sourceListFilterSummary = document.querySelector('#source-list-filter-summary');
const catalogFilterCount = document.querySelector('#catalog-filter-count');
const sourceListOptions = document.querySelector('#source-list-options');
const sourceListSearch = document.querySelector('#source-list-search');
const sourceListEmpty = document.querySelector('#source-list-empty');
const selectedSourceLists = document.querySelector('#selected-source-lists');
const clearSourceListsButton = document.querySelector('#clear-source-lists');
const closeSourceListsButton = document.querySelector('#close-source-lists');
const selectedGenres = document.querySelector('#selected-genres');
const catalogFilters = document.querySelector('#catalog-filters');
const catalogFiltersTrigger = document.querySelector('#catalog-filters > summary');
const activeViewTools = document.querySelector('#active-view-tools');
const activeGenreFilters = document.querySelector('#active-genre-filters');
const activeDirectorFilters = document.querySelector('#active-director-filters');
const activeSourceListFilters = document.querySelector('#active-source-list-filters');
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
let films = [];
const rankByFilm = new Map();
const state = {
  ...parseUrlState(window.location.search),
  visibleLimit: 40,
  searchEditing: false,
};
let availableGenres = [];
let availableDirectors = [];
let availableDecades = [];
let availableCountries = [];
let availableSourceLists = [];
const sourceListUrlsByFilm = new WeakMap();
const searchTextByFilm = new WeakMap();
const filmCardByFilm = new WeakMap();
let rankedTotal = 0;
let searchUrlTimer;
let currentShownCount = 0;
let currentMatchCount = 0;
let currentMatchingFilms = [];
let currentHighestScore = 1;
let countryAtlasSize = 0;
let snapshotRefreshedAt = '';

function setCountryIndexExpanded(expanded) {
  countryIndex.classList.toggle('is-expanded', expanded);
  countryIndexOptions.classList.toggle('is-expanded', expanded);
  countryIndexSearchControl.hidden = !expanded;
  if (!expanded) countryIndexSearch.value = '';
  countryIndexHeading.textContent = expanded ? 'Production countries' : 'Leading production countries';
  countryIndexToggle.setAttribute('aria-expanded', String(expanded));
  countryIndexToggle.textContent = expanded ? 'Show leading six' : `Browse all ${countryAtlasSize}`;
  updateCountryIndexVisibility();
}

function updateCountryIndexVisibility() {
  const expanded = countryIndexOptions.classList.contains('is-expanded');
  const query = countryIndexSearch.value.trim().toLocaleLowerCase();
  let visibleCount = 0;
  countryIndexOptions.querySelectorAll('[data-country]').forEach((button, index) => {
    const inLeadingSix = index < 6;
    const matchesSearch = button.dataset.country.toLocaleLowerCase().includes(query);
    button.hidden = (!expanded && !inLeadingSix) || !matchesSearch;
    if (!button.hidden) visibleCount += 1;
  });
  countryIndexEmpty.hidden = !expanded || visibleCount > 0;
}

const filterControls = createFilterControls({
  state,
  sources: () => availableSourceLists,
  elements: {
    sortSelect, countryIndexOptions, countryIndexSearch, posterDisplayButton, ledgerDisplayButton,
    decadeOptions, runtimeOptions, genreOptions, genreFilterSummary, clearGenresButton, selectedGenres,
    sourceListOptions, sourceListFilterSummary, catalogFilterCount, clearSourceListsButton, selectedSourceLists,
    activeViewTools, activeGenreFilters, activeDirectorFilters, activeSourceListFilters, searchInput,
  },
  actions: {
    toggleGenre, toggleDirector, toggleSourceList, setCountry, setDecade, setRuntime, setCountryIndexExpanded,
  },
});
const { syncControls } = filterControls;

function buildGenreFilter() {
  const counts = new Map();
  films.forEach((film) => {
    [...new Set(Array.isArray(film.genres) ? film.genres : [])].forEach((genre) => {
      if (typeof genre === 'string' && genre.trim()) counts.set(genre, (counts.get(genre) || 0) + 1);
    });
  });
  availableGenres = [...counts.keys()].sort((left, right) => left.localeCompare(right));
  state.genres = state.genres.filter((genre) => availableGenres.includes(genre));
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
  const sourceListCounts = new Map();
  films.forEach((film) => {
    const urls = filmSourceListUrls(film);
    sourceListUrlsByFilm.set(film, urls);
    urls.forEach((url) => {
      sourceListCounts.set(url, (sourceListCounts.get(url) || 0) + 1);
    });
  });
  availableSourceLists = [...sourceListCounts]
    .map(([url, count]) => ({ url, count, label: listLabel(url) }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  state.sourceLists = [...new Set(state.sourceLists.map(sourceListUrl).filter((url) => sourceListCounts.has(url)))];
  sourceListFilter.hidden = availableSourceLists.length === 0;
  sourceListOptions.replaceChildren(...availableSourceLists.map((sourceList) => {
    const option = document.createElement('label');
    option.className = 'genre-option';
    option.dataset.sourceList = sourceList.url;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = sourceList.url;
    checkbox.addEventListener('change', () => toggleSourceList(sourceList.url));
    const name = document.createElement('span');
    name.textContent = sourceList.label;
    const count = document.createElement('small');
    count.className = 'genre-option-count';
    count.textContent = sourceList.count.toLocaleString();
    option.append(checkbox, name, count);
    return option;
  }));
  updateSourceListOptionVisibility();

  const countryCounts = new Map();
  films.forEach((film) => {
    [...new Set(Array.isArray(film.countries) ? film.countries : [])].forEach((country) => {
      if (typeof country === 'string' && country.trim()) countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
    });
  });
  const countries = [...countryCounts.keys()]
    .filter((country) => typeof country === 'string' && country.trim())
    .sort((left, right) => left.localeCompare(right));
  availableCountries = countries;
  const decadeCounts = new Map();
  films.forEach((film) => {
    const decade = filmDecade(film);
    if (decade !== null) decadeCounts.set(decade, (decadeCounts.get(decade) || 0) + 1);
  });
  const decades = [...decadeCounts.keys()].sort((a, b) => a - b);
  availableDecades = decades;
  const countryAtlas = [...countryCounts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  countryAtlasSize = countryAtlas.length;
  countryIndexOptions.replaceChildren(...countryAtlas.map(([country, count], index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'country-index-option';
    button.hidden = index >= 6;
    button.dataset.country = country;
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `Filter by production country ${country}, ${count} films`);
    const name = document.createElement('span');
    name.textContent = country;
    const total = document.createElement('small');
    total.textContent = count.toLocaleString();
    button.append(name, total);
    button.addEventListener('click', () => toggleCountry(country));
    return button;
  }));
  countryIndexToggle.hidden = countryAtlasSize <= 6;
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
  state.country = countries.includes(state.country) ? state.country : '';
  state.decade = decades.includes(Number(state.decade)) ? Number(state.decade) : '';
  runtimeFilter.hidden = !films.some((film) => Number.isInteger(film.runtime_minutes) && film.runtime_minutes > 0);
  if (runtimeFilter.hidden) state.runtime = '';
  const selectedCountryIndex = countryAtlas.findIndex(([country]) => country === state.country);
  setCountryIndexExpanded(selectedCountryIndex >= 6);
  availableDirectors = [...new Set(films.flatMap((film) => Array.isArray(film.directors) ? film.directors : []))]
    .filter((director) => typeof director === 'string' && director.trim())
    .sort((left, right) => left.localeCompare(right));
  state.directors = state.directors.filter((director) => availableDirectors.includes(director));
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

function scoreMeterFor(film, className) {
  const score = Number(film.liked_in) || 0;
  const meter = document.createElement('span');
  meter.className = className;
  meter.setAttribute('aria-hidden', 'true');
  meter.style.setProperty('--score-share', `${Math.max(0, Math.min(100, (score / currentHighestScore) * 100))}%`);
  meter.append(document.createElement('span'));
  return meter;
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
  state.genres = state.genres.includes(genre)
    ? state.genres.filter((selected) => selected !== genre)
    : [...state.genres, genre].sort((left, right) => left.localeCompare(right));
  state.visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
}

function toggleSourceList(url) {
  state.sourceLists = state.sourceLists.includes(url)
    ? state.sourceLists.filter((selected) => selected !== url)
    : [...state.sourceLists, url].sort((left, right) => left.localeCompare(right));
  state.visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
}

function updateSourceListOptionVisibility() {
  const query = sourceListSearch.value.trim().toLocaleLowerCase();
  let visibleCount = 0;
  sourceListOptions.querySelectorAll('.genre-option').forEach((option) => {
    const matches = option.querySelector('span').textContent.toLocaleLowerCase().includes(query);
    option.hidden = !matches;
    if (matches) visibleCount += 1;
  });
  sourceListEmpty.hidden = visibleCount > 0;
}

function toggleDirector(director) {
  state.directors = state.directors.includes(director)
    ? state.directors.filter((selected) => selected !== director)
    : [...state.directors, director].sort((left, right) => left.localeCompare(right));
  state.visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
  const collectionTitle = document.querySelector('#collection-title');
  collectionTitle.focus({ preventScroll: true });
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  collectionTitle.scrollIntoView({ behavior, block: 'start' });
}

function setCountry(country) {
  state.country = country;
  state.visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
}

function toggleCountry(country) {
  state.country = state.country === country ? '' : country;
  state.visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
  const collectionTitle = document.querySelector('#collection-title');
  collectionTitle.focus({ preventScroll: true });
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  collectionTitle.scrollIntoView({ behavior, block: 'start' });
}

function setDecade(decade) {
  state.decade = decade === '' ? '' : Number(decade);
  state.visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
}

function setRuntime(runtime) {
  state.runtime = runtime;
  state.visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
}

function setView(view) {
  state.view = view === 'ledger' ? 'ledger' : 'posters';
  state.visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
}

function updateUrlState({ replace = false } = {}) {
  const query = searchInput.value.trim();
  state.query = query;
  const url = urlForState(window.location.href, {
    filter: state.filter, sort: state.sort, genres: state.genres, directors: state.directors,
    sourceLists: state.sourceLists, country: state.country, decade: state.decade, runtime: state.runtime, view: state.view,
  }, query);
  if (url.href === window.location.href) return;
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method]({}, '', url);
}

function queueSearchUrlUpdate() {
  window.clearTimeout(searchUrlTimer);
  searchUrlTimer = window.setTimeout(() => updateUrlState({ replace: true }), 500);
}

function beginSearchEdit() {
  if (state.searchEditing) return;
  state.searchEditing = true;
  // Keep the previous committed view in history while the live query replaces
  // the current entry, so Back returns to the prior view instead of each pause.
  window.history.pushState({}, '', window.location.href);
}

function commitSearchEdit() {
  window.clearTimeout(searchUrlTimer);
  if (!state.searchEditing) return;
  updateUrlState({ replace: true });
  state.searchEditing = false;
}

function restoreUrlState() {
  window.clearTimeout(searchUrlTimer);
  state.searchEditing = false;
  Object.assign(state, parseUrlState(window.location.search));
  searchInput.value = state.query;
  state.genres = state.genres.filter((genre) => availableGenres.includes(genre));
  state.directors = state.directors.filter((director) => availableDirectors.includes(director));
  state.sourceLists = state.sourceLists.map(sourceListUrl).filter((url) => availableSourceLists.some((sourceList) => sourceList.url === url));
  state.country = availableCountries.includes(state.country)
    ? state.country
    : '';
  const decadeValue = state.decade === '' ? '' : String(state.decade);
  state.decade = decadeValue && availableDecades.includes(Number(decadeValue))
    ? Number(decadeValue)
    : '';
  if (runtimeFilter.hidden) state.runtime = '';
  state.visibleLimit = 40;
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

function sourceListUrl(value) {
  const safeListUrl = safeUrl(value, ['letterboxd.com']);
  if (!safeListUrl) return '';
  const url = new URL(safeListUrl);
  url.search = '';
  url.hash = '';
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url.href;
}

function filmSourceListUrls(film) {
  if (sourceListUrlsByFilm.has(film)) return sourceListUrlsByFilm.get(film);
  return [...new Set((Array.isArray(film.lists) ? film.lists : []).map(sourceListUrl).filter(Boolean))];
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

function editionColophonFor(catalogue) {
  const decadeCounts = new Map();
  const countryCounts = new Map();
  catalogue.forEach((film) => {
    const decade = filmDecade(film);
    if (decade !== null) decadeCounts.set(decade, (decadeCounts.get(decade) || 0) + 1);
    [...new Set(Array.isArray(film.countries) ? film.countries : [])].forEach((country) => {
      if (typeof country === 'string' && country.trim()) countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
    });
  });
  const leadingDecade = [...decadeCounts].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0];
  const leadingCountry = [...countryCounts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  return {
    decade: leadingDecade ? `${leadingDecade[0]}s` : 'Unavailable',
    country: leadingCountry ? leadingCountry[0] : 'Unavailable',
  };
}

function programmeNoteFor(catalogue) {
  const decadeCounts = new Map();
  const countryCounts = new Map();
  const genreCounts = new Map();
  catalogue.forEach((film) => {
    const decade = filmDecade(film);
    if (decade !== null) decadeCounts.set(decade, (decadeCounts.get(decade) || 0) + 1);
    [...new Set(Array.isArray(film.countries) ? film.countries : [])].forEach((country) => {
      if (typeof country === 'string' && country.trim()) countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
    });
    [...new Set(Array.isArray(film.genres) ? film.genres : [])].forEach((genre) => {
      if (typeof genre === 'string' && genre.trim()) genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
    });
  });
  const leadingDecade = [...decadeCounts].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0];
  const leadingCountry = [...countryCounts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  const leadingGenre = [...genreCounts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  const details = [
    leadingGenre ? `Most common genre: ${leadingGenre[0]}` : '',
    leadingDecade ? `Most represented decade: ${leadingDecade[0]}s` : '',
    leadingCountry ? `Most common country: ${leadingCountry[0]}` : '',
  ].filter(Boolean);
  return `${catalogue.length.toLocaleString()} ${catalogue.length === 1 ? 'film' : 'films'}${details.length ? ` · ${details.join(' · ')}` : ''}`;
}

function matchesSearchAndGenres(
  film,
  query,
  selectedGenreList = state.genres,
  selectedSourceListUrls = state.sourceLists,
  { country = state.country, decade = state.decade } = {},
) {
  let searchText = searchTextByFilm.get(film);
  if (!searchText) {
    searchText = buildSearchText(film, (film.lists || []).map(listLabel));
    searchTextByFilm.set(film, searchText);
  }
  return matchesFilm(film, {
    query,
    genres: selectedGenreList,
    directors: state.directors,
    sourceLists: selectedSourceListUrls,
    country,
    decade,
    runtime: state.runtime,
  }, filmSourceListUrls(film), [], searchText);
}

function matchesWatchFilter(film) {
  return state.filter === 'all' || (state.filter === 'watched' ? film.watched : !film.watched);
}

function updateWatchFilterCounts(query) {
  const contextualFilms = films.filter((film) => matchesSearchAndGenres(film, query));
  const watchedCount = contextualFilms.filter((film) => film.watched).length;
  const unwatchedCount = contextualFilms.length - watchedCount;
  document.querySelector('#unwatched-tab-count').textContent = unwatchedCount.toLocaleString();
  document.querySelector('#watched-tab-count').textContent = watchedCount.toLocaleString();
}

function updateCountryAndDecadeCounts(query) {
  const filmsForCountries = films.filter((film) => matchesWatchFilter(film)
    && matchesSearchAndGenres(film, query, state.genres, state.sourceLists, { country: '' }));
  const countryCounts = new Map();
  filmsForCountries.forEach((film) => {
    [...new Set(Array.isArray(film.countries) ? film.countries : [])].forEach((country) => {
      if (typeof country === 'string' && country.trim()) countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
    });
  });
  countryIndexOptions.querySelectorAll('[data-country]').forEach((button) => {
    const count = countryCounts.get(button.dataset.country) || 0;
    button.querySelector('small').textContent = count.toLocaleString();
    button.setAttribute('aria-label', `Filter by production country ${button.dataset.country}, ${count} ${count === 1 ? 'film' : 'films'}`);
  });

  const filmsForDecades = films.filter((film) => matchesWatchFilter(film)
    && matchesSearchAndGenres(film, query, state.genres, state.sourceLists, { decade: '' }));
  const decadeCounts = new Map();
  filmsForDecades.forEach((film) => {
    const decade = filmDecade(film);
    if (decade !== null) decadeCounts.set(decade, (decadeCounts.get(decade) || 0) + 1);
  });
  decadeOptions.querySelectorAll('[data-decade]').forEach((button) => {
    const count = button.dataset.decade === ''
      ? filmsForDecades.length
      : decadeCounts.get(Number(button.dataset.decade)) || 0;
    button.querySelector('.decade-option-count').textContent = count.toLocaleString();
  });
}

function updateGenreOptionCounts(query) {
  const contextFilms = films.filter((film) => {
    if (!matchesWatchFilter(film)) return false;
    return matchesSearchAndGenres(film, query, []);
  });
  genreOptions.querySelectorAll('.genre-option').forEach((option) => {
    const genre = option.querySelector('input').value;
    const count = contextFilms.filter((film) => Array.isArray(film.genres) && film.genres.includes(genre)).length;
    option.querySelector('.genre-option-count').textContent = count.toLocaleString();
  });
}

function updateSourceListOptionCounts(query) {
  const contextFilms = films.filter((film) => {
    if (!matchesWatchFilter(film)) return false;
    return matchesSearchAndGenres(film, query, state.genres, []);
  });
  const counts = new Map();
  contextFilms.forEach((film) => {
    filmSourceListUrls(film).forEach((url) => counts.set(url, (counts.get(url) || 0) + 1));
  });
  sourceListOptions.querySelectorAll('.genre-option').forEach((option) => {
    const url = option.dataset.sourceList;
    option.querySelector('.genre-option-count').textContent = (counts.get(url) || 0).toLocaleString();
  });
}

function cardFor(film, index) {
  let card = filmCardByFilm.get(film);
  if (!card) {
    card = createFilmCard(film, index, {
      films, state, safeUrl, makeLink, directorCreditFor, countryRuntimeMetaFor,
      scoreMeterFor, genreChipFor, filmDetailButtonFor,
    });
    filmCardByFilm.set(film, card);
  }
  updateFilmCard(card, film, index, state, rankByFilm.get(film) + 1, currentHighestScore);
  return card;
}

function compareFilms(left, right, sort = state.sort) {
  return compareCatalogFilms(left, right, sort, rankByFilm);
}

function updateBackToFiltersVisibility() {
  backToFiltersButton.hidden = currentShownCount === 0 || window.scrollY < 600;
  const filterLabel = state.filter === 'all' ? 'All films' : `${state.filter[0].toLocaleUpperCase()}${state.filter.slice(1)}`;
  const viewDescription = [
    `${filterLabel} filter`,
    state.genres.length ? `genres ${state.genres.join(' or ')}` : '',
    state.directors.length ? `directors ${state.directors.join(' or ')}` : '',
    state.sourceLists.length ? `source lists ${state.sourceLists.map((url) => availableSourceLists.find((item) => item.url === url)?.label).filter(Boolean).join(' or ')}` : '',
    state.country ? `country ${state.country}` : '',
    state.decade !== '' ? `decade ${state.decade}s` : '',
    state.runtime ? `running time ${state.runtime === 'under-90' ? 'under 90 minutes' : state.runtime === '90-120' ? '90 to 120 minutes' : 'over 120 minutes'}` : '',
    searchInput.value.trim() ? `search ${searchInput.value.trim()}` : '',
    state.sort !== 'rank' ? `sorted by ${sortSelect.options[sortSelect.selectedIndex].text}` : '',
  ].filter(Boolean).join(', ');
  backToFiltersButton.textContent = `${currentShownCount} of ${currentMatchCount} · Filters ↑`;
  backToFiltersButton.setAttribute('aria-label', `Showing ${currentShownCount} of ${currentMatchCount} matching films. ${viewDescription}. Return to search and filters.`);
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
  tag.dataset.genre = genre;
  tag.textContent = genre;
  tag.setAttribute('aria-label', `Filter by ${genre}`);
  tag.setAttribute('aria-pressed', String(state.genres.includes(genre)));
  tag.addEventListener('click', () => {
    toggleGenre(genre);
    const collectionTitle = document.querySelector('#collection-title');
    collectionTitle.focus({ preventScroll: true });
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    collectionTitle.scrollIntoView({ behavior, block: 'start' });
  });
  return tag;
}

function directorCreditFor(directors, className, beforeFilter) {
  if (!directors.length) return null;
  const credit = document.createElement('p');
  credit.className = className;
  credit.append(document.createTextNode('Directed by '));
  directors.forEach((director, index) => {
    if (index) credit.append(document.createTextNode(', '));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'director-filter';
    button.dataset.director = director;
    button.textContent = director;
    button.setAttribute('aria-pressed', String(state.directors.includes(director)));
    button.setAttribute('aria-label', `Filter by director ${director}`);
    button.addEventListener('click', () => {
      beforeFilter?.();
      toggleDirector(director);
    });
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

function originalFilmFactsFor(film) {
  const originalTitle = typeof film.original_title === 'string' ? film.original_title.trim() : '';
  const languageCode = typeof film.original_language === 'string' ? film.original_language.trim() : '';
  const hasDistinctTitle = originalTitle && originalTitle.localeCompare(film.title || '', undefined, { sensitivity: 'accent' }) !== 0;
  if (languageCode.toLocaleLowerCase().split('-')[0] === 'en') return null;
  if (!hasDistinctTitle && !languageCode) return null;
  const languageName = languageNameFor(languageCode);
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
  return facts;
}

function countryRuntimeMetaFor(film, className, { beforeFilter } = {}) {
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
      button.dataset.country = country;
      button.tabIndex = tabIndex;
      button.setAttribute('aria-label', `Filter by production country ${country}`);
      button.setAttribute('aria-pressed', String(state.country === country));
      button.addEventListener('click', () => {
        beforeFilter?.();
        toggleCountry(country);
      });
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

function sourceListNotesFor(film, visibleCount = 4) {
  const sourceListUrls = [...new Set((Array.isArray(film.lists) ? film.lists : []).map(sourceListUrl).filter(Boolean))];
  if (!sourceListUrls.length) return null;
  const section = document.createElement('section');
  section.className = 'film-note-section film-note-sources';
  const heading = document.createElement('h4');
  heading.textContent = `List provenance · ${sourceListUrls.length.toLocaleString()} ${sourceListUrls.length === 1 ? 'list' : 'lists'}`;
  const list = document.createElement('ol');
  list.className = 'list-links film-note-list-links';
  const entries = sourceListUrls.map((url) => {
    const item = document.createElement('li');
    item.append(makeLink(listLabel(url), url));
    return item;
  });
  list.append(...entries.slice(0, visibleCount));
  const hiddenEntries = entries.slice(visibleCount);
  hiddenEntries.forEach((entry) => {
    entry.hidden = true;
    list.append(entry);
  });
  section.append(heading, list);
  if (hiddenEntries.length) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'list-links-toggle';
    toggle.textContent = `Show all ${sourceListUrls.length.toLocaleString()} lists`;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      hiddenEntries.forEach((entry) => { entry.hidden = !expanded; });
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? 'Show fewer lists' : `Show all ${sourceListUrls.length.toLocaleString()} lists`;
    });
    section.append(toggle);
  }
  return section;
}

function filmProgrammeNotesFor(film, { includeOriginalFacts = true } = {}) {
  const notes = document.createElement('section');
  notes.className = 'film-notes';
  notes.setAttribute('aria-label', 'Programme notes');
  const body = document.createElement('div');
  body.className = 'film-notes-body';
  if (film.overview) {
    const section = document.createElement('section');
    section.className = 'film-note-section';
    const heading = document.createElement('h4');
    heading.textContent = 'Synopsis';
    const synopsis = document.createElement('p');
    synopsis.className = 'film-note-synopsis';
    synopsis.textContent = film.overview;
    section.append(heading, synopsis);
    body.append(section);
  }
  const originalFacts = includeOriginalFacts ? originalFilmFactsFor(film) : null;
  if (originalFacts) {
    const section = document.createElement('section');
    section.className = 'film-note-section';
    const heading = document.createElement('h4');
    heading.textContent = 'Original title & language';
    section.append(heading, originalFacts);
    body.append(section);
  }
  const sourceNotes = sourceListNotesFor(film);
  if (sourceNotes) body.append(sourceNotes);
  if (!body.childElementCount) return null;
  const heading = document.createElement('h3');
  heading.className = 'film-notes-heading';
  heading.textContent = 'Programme notes';
  notes.append(heading, body);
  return notes;
}

const filmViews = createFilmViews({
  getFilms: () => films,
  state,
  safeUrl,
  makeLink,
  directorCreditFor,
  countryRuntimeMetaFor,
  scoreMeterFor,
  genreChipFor,
  filmDetailButtonFor,
  toggleDirector,
  toggleGenre,
  originalFilmFactsFor,
  sourceListNotesFor,
  filmProgrammeNotesFor,
  filmDetailContent,
  filmDetailDialog,
  posterViewerDialog,
  posterViewerImage,
  posterViewerTitle,
  posterViewerCaption,
  posterViewerZoom,
  posterViewerClose,
  posterViewerStatus,
  posterViewerGallery,
  getSnapshotRefreshedAt: () => snapshotRefreshedAt,
  getCurrentMatchingFilms: () => currentMatchingFilms,
});

function filmDetailButtonFor(film) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'film-detail-trigger';
  button.textContent = 'Read programme notes';
  button.setAttribute('aria-label', `Read programme notes for ${film.title}`);
  button.addEventListener('click', () => filmViews.openFilmDetails(film));
  return button;
}

function posterGridItemsFor(shownFilms) {
  const items = [];
  const groupByYear = state.sort === 'year-newest' || state.sort === 'year-oldest';
  let previousYear = null;
  shownFilms.forEach((film, index) => {
    const year = film.year?.trim() || 'Year unknown';
    if (groupByYear && year !== previousYear) {
      const divider = document.createElement('h3');
      divider.className = 'film-year-divider';
      const label = document.createElement('span');
      label.textContent = 'Release year';
      const value = document.createElement('strong');
      value.textContent = year;
      divider.append(label, value);
      items.push(divider);
      previousYear = year;
    }
    items.push(cardFor(film, index));
  });
  return items;
}

function programmeHeadingFor(query, defaultRankedView, matching) {
  if (defaultRankedView) return { eyebrow: 'Opening credits', title: 'Most listed' };
  if (state.directors.length === 1) return { eyebrow: 'Filmography in this edition', title: state.directors[0] };
  if (state.directors.length > 1) return { eyebrow: 'Director programme', title: `${state.directors.length} selected directors` };
  if (state.sourceLists.length === 1) {
    const sourceList = availableSourceLists.find((item) => item.url === state.sourceLists[0]);
    if (sourceList) return { eyebrow: 'From a liked list', title: sourceList.label };
  }
  if (state.sourceLists.length > 1) return { eyebrow: 'Liked-list programme', title: `${state.sourceLists.length} selected lists` };
  if (state.country && state.decade !== '') {
    return { eyebrow: 'National cinema retrospective', title: `${state.country} · ${state.decade}s` };
  }
  if (state.country) return { eyebrow: 'National cinema', title: state.country };
  if (state.decade !== '') return { eyebrow: 'Decade retrospective', title: `${state.decade}s` };
  if (state.runtime) {
    const title = state.runtime === 'under-90' ? 'Under 90 minutes' : state.runtime === '90-120' ? '90–120 minutes' : 'Over 120 minutes';
    return { eyebrow: 'By running time', title };
  }
  if (state.genres.length) {
    const title = state.genres.slice(0, 2).join(' · ');
    return { eyebrow: 'Genre programme', title: state.genres.length > 2 ? `${title} +${state.genres.length - 2}` : title };
  }
  if (query) {
    const phrase = searchInput.value.trim();
    return { eyebrow: 'Search results', title: phrase.length > 38 ? `${phrase.slice(0, 35)}…` : phrase };
  }
  if (state.filter === 'watched') return { eyebrow: 'Watched collection', title: 'Films seen' };
  if (state.filter === 'unwatched') return { eyebrow: 'Watchlist programme', title: 'Films to discover' };
  if (state.sort === 'year-newest') return { eyebrow: 'Chronological programme', title: 'Newest first' };
  if (state.sort === 'year-oldest') return { eyebrow: 'Chronological programme', title: 'Oldest first' };
  if (state.sort === 'title') return { eyebrow: 'Alphabetical programme', title: 'A–Z' };
  return { eyebrow: 'Your current programme', title: `${matching.length} films` };
}

function buildPrintProgramme() {
  const readerEdition = printFormatSelect.value === 'reader';
  printProgrammeContainer.classList.toggle('print-programme-reader', readerEdition);
  document.querySelector('#print-programme-kicker').textContent = readerEdition
    ? 'ReelRank · Reader’s edition'
    : 'ReelRank · Catalogue edition';
  const filmsForProgramme = [...currentMatchingFilms].sort((left, right) => compareFilms(left, right, 'year-oldest'));
  printProgrammeTitle.textContent = topBilledTitle.textContent || 'ReelRank programme';
  printProgrammeUsername.textContent = document.querySelector('#profile-username').textContent;
  printProgrammeDate.textContent = formatEditionDate(snapshotRefreshedAt);
  printProgrammeDate.dateTime = snapshotRefreshedAt;
  const activeFilters = [
    state.filter === 'all' ? '' : `${state.filter} films`,
    state.directors.length ? `directors: ${state.directors.join(' / ')}` : '',
    state.sourceLists.length ? `liked lists: ${state.sourceLists.map((url) => availableSourceLists.find((item) => item.url === url)?.label).filter(Boolean).join(' / ')}` : '',
    state.country ? `country: ${state.country}` : '',
    state.decade !== '' ? `decade: ${state.decade}s` : '',
    state.runtime ? `runtime: ${state.runtime === 'under-90' ? 'under 90 min' : state.runtime === '90-120' ? '90–120 min' : 'over 120 min'}` : '',
    state.genres.length ? `genres: ${state.genres.join(' / ')}` : '',
    searchInput.value.trim() ? `search: ${searchInput.value.trim()}` : '',
  ].filter(Boolean);
  const selectedView = activeFilters.length ? `Selected view: ${activeFilters.join(' · ')}` : 'Full catalogue';
  printProgrammeContext.textContent = `${filmsForProgramme.length} ${filmsForProgramme.length === 1 ? 'film' : 'films'} · Arranged by release year · ${selectedView}`;
  printProgrammeFilms.replaceChildren();

  if (!filmsForProgramme.length) {
    const empty = document.createElement('p');
    empty.className = 'print-programme-empty';
    empty.textContent = 'No films match this programme.';
    printProgrammeFilms.append(empty);
    return;
  }

  let currentYear = null;
  let yearList = null;
  filmsForProgramme.forEach((film) => {
    const year = film.year?.trim() || 'Year unknown';
    if (year !== currentYear) {
      const chapter = document.createElement('section');
      chapter.className = 'print-year-chapter';
      const heading = document.createElement('h2');
      heading.textContent = year;
      yearList = document.createElement('ol');
      yearList.className = 'print-year-films';
      chapter.append(heading, yearList);
      printProgrammeFilms.append(chapter);
      currentYear = year;
    }

    const entry = document.createElement('li');
    entry.className = 'print-film-entry';
    const catalogueNumber = document.createElement('span');
    catalogueNumber.className = 'print-film-number';
    catalogueNumber.textContent = `No. ${String(films.indexOf(film) + 1).padStart(3, '0')}`;
    const details = document.createElement('div');
    details.className = 'print-film-details';
    const title = document.createElement('h3');
    title.textContent = film.title;
    const credits = document.createElement('p');
    credits.className = 'print-film-credits';
    const facts = [];
    const directors = [...new Set(Array.isArray(film.directors) ? film.directors : [])];
    if (directors.length) facts.push(`Directed by ${directors.join(', ')}`);
    const countries = [...new Set(Array.isArray(film.countries) ? film.countries : [])];
    if (countries.length) facts.push(countries.join(', '));
    if (Number.isInteger(film.runtime_minutes) && film.runtime_minutes > 0) facts.push(`${film.runtime_minutes} min`);
    const language = typeof film.original_language === 'string' ? film.original_language.trim() : '';
    const originalTitle = typeof film.original_title === 'string' ? film.original_title.trim() : '';
    const isNonEnglish = language && language.toLocaleLowerCase().split('-')[0] !== 'en';
    const hasDistinctOriginalTitle = originalTitle && originalTitle.localeCompare(film.title || '', undefined, { sensitivity: 'accent' }) !== 0;
    if (isNonEnglish && hasDistinctOriginalTitle) facts.push(`Original title: ${originalTitle}`);
    if (isNonEnglish) facts.push(`Original language: ${languageNameFor(language)}`);
    if (film.watched) facts.push('Watched');
    credits.textContent = facts.join(' · ');
    details.append(title, credits);
    const score = document.createElement('p');
    score.className = 'print-film-score';
    const scoreValue = document.createElement('strong');
    const likedIn = Number(film.liked_in) || 0;
    scoreValue.textContent = likedIn.toLocaleString();
    score.append(scoreValue, ` ${likedIn === 1 ? 'list appearance' : 'list appearances'}`);
    entry.append(catalogueNumber, details, score);
    if (readerEdition && typeof film.overview === 'string' && film.overview.trim()) {
      const synopsis = document.createElement('p');
      synopsis.className = 'print-film-synopsis';
      const overview = film.overview.trim();
      if (overview.length <= 260) synopsis.textContent = overview;
      else {
        const excerpt = overview.slice(0, 260);
        const lastSpace = excerpt.lastIndexOf(' ');
        synopsis.textContent = `${excerpt.slice(0, lastSpace > 180 ? lastSpace : 260).replace(/[.,;:!?]$/, '')}…`;
      }
      entry.append(synopsis);
    }
    yearList.append(entry);
  });
}

function printProgramme() {
  buildPrintProgramme();
  window.print();
}

function renderDirectorFilmography() {
  directorFilmography.replaceChildren();
  directorFilmography.hidden = state.directors.length !== 1;
  if (state.directors.length !== 1) return;

  const director = state.directors[0];
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
  const heading = document.createElement('div');
  heading.className = 'director-filmography-heading';
  heading.append(label, name, details);
  const timeline = document.createElement('div');
  timeline.className = 'director-career-timeline';
  timeline.setAttribute('role', 'group');
  timeline.setAttribute('aria-label', `Films by ${director}, linked by release year`);
  [...titles].sort((left, right) => compareFilms(left, right, 'year-oldest')).forEach((film) => {
    const year = film.year || '—';
    const filmUrl = safeUrl(film.letterboxd_url, ['letterboxd.com']);
    const marker = document.createElement(filmUrl ? 'a' : 'span');
    marker.className = 'director-career-year';
    marker.textContent = year;
    marker.title = `${film.title} (${year})`;
    marker.setAttribute('aria-label', `${film.title}, ${year}${filmUrl ? ', opens on Letterboxd in a new tab' : ''}`);
    if (filmUrl) {
      marker.href = filmUrl;
      marker.target = '_blank';
      marker.rel = 'noreferrer';
    }
    timeline.append(marker);
  });
  directorFilmography.append(heading, timeline);
}

function updateProgrammeShare() {
  const next = programmeShare(window.location.href, state, searchInput.value, availableSourceLists, publicSiteUrl);
  if (next.url !== currentShare?.url || next.description !== currentShare?.description) {
    shareAttempt += 1;
    programmeShareStatus.textContent = '';
  }
  currentShare = next;
  programmeShareDescription.textContent = next.description;
  programmeShareUrl.value = next.url;
}

programmeShareDetails.addEventListener('toggle', () => {
  if (programmeShareDetails.open) updateProgrammeShare();
});
programmeShareUrl.addEventListener('focus', () => programmeShareUrl.select());
programmeShareCopy.addEventListener('click', async () => {
  updateProgrammeShare();
  const attempt = ++shareAttempt;
  const text = currentShare.url;
  try {
    await navigator.clipboard.writeText(text);
    if (attempt === shareAttempt) programmeShareStatus.textContent = 'Programme link copied.';
  } catch {
    if (attempt !== shareAttempt) return;
    programmeShareStatus.textContent = 'Select and copy the programme link below the description.';
    programmeShareUrl.focus();
    programmeShareUrl.select();
  }
});

function render() {
  updateProgrammeShare();
  const query = searchInput.value.trim().toLocaleLowerCase();
  clearQueryButton.hidden = !query;
  filterControls.renderActiveViewFilters();
  renderDirectorFilmography();
  updateWatchFilterCounts(query);
  updateCountryAndDecadeCounts(query);
  updateGenreOptionCounts(query);
  updateSourceListOptionCounts(query);
  const matching = films.filter((film) => {
    if (!matchesWatchFilter(film)) return false;
    return matchesSearchAndGenres(film, query);
  });
  matching.sort((left, right) => compareFilms(left, right));
  currentMatchingFilms = matching;
  programmeNote.hidden = matching.length === 0;
  programmeNoteCopy.textContent = programmeNoteFor(matching);
  currentHighestScore = Math.max(1, ...matching.map((film) => Number(film.liked_in) || 0));
  const ledgerView = state.view === 'ledger';
  const rankedPosterView = !ledgerView && state.sort === 'rank';
  const highlighted = rankedPosterView ? matching.slice(0, 3) : [];
  const shown = matching.slice(0, state.visibleLimit + highlighted.length);
  currentShownCount = shown.length;
  currentMatchCount = matching.length;
  topBilled.hidden = !rankedPosterView || highlighted.length === 0;
  grid.hidden = ledgerView;
  filmLedgerView.hidden = !ledgerView;
  const defaultRankedView = state.filter === 'all' && state.sort === 'rank' && !query && state.genres.length === 0 && state.directors.length === 0 && state.sourceLists.length === 0 && !state.country && state.decade === '' && !state.runtime;
  const programmeHeading = programmeHeadingFor(query, defaultRankedView, matching);
  topBilledEyebrow.textContent = programmeHeading.eyebrow;
  topBilledTitle.textContent = programmeHeading.title;
  if (ledgerView) {
    filmLedgerRows.replaceChildren(...filmViews.ledgerRowsFor(shown));
  } else if (rankedPosterView) {
    topBilledFeature.replaceChildren(...(highlighted.length ? [filmViews.featuredFilmFor(highlighted[0])] : []));
    topBilledGrid.replaceChildren(...highlighted.slice(1).map((film, index) => cardFor(film, index)));
    grid.replaceChildren(...posterGridItemsFor(shown.slice(highlighted.length)));
  } else {
    grid.replaceChildren(...posterGridItemsFor(shown));
  }
  document.querySelector('#heading-count').textContent = String(matching.length).padStart(2, '0');
  statusMessage.classList.toggle('is-visible', matching.length === 0);
  const hasFacetFilters = state.genres.length > 0 || state.directors.length > 0 || state.sourceLists.length > 0 || Boolean(state.country) || state.decade !== '' || Boolean(state.runtime);
  const emptyContext = query && hasFacetFilters
    ? 'this search and the selected filters'
    : query ? 'this search' : 'the selected filters';
  if (films.length === 0) statusMessageCopy.textContent = 'No films are available in this snapshot yet.';
  else if (matching.length === 0 && state.filter === 'unwatched') {
    statusMessageCopy.textContent = query || hasFacetFilters
      ? `No unwatched films match ${emptyContext}.`
      : 'No unwatched films in this snapshot.';
  } else if (matching.length === 0 && state.filter === 'watched') {
    statusMessageCopy.textContent = query || hasFacetFilters
      ? `No watched films match ${emptyContext}.`
      : 'No watched films in this snapshot.';
  } else if (matching.length === 0 && query && hasFacetFilters) {
    statusMessageCopy.textContent = 'No films match this search and the selected filters.';
  } else if (matching.length === 0 && query) {
    statusMessageCopy.textContent = 'No films match that search. Try another title.';
  } else if (matching.length === 0 && hasFacetFilters) {
    statusMessageCopy.textContent = 'No films match the selected filters.';
  } else if (matching.length === 0) {
    statusMessageCopy.textContent = 'No films match the current view.';
  }
  const canClearFilters = hasFacetFilters || state.filter !== 'all';
  emptyResultActions.hidden = matching.length !== 0 || (!query && !canClearFilters);
  emptyClearQuery.hidden = !query;
  emptyClearFilters.hidden = !canClearFilters;
  selectionEnd.hidden = matching.length === 0 || shown.length < matching.length;
  selectionEnd.textContent = `End of this selection · ${matching.length} ${matching.length === 1 ? 'film' : 'films'}`;
  loadMoreButton.hidden = matching.length <= shown.length;
  if (!loadMoreButton.hidden) {
    const remaining = matching.length - shown.length;
    loadMoreButton.textContent = `Show ${Math.min(40, remaining)} more films · ${remaining} left`;
  }
  updateBackToFiltersVisibility();
  const resultAnnouncement = document.querySelector('#results-announcement');
  const filterDescription = [state.filter === 'all' ? '' : `${state.filter} only`, state.genres.length ? `genres: ${state.genres.join(' or ')}` : '', state.directors.length ? `directors: ${state.directors.join(' or ')}` : '', state.sourceLists.length ? `source lists: ${state.sourceLists.map((url) => availableSourceLists.find((sourceList) => sourceList.url === url)?.label).filter(Boolean).join(' or ')}` : '', state.country ? `country: ${state.country}` : '', state.decade !== '' ? `decade: ${state.decade}s` : '', state.runtime ? `runtime: ${state.runtime === 'under-90' ? 'under 90 minutes' : state.runtime === '90-120' ? '90 to 120 minutes' : 'over 120 minutes'}` : ''].filter(Boolean).join(', ');
  const sortDescription = state.sort === 'rank' ? '' : `, sorted by ${sortSelect.options[sortSelect.selectedIndex].text}`;
  resultAnnouncement.textContent = `Showing ${shown.length} of ${matching.length} matching ${matching.length === 1 ? 'film' : 'films'}${filterDescription ? `, ${filterDescription}` : ''}${sortDescription}${query ? ` for ${searchInput.value.trim()}` : ''}.`;
}

async function loadSnapshot() {
  try {
    const configResponse = await fetch('/site-config.json', { cache: 'no-store' });
    if (!configResponse.ok) throw new Error(`Site configuration request failed: ${configResponse.status}`);
    const config = await configResponse.json();
    const configuredUsername = typeof config.letterboxd_username === 'string' ? config.letterboxd_username.trim() : '';
    publicSiteUrl = typeof config.public_site_url === 'string' ? config.public_site_url.trim() : '';
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
    rankByFilm.clear();
    films.forEach((film, index) => rankByFilm.set(film, index));
    snapshotRefreshedAt = snapshot.refreshed_at;
    const colophon = editionColophonFor(films);
    document.querySelector('#edition-leading-decade').textContent = colophon.decade;
    document.querySelector('#edition-leading-country').textContent = colophon.country;
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
    collectionScope.textContent = `Search covers all ${displayed.toLocaleString()} films by title, original title, director, year, genre, synopsis, and source list. Filter by liked list, production country, or decade.`;
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
    state.filter = button.dataset.filter;
    state.visibleLimit = 40;
    syncControls();
    updateUrlState();
    render();
  });
});

function clearQuery() {
  beginSearchEdit();
  searchInput.value = '';
  state.visibleLimit = 40;
  commitSearchEdit();
  render();
  searchInput.focus();
}
clearQueryButton.addEventListener('click', clearQuery);
emptyClearQuery.addEventListener('click', clearQuery);
emptyClearFilters.addEventListener('click', () => {
  state.filter = 'all';
  state.genres = [];
  state.directors = [];
  state.sourceLists = [];
  state.country = '';
  state.decade = '';
  state.runtime = '';
  state.visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
  searchInput.focus();
});

searchInput.addEventListener('input', () => {
  beginSearchEdit();
  state.visibleLimit = 40;
  render();
  queueSearchUrlUpdate();
});
searchInput.addEventListener('blur', commitSearchEdit);
sortSelect.addEventListener('change', () => {
  window.clearTimeout(searchUrlTimer);
  state.sort = sortSelect.value;
  state.visibleLimit = 40;
  updateUrlState();
  render();
});
genreSearchInput.addEventListener('input', updateGenreOptionVisibility);
clearSearchStateButton.addEventListener('click', () => {
  window.clearTimeout(searchUrlTimer);
  state.searchEditing = false;
  searchInput.value = '';
  genreSearchInput.value = '';
  sourceListSearch.value = '';
  updateSourceListOptionVisibility();
  updateGenreOptionVisibility();
  state.filter = 'all';
  state.sort = 'rank';
  state.genres = [];
  state.directors = [];
  state.sourceLists = [];
  state.country = '';
  state.decade = '';
  state.runtime = '';
  state.view = 'posters';
  state.visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
  searchInput.focus();
});
clearGenresButton.addEventListener('click', () => {
  state.genres = [];
  state.visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
});
sourceListSearch.addEventListener('input', updateSourceListOptionVisibility);
clearSourceListsButton.addEventListener('click', () => {
  state.sourceLists = [];
  state.visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
});
countryIndexToggle.addEventListener('click', () => {
  setCountryIndexExpanded(countryIndexToggle.getAttribute('aria-expanded') !== 'true');
});
countryIndexSearch.addEventListener('input', updateCountryIndexVisibility);
posterDisplayButton.addEventListener('click', () => setView('posters'));
ledgerDisplayButton.addEventListener('click', () => setView('ledger'));
printProgrammeButton.addEventListener('click', printProgramme);
filmDetailClose.addEventListener('click', () => filmDetailDialog.close());
filmDetailDialog.addEventListener('click', (event) => {
  if (event.target === filmDetailDialog) filmDetailDialog.close();
});
decadeOptions.addEventListener('click', (event) => {
  const button = event.target.closest('[data-decade]');
  if (button) setDecade(button.dataset.decade);
});
runtimeOptions.addEventListener('click', (event) => {
  const button = event.target.closest('[data-runtime]');
  if (button) setRuntime(button.dataset.runtime);
});
closeGenresButton.addEventListener('click', () => {
  genreFilter.open = false;
  genreFilterTrigger.focus();
});
closeSourceListsButton.addEventListener('click', () => {
  sourceListFilter.open = false;
  sourceListFilter.querySelector('summary').focus();
});
document.addEventListener('pointerdown', (event) => {
  if (genreFilter.open && !genreFilter.contains(event.target)) genreFilter.open = false;
  if (sourceListFilter.open && !sourceListFilter.contains(event.target)) sourceListFilter.open = false;
});
loadMoreButton.addEventListener('click', () => {
  state.visibleLimit += 40;
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
  if (event.key === 'Escape' && sourceListFilter.open) {
    event.preventDefault();
    sourceListFilter.open = false;
    sourceListFilter.querySelector('summary').focus();
    return;
  }
  if (event.key === 'Escape' && catalogFilters.open) {
    event.preventDefault();
    catalogFilters.open = false;
    catalogFiltersTrigger.focus();
    return;
  }
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === 'Escape' && document.activeElement === searchInput) {
    window.clearTimeout(searchUrlTimer);
    if (!state.searchEditing && !searchInput.value.trim()) {
      searchInput.blur();
      return;
    }
    if (!state.searchEditing) beginSearchEdit();
    searchInput.value = '';
    updateUrlState({ replace: true });
    state.searchEditing = false;
    searchInput.blur();
    render();
  }
  if (event.key === 'Enter' && document.activeElement === searchInput) {
    commitSearchEdit();
    searchInput.blur();
  }
});

window.addEventListener('popstate', restoreUrlState);
searchInput.value = state.query;
syncControls();
loadSnapshot();
