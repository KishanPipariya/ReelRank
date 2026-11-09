import { genresWithSelectedFirst, posterFallbackFor, responsivePosterAttrs, setGenreLabel } from './film-components.js';
import { filmIdentifier, findFilmByIdentifier } from './film-navigation.js';

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
  more.addEventListener('click', () => {
    if (visibleCount < genres.length) {
      const end = Math.min(genres.length, visibleCount + filmMetadataBatchSize);
      const extra = genres.slice(visibleCount, end).map((genre) => {
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
  });
  container.append(more);
}

export function createFilmViews(dependencies) {
  const {
    getFilms, state, safeUrl, makeLink, directorCreditFor, countryRuntimeMetaFor,
    genreChipFor, filmDetailButtonFor, filmAppearanceCountFor, toggleDirector, toggleGenre,
    originalFilmFactsFor, sourceListNotesFor, filmProgrammeNotesFor,
    filmDetailContent, filmDetailDialog, getCurrentMatchingFilms,
    posterViewerDialog, posterViewerImage, posterViewerTitle, posterViewerCaption,
    posterViewerZoom, posterViewerClose, posterViewerStatus, posterViewerFeedback, posterViewerRetry, posterViewerGallery,
    getSnapshotRefreshedAt,
    getPosterGalleryUrl,
    rememberPosterChoice,
    resetPosterChoice,
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
const featuredFilmByFilm = new WeakMap();
function posterVariant(url, size) {
  const parsed = new URL(url);
  if (parsed.hostname !== 'image.tmdb.org') return url;
  parsed.pathname = parsed.pathname.replace(/^\/t\/p\/(?:w\d+|original)(?=\/)/, `/t/p/${size}`);
  return parsed.href;
}

async function previewPoster(film, url, { save = false, caption = '', canonicalUrl = url, zoomed = false, selectedButton = null, onReady = null } = {}) {
  const request = ++posterPreviewRequest;
  retryPosterPreview = null;
  posterViewerRetry.hidden = true;
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
      posterViewerFeedback.textContent = 'Could not load this poster. Your current poster choice is unchanged. Try again or choose another poster.';
      retryPosterPreview = () => previewPoster(film, url, { save, caption, canonicalUrl, zoomed, selectedButton, onReady });
      posterViewerRetry.hidden = false;
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
  posterViewerZoom.setAttribute('aria-pressed', String(zoomed));
  posterViewerZoom.textContent = zoomed ? 'Fit to screen' : 'View at actual size';
  posterViewerFeedback.textContent = '';
  if (save && Number.isSafeInteger(film.tmdb_id)) {
    const saved = rememberPosterChoice(film, canonicalUrl);
    posterViewerFeedback.textContent = saved === false
      ? 'Could not save this poster choice in this browser.'
      : 'Poster choice saved on this device.';
  }
  if (selectedButton) posterViewerGallery.querySelectorAll('.poster-viewer-option').forEach((option) => {
    option.setAttribute('aria-pressed', String(option === selectedButton));
  });
  onReady?.();
  return true;
}

function openPosterViewer(film, showGallery = false) {
  const posterUrl = safeUrl(film.poster_url, ['image.tmdb.org', 'ltrbxd.com', 'letterboxd.com']);
  const request = ++posterGalleryRequest;
  posterPreviewRequest += 1;
  activePosterFilm = film;
  posterViewerOpener = document.activeElement;
  retryPosterPreview = null;
  posterViewerRetry.hidden = true;
  posterViewerFeedback.textContent = '';
  posterViewerTitle.textContent = `${film.title} poster`;
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
  posterViewerGallery.hidden = true;
  posterViewerStatus.textContent = showGallery ? 'Loading alternate posters…' : '';
  posterViewerDialog.showModal();
  if (posterUrl) void previewPoster(film, posterUrl);
  if (showGallery) void loadPosterGallery(film, posterUrl, request);
}

async function loadPosterGallery(film, currentPosterUrl, request) {
  if (!Number.isSafeInteger(film.tmdb_id)) {
    posterViewerStatus.textContent = 'Alternate posters are not available for this film.';
    return;
  }
  if (!posterGalleryDataPromise) {
    posterGalleryDataPromise = fetch(getPosterGalleryUrl(), { cache: 'force-cache' })
      .then((response) => response.ok ? response.json() : null)
      .catch(() => null);
  }
  let payload = await posterGalleryDataPromise;
  if (!payload) posterGalleryDataPromise = undefined;
  if (request !== posterGalleryRequest) return;
  if (payload && payload.snapshot_refreshed_at !== getSnapshotRefreshedAt()) {
    payload = await fetch(getPosterGalleryUrl(), { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .catch(() => null);
    posterGalleryDataPromise = payload ? Promise.resolve(payload) : undefined;
  }
  if (request !== posterGalleryRequest) return;
  if (!payload || payload.snapshot_refreshed_at !== getSnapshotRefreshedAt()) {
    posterViewerStatus.textContent = 'Alternate posters are not included in this catalogue edition.';
    return;
  }

  const records = payload.galleries?.[String(film.tmdb_id)];
  const posters = currentPosterUrl ? [{ url: currentPosterUrl, language: '', current: true }] : [];
  if (Array.isArray(records)) {
    records.forEach((record) => {
      if (typeof record?.path !== 'string' || !record.path.startsWith('/')) return;
      const url = safeUrl(`https://image.tmdb.org/t/p/w500${record.path}`, ['image.tmdb.org']);
      if (!url || url === currentPosterUrl || (currentPosterUrl && currentPosterUrl.endsWith(record.path)) || posters.some((poster) => poster.url === url)) return;
      posters.push({ url, language: typeof record.language === 'string' ? record.language : '', current: false });
    });
  }
  if (posters.length === 0 || (posters.length < 2 && currentPosterUrl)) {
    posterViewerStatus.textContent = 'No alternate posters are available for this film.';
    return;
  }

  posterViewerStatus.textContent = `${posters.length} poster ${posters.length === 1 ? 'option' : 'options'}. Choose one to preview.`;
  posters.forEach((poster, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'poster-viewer-option';
    button.setAttribute('aria-pressed', String(poster.current));
    const language = poster.current ? 'Current' : poster.language ? poster.language.toUpperCase() : 'No language tag';
    const accessibleLabel = `${poster.current ? 'Current poster' : 'Select poster'}, ${language}, ${index + 1} of ${posters.length}`;
    button.setAttribute('aria-label', accessibleLabel);
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
    label.textContent = language;
    image.addEventListener('error', () => {
      image.hidden = true;
      unavailable.hidden = false;
      label.textContent = `${language} · unavailable`;
      button.title = 'Could not load this poster. Select to retry.';
      button.setAttribute('aria-label', `Retry loading ${language} poster, ${index + 1} of ${posters.length}`);
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
          image.src = poster.url;
          image.hidden = false;
          unavailable.hidden = true;
          label.textContent = language;
          button.removeAttribute('title');
          button.setAttribute('aria-label', accessibleLabel);
        },
      });
    });
    posterViewerGallery.append(button);
  });
  posterViewerGallery.hidden = false;
}

posterViewerZoom.addEventListener('click', () => {
  const selected = posterViewerCaption.dataset.posterUrl;
  if (!selected || !activePosterFilm) return;
  const zoomed = posterViewerZoom.getAttribute('aria-pressed') !== 'true';
  void previewPoster(activePosterFilm, posterVariant(selected, zoomed ? 'original' : 'w500'), {
    canonicalUrl: selected,
    caption: posterViewerCaption.textContent,
    zoomed,
  });
});
posterViewerRetry.addEventListener('click', () => { void retryPosterPreview?.(); });
function dismissPosterViewer() {
  if (!posterViewerDialog.open) return;
  posterViewerOpener = null;
  posterViewerDialog.close();
}
posterViewerDialog.addEventListener('close', () => {
  if (posterViewerDialog.open) return;
  posterPreviewRequest += 1;
  posterGalleryRequest += 1;
  activePosterFilm = null;
  retryPosterPreview = null;
  posterViewerRetry.hidden = true;
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
posterViewerDialog.addEventListener('click', (event) => {
  if (event.target === posterViewerDialog) posterViewerDialog.close();
});

filmDetailDialog.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  const selector = event.key === 'ArrowLeft' ? '#film-detail-previous' : event.key === 'ArrowRight' ? '#film-detail-next' : '';
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
  if (!filmDetailDialog.open) filmDetailDialog.showModal();
  filmDetailDialog.scrollTop = 0;
  filmDetailDialog.scrollLeft = 0;
  if (focusProvenance) requestAnimationFrame(() => {
    const provenance = filmDetailContent.querySelector('.film-note-sources');
    if (provenance) {
      provenance.focus({ preventScroll: true });
      provenance.scrollIntoView({ block: 'start' });
    }
  });
}

function detailNavigationFor(film) {
  const currentFilms = getCurrentMatchingFilms();
  const currentIndex = currentFilms.indexOf(film);
  if (currentIndex >= 0) {
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
      label.textContent = isPrevious ? '← Previous' : 'Next →';
      const title = document.createElement('span');
      title.className = 'film-detail-step-title';
      title.textContent = destination?.title || boundaryLabel;
      title.title = destination?.title || boundaryLabel;
      button.append(label, title);
      button.setAttribute('aria-label', destination
        ? `${isPrevious ? 'Previous' : 'Next'}: ${destination.title}`
        : boundaryLabel);
      if (destination) button.addEventListener('click', () => renderFilmDetails(destination, direction));
      return button;
    };
    const previous = stepButtonFor('previous', currentFilms[currentIndex - 1], 'First film in the current results');
    const next = stepButtonFor('next', currentFilms[currentIndex + 1], 'Last film in the current results');
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
  else if (next) filmDetailContent.querySelector('.film-detail-copy')?.prepend(next);
  detailFilm = film;
  detailNavigationFilms = matching;
  if (focused) {
    const preferred = next?.querySelector(`#${focused}`);
    const fallback = next?.querySelector('.film-detail-step:not(:disabled)');
    (preferred && !preferred.disabled ? preferred : fallback || filmDetailDialog.querySelector('.film-detail-close'))?.focus({ preventScroll: true });
  }
}

function detailPosterFor(film, posterUrl) {
  const poster = document.createElement(posterUrl ? 'button' : 'div');
  poster.className = `film-detail-poster${posterUrl ? ' film-detail-poster-trigger' : ''}`;
  if (posterUrl) {
    poster.type = 'button';
    poster.setAttribute('aria-label', `View poster for ${film.title}`);
    poster.addEventListener('click', () => openPosterViewer(film));
    const image = document.createElement('img');
    image.src = posterUrl;
    responsivePosterAttrs(image, posterUrl, '(max-width: 640px) 30vw, 180px');
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      poster.replaceWith(detailPosterFor(film, ''));
    }, { once: true });
    poster.append(image);
    const cue = document.createElement('span');
    cue.className = 'poster-enlarge-cue';
    cue.textContent = 'Enlarge poster';
    cue.setAttribute('aria-hidden', 'true');
    poster.append(cue);
  } else {
    poster.append(posterFallbackFor(film, 'poster-fallback film-detail-poster-fallback'));
  }
  return poster;
}

function renderFilmDetails(film, retainFocus = false) {
  detailFilm = film;
  detailNavigationFilms = getCurrentMatchingFilms();
  onFilmDetailChange(film);
  const films = getFilms();
  filmDetailContent.replaceChildren();
  const layout = document.createElement('div');
  layout.className = 'film-detail-layout';
  const posterUrl = safeUrl(film.poster_url, ['image.tmdb.org', 'ltrbxd.com', 'letterboxd.com']);
  const posterColumn = document.createElement('div');
  posterColumn.className = 'film-detail-poster-column';
  const poster = detailPosterFor(film, posterUrl);
  posterColumn.append(poster);
  if (Number.isSafeInteger(film.tmdb_id)) {
    const galleryButton = document.createElement('button');
    galleryButton.type = 'button';
    galleryButton.className = 'film-detail-gallery-button film-detail-browse-posters';
    galleryButton.textContent = posterUrl ? 'View other posters' : 'Browse posters';
    galleryButton.setAttribute('aria-label', `${posterUrl ? 'View other posters for' : 'Browse posters for'} ${film.title}`);
    galleryButton.addEventListener('click', () => openPosterViewer(film, true));
    posterColumn.append(galleryButton);
  }
  const resetPosterButton = document.createElement('button');
  resetPosterButton.type = 'button'; resetPosterButton.className = 'film-detail-gallery-button';
  resetPosterButton.textContent = 'Reset poster';
  resetPosterButton.setAttribute('aria-label', `Reset poster for ${film.title} to the catalogue original`);
  const resetStatus = document.createElement('span'); resetStatus.className = 'sr-only'; resetStatus.setAttribute('role', 'status'); resetStatus.setAttribute('aria-live', 'polite');
  resetPosterButton.addEventListener('click', () => { resetStatus.textContent = resetPosterChoice(film) ? 'Poster reset to the catalogue original.' : 'Could not save the poster reset in this browser.'; });
  posterColumn.append(resetPosterButton, resetStatus);
  const copy = document.createElement('div');
  copy.className = 'film-detail-copy';
  const rank = films.indexOf(film) + 1;
  const kicker = document.createElement('p');
  kicker.className = 'film-detail-kicker';
  kicker.textContent = `Catalogue no. ${String(rank).padStart(3, '0')} · ${film.watched ? 'Watched' : 'Unwatched'}`;
  const navigation = detailNavigationFor(film);
  if (navigation) copy.append(navigation);
  const title = document.createElement('h2');
  title.id = 'film-detail-title';
  title.textContent = film.title;
  const year = document.createElement('span');
  year.className = 'film-detail-year';
  year.textContent = film.year || 'Year unknown';
  const directors = [...new Set(Array.isArray(film.directors) ? film.directors.filter((name) => typeof name === 'string' && name.trim()) : [])];
  const director = directors.length
    ? directorCreditFor(directors, 'film-detail-director', () => filmDetailDialog.close())
    : document.createElement('p');
  director.classList.add('film-detail-director');
  if (!directors.length) director.textContent = 'Director not listed';
  const facts = countryRuntimeMetaFor(film, 'film-detail-facts', { beforeFilter: () => filmDetailDialog.close() });
  const score = document.createElement('p');
  score.className = 'film-detail-score';
  const scoreValue = document.createElement('strong');
  scoreValue.textContent = (Number(film.liked_in) || 0).toLocaleString();
  score.classList.toggle('has-long-count', scoreValue.textContent.length > 12);
  score.append(scoreValue, ` ${Number(film.liked_in) === 1 ? 'list appearance' : 'list appearances'}`);
  copy.append(kicker, title, year);
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
        filmDetailDialog.close();
        toggleGenre(genre);
        const collectionTitle = document.querySelector('#collection-title');
        collectionTitle.focus({ preventScroll: true });
        const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
        collectionTitle.scrollIntoView({ behavior, block: 'start' });
      });
      return button;
    }, { initialCount: 6, selectedGenres: state.genres });
    copy.append(genreList);
  }
  const notes = filmProgrammeNotesFor(film, { includeOriginalFacts: false });
  if (notes) copy.append(notes);
  const links = document.createElement('div');
  links.className = 'film-detail-links';
  const tmdbUrl = safeUrl(film.tmdb_url, ['themoviedb.org']);
  if (tmdbUrl) links.append(makeLink('Film data on TMDB ↗', tmdbUrl, 'film-detail-external-link'));
  const letterboxdUrl = safeUrl(film.letterboxd_url, ['letterboxd.com']);
  if (letterboxdUrl) links.append(makeLink('Open on Letterboxd ↗', letterboxdUrl, 'film-detail-external-link'));
  const shareUrl = getFilmShareUrl(film);
  const shareInput = document.createElement('input');
  shareInput.className = 'film-detail-share-url';
  shareInput.type = 'url'; shareInput.readOnly = true; shareInput.value = shareUrl;
  shareInput.setAttribute('aria-label', `Share link for ${film.title}`);
  const copyLink = document.createElement('button');
  copyLink.type = 'button'; copyLink.className = 'film-detail-external-link'; copyLink.textContent = 'Copy film link';
  const copyStatus = document.createElement('span'); copyStatus.className = 'sr-only'; copyStatus.setAttribute('role', 'status'); copyStatus.setAttribute('aria-live', 'polite');
  copyLink.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareInput.value); copyStatus.textContent = 'Film link copied.'; }
    catch { shareInput.focus(); shareInput.select(); copyStatus.classList.remove('sr-only'); copyStatus.textContent = 'Select and copy the film link above.'; }
  });
  links.append(shareInput, copyLink, copyStatus);
  copy.append(links);
  layout.append(posterColumn, copy);
  filmDetailContent.append(layout);
  const accentRequest = ++posterAccentRequest;
  filmDetailDialog.style.removeProperty('--poster-accent');
  samplePosterAccent(posterUrl, accentRequest);
  if (retainFocus) {
    filmDetailDialog.scrollTop = 0;
    const preferredFocus = filmDetailContent.querySelector(`#film-detail-${retainFocus}`);
    const fallbackFocus = filmDetailContent.querySelector(retainFocus === 'next' ? '#film-detail-previous' : '#film-detail-next');
    (preferredFocus?.disabled ? fallbackFocus : preferredFocus)?.focus();
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

function updatePosterForFilm(film, url) {
  const posterUrl = safeUrl(url, ['image.tmdb.org', 'ltrbxd.com', 'letterboxd.com']);
  const poster = featuredFilmByFilm.get(film)?.querySelector('.featured-film-poster');
  if (poster) {
    poster.querySelector('img, .poster-fallback')?.remove();
    poster.prepend(featuredPosterMediaFor(film, posterUrl));
  }
  if (detailFilm !== film) return;
  filmDetailContent.querySelector('.film-detail-poster')?.replaceWith(detailPosterFor(film, posterUrl));
  const galleryButton = filmDetailContent.querySelector('.film-detail-browse-posters');
  if (galleryButton) {
    galleryButton.textContent = posterUrl ? 'View other posters' : 'Browse posters';
    galleryButton.setAttribute('aria-label', `${posterUrl ? 'View other posters for' : 'Browse posters for'} ${film.title}`);
  }
}

  return { openFilmDetails, dismissPosterViewer, refreshFilmNavigation, ledgerRowsFor, featuredFilmFor, updatePosterForFilm };
}
