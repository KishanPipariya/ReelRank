const modes = new Set(['demo', 'worst', 'empty', 'one', '1000']);

function syntheticFilm(base, index, overrides = {}) {
  const generatedTitle = `Stress case film ${String(index + 1).padStart(4, '0')}`;
  return {
    ...base,
    ...overrides,
    original_language: overrides.original_language ?? '',
    title: overrides.title ?? generatedTitle,
    original_title: overrides.original_title ?? overrides.title ?? generatedTitle,
    letterboxd_title: overrides.letterboxd_title ?? overrides.title ?? generatedTitle,
    year: Object.hasOwn(overrides, 'year') ? overrides.year : String(1980 + (index % 45)),
    letterboxd_year: Object.hasOwn(overrides, 'letterboxd_year') ? overrides.letterboxd_year : (Object.hasOwn(overrides, 'year') ? overrides.year : String(1980 + (index % 45))),
    letterboxd_url: `https://letterboxd.com/film/reelrank-stress-${index + 1}/`,
    poster_url: overrides.poster_url ?? '',
    backdrop_url: overrides.backdrop_url ?? '',
    tmdb_id: overrides.tmdb_id ?? null,
    tmdb_url: overrides.tmdb_url ?? '',
    tmdb_rating: overrides.tmdb_rating ?? null,
    metadata_source: overrides.metadata_source ?? '',
    metadata_status: overrides.metadata_status ?? 'unavailable',
    metadata_fetched_at: overrides.metadata_fetched_at ?? '',
    overview: overrides.overview ?? '',
    genres: overrides.genres ?? [],
    directors: overrides.directors ?? [],
    countries: overrides.countries ?? [],
    runtime_minutes: Object.hasOwn(overrides, 'runtime_minutes') ? overrides.runtime_minutes : null,
    watched: overrides.watched ?? index % 2 === 0,
    liked_in: overrides.liked_in ?? Math.max(1, 1000 - index),
    list_ids: [],
    lists: [],
  };
}

export function isLocalDevHost(host = window.location.hostname) {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export function selectedDevDataMode(search = window.location.search) {
  if (!isLocalDevHost()) return '';
  const mode = new URLSearchParams(search).get('data') || '';
  return modes.has(mode) ? mode : '';
}

export function snapshotForDevMode(snapshot, mode, rankingFilms = null) {
  if (!modes.has(mode) || mode === 'demo') return snapshot;
  const base = snapshot.films[0];
  let films;
  if (mode === 'empty') films = [];
  else if (mode === 'one') {
    films = [syntheticFilm(base, 0, {
      title: 'Jo', year: '2026', directors: ['J'], genres: ['Drama'], liked_in: 1, watched: false,
    })];
  } else if (mode === '1000') {
    films = Array.isArray(rankingFilms) && rankingFilms.length >= 1000
      ? rankingFilms.slice(0, 1000).map((film) => {
        const row = { ...film, lists: Array.isArray(film.lists) ? film.lists : [] };
        delete row.list_ids;
        return row;
      })
      : Array.from({ length: 1000 }, (_, index) => syntheticFilm(base, index));
  } else {
    films = [
      syntheticFilm(base, 0, {
        title: 'Harakiri', original_title: '切腹', original_language: 'ja', year: '1962',
        directors: ['Masaki Kobayashi'], genres: ['Action', 'Drama', 'History'], countries: ['Japan'], runtime_minutes: 135,
        overview: 'Down-on-his-luck veteran Tsugumo Hanshirō enters the courtyard of the prosperous House of Iyi. Unemployed, and with no family, he hopes to find a place to commit seppuku—and a worthy second to deliver the coup de grâce in his suicide ritual. The senior counselor for the Iyi clan questions the ronin’s resolve and integrity, suspecting Hanshirō of seeking charity rather than an honorable end. What follows is a pair of interlocking stories which lay bare the difference between honor and respect, and promises to examine the legendary foundations of the Samurai code.',
        liked_in: 1284, watched: false,
      }),
      syntheticFilm(base, 1, {
        title: 'Modern Times Forever', original_title: 'Stora Enso Building, Helsinki', year: '2011',
        directors: ['Bjornstjerne Reuter Christiansen', 'Jakob Fenger', 'Rasmus Nielsen'],
        genres: ['Documentary'], countries: ['Denmark', 'Finland', 'Vietnam'], runtime_minutes: 14400,
        overview: "The film shows centuries of decay, compressed into the span of the film, marking Helsinki's Stora Enso headquarters building.",
        poster_url: 'https://image.tmdb.org/t/p/w500/reelrank-missing-poster.jpg', liked_in: 1284, watched: true,
      }),
      syntheticFilm(base, 2, {
        title: 'Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb',
        year: '1964', directors: ['Stanley Kubrick'], genres: ['Comedy', 'War'],
        countries: ['United Kingdom', 'United States of America'], runtime_minutes: 95,
        overview: 'After the insane General Jack D. Ripper initiates a nuclear strike on the Soviet Union, a war room full of politicians, generals and a Russian diplomat all frantically try to stop it.',
        liked_in: 1283, watched: false,
      }),
      syntheticFilm(base, 3, {
        title: 'The Iron Giant', year: '1999', directors: ['Brad Bird'],
        genres: ['Animation', 'Drama', 'Family', 'Science Fiction', 'Adventure'],
        countries: ['United States of America'], runtime_minutes: 86, liked_in: 42, watched: false,
      }),
      syntheticFilm(base, 4, {
        title: 'Fantasia', year: '1940', directors: ['Bill Roberts', 'Paul Satterfield', 'Wilfred Jackson', 'Ben Sharpsteen', 'James Algar', 'T. Hee', 'Hamilton Luske', 'Samuel Armstrong', 'Jim Handley', 'Norman Ferguson', 'David Hand', 'Ford Beebe Jr.'],
        genres: ['Animation', 'Family', 'Fantasy'], countries: ['United States of America'], runtime_minutes: 124,
        liked_in: 21, watched: true,
      }),
      syntheticFilm(base, 5, {
        title: 'Breaking the Waves', year: '1996', directors: ['Lars von Trier'],
        genres: ['Drama', 'Romance'],
        countries: ['Denmark', 'France', 'Netherlands', 'Norway', 'Sweden', 'Finland', 'Iceland', 'United Kingdom', 'Italy', 'Belgium', 'Germany', 'Switzerland', 'United States of America'],
        runtime_minutes: 159, liked_in: 20, watched: false,
      }),
      syntheticFilm(base, 6, {
        title: '王秀英', original_title: '王秀英', year: '', directors: ['نور الهدى عبد الرحمن'],
        genres: ['Documentary'], liked_in: 1, watched: false,
      }),
      syntheticFilm(base, 7, {
        title: '🦊 Fox', directors: [], genres: [], overview: '', liked_in: 0, watched: true,
      }),
      syntheticFilm(base, 8, {
        title: '<script>alert(1)</script> &amp; **bold**', directors: ['Seán O’Brien-Ó Súilleabháin'],
        genres: ['Drama', 'Comedy', 'Music', 'History'], liked_in: 19, watched: false,
      }),
    ];
  }
  const unwatchedCount = films.filter((film) => !film.watched).length;
  const stressSnapshot = {
    ...snapshot,
    ...(mode === 'worst' ? {
      username: 'thisisaverylongusernamethatisallowed',
      profile_url: 'https://letterboxd.com/thisisaverylongusernamethatisallowed/',
    } : {}),
    film_count: films.length,
    displayed_film_count: films.length,
    unwatched_count: unwatchedCount,
    displayed_unwatched_count: unwatchedCount,
    tmdb_match_count: 0,
    list_count: mode === 'one' || mode === 'empty' ? (mode === 'one' ? 1 : 0) : 1284,
    films,
    source_lists: [],
  };
  delete stressSnapshot.ranking_csv_url;
  delete stressSnapshot.ranking_gzip_url;
  delete stressSnapshot.poster_gallery_url;
  return stressSnapshot;
}
