function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let closedQuote = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (closedQuote && character !== ',' && character !== '\n' && character !== '\r') {
      throw new Error('Full ranking CSV contains malformed quoting');
    } else if (character === '"') {
      if (cell) throw new Error('Full ranking CSV contains malformed quoting');
      quoted = true;
    }
    else if (character === ',') {
      row.push(cell);
      cell = '';
      closedQuote = false;
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
      closedQuote = false;
    } else cell += character;
    if (!quoted && character === '"' && source[index] === '"' && source[index + 1] !== '"') closedQuote = true;
  }
  if (quoted) throw new Error('Full ranking CSV contains an unterminated quoted field');
  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value !== '')) rows.push(row);
  }
  return rows;
}

function safeFilmUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && ['letterboxd.com', 'www.letterboxd.com'].includes(url.hostname)
      && /^\/film\/[^/]+\/?$/.test(url.pathname)
      ? `${url.origin}${url.pathname.replace(/\/?$/, '/')}`
      : '';
  } catch {
    return '';
  }
}

function safeListUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && ['letterboxd.com', 'www.letterboxd.com'].includes(url.hostname)
      && /^\/[^/]+\/list\/[^/]+\/?$/.test(url.pathname)
      ? `${url.origin}${url.pathname.replace(/\/?$/, '/')}`
      : '';
  } catch {
    return '';
  }
}

function readCell(row, index) {
  const value = String(row[index] ?? '');
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

export function expandSnapshotWithRanking(snapshot, csvText) {
  const rows = parseCsvRows(csvText);
  const header = rows.shift()?.map((value) => value.trim()) || [];
  const column = new Map(header.map((value, index) => [value, index]));
  const required = ['Rank', 'Title', 'Year', 'Watched', 'Liked in lists', 'Letterboxd URI', 'List URLs'];
  if (required.some((name) => !column.has(name))) throw new Error('Full ranking CSV is missing required columns');
  if (header.length !== required.length || new Set(header).size !== header.length) throw new Error('Full ranking CSV has an unexpected column layout');
  if (rows.length !== snapshot.film_count) throw new Error('Full ranking CSV does not match this snapshot');
  const rankedRows = rows.map((row) => {
    if (row.length !== header.length) throw new Error('Full ranking CSV contains a row with missing or extra fields');
    const rankValue = readCell(row, column.get('Rank'));
    const title = readCell(row, column.get('Title')).trim();
    const year = readCell(row, column.get('Year')).trim();
    const watched = readCell(row, column.get('Watched')).trim();
    const likedIn = readCell(row, column.get('Liked in lists')).trim();
    const rank = /^[1-9]\d*$/.test(rankValue) ? Number(rankValue) : NaN;
    if (!Number.isSafeInteger(rank)) throw new Error('Full ranking CSV contains an invalid rank');
    if (!title) throw new Error('Full ranking CSV contains a film without a title');
    if (year && !/^\d{4}$/.test(year)) throw new Error('Full ranking CSV contains an invalid year');
    if (!['yes', 'no'].includes(watched)) throw new Error('Full ranking CSV contains an invalid watched value');
    if (!/^(0|[1-9]\d*)$/.test(likedIn) || !Number.isSafeInteger(Number(likedIn))) throw new Error('Full ranking CSV contains an invalid list count');
    if (!safeFilmUrl(readCell(row, column.get('Letterboxd URI')))) throw new Error('Full ranking CSV contains an invalid Letterboxd film URL');
    const listUrls = readCell(row, column.get('List URLs')).trim().split(/\s+/).filter(Boolean);
    if (listUrls.some((url) => !safeListUrl(url))) throw new Error('Full ranking CSV contains an invalid source-list URL');
    return { row, rank };
  }).sort((left, right) => left.rank - right.rank);
  if (rankedRows.some(({ rank }, index) => rank !== index + 1)) throw new Error('Full ranking CSV ranks are incomplete or duplicated');

  const detailedByUrl = new Map();
  const detailedByTitleYear = new Map();
  for (const film of snapshot.films) {
    const url = safeFilmUrl(film.letterboxd_url);
    if (url) detailedByUrl.set(url, film);
    detailedByTitleYear.set(`${film.letterboxd_title || film.title}\u0000${film.letterboxd_year || film.year}`, film);
  }

  const films = rankedRows.map(({ row }) => {
    const title = readCell(row, column.get('Title'));
    const year = readCell(row, column.get('Year')).trim();
    const letterboxdUrl = safeFilmUrl(readCell(row, column.get('Letterboxd URI')));
    const matched = (letterboxdUrl && detailedByUrl.get(letterboxdUrl))
      || detailedByTitleYear.get(`${title}\u0000${year}`);
    const lists = [...new Set(readCell(row, column.get('List URLs')).split(/\s+/).map(safeListUrl).filter(Boolean))];
    const film = matched ? { ...matched } : {
      title,
      original_title: title,
      year,
      letterboxd_title: title,
      letterboxd_year: year,
      letterboxd_url: letterboxdUrl,
      poster_url: '',
      backdrop_url: '',
      overview: '',
      tmdb_url: '',
      watched: readCell(row, column.get('Watched')) === 'yes',
      liked_in: Number(readCell(row, column.get('Liked in lists'))),
      genres: [],
    };
    film.letterboxd_url = letterboxdUrl || film.letterboxd_url || '';
    film.letterboxd_title = title || film.letterboxd_title || film.title;
    film.letterboxd_year = year || film.letterboxd_year || film.year;
    film.watched = readCell(row, column.get('Watched')) === 'yes';
    film.liked_in = Number(readCell(row, column.get('Liked in lists')));
    film._sourceListUrls = lists.length ? lists : (film._sourceListUrls || []);
    return film;
  });

  return films;
}
