import { filmDecade } from './catalog.js';

function increment(counts, value) {
  counts.set(value, (counts.get(value) || 0) + 1);
}

function incrementNamedValues(counts, values) {
  if (!Array.isArray(values)) return;
  for (const value of new Set(values)) {
    if (typeof value === 'string' && value.trim()) increment(counts, value);
  }
}

function languageFor(film) {
  return String(film.original_language || '').trim() || 'unknown';
}

export function countLanguages(films) {
  const counts = new Map();
  for (const film of films) increment(counts, languageFor(film));
  return counts;
}

export function createContextualFacetCounter(filters, { matches, matchesWatch, sourceListUrlsForFilm }) {
  const countryContext = { ...filters, country: '' };
  const decadeContext = { ...filters, decade: '' };
  const sourceListContext = { ...filters, sourceLists: [] };
  const languageContext = { ...filters, language: '' };
  const runtimeContext = { ...filters, runtime: '' };
  const counts = {
    countries: new Map(), decades: new Map(), decadeTotal: 0,
    genres: new Map(), sourceLists: new Map(), languages: new Map(), runtimes: new Map(),
  };

  function countLanguage(film) {
    if (matches(film, languageContext)) increment(counts.languages, languageFor(film));
  }

  function addFilm(film) {
    if (!matchesWatch(film)) return;
    if (matches(film, countryContext)) incrementNamedValues(counts.countries, film.countries);
    if (matches(film, decadeContext)) {
      counts.decadeTotal += 1;
      const decade = filmDecade(film);
      if (decade !== null) increment(counts.decades, decade);
    }
    // Genre counts retain every selected genre because selections combine with AND.
    if (matches(film, filters)) incrementNamedValues(counts.genres, film.genres);
    if (matches(film, sourceListContext)) incrementNamedValues(counts.sourceLists, sourceListUrlsForFilm(film));
    countLanguage(film);
    if (matches(film, runtimeContext)) {
      increment(counts.runtimes, '');
      const runtime = Number(film.runtime_minutes);
      if (Number.isInteger(runtime) && runtime > 0) {
        const bucket = runtime < 90 ? 'under-90' : runtime <= 120 ? '90-120' : 'over-120';
        increment(counts.runtimes, bucket);
      }
    }
  }

  function addLanguage(film) {
    if (matchesWatch(film)) countLanguage(film);
  }

  return { counts, addFilm, addLanguage };
}
