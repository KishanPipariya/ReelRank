import { filmDecade } from './catalog.js';

export function countGenres(films) {
  const counts = new Map();
  for (const film of films) {
    for (const genre of new Set(Array.isArray(film.genres) ? film.genres : [])) {
      if (typeof genre === 'string' && genre.trim()) counts.set(genre, (counts.get(genre) || 0) + 1);
    }
  }
  return counts;
}

export function countCountriesAndDecades(films) {
  const countries = new Map();
  const decades = new Map();
  for (const film of films) {
    for (const country of new Set(Array.isArray(film.countries) ? film.countries : [])) {
      if (typeof country === 'string' && country.trim()) countries.set(country, (countries.get(country) || 0) + 1);
    }
    const decade = filmDecade(film);
    if (decade !== null) decades.set(decade, (decades.get(decade) || 0) + 1);
  }
  return { countries, decades };
}

export function countSourceLists(films, sourceListUrlsForFilm) {
  const counts = new Map();
  for (const film of films) {
    for (const url of sourceListUrlsForFilm(film)) counts.set(url, (counts.get(url) || 0) + 1);
  }
  return counts;
}
