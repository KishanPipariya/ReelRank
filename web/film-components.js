export function cardFor(film, index, dependencies) {
  const { films, state, safeUrl, makeLink, directorCreditFor, countryRuntimeMetaFor, scoreMeterFor, genreChipFor, filmDetailButtonFor } = dependencies;
  const rankNumber = films.indexOf(film) + 1;
  const card = document.createElement('article');
  card.className = 'film-card';
  card.style.animationDelay = `${Math.min(index * 22, 220)}ms`;

  const filmUrl = safeUrl(film.letterboxd_url, ['letterboxd.com']);
  const posterUrl = safeUrl(film.poster_url, ['image.tmdb.org', 'ltrbxd.com', 'letterboxd.com']);
  const poster = document.createElement(filmUrl ? 'a' : 'div');
  poster.className = 'poster-link';
  if (filmUrl) {
    poster.href = filmUrl;
    poster.target = '_blank';
    poster.rel = 'noreferrer';
    poster.setAttribute('aria-label', `Open poster for ${film.title}, overall rank ${rankNumber}, ${film.watched ? 'watched' : 'unwatched'}, on Letterboxd, opens in a new tab`);
  }

  if (posterUrl) {
    const image = document.createElement('img');
    image.className = 'poster-image';
    image.src = posterUrl;
    image.alt = `Poster for ${film.title}`;
    image.loading = state.filter === 'watched' ? 'eager' : 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      const fallback = document.createElement('div');
      fallback.className = 'poster-fallback';
      fallback.textContent = film.title;
      image.replaceWith(fallback);
    }, { once: true });
    poster.append(image);
  } else {
    const fallback = document.createElement('div');
    fallback.className = 'poster-fallback';
    fallback.textContent = film.title;
    poster.append(fallback);
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

  const count = document.createElement('p');
  count.className = 'film-count';
  const countValue = document.createElement('strong');
  const likedListCount = Number(film.liked_in) || 0;
  countValue.textContent = likedListCount.toLocaleString();
  const countLabel = document.createElement('span');
  countLabel.textContent = likedListCount === 1 ? 'list appearance' : 'list appearances';
  count.append(countValue, countLabel, scoreMeterFor(film, 'film-score-meter'));
  count.setAttribute('aria-label', `Overall list-appearance score: ${likedListCount.toLocaleString()}`);
  info.append(count);

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

export function updateFilmCard(card, film, index, state, rankNumber, highestScore = 1) {
  card.style.animationDelay = `${Math.min(index * 22, 220)}ms`;
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
    image.loading = state.filter === 'watched' ? 'eager' : 'lazy';
  });
}

