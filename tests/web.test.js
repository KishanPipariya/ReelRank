import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSearchText, compareFilms, compareRelevance, filmDecade, matchesFilm, relevanceScore } from '../web/catalog.js';
import { snapshotLoadErrorMessage, validateSnapshot } from '../web/snapshot.js';
import { parseUrlState, urlForState } from '../web/url-state.js';
import { createLocalPreferences, parsePresetImport } from '../web/local-preferences.js';
import { catalogueCsv } from '../web/catalogue-download.js';
import { editionFreshness } from '../web/edition-freshness.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/snapshot-minimal.json', import.meta.url), 'utf8'));
const browserSchema = JSON.parse(await readFile(new URL('../web/snapshot.schema.json', import.meta.url), 'utf8'));
const packageSchema = JSON.parse(await readFile(new URL('../src/reelrank/snapshot.schema.json', import.meta.url), 'utf8'));

test('Python package and browser use the same snapshot schema', () => {
  assert.deepEqual(browserSchema, packageSchema);
});

test('snapshot load errors distinguish unreachable, invalid JSON, and invalid catalogue data', () => {
  assert.match(snapshotLoadErrorMessage('request'), /could not load.*present and reachable/);
  assert.match(snapshotLoadErrorMessage('json'), /could not read its JSON/);
  assert.match(snapshotLoadErrorMessage('schema'), /supported catalogue format/);
  assert.match(snapshotLoadErrorMessage('initialization'), /loaded the catalogue but could not prepare the site/);
});

test('edition freshness turns stale at 30 days and ignores future timestamps', () => {
  const now = Date.parse('2026-10-26T00:00:00Z');
  assert.deepEqual(editionFreshness('2026-09-26T00:00:00Z', now), { stale: true, ageDays: 30 });
  assert.deepEqual(editionFreshness('2026-10-01T00:00:00Z', now), { stale: false, ageDays: 25 });
  assert.deepEqual(editionFreshness('2026-10-27T00:00:00Z', now), { stale: false, ageDays: 0 });
  assert.deepEqual(editionFreshness('invalid', now), { stale: false, ageDays: null });
});

test('catalogue CSV handles quoted titles and neutralizes spreadsheet formulas', () => {
  const csv = catalogueCsv([{
    title: 'Arrival', letterboxd_title: '=SUM(1,1)', year: '2016', letterboxd_year: '2016',
    watched: true, liked_in: 3, letterboxd_url: 'https://letterboxd.com/film/arrival/', list_ids: [0],
  }], ['https://letterboxd.com/user/list/favorites/']);
  assert.match(csv, /"1","'=SUM\(1,1\)","2016","yes","3"/);
  assert.match(csv, /"https:\/\/letterboxd\.com\/user\/list\/favorites\/"/);
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

test('catalog search folds Latin accents and punctuation and matches words in any order', () => {
  const amelie = { title: 'Amélie', year: '2001', original_title: 'Le Fabuleux Destin d’Amélie Poulain', overview: '', genres: [], directors: ['Jean-Pierre Jeunet'] };
  assert.equal(matchesFilm(amelie, { query: 'amelie' }), true);
  const kurosawa = { title: 'Seven Samurai', year: '1954', overview: '', genres: [], directors: ['Akira Kurosawa'] };
  assert.equal(matchesFilm(kurosawa, { query: 'kurosawa 1954' }), true);
  const japanese = { title: 'となりのトトロ', year: '1988', overview: '', genres: [], directors: [] };
  assert.equal(matchesFilm(japanese, { query: 'となりのトトロ' }), true);
});

test('compact source list IDs validate while old per-film list arrays remain supported', () => {
  const compact = structuredClone(fixture);
  compact.source_lists = ['https://letterboxd.com/user/list/favorites/'];
  compact.films[0].list_ids = [0];
  delete compact.films[0].lists;
  assert.equal(validateSnapshot(compact), compact);
  const missingTable = structuredClone(compact);
  delete missingTable.source_lists;
  assert.throws(() => validateSnapshot(missingTable), /source list IDs/);
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

test('relevance prioritizes exact and title hits, then director hits, with stable rank ties', () => {
  const exact = { title: 'Amélie', year: '2001' };
  const title = { title: 'The Amelie Story', year: '1999' };
  const director = { title: 'Another Film', directors: ['Jean-Pierre Jeunet'], year: '2001' };
  const synopsis = { title: 'A Different Film', overview: 'Amelie appears in the story', year: '2001' };
  const rank = new Map([[exact, 4], [title, 3], [director, 2], [synopsis, 1]]);
  assert.deepEqual([exact, title, director, synopsis].sort((a,b) => compareRelevance(a,b,'amelie',rank)), [exact,title,synopsis,director]);
  assert.equal(relevanceScore(director, 'jean 2001'), 2);
  assert.equal(relevanceScore({ title: 'Amélie' }, 'amelie'), 0);
  assert.equal(relevanceScore({ title: 'Pi', year: '1998' }, 'pi 1998'), 0, 'short exact titles remain exact when paired with their year');
  assert.equal(relevanceScore({ title: 'Up', year: '2009' }, 'up 1990'), 1, 'short exact titles remain title hits when the year differs');
  assert.equal(relevanceScore({ title: 'The Other', directors: ['A Actor'] }, 'a'), 3, 'short generic director terms do not gain relevance weight');
  const tiedA = { title: 'Amelie (A)', year: '2000' }; const tiedB = { title: 'Amelie (B)', year: '2000' };
  const tieRank = new Map([[tiedA, 7], [tiedB, 2]]);
  assert.deepEqual([tiedA, tiedB].sort((a,b) => compareRelevance(a,b,'amelie',tieRank)), [tiedB, tiedA]);
});

test('original language filter supports known and unknown language codes', () => {
  const known = { original_language: 'fr' };
  const unknown = {};
  assert.equal(matchesFilm(known, { language: 'fr' }), true);
  assert.equal(matchesFilm(unknown, { language: 'fr' }), false);
  assert.equal(matchesFilm(unknown, { language: 'unknown' }), true);
});

test('local preferences tolerate storage errors and imports reject malformed preset shapes', () => {
  const prefs = createLocalPreferences({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } });
  assert.deepEqual(prefs.read(), {});
  assert.equal(prefs.save({ view: 'ledger' }), false);
  assert.equal(prefs.clear(), false);
  assert.equal(parsePresetImport({ presets: [{ name: 'Safe', state: { query: 'film', __proto__: { pollute: true }, visibleLimit: 999 } }] })[0].state.visibleLimit, undefined);
  assert.equal(parsePresetImport({ presets: [{ name: '', state: {} }] }), null);
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

test('URL state round trips language and relevance sort without losing other facets', () => {
  const parsed = parseUrlState('?q=amelie&sort=relevance&language=fr&country=France');
  assert.equal(parsed.sort, 'relevance');
  assert.equal(parsed.language, 'fr');
  const url = urlForState('https://example.test/?demo=1', parsed, parsed.query);
  assert.equal(url.searchParams.get('language'), 'fr');
  assert.equal(url.searchParams.get('sort'), 'relevance');
  assert.equal(url.searchParams.get('demo'), '1');
});

test('shared programmes describe facets and restore the full view without unrelated URL state', async () => {
  const { programmeShare } = await import('../web/programme-share.js');
  const state = parseUrlState('?country=Japan&decade=1960&filter=unwatched&genre=Drama&director=Akira+Kurosawa&list=https%3A%2F%2Fletterboxd.com%2Flist%2Fexample%2F&runtime=under-90&sort=year-oldest&view=ledger');
  const share = programmeShare('https://example.com/catalogue/?tracking=private&demo=1#film-42', state, '  samurai  ', [{ url: state.sourceLists[0], label: 'Favourites' }]);
  assert.match(share.description, /Japan · 1960s · Directed by Akira Kurosawa · Drama · From Favourites · Under 90 minutes · Unwatched · Search: “samurai”/);
  assert.deepEqual(parseUrlState(new URL(share.url).search), { ...state, query: 'samurai' });
  assert.equal(new URL(share.url).pathname, '/catalogue/');
  assert.equal(new URL(share.url).searchParams.get('demo'), '1');
  assert.equal(new URL(share.url).searchParams.has('tracking'), false);
  assert.equal(new URL(share.url).hash, '');
  const defaultProgramme = programmeShare('https://example.com/', parseUrlState(''), '');
  assert.equal(defaultProgramme.description, 'All films');
  assert.equal(new URL(defaultProgramme.url).searchParams.get('view'), 'posters');
});

test('shared programme language labels tolerate invalid codes in incoming URLs', async () => {
  const { programmeShare } = await import('../web/programme-share.js');
  const state = { ...parseUrlState(''), language: '!!!' };
  const result = programmeShare('https://example.test/?language=!!!', state, '');
  assert.match(result.description, /Unknown \(!!!\)/);
  assert.equal(new URL(result.url).searchParams.get('language'), '!!!');
});
