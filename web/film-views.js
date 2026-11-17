import { genresWithSelectedFirst, posterFallbackFor, responsivePosterAttrs, setGenreLabel } from './film-components.js';
import { filmIdentifier, findFilmByIdentifier } from './film-navigation.js';
import { graphemeMiddleExcerpt } from './display-text.js';

const filmMetadataBatchSize = 8;

function appendProgressiveGenreTags(container, genres, genreChipFor, { initialCount = 2, expandedCount = initialCount, selectedGenres = [] } = {}) {
  genres = genresWithSelectedFirst(genres, selectedGenres);
  container.dataset.activeGenreFilters = JSON.stringify(selectedGenres);
  const collapsedCount = Math.min(initialCount, genres.length);
  let visibleCount = Math.min(Math.max(collapsedCount, expandedCount), genres.length);
  genres.slice(0, visibleCount).forEach((genre, index) => {
    const tag = genreChipFor(genre);
    if (index >= collapsedCount) tag.classList.add('genre-extra-tag');
    container.append(tag);
  });
  if (genres.length <= collapsedCount) return;

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'genre-tag genre-tag-more';
  const updateLabel = () => {
    const remaining = genres.length - visibleCount;
    more.textContent = remaining ? `+${remaining}` : '−';
    more.setAttribute('aria-label', remaining
      ? `Show ${Math.min(filmMetadataBatchSize, remaining)} more ${remaining === 1 ? 'genre' : 'genres'}; ${remaining} remaining`
      : 'Show fewer genres');
  };
  const initiallyExpanded = visibleCount > collapsedCount;
  container.classList.toggle('is-expanded', initiallyExpanded);
  more.setAttribute('aria-expanded', String(initiallyExpanded));
  updateLabel();
  more.addEventListener('click', (event) => {
    let shouldMoveFocus = false;
    let extra = [];
    if (visibleCount < genres.length) {
      shouldMoveFocus = event.detail === 0 || document.documentElement.dataset.inputModality === 'keyboard';
      const end = Math.min(genres.length, visibleCount + filmMetadataBatchSize);
      extra = genres.slice(visibleCount, end).map((genre) => {
        const tag = genreChipFor(genre);
        tag.classList.add('genre-extra-tag');
        return tag;
      });
      more.before(...extra);
      visibleCount = end;
    } else {
      container.querySelectorAll('.genre-extra-tag').forEach((tag) => tag.remove());
      visibleCount = collapsedCount;
    }
    const expanded = visibleCount > collapsedCount;
    container.classList.toggle('is-expanded', expanded);
    more.setAttribute('aria-expanded', String(expanded));
    updateLabel();
    if (expanded && shouldMoveFocus) extra[0]?.focus();
  });
  container.append(more);
}

export function createFilmViews(dependencies) {
  const {
    getFilms, state, safeUrl, makeLink, directorCreditFor, countryRuntimeMetaFor,
    genreChipFor, filmDetailButtonFor, filmAppearanceCountFor, toggleDirector, toggleGenre,
    focusCollectionTitleAfterFilter,
    originalFilmFactsFor, sourceListNotesFor, filmProgrammeNotesFor,
    filmDetailContent, filmDetailDialog, lockModalScroll, unlockModalScroll, registerBackdropDismiss, getCurrentMatchingFilms,
    posterViewerDialog, posterViewerImage, posterViewerTitle, posterViewerCaption,
    posterViewerZoom, posterViewerClose, posterViewerStatus, posterViewerFeedback, posterViewerRetry, posterViewerGalleryRetry, posterViewerGallery,
    getSnapshotRefreshedAt,
    getPosterGalleryUrl,
    loadFilmDetails,
    rememberPosterChoice,
    resetPosterChoice,
    hasPosterChoice,
    onFilmDetailChange,
    getFilmShareUrl,
  } = dependencies;
let detailFilm = null;
let detailNavigationFilms = null;
let posterAccentRequest = 0;
let posterGalleryRequest = 0;
let posterGalleryDataPromise;
let posterPreviewRequest = 0;
let activePosterFilm = null;
let posterViewerOpener = null;
let retryPosterPreview = null;
let retryPosterGallery = null;
const featuredFilmByFilm = new WeakMap();
const failedPosterUrlsByFilm = new WeakMap();
const posterUrlsWithoutResponsiveCandidatesByFilm = new WeakMap();

function posterUrlFailed(film, url) {
  return Boolean(url && failedPosterUrlsByFilm.get(film)?.has(url));
}

function rememberFailedPosterUrl(film, url) {
  if (!url) return;
  let failedUrls = failedPosterUrlsByFilm.get(film);
  if (!failedUrls) {
    failedUrls = new Set();
    failedPosterUrlsByFilm.set(film, failedUrls);
  }
  failedUrls.add(url);
}

function rememberResponsivePosterFailure(film, url) {
  if (!url) return;
  let failedUrls = posterUrlsWithoutResponsiveCandidatesByFilm.get(film);
  if (!failedUrls) {
    failedUrls = new Set();
    posterUrlsWithoutResponsiveCandidatesByFilm.set(film, failedUrls);
  }
  failedUrls.add(url);
}

function updatePosterGallerySelection(selectedButton) {
  posterViewerGallery.querySelectorAll('.poster-viewer-option').forEach((option) => {
    const selected = option === selectedButton;
    const language = option.dataset.posterLanguage || 'No language tag';
    const position = option.dataset.posterPosition || '';
    const unavailable = option.dataset.posterUnavailable === 'true';
    option.setAttribute('aria-pressed', String(selected));
    option.setAttribute('aria-label', `${unavailable ? 'Retry loading' : selected ? 'Current poster' : 'Select poster'}, ${language}, ${position}`);
    const label = option.querySelector('.poster-viewer-option-label');
    if (label && !unavailable) label.textContent = selected ? 'Current' : language;
  });
}

function updatePosterGalleryStatus() {
  const options = [...posterViewerGallery.querySelectorAll('.poster-viewer-option')];
  const unavailableCount = options.filter((option) => option.dataset.posterUnavailable === 'true').length;
  const availableCount = options.length - unavailableCount;
  const availableLabel = availableCount === 1 ? 'poster option is' : 'poster options are';
  const unavailableNote = unavailableCount
    ? ` ${unavailableCount} ${unavailableCount === 1 ? 'option is' : 'options are'} unavailable. Select one to retry.`
    : '';
  posterViewerStatus.textContent = `${availableCount} ${availableLabel} available.${unavailableNote}`;
}

function posterVariant(url, size) {
  const parsed = new URL(url);
  if (parsed.hostname !== 'image.tmdb.org') return url;
  parsed.pathname = parsed.pathname.replace(/^\/t\/p\/(?:w\d+|original)(?=\/)/, `/t/p/${size}`);
  return parsed.href;
}

async function previewPoster(film, url, { save = false, caption = '', canonicalUrl = url, zoomed = false, selectedButton = null, onReady = null } = {}) {
  const retryHadFocus = document.activeElement === posterViewerRetry && !posterViewerRetry.hidden;
  const request = ++posterPreviewRequest;
  retryPosterPreview = null;
  posterViewerRetry.hidden = !retryHadFocus;
  if (retryHadFocus) {
    posterViewerRetry.textContent = 'Retrying poster…';
    posterViewerRetry.setAttribute('aria-disabled', 'true');
  } else {
    posterViewerRetry.textContent = 'Retry poster';
    posterViewerRetry.removeAttribute('aria-disabled');
  }
  posterViewerZoom.setAttribute('aria-disabled', 'true');
  posterViewerZoom.textContent = 'Loading poster…';
  posterViewerFeedback.textContent = 'Loading poster…';
  const stage = posterViewerImage.parentElement;
  if (posterViewerImage.hidden) stage.classList.add('is-fit');
  stage.setAttribute('aria-busy', 'true');
  const candidate = new Image();
  candidate.referrerPolicy = 'no-referrer';
  candidate.src = url;
  try {
    await candidate.decode();
  } catch {
    if (request === posterPreviewRequest && posterViewerDialog.open) {
      posterViewerFeedback.textContent = 'Could not load this poster. Your current poster choice is unchanged. You can retry.';
      retryPosterPreview = () => previewPoster(film, url, { save, caption, canonicalUrl, zoomed, selectedButton, onReady });
      posterViewerRetry.hidden = false;
      posterViewerRetry.textContent = 'Retry poster';
      posterViewerRetry.removeAttribute('aria-disabled');
      posterViewerZoom.disabled = posterViewerImage.hidden;
      posterViewerZoom.removeAttribute('aria-disabled');
      posterViewerZoom.textContent = posterViewerZoom.getAttribute('aria-pressed') === 'true' ? 'Fit to screen' : 'View at actual size';
      if (retryHadFocus && document.activeElement === document.body) posterViewerRetry.focus({ preventScroll: true });
    }
    return false;
  } finally {
    if (request === posterPreviewRequest) stage.removeAttribute('aria-busy');
  }
  if (request !== posterPreviewRequest || !posterViewerDialog.open) return false;

  posterViewerImage.src = url;
  posterViewerImage.alt = `${film.title} poster`;
  posterViewerImage.hidden = false;
  posterViewerImage.classList.toggle('is-zoomed', zoomed);
  stage.classList.toggle('is-fit', !zoomed);
  posterViewerCaption.dataset.posterUrl = canonicalUrl;
  posterViewerCaption.textContent = caption || [film.title, film.year].filter(Boolean).join(' · ');
  posterViewerZoom.disabled = false;
  if (retryHadFocus && document.activeElement === posterViewerRetry) {
    posterViewerZoom.focus({ preventScroll: true });
  }
  posterViewerRetry.hidden = true;
  posterViewerRetry.textContent = 'Retry poster';
  posterViewerRetry.removeAttribute('aria-disabled');
  posterViewerZoom.setAttribute('aria-pressed', String(zoomed));
  posterViewerZoom.textContent = zoomed ? 'Fit to screen' : 'View at actual size';
  posterViewerZoom.removeAttribute('aria-disabled');
  posterViewerFeedback.textContent = '';
  if (save && Number.isSafeInteger(film.tmdb_id)) {
    const saved = rememberPosterChoice(film, canonicalUrl);
    posterViewerFeedback.textContent = saved === false
      ? 'Could not save this poster choice in this browser.'
      : 'Poster choice saved on this device.';
  }
  onReady?.();
  if (selectedButton) updatePosterGallerySelection(selectedButton);
  return true;
}

function openPosterViewer(film, showGallery = false, retryUrl = '', { retryGallery = false } = {}) {
  const posterUrl = safeUrl(retryUrl || film.poster_url, ['image.tmdb.org', 'ltrbxd.com', 'letterboxd.com']);
  const request = ++posterGalleryRequest;
  posterPreviewRequest += 1;
  activePosterFilm = film;
  posterViewerOpener = document.activeElement;
  retryPosterPreview = null;
  retryPosterGallery = null;
  posterViewerRetry.hidden = true;
  posterViewerGalleryRetry.hidden = true;
  posterViewerRetry.textContent = 'Retry poster';
  posterViewerRetry.removeAttribute('aria-disabled');
  posterViewerGalleryRetry.textContent = 'Retry poster list';
  posterViewerGalleryRetry.removeAttribute('aria-disabled');
  posterViewerFeedback.textContent = '';
  posterViewerTitle.textContent = `${film.title} poster`;
  posterViewerDialog.classList.toggle('has-gallery', showGallery);
  posterViewerCaption.textContent = [film.title, film.year].filter(Boolean).join(' · ');
  posterViewerCaption.dataset.posterUrl = '';
  posterViewerImage.hidden = true;
  posterViewerImage.removeAttribute('src');
  posterViewerImage.alt = '';
  posterViewerImage.classList.remove('is-zoomed');
  posterViewerImage.parentElement.classList.toggle('is-fit', Boolean(posterUrl));
  posterViewerZoom.disabled = true;
  posterViewerZoom.setAttribute('aria-pressed', 'false');
  posterViewerZoom.textContent = 'View at actual size';
  posterViewerGallery.replaceChildren();
  posterViewerGallery.scrollLeft = 0;
  posterViewerGallery.hidden = true;
  posterViewerStatus.textContent = showGallery ? 'Loading alternate posters…' : '';
  lockModalScroll(posterViewerDialog);
  posterViewerDialog.showModal();
  const posterViewerContent = posterViewerDialog.querySelector('.poster-viewer-content');
  if (posterViewerContent) posterViewerContent.scrollTop = 0;
  if (posterUrl && posterUrlFailed(film, posterUrl)) {
    enablePosterViewerRetry(film, posterUrl);
  } else if (posterUrl) {
    void previewPoster(film, posterUrl, {
      onReady: retryUrl ? () => restoreDetailPosterAfterRetry(film, posterUrl) : null,
    }).then((loaded) => {
      if (!retryUrl || loaded || !posterViewerDialog.open || activePosterFilm !== film) return;
      rememberFailedPosterUrl(film, posterUrl);
      void updateFailedPosterGalleryAction(film, posterUrl);
    });
  }
  if (showGallery) void loadPosterGallery(film, posterUrl, request, { retry: retryGallery });
}

async function loadPosterGalleryData({ retry = false } = {}) {
  const galleryUrl = getPosterGalleryUrl();
  if (!galleryUrl) return null;
  if (!posterGalleryDataPromise) {
    posterGalleryDataPromise = fetch(galleryUrl, { cache: retry ? 'no-store' : 'force-cache' })
      .then((response) => response.ok ? response.json() : null)
      .catch(() => null);
  }
  let payload = await posterGalleryDataPromise;
  if (!payload) posterGalleryDataPromise = undefined;
  if (payload && payload.snapshot_refreshed_at !== getSnapshotRefreshedAt()) {
    payload = await fetch(galleryUrl, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .catch(() => null);
    posterGalleryDataPromise = payload ? Promise.resolve(payload) : undefined;
  }
  return payload?.snapshot_refreshed_at === getSnapshotRefreshedAt() ? payload : null;
}

function posterOptionsForFilm(film, currentPosterUrl, records) {
  const currentFailed = posterUrlFailed(film, currentPosterUrl);
  const currentRecord = Array.isArray(records) && currentPosterUrl
    ? records.find((record) => typeof record?.path === 'string' && record.path.startsWith('/') && currentPosterUrl.endsWith(record.path))
    : null;
  const posters = currentPosterUrl && !currentFailed
    ? [{ url: currentPosterUrl, language: currentRecord?.language || '', current: true }]
    : [];
  if (Array.isArray(records)) {
    records.forEach((record) => {
      if (typeof record?.path !== 'string' || !record.path.startsWith('/')) return;
      const url = safeUrl(`https://image.tmdb.org/t/p/w500${record.path}`, ['image.tmdb.org']);
      if (!url || url === currentPosterUrl || (currentPosterUrl && currentPosterUrl.endsWith(record.path)) || posters.some((poster) => poster.url === url)) return;
      posters.push({ url, language: typeof record.language === 'string' ? record.language : '', current: false });
    });
  }
  return posters;
}

async function updateFailedPosterGalleryAction(film, failedPosterUrl) {
  const button = filmDetailContent.querySelector('.film-detail-browse-posters');
  if (!button || detailFilm !== film || !Number.isSafeInteger(film.tmdb_id)) return;
  button.setAttribute('aria-disabled', 'true');
  button.setAttribute('aria-busy', 'true');
  button.textContent = 'Checking poster options…';
  const payload = await loadPosterGalleryData();
  if (!button.isConnected || detailFilm !== film) return;
  const currentPosterUrl = safeUrl(film.poster_url, ['image.tmdb.org', 'ltrbxd.com', 'letterboxd.com']);
  if (currentPosterUrl !== failedPosterUrl) {
    button.removeAttribute('aria-busy');
    button.removeAttribute('aria-disabled');
    return;
  }
  button.removeAttribute('aria-busy');
  button.removeAttribute('aria-disabled');
  const status = filmDetailContent.querySelector('.film-detail-gallery-status');
  if (!payload) {
    delete button.dataset.retryPosterUrl;
    button.dataset.retryGallery = 'true';
    button.textContent = 'Retry poster list';
    button.setAttribute('aria-label', `Retry loading alternate posters for ${film.title}`);
    if (status) status.textContent = 'Alternate posters could not be checked.';
    if (posterViewerDialog.open && activePosterFilm === film) {
      posterViewerStatus.textContent = posterUrlFailed(film, failedPosterUrl)
        ? 'Alternate posters could not be loaded. Retry the poster list below.'
        : 'Alternate posters could not be loaded. Retry the poster list below.';
    }
    return;
  }
  delete button.dataset.retryGallery;
  if (status) status.textContent = '';
  const records = payload.galleries?.[String(film.tmdb_id)];
  const alternatives = posterOptionsForFilm(film, failedPosterUrl, records).some((poster) => !poster.current);
  if (!alternatives) {
    button.setAttribute('aria-disabled', 'true');
    button.textContent = 'No alternate posters available';
    button.setAttribute('aria-label', `No alternate posters are available for ${film.title}`);
    if (status) status.textContent = 'No alternate posters are available.';
    return;
  }
  delete button.dataset.retryPosterUrl;
  button.textContent = 'Browse posters';
  button.setAttribute('aria-label', `Browse posters for ${film.title}`);
}

function restoreDetailPosterAfterRetry(film, posterUrl) {
  failedPosterUrlsByFilm.get(film)?.delete(posterUrl);
  if (posterViewerDialog.open && activePosterFilm === film) {
    const option = [...posterViewerGallery.querySelectorAll('.poster-viewer-option')]
      .find((item) => item.dataset.posterUrl === posterUrl);
    if (option) {
      const image = option.querySelector('img');
      const fallback = option.querySelector('.poster-viewer-thumbnail-fallback');
      if (image) {
        image.src = posterUrl;
        image.hidden = false;
      }
      if (fallback) fallback.hidden = true;
      delete option.dataset.posterUnavailable;
      option.removeAttribute('title');
      updatePosterGallerySelection(option);
      updatePosterGalleryStatus();
    }
    posterViewerRetry.hidden = true;
    retryPosterPreview = null;
  }
  if (detailFilm !== film) return;
  filmDetailContent.querySelector('.film-detail-poster')?.replaceWith(detailPosterFor(film, posterUrl, '', { responsive: false }));
  void updateFailedPosterGalleryAction(film, posterUrl);
}

function enablePosterViewerRetry(film, posterUrl) {
  if (!posterViewerDialog.open || activePosterFilm !== film) return;
  posterViewerRetry.hidden = false;
  posterViewerRetry.textContent = 'Retry poster';
  posterViewerRetry.removeAttribute('aria-disabled');
  retryPosterPreview = () => {
    failedPosterUrlsByFilm.get(film)?.delete(posterUrl);
    return previewPoster(film, posterUrl, { onReady: () => restoreDetailPosterAfterRetry(film, posterUrl) }).then((loaded) => {
      if (!loaded && posterViewerDialog.open && activePosterFilm === film) {
        rememberFailedPosterUrl(film, posterUrl);
        void updateFailedPosterGalleryAction(film, posterUrl);
      }
      return loaded;
    });
  };
}

function enablePosterGalleryRetry(film, currentPosterUrl) {
  posterViewerGalleryRetry.hidden = false;
  posterViewerGalleryRetry.textContent = 'Retry poster list';
  posterViewerGalleryRetry.removeAttribute('aria-disabled');
  retryPosterGallery = async () => {
    if (!posterViewerDialog.open || activePosterFilm !== film) return;
    const retryHadFocus = document.activeElement === posterViewerGalleryRetry;
    posterGalleryDataPromise = undefined;
    const request = ++posterGalleryRequest;
    posterViewerGallery.replaceChildren();
    posterViewerGallery.hidden = true;
    posterViewerGalleryRetry.setAttribute('aria-disabled', 'true');
    posterViewerGalleryRetry.textContent = 'Loading poster list…';
    posterViewerStatus.textContent = 'Loading alternate posters…';
    await loadPosterGallery(film, currentPosterUrl, request, { retry: true });
    if (!posterViewerDialog.open || activePosterFilm !== film) return;
    if (posterViewerGalleryRetry.getAttribute('aria-disabled') === 'true') {
      posterViewerGalleryRetry.removeAttribute('aria-disabled');
      posterViewerGalleryRetry.textContent = 'Retry poster list';
    }
    if (retryHadFocus && document.activeElement === document.body) {
      const firstOption = posterViewerGallery.querySelector('.poster-viewer-option');
      if (firstOption) firstOption.focus();
      else posterViewerClose.focus();
    }
  };
}

async function loadPosterGallery(film, currentPosterUrl, request, { retry = false } = {}) {
  const galleryUrl = getPosterGalleryUrl();
  if (!galleryUrl || !Number.isSafeInteger(film.tmdb_id)) {
    posterViewerStatus.textContent = 'Alternate posters are not available for this film.';
    return;
  }
  const payload = await loadPosterGalleryData({ retry });
  if (request !== posterGalleryRequest) return;
  if (!payload) {
    posterViewerStatus.textContent = posterUrlFailed(film, currentPosterUrl)
      ? 'Alternate posters could not be loaded. Retry the poster list below.'
      : 'Alternate posters could not be loaded. Retry the poster list below.';
    enablePosterGalleryRetry(film, currentPosterUrl);
    return;
  }
  if (detailFilm === film) void updateFailedPosterGalleryAction(film, currentPosterUrl);

  const records = payload.galleries?.[String(film.tmdb_id)];
  const posters = posterOptionsForFilm(film, currentPosterUrl, records);
  const hasCurrentPoster = posters.some((poster) => poster.current);
  const hasAlternatePoster = posters.some((poster) => !poster.current);
  if (!posters.length || (hasCurrentPoster && !hasAlternatePoster)) {
    posterViewerStatus.textContent = 'No alternate posters are available for this film.';
    posterViewerGalleryRetry.hidden = true;
    retryPosterGallery = null;
    return;
  }

  posterViewerStatus.textContent = `${posters.length} poster ${posters.length === 1 ? 'option' : 'options'}. Choose one to use on this device.`;
  posters.forEach((poster, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'poster-viewer-option';
    button.dataset.posterUrl = poster.url;
    button.setAttribute('aria-pressed', String(poster.current));
    const language = poster.language ? poster.language.toUpperCase() : 'No language tag';
    button.dataset.posterLanguage = language;
    button.dataset.posterPosition = `${index + 1} of ${posters.length}`;
    button.setAttribute('aria-label', `${poster.current ? 'Current poster' : 'Select poster'}, ${language}, ${index + 1} of ${posters.length}`);
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    const unavailable = document.createElement('span');
    unavailable.className = 'poster-viewer-thumbnail-fallback';
    unavailable.textContent = 'No image';
    unavailable.setAttribute('aria-hidden', 'true');
    unavailable.hidden = true;
    const label = document.createElement('span');
    label.className = 'poster-viewer-option-label';
    label.textContent = poster.current ? 'Current' : language;
    image.addEventListener('error', () => {
      image.hidden = true;
      unavailable.hidden = false;
      button.dataset.posterUnavailable = 'true';
      label.textContent = `${language} · unavailable`;
      button.title = 'Could not load this poster. Select to retry.';
      const activeDetailImage = detailFilm === film
        ? filmDetailContent.querySelector('.film-detail-poster img')
        : null;
      const isCurrentDetailPoster = poster.current
        && (activeDetailImage?.src === poster.url || (!activeDetailImage && posterUrlFailed(film, poster.url)));
      if (isCurrentDetailPoster) {
        rememberFailedPosterUrl(film, poster.url);
        button.setAttribute('aria-pressed', 'false');
        void updateFailedPosterGalleryAction(film, poster.url);
        enablePosterViewerRetry(film, poster.url);
      }
      button.setAttribute('aria-label', `Retry loading ${language} poster, ${index + 1} of ${posters.length}`);
      updatePosterGalleryStatus();
    });
    button.append(image, unavailable, label);
    image.src = poster.url;
    button.addEventListener('click', () => {
      void previewPoster(film, poster.url, {
        save: true,
        caption: [film.title, film.year, language, `${index + 1} of ${posters.length}`].filter(Boolean).join(' · '),
        selectedButton: button,
        onReady: () => {
          if (!button.isConnected) return;
          if (poster.current) restoreDetailPosterAfterRetry(film, poster.url);
          image.src = poster.url;
          image.hidden = false;
          unavailable.hidden = true;
          delete button.dataset.posterUnavailable;
          button.removeAttribute('title');
          updatePosterGalleryStatus();
        },
      });
    });
    posterViewerGallery.append(button);
  });
  posterViewerGallery.hidden = false;
  posterViewerGallery.scrollLeft = 0;
  posterViewerGalleryRetry.hidden = true;
  retryPosterGallery = null;
}

posterViewerZoom.addEventListener('click', () => {
  if (posterViewerZoom.getAttribute('aria-disabled') === 'true') return;
  const selected = posterViewerCaption.dataset.posterUrl;
  if (!selected || !activePosterFilm) return;
  const zoomed = posterViewerZoom.getAttribute('aria-pressed') !== 'true';
  void previewPoster(activePosterFilm, posterVariant(selected, zoomed ? 'original' : 'w500'), {
    canonicalUrl: selected,
    caption: posterViewerCaption.textContent,
    zoomed,
  });
});
posterViewerGallery.addEventListener('focusin', (event) => {
  const option = event.target.closest('.poster-viewer-option');
  option?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
});
posterViewerRetry.addEventListener('click', () => {
  if (posterViewerRetry.getAttribute('aria-disabled') === 'true') return;
  void retryPosterPreview?.();
});
posterViewerGalleryRetry.addEventListener('click', () => {
  if (posterViewerGalleryRetry.getAttribute('aria-disabled') === 'true') return;
  void retryPosterGallery?.();
});
function dismissPosterViewer() {
  if (!posterViewerDialog.open) return;
  posterViewerOpener = null;
  posterViewerDialog.close();
}
posterViewerDialog.addEventListener('close', () => {
  unlockModalScroll(posterViewerDialog);
  if (posterViewerDialog.open) return;
  posterViewerDialog.classList.remove('has-gallery');
  posterPreviewRequest += 1;
  posterGalleryRequest += 1;
  activePosterFilm = null;
  retryPosterPreview = null;
  retryPosterGallery = null;
  posterViewerRetry.hidden = true;
  posterViewerGalleryRetry.hidden = true;
  posterViewerRetry.textContent = 'Retry poster';
  posterViewerRetry.removeAttribute('aria-disabled');
  posterViewerImage.parentElement.removeAttribute('aria-busy');
  if (filmDetailDialog.open && posterViewerOpener) {
    const opener = posterViewerOpener;
    const target = opener?.isConnected && !opener.disabled && filmDetailDialog.contains(opener)
      ? opener
      : filmDetailContent.querySelector('.film-detail-browse-posters') || filmDetailDialog.querySelector('#film-detail-close');
    target?.focus({ preventScroll: true });
  }
  posterViewerOpener = null;
});
posterViewerClose.addEventListener('click', () => posterViewerDialog.close());
registerBackdropDismiss(posterViewerDialog);

filmDetailDialog.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  const isRtl = getComputedStyle(filmDetailDialog).direction === 'rtl';
  const selector = event.key === 'ArrowLeft'
    ? (isRtl ? '#film-detail-next' : '#film-detail-previous')
    : event.key === 'ArrowRight'
      ? (isRtl ? '#film-detail-previous' : '#film-detail-next')
      : '';
  if (!selector) return;
  const button = filmDetailContent.querySelector(selector);
  if (!button || button.disabled) return;
  event.preventDefault();
  button.click();
});

function samplePosterAccent(posterUrl, request) {
  if (!posterUrl) return;
  const sampler = new Image();
  sampler.crossOrigin = 'anonymous';
  sampler.onload = () => {
    if (request !== posterAccentRequest) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(sampler, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        red += pixels[index];
        green += pixels[index + 1];
        blue += pixels[index + 2];
      }
      const total = pixels.length / 4;
      const rgb = [red, green, blue].map((channel) => channel / total / 255);
      const max = Math.max(...rgb);
      const min = Math.min(...rgb);
      const delta = max - min;
      let hue = 0;
      if (delta) {
        if (max === rgb[0]) hue = ((rgb[1] - rgb[2]) / delta) % 6;
        else if (max === rgb[1]) hue = (rgb[2] - rgb[0]) / delta + 2;
        else hue = (rgb[0] - rgb[1]) / delta + 4;
        hue = (hue * 60 + 360) % 360;
      }
      const saturation = max ? delta / max : 0;
      const lightness = (max + min) / 2;
      const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const mutedLightness = darkMode
        ? Math.min(.76, Math.max(.62, lightness))
        : Math.min(.46, Math.max(.31, lightness));
      const mutedSaturation = Math.min(.48, saturation * .58);
      filmDetailDialog.style.setProperty('--poster-accent', `hsl(${hue.toFixed(0)} ${Math.round(mutedSaturation * 100)}% ${Math.round(mutedLightness * 100)}%)`);
    } catch {
      filmDetailDialog.style.removeProperty('--poster-accent');
    }
  };
  sampler.src = posterUrl;
}

function openFilmDetails(film, { focusProvenance = false } = {}) {
  renderFilmDetails(film);
  lockModalScroll(filmDetailDialog);
  if (!filmDetailDialog.open) filmDetailDialog.showModal();
  filmDetailContent.scrollTop = 0;
  filmDetailContent.scrollLeft = 0;
  filmDetailContent.focus({ preventScroll: true });
  if (focusProvenance) requestAnimationFrame(() => {
    const provenance = filmDetailContent.querySelector('.film-note-sources');
    if (provenance) {
      provenance.focus({ preventScroll: true });
      provenance.scrollIntoView({ block: 'start' });
    }
  });
}

function closeFilmDetailsForFilter() {
  if (filmDetailDialog.open) filmDetailDialog.close();
  unlockModalScroll(filmDetailDialog);
}

function detailNavigationFor(film) {
  const currentFilms = getCurrentMatchingFilms();
  const currentIndex = currentFilms.indexOf(film);
  if (currentIndex >= 0 && currentFilms.length > 1) {
    const navigation = document.createElement('nav');
    navigation.className = 'film-detail-navigation';
    navigation.setAttribute('aria-label', 'Browse films in the current results');
    const position = document.createElement('span');
    position.className = 'film-detail-position';
    position.id = 'film-detail-position';
    position.setAttribute('role', 'status');
    position.setAttribute('aria-live', 'polite');
    position.setAttribute('aria-atomic', 'true');
    position.textContent = `Film ${(currentIndex + 1).toLocaleString()} of ${currentFilms.length.toLocaleString()}`;
    const stepButtonFor = (direction, destination, boundaryLabel) => {
      const isPrevious = direction === 'previous';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'film-detail-step';
      button.id = `film-detail-${direction}`;
      button.disabled = !destination;
      const label = document.createElement('span');
      label.className = 'film-detail-step-label';
      label.dir = 'ltr';
      const isRtl = getComputedStyle(filmDetailDialog).direction === 'rtl';
      label.textContent = isPrevious
        ? (isRtl ? 'Previous →' : '← Previous')
        : (isRtl ? '← Next' : 'Next →');
      const title = document.createElement('span');
      title.className = 'film-detail-step-title';
      const fullTitle = destination?.title || boundaryLabel;
      title.textContent = graphemeMiddleExcerpt(fullTitle, 9, 13);
      title.title = fullTitle;
      button.append(label, title);
      button.setAttribute('aria-label', destination
        ? `${isPrevious ? 'Previous' : 'Next'}: ${destination.title}`
        : boundaryLabel);
      if (destination) button.addEventListener('click', () => renderFilmDetails(destination, direction));
      return button;
    };
    const previous = stepButtonFor('previous', currentFilms[currentIndex - 1], 'First result');
    const next = stepButtonFor('next', currentFilms[currentIndex + 1], 'Last result');
    const keyboardHint = document.createElement('span');
    keyboardHint.className = 'film-detail-keyboard-hint';
    keyboardHint.append('Use ', Object.assign(document.createElement('kbd'), { textContent: '←' }), ' and ', Object.assign(document.createElement('kbd'), { textContent: '→' }), ' to browse');
    navigation.append(previous, position, next);
    navigation.append(keyboardHint);
    return navigation;
  }
  return null;
}

function refreshFilmNavigation() {
  if (!filmDetailDialog.open || !detailFilm) return;
  const matching = getCurrentMatchingFilms();
  const identifier = filmIdentifier(detailFilm);
  const film = findFilmByIdentifier(getFilms(), identifier) || detailFilm;
  if (matching === detailNavigationFilms && film === detailFilm) return;
  const previous = filmDetailContent.querySelector('.film-detail-navigation');
  const focused = previous?.contains(document.activeElement) ? document.activeElement.id : '';
  const next = detailNavigationFor(film);
  if (previous && next) previous.replaceWith(next);
  else if (previous) previous.remove();
  else if (next) {
    const copy = filmDetailContent.querySelector('.film-detail-copy');
    const headingEnd = copy?.querySelector('.film-detail-year') || copy?.querySelector('#film-detail-title');
    if (headingEnd) headingEnd.after(next);
    else copy?.append(next);
  }
  detailFilm = film;
  detailNavigationFilms = matching;
  if (focused) {
    const preferred = next?.querySelector(`#${focused}`);
    const fallback = next?.querySelector('.film-detail-step:not(:disabled)');
    (preferred && !preferred.disabled ? preferred : fallback || filmDetailDialog.querySelector('.film-detail-close'))?.focus({ preventScroll: true });
  }
}

function filmNotesBodyForDetails() {
  let body = filmDetailContent.querySelector('.film-notes-body');
  if (body) return body;
  const supporting = filmDetailContent.querySelector('.film-detail-supporting');
  if (!supporting) return null;
  const notes = document.createElement('section');
  notes.className = 'film-notes';
  notes.setAttribute('aria-label', 'Film details');
  const heading = document.createElement('h3');
  heading.className = 'film-notes-heading';
  heading.textContent = 'Film details';
  body = document.createElement('div');
  body.className = 'film-notes-body';
  notes.append(heading, body);
  supporting.prepend(notes);
  return body;
}

function filmDetailsRetryButton(film) {
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'film-detail-external-link';
  retry.textContent = 'Retry';
  retry.addEventListener('click', () => {
    if (film.detail_load_status !== 'loading') loadDetailsForFilm(film, { retry: true });
  });
  return retry;
}

function updateFilmDetailSynopsis(film) {
  const status = filmDetailContent.querySelector('.film-detail-metadata-status');
  const hadRetryFocus = status?.querySelector('button') === document.activeElement;
  const synopsisText = film.detail_overview;
  const body = synopsisText ? filmNotesBodyForDetails() : filmDetailContent.querySelector('.film-notes-body');
  let synopsis = body?.querySelector('.film-note-synopsis');
  if (body && synopsisText && !synopsis) {
    const section = document.createElement('section');
    section.className = 'film-note-section';
    const heading = document.createElement('h4');
    heading.textContent = 'Synopsis';
    heading.tabIndex = -1;
    synopsis = document.createElement('p');
    synopsis.className = 'film-note-synopsis';
    section.append(heading, synopsis);
    body.prepend(section);
  }
  if (synopsis && synopsisText) synopsis.textContent = synopsisText;
  if (film.detail_load_status === 'loaded') {
    status?.remove();
    if (hadRetryFocus) {
      const heading = body?.querySelector('.film-note-synopsis')?.previousElementSibling;
      (heading || filmDetailContent).focus({ preventScroll: true });
    }
    return;
  }
  const statusText = status?.querySelector('.film-detail-metadata-copy');
  const retry = status?.querySelector('button');
  if (film.detail_load_status === 'error') {
    if (statusText) statusText.textContent = 'Film synopsis could not load. ';
    const retryButton = retry || (status && filmDetailsRetryButton(film));
    if (retryButton) {
      retryButton.removeAttribute('aria-disabled');
      retryButton.textContent = 'Retry';
      if (!retry) status.append(retryButton);
    }
  } else {
    if (statusText) statusText.textContent = 'Loading synopsis…';
    if (retry) {
      retry.setAttribute('aria-disabled', 'true');
      retry.textContent = 'Loading…';
    }
  }
}

function loadDetailsForFilm(film, { retry = false } = {}) {
  if (!film.detail_shard_url || !loadFilmDetails || film.detail_load_status === 'loading') return;
  if (!retry && film.detail_load_status === 'loaded') return;
  film.detail_load_status = 'loading';
  if (detailFilm === film && filmDetailDialog.open) updateFilmDetailSynopsis(film);
  Promise.resolve(loadFilmDetails(film, { retry })).then((overview) => {
    film.detail_overview = overview;
    film.detail_load_status = 'loaded';
    if (detailFilm === film && filmDetailDialog.open) updateFilmDetailSynopsis(film);
  }).catch((error) => {
    console.warn('Film details could not be loaded.', error);
    film.detail_load_status = 'error';
    if (detailFilm === film && filmDetailDialog.open) updateFilmDetailSynopsis(film);
  });
}

function detailPosterFor(film, posterUrl, retryUrl = '', { responsive = true } = {}) {
  const poster = document.createElement(posterUrl ? 'button' : 'div');
  poster.className = `film-detail-poster${posterUrl ? ' film-detail-poster-trigger' : ''}`;
  if (posterUrl) {
    poster.type = 'button';
    poster.setAttribute('aria-label', `View poster for ${film.title}`);
    poster.addEventListener('click', () => openPosterViewer(film));
    const image = document.createElement('img');
    image.src = posterUrl;
    if (responsive) responsivePosterAttrs(image, posterUrl, '(max-width: 640px) 30vw, 180px');
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      // A selected alternate replaces this poster node. Ignore a late error
      // from the detached original so it cannot offer a retry for stale art.
      if (!poster.isConnected || detailFilm !== film || poster.querySelector('img') !== image || image.src !== posterUrl) return;
      rememberFailedPosterUrl(film, posterUrl);
      poster.replaceWith(detailPosterFor(film, '', posterUrl));
      void updateFailedPosterGalleryAction(film, posterUrl);
      enablePosterViewerRetry(film, posterUrl);
    }, { once: true });
    image.addEventListener('load', () => failedPosterUrlsByFilm.get(film)?.delete(posterUrl), { once: true });
    poster.append(image);
    const cue = document.createElement('span');
    cue.className = 'poster-enlarge-cue';
    cue.textContent = 'Enlarge poster';
    cue.setAttribute('aria-hidden', 'true');
    poster.append(cue);
  } else {
    poster.append(posterFallbackFor(film, 'poster-fallback film-detail-poster-fallback'));
    if (retryUrl) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'film-detail-poster-retry';
      retry.textContent = 'Retry poster';
      retry.setAttribute('aria-label', `Retry loading the poster for ${film.title}`);
      retry.addEventListener('click', () => {
        if (retry.getAttribute('aria-disabled') === 'true') return;
        retry.setAttribute('aria-disabled', 'true');
        retry.textContent = 'Loading poster…';
        const probe = new Image();
        probe.referrerPolicy = 'no-referrer';
        probe.onload = () => {
          if (!poster.isConnected || detailFilm !== film || safeUrl(film.poster_url, ['image.tmdb.org', 'ltrbxd.com', 'letterboxd.com']) !== retryUrl) return;
          const retryHadFocus = document.activeElement === retry;
          failedPosterUrlsByFilm.get(film)?.delete(retryUrl);
          rememberResponsivePosterFailure(film, retryUrl);
          updatePosterForFilm(film, retryUrl, { restoreFocus: retryHadFocus, responsive: false });
        };
        probe.onerror = () => {
          retry.removeAttribute('aria-disabled');
          retry.textContent = 'Retry poster';
          const status = poster.querySelector('.film-detail-poster-retry-status');
          if (status) status.textContent = 'The poster could not load. Try again.';
        };
        probe.src = retryUrl;
      });
      const status = document.createElement('span');
      status.className = 'film-detail-poster-retry-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      poster.querySelector('.film-detail-poster-fallback')?.append(retry, status);
    }
  }
  return poster;
}

function renderFilmDetails(film, retainFocus = false) {
  detailFilm = film;
  detailNavigationFilms = getCurrentMatchingFilms();
  onFilmDetailChange(film);
  if (film.detail_shard_url && !film.detail_load_status) loadDetailsForFilm(film);
  const films = getFilms();
  filmDetailContent.replaceChildren();
  const layout = document.createElement('div');
  layout.className = 'film-detail-layout';
  const posterUrl = safeUrl(film.poster_url, ['image.tmdb.org', 'ltrbxd.com', 'letterboxd.com']);
  const posterColumn = document.createElement('div');
  posterColumn.className = 'film-detail-poster-column';
  const poster = detailPosterFor(film, posterUrl, '', {
    responsive: !posterUrlsWithoutResponsiveCandidatesByFilm.get(film)?.has(posterUrl),
  });
  posterColumn.append(poster);
  if ((film.has_poster_gallery === true || (film.has_poster_gallery === undefined && Number.isSafeInteger(film.tmdb_id)))
      && Number.isSafeInteger(film.tmdb_id) && getPosterGalleryUrl()) {
    const galleryButton = document.createElement('button');
    galleryButton.type = 'button';
    galleryButton.className = 'film-detail-gallery-button film-detail-browse-posters';
    galleryButton.textContent = posterUrl ? 'View other posters' : 'Browse posters';
    galleryButton.setAttribute('aria-label', `${posterUrl ? 'View other posters for' : 'Browse posters for'} ${film.title}`);
    galleryButton.addEventListener('click', () => {
      if (galleryButton.getAttribute('aria-disabled') === 'true') return;
      const retryUrl = galleryButton.dataset.retryPosterUrl;
      if (retryUrl) {
        failedPosterUrlsByFilm.get(film)?.delete(retryUrl);
        openPosterViewer(film, false, retryUrl);
        return;
      }
      openPosterViewer(film, true, '', { retryGallery: galleryButton.dataset.retryGallery === 'true' });
    });
    const galleryStatus = document.createElement('span');
    galleryStatus.className = 'film-detail-action-status film-detail-gallery-status';
    galleryStatus.setAttribute('role', 'status');
    galleryStatus.setAttribute('aria-live', 'polite');
    posterColumn.append(galleryButton, galleryStatus);
  }
  const resetPosterButton = document.createElement('button');
  resetPosterButton.type = 'button'; resetPosterButton.className = 'film-detail-gallery-button';
  resetPosterButton.textContent = 'Reset poster';
  resetPosterButton.setAttribute('aria-label', `Reset poster for ${film.title} to the catalogue original`);
  resetPosterButton.hidden = !hasPosterChoice(film);
  const resetStatus = document.createElement('span'); resetStatus.className = 'film-detail-action-status'; resetStatus.setAttribute('role', 'status'); resetStatus.setAttribute('aria-live', 'polite');
  resetPosterButton.addEventListener('click', () => {
    const reset = resetPosterChoice(film);
    resetPosterButton.hidden = !hasPosterChoice(film);
    resetStatus.textContent = reset
      ? 'Poster reset to the catalogue original.'
      : 'Could not save the poster reset in this browser.';
  });
  posterColumn.append(resetPosterButton, resetStatus);
  const copy = document.createElement('div');
  copy.className = 'film-detail-copy';
  const rank = films.indexOf(film) + 1;
  const kicker = document.createElement('p');
  kicker.className = 'film-detail-kicker';
  kicker.textContent = `Catalogue no. ${String(rank).padStart(3, '0')} · ${film.watched ? 'Watched' : 'Unwatched'}`;
  const navigation = detailNavigationFor(film);
  const title = document.createElement('h2');
  title.id = 'film-detail-title';
  title.textContent = film.title;
  const titleToggle = document.createElement('button');
  titleToggle.type = 'button';
  titleToggle.className = 'film-detail-title-toggle';
  titleToggle.textContent = 'Show full title';
  const fullTitle = document.createElement('div');
  fullTitle.id = 'film-detail-title-full';
  fullTitle.className = 'film-detail-full-title';
  fullTitle.setAttribute('role', 'region');
  fullTitle.setAttribute('aria-label', 'Full film title');
  fullTitle.tabIndex = 0;
  fullTitle.textContent = film.title;
  fullTitle.hidden = true;
  titleToggle.setAttribute('aria-controls', fullTitle.id);
  titleToggle.setAttribute('aria-expanded', 'false');
  const hasLongTitle = film.title.length > 180;
  if (hasLongTitle) {
    title.classList.add('is-clamped');
    title.tabIndex = -1;
  }
  titleToggle.hidden = !hasLongTitle;
  titleToggle.addEventListener('click', () => {
    const expanded = fullTitle.hidden;
    fullTitle.hidden = !expanded;
    titleToggle.textContent = expanded ? 'Hide full title' : 'Show full title';
    titleToggle.setAttribute('aria-expanded', String(expanded));
    if (expanded) window.requestAnimationFrame(() => fullTitle.scrollIntoView({ block: 'nearest', behavior: 'instant' }));
  });
  const year = document.createElement('span');
  year.className = 'film-detail-year';
  year.textContent = film.year || 'Year unknown';
  const directors = [...new Set(Array.isArray(film.directors) ? film.directors.filter((name) => typeof name === 'string' && name.trim()) : [])];
  const director = directors.length
    ? directorCreditFor(directors, 'film-detail-director', closeFilmDetailsForFilter)
    : document.createElement('p');
  director.classList.add('film-detail-director');
  if (!directors.length) director.textContent = 'Director not listed';
  const facts = countryRuntimeMetaFor(film, 'film-detail-facts', { beforeFilter: closeFilmDetailsForFilter });
  const score = document.createElement('p');
  score.className = 'film-detail-score';
  const scoreValue = document.createElement('strong');
  scoreValue.textContent = (Number(film.liked_in) || 0).toLocaleString();
  score.classList.toggle('has-long-count', scoreValue.textContent.length > 12);
  score.append(scoreValue, ` ${Number(film.liked_in) === 1 ? 'list appearance' : 'list appearances'}`);
  const supporting = document.createElement('div');
  supporting.className = 'film-detail-supporting';
  copy.append(kicker, title);
  if (hasLongTitle) copy.append(titleToggle, fullTitle);
  copy.append(year);
  if (navigation) copy.append(navigation);
  const originalFacts = originalFilmFactsFor(film);
  if (originalFacts) {
    const originalTitle = originalFacts.querySelector('dd[lang]');
    const languageTerm = [...originalFacts.querySelectorAll('dt')].find((term) => term.textContent === 'Original language');
    const languageValue = languageTerm?.nextElementSibling;
    const originalCredit = document.createElement('div');
    originalCredit.className = 'film-detail-original';
    originalCredit.setAttribute('role', 'group');
    originalCredit.setAttribute('aria-label', 'Original title and language');
    if (originalTitle) {
      const originalLabel = document.createElement('span');
      originalLabel.className = 'film-detail-original-label';
      originalLabel.textContent = 'Original title';
      const originalName = document.createElement('span');
      originalName.className = 'film-detail-original-name';
      originalName.lang = originalTitle.lang;
      originalName.textContent = originalTitle.textContent;
      originalCredit.append(originalLabel, originalName);
    }
    if (languageValue) {
      const language = document.createElement('span');
      language.className = 'film-detail-original-language';
      language.textContent = languageValue.textContent;
      originalCredit.append(language);
    }
    copy.append(originalCredit);
  }
  copy.append(director);
  if (facts) copy.append(facts);
  copy.append(score);
  const genres = [...new Set(Array.isArray(film.genres) ? film.genres.filter((genre) => typeof genre === 'string' && genre.trim()) : [])];
  if (genres.length) {
    const genreList = document.createElement('div');
    genreList.className = 'film-detail-genres';
    genreList.setAttribute('role', 'group');
    genreList.setAttribute('aria-label', `Filter by genres for ${film.title}`);
    appendProgressiveGenreTags(genreList, genres, (genre) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'genre-tag';
      button.dataset.genre = genre;
      setGenreLabel(button, genre, { full: true });
      button.setAttribute('aria-label', `Filter by ${genre}`);
      button.setAttribute('aria-pressed', String(state.genres.includes(genre)));
      button.addEventListener('click', () => {
        closeFilmDetailsForFilter();
        toggleGenre(genre);
        focusCollectionTitleAfterFilter();
      });
      return button;
    }, { initialCount: 6, selectedGenres: state.genres });
    copy.append(genreList);
  }
  const notes = filmProgrammeNotesFor(film, { includeOriginalFacts: false });
  if (notes) supporting.append(notes);
  if (film.detail_shard_url && film.detail_load_status !== 'loaded') {
    const detailStatus = document.createElement('div');
    detailStatus.className = 'film-detail-action-status film-detail-metadata-status';
    detailStatus.setAttribute('role', 'status');
    detailStatus.setAttribute('aria-live', 'polite');
    const detailStatusCopy = document.createElement('span');
    detailStatusCopy.className = 'film-detail-metadata-copy';
    if (film.detail_load_status === 'error') {
      detailStatusCopy.textContent = 'Film synopsis could not load. ';
      detailStatus.append(detailStatusCopy, filmDetailsRetryButton(film));
    } else {
      detailStatusCopy.textContent = 'Loading synopsis…';
      detailStatus.append(detailStatusCopy);
    }
    supporting.append(detailStatus);
  }
  const links = document.createElement('div');
  links.className = 'film-detail-links';
  const tmdbUrl = safeUrl(film.tmdb_url, ['themoviedb.org']);
  if (tmdbUrl) links.append(makeLink('Film data on TMDB ↗', tmdbUrl, 'film-detail-external-link'));
  const letterboxdUrl = safeUrl(film.letterboxd_url, ['letterboxd.com']);
  if (letterboxdUrl) links.append(makeLink('Open on Letterboxd ↗', letterboxdUrl, 'film-detail-external-link'));
  const filmShare = getFilmShareUrl(film);
  const shareUrl = typeof filmShare === 'string' ? filmShare : filmShare.url;
  const shareDetails = document.createElement('details');
  shareDetails.className = 'film-detail-share';
  shareDetails.hidden = Boolean(filmShare?.localFixture);
  const shareSummary = document.createElement('summary');
  const shareLabel = document.createElement('span');
  shareLabel.textContent = 'Share film link';
  const shareIndicator = document.createElement('span');
  shareIndicator.className = 'film-detail-share-indicator';
  shareIndicator.setAttribute('aria-hidden', 'true');
  shareIndicator.textContent = '⌄';
  shareSummary.append(shareLabel, shareIndicator);
  const shareInput = document.createElement('input');
  shareInput.className = 'film-detail-share-url';
  shareInput.type = 'url'; shareInput.readOnly = true; shareInput.value = shareUrl;
  shareInput.setAttribute('aria-label', `Share link for ${film.title}`);
  const copyLink = document.createElement('button');
  copyLink.type = 'button'; copyLink.className = 'film-detail-external-link'; copyLink.textContent = 'Copy film link';
  const shareNotice = document.createElement('span');
  shareNotice.className = 'film-detail-action-status';
  shareNotice.setAttribute('role', 'note');
  const omissionLabels = { search: 'the current search', filters: 'the current filters', sort: 'the current sort order', layout: 'the current layout', catalogue: 'the current catalogue path' };
  const omitted = typeof filmShare === 'string' ? [] : (filmShare.omitted || []);
  if (omitted.length) {
    const labels = omitted.map((item) => omissionLabels[item] || 'part of the current view');
    shareNotice.textContent = `This link opens the film but omits ${labels.join(', ')} because the full view is too large.`;
  }
  const copyStatus = document.createElement('span'); copyStatus.className = 'film-detail-action-status'; copyStatus.setAttribute('role', 'status'); copyStatus.setAttribute('aria-live', 'polite');
  copyLink.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareInput.value); copyStatus.textContent = 'Film link copied.'; }
    catch {
      shareDetails.open = true;
      shareInput.focus();
      shareInput.select();
      copyStatus.textContent = 'Select and copy the film link above.';
    }
  });
  shareDetails.append(shareSummary, shareInput, shareNotice, copyLink, copyStatus);
  links.append(shareDetails);
  copy.append(links);
  layout.append(copy, posterColumn, supporting);
  filmDetailContent.append(layout);
  const accentRequest = ++posterAccentRequest;
  filmDetailDialog.style.removeProperty('--poster-accent');
  samplePosterAccent(posterUrl, accentRequest);
  if (retainFocus) {
    filmDetailContent.scrollTop = 0;
    const preferredFocus = filmDetailContent.querySelector(`#film-detail-${retainFocus}`);
    const fallbackFocus = filmDetailContent.querySelector(retainFocus === 'next' ? '#film-detail-previous' : '#film-detail-next');
    const focusTarget = hasLongTitle ? title : preferredFocus?.disabled ? fallbackFocus : preferredFocus;
    if (hasLongTitle) focusTarget?.focus({ preventScroll: true });
    else focusTarget?.focus();
  }
}


function ledgerRowFor(film) {
  const films = getFilms();
  const rankNumber = films.indexOf(film) + 1;
  const row = document.createElement('tr');

  const catalogueCell = document.createElement('th');
  catalogueCell.scope = 'row';
  catalogueCell.className = 'ledger-catalogue-number';
  catalogueCell.textContent = `No. ${String(rankNumber).padStart(3, '0')}`;

  const filmCell = document.createElement('td');
  filmCell.className = 'ledger-film-cell';
  const filmLayout = document.createElement('div');
  filmLayout.className = 'ledger-film-layout';
  const posterUrl = safeUrl(film.poster_url, ['image.tmdb.org', 'ltrbxd.com', 'letterboxd.com']);
  const filmUrl = safeUrl(film.letterboxd_url, ['letterboxd.com']);
  if (posterUrl) {
    const poster = document.createElement('a');
    poster.href = filmDetailButtonFor(film).href;
    poster.className = 'ledger-poster';
    poster.setAttribute('aria-label', `Read details for ${film.title}`);
    poster.addEventListener('click', (event) => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); filmDetailButtonFor(film).click(); });
    const image = document.createElement('img');
    image.src = posterUrl;
    responsivePosterAttrs(image, posterUrl, '34px');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.className = 'ledger-poster-fallback';
      fallback.setAttribute('role', 'img');
      fallback.setAttribute('aria-label', `Poster unavailable for ${film.title}`);
      poster.replaceChildren(fallback);
    }, { once: true });
    poster.append(image);
    filmLayout.append(poster);
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
  titleBlock.append(filmDetailButtonFor(film));
  filmLayout.append(titleBlock);
  filmCell.append(filmLayout);

  const directorCell = document.createElement('td');
  directorCell.className = 'ledger-director-cell';
  const directors = [...new Set(Array.isArray(film.directors) ? film.directors.filter((name) => typeof name === 'string' && name.trim()) : [])];
  if (directors.length) {
    const appendDirector = (director, index) => {
      const before = directorCell.querySelector('.director-more-button');
      if (index) directorCell.insertBefore(document.createTextNode(', '), before);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'director-filter';
      button.dir = 'auto';
      button.textContent = director;
      button.title = director;
      button.setAttribute('aria-pressed', String(state.directors.includes(director)));
      button.setAttribute('aria-label', `Filter by director ${director}`);
      button.addEventListener('click', () => toggleDirector(director));
      directorCell.insertBefore(button, before);
    };
    const visibleCount = Math.min(2, directors.length);
    directors.slice(0, visibleCount).forEach(appendDirector);
    if (directors.length > visibleCount) {
      const hiddenDirectors = directors.slice(visibleCount);
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'director-more-button';
      more.dir = 'ltr';
      more.textContent = `+${hiddenDirectors.length}`;
      more.setAttribute('aria-expanded', 'false');
      more.setAttribute('aria-label', `Show ${hiddenDirectors.length} more ${hiddenDirectors.length === 1 ? 'director' : 'directors'} for ${film.title}`);
      let expanded = false;
      more.addEventListener('click', () => {
        expanded = !expanded;
        if (expanded) {
          hiddenDirectors.forEach((director, index) => appendDirector(director, visibleCount + index));
          directorCell.querySelectorAll('.director-filter').forEach((button, index) => {
            if (index >= visibleCount) button.dataset.extra = 'true';
          });
        } else directorCell.querySelectorAll('.director-filter[data-extra="true"]').forEach((button) => {
          button.previousSibling?.remove();
          button.remove();
        });
        directorCell.classList.toggle('is-expanded', expanded);
        more.textContent = expanded ? '−' : `+${hiddenDirectors.length}`;
        more.setAttribute('aria-expanded', String(expanded));
        more.setAttribute('aria-label', expanded ? `Show fewer directors for ${film.title}` : `Show ${hiddenDirectors.length} more ${hiddenDirectors.length === 1 ? 'director' : 'directors'} for ${film.title}`);
        if (expanded) directorCell.querySelector('.director-filter[data-extra="true"]')?.focus();
      });
      directorCell.append(more);
    }
  } else directorCell.textContent = '—';

  const productionCell = document.createElement('td');
  productionCell.className = 'ledger-production-cell';
  const production = countryRuntimeMetaFor(film, 'ledger-production');
  if (production) productionCell.append(production);
  else productionCell.textContent = '—';

  const countCell = document.createElement('td');
  countCell.className = 'ledger-appearance-cell';
  countCell.append(filmAppearanceCountFor(film, 'ledger-film-count'));

  row.append(catalogueCell, filmCell, directorCell, productionCell, countCell);
  return row;
}

function ledgerRowsFor(shownFilms, previousYear = null) {
  const rows = [];
  const groupByYear = state.sort === 'year-newest' || state.sort === 'year-oldest';
  shownFilms.forEach((film) => {
    const year = film.year?.trim() || 'Year unknown';
    if (groupByYear && year !== previousYear) {
      const divider = document.createElement('tr');
      divider.className = 'ledger-year-divider';
      const heading = document.createElement('th');
      heading.scope = 'row';
      heading.colSpan = 5;
      heading.textContent = year;
      divider.append(heading);
      rows.push(divider);
      previousYear = year;
    }
    rows.push(ledgerRowFor(film));
  });
  return rows;
}


function featuredPosterMediaFor(film, posterUrl) {
  if (!posterUrl) return posterFallbackFor(film);
  const image = document.createElement('img');
  image.src = posterUrl;
  responsivePosterAttrs(image, posterUrl, '(max-width: 640px) 32vw, 360px');
  image.alt = `Poster for ${film.title}`;
  image.loading = 'eager';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => image.replaceWith(posterFallbackFor(film)), { once: true });
  return image;
}

function featuredFilmFor(film) {
  const cached = featuredFilmByFilm.get(film);
  if (cached) {
    const genreTags = cached.querySelector('.featured-film-genres');
    if (genreTags?.dataset.activeGenreFilters !== JSON.stringify(state.genres)) {
      const genres = [...new Set(Array.isArray(film.genres) ? film.genres.filter((genre) => typeof genre === 'string' && genre.trim()) : [])];
      if (genres.length) {
        const visibleCount = genreTags?.classList.contains('is-expanded')
          ? genreTags.querySelectorAll('.genre-tag[data-genre]').length
          : 2;
        const nextGenreTags = document.createElement('div');
        nextGenreTags.className = 'genre-tags featured-film-genres';
        nextGenreTags.setAttribute('role', 'group');
        nextGenreTags.setAttribute('aria-label', `Genres for ${film.title}, ${genres.length} total`);
        appendProgressiveGenreTags(nextGenreTags, genres, genreChipFor, { expandedCount: visibleCount, selectedGenres: state.genres });
        genreTags?.replaceWith(nextGenreTags);
      } else {
        genreTags?.remove();
      }
    }
    cached.querySelectorAll('.genre-tag[data-genre]').forEach((button) => {
      button.setAttribute('aria-pressed', String(state.genres.includes(button.dataset.genre)));
    });
    cached.querySelectorAll('.director-filter[data-director]').forEach((button) => {
      button.setAttribute('aria-pressed', String(state.directors.includes(button.dataset.director)));
    });
    cached.querySelectorAll('.country-filter-button[data-country]').forEach((button) => {
      button.setAttribute('aria-pressed', String(state.country === button.dataset.country));
    });
    return cached;
  }
  const films = getFilms();
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
    backdrop.loading = 'lazy';
    backdrop.decoding = 'async';
    backdrop.referrerPolicy = 'no-referrer';
    feature.append(backdrop);
  }

  const poster = document.createElement('a');
  poster.href = filmDetailButtonFor(film).href;
  poster.className = 'featured-film-poster';
  poster.setAttribute('aria-label', `Read details for ${film.title}, overall rank ${rankNumber}`);
  poster.addEventListener('click', (event) => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); filmDetailButtonFor(film).click(); });
  poster.append(featuredPosterMediaFor(film, posterUrl));
  const rank = document.createElement('span');
  rank.className = 'rank-chip';
  rank.textContent = state.sort === 'rank' ? `No. ${rankNumber}` : `Overall ${rankNumber}`;
  rank.setAttribute('aria-label', state.sort === 'rank' ? `Catalogue number ${rankNumber}` : `Overall rank ${rankNumber}`);
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
  label.textContent = `Selection, overall rank ${rankNumber}`;
  copy.append(label);
  const title = document.createElement('h3');
  if (filmUrl) {
    const titleLink = makeLink(film.title, filmUrl, 'featured-film-title');
    const visibleTitle = document.createElement('span');
    visibleTitle.setAttribute('aria-hidden', 'true');
    visibleTitle.textContent = film.title;
    titleLink.title = film.title;
    titleLink.replaceChildren(visibleTitle);
    title.append(titleLink);
  }
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

  const directors = [...new Set(Array.isArray(film.directors) ? film.directors.filter((name) => typeof name === 'string' && name.trim()) : [])];
  const directorCredit = directorCreditFor(directors, 'featured-film-director');
  if (directorCredit) copy.append(directorCredit);
  const featuredFacts = countryRuntimeMetaFor(film, 'featured-film-facts');
  if (featuredFacts) copy.append(featuredFacts);
  if (film.overview) {
    const synopsis = document.createElement('p');
    synopsis.className = 'featured-film-overview';
    synopsis.setAttribute('role', 'note');
    synopsis.setAttribute('aria-label', `Synopsis: ${film.overview}`);
    const visibleSynopsis = document.createElement('span');
    visibleSynopsis.setAttribute('aria-hidden', 'true');
    visibleSynopsis.textContent = film.overview;
    synopsis.append(visibleSynopsis);
    copy.append(synopsis);
  }
  const genres = [...new Set(Array.isArray(film.genres) ? film.genres.filter((genre) => typeof genre === 'string' && genre.trim()) : [])];
  if (genres.length) {
    const genreTags = document.createElement('div');
    genreTags.className = 'genre-tags featured-film-genres';
    genreTags.setAttribute('role', 'group');
    genreTags.setAttribute('aria-label', `Genres for ${film.title}, ${genres.length} total`);
    appendProgressiveGenreTags(genreTags, genres, genreChipFor, { selectedGenres: state.genres });
    copy.append(genreTags);
  }
  copy.append(filmAppearanceCountFor(film, 'featured-film-count'));
  copy.append(filmDetailButtonFor(film));
  feature.append(copy);
  featuredFilmByFilm.set(film, feature);
  return feature;
}

function updatePosterForFilm(film, url, { restoreFocus = false, responsive = true } = {}) {
  const posterUrl = safeUrl(url, ['image.tmdb.org', 'ltrbxd.com', 'letterboxd.com']);
  // A newly chosen poster makes any failure state for the old choice stale.
  failedPosterUrlsByFilm.delete(film);
  const poster = featuredFilmByFilm.get(film)?.querySelector('.featured-film-poster');
  if (poster) {
    poster.querySelector('img, .poster-fallback')?.remove();
    poster.prepend(featuredPosterMediaFor(film, posterUrl));
  }
  if (detailFilm !== film) return;
  filmDetailContent.querySelector('.film-detail-poster')?.replaceWith(detailPosterFor(film, posterUrl, '', { responsive }));
  const resetButton = filmDetailContent.querySelector('.film-detail-gallery-button:not(.film-detail-browse-posters)');
  const resetHadFocus = resetButton && document.activeElement === resetButton && !hasPosterChoice(film);
  if (resetButton) resetButton.hidden = !hasPosterChoice(film);
  const galleryButton = filmDetailContent.querySelector('.film-detail-browse-posters');
  if (galleryButton) {
    delete galleryButton.dataset.retryPosterUrl;
    galleryButton.removeAttribute('aria-disabled');
    galleryButton.removeAttribute('aria-busy');
    galleryButton.textContent = posterUrl ? 'View other posters' : 'Browse posters';
    galleryButton.setAttribute('aria-label', `${posterUrl ? 'View other posters for' : 'Browse posters for'} ${film.title}`);
    const galleryStatus = filmDetailContent.querySelector('.film-detail-gallery-status');
    if (galleryStatus?.textContent === 'No alternate posters are available.') galleryStatus.textContent = '';
  }
  if (restoreFocus || resetHadFocus) {
    const focusTarget = galleryButton || filmDetailDialog.querySelector('#film-detail-close');
    focusTarget?.focus({ preventScroll: true });
  }
}

  return { openFilmDetails, dismissPosterViewer, refreshFilmNavigation, ledgerRowsFor, featuredFilmFor, updatePosterForFilm };
}
