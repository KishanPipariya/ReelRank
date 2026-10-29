import { programmeShare } from './programme-share.js';
import { buildSearchText, compareFilms as compareCatalogFilms, filmDecade, matchesFilm } from './catalog.js';
import { snapshotLoadErrorMessage, validateSnapshot } from './snapshot.js';
import { cardFor as createFilmCard, updateFilmCard } from './film-components.js';
import { parseUrlState, urlForState } from './url-state.js';
import { createFilterControls } from './filter-controls.js';
import { createFilmViews } from './film-views.js';
import { countCountriesAndDecades, countGenres, countSourceLists } from './facet-counts.js';
import { createProgrammePrinter } from './print-programme.js';
import { createLocalPreferences } from './local-preferences.js';
import { compareRelevance } from './catalog.js';
import { createFilmNavigation, filmDetailUrl } from './film-navigation.js';
import { updateEditionFreshness } from './edition-freshness.js';
import { downloadCatalogueCsv } from './catalogue-download.js';
import { bindSavedViewControls } from './saved-views.js';
import { loadFullRanking } from './ranking-csv.js';

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
let activeSnapshot = null;

const grid = document.querySelector('#film-grid');
const filmLedgerView = document.querySelector('#film-ledger-view');
const filmLedgerRows = document.querySelector('#film-ledger-rows');
const topBilled = document.querySelector('#top-billed');
const topBilledFeature = document.querySelector('#top-billed-feature');
const topBilledGrid = document.querySelector('#top-billed-grid');
const statusMessage = document.querySelector('#status-message');
const statusMessageCopy = document.querySelector('#status-message-copy');
const topBilledMobileLayout = window.matchMedia('(max-width: 700px)');
function placeTopBilledForViewport() {
  const collection = document.querySelector('#collection');
  if (topBilledMobileLayout.matches) {
    collection.classList.add('has-leading-feature');
    collection.prepend(topBilled);
  } else {
    collection.classList.remove('has-leading-feature');
    document.querySelector('.catalogue-results').insertBefore(topBilled, statusMessage);
  }
}
placeTopBilledForViewport();
topBilledMobileLayout.addEventListener('change', placeTopBilledForViewport);
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
const languageIndex = document.querySelector('#language-index');
const languageIndexOptions = document.querySelector('#language-index-options');
const languageIndexHeading = document.querySelector('#language-index-heading');
const languageIndexToggle = document.querySelector('#language-index-toggle');
const languageIndexSearch = document.querySelector('#language-index-search');
const languageIndexSearchControl = document.querySelector('#language-index-search-control');
const languageIndexEmpty = document.querySelector('#language-index-empty');
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
const searchScopeLabel = document.querySelector('label[for="search-input"]');
const searchHelp = document.querySelector('#search-help');
const searchFieldsCopy = 'title, year, director, genre, synopsis, and source list';
searchHelp.textContent = 'Results follow the selected sort. Press slash to focus search; Escape to clear it.';
const loadMoreButton = document.querySelector('#load-more');
let arrivingCardsFromIndex = Number.POSITIVE_INFINITY;
const sortSelect = document.querySelector('#sort-select');
const countryIndexOptions = document.querySelector('#country-index-options');
const decadeOptions = document.querySelector('#decade-options');
const decadeIndexToggle = document.querySelector('#decade-index-toggle');
const decadeIndexSearch = document.querySelector('#decade-index-search');
const decadeIndexSearchControl = document.querySelector('#decade-index-search-control');
const decadeIndexEmpty = document.querySelector('#decade-index-empty');
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
const catalogueDataStatus = document.querySelector('#catalogue-data-status');
const retryRankingLoadButton = document.querySelector('#retry-ranking-load');
const metadataFilterScope = document.querySelector('#metadata-filter-scope');
const matchingFilmsCount = document.querySelector('#matching-films-count');
const genreOptionsToggle = document.querySelector('#genre-options-toggle');
const sourceListOptionsToggle = document.querySelector('#source-list-options-toggle');
const topBilledEyebrow = document.querySelector('#top-billed-eyebrow');
const topBilledTitle = document.querySelector('#top-billed-title');
const backToFiltersButton = document.querySelector('#back-to-filters');
const clearSearchStateButton = document.querySelector('#clear-search-state');
const setupState = document.querySelector('#setup-state');
const retryButton = document.querySelector('#retry-loading');
const setupTitle = document.querySelector('#setup-title');
const setupCopy = document.querySelector('#setup-copy');
const demoPreviewLink = document.querySelector('#demo-preview-link');
const siteShell = document.querySelector('#site-shell');
const demoBanner = document.querySelector('#demo-banner');
let films = [];
const originalPosterByFilm = new WeakMap();
const rankByFilm = new Map();
const preferences = createLocalPreferences();
const readPreferences = preferences.read;
let invalidatePreferencesUndo = () => {};
const savePreferences = (patch) => {
  const saved = preferences.save(patch);
  if (saved) invalidatePreferencesUndo();
  return saved;
};
const replacePreferences = preferences.replace;
const storedPreferences = readPreferences();
const urlParamsAtStart = new URLSearchParams(window.location.search);
const urlHasState = ['q', 'filter', 'sort', 'genre', 'director', 'list', 'country', 'language', 'decade', 'runtime', 'view'].some((key) => urlParamsAtStart.has(key));
const state = {
  ...parseUrlState(window.location.search),
  ...(!urlHasState && ['posters', 'ledger'].includes(storedPreferences.view) ? { view: storedPreferences.view } : {}),
  visibleLimit: 40,
  searchEditing: false,
};
let filmNavigation;
function openFilmDetailsFromUi(film, options) { filmNavigation.openFromUi(film, options); }
function restoreFilmFromUrl() { filmNavigation.restoreFromUrl(); }
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
let languageAtlasSize = 0;
const facetQuickPickLimit = 4;
let leadingDecades = [];
let snapshotRefreshedAt = '';
let posterGalleryUrl = '/data/poster-galleries.json';
let sourceListsForDownload = [];

function setCountryIndexExpanded(expanded) {
  countryIndex.classList.toggle('is-expanded', expanded);
  countryIndexOptions.classList.toggle('is-expanded', expanded);
  countryIndexSearchControl.hidden = !expanded;
  if (!expanded) countryIndexSearch.value = '';
  countryIndexHeading.textContent = expanded ? 'Production countries' : 'Most common countries';
  countryIndexToggle.setAttribute('aria-expanded', String(expanded));
  countryIndexToggle.textContent = expanded ? `Show leading ${facetQuickPickLimit}` : `Show all ${countryAtlasSize} countries`;
  updateCountryIndexVisibility();
}

function updateCountryIndexVisibility() {
  const expanded = countryIndexOptions.classList.contains('is-expanded');
  const query = countryIndexSearch.value.trim().toLocaleLowerCase();
  let visibleCount = 0;
  countryIndexOptions.querySelectorAll('[data-country]').forEach((button, index) => {
    const inQuickPicks = index < facetQuickPickLimit;
    const matchesSearch = button.dataset.country.toLocaleLowerCase().includes(query);
    button.hidden = (!expanded && !inQuickPicks) || !matchesSearch;
    if (!button.hidden) visibleCount += 1;
  });
  countryIndexEmpty.hidden = !expanded || visibleCount > 0;
}

function setLanguageIndexExpanded(expanded) {
  languageIndex.classList.toggle('is-expanded', expanded);
  languageIndexOptions.classList.toggle('is-expanded', expanded);
  languageIndexSearchControl.hidden = !expanded;
  if (!expanded) languageIndexSearch.value = '';
  languageIndexHeading.textContent = expanded ? 'Original languages' : 'Most common languages';
  languageIndexToggle.setAttribute('aria-expanded', String(expanded));
  languageIndexToggle.textContent = expanded ? `Show leading ${facetQuickPickLimit}` : `Show all ${languageAtlasSize} languages`;
  updateLanguageIndexVisibility();
}

function setDecadeIndexExpanded(expanded) {
  decadeOptions.classList.toggle('is-expanded', expanded);
  decadeIndexSearchControl.hidden = !expanded;
  if (!expanded) decadeIndexSearch.value = '';
  decadeIndexToggle.setAttribute('aria-expanded', String(expanded));
  decadeIndexToggle.textContent = expanded ? 'Show leading decades' : `Show all ${availableDecades.length} decades`;
  updateDecadeIndexVisibility();
}

function updateDecadeIndexVisibility() {
  const expanded = decadeOptions.classList.contains('is-expanded');
  const query = decadeIndexSearch.value.trim().toLocaleLowerCase();
  let visibleCount = 0;
  decadeOptions.querySelectorAll('[data-decade]').forEach((button) => {
    const value = button.dataset.decade;
    const isLeading = value === '' || leadingDecades.includes(Number(value));
    const isSelected = button.getAttribute('aria-pressed') === 'true';
    const label = value === '' ? 'all eras' : `${value}s`;
    button.hidden = (!expanded && !isLeading && !isSelected) || (query && !label.toLocaleLowerCase().includes(query));
    if (!button.hidden) visibleCount += 1;
  });
  decadeIndexEmpty.hidden = !expanded || visibleCount > 0;
}

function updateLanguageIndexVisibility() {
  const expanded = languageIndexOptions.classList.contains('is-expanded');
  const query = languageIndexSearch.value.trim().toLocaleLowerCase();
  let visibleCount = 0;
  languageIndexOptions.querySelectorAll('[data-language]').forEach((button, index) => {
    const inQuickPicks = index < facetQuickPickLimit;
    const matchesSearch = button.dataset.languageLabel.includes(query);
    button.hidden = (!expanded && !inQuickPicks) || !matchesSearch;
    if (!button.hidden) visibleCount += 1;
  });
  languageIndexEmpty.hidden = !expanded || visibleCount > 0;
}

const filterControls = createFilterControls({
  state,
  sources: () => availableSourceLists,
  elements: {
    sortSelect, countryIndexOptions, countryIndexSearch, languageIndexOptions, languageIndexSearch,
    posterDisplayButton, ledgerDisplayButton,
    decadeOptions, runtimeOptions, genreOptions, genreFilterSummary, clearGenresButton, selectedGenres,
    sourceListOptions, sourceListFilterSummary, catalogFilterCount, clearSourceListsButton, selectedSourceLists,
    activeViewTools, activeGenreFilters, activeDirectorFilters, activeSourceListFilters, searchInput,
  },
  actions: {
    toggleGenre, toggleDirector, toggleSourceList, setCountry, setLanguage, languageLabel, setDecade, setRuntime,
    setCountryIndexExpanded, setLanguageIndexExpanded,
  },
});
function syncControls() {
  filterControls.syncControls();
  updateGenreOptionVisibility();
  updateSourceListOptionVisibility();
}

function buildGenreFilter() {
  const counts = new Map();
  films.forEach((film) => {
    [...new Set(Array.isArray(film.genres) ? film.genres : [])].forEach((genre) => {
      if (typeof genre === 'string' && genre.trim()) counts.set(genre, (counts.get(genre) || 0) + 1);
    });
  });
  availableGenres = [...counts.keys()].sort((left, right) => counts.get(right) - counts.get(left) || left.localeCompare(right));
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
  genreOptionsToggle.setAttribute('aria-expanded', 'false');
  genreOptionsToggle.hidden = availableGenres.length <= facetQuickPickLimit;
  genreSearchInput.value = '';
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
  sourceListOptionsToggle.setAttribute('aria-expanded', 'false');
  sourceListOptionsToggle.hidden = availableSourceLists.length <= facetQuickPickLimit;
  sourceListSearch.value = '';
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
  leadingDecades = [...decades]
    .sort((a, b) => decadeCounts.get(b) - decadeCounts.get(a) || b - a)
    .slice(0, 3)
    .sort((a, b) => a - b);
  const countryAtlas = [...countryCounts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  countryAtlasSize = countryAtlas.length;
  countryIndexOptions.replaceChildren(...countryAtlas.map(([country, count], index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'country-index-option';
    button.hidden = index >= facetQuickPickLimit;
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
  countryIndexToggle.hidden = countryAtlasSize <= facetQuickPickLimit;
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
  decadeIndexToggle.hidden = decades.length <= 3;
  setDecadeIndexExpanded(Boolean(state.decade && !leadingDecades.includes(state.decade)));
  runtimeFilter.hidden = !films.some((film) => Number.isInteger(film.runtime_minutes) && film.runtime_minutes > 0);
  runtimeFilter.closest('.runtime-filter-group').hidden = runtimeFilter.hidden;
  if (runtimeFilter.hidden) state.runtime = '';
  const selectedCountryIndex = countryAtlas.findIndex(([country]) => country === state.country);
  setCountryIndexExpanded(selectedCountryIndex >= facetQuickPickLimit);
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
  const expanded = genreOptionsToggle.getAttribute('aria-expanded') === 'true';
  options.forEach((option, index) => {
    const matches = option.querySelector('input').value.toLocaleLowerCase().includes(query);
    const selected = state.genres.includes(option.querySelector('input').value);
    option.hidden = !matches || (!query && !expanded && index >= facetQuickPickLimit && !selected);
    if (matches) visibleCount += 1;
  });
  genreOptionsToggle.hidden = options.length <= facetQuickPickLimit || Boolean(query);
  genreOptionsToggle.textContent = expanded ? `Show top ${facetQuickPickLimit}` : `Show all ${options.length.toLocaleString()} genres`;
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
  const options = [...sourceListOptions.querySelectorAll('.genre-option')];
  const expanded = sourceListOptionsToggle.getAttribute('aria-expanded') === 'true';
  options.forEach((option, index) => {
    const matches = option.querySelector('span').textContent.toLocaleLowerCase().includes(query);
    const selected = state.sourceLists.includes(option.dataset.sourceList);
    option.hidden = !matches || (!query && !expanded && index >= facetQuickPickLimit && !selected);
    if (matches) visibleCount += 1;
  });
  sourceListOptionsToggle.hidden = options.length <= facetQuickPickLimit || Boolean(query);
  sourceListOptionsToggle.textContent = expanded ? `Show top ${facetQuickPickLimit}` : `Show all ${options.length.toLocaleString()} lists`;
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

function setLanguage(language) {
  state.language = language;
  state.visibleLimit = 40;
  syncControls(); updateUrlState(); render();
}

function toggleLanguage(language) {
  setLanguage(state.language === language ? '' : language);
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
  savePreferences({ view: state.view });
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
    sourceLists: state.sourceLists, country: state.country, language: state.language, decade: state.decade, runtime: state.runtime, view: state.view,
  }, query);
  if (url.href === window.location.href) return;
  const method = replace ? 'replaceState' : 'pushState';
  if (method === 'pushState') filmNavigation?.rememberPosition();
  const prior = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
  window.history[method]({ ...prior, reelrank: { ...(prior.reelrank || {}), visibleLimit: state.visibleLimit, scrollY: window.scrollY } }, '', url);
}

function currentFilmDetailUrl(film) {
  return filmDetailUrl(urlForState(window.location.href, state, searchInput.value.trim()).href, film);
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
    window.history.pushState(entryMetadata(window.history.state, state.visibleLimit, window.scrollY), '', window.location.href);
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
  state.language = state.language === 'unknown' || films.some((film) => String(film.original_language || '').trim() === state.language) ? state.language : '';
  const decadeValue = state.decade === '' ? '' : String(state.decade);
  state.decade = decadeValue && availableDecades.includes(Number(decadeValue))
    ? Number(decadeValue)
    : '';
  if (runtimeFilter.hidden) state.runtime = '';
  const entry = window.history.state?.reelrank;
  state.visibleLimit = Number.isSafeInteger(entry?.visibleLimit) ? Math.max(40, entry.visibleLimit) : 40;
  syncControls();
  render();
  if (Number.isFinite(entry?.scrollY)) requestAnimationFrame(() => window.scrollTo({ top: entry.scrollY, behavior: 'instant' }));
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
  if (Array.isArray(film._sourceListUrls)) return film._sourceListUrls;
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
  { country = state.country, language = state.language, decade = state.decade, runtime = state.runtime } = {},
) {
  let searchText = searchTextByFilm.get(film);
  if (!searchText) {
    searchText = buildSearchText(film, filmSourceListUrls(film).map(listLabel));
    searchTextByFilm.set(film, searchText);
  }
  return matchesFilm(film, {
    query,
    genres: selectedGenreList,
    directors: state.directors,
    sourceLists: selectedSourceListUrls,
    country,
    language,
    decade,
    runtime,
  }, filmSourceListUrls(film), [], searchText);
}

function languageLabel(code) {
  if (!code || code === 'unknown') return 'Unknown language';
  try { const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code); return name && name.toLocaleLowerCase() !== code.toLocaleLowerCase() ? name : `Unknown (${code})`; }
  catch { return `Unknown (${code})`; }
}

function renderLanguageOptions() {
  const totalCounts = new Map();
  films.forEach((film) => {
    const code = String(film.original_language || '').trim() || 'unknown';
    totalCounts.set(code, (totalCounts.get(code) || 0) + 1);
  });

  const contextCounts = new Map();
  const query = searchInput.value.trim().toLocaleLowerCase();
  films.forEach((film) => {
    if (!matchesWatchFilter(film) || !matchesSearchAndGenres(film, query, state.genres, state.sourceLists, { language: '' })) return;
    const code = String(film.original_language || '').trim() || 'unknown';
    contextCounts.set(code, (contextCounts.get(code) || 0) + 1);
  });

  const atlas = [...totalCounts]
    .map(([code, total]) => ({ code, total, label: languageLabel(code) }))
    .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label));
  languageAtlasSize = atlas.length;
  if (!atlas.some((language) => language.code === state.language)) state.language = '';
  languageIndex.hidden = atlas.length === 0;
  languageIndexToggle.hidden = atlas.length <= facetQuickPickLimit;
  languageIndexOptions.replaceChildren(...atlas.map((language, index) => {
    const count = contextCounts.get(language.code) || 0;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'country-index-option';
    button.hidden = index >= facetQuickPickLimit;
    button.dataset.language = language.code;
    button.dataset.languageLabel = language.label.toLocaleLowerCase();
    button.setAttribute('aria-pressed', String(language.code === state.language));
    button.setAttribute('aria-label', `Filter by original language ${language.label}, ${count} ${count === 1 ? 'film' : 'films'}`);
    const name = document.createElement('span');
    name.textContent = language.label;
    const total = document.createElement('small');
    total.textContent = count.toLocaleString();
    button.append(name, total);
    button.addEventListener('click', () => toggleLanguage(language.code));
    return button;
  }));
  const selectedIndex = atlas.findIndex((language) => language.code === state.language);
  const wasExpanded = languageIndexOptions.classList.contains('is-expanded');
  setLanguageIndexExpanded(selectedIndex >= facetQuickPickLimit || wasExpanded);
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
  const { countries: countryCounts } = countCountriesAndDecades(filmsForCountries);
  countryIndexOptions.querySelectorAll('[data-country]').forEach((button) => {
    const count = countryCounts.get(button.dataset.country) || 0;
    button.querySelector('small').textContent = count.toLocaleString();
    button.setAttribute('aria-label', `Filter by production country ${button.dataset.country}, ${count} ${count === 1 ? 'film' : 'films'}`);
  });

  const filmsForDecades = films.filter((film) => matchesWatchFilter(film)
    && matchesSearchAndGenres(film, query, state.genres, state.sourceLists, { decade: '' }));
  const { decades: decadeCounts } = countCountriesAndDecades(filmsForDecades);
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
  const counts = countGenres(contextFilms);
  genreOptions.querySelectorAll('.genre-option').forEach((option) => {
    option.querySelector('.genre-option-count').textContent = (counts.get(option.querySelector('input').value) || 0).toLocaleString();
  });
}

function updateSourceListOptionCounts(query) {
  const contextFilms = films.filter((film) => {
    if (!matchesWatchFilter(film)) return false;
    return matchesSearchAndGenres(film, query, state.genres, []);
  });
  const counts = countSourceLists(contextFilms, filmSourceListUrls);
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
      scoreMeterFor, genreChipFor, filmDetailButtonFor, filmAppearanceCountFor,
      getFilmDetailUrl: currentFilmDetailUrl,
      openFilmDetails: openFilmDetailsFromUi,
    });
    filmCardByFilm.set(film, card);
  }
  updateFilmCard(card, film, index, state, rankByFilm.get(film) + 1, currentHighestScore, currentFilmDetailUrl);
  return card;
}

function compareFilms(left, right, sort = state.sort) {
  return sort === 'relevance' && searchInput.value.trim()
    ? compareRelevance(left, right, searchInput.value, rankByFilm)
    : compareCatalogFilms(left, right, sort === 'relevance' ? 'rank' : sort, rankByFilm);
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
    state.language ? `original language ${languageLabel(state.language === 'unknown' ? '' : state.language)}` : '',
    state.decade !== '' ? `decade ${state.decade}s` : '',
    state.runtime ? `running time ${state.runtime === 'under-90' ? 'under 90 minutes' : state.runtime === '90-120' ? '90 to 120 minutes' : 'over 120 minutes'}` : '',
    searchInput.value.trim() ? `search ${searchInput.value.trim()}` : '',
    state.sort !== 'rank' ? `sorted by ${sortSelect.options[sortSelect.selectedIndex].text}` : '',
  ].filter(Boolean).join(', ');
  backToFiltersButton.textContent = 'Filters';
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
  const sourceListUrls = [...new Set(filmSourceListUrls(film).map(sourceListUrl).filter(Boolean))];
  if (!sourceListUrls.length) return null;
  const section = document.createElement('section');
  section.className = 'film-note-section film-note-sources';
  section.tabIndex = -1;
  section.setAttribute('aria-label', `Source lists containing ${film.title}`);
  const heading = document.createElement('h4');
  heading.textContent = `Appears in ${sourceListUrls.length.toLocaleString()} ${sourceListUrls.length === 1 ? 'list' : 'lists'}`;
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
  notes.setAttribute('aria-label', 'Film details');
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
  heading.textContent = 'Film details';
  notes.append(heading, body);
  return notes;
}

function resetPosterChoice(film) {
  const choices = { ...(readPreferences().posterChoices || {}) };
  delete choices[String(film.tmdb_id)];
  if (!savePreferences({ posterChoices: choices })) return false;
  const original = originalPosterByFilm.get(film);
  if (original === undefined) delete film.poster_url; else film.poster_url = original;
  filmCardByFilm.delete(film);
  filmViews.updatePosterForFilm(film, film.poster_url);
  render();
  return true;
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
  filmAppearanceCountFor,
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
  getPosterGalleryUrl: () => posterGalleryUrl,
  rememberPosterChoice: (film, url) => {
    const choices = { ...(readPreferences().posterChoices || {}), [String(film.tmdb_id)]: url };
    if (!savePreferences({ posterChoices: choices })) return false;
    film.poster_url = url;
    filmCardByFilm.delete(film);
    filmViews.updatePosterForFilm(film, url);
    render();
    return true;
  },
  resetPosterChoice,
  onFilmDetailChange: (film) => {
    filmNavigation.updateFilmUrl(film);
  },
  getFilmShareUrl: (film) => {
    const shared = new URL(programmeShare(window.location.href, state, searchInput.value, availableSourceLists, publicSiteUrl).url);
    shared.searchParams.set('film', film.letterboxd_url || `${film.tmdb_id || film.title}-${film.year || ''}`);
    return shared.href;
  },
  getCurrentMatchingFilms: () => currentMatchingFilms,
});
filmNavigation = createFilmNavigation({
  browserWindow: window,
  getState: () => state,
  getFilms: () => films,
  getDialog: () => filmDetailDialog,
  openDetails: (film, options) => filmViews.openFilmDetails(film, options),
  restoreCatalogue: restoreUrlState,
  collectionTitle: () => document.querySelector('#collection-title'),
});

function filmDetailButtonFor(film) {
  const button = document.createElement('a');
  button.href = currentFilmDetailUrl(film).href;
  button.className = 'film-detail-trigger';
  button.textContent = 'Film details';
  button.setAttribute('aria-label', `Read film details for ${film.title}`);
  button.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); openFilmDetailsFromUi(film);
  });
  return button;
}

function filmAppearanceCountFor(film, className = 'film-count') {
  const likedListCount = Number(film.liked_in) || 0;
  const sourceLists = filmSourceListUrls(film);
  const count = document.createElement(sourceLists.length ? 'button' : 'p');
  if (count instanceof HTMLButtonElement) {
    count.type = 'button';
    count.setAttribute('aria-label', `View the ${likedListCount.toLocaleString()} source lists that include ${film.title}`);
    count.addEventListener('click', () => openFilmDetailsFromUi(film, { focusProvenance: true }));
  } else {
    count.setAttribute('aria-label', `Appears in ${likedListCount.toLocaleString()} source lists`);
  }
  count.className = className;
  const countValue = document.createElement('strong');
  countValue.textContent = likedListCount.toLocaleString();
  const countLabel = document.createElement('span');
  countLabel.textContent = likedListCount === 1 ? 'list appearance' : 'list appearances';
  count.append(countValue, countLabel, scoreMeterFor(film, className === 'featured-film-count' ? 'featured-score-meter' : 'film-score-meter'));
  return count;
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
    const card = cardFor(film, index);
    if (index >= arrivingCardsFromIndex && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      card.classList.add('is-arriving');
      card.style.animationDelay = `${Math.min((index - arrivingCardsFromIndex) * 14, 180)}ms`;
      card.addEventListener('animationend', () => {
        card.classList.remove('is-arriving');
        card.style.removeProperty('animation-delay');
      }, { once: true });
    }
    items.push(card);
  });
  return items;
}

function programmeHeadingFor(query, defaultRankedView, matching) {
  if (defaultRankedView) return { eyebrow: 'Highest list counts', title: 'Most listed' };
  if (state.directors.length === 1) return { eyebrow: 'Filmography in this edition', title: state.directors[0] };
  if (state.directors.length > 1) return { eyebrow: 'Director selection', title: `${state.directors.length} selected directors` };
  if (state.sourceLists.length === 1) {
    const sourceList = availableSourceLists.find((item) => item.url === state.sourceLists[0]);
    if (sourceList) return { eyebrow: 'From a liked list', title: sourceList.label };
  }
  if (state.sourceLists.length > 1) return { eyebrow: 'Source-list selection', title: `${state.sourceLists.length} selected lists` };
  if (state.country && state.decade !== '') {
    return { eyebrow: 'Films by country and decade', title: `${state.country} · ${state.decade}s` };
  }
  if (state.country) return { eyebrow: 'Films by country', title: state.country };
  if (state.decade !== '') return { eyebrow: 'Films by decade', title: `${state.decade}s` };
  if (state.runtime) {
    const title = state.runtime === 'under-90' ? 'Under 90 minutes' : state.runtime === '90-120' ? '90–120 minutes' : 'Over 120 minutes';
    return { eyebrow: 'By running time', title };
  }
  if (state.genres.length) {
    const title = state.genres.slice(0, 2).join(' · ');
    return { eyebrow: 'Genre selection', title: state.genres.length > 2 ? `${title} +${state.genres.length - 2}` : title };
  }
  if (query) {
    const phrase = searchInput.value.trim();
    return { eyebrow: 'Search results', title: phrase.length > 38 ? `${phrase.slice(0, 35)}…` : phrase };
  }
  if (state.filter === 'watched') return { eyebrow: 'Watched collection', title: 'Films seen' };
  if (state.filter === 'unwatched') return { eyebrow: 'Unwatched films', title: 'Films to discover' };
  if (state.sort === 'year-newest') return { eyebrow: 'Sorted by year', title: 'Newest first' };
  if (state.sort === 'year-oldest') return { eyebrow: 'Sorted by year', title: 'Oldest first' };
  if (state.sort === 'title') return { eyebrow: 'Sorted by title', title: 'A–Z' };
  return { eyebrow: 'Current selection', title: `${matching.length.toLocaleString()} films` };
}

const printProgramme = createProgrammePrinter({
  printFormatSelect,
  printProgrammeContainer,
  printProgrammeTitle,
  printProgrammeUsername,
  printProgrammeDate,
  printProgrammeContext,
  printProgrammeFilms,
  topBilledTitle,
  profileUsername: document.querySelector('#profile-username'),
  searchInput,
  getCurrentMatchingFilms: () => currentMatchingFilms,
  getFilms: () => films,
  getState: () => state,
  getAvailableSourceLists: () => availableSourceLists,
  getSnapshotRefreshedAt: () => snapshotRefreshedAt,
  compareFilms,
  formatEditionDate,
  languageNameFor,
});

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
    if (attempt === shareAttempt) programmeShareStatus.textContent = 'View link copied.';
  } catch {
    if (attempt !== shareAttempt) return;
    programmeShareStatus.textContent = 'Select and copy the view link below the description.';
    programmeShareUrl.focus();
    programmeShareUrl.select();
  }
});

invalidatePreferencesUndo = bindSavedViewControls({
  readPreferences, savePreferences, replacePreferences, clearPreferences: preferences.clear,
  readUndo: preferences.readUndo, saveUndo: preferences.saveUndo, clearUndo: preferences.clearUndo,
  state, searchInput, syncControls, updateUrlState, render,
  getFilms: () => films, originalPosterByFilm, filmCardByFilm, filmViews,
});

document.querySelector('#ranking-download').addEventListener('click', (event) => {
  if (event.currentTarget.hasAttribute('download')) return;
  event.preventDefault();
  downloadCatalogueCsv(films, sourceListsForDownload, 'reelrank-catalogue.csv');
});

document.querySelectorAll('.more-filter-group').forEach((group) => {
  group.addEventListener('toggle', () => {
    if (!group.open) return;
    document.querySelectorAll('.more-filter-group[open]').forEach((other) => {
      if (other !== group) other.open = false;
    });
  });
});

function render() {
  updateProgrammeShare();
  const query = searchInput.value.trim().toLocaleLowerCase();
  renderLanguageOptions();
  const relevanceOption = sortSelect.querySelector('option[value="relevance"]');
  if (relevanceOption) relevanceOption.disabled = !query;
  sortSelect.value = state.sort;
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
  const hasActiveSelection = Boolean(query) || state.filter !== 'all' || state.genres.length > 0 || state.directors.length > 0 || state.sourceLists.length > 0 || Boolean(state.country) || Boolean(state.language) || state.decade !== '' || Boolean(state.runtime);
  programmeNote.hidden = matching.length === 0 || !hasActiveSelection;
  programmeNoteCopy.textContent = programmeNoteFor(matching);
  currentHighestScore = Math.max(1, ...matching.map((film) => Number(film.liked_in) || 0));
  const ledgerView = state.view === 'ledger';
  const rankedPosterView = !ledgerView && state.sort === 'rank';
  const highlighted = rankedPosterView ? matching.slice(0, 3) : [];
  const shown = matching.slice(0, state.visibleLimit + highlighted.length);
  currentShownCount = shown.length;
  currentMatchCount = matching.length;
  matchingFilmsCount.textContent = `${matching.length.toLocaleString()} ${matching.length === 1 ? 'film' : 'films'}`;
  topBilled.hidden = !rankedPosterView || highlighted.length === 0;
  grid.hidden = ledgerView;
  filmLedgerView.hidden = !ledgerView;
  const defaultRankedView = state.filter === 'all' && state.sort === 'rank' && !query && state.genres.length === 0 && state.directors.length === 0 && state.sourceLists.length === 0 && !state.country && !state.language && state.decade === '' && !state.runtime;
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
  statusMessage.classList.toggle('is-visible', matching.length === 0);
  const hasFacetFilters = state.genres.length > 0 || state.directors.length > 0 || state.sourceLists.length > 0 || Boolean(state.country) || Boolean(state.language) || state.decade !== '' || Boolean(state.runtime);
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

function showDemoState(configuredUsername, snapshotUsername) {
  const matches = snapshotUsername.toLocaleLowerCase() === configuredUsername.toLocaleLowerCase();
  const requested = new URLSearchParams(window.location.search).get('demo') === '1';
  if (!matches) {
    const demoUrl = new URL(window.location.href);
    demoUrl.searchParams.set('demo', '1');
    demoPreviewLink.href = demoUrl.href;
    demoPreviewLink.textContent = `Preview sample data from @${snapshotUsername}`;
    demoPreviewLink.hidden = false;
    setupCopy.textContent = `The snapshot for @${configuredUsername} is still being prepared. Your site will appear here when its username matches the generated snapshot.`;
    if (!requested) return false;
  }
  if (requested || !matches) {
    document.querySelector('#demo-banner-copy').textContent = matches
      ? `Demo preview of @${snapshotUsername}'s public snapshot.`
      : `Demo preview: showing @${snapshotUsername}'s public data. @${configuredUsername}'s site is still being prepared.`;
    demoBanner.hidden = false;
    const exitDemoUrl = new URL(window.location.href);
    exitDemoUrl.searchParams.delete('demo');
    document.querySelector('#exit-demo-link').href = exitDemoUrl.href;
  }
  return true;
}

function initializeSnapshot(snapshot, fullRankingFilms = null, rankingLoadFailed = false) {
  activeSnapshot = snapshot;
  const snapshotUsername = snapshot.username.trim();
  films = fullRankingFilms || snapshot.films;
  renderLanguageOptions();
  films.forEach((film) => originalPosterByFilm.set(film, film.poster_url));
  const posterChoices = readPreferences().posterChoices || {};
  films.forEach((film) => {
    const choice = Number.isSafeInteger(film.tmdb_id) ? posterChoices[String(film.tmdb_id)] : '';
    if (typeof choice === 'string' && choice.startsWith('https://image.tmdb.org/t/p/')) film.poster_url = choice;
  });
  films.forEach((film) => { film._sourceListUrls = [...new Set((Array.isArray(film._sourceListUrls) ? film._sourceListUrls : Array.isArray(film.list_ids) && Array.isArray(snapshot.source_lists)
    ? film.list_ids.map((id) => snapshot.source_lists[id]).filter((url) => typeof url === 'string')
    : Array.isArray(film.lists) ? film.lists : []).map(sourceListUrl).filter(Boolean))]; });
  rankByFilm.clear();
  films.forEach((film, index) => rankByFilm.set(film, index));
  snapshotRefreshedAt = snapshot.refreshed_at;
  sourceListsForDownload = Array.isArray(snapshot.source_lists) ? snapshot.source_lists : [];
  const rankingDownload = document.querySelector('#ranking-download');
  rankingDownload.hidden = false;
  if (snapshot.ranking_csv_url) {
    rankingDownload.href = snapshot.ranking_csv_url;
    rankingDownload.download = '';
    rankingDownload.textContent = `Download all ${(snapshot.film_count ?? films.length).toLocaleString()} films (CSV)`;
  } else {
    rankingDownload.href = '#';
    rankingDownload.removeAttribute('download');
    rankingDownload.textContent = `Download displayed ${films.length.toLocaleString()} films (CSV)`;
  }
  posterGalleryUrl = snapshot.poster_gallery_url || '/data/poster-galleries.json';
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
  const detailedCount = snapshot.displayed_film_count ?? snapshot.films.length;
  const searchableCount = films.length.toLocaleString();
  searchHelp.textContent = 'Results follow the selected sort. Press slash to focus search; Escape to clear it.';
  searchScopeLabel.textContent = `Search these ${searchableCount} films`;
  searchInput.placeholder = `Search ${searchableCount} films`;
  collectionScope.textContent = fullRankingFilms
    ? `Search all ${searchableCount} ranked films by title, year, and list. The first ${detailedCount.toLocaleString()} have richer details, so searches also match original title, director, genre, and synopsis. Use Relevance to see closest matches first.`
    : `Search title, year, director, genre, synopsis, and source lists in ${searchableCount} detailed films.`;
  metadataFilterScope.textContent = fullRankingFilms
    ? `Genre, director, country, language, and running-time filters only include films with matching details. This edition has details for the top ${detailedCount.toLocaleString()} films; title, year, and source-list search covers all ${searchableCount}.`
    : `These filters use the ${searchableCount} detailed films available in this edition. Search and filters do not include the remaining ${Math.max(0, rankedTotal - films.length).toLocaleString()} ranked films.`;
  catalogueDataStatus.textContent = fullRankingFilms
    ? ''
    : rankingLoadFailed
      ? `The full ranking could not load, so this view is using ${searchableCount} detailed films. Your search and filters are still here; check your connection and retry to load all ${rankedTotal.toLocaleString()}.`
      : snapshot.ranking_csv_url
        ? `The detailed films are ready. Loading all ${rankedTotal.toLocaleString()} ranked films in the background.`
      : `Full-ranking data is not included in this saved edition. Search covers ${searchableCount} detailed films; refresh the snapshot to include all ${rankedTotal.toLocaleString()}.`;
  catalogueDataStatus.dataset.state = fullRankingFilms ? 'complete' : rankingLoadFailed ? 'partial' : snapshot.ranking_csv_url ? 'loading' : 'partial';
  retryRankingLoadButton.hidden = !rankingLoadFailed;
  retryRankingLoadButton.disabled = false;
  retryRankingLoadButton.textContent = 'Retry full-catalogue load';
  document.querySelector('#collection-footnote').textContent = `Browsing ${searchableCount} ranked films. Your public liked lists, watched status, and source-list links appear here; this site is public.`;
  siteShell.hidden = false;
  render();
  updateEditionFreshness(document.querySelector('#edition-stale-notice'), snapshotRefreshedAt);
  setupState.hidden = true;
  retryButton.hidden = true;
  restoreFilmFromUrl();
}

async function loadSnapshot() {
  let failedResource = 'configuration';
  let snapshotFailureKind = 'request';
  try {
    const configResponse = await fetch('/site-config.json', { cache: 'no-store' });
    if (!configResponse.ok) throw new Error(`Site configuration request failed: ${configResponse.status}`);
    const config = await configResponse.json();
    const configuredUsername = typeof config.letterboxd_username === 'string' ? config.letterboxd_username.trim() : '';
    publicSiteUrl = typeof config.public_site_url === 'string' ? config.public_site_url.trim() : '';
    if (!configuredUsername) throw new Error('Site configuration does not include a Letterboxd username');

    failedResource = 'catalogue';
    setupTitle.textContent = `Preparing @${configuredUsername}'s ReelRank`;
    setupCopy.textContent = 'Loading the configured profile and its catalogue edition…';
    const response = await fetch('/data/snapshot.json', { cache: 'default' });
    if (!response.ok) throw new Error(`Snapshot request failed: ${response.status}`);
    snapshotFailureKind = 'json';
    const snapshotData = await response.json();
    snapshotFailureKind = 'schema';
    const snapshot = validateSnapshot(snapshotData);
    snapshotFailureKind = 'initialization';
    if (!showDemoState(configuredUsername, snapshot.username.trim())) return;
    initializeSnapshot(snapshot);
    if (snapshot.ranking_csv_url) void loadFullRankingInBackground(snapshot);
  } catch (error) {
    siteShell.hidden = true;
    setupState.hidden = false;
    setupTitle.textContent = 'This site is still being prepared';
    setupCopy.textContent = failedResource === 'configuration'
      ? 'ReelRank could not load site-config.json. Check the file and try again.'
      : snapshotLoadErrorMessage(snapshotFailureKind);
    retryButton.hidden = false;
    console.error(error);
  }
}

async function loadFullRankingInBackground(snapshot) {
  try {
    const fullRankingFilms = await loadFullRanking(snapshot);
    if (activeSnapshot === snapshot) initializeSnapshot(snapshot, fullRankingFilms);
  } catch (error) {
    console.warn('The full ranking file could not be loaded; showing the detailed snapshot films.', error);
    if (activeSnapshot === snapshot) {
      initializeSnapshot(snapshot, null, true);
      catalogueDataStatus.dataset.state = 'partial';
    }
  }
}

async function retryFullRanking() {
  if (!activeSnapshot?.ranking_csv_url || retryRankingLoadButton.disabled) return;
  retryRankingLoadButton.disabled = true;
  retryRankingLoadButton.textContent = 'Loading full catalogue…';
  catalogueDataStatus.textContent = `Loading all ${rankedTotal.toLocaleString()} ranked films. Your current results remain available while this loads.`;
  try {
    const fullRankingFilms = await loadFullRanking(activeSnapshot, 'no-store');
    initializeSnapshot(activeSnapshot, fullRankingFilms);
  } catch (error) {
    console.warn('The full ranking could not be loaded; keeping the detailed snapshot films available.', error);
    catalogueDataStatus.textContent = `The full ranking could not load, so this view is still using ${films.length.toLocaleString()} detailed films. Your search and filters are unchanged; check your connection and retry to load all ${rankedTotal.toLocaleString()}.`;
    retryRankingLoadButton.disabled = false;
    retryRankingLoadButton.textContent = 'Retry full-catalogue load';
    retryRankingLoadButton.hidden = false;
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
function resetCatalogView({ clearQueryText = false, resetSort = false, resetView = false } = {}) {
  window.clearTimeout(searchUrlTimer);
  if (clearQueryText) {
    state.searchEditing = false;
    searchInput.value = '';
    genreSearchInput.value = '';
    sourceListSearch.value = '';
    updateSourceListOptionVisibility();
    updateGenreOptionVisibility();
  }
  state.filter = 'all';
  state.genres = [];
  state.directors = [];
  state.sourceLists = [];
  state.country = '';
  state.language = '';
  state.decade = '';
  state.runtime = '';
  if (resetSort) state.sort = 'rank';
  if (resetView) state.view = 'posters';
  state.visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
  searchInput.focus();
}
emptyClearFilters.addEventListener('click', () => resetCatalogView());

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
genreOptionsToggle.addEventListener('click', () => {
  genreOptionsToggle.setAttribute('aria-expanded', String(genreOptionsToggle.getAttribute('aria-expanded') !== 'true'));
  updateGenreOptionVisibility();
});
clearSearchStateButton.addEventListener('click', () => resetCatalogView({ clearQueryText: true, resetSort: true, resetView: true }));
clearGenresButton.addEventListener('click', () => {
  state.genres = [];
  state.visibleLimit = 40;
  syncControls();
  updateUrlState();
  render();
});
sourceListSearch.addEventListener('input', updateSourceListOptionVisibility);
sourceListOptionsToggle.addEventListener('click', () => {
  sourceListOptionsToggle.setAttribute('aria-expanded', String(sourceListOptionsToggle.getAttribute('aria-expanded') !== 'true'));
  updateSourceListOptionVisibility();
});
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
languageIndexToggle.addEventListener('click', () => {
  setLanguageIndexExpanded(languageIndexToggle.getAttribute('aria-expanded') !== 'true');
});
languageIndexSearch.addEventListener('input', updateLanguageIndexVisibility);
decadeIndexToggle.addEventListener('click', () => {
  setDecadeIndexExpanded(decadeIndexToggle.getAttribute('aria-expanded') !== 'true');
});
decadeIndexSearch.addEventListener('input', updateDecadeIndexVisibility);
posterDisplayButton.addEventListener('click', () => setView('posters'));
ledgerDisplayButton.addEventListener('click', () => setView('ledger'));
printProgrammeButton.addEventListener('click', printProgramme);
filmDetailClose.addEventListener('click', () => filmDetailDialog.close());
filmDetailDialog.addEventListener('close', () => filmNavigation.handleDialogClose());
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
const catalogueToolsDisclosure = document.querySelector('#catalogue-tools');
document.addEventListener('pointerdown', (event) => {
  const eventPath = event.composedPath();
  if (genreFilter.open && !eventPath.includes(genreFilter)) genreFilter.open = false;
  if (sourceListFilter.open && !eventPath.includes(sourceListFilter)) sourceListFilter.open = false;
  if (catalogueToolsDisclosure.open && !eventPath.includes(catalogueToolsDisclosure)) catalogueToolsDisclosure.open = false;
});
const savedViewsGroup = document.querySelector('#saved-views');
loadMoreButton.addEventListener('click', () => {
  const previousLimit = state.visibleLimit;
  state.visibleLimit += 40;
  filmNavigation.rememberPosition();
  arrivingCardsFromIndex = previousLimit;
  try {
    render();
  } finally {
    arrivingCardsFromIndex = Number.POSITIVE_INFINITY;
  }
});
backToFiltersButton.addEventListener('click', () => {
  searchInput.focus({ preventScroll: true });
  document.querySelector('#collection-controls').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
window.addEventListener('scroll', updateBackToFiltersVisibility, { passive: true });
document.addEventListener('click', (event) => {
  const eventPath = event.composedPath();
  if (catalogFilters.open && !eventPath.includes(catalogFilters)) catalogFilters.open = false;
  const presetStatusRegion = document.querySelector('#preset-status');
  document.querySelectorAll('.catalogue-tool-group[open]').forEach((disclosure) => {
    if (!eventPath.includes(disclosure) && !eventPath.includes(presetStatusRegion)) disclosure.open = false;
  });
});
document.addEventListener('keydown', (event) => {
  if (filmDetailDialog.open || posterViewerDialog.open) return;
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
  if (event.key === 'Escape' && programmeShareDetails.open) {
    event.preventDefault();
    programmeShareDetails.open = false;
    programmeShareDetails.querySelector('summary').focus();
    return;
  }
  const openCatalogueToolGroup = document.querySelector('.catalogue-tool-group[open]');
  if (event.key === 'Escape' && openCatalogueToolGroup) {
    event.preventDefault();
    openCatalogueToolGroup.open = false;
    openCatalogueToolGroup.querySelector('summary').focus();
    return;
  }
  if (event.key === 'Escape' && catalogueToolsDisclosure.open) {
    event.preventDefault();
    catalogueToolsDisclosure.open = false;
    catalogueToolsDisclosure.querySelector('summary').focus();
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

window.addEventListener('popstate', () => filmNavigation.handlePopState());
retryButton.addEventListener('click', () => { retryButton.hidden = true; loadSnapshot(); });
retryRankingLoadButton.addEventListener('click', retryFullRanking);
searchInput.value = state.query;
syncControls();
loadSnapshot();
