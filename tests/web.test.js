import { filmDetailUrl, filmIdentifier, registerFilmIdentifiers, findFilmByIdentifier } from '../web/film-navigation.js';
import { expandSnapshotWithRanking } from '../web/ranking-csv.js';
import { createFilmDetailLoader, mergeCatalogueIndex, validateCatalogueIndex } from '../web/catalogue-index.js';
import { graphemePrefix } from '../web/display-text.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bestRelevanceFilm, bestRelevanceFilmInChunks, buildSearchText, compareFilms, compareRelevance, filmDecade, matchesFilm, relevanceScore, sortFilmsByRelevanceInChunks, sortFilmsInChunks } from '../web/catalog.js';
import { snapshotLoadErrorMessage, validateSnapshot } from '../web/snapshot.js';
import { parseUrlState, urlForState } from '../web/url-state.js';
import { maxSearchLength, normalizeViewFacets, truncateSearch } from '../web/url-state.js';
import { runtimeLabelFor } from '../web/runtime-label.js';
import { duplicateFilmographyLabels } from '../web/director-filmography.js';
import { filmYearDetailsFor } from '../web/film-views.js';
import { sourceListLabelForUrl, sourceListLabelsForUrls } from '../web/source-list-label.js';
import { canonicalLanguageCode, languageLabel } from '../web/language-label.js';
import { countLanguages } from '../web/facet-counts.js';
import { createLocalPreferences, parsePresetImport } from '../web/local-preferences.js';
import { catalogueCsv } from '../web/catalogue-download.js';
import { editionFreshness, formatUpdatedAt } from '../web/edition-freshness.js';
import { snapshotForDevMode, snapshotForDevModeInChunks } from '../web/dev-data.js';

test('symbol-only searches match literal symbols and ignore emoji presentation selectors', () => {
  const fox = { title: '🦊 Fox ❤️', overview: 'A <restoration> with a different heart ❤.' };
  assert.equal(matchesFilm(fox, { query: '🦊' }), true);
  assert.equal(matchesFilm(fox, { query: '🐺' }), false);
  assert.equal(matchesFilm(fox, { query: '❤️' }), true);
  assert.equal(matchesFilm(fox, { query: '<' }), false);
  assert.equal(matchesFilm(fox, { query: ' ' }), true);
  assert.equal(relevanceScore({ title: '🦊' }, '🦊'), 0);
  assert.equal(relevanceScore(fox, '🦊'), 1);
});

test('search query state is bounded for direct URLs by the input limit', () => {
  const query = '🦊'.repeat(maxSearchLength + 25);
  const parsed = parseUrlState(`?q=${encodeURIComponent(query)}`);
  assert.equal(parsed.query.length, maxSearchLength);
  assert.equal(Array.from(parsed.query).length, maxSearchLength / 2);
  const roundTrip = urlForState('https://example.test/', { ...parseUrlState(''), genres: [], directors: [], sourceLists: [] }, 'a'.repeat(600));
  assert.equal(new URL(roundTrip).searchParams.get('q'), 'a'.repeat(maxSearchLength));
  const boundary = urlForState('https://example.test/', { ...parseUrlState(''), genres: [], directors: [], sourceLists: [] }, `${'x'.repeat(511)} y`);
  const boundaryQuery = new URL(boundary).searchParams.get('q');
  assert.equal(boundaryQuery, 'x'.repeat(511));
  assert.equal(parseUrlState(`?q=${encodeURIComponent(boundaryQuery)}`).query, boundaryQuery);
  const emojiBoundary = 'x'.repeat(510) + '👩🏽‍💻';
  const safelyBounded = urlForState('https://example.test/', { ...parseUrlState(''), genres: [], directors: [], sourceLists: [] }, emojiBoundary);
  const boundedEmojiQuery = new URL(safelyBounded).searchParams.get('q');
  assert.equal(boundedEmojiQuery, 'x'.repeat(510));
  assert.equal([...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(boundedEmojiQuery)].length, 510);
});

test('live search truncation keeps joined emoji graphemes whole', () => {
  assert.equal(truncateSearch(`${'x'.repeat(500)}👩🏽‍💻`), `${'x'.repeat(500)}👩🏽‍💻`);
  assert.equal(truncateSearch(`${'x'.repeat(511)}👩🏽‍💻`), 'x'.repeat(511));
});

test('emoji search matches whole graphemes and does not match parts of joined emoji', () => {
  const joined = { title: '👩🏽‍💻 Dang' };
  const separate = { title: '👩💻 Dang' };
  assert.equal(matchesFilm(joined, { query: '👩💻 Dang' }), false);
  assert.equal(matchesFilm(separate, { query: '👩💻 Dang' }), true);
  assert.equal(matchesFilm(joined, { query: '💻' }), false);
  assert.equal(matchesFilm(separate, { query: '💻' }), true);
});

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

test('future edition timestamps are described explicitly instead of as just updated', () => {
  const now = Date.parse('2026-11-07T00:00:00Z');
  assert.match(formatUpdatedAt('2026-11-10T00:00:00Z', now), /^Edition timestamp is in the future · /);
  assert.doesNotMatch(formatUpdatedAt('2026-11-10T00:00:00Z', now), /just now/);
});

test('edition update descriptions retain present and past wording and handle invalid dates', () => {
  const now = Date.parse('2026-11-07T00:00:00Z');
  assert.match(formatUpdatedAt('2026-11-07T00:00:00Z', now), /^Updated just now · /);
  assert.match(formatUpdatedAt('2026-11-06T00:00:00Z', now), /^Updated yesterday · /);
  assert.equal(formatUpdatedAt('not a timestamp', now), 'Refresh date unavailable');
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

test('snapshot contract bounds profile and TMDB text while preserving accepted values', () => {
  const bounded = structuredClone(fixture);
  bounded.username = 'u'.repeat(128);
  bounded.profile_url = `https://letterboxd.com/${bounded.username}/`;
  bounded.films[0].title = 'T'.repeat(1024);
  bounded.films[0].overview = 'O'.repeat(20000);
  bounded.films[0].directors = ['D'.repeat(512)];
  assert.equal(validateSnapshot(bounded), bounded);

  bounded.username += 'u';
  bounded.profile_url = `https://letterboxd.com/${bounded.username}/`;
  assert.throws(() => validateSnapshot(bounded), /username/);
  bounded.username = 'username';
  bounded.profile_url = 'https://letterboxd.com/username/';
  bounded.films[0].overview += 'O';
  assert.throws(() => validateSnapshot(bounded), /overview/);
  bounded.films[0].overview = '';
  bounded.films[0].directors = ['D'.repeat(513)];
  assert.throws(() => validateSnapshot(bounded), /directors/);
});

test('snapshot text limits count Unicode code points consistently for strings and arrays', () => {
  for (const [field, limit] of [['title', 1024], ['overview', 20000], ['directors', 512]]) {
    const value = 'A'.repeat(limit - 1) + '🎬';
    const bounded = structuredClone(fixture);
    bounded.films[0][field] = field === 'directors' ? [value] : value;
    assert.equal(validateSnapshot(bounded), bounded);
    bounded.films[0][field] = field === 'directors' ? [value + '🎬'] : value + '🎬';
    assert.throws(() => validateSnapshot(bounded), new RegExp(field));
  }
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
  const impossibleFilmCount = structuredClone(fixture);
  impossibleFilmCount.films[0].liked_in = 2;
  assert.throws(() => validateSnapshot(impossibleFilmCount), /liked_in cannot exceed list_count/);
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

test('worst-case fixtures keep counts coherent and clear inherited optional TMDB metadata', () => {
  const worst = snapshotForDevMode(fixture, 'worst');
  assert.equal(Math.max(...worst.films.map((film) => film.liked_in)), worst.list_count);
  assert.equal(validateSnapshot(worst), worst);
  assert.equal(worst.films[0].list_ids.length, 12);
  const longestRuntime = worst.films.find((film) => film.title === 'Logistics');
  assert.equal(longestRuntime.runtime_minutes, 51420);
  assert.equal(runtimeLabelFor(longestRuntime.runtime_minutes), '35d 17h');
  const longCatalogueRuntime = worst.films.find((film) => film.title === 'Beijing 2003');
  assert.equal(longCatalogueRuntime.runtime_minutes, 9000);
  assert.equal(longCatalogueRuntime.year, '2004');
  assert.ok(worst.films.some((film) => film.title === 'Schema boundary: archive compilation'));
  const sparseFilm = worst.films.find((film) => film.title === '🦊 Fox');
  assert.deepEqual(sparseFilm.directors, []);
  assert.deepEqual(sparseFilm.genres, []);
  assert.deepEqual(sparseFilm.countries, []);
  assert.equal(sparseFilm.runtime_minutes, null);
  assert.equal(sparseFilm.overview, '');
});

test('100,000-row stress data is built in chunks with coherent counts', async () => {
  const rankingRows = fixture.films.map((film, index) => index === 0
    ? { ...film, _sourceListUrls: ['https://www.letterboxd.com/test/list/old-links/?source=ranking'] }
    : film);
  const stress = await snapshotForDevModeInChunks(fixture, '100000', rankingRows);
  assert.equal(stress.films.length, 100000);
  assert.equal(stress.films[0].title, fixture.films[0].title);
  assert.equal(stress.films.at(-1).title, 'Stress case film 100000');
  assert.equal(stress.unwatched_count, stress.films.filter((film) => !film.watched).length);
  assert.equal(stress.displayed_unwatched_count, stress.unwatched_count);
  assert.deepEqual(stress.films[0]._sourceListUrls, ['https://letterboxd.com/test/list/old-links/']);
  assert.ok(stress.source_lists.includes('https://letterboxd.com/test/list/old-links/'));
  const fallbackStress = await snapshotForDevModeInChunks(fixture, '100000');
  assert.ok(fallbackStress.films.every((film) => film.liked_in <= fallbackStress.list_count));
  assert.equal(validateSnapshot(fallbackStress), fallbackStress);
});

test('snapshot validation rejects unsafe profile, film, and list URLs and invalid edition times', () => {
  const externalProfile = structuredClone(fixture);
  externalProfile.profile_url = 'https://example.com/viewer/';
  assert.throws(() => validateSnapshot(externalProfile), /profile_url/);

  const externalList = structuredClone(fixture);
  externalList.source_lists = ['https://example.com/user/list/favorites/'];
  assert.throws(() => validateSnapshot(externalList), /HTTPS Letterboxd list URLs/);

  const externalFilm = structuredClone(fixture);
  externalFilm.films[0].letterboxd_url = 'https://example.com/film/arrival/';
  assert.throws(() => validateSnapshot(externalFilm), /HTTPS Letterboxd film URL/);

  const invalidEdition = structuredClone(fixture);
  invalidEdition.refreshed_at = 'yesterday';
  assert.throws(() => validateSnapshot(invalidEdition), /refreshed_at/);
});

test('snapshot metadata provenance fields use the documented values', () => {
  const enriched = structuredClone(fixture);
  enriched.films[0].metadata_source = 'letterboxd';
  enriched.films[0].metadata_status = 'complete';
  enriched.films[0].metadata_fetched_at = '2026-10-25T00:00:00Z';
  assert.equal(validateSnapshot(enriched), enriched);
  enriched.films[0].metadata_source = 'legacy';
  assert.throws(() => validateSnapshot(enriched), /unsupported value/);
  enriched.films[0].metadata_source = 'guess';
  assert.throws(() => validateSnapshot(enriched), /unsupported value/);
});

test('catalog filters combine genres, director, list, country, decade, and query', () => {
  const film = { ...fixture.films[0], directors: ['Denis Villeneuve'], countries: ['United States of America'], original_title: 'La llegada' };
  const filters = {
    genres: ['Science Fiction'], directors: ['Denis Villeneuve'], sourceLists: [fixture.source_lists[film.list_ids[0]]],
    country: 'United States of America', decade: 2010, query: 'villeneuve',
  };
  assert.equal(filmDecade(film), 2010);
  assert.equal(matchesFilm(film, filters, fixture.source_lists, ['Favorites']), true);
  assert.equal(matchesFilm(film, { ...filters, genres: ['Drama', 'Science Fiction'] }, fixture.source_lists, ['Favorites']), true);
  assert.equal(matchesFilm(film, { ...filters, genres: ['Science Fiction', 'Comedy'] }, fixture.source_lists, ['Favorites']), false);
  assert.equal(matchesFilm(film, { ...filters, genres: ['Comedy'] }, fixture.source_lists, ['Favorites']), false);
  assert.equal(matchesFilm(film, { ...filters, query: 'la llegada' }, fixture.source_lists, ['Favorites']), true);
});

test('runtime filters use clear boundaries and exclude unknown runtimes', () => {
  const film = { title: 'Screening', year: '2000', runtime_minutes: 90 };
  assert.equal(matchesFilm(film, { runtime: 'under-90' }), false);
  assert.equal(matchesFilm(film, { runtime: '90-120' }), true);
  assert.equal(matchesFilm({ ...film, runtime_minutes: 120 }, { runtime: '90-120' }), true);
  assert.equal(matchesFilm({ ...film, runtime_minutes: 121 }, { runtime: 'over-120' }), true);
  assert.equal(matchesFilm({ ...film, runtime_minutes: null }, { runtime: 'under-90' }), false);
});

test('catalog search index includes searchable metadata and source list labels, but not synopsis', () => {
  const film = { title: 'Arrival', year: '2016', overview: 'A linguist arrives', genres: ['Drama'], directors: ['Denis Villeneuve'] };
  const searchable = buildSearchText(film, ['Evening programme']);
  assert.equal(searchable.includes('evening programme'), true);
  assert.equal(searchable.includes('a linguist arrives'), false);
  assert.equal(matchesFilm(film, { query: 'villeneuve' }, [], [], searchable), true);
  assert.equal(matchesFilm(film, { query: 'linguist' }, [], [], searchable), false);
});

test('Letterboxd display-title aliases are searchable and rank as title matches', () => {
  const film = { title: 'Three Colors: Red', letterboxd_title: 'Three Colours: Red', year: '1994', original_title: 'Trois couleurs: Rouge' };
  const searchText = buildSearchText(film);
  assert.match(searchText, /three colours: red/);
  assert.equal(matchesFilm(film, { query: 'Three Colours: Red' }, [], [], searchText), true);
  assert.equal(relevanceScore(film, 'Three Colours: Red'), 0);
  assert.equal(bestRelevanceFilm([film], 'Three Colours: Red', new Map([[film, 1]])), film);
});

test('catalogue search and relevance accept either TMDB or Letterboxd release year', () => {
  const casablanca = {
    title: 'Casablanca', letterboxd_title: 'Casablanca', year: '1943', letterboxd_year: '1942', original_title: 'Casablanca',
  };
  const searchText = buildSearchText(casablanca);
  assert.equal(matchesFilm(casablanca, { query: 'Casablanca 1942' }, [], [], searchText), true);
  assert.equal(relevanceScore(casablanca, 'Casablanca 1942'), 0);
});

test('search preserves voiced kana while continuing to fold Latin accents', () => {
  const whisperOfTheHeart = { title: 'Whisper of the Heart', original_title: '耳をすませば', year: '1995' };
  assert.equal(matchesFilm(whisperOfTheHeart, { query: '耳をすませば' }), true);
  assert.equal(matchesFilm(whisperOfTheHeart, { query: '耳をすませは' }), false);
  const amelie = { title: 'Amélie', original_title: 'Amélie', year: '2001' };
  assert.equal(matchesFilm(amelie, { query: 'amelie' }), true);
});

test('Greek search folds accents and case but preserves diaeresis', () => {
  const landscape = { title: 'Landscape in the Mist', original_title: 'Τοπίο στην ομίχλη' };
  assert.equal(matchesFilm(landscape, { query: 'ΤΟΠΙΟ ΣΤΗΝ ΟΜΙΧΛΗ' }), true);
  assert.equal(matchesFilm(landscape, { query: 'τοπιο στην ομιχλη' }), true);
  assert.equal(matchesFilm(landscape, { query: 'τοπιο στην ομιχλή' }), true);
  const diaeresis = { title: 'Greek title', original_title: 'Μαΐου' };
  assert.equal(matchesFilm(diaeresis, { query: 'Μαϊου' }), true);
  assert.equal(matchesFilm(diaeresis, { query: 'Μαιου' }), false);
});

test('keycap searches match the same keycap grapheme only', () => {
  const hash = { title: '#️⃣ Festival selection' };
  const star = { title: '*️⃣ Festival selection' };
  const one = { title: '1️⃣ Festival selection' };
  assert.equal(matchesFilm(hash, { query: '#️⃣' }), true);
  assert.equal(matchesFilm(hash, { query: '*️⃣' }), false);
  assert.equal(matchesFilm(hash, { query: '1️⃣' }), false);
  assert.equal(matchesFilm(star, { query: '*️⃣' }), true);
  assert.equal(matchesFilm(one, { query: '1️⃣' }), true);
  assert.equal(matchesFilm(one, { query: '#️⃣ festival' }), false);
});

test('language aliases share one filter bucket and unknown includes undetermined codes', () => {
  const romanian = { original_language: 'ro' };
  const moldavian = { original_language: 'mo' };
  const blank = {};
  const unknown = { original_language: 'unknown' };
  const undetermined = { original_language: 'und' };
  const counts = countLanguages([romanian, moldavian, blank, unknown, undetermined]);
  assert.equal(normalizeViewFacets({ language: 'mo' }).language, 'ro');
  assert.equal(counts.get('ro'), 2);
  assert.equal(counts.get('unknown'), 3);
  assert.equal(matchesFilm(moldavian, { language: 'ro' }), true);
  assert.equal(matchesFilm(romanian, { language: 'mo' }), true);
  for (const film of [blank, unknown, undetermined]) assert.equal(matchesFilm(film, { language: 'unknown' }), true);
  assert.equal(canonicalLanguageCode('CN'), 'yue');
  assert.equal(canonicalLanguageCode('tl'), 'fil');
  assert.equal(languageLabel('mo'), languageLabel('ro'));
  assert.equal(canonicalLanguageCode('iw'), 'he');
  assert.equal(canonicalLanguageCode('he'), 'he');
  assert.equal(languageLabel('iw'), languageLabel('he'));
  const hebrewCounts = countLanguages([{ original_language: 'iw' }, { original_language: 'he' }]);
  assert.equal(hebrewCounts.get('he'), 2);
  assert.equal(matchesFilm({ original_language: 'iw' }, { language: 'he' }), true);
  assert.equal(matchesFilm({ original_language: 'he' }, { language: 'iw' }), true);
  assert.equal(languageLabel('und'), 'Unknown language');
});

test('source-list labels use path segments, decode slugs, and distinguish owners', () => {
  const fromListAccount = 'https://letterboxd.com/list/list/festival-favorites/';
  const fromOtherAccount = 'https://letterboxd.com/cinephile/list/festival-favorites/';
  const encoded = 'https://letterboxd.com/cineaste/list/%C3%89t%C3%A9-au-cin%C3%A9ma/';
  const labels = sourceListLabelsForUrls([fromListAccount, fromOtherAccount, encoded]);
  assert.equal(labels.get(fromListAccount), 'Festival Favorites · @list');
  assert.equal(labels.get(fromOtherAccount), 'Festival Favorites · @cinephile');
  assert.equal(labels.get(encoded), 'Été Au Cinéma');
  assert.equal(sourceListLabelForUrl(fromListAccount), 'Festival Favorites');
});

test('film detail year labels identify differing TMDB and Letterboxd years', () => {
  assert.deepEqual(filmYearDetailsFor({ year: '1990', letterboxd_year: '1971' }), {
    primary: 'TMDB 1990', letterboxd: '1971',
  });
  assert.deepEqual(filmYearDetailsFor({ year: '1976 (restoration metadata)', letterboxd_year: '1976' }), {
    primary: '1976 (restoration metadata)', letterboxd: '',
  });
  assert.deepEqual(filmYearDetailsFor({ year: '1969', letterboxd_year: '1969' }), {
    primary: '1969', letterboxd: '',
  });
  assert.deepEqual(filmYearDetailsFor({ year: '1969' }), {
    primary: '1969', letterboxd: '',
  });
  assert.deepEqual(filmYearDetailsFor({ letterboxd_year: '1942' }), {
    primary: 'Letterboxd 1942', letterboxd: '',
  });
  assert.deepEqual(filmYearDetailsFor({
    year: '2026FestivalthéâtreInternationalRestorationPremiereArchiveMaster',
    letterboxd_year: '1926',
  }), {
    primary: 'TMDB 2026FestivalthéâtreInternationalRestorationPremiereArchiveMaster',
    letterboxd: '1926',
  });
  assert.deepEqual(sourceListLabelsForUrls([
    'https://letterboxd.com/one/list/festival-favorites/',
    'https://letterboxd.com/one/list/festival_favorites/',
    'https://letterboxd.com/one/list/festival--favorites/',
  ]), new Map([
    ['https://letterboxd.com/one/list/festival-favorites/', 'Festival Favorites · @one · festival-favorites'],
    ['https://letterboxd.com/one/list/festival_favorites/', 'Festival Favorites · @one · festival_favorites'],
    ['https://letterboxd.com/one/list/festival--favorites/', 'Festival Favorites · @one · festival--favorites'],
  ]));
});

test('director timeline gives duplicate title and year entries distinct labels', () => {
  const english = { title: 'The Message', year: '1976', original_language: 'en', runtime_minutes: 178 };
  const arabic = { title: 'The Message', year: '1976 (restoration metadata)', original_language: 'ar', runtime_minutes: 206 };
  const labels = duplicateFilmographyLabels([english, arabic]);
  assert.match(labels.get(english), /English/);
  assert.match(labels.get(arabic), /Arabic/);
  assert.notEqual(labels.get(english), labels.get(arabic));
});

test('catalog search folds Latin accents and punctuation and matches words in any order', () => {
  const amelie = { title: 'Amélie', year: '2001', original_title: 'Le Fabuleux Destin d’Amélie Poulain', overview: '', genres: [], directors: ['Jean-Pierre Jeunet'] };
  assert.equal(matchesFilm(amelie, { query: 'amelie' }), true);
  const kurosawa = { title: 'Seven Samurai', year: '1954', overview: '', genres: [], directors: ['Akira Kurosawa'] };
  assert.equal(matchesFilm(kurosawa, { query: 'kurosawa 1954' }), true);
  const japanese = { title: 'となりのトトロ', year: '1988', overview: '', genres: [], directors: [] };
  assert.equal(matchesFilm(japanese, { query: 'となりのトトロ' }), true);
});

test('snapshots require compact source list IDs', () => {
  const compact = structuredClone(fixture);
  compact.source_lists = ['https://letterboxd.com/user/list/favorites/'];
  compact.films[0].list_ids = [0];
  const old = structuredClone(compact);
  delete old.films[0].list_ids;
  old.films[0].lists = old.source_lists;
  assert.throws(() => validateSnapshot(old), /list_ids/);
  assert.equal(validateSnapshot(compact), compact);
  const missingTable = structuredClone(compact);
  delete missingTable.source_lists;
  assert.throws(() => validateSnapshot(missingTable), /source_lists/);
  const duplicateIds = structuredClone(compact);
  duplicateIds.films[0].list_ids = [0, 0];
  assert.throws(() => validateSnapshot(duplicateIds), /list_ids cannot contain duplicates/);
});

function catalogueIndexFixture() {
  const snapshot = {
    username: 'fixture-viewer',
    refreshed_at: '2026-10-25T00:00:00Z',
    film_count: 2,
    list_count: 1,
    source_lists: ['https://letterboxd.com/user/list/favorites/'],
    films: [{
      title: 'Bootstrap Film', original_title: 'Bootstrap Film', year: '2000',
      letterboxd_title: 'Bootstrap Film', letterboxd_year: '2000',
      letterboxd_url: 'https://letterboxd.com/film/bootstrap-film/', poster_url: '',
      backdrop_url: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg', overview: 'Bootstrap synopsis.',
      tmdb_url: '', watched: false, liked_in: 1, genres: ['Drama'], list_ids: [0],
    }],
  };
  const strings = ['', 'Bootstrap Film', '2000', 'Drama', 'Director', 'United States of America', 'en', 'Tail Film', 'unavailable'];
  const film = (slug, titleId, detailShardId = null) => [
    `https://letterboxd.com/film/${slug}/`, titleId, titleId, 2, titleId, 2,
    0, null, 0, null, [3], [4], [5], 6, 90, 0, 0, 8, 1, false, [0], detailShardId, false,
  ];
  const detailShards = Array(128).fill(null);
  detailShards[42] = '/data/film-details-042-012345abcdef.json';
  const index = {
    schema_version: 1, username: snapshot.username, refreshed_at: snapshot.refreshed_at,
    film_count: 2, strings, source_lists: snapshot.source_lists, detail_shards: detailShards,
    films: [film('bootstrap-film', 1), film('tail-film', 7, 42)],
  };
  return { snapshot, index };
}

test('catalogue index decodes compact rows and validates edition, URL, and shard identities', () => {
  const { snapshot, index } = catalogueIndexFixture();
  const decoded = validateCatalogueIndex(index, snapshot);
  assert.equal(decoded.films[1].title, 'Tail Film');
  assert.equal(decoded.films[1].detail_shard_url, '/data/film-details-042-012345abcdef.json');
  assert.throws(() => validateCatalogueIndex({ ...index, refreshed_at: '2026-10-26T00:00:00Z' }, snapshot), /does not match this snapshot edition/);
  const unsafe = structuredClone(index);
  unsafe.films[1][0] = 'https://example.com/film/tail-film/';
  assert.throws(() => validateCatalogueIndex(unsafe, snapshot), /invalid Letterboxd URL/);
  const wrongShard = structuredClone(index);
  wrongShard.detail_shards[42] = '/data/film-details-041-012345abcdef.json';
  assert.throws(() => validateCatalogueIndex(wrongShard, snapshot), /detail shard 42 has an invalid URL/);
  const invalidStringId = structuredClone(index);
  invalidStringId.films[1][1] = 1000;
  assert.throws(() => validateCatalogueIndex(invalidStringId, snapshot), /invalid title string ID/);
});

test('catalogue index enforces field and metadata array limits', () => {
  const { snapshot, index } = catalogueIndexFixture();
  const longTitle = structuredClone(index);
  longTitle.strings[1] = 'x'.repeat(1025);
  assert.throws(() => validateCatalogueIndex(longTitle, snapshot), /overlong title/);
  const manyGenres = structuredClone(index);
  manyGenres.films[0][10] = Array(1001).fill(3);
  assert.throws(() => validateCatalogueIndex(manyGenres, snapshot), /invalid genre IDs/);
  const manyFilms = structuredClone(index);
  manyFilms.films = Array(100001).fill(manyFilms.films[0]);
  manyFilms.film_count = 100001;
  assert.throws(() => validateCatalogueIndex(manyFilms, { ...snapshot, film_count: 100001 }), /too many items/);
});

test('snapshot validation enforces the 100,000 film collection limit', () => {
  const snapshot = structuredClone(fixture);
  const tooMany = { ...snapshot, films: Array(100001).fill(snapshot.films[0]), displayed_film_count: 100001 };
  assert.throws(() => validateSnapshot(tooMany), /too many items/);
});

test('runtime labels format long durations as grouped days, hours, and minutes', () => {
  assert.equal(runtimeLabelFor(90), '90 min');
  assert.equal(runtimeLabelFor(1500), '1d 1h');
  assert.equal(runtimeLabelFor(5220), '3d 15h');
  assert.equal(runtimeLabelFor(1440 * 1234 + 61), '1,234d 1h 1m');
  assert.equal(runtimeLabelFor(Number.MAX_SAFE_INTEGER), '6,254,999,482,459d 31m');
});

test('catalogue index merge keeps bootstrap synopsis for print and creates detail-only fields for other films', () => {
  const { snapshot, index } = catalogueIndexFixture();
  const merged = mergeCatalogueIndex(snapshot, validateCatalogueIndex(index, snapshot), { validated: true });
  assert.equal(merged.length, 2);
  assert.equal(merged[0].overview, 'Bootstrap synopsis.');
  assert.equal(merged[0].detail_overview, 'Bootstrap synopsis.');
  assert.equal(merged[0].backdrop_url, 'https://image.tmdb.org/t/p/w1280/backdrop.jpg');
  assert.equal(merged[1].overview, '');
  assert.equal(merged[1].detail_overview, '');
  assert.equal(merged[1].detail_shard_url, '/data/film-details-042-012345abcdef.json');
});

test('lazy film detail loader caches by content-addressed shard and checks username identity', async () => {
  const { snapshot, index } = catalogueIndexFixture();
  const decodedIndex = validateCatalogueIndex(index, snapshot);
  const film = decodedIndex.films[1];
  const anotherFilm = {
    ...film,
    letterboxd_url: 'https://letterboxd.com/film/another-tail-film/',
  };
  let requests = 0;
  const loader = createFilmDetailLoader(async () => {
    requests += 1;
    return {
      ok: true,
      json: async () => ({
        schema_version: 1, username: snapshot.username,
        records: [
          { letterboxd_url: film.letterboxd_url, overview: 'Loaded synopsis.' },
          { letterboxd_url: anotherFilm.letterboxd_url, overview: 'Another loaded synopsis.' },
        ],
      }),
    };
  });
  assert.deepEqual(await Promise.all([loader(film, snapshot), loader(anotherFilm, snapshot)]), [
    'Loaded synopsis.',
    'Another loaded synopsis.',
  ]);
  assert.equal(await loader(anotherFilm, snapshot), 'Another loaded synopsis.');
  assert.equal(requests, 1);
  await assert.rejects(loader(film, { ...snapshot, username: 'another-viewer' }, { retry: true }), /does not match this snapshot edition/);
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
  assert.equal(matchesFilm(synopsis, { query: 'amelie' }), false);
  assert.deepEqual([exact, title, director].sort((a,b) => compareRelevance(a,b,'amelie',rank)), [exact,title,director]);
  assert.equal(relevanceScore(director, 'jean 2001'), 2);
  assert.equal(relevanceScore({ title: 'Amélie' }, 'amelie'), 0);
  assert.equal(relevanceScore({ title: 'Pi', year: '1998' }, 'pi 1998'), 0, 'short exact titles remain exact when paired with their year');
  assert.equal(relevanceScore({ title: 'Up', year: '2009' }, 'up 1990'), 1, 'short exact titles remain title hits when the year differs');
  assert.equal(relevanceScore({ title: 'The Other', directors: ['A Actor'] }, 'a'), 3, 'short generic director terms do not gain relevance weight');
  const tiedA = { title: 'Amelie (A)', year: '2000' }; const tiedB = { title: 'Amelie (B)', year: '2000' };
  const tieRank = new Map([[tiedA, 7], [tiedB, 2]]);
  assert.deepEqual([tiedA, tiedB].sort((a,b) => compareRelevance(a,b,'amelie',tieRank)), [tiedB, tiedA]);
});

test('best relevance scan keeps the best rank and handles large arrays in one pass', () => {
  const films = Array.from({ length: 100000 }, (_, index) => ({ title: `Movie ${index}` }));
  const exact = { title: 'Target' };
  films[50000] = exact;
  const rank = new Map([[exact, 50000]]);
  assert.equal(bestRelevanceFilm(films, 'Target', rank), exact);
});

test('chunked relevance work keeps rank order and can cancel between batches', async () => {
  const films = [{ title: 'Other' }, { title: 'Target' }, { title: 'Target story' }];
  const rank = new Map([[films[0], 0], [films[1], 2], [films[2], 1]]);
  assert.equal(await bestRelevanceFilmInChunks(films, 'Target', rank), films[1]);
  assert.deepEqual(await sortFilmsByRelevanceInChunks(films, 'Target', rank), [films[1], films[2], films[0]]);
  const large = Array.from({ length: 4001 }, (_, index) => ({ title: `Film ${index}` }));
  assert.equal(await bestRelevanceFilmInChunks(large, 'missing', new Map(), () => true), undefined);
  assert.equal(await sortFilmsByRelevanceInChunks(large, 'missing', new Map(), () => true), undefined);
});

test('chunked catalogue sort is stable and can cancel between batches', async () => {
  const films = [
    { title: 'B', rank: 1 },
    { title: 'A', rank: 2 },
    { title: 'A', rank: 3 },
  ];
  assert.deepEqual(await sortFilmsInChunks(films, (left, right) => left.title.localeCompare(right.title)), [films[1], films[2], films[0]]);
  const large = Array.from({ length: 4001 }, (_, rank) => ({ title: `Film ${4000 - rank}`, rank }));
  assert.equal(await sortFilmsInChunks(large, (left, right) => left.title.localeCompare(right.title), () => true), undefined);
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
  assert.equal(parsePresetImport({ version: 1, presets: [{ name: 'Safe', state: { query: 'film', __proto__: { pollute: true }, visibleLimit: 999 } }] })[0].state.visibleLimit, undefined);
  assert.equal(parsePresetImport({ version: 1, presets: [{ name: '', state: {} }] }), null);
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

test('URL state serialization bounds oversized searches before writing the URL', () => {
  const state = {
    filter: 'all', sort: 'rank', genres: [], directors: [], sourceLists: [],
    country: '', language: '', decade: '', runtime: '', view: 'posters',
  };
  const url = urlForState('https://example.test/', state, 'archive note '.repeat(10000));
  assert.equal(url.searchParams.get('q'), 'archive note '.repeat(40).slice(0, maxSearchLength));
  assert.ok(url.href.length <= 7800);
  const incoming = urlForState(`https://example.test/?tracking=${'x'.repeat(9000)}`, state, 'short');
  assert.ok(incoming.href.length <= 7800);
  assert.equal(incoming.searchParams.get('q'), 'short');
  const fragment = urlForState('https://example.test/#'.concat('x'.repeat(9000)), state, 'short');
  assert.equal(fragment.searchParams.get('q'), 'short');
  const longFilmUrl = `https://letterboxd.com/film/${'a'.repeat(2020)}/`;
  const detail = filmDetailUrl(`https://example.test/?q=${'search+'.repeat(900)}`, { letterboxd_url: longFilmUrl });
  assert.ok(detail.href.length <= 7800);
  assert.equal(detail.searchParams.get('film'), longFilmUrl);
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

test('legacy language codes normalize in shared URLs', () => {
  assert.equal(parseUrlState('?language=iw').language, 'he');
  assert.equal(parseUrlState('?language=sh').language, 'sr-latn');
  const url = urlForState('https://example.test/', {
    filter: 'all', sort: 'rank', genres: [], directors: [], sourceLists: [],
    country: '', language: 'iw', decade: '', runtime: '', view: 'posters',
  });
  assert.equal(url.searchParams.get('language'), 'he');
});

test('shared programmes describe facets and restore the full view without unrelated URL state', async () => {
  const { programmeShare } = await import('../web/programme-share.js');
  const state = parseUrlState('?country=Japan&decade=1960&filter=unwatched&genre=Drama&director=Akira+Kurosawa&list=https%3A%2F%2Fletterboxd.com%2Flist%2Fexample%2F&runtime=under-90&sort=year-oldest&view=ledger');
  const share = programmeShare('https://example.com/catalogue/?tracking=private&demo=1#film-42', state, '  samurai  ', [{ url: state.sourceLists[0], label: 'Favourites' }]);
  assert.equal(share.shareable, true);
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

test('shared programmes block links that cannot preserve the active selection', async () => {
  const { programmeShare, programmeStateOmissions } = await import('../web/programme-share.js');
  const state = parseUrlState('?filter=unwatched&genre=Drama');
  const query = 'archive note '.repeat(1000);
  const share = programmeShare('https://example.test/', state, query);
  assert.equal(share.shareable, false);
  assert.equal(share.url, '');
  assert.match(share.description, /Search:/);
  const longEmojiShare = programmeShare('https://example.test/', parseUrlState(''), '🦊'.repeat(660));
  assert.ok([...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(longEmojiShare.description)].length <= 121);
  assert.match(longEmojiShare.description, /Search:/);
  const reduced = programmeShare('https://example.test/', state, query).reducedUrl;
  assert.deepEqual(programmeStateOmissions(reduced, state, query), ['search']);
});

test('shared programme language labels tolerate invalid codes in incoming URLs', async () => {
  const { programmeShare } = await import('../web/programme-share.js');
  const state = { ...parseUrlState(''), language: '!!!' };
  const result = programmeShare('https://example.test/?language=!!!', state, '');
  assert.match(result.description, /Unknown \(!!!\)/);
  assert.equal(new URL(result.url).searchParams.get('language'), '!!!');
});

test('local synthetic fixtures cannot generate public programme links', async () => {
  const { programmeShare } = await import('../web/programme-share.js');
  const result = programmeShare('http://localhost:4173/?data=worst', parseUrlState(''), '');
  assert.equal(result.shareable, false);
  assert.equal(result.localFixture, true);
  assert.equal(result.url, '');
});

test('TMDB language aliases and unknown codes use stable labels', async () => {
  const { languageLabel } = await import('../web/language-label.js');
  assert.equal(languageLabel('cn'), 'Cantonese');
  assert.equal(languageLabel('xx'), 'No language');
  assert.equal(languageLabel('!!!'), 'Unknown (!!!)');
});


test('snapshot timestamps use the shared calendar and explicit timezone contract', async () => {
  const cases = JSON.parse(await readFile(new URL('./fixtures/timestamp-cases.json', import.meta.url), 'utf8'));
  for (const item of cases) {
    const value = structuredClone(fixture);
    value.refreshed_at = item.timestamp;
    if (item.valid) assert.equal(validateSnapshot(value), value, item.timestamp);
    else assert.throws(() => validateSnapshot(value), /refreshed_at/, item.timestamp);
  }
});


test('compact snapshots preserve source URLs in catalogue downloads', async () => {
  const value = JSON.parse(await readFile(new URL('./fixtures/public-compact-snapshot.json', import.meta.url), 'utf8'));
  validateSnapshot(value);
  assert.ok(catalogueCsv(value.films, value.source_lists).includes('https://letterboxd.com/viewer/list/favorites/'));
});


test('display prefixes preserve emoji, combining marks and joined graphemes at cutoffs', () => {
  for (const grapheme of ['🎬', '👩🏽‍💻', 'e\u0301', '🇯🇵']) {
    const prefix = 'A'.repeat(34) + grapheme;
    const result = graphemePrefix(prefix + ' Restoration notes', 35);
    assert.equal(result, prefix);
    assert.equal(result.isWellFormed(), true);
  }
  assert.equal(graphemePrefix('Plain text', 35), 'Plain text');
  assert.equal(graphemePrefix('Plain text', 0), '');
  assert.equal(graphemePrefix('A'.repeat(259) + '🎬' + '続きを読む', 260), 'A'.repeat(259) + '🎬');
});


test('ranking metadata requires URL identity', () => {
  const detail = { ...fixture.films[0], title: 'Home', letterboxd_title: 'Home', year: '2019', letterboxd_year: '2019', letterboxd_url: 'https://letterboxd.com/film/home-2019/', overview: 'First-only restoration synopsis', directors: ['Mariam Kapanadze'], tmdb_id: 91234 };
  const other = { ...detail, letterboxd_url: 'https://letterboxd.com/film/home-2019-1/' };
  const snapshot = { ...fixture, films: [detail], film_count: 2 };
  const csv = catalogueCsv([detail, other]);
  const merged = expandSnapshotWithRanking(snapshot, csv);
  assert.equal(merged[0].overview, detail.overview);
  assert.equal(merged[1].overview, '');
  assert.equal(merged[1].tmdb_id, undefined);
  assert.deepEqual(merged[1].directors || [], []);
  const alias = { ...snapshot, films: [{ ...detail, letterboxd_url: 'https://www.letterboxd.com/film/home-2019' }] };
  assert.equal(expandSnapshotWithRanking(alias, csv)[0].overview, detail.overview);
  const legacy = { ...snapshot, films: [{ ...detail, letterboxd_url: '' }] };
  assert.ok(expandSnapshotWithRanking(legacy, csv).every((film) => film.overview === ''));
  const unique = { ...legacy, film_count: 1 };
  assert.equal(expandSnapshotWithRanking(unique, catalogueCsv([detail]))[0].overview, '');
});

test('ranking sidecars preserve whitespace and literal apostrophes in spreadsheet-safe titles', () => {
  const snapshot = { ...fixture, films: [], film_count: 1 };
  const expand = (title) => expandSnapshotWithRanking(snapshot, `Rank,Title,Year,Watched,Liked in lists,Letterboxd URI,List URLs\r\n1,"${title}",2010,no,0,https://letterboxd.com/film/installation/,\r\n`)[0].title;
  assert.equal(expand("''=Installation"), "'=Installation");
  assert.equal(expand("'''=Installation"), "''=Installation");
  assert.equal(expand("'  + One"), '  + One');
  assert.equal(expand('Installation, 🎬'), 'Installation, 🎬');
});


test('URL filters retain unavailable values but ignore blank facets and invalid decade syntax', () => {
  const value = parseUrlState('?genre=Archive+restoration&director=Former+director&country=Switzerland&language=zz&decade=1920');
  assert.deepEqual(value.genres, ['Archive restoration']);
  assert.deepEqual(value.directors, ['Former director']);
  assert.equal(value.country, 'Switzerland');
  assert.equal(value.language, 'zz');
  assert.equal(value.decade, 1920);
  const blank = parseUrlState('?genre=&director=%20%20&country=%20&language=%20&decade=0000');
  assert.deepEqual(blank.genres, []);
  assert.deepEqual(blank.directors, []);
  assert.equal(blank.country, '');
  assert.equal(blank.language, '');
  assert.equal(blank.decade, '');
});

test('imported views serialize and restore the same normalized facet state', () => {
  const [preset] = parsePresetImport({ version: 1, presets: [{ name: 'Arrival', state: {
    query: ' Arrival ', language: ' en ', genres: [' ', 'Science Fiction', 'Science Fiction'],
    directors: [' ', 'Denis Villeneuve'], country: ' ', decade: 10000, view: 'ledger',
  } }] });
  assert.deepEqual(preset.state, parseUrlState(urlForState('https://example.test/', preset.state, preset.state.query).search));
  assert.equal(preset.state.language, 'en');
  assert.deepEqual(preset.state.genres, ['Science Fiction']);
  assert.deepEqual(preset.state.directors, ['Denis Villeneuve']);
  assert.equal(preset.state.decade, '');
  const [blankRelevance] = parsePresetImport({ version: 1, presets: [{ name: 'Relevance', state: { query: ' ', sort: 'relevance' } }] });
  assert.equal(blankRelevance.state.sort, 'rank');
  assert.equal(parseUrlState('?q=+&sort=relevance').sort, 'rank');
});


test('local film links distinguish same-title records and identical occurrences across reload', () => {
  const first = { title: 'Home', year: '2019', letterboxd_url: '', tmdb_id: null, directors: ['First team'], overview: 'First synopsis' };
  const second = { ...first, directors: ['Second team'], overview: 'Second synopsis' };
  registerFilmIdentifiers([first, second]);
  const key = filmIdentifier(second);
  assert.notEqual(key, filmIdentifier(first));
  const reload = structuredClone([first, second]);
  registerFilmIdentifiers(reload);
  assert.equal(findFilmByIdentifier(reload, key), reload[1]);
  assert.equal(findFilmByIdentifier(reload, 'Home-2019'), undefined);
  assert.equal(findFilmByIdentifier([first], 'Home-2019'), undefined);
  const duplicate = [structuredClone(first), structuredClone(first)];
  registerFilmIdentifiers(duplicate);
  assert.notEqual(filmIdentifier(duplicate[0]), filmIdentifier(duplicate[1]));
  assert.equal(findFilmByIdentifier(duplicate, filmIdentifier(duplicate[1])), duplicate[1]);
  const canonical = { ...second, letterboxd_url: 'https://letterboxd.com/film/home-2019/' };
  assert.equal(filmIdentifier(canonical), canonical.letterboxd_url);
  assert.equal(filmIdentifier({ ...first, tmdb_id: 0 }), '0-2019');
  const maximumUnicodeUrl = `https://letterboxd.com/film/${'🎬'.repeat(2048)}/`;
  const unicodeFilm = { title: 'Archive', year: '2026', letterboxd_url: maximumUnicodeUrl };
  const compactIdentifier = filmIdentifier(unicodeFilm);
  assert.ok(compactIdentifier.length < 64);
  assert.equal(findFilmByIdentifier([unicodeFilm], compactIdentifier), unicodeFilm);
  assert.equal(findFilmByIdentifier([unicodeFilm], maximumUnicodeUrl), unicodeFilm, 'legacy raw URL links still resolve');
  assert.ok(filmDetailUrl('https://example.test/', unicodeFilm).href.length <= 7800);
  const cjkSlug = '王'.repeat(1120);
  const oldAliasUrl = `https://letterboxd.com/film/${cjkSlug}`;
  const newAliasFilm = { title: 'Archive', year: '2026', letterboxd_url: `https://www.letterboxd.com/film/${cjkSlug}/` };
  const oldAliasFilm = { ...newAliasFilm, letterboxd_url: oldAliasUrl };
  assert.equal(filmIdentifier(oldAliasFilm), filmIdentifier(newAliasFilm), 'canonical URL aliases keep the same compact ID');
  let legacyFirst = 0x811c9dc5;
  let legacySecond = 0x9e3779b9;
  for (let index = 0; index < oldAliasUrl.length; index += 1) {
    const code = oldAliasUrl.charCodeAt(index);
    legacyFirst = Math.imul(legacyFirst ^ code, 16777619);
    legacySecond = Math.imul(legacySecond ^ code, 2246822519);
  }
  const legacyAliasId = `letterboxd:${(legacyFirst >>> 0).toString(16).padStart(8, '0')}${(legacySecond >>> 0).toString(16).padStart(8, '0')}`;
  assert.equal(findFilmByIdentifier([newAliasFilm], legacyAliasId), newAliasFilm, 'previous compact IDs survive host and slash aliases');
  const sameTmdb = [{ ...first, tmdb_id: 0 }, { ...second, tmdb_id: 0 }];
  registerFilmIdentifiers(sameTmdb);
  const editionKey = filmIdentifier(sameTmdb[1]);
  assert.notEqual(editionKey, filmIdentifier(sameTmdb[0]));
  const reloadedEditions = structuredClone(sameTmdb);
  registerFilmIdentifiers(reloadedEditions);
  assert.equal(findFilmByIdentifier(reloadedEditions, editionKey), reloadedEditions[1]);
  assert.equal(findFilmByIdentifier(reloadedEditions, '0-2019'), undefined);
  registerFilmIdentifiers(reloadedEditions.slice(0, 1));
  assert.equal(filmIdentifier(reloadedEditions[0]), '0-2019');
});

test('film links resolve canonical aliases through ranking refresh without selecting an ambiguous film', () => {
  const original = { ...fixture.films[0], letterboxd_url: 'https://www.letterboxd.com/film/arrival' };
  const canonical = { ...original, letterboxd_url: 'https://letterboxd.com/film/arrival/' };
  const distinct = { ...original, letterboxd_url: 'https://letterboxd.com/film/arrival-2016/' };
  assert.equal(findFilmByIdentifier([canonical, distinct], original.letterboxd_url), canonical);
  assert.equal(findFilmByIdentifier([original, distinct], canonical.letterboxd_url), original);
  assert.equal(findFilmByIdentifier([original, canonical], original.letterboxd_url), original);
  assert.equal(findFilmByIdentifier([original, canonical], 'https://www.letterboxd.com/film/arrival/'), undefined);
});
