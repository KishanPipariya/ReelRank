import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSearchText, compareFilms, filmDecade, matchesFilm } from '../web/catalog.js';
import { validateSnapshot } from '../web/snapshot.js';
import { parseUrlState, urlForState } from '../web/url-state.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/snapshot-minimal.json', import.meta.url), 'utf8'));
const browserSchema = JSON.parse(await readFile(new URL('../web/snapshot.schema.json', import.meta.url), 'utf8'));
const packageSchema = JSON.parse(await readFile(new URL('../src/reelrank/snapshot.schema.json', import.meta.url), 'utf8'));

test('Python package and browser use the same snapshot schema', () => {
  assert.deepEqual(browserSchema, packageSchema);
});

test('snapshot contract accepts optional TMDB enrichment fields when omitted', () => {
  assert.equal(validateSnapshot(fixture), fixture);
});

test('snapshot contract treats integer-valued JSON numbers as integers', () => {
  const integerFloat = structuredClone(fixture);
  integerFloat.film_count = 1.0;
  assert.equal(validateSnapshot(integerFloat), integerFloat);
  integerFloat.film_count = 1.5;
  assert.throws(() => validateSnapshot(integerFloat), /film_count/);
});

test('snapshot contract rejects invalid TMDB identifiers and inconsistent counts', () => {
  const invalidId = structuredClone(fixture);
  invalidId.films[0].tmdb_id = true;
  assert.throws(() => validateSnapshot(invalidId), /schema/);
  const invalidCount = structuredClone(fixture);
  invalidCount.displayed_unwatched_count = 1;
  assert.throws(() => validateSnapshot(invalidCount), /schema/);
  const invalidSource = structuredClone(fixture);
  invalidSource.films[0].metadata_source = [];
  assert.throws(() => validateSnapshot(invalidSource), /metadata_source/);
  const unsafeCount = structuredClone(fixture);
  unsafeCount.film_count = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => validateSnapshot(unsafeCount), /film_count/);
  const invalidVersion = structuredClone(fixture);
  invalidVersion.schema_version = true;
  assert.throws(() => validateSnapshot(invalidVersion), /Unsupported snapshot schema version/);
});

test('snapshot metadata provenance fields use the documented values', () => {
  const enriched = structuredClone(fixture);
  enriched.films[0].metadata_source = 'letterboxd';
  enriched.films[0].metadata_status = 'complete';
  enriched.films[0].metadata_fetched_at = '2026-10-25T00:00:00Z';
  assert.equal(validateSnapshot(enriched), enriched);
  enriched.films[0].metadata_source = 'legacy';
  assert.equal(validateSnapshot(enriched), enriched);
  enriched.films[0].metadata_source = 'guess';
  assert.throws(() => validateSnapshot(enriched), /unsupported value/);
});

test('catalog filters combine genres, director, list, country, decade, and query', () => {
  const film = { ...fixture.films[0], directors: ['Denis Villeneuve'], countries: ['United States of America'], original_title: 'La llegada' };
  const filters = {
    genres: ['Science Fiction'], directors: ['Denis Villeneuve'], sourceLists: [film.lists[0]],
    country: 'United States of America', decade: 2010, query: 'villeneuve',
  };
  assert.equal(filmDecade(film), 2010);
  assert.equal(matchesFilm(film, filters, film.lists, ['Favorites']), true);
  assert.equal(matchesFilm(film, { ...filters, genres: ['Comedy'] }, film.lists, ['Favorites']), false);
  assert.equal(matchesFilm(film, { ...filters, query: 'la llegada' }, film.lists, ['Favorites']), true);
});

test('runtime filters use clear boundaries and exclude unknown runtimes', () => {
  const film = { title: 'Screening', year: '2000', runtime_minutes: 90 };
  assert.equal(matchesFilm(film, { runtime: 'under-90' }), false);
  assert.equal(matchesFilm(film, { runtime: '90-120' }), true);
  assert.equal(matchesFilm({ ...film, runtime_minutes: 120 }, { runtime: '90-120' }), true);
  assert.equal(matchesFilm({ ...film, runtime_minutes: 121 }, { runtime: 'over-120' }), true);
  assert.equal(matchesFilm({ ...film, runtime_minutes: null }, { runtime: 'under-90' }), false);
});

test('catalog search index includes metadata and source list labels', () => {
  const film = { title: 'Arrival', year: '2016', overview: 'A linguist arrives', genres: ['Drama'], directors: ['Denis Villeneuve'] };
  const searchable = buildSearchText(film, ['Evening programme']);
  assert.equal(searchable.includes('evening programme'), true);
  assert.equal(matchesFilm(film, { query: 'villeneuve' }, [], [], searchable), true);
});

test('catalog sorting uses stable rank as its tie breaker and puts unknown years last', () => {
  const first = { title: 'Zebra', year: '2000' };
  const second = { title: 'Alpha', year: '2000' };
  const unknown = { title: 'Unknown', year: '' };
  const ranks = new Map([[first, 0], [second, 1], [unknown, 2]]);
  assert.deepEqual([first, second].sort((a, b) => compareFilms(a, b, 'year-newest', ranks)), [first, second]);
  assert.deepEqual([unknown, second].sort((a, b) => compareFilms(a, b, 'year-newest', ranks)), [second, unknown]);
  assert.deepEqual([first, second].sort((a, b) => compareFilms(a, b, 'title', ranks)), [second, first]);
});

test('URL state parsing removes duplicate facets and ignores unsupported options', () => {
  const state = parseUrlState('?filter=surprise&sort=random&genre=Drama&genre=Drama&decade=2010&view=ledger');
  assert.equal(state.filter, 'all');
  assert.equal(state.sort, 'rank');
  assert.deepEqual(state.genres, ['Drama']);
  assert.equal(state.decade, 2010);
  assert.equal(state.view, 'ledger');
  assert.equal(parseUrlState('?decade=20x0').decade, '');
});

test('URL state serialization preserves unrelated parameters and supports repeatable filters', () => {
  const url = urlForState('https://example.test/?demo=1&genre=Old', {
    filter: 'unwatched', sort: 'year-newest', genres: ['Drama', 'Crime'], directors: ['Director'],
    sourceLists: [], country: 'Japan', decade: 1960, runtime: '90-120', view: 'ledger',
  }, '  Rashomon  ');
  assert.equal(url.searchParams.get('demo'), '1');
  assert.equal(url.searchParams.get('q'), 'Rashomon');
  assert.deepEqual(url.searchParams.getAll('genre'), ['Drama', 'Crime']);
  assert.equal(url.searchParams.get('director'), 'Director');
  assert.equal(url.searchParams.get('view'), 'ledger');
  assert.equal(url.searchParams.get('runtime'), '90-120');
  assert.equal(parseUrlState(url.search).runtime, '90-120');
});
