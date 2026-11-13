import { canonicalLetterboxdFilmUrl } from './letterboxd-film-url.js';

const localIds = new WeakMap();
const localFingerprints = new WeakMap();

function localFingerprint(film) {
  if (localFingerprints.has(film)) return localFingerprints.get(film);
  const text = JSON.stringify([film.title, film.year, film.original_title || '', film.directors || [], film.overview || '']);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 2246822519);
  }
  const key = `local:${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
  localFingerprints.set(film, key);
  return key;
}

export function registerFilmIdentifiers(films) {
  const tmdbOccurrences = new Map();
  for (const film of films) {
    if (film.letterboxd_url || !Number.isSafeInteger(film.tmdb_id)) continue;
    const key = tmdbIdentifier(film);
    tmdbOccurrences.set(key, (tmdbOccurrences.get(key) || 0) + 1);
  }
  const occurrences = new Map();
  for (const film of films) {
    localIds.delete(film);
    if (film.letterboxd_url || (Number.isSafeInteger(film.tmdb_id) && tmdbOccurrences.get(tmdbIdentifier(film)) === 1)) continue;
    const key = localFingerprint(film);
    const occurrence = (occurrences.get(key) || 0) + 1;
    occurrences.set(key, occurrence);
    localIds.set(film, `${key}:${occurrence}`);
  }
}

function tmdbIdentifier(film) {
  return `${film.tmdb_id}-${film.year || ''}`;
}

export function filmIdentifier(film) {
  if (film.letterboxd_url) return film.letterboxd_url;
  const localId = localIds.get(film);
  if (localId) return localId;
  if (Number.isSafeInteger(film.tmdb_id)) return tmdbIdentifier(film);
  return `${localFingerprint(film)}:1`;
}

export function findFilmByIdentifier(films, key) {
  const exact = films.filter((film) => filmIdentifier(film) === key || film.letterboxd_url === key);
  if (exact.length) return exact.length === 1 ? exact[0] : undefined;
  const canonical = canonicalLetterboxdFilmUrl(key);
  if (canonical) {
    const aliases = films.filter((film) => canonicalLetterboxdFilmUrl(film.letterboxd_url) === canonical);
    return aliases.length === 1 ? aliases[0] : undefined;
  }
  return undefined;
}

export function filmDetailUrl(href, film) {
  const url = new URL(href);
  url.searchParams.set('film', filmIdentifier(film));
  return url;
}

export function entryMetadata(historyState, visibleLimit, scrollY) {
  const previous = historyState && typeof historyState === 'object' ? historyState : {};
  return { ...previous, reelrank: { ...(previous.reelrank || {}), visibleLimit, scrollY } };
}

export function createFilmNavigation({ browserWindow, getState, getFilms, getDialog, openDetails, dismissPosterViewer, restoreCatalogue, findTrigger, collectionTitle }) {
  let activeFilm = null;
  let clickedTrigger = null;
  let triggerFilm = null;
  let triggerKind = '';
  let historyCloseCount = 0;
  let historyRender;
  let scrollTimer;

  function rememberPosition() {
    const state = getState();
    const priorLimit = browserWindow.history.state?.reelrank?.visibleLimit;
    const visibleLimit = Number.isSafeInteger(priorLimit) ? Math.max(state.visibleLimit, priorLimit) : state.visibleLimit;
    browserWindow.history.replaceState(entryMetadata(browserWindow.history.state, visibleLimit, browserWindow.scrollY), '', browserWindow.location.href);
  }

  function openFromUi(film, options = {}) {
    const focused = browserWindow.document.activeElement;
    clickedTrigger = focused === browserWindow.document.body ? null : focused;
    triggerFilm = film;
    triggerKind = clickedTrigger?.classList[0] || '';
    const url = filmDetailUrl(browserWindow.location.href, film);
    activeFilm = url.searchParams.get('film');
    const state = getState();
    browserWindow.history.replaceState(entryMetadata(browserWindow.history.state, state.visibleLimit, browserWindow.scrollY), '', browserWindow.location.href);
    const metadata = entryMetadata(browserWindow.history.state, state.visibleLimit, browserWindow.scrollY);
    metadata.reelrank.filmDialog = true;
    metadata.reelrank.filmOpener = { key: activeFilm, kind: triggerKind };
    browserWindow.history.pushState(metadata, '', url);
    openDetails(film, options);
  }

  function restoreFromUrl() {
    const key = new URLSearchParams(browserWindow.location.search).get('film');
    if (!key) {
      activeFilm = null;
      const dialog = getDialog();
      if (dialog.open) {
        dismissPosterViewer();
        historyCloseCount += 1;
        dialog.close();
      }
      return;
    }
    const film = findFilmByIdentifier(getFilms(), key);
    const dialog = getDialog();
    if (film && (activeFilm !== key || !dialog.open)) {
      dismissPosterViewer();
      activeFilm = key;
      if (!triggerFilm && browserWindow.history.state?.reelrank?.filmDialog) {
        const opener = browserWindow.history.state.reelrank.filmOpener;
        triggerFilm = (opener?.key && findFilmByIdentifier(getFilms(), opener.key)) || film;
        triggerKind = opener?.kind || '';
        const focused = browserWindow.document.activeElement;
        clickedTrigger = findTrigger(triggerFilm, triggerKind)
          || (focused !== browserWindow.document.body && focused.isConnected ? focused : null);
      }
      openDetails(film);
    }
  }

  function handleDialogClose() {
    const historyClosed = historyCloseCount > 0;
    if (historyClosed) historyCloseCount -= 1;
    if (getDialog().open) return;
    const trigger = clickedTrigger;
    const film = triggerFilm;
    const kind = triggerKind;
    clickedTrigger = null;
    triggerFilm = null;
    triggerKind = '';
    function focusOpener() {
      const target = trigger?.isConnected && trigger.getClientRects().length ? trigger : (film && findTrigger(film, kind)) || collectionTitle();
      target.focus({ preventScroll: true });
    }
    if (historyClosed) {
      const closedUrl = browserWindow.location.href;
      const focusAtClose = browserWindow.document.activeElement;
      void Promise.resolve(historyRender).then(() => {
        const focused = browserWindow.document.activeElement;
        if (!getDialog().open && browserWindow.location.href === closedUrl && (focused === focusAtClose || focused === browserWindow.document.body)) focusOpener();
      });
    } else if (browserWindow.document.activeElement !== collectionTitle()) {
      // A filter applied from details already focuses the results heading.
      focusOpener();
    }
    if (!historyClosed && activeFilm && new URLSearchParams(browserWindow.location.search).get('film') === activeFilm) {
      activeFilm = null;
      const url = new URL(browserWindow.location.href); url.searchParams.delete('film');
      browserWindow.history.replaceState(browserWindow.history.state, '', url);
    }
  }

  function handlePopState() {
    historyRender = restoreCatalogue();
    restoreFromUrl();
  }

  function updateFilmUrl(film) {
    const url = filmDetailUrl(browserWindow.location.href, film);
    activeFilm = url.searchParams.get('film');
    if (url.href !== browserWindow.location.href) browserWindow.history.replaceState(browserWindow.history.state, '', url);
  }

  browserWindow.addEventListener('scroll', () => {
    browserWindow.clearTimeout(scrollTimer);
    scrollTimer = browserWindow.setTimeout(rememberPosition, 120);
  }, { passive: true });

  return { openFromUi, restoreFromUrl, handleDialogClose, handlePopState, updateFilmUrl, rememberPosition };
}
