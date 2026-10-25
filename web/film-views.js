import { posterFallbackFor } from './film-components.js';

export function createFilmViews(dependencies) {
  const {
    getFilms, state, safeUrl, makeLink, directorCreditFor, countryRuntimeMetaFor,
    scoreMeterFor, genreChipFor, filmDetailButtonFor, toggleDirector, toggleGenre,
    originalFilmFactsFor, sourceListNotesFor, filmProgrammeNotesFor,
    filmDetailContent, filmDetailDialog, getCurrentMatchingFilms,
  } = dependencies;
let posterAccentRequest = 0;

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

function openFilmDetails(film) {
  renderFilmDetails(film);
  if (!filmDetailDialog.open) filmDetailDialog.showModal();
}

function renderFilmDetails(film, retainFocus = false) {
  const films = getFilms();
  const currentFilms = getCurrentMatchingFilms();
  filmDetailContent.replaceChildren();
  const layout = document.createElement('div');
  layout.className = 'film-detail-layout';
  const posterUrl = safeUrl(film.poster_url, ['image.tmdb.org', 'ltrbxd.com', 'letterboxd.com']);
  const poster = document.createElement('div');
  poster.className = 'film-detail-poster';
  if (posterUrl) {
    const image = document.createElement('img');
    image.src = posterUrl;
    image.alt = `Poster for ${film.title}`;
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      image.replaceWith(posterFallbackFor(film, 'poster-fallback film-detail-poster-fallback'));
    }, { once: true });
    poster.append(image);
  } else {
    poster.append(posterFallbackFor(film, 'poster-fallback film-detail-poster-fallback'));
  }
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
    const previous = document.createElement('button');
    previous.type = 'button';
    previous.className = 'film-detail-step';
    previous.id = 'film-detail-previous';
    previous.textContent = '← Previous';
    previous.disabled = currentIndex === 0;
    previous.setAttribute('aria-label', currentIndex > 0 ? `Previous: ${currentFilms[currentIndex - 1].title}` : 'First film in the current results');
    previous.addEventListener('click', () => renderFilmDetails(currentFilms[currentIndex - 1], 'previous'));
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'film-detail-step';
    next.id = 'film-detail-next';
    next.textContent = 'Next →';
    next.disabled = currentIndex >= currentFilms.length - 1;
    next.setAttribute('aria-label', currentIndex < currentFilms.length - 1 ? `Next: ${currentFilms[currentIndex + 1].title}` : 'Last film in the current results');
    next.addEventListener('click', () => renderFilmDetails(currentFilms[currentIndex + 1], 'next'));
    navigation.append(previous, position, next);
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
  copy.append(kicker, title, year, director);
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
  const notes = filmProgrammeNotesFor(film);
  if (notes) copy.append(notes);
  const links = document.createElement('div');
  links.className = 'film-detail-links';
  const tmdbUrl = safeUrl(film.tmdb_url, ['themoviedb.org']);
  if (tmdbUrl) links.append(makeLink('Film data on TMDB ↗', tmdbUrl, 'film-detail-external-link'));
  const letterboxdUrl = safeUrl(film.letterboxd_url, ['letterboxd.com']);
  if (letterboxdUrl) links.append(makeLink('Open on Letterboxd ↗', letterboxdUrl, 'film-detail-external-link'));
  copy.append(links);
  layout.append(poster, copy);
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
  label.textContent = `Programme selection · Overall rank ${rankNumber}`;
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

  const directors = [...new Set(Array.isArray(film.directors) ? film.directors.filter((name) => typeof name === 'string' && name.trim()) : [])];
  const directorCredit = directorCreditFor(directors, 'featured-film-director');
  if (directorCredit) copy.append(directorCredit);
  const featuredFacts = countryRuntimeMetaFor(film, 'featured-film-facts');
  if (featuredFacts) copy.append(featuredFacts);
  if (film.overview) {
    const synopsis = document.createElement('p');
    synopsis.className = 'featured-film-overview';
    synopsis.textContent = film.overview;
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
  const count = document.createElement('p');
  count.className = 'featured-film-count';
  const countValue = document.createElement('strong');
  const likedListCount = Number(film.liked_in) || 0;
  countValue.textContent = likedListCount.toLocaleString();
  count.append(countValue, ` ${likedListCount === 1 ? 'list appearance' : 'list appearances'}`, scoreMeterFor(film, 'featured-score-meter'));
  count.setAttribute('aria-label', `Overall list-appearance score: ${likedListCount.toLocaleString()}`);
  copy.append(count);
  copy.append(filmDetailButtonFor(film));
  feature.append(copy);
  return feature;
}


  return { openFilmDetails, ledgerRowsFor, featuredFilmFor };
}
