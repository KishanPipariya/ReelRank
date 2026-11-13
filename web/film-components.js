import { filmDetailUrl } from './film-navigation.js';
import { html, render } from 'lit';

const filmMetadataBatchSize = 8;

export function setGenreLabel(button, genre, { full = false } = {}) {
  button.title = genre;
  button.classList.toggle('genre-tag-long', genre.length > 40);
  if (full) {
    button.textContent = genre;
    return;
  }
  const label = document.createElement('span');
  label.className = 'genre-tag-label';
  label.textContent = genre;
  button.replaceChildren(label);
}

export function genresWithSelectedFirst(genres, selectedGenres = []) {
  const selected = new Set(Array.isArray(selectedGenres) ? selectedGenres : []);
  return [
    ...genres.filter((genre) => selected.has(genre)),
    ...genres.filter((genre) => !selected.has(genre)),
  ];
}

function genreTagsFor(film, state, genreChipFor, initialVisibleCount = 2) {
  const genres = [...new Set(Array.isArray(film.genres) ? film.genres.filter((genre) => typeof genre === 'string' && genre.trim()) : [])];
  if (!genres.length) return null;

  const orderedGenres = genresWithSelectedFirst(genres, state.genres);
  const genreTags = document.createElement('div');
  genreTags.className = 'genre-tags';
  genreTags.dataset.activeGenreFilters = JSON.stringify(state.genres);
  genreTags.setAttribute('role', 'group');
  genreTags.setAttribute('aria-label', `Genres, ${genres.length} total`);
  orderedGenres.slice(0, 2).forEach((genre) => genreTags.append(genreChipFor(genre)));
  if (orderedGenres.length <= 2) return genreTags;

  let visibleCount = Math.min(orderedGenres.length, Math.max(2, initialVisibleCount));
  orderedGenres.slice(2, visibleCount).forEach((genre) => {
    const tag = genreChipFor(genre);
    tag.classList.add('genre-extra-tag');
    genreTags.append(tag);
  });
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'genre-tag genre-tag-more';
  const updateMoreLabel = () => {
    const remaining = orderedGenres.length - visibleCount;
    more.textContent = remaining ? `+${remaining}` : '−';
    more.setAttribute('aria-label', remaining
      ? `Show ${Math.min(filmMetadataBatchSize, remaining)} more ${remaining === 1 ? 'genre' : 'genres'}; ${remaining} remaining`
      : 'Show fewer genres');
  };
  const initiallyExpanded = visibleCount > 2;
  genreTags.classList.toggle('is-expanded', initiallyExpanded);
  more.setAttribute('aria-expanded', String(initiallyExpanded));
  updateMoreLabel();
  more.addEventListener('click', () => {
    if (visibleCount < orderedGenres.length) {
      const end = Math.min(orderedGenres.length, visibleCount + filmMetadataBatchSize);
      const extraTags = orderedGenres.slice(visibleCount, end).map((genre) => {
        const tag = genreChipFor(genre);
        tag.classList.add('genre-extra-tag');
        return tag;
      });
      more.before(...extraTags);
      visibleCount = end;
    } else {
      genreTags.querySelectorAll('.genre-extra-tag').forEach((tag) => tag.remove());
      visibleCount = 2;
    }
    const expanded = visibleCount > 2;
    genreTags.classList.toggle('is-expanded', expanded);
    more.setAttribute('aria-expanded', String(expanded));
    updateMoreLabel();
  });
  genreTags.append(more);
  return genreTags;
}

function syncCardGenreTags(card, film, state, genreChipFor) {
  const info = card.querySelector('.film-info');
  if (!info) return;
  const current = info.querySelector('.genre-tags');
  const selectionKey = JSON.stringify(state.genres);
  if (current?.dataset.activeGenreFilters === selectionKey) return;

  const visibleCount = current?.classList.contains('is-expanded')
    ? current.querySelectorAll('.genre-tag[data-genre]').length
    : 2;
  const next = genreTagsFor(film, state, genreChipFor, visibleCount);
  if (current && next) current.replaceWith(next);
  else if (current) current.remove();
  else if (next) info.querySelector('.film-detail-trigger')?.before(next);
}

export function posterFallbackFor(film, className = 'poster-fallback') {
  const cover = document.createElement('div');
  cover.className = className;
  const director = Array.isArray(film.directors) ? film.directors.find((name) => typeof name === 'string' && name.trim()) : '';
  const details = [film.year, director].filter(Boolean).join(' · ');
  render(html`
    <span class="poster-fallback-label">ReelRank · Catalogue</span>
    <strong class="poster-fallback-title">${film.title || 'Untitled film'}</strong>
    <span class="poster-fallback-details" title=${details}>${details}</span>
  `, cover);
  return cover;
}

export function responsivePosterAttrs(image, url, sizes = '(max-width: 640px) 42vw, 220px') {
  try {
    const parsed = new URL(url);
    const match = parsed.hostname === 'image.tmdb.org' && parsed.pathname.match(/^\/t\/p\/w\d+(\/[^/]+)$/);
    if (!match) return;
    const source = (size) => `https://image.tmdb.org/t/p/w${size}${match[1]}`;
    image.srcset = [92, 154, 185, 342, 500, 780].map((size) => `${source(size)} ${size}w`).join(', ');
    image.sizes = sizes;
  } catch {}
}

export function cardFor(film, index, dependencies) {
  const { films, state, safeUrl, makeLink, directorCreditFor, countryRuntimeMetaFor, genreChipFor, filmDetailButtonFor, filmAppearanceCountFor, getFilmDetailUrl = (item) => filmDetailUrl(window.location.href, item) } = dependencies;
  const rankNumber = films.indexOf(film) + 1;
  const card = document.createElement('article');
  card.className = 'film-card';

  const filmUrl = safeUrl(film.letterboxd_url, ['letterboxd.com']);
  const posterUrl = safeUrl(film.poster_url, ['image.tmdb.org', 'ltrbxd.com', 'letterboxd.com']);
  const poster = document.createElement('a');
  const detailUrl = getFilmDetailUrl(film);
  poster.href = detailUrl.href;
  poster.className = 'poster-link';
  poster.setAttribute('aria-label', `Read details for ${film.title}, overall rank ${rankNumber}`);
  poster.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); dependencies.openFilmDetails(film);
  });

  if (posterUrl) {
    const image = document.createElement('img');
    image.className = 'poster-image';
    image.src = posterUrl;
    responsivePosterAttrs(image, posterUrl);
    image.alt = `Poster for ${film.title}`;
    image.loading = index < 3 ? 'eager' : 'lazy';
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
  card.append(poster);

  const info = document.createElement('div');
  info.className = 'film-info';
  const titleRow = document.createElement('h3');
  titleRow.className = 'film-title-row';
  if (filmUrl) {
    const titleLink = makeLink(film.title, filmUrl, 'film-title');
    const visibleTitle = document.createElement('span');
    visibleTitle.setAttribute('aria-hidden', 'true');
    visibleTitle.textContent = film.title;
    titleLink.title = film.title;
    titleLink.replaceChildren(visibleTitle);
    titleRow.append(titleLink);
  }
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

  const directors = [...new Set(Array.isArray(film.directors) ? film.directors.filter((name) => typeof name === 'string' && name.trim()) : [])];
  const directorCredit = directorCreditFor(directors, 'director-credit');
  if (directorCredit) info.append(directorCredit);

  const cinephileMeta = countryRuntimeMetaFor(film, 'cinephile-meta');
  if (cinephileMeta) info.append(cinephileMeta);

  info.append(filmAppearanceCountFor(film, 'film-count'));

  const genreTags = genreTagsFor(film, state, genreChipFor);
  if (genreTags) info.append(genreTags);

  info.append(filmDetailButtonFor(film));
  card.append(info);
  return card;
}

export function updateFilmCard(card, film, index, state, rankNumber, highestScore = 1, getFilmDetailUrl = (item) => filmDetailUrl(window.location.href, item), genreChipFor) {
  const detailHref = getFilmDetailUrl(film).href;
  card.querySelector('.poster-link')?.setAttribute('href', detailHref);
  card.querySelector('.film-detail-trigger')?.setAttribute('href', detailHref);
  const rank = card.querySelector('.rank-chip');
  rank.textContent = state.sort === 'rank' ? `No. ${rankNumber}` : `Overall ${rankNumber}`;
  rank.setAttribute('aria-label', state.sort === 'rank' ? `Catalogue number ${rankNumber}` : `Overall rank ${rankNumber}`);
  if (genreChipFor) syncCardGenreTags(card, film, state, genreChipFor);
  card.querySelectorAll('.genre-tag[data-genre]').forEach((tag) => {
    tag.setAttribute('aria-pressed', String(state.genres.includes(tag.dataset.genre)));
  });
  card.querySelectorAll('.country-filter-button[data-country]').forEach((button) => {
    button.setAttribute('aria-pressed', String(state.country === button.dataset.country));
  });
  card.querySelectorAll('.director-filter[data-director]').forEach((button) => {
    button.setAttribute('aria-pressed', String(state.directors.includes(button.dataset.director)));
  });
  const scoreMeter = card.querySelector('.film-score-meter');
  if (scoreMeter) {
    const score = Number(film.liked_in) || 0;
    scoreMeter.style.setProperty('--score-share', `${Math.max(0, Math.min(100, (score / Math.max(1, highestScore)) * 100))}%`);
  }
  card.querySelectorAll('.poster-image').forEach((image) => {
    image.loading = index < 3 ? 'eager' : 'lazy';
  });
}
