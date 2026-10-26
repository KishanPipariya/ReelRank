export function filmIdentifier(film) {
  return film.letterboxd_url || `${film.tmdb_id || film.title}-${film.year || ''}`;
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

export function createFilmNavigation({ browserWindow, getState, getFilms, getDialog, openDetails, restoreCatalogue, collectionTitle }) {
  let activeFilm = null;
  let clickedTrigger = null;
  let historyCloseCount = 0;
  let scrollTimer;

  function rememberPosition() {
    const state = getState();
    const priorLimit = browserWindow.history.state?.reelrank?.visibleLimit;
    const visibleLimit = Number.isSafeInteger(priorLimit) ? Math.max(state.visibleLimit, priorLimit) : state.visibleLimit;
    browserWindow.history.replaceState(entryMetadata(browserWindow.history.state, visibleLimit, browserWindow.scrollY), '', browserWindow.location.href);
  }

  function openFromUi(film) {
    clickedTrigger = browserWindow.document.activeElement;
    const url = filmDetailUrl(browserWindow.location.href, film);
    activeFilm = url.searchParams.get('film');
    const state = getState();
    browserWindow.history.replaceState(entryMetadata(browserWindow.history.state, state.visibleLimit, browserWindow.scrollY), '', browserWindow.location.href);
    const metadata = entryMetadata(browserWindow.history.state, state.visibleLimit, browserWindow.scrollY);
    metadata.reelrank.filmDialog = true;
    browserWindow.history.pushState(metadata, '', url);
    openDetails(film);
  }

  function restoreFromUrl() {
    const key = new URLSearchParams(browserWindow.location.search).get('film');
    if (!key) {
      activeFilm = null;
      const dialog = getDialog();
      if (dialog.open) { historyCloseCount += 1; dialog.close(); }
      return;
    }
    const film = getFilms().find((item) => filmIdentifier(item) === key || item.letterboxd_url === key);
    const dialog = getDialog();
    if (film && (activeFilm !== key || !dialog.open)) {
      activeFilm = key;
      if (!clickedTrigger && browserWindow.history.state?.reelrank?.filmDialog && browserWindow.document.activeElement !== browserWindow.document.body && browserWindow.document.activeElement.isConnected) clickedTrigger = browserWindow.document.activeElement;
      openDetails(film);
    }
  }

  function handleDialogClose() {
    if (historyCloseCount > 0) {
      historyCloseCount -= 1;
      if (getDialog().open) return;
    } else {
      const trigger = clickedTrigger;
      clickedTrigger = null;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      else collectionTitle().focus({ preventScroll: true });
      if (activeFilm && new URLSearchParams(browserWindow.location.search).get('film') === activeFilm) {
        activeFilm = null;
        const url = new URL(browserWindow.location.href); url.searchParams.delete('film');
        browserWindow.history.replaceState(browserWindow.history.state, '', url);
      }
    }
  }

  function handlePopState() {
    restoreCatalogue();
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
