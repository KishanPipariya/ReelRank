import { posterFallbackFor, responsivePosterAttrs } from './film-components.js';

export function createFilmViews(dependencies) {
  const {
    getFilms, state, safeUrl, makeLink, directorCreditFor, countryRuntimeMetaFor,
    genreChipFor, filmDetailButtonFor, filmAppearanceCountFor, toggleDirector, toggleGenre,
    originalFilmFactsFor, sourceListNotesFor, filmProgrammeNotesFor,
    filmDetailContent, filmDetailDialog, getCurrentMatchingFilms,
    posterViewerDialog, posterViewerImage, posterViewerTitle, posterViewerCaption,
    posterViewerZoom, posterViewerClose, posterViewerStatus, posterViewerGallery,
    getSnapshotRefreshedAt,
    getPosterGalleryUrl,
    rememberPosterChoice,
    resetPosterChoice,
    onFilmDetailChange,
    getFilmShareUrl,
  } = dependencies;
let posterAccentRequest = 0;
let posterGalleryRequest = 0;
let posterGalleryDataPromise;
const featuredFilmByFilm = new WeakMap();
function posterVariant(url, size) {
  try { const parsed = new URL(url); if (parsed.hostname !== 'image.tmdb.org') return url; return url.replace(/\/t\/p\/w\d+(?=\/)/, `/t/p/${size}`); }
  catch { return url; }
}

function openPosterViewer(film, posterUrl, showGallery = false) {
  const request = ++posterGalleryRequest;
  posterViewerTitle.textContent = `${film.title} poster`;
  posterViewerCaption.textContent = [film.title, film.year].filter(Boolean).join(' · ');
  posterViewerCaption.dataset.posterUrl = posterUrl || '';
  posterViewerImage.hidden = !posterUrl;
  if (posterUrl) {
    posterViewerImage.src = posterUrl;
    posterViewerImage.alt = `${film.title} poster`;
  } else {
    posterViewerImage.removeAttribute('src');
    posterViewerImage.alt = '';
  }
  posterViewerImage.classList.remove('is-zoomed');
  posterViewerZoom.setAttribute('aria-pressed', 'false');
  posterViewerZoom.textContent = 'View at actual size';
  posterViewerGallery.replaceChildren();
  posterViewerGallery.hidden = true;
  posterViewerStatus.textContent = showGallery ? 'Loading alternate posters…' : '';
  posterViewerDialog.showModal();
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

  posterViewerStatus.textContent = `${posters.length} ${posters.length === 1 ? 'poster' : 'posters'} available. Choose one to preview.`;
  posters.forEach((poster, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'poster-viewer-option';
    button.setAttribute('aria-pressed', String(poster.current));
    const language = poster.current ? 'Current' : poster.language ? poster.language.toUpperCase() : 'No language tag';
    button.setAttribute('aria-label', `${poster.current ? 'Current poster' : 'Select poster'}, ${language}, ${index + 1} of ${posters.length}`);
    const image = document.createElement('img');
    image.src = poster.url;
    image.alt = '';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    const label = document.createElement('span');
    label.textContent = poster.current ? 'Current' : language;
    button.append(image, label);
    button.addEventListener('click', () => {
      posterViewerImage.hidden = false;
      posterViewerImage.src = poster.url;
      posterViewerCaption.dataset.posterUrl = poster.url;
      posterViewerImage.alt = `${film.title} poster`;
      posterViewerImage.classList.remove('is-zoomed');
      posterViewerZoom.setAttribute('aria-pressed', 'false');
      posterViewerZoom.textContent = 'View at actual size';
      posterViewerCaption.textContent = [film.title, film.year, language, `${index + 1} of ${posters.length}`].filter(Boolean).join(' · ');
      if (Number.isSafeInteger(film.tmdb_id)) {
        const saved = rememberPosterChoice(film, poster.url);
        if (saved === false) posterViewerStatus.textContent = 'Could not save this poster choice in this browser.';
        else posterViewerStatus.textContent = 'Poster choice saved on this device.';
      }
      posterViewerGallery.querySelectorAll('.poster-viewer-option').forEach((option) => {
        option.setAttribute('aria-pressed', String(option === button));
      });
    });
    posterViewerGallery.append(button);
  });
  posterViewerGallery.hidden = false;
}

posterViewerZoom.addEventListener('click', () => {
  const zoomed = posterViewerZoom.getAttribute('aria-pressed') !== 'true';
  posterViewerZoom.setAttribute('aria-pressed', String(zoomed));
  posterViewerZoom.textContent = zoomed ? 'Fit to screen' : 'View at actual size';
  posterViewerImage.classList.toggle('is-zoomed', zoomed);
  const selected = posterViewerCaption.dataset.posterUrl || posterViewerGallery.querySelector('[aria-pressed="true"] img')?.src || '';
  if (selected) posterViewerImage.src = posterVariant(selected, zoomed ? 'original' : '500');
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
  if (focusProvenance) requestAnimationFrame(() => {
    const provenance = filmDetailContent.querySelector('.film-note-sources');
    if (provenance) {
      provenance.focus({ preventScroll: true });
      provenance.scrollIntoView({ block: 'start' });
    }
  });
}

function renderFilmDetails(film, retainFocus = false) {
  onFilmDetailChange(film);
  const films = getFilms();
  const currentFilms = getCurrentMatchingFilms();
  filmDetailContent.replaceChildren();
  const layout = document.createElement('div');
  layout.className = 'film-detail-layout';
  const posterUrl = safeUrl(film.poster_url, ['image.tmdb.org', 'ltrbxd.com', 'letterboxd.com']);
  const posterColumn = document.createElement('div');
  posterColumn.className = 'film-detail-poster-column';
  const poster = document.createElement(posterUrl ? 'button' : 'div');
  poster.className = `film-detail-poster${posterUrl ? ' film-detail-poster-trigger' : ''}`;
  if (posterUrl) {
    poster.type = 'button';
    poster.setAttribute('aria-label', `View poster for ${film.title}`);
    poster.addEventListener('click', () => openPosterViewer(film, posterUrl));
    const image = document.createElement('img');
    image.src = posterUrl;
    responsivePosterAttrs(image, posterUrl, '(max-width: 640px) 30vw, 180px');
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      poster.replaceWith(posterFallbackFor(film, 'film-detail-poster poster-fallback film-detail-poster-fallback'));
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
  posterColumn.append(poster);
  if (Number.isSafeInteger(film.tmdb_id)) {
    const galleryButton = document.createElement('button');
    galleryButton.type = 'button';
    galleryButton.className = 'film-detail-gallery-button';
    galleryButton.textContent = posterUrl ? 'View other posters' : 'Browse posters';
    galleryButton.setAttribute('aria-label', `${posterUrl ? 'View other posters for' : 'Browse posters for'} ${film.title}`);
    galleryButton.addEventListener('click', () => openPosterViewer(film, posterUrl, true));
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
    position.textContent = `Film ${currentIndex + 1} of ${currentFilms.length}`;
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
    copy.append(navigation);
  }
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
    genres.forEach((genre) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'genre-tag';
      button.dataset.genre = genre;
      button.textContent = genre;
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
      genreList.append(button);
    });
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
    directors.forEach((director, index) => {
      if (index) directorCell.append(document.createTextNode(', '));
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'director-filter';
      button.textContent = director;
      button.setAttribute('aria-pressed', String(state.directors.includes(director)));
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
  countCell.append(filmAppearanceCountFor(film, 'ledger-film-count'));

  row.append(catalogueCell, filmCell, directorCell, productionCell, countCell);
  return row;
}

function ledgerRowsFor(shownFilms) {
  const rows = [];
  const groupByYear = state.sort === 'year-newest' || state.sort === 'year-oldest';
  let previousYear = null;
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


function featuredFilmFor(film) {
  const cached = featuredFilmByFilm.get(film);
  if (cached) {
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
  if (posterUrl) {
    const image = document.createElement('img');
    image.src = posterUrl;
    responsivePosterAttrs(image, posterUrl, '(max-width: 640px) 32vw, 360px');
    image.alt = `Poster for ${film.title}`;
    image.loading = 'eager';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      image.replaceWith(posterFallbackFor(film));
    }, { once: true });
    poster.append(image);
  } else {
    poster.append(posterFallbackFor(film));
  }
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
    genreTags.setAttribute('aria-label', `Genres for ${film.title}`);
    genres.forEach((genre) => genreTags.append(genreChipFor(genre)));
    copy.append(genreTags);
  }
  copy.append(filmAppearanceCountFor(film, 'featured-film-count'));
  copy.append(filmDetailButtonFor(film));
  feature.append(copy);
  featuredFilmByFilm.set(film, feature);
  return feature;
}

function updatePosterForFilm(film, url) {
  const feature = featuredFilmByFilm.get(film);
  const image = feature?.querySelector('.featured-film-poster img');
  if (image && url) { image.src = url; responsivePosterAttrs(image, url, '(max-width: 640px) 32vw, 360px'); }
  else if (image) image.replaceWith(posterFallbackFor(film, 'featured-film-poster poster-fallback'));
  const detailImage = filmDetailContent.querySelector('.film-detail-poster img');
  if (detailImage && url) { detailImage.src = url; responsivePosterAttrs(detailImage, url, '(max-width: 640px) 30vw, 180px'); }
  else if (detailImage) detailImage.replaceWith(posterFallbackFor(film, 'film-detail-poster poster-fallback'));
}

  return { openFilmDetails, ledgerRowsFor, featuredFilmFor, updatePosterForFilm };
}
