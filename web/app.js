const grid = document.querySelector('#film-grid');
const statusMessage = document.querySelector('#status-message');
const searchInput = document.querySelector('#search-input');
const loadMoreButton = document.querySelector('#load-more');
let films = [];
let activeFilter = 'all';
let rankedTotal = 0;
let visibleLimit = 40;

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

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Refresh date unavailable';
  return `Updated ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)}`;
}

function makeLink(label, href, className = '') {
  const link = document.createElement('a');
  link.textContent = label;
  link.href = href;
  link.target = '_blank';
  link.rel = 'noreferrer';
  if (className) link.className = className;
  return link;
}

function cardFor(film, index) {
  const card = document.createElement('article');
  card.className = 'film-card';
  card.style.animationDelay = `${Math.min(index * 22, 220)}ms`;

  const filmUrl = safeUrl(film.letterboxd_url, ['letterboxd.com']);
  const posterUrl = safeUrl(film.poster_url, ['image.tmdb.org']);
  const poster = document.createElement(filmUrl ? 'a' : 'div');
  poster.className = 'poster-link';
  if (filmUrl) {
    poster.href = filmUrl;
    poster.target = '_blank';
    poster.rel = 'noreferrer';
    poster.setAttribute('aria-label', `Open ${film.title} on Letterboxd`);
  }

  if (posterUrl) {
    const image = document.createElement('img');
    image.className = 'poster-image';
    image.src = posterUrl;
    image.alt = `${film.title} poster from TMDB`;
    image.loading = 'lazy';
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
  rank.textContent = String(index + 1).padStart(2, '0');
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
  const titleRow = document.createElement('div');
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

  const count = document.createElement('p');
  count.className = 'film-count';
  count.textContent = `${film.liked_in} ${film.liked_in === 1 ? 'list' : 'lists'}`;
  info.append(count);

  if (film.overview) {
    const overview = document.createElement('p');
    overview.className = 'film-overview';
    overview.textContent = film.overview;
    info.append(overview);
  }

  const lists = film.lists || [];
  const listDetails = document.createElement('details');
  listDetails.className = 'list-details';
  const listSummary = document.createElement('summary');
  listSummary.textContent = `Appears in ${lists.length} ${lists.length === 1 ? 'list' : 'lists'}`;
  listDetails.append(listSummary);
  const listLinks = document.createElement('div');
  listLinks.className = 'list-links';
  lists.forEach((url) => {
    const safeListUrl = safeUrl(url, ['letterboxd.com']);
    if (safeListUrl) listLinks.append(makeLink(listLabel(safeListUrl), safeListUrl));
  });
  if (listLinks.childElementCount) {
    listDetails.append(listLinks);
    info.append(listDetails);
  }
  const tmdbUrl = safeUrl(film.tmdb_url, ['themoviedb.org']);
  if (tmdbUrl) info.append(makeLink('TMDB ↗', tmdbUrl, 'tmdb-film-link'));
  card.append(info);
  return card;
}

function render() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const matching = films.filter((film) => {
    if (activeFilter === 'unwatched' && film.watched) return false;
    return !query || `${film.title} ${film.year}`.toLocaleLowerCase().includes(query);
  });
  const shown = matching.slice(0, visibleLimit);
  grid.replaceChildren(...shown.map(cardFor));
  document.querySelector('#heading-count').textContent = String(matching.length).padStart(2, '0');
  statusMessage.classList.toggle('is-visible', matching.length === 0);
  if (films.length === 0) statusMessage.textContent = 'No films are available in this snapshot yet.';
  else if (matching.length === 0 && query) statusMessage.textContent = 'No films match that search. Try another title.';
  else if (matching.length === 0) statusMessage.textContent = 'Everything in this snapshot is marked watched.';
  loadMoreButton.hidden = matching.length <= shown.length;
  if (!loadMoreButton.hidden) {
    const remaining = matching.length - shown.length;
    loadMoreButton.textContent = `Show ${Math.min(40, remaining)} more films · ${remaining} left`;
  }
}

async function loadSnapshot() {
  try {
    const response = await fetch('/data/snapshot.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Snapshot request failed: ${response.status}`);
    const snapshot = await response.json();
    if (snapshot.username !== 'intelkishan' || !Array.isArray(snapshot.films)) throw new Error('Snapshot format is invalid');
    films = snapshot.films;
    rankedTotal = snapshot.film_count ?? films.length;
    document.querySelector('#film-total').textContent = rankedTotal.toLocaleString();
    document.querySelector('#list-total').textContent = snapshot.list_count ?? '—';
    const unwatchedCount = snapshot.unwatched_count ?? films.filter((film) => !film.watched).length;
    document.querySelector('#unwatched-total').textContent = unwatchedCount.toLocaleString();
    document.querySelector('#unwatched-tab-count').textContent = (snapshot.displayed_unwatched_count ?? films.filter((film) => !film.watched).length).toLocaleString();
    document.querySelector('#refreshed-label').textContent = formatDate(snapshot.refreshed_at);
    const displayed = snapshot.displayed_film_count ?? films.length;
    document.querySelector('#collection-footnote').textContent = `Showing the top ${displayed.toLocaleString()} of ${rankedTotal.toLocaleString()} ranked films. Film and poster details link back to Letterboxd; this page reflects public profile data.`;
    render();
  } catch (error) {
    statusMessage.textContent = 'The daily snapshot could not be loaded. Please try again later.';
    statusMessage.classList.add('is-visible');
    document.querySelector('#refreshed-label').textContent = 'Snapshot unavailable';
    console.error(error);
  }
}

document.querySelectorAll('.filter-button').forEach((button) => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll('.filter-button').forEach((item) => {
      const selected = item === button;
      item.classList.toggle('is-active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    render();
  });
});

searchInput.addEventListener('input', render);
loadMoreButton.addEventListener('click', () => {
  visibleLimit += 40;
  render();
});
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === 'Escape' && document.activeElement === searchInput) {
    searchInput.value = '';
    searchInput.blur();
    render();
  }
});

loadSnapshot();
