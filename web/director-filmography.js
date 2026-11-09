import { filmIdentifier, findFilmByIdentifier } from './film-navigation.js';

function summaryFor(films, matchingCount) {
  const years = films.map((film) => Number.parseInt(film.year, 10)).filter(Number.isFinite).sort((a, b) => a - b);
  const firstYear = years[0];
  const lastYear = years[years.length - 1];
  const yearRange = !years.length ? 'release years unavailable' : firstYear === lastYear ? firstYear : `${firstYear}–${lastYear}`;
  const unknownYearCount = films.length - years.length;
  const matchText = `${matchingCount} ${matchingCount === 1 ? 'film matches' : 'films match'} current filters`;
  const unknownText = unknownYearCount ? ` · ${unknownYearCount} without a known year` : '';
  return `${films.length} catalogue ${films.length === 1 ? 'film' : 'films'} · ${matchText} · ${yearRange}${unknownText}`;
}

function groupByDecadeAndYear(films, compareByTitle) {
  const sortedFilms = [...films].sort((left, right) => {
    const leftYear = Number.parseInt(left.year, 10);
    const rightYear = Number.parseInt(right.year, 10);
    if (Number.isFinite(leftYear) && Number.isFinite(rightYear) && leftYear !== rightYear) return leftYear - rightYear;
    if (Number.isFinite(leftYear) !== Number.isFinite(rightYear)) return Number.isFinite(leftYear) ? -1 : 1;
    return compareByTitle(left, right);
  });
  const decades = new Map();
  for (const film of sortedFilms) {
    const year = Number.parseInt(film.year, 10);
    const knownYear = Number.isFinite(year);
    const decade = knownYear ? `${Math.floor(year / 10) * 10}s` : 'Year unknown';
    const yearLabel = knownYear ? String(year) : 'Year unknown';
    if (!decades.has(decade)) decades.set(decade, new Map());
    const years = decades.get(decade);
    if (!years.has(yearLabel)) years.set(yearLabel, []);
    years.get(yearLabel).push(film);
  }
  return decades;
}

export function createDirectorFilmography({ container, compareByTitle, openFilm }) {
  const document = container.ownerDocument;
  const filmsByDirector = new Map();
  let catalogue;
  let current = null;

  function renderEntries(view) {
    const entries = new Map();
    const navigation = document.createElement('nav');
    navigation.className = 'director-filmography-decades';
    navigation.setAttribute('aria-label', `Jump to decade in films by ${view.director}`);
    const groups = document.createElement('div');
    groups.className = 'director-filmography-groups';

    [...groupByDecadeAndYear(view.films, compareByTitle)].forEach(([decade, years], index) => {
      const section = document.createElement('section');
      section.className = 'director-filmography-decade';
      const heading = document.createElement('h4');
      heading.id = `director-filmography-decade-${index}`;
      heading.tabIndex = -1;
      heading.dataset.filmographyFocus = `heading:${decade}`;
      heading.textContent = decade;
      section.setAttribute('aria-labelledby', heading.id);
      section.append(heading);

      for (const [year, films] of years) {
        const yearGroup = document.createElement('section');
        yearGroup.className = 'director-filmography-year-group';
        const yearHeading = document.createElement('h5');
        yearHeading.textContent = year;
        const list = document.createElement('ul');
        list.className = 'director-filmography-films';
        for (const film of films) {
          const item = document.createElement('li');
          item.className = 'director-filmography-entry';
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'director-filmography-title';
          button.dataset.filmOpener = filmIdentifier(film);
          button.textContent = film.title;
          button.setAttribute('aria-label', `Open details for ${film.title}, ${film.year || 'year unknown'}`);
          button.addEventListener('click', () => openFilm(film));
          const matchLabel = document.createElement('span');
          matchLabel.className = 'director-filmography-match';
          matchLabel.textContent = 'Matches filters';
          item.append(button, matchLabel);
          list.append(item);
          entries.set(film, { item, matchLabel, button });
        }
        yearGroup.append(yearHeading, list);
        section.append(yearGroup);
      }

      const jump = document.createElement('button');
      jump.type = 'button';
      jump.className = 'director-filmography-decade-jump';
      jump.dataset.filmographyFocus = `jump:${decade}`;
      jump.textContent = decade;
      jump.setAttribute('aria-label', `Jump to ${decade}`);
      jump.addEventListener('click', () => {
        heading.scrollIntoView({ block: 'start' });
        heading.focus({ preventScroll: true });
      });
      navigation.append(jump);
      groups.append(section);
    });
    view.content.replaceChildren(navigation, groups);
    view.entries = entries;
  }

  function updateMatches(view) {
    const matching = new Set(view.matchingFilms);
    let matchingCount = 0;
    for (const film of view.films) {
      const matches = matching.has(film);
      if (matches) matchingCount += 1;
      const entry = view.entries?.get(film);
      if (entry) {
        entry.item.classList.toggle('is-filter-match', matches);
        entry.matchLabel.hidden = !matches;
      }
    }
    const text = summaryFor(view.films, matchingCount);
    if (view.summaryCount.textContent !== text) view.summaryCount.textContent = text;
  }

  function createDisclosure(director, films, matchingFilms) {
    const details = document.createElement('details');
    details.className = 'director-filmography-disclosure';
    const summary = document.createElement('summary');
    const label = document.createElement('span');
    label.className = 'director-filmography-summary-label';
    label.textContent = `Browse films by ${director}`;
    const summaryCount = document.createElement('span');
    summaryCount.className = 'director-filmography-summary-count';
    summaryCount.setAttribute('aria-live', 'polite');
    summaryCount.setAttribute('aria-atomic', 'true');
    summary.append(label, summaryCount);
    const content = document.createElement('div');
    content.className = 'director-filmography-content';
    details.append(summary, content);
    const view = { director, details, summary, summaryCount, content, films, matchingFilms, entries: null };
    details.addEventListener('toggle', () => {
      if (current !== view || !details.open || view.entries) return;
      renderEntries(view);
      updateMatches(view);
    });
    container.replaceChildren(details);
    return view;
  }

  function replaceFilms(view, films) {
    const active = document.activeElement;
    const focusWasInContent = view.content.contains(active);
    const filmKey = focusWasInContent && active.dataset.filmOpener;
    const groupKey = focusWasInContent && active.dataset.filmographyFocus;
    view.films = films;
    view.entries = null;
    if (!view.details.open) {
      view.content.replaceChildren();
      updateMatches(view);
      return;
    }
    renderEntries(view);
    updateMatches(view);
    if (focusWasInContent) {
      const film = filmKey && findFilmByIdentifier(films, filmKey);
      const button = film && view.entries.get(film)?.button;
      const group = groupKey && [...view.content.querySelectorAll('[data-filmography-focus]')]
        .find((element) => element.dataset.filmographyFocus === groupKey);
      (button || group || view.summary).focus({ preventScroll: true });
    }
  }

  function update({ director, films, matchingFilms }) {
    container.hidden = !director;
    if (!director) {
      if (current) container.replaceChildren();
      current = null;
      return;
    }
    if (catalogue !== films) {
      filmsByDirector.clear();
      catalogue = films;
    }
    if (!filmsByDirector.has(director)) {
      filmsByDirector.set(director, films.filter((film) => Array.isArray(film.directors) && film.directors.includes(director)));
    }
    const titles = filmsByDirector.get(director);
    if (current?.director !== director) {
      current = createDisclosure(director, titles, matchingFilms);
    } else {
      current.matchingFilms = matchingFilms;
      const changed = titles !== current.films && (titles.length !== current.films.length
        || titles.some((film, index) => film !== current.films[index]));
      if (changed) {
        replaceFilms(current, titles);
        return;
      }
      current.films = titles;
    }
    updateMatches(current);
  }

  return { update };
}
