import { filmDetailUrl } from './film-navigation.js';

export function posterFallbackFor(film, className = 'poster-fallback') {
  const cover = document.createElement('div');
  cover.className = className;
  const label = document.createElement('span');
  label.className = 'poster-fallback-label';
  label.textContent = 'ReelRank · Catalogue';
  const title = document.createElement('strong');
  title.className = 'poster-fallback-title';
  title.textContent = film.title || 'Untitled film';
  const details = document.createElement('span');
  details.className = 'poster-fallback-details';
  const director = Array.isArray(film.directors) ? film.directors.find((name) => typeof name === 'string' && name.trim()) : '';
  details.textContent = [film.year, director].filter(Boolean).join(' · ');
  cover.append(label, title, details);
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

  const directors = [...new Set(Array.isArray(film.directors) ? film.directors.filter((name) => typeof name === 'string' && name.trim()) : [])];
  const directorCredit = directorCreditFor(directors, 'director-credit');
  if (directorCredit) info.append(directorCredit);

  const cinephileMeta = countryRuntimeMetaFor(film, 'cinephile-meta');
  if (cinephileMeta) info.append(cinephileMeta);

  info.append(filmAppearanceCountFor(film, 'film-count'));

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

  info.append(filmDetailButtonFor(film));
  card.append(info);
  return card;
}

export function updateFilmCard(card, film, index, state, rankNumber, highestScore = 1, getFilmDetailUrl = (item) => filmDetailUrl(window.location.href, item)) {
  const detailHref = getFilmDetailUrl(film).href;
  card.querySelector('.poster-link')?.setAttribute('href', detailHref);
  card.querySelector('.film-detail-trigger')?.setAttribute('href', detailHref);
  const rank = card.querySelector('.rank-chip');
  rank.textContent = state.sort === 'rank' ? `No. ${rankNumber}` : `Overall ${rankNumber}`;
  rank.setAttribute('aria-label', state.sort === 'rank' ? `Catalogue number ${rankNumber}` : `Overall rank ${rankNumber}`);
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
