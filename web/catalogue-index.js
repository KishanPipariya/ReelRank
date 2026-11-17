import indexSchema from './catalogue-index.schema.json' with { type: 'json' };
import { canonicalLetterboxdFilmUrl } from './letterboxd-film-url.js';

function validateAgainstSchema(value, schema, path = 'catalogue index') {
  if (schema.$ref) {
    const target = schema.$ref.slice(2).split('/').reduce((node, key) => node[key.replaceAll('~1', '/').replaceAll('~0', '~')], indexSchema);
    validateAgainstSchema(value, target, path);
    return;
  }
  if (schema.anyOf) {
    for (const option of schema.anyOf) {
      try {
        validateAgainstSchema(value, option, path);
        return;
      } catch {}
    }
    throw new Error(`${path} does not match its schema`);
  }
  const validType = {
    object: (item) => item && typeof item === 'object' && !Array.isArray(item),
    array: Array.isArray,
    string: (item) => typeof item === 'string',
    boolean: (item) => typeof item === 'boolean',
    integer: Number.isSafeInteger,
    number: (item) => typeof item === 'number' && Number.isFinite(item),
    null: (item) => item === null,
  }[schema.type];
  if (validType && !validType(value)) throw new Error(`${path} must be ${schema.type}`);
  if ('const' in schema && value !== schema.const) throw new Error(`${path} has an unsupported value`);
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path} has an unsupported value`);
  if (typeof value === 'string') {
    const length = Array.from(value).length;
    if (length < (schema.minLength || 0)) throw new Error(`${path} must not be empty`);
    if (length > (schema.maxLength ?? Infinity)) throw new Error(`${path} exceeds the supported text length`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) throw new Error(`${path} does not match its required text pattern`);
  }
  if (typeof value === 'number' && (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) {
    throw new Error(`${path} is outside the supported range`);
  }
  if (schema.type === 'object') {
    for (const field of schema.required || []) {
      if (!(field in value)) throw new Error(`${path}.${field} is required`);
    }
    for (const [field, child] of Object.entries(schema.properties || {})) {
      if (field in value) validateAgainstSchema(value[field], child, `${path}.${field}`);
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties || {}));
      const extra = Object.keys(value).find((field) => !allowed.has(field));
      if (extra) throw new Error(`${path}.${extra} is not supported`);
    }
  }
  if (schema.type === 'array' && schema.items) {
    value.forEach((item, index) => validateAgainstSchema(item, schema.items, `${path}[${index}]`));
  }
}

function isLetterboxdListUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && ['letterboxd.com', 'www.letterboxd.com'].includes(url.hostname)
      && !url.port && !url.username && !url.password && !url.search && !url.hash
      && /^\/[^/]+\/list\/[^/]+\/$/.test(url.pathname);
  } catch {
    return false;
  }
}

function isValidTimestamp(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function sameEdition(index, snapshot) {
  if (index.username !== snapshot.username || index.refreshed_at !== snapshot.refreshed_at) {
    throw new Error('Catalogue index does not match this snapshot edition');
  }
  if (index.film_count !== snapshot.film_count || index.films.length !== snapshot.film_count) {
    throw new Error('Catalogue index does not match the snapshot film count');
  }
}

export function validateCatalogueIndex(index, snapshot) {
  validateAgainstSchema(index, indexSchema);
  sameEdition(index, snapshot);
  if (!isValidTimestamp(index.refreshed_at)) throw new Error('Catalogue index refreshed_at must be an ISO 8601 timestamp with a timezone');
  if (!Array.isArray(index.strings) || index.strings[0] !== '') throw new Error('Catalogue index string table must start with an empty string');
  if (new Set(index.strings).size !== index.strings.length) throw new Error('Catalogue index string table cannot contain duplicates');
  if (new Set(index.source_lists).size !== index.source_lists.length
      || index.source_lists.some((url) => !isLetterboxdListUrl(url))) {
    throw new Error('Catalogue index source_lists must contain unique HTTPS Letterboxd list URLs');
  }
  if (index.detail_shards.length !== 128) throw new Error('Catalogue index must contain 128 detail shard entries');
  index.detail_shards.forEach((url, bucket) => {
    if (url === null) return;
    const basename = `film-details-${String(bucket).padStart(3, '0')}-`;
    if (typeof url !== 'string' || !url.startsWith('/data/') || !url.includes(basename)
        || !/^\/data\/(?:local\/)?film-details-\d{3}-[a-f0-9]{12}\.json$/.test(url)) {
      throw new Error(`Catalogue index detail shard ${bucket} has an invalid URL`);
    }
  });

  const seenFilms = new Set();
  const stringAt = (id, field, position) => {
    if (!Number.isSafeInteger(id) || id < 0 || id >= index.strings.length) {
      throw new Error(`Catalogue index film ${position} has an invalid ${field} string ID`);
    }
    return index.strings[id];
  };
  const stringsAt = (ids, field, position) => {
    if (!Array.isArray(ids)) throw new Error(`Catalogue index film ${position} has invalid ${field} IDs`);
    return ids.map((id) => stringAt(id, field, position));
  };
  const decodedFilms = [];
  index.films.forEach((film, position) => {
    const rank = position + 1;
    if (!Array.isArray(film) || film.length !== 23) throw new Error(`Catalogue index film ${rank} must have 23 fields`);
    const canonicalUrl = canonicalLetterboxdFilmUrl(film[0]);
    if (!canonicalUrl || canonicalUrl !== film[0]) {
      throw new Error(`Catalogue index film ${position + 1} has an invalid Letterboxd URL`);
    }
    if (seenFilms.has(canonicalUrl)) throw new Error('Catalogue index cannot contain duplicate Letterboxd URLs');
    seenFilms.add(canonicalUrl);
    if (film[7] !== null && (!Number.isSafeInteger(film[7]) || film[7] < 0)) throw new Error(`Catalogue index film ${rank} has an invalid TMDB ID`);
    if (film[9] !== null && (typeof film[9] !== 'number' || !Number.isFinite(film[9]))) throw new Error(`Catalogue index film ${rank} has an invalid TMDB rating`);
    if (film[14] !== null && (!Number.isSafeInteger(film[14]) || film[14] < 1)) throw new Error(`Catalogue index film ${rank} has an invalid runtime`);
    if (!Number.isSafeInteger(film[18]) || film[18] < 0 || film[18] > snapshot.list_count) throw new Error(`Catalogue index film ${rank} has an invalid list count`);
    if (typeof film[19] !== 'boolean') throw new Error(`Catalogue index film ${rank} has an invalid watched value`);
    if (!Array.isArray(film[20]) || film[20].some((id) => !Number.isSafeInteger(id) || id < 0 || id >= index.source_lists.length)
        || new Set(film[20]).size !== film[20].length) {
      throw new Error(`Catalogue index film ${rank} has invalid source list IDs`);
    }
    if (film[21] !== null && (!Number.isSafeInteger(film[21]) || film[21] < 0 || film[21] >= 128 || !index.detail_shards[film[21]])) {
      throw new Error(`Catalogue index film ${rank} references an invalid detail shard`);
    }
    if (typeof film[22] !== 'boolean' || (film[22] && film[7] === null)) {
      throw new Error(`Catalogue index film ${rank} has an invalid poster gallery flag`);
    }
    const metadataSource = stringAt(film[15], 'metadata_source', rank);
    const metadataStatus = stringAt(film[17], 'metadata_status', rank);
    if (!['', 'letterboxd', 'title_match'].includes(metadataSource)) throw new Error(`Catalogue index film ${rank} has an invalid metadata source`);
    if (!['unavailable', 'id_only', 'complete', 'partial'].includes(metadataStatus)) throw new Error(`Catalogue index film ${rank} has an invalid metadata status`);
    const detailShardId = film[21];
    const decoded = {
      letterboxd_url: canonicalUrl,
      title: stringAt(film[1], 'title', rank),
      original_title: stringAt(film[2], 'original_title', rank),
      year: stringAt(film[3], 'year', rank),
      letterboxd_title: stringAt(film[4], 'letterboxd_title', rank),
      letterboxd_year: stringAt(film[5], 'letterboxd_year', rank),
      poster_url: stringAt(film[6], 'poster_url', rank),
      tmdb_id: film[7],
      tmdb_url: stringAt(film[8], 'tmdb_url', rank),
      tmdb_rating: film[9],
      genres: stringsAt(film[10], 'genre', rank),
      directors: stringsAt(film[11], 'director', rank),
      countries: stringsAt(film[12], 'country', rank),
      original_language: stringAt(film[13], 'original_language', rank),
      runtime_minutes: film[14],
      metadata_source: metadataSource,
      metadata_fetched_at: stringAt(film[16], 'metadata_fetched_at', rank),
      metadata_status: metadataStatus,
      liked_in: film[18],
      watched: film[19],
      list_ids: film[20],
      detail_shard_url: detailShardId === null ? '' : index.detail_shards[detailShardId],
      has_poster_gallery: film[22],
    };
    if (!decoded.title.trim()) throw new Error(`Catalogue index film ${rank} has no title`);
    decodedFilms.push(decoded);
  });
  const { strings: _strings, detail_shards: _detailShards, ...header } = index;
  return { ...header, films: decodedFilms };
}

export function mergeCatalogueIndex(snapshot, index, { validated = false } = {}) {
  const decodedIndex = validated ? index : validateCatalogueIndex(index, snapshot);
  sameEdition(decodedIndex, snapshot);
  const bootstrapByUrl = new Map();
  for (const film of snapshot.films) {
    const url = canonicalLetterboxdFilmUrl(film.letterboxd_url);
    if (url) bootstrapByUrl.set(url, film);
  }
  return decodedIndex.films.map((record) => {
    const bootstrap = bootstrapByUrl.get(record.letterboxd_url);
    const overview = typeof bootstrap?.overview === 'string' ? bootstrap.overview : '';
    return {
      ...record,
      overview,
      detail_overview: overview,
      ...(typeof bootstrap?.backdrop_url === 'string' ? { backdrop_url: bootstrap.backdrop_url } : {}),
    };
  });
}

function validateDetailShard(payload, snapshot, shardUrl) {
  if (!payload || payload.schema_version !== 1
      || payload.username !== snapshot.username
      || !Array.isArray(payload.records)) {
    throw new Error('Film detail shard does not match this snapshot edition');
  }
  const records = new Map();
  for (const [index, record] of payload.records.entries()) {
    const url = canonicalLetterboxdFilmUrl(record?.letterboxd_url);
    if (!url || url !== record.letterboxd_url || typeof record.overview !== 'string'
        || Array.from(record.overview).length > 20000 || records.has(url)) {
      throw new Error(`Film detail shard ${shardUrl} has an invalid record at ${index + 1}`);
    }
    records.set(url, record.overview);
  }
  return records;
}

export function createFilmDetailLoader(fetcher = fetch) {
  const requests = new Map();
  return async function loadFilmDetail(film, snapshot, { retry = false } = {}) {
    const shardUrl = film?.detail_shard_url;
    const filmUrl = canonicalLetterboxdFilmUrl(film?.letterboxd_url);
    if (!shardUrl || !filmUrl) return null;
    const key = `${snapshot.username}|${shardUrl}`;
    let request = requests.get(key);
    if (retry || !request) {
      request = (async () => {
        const response = await fetcher(shardUrl, { cache: retry ? 'no-store' : 'default' });
        if (!response.ok) throw new Error(`Film detail request failed: ${response.status}`);
        return validateDetailShard(await response.json(), snapshot, shardUrl);
      })();
      requests.set(key, request);
    }
    let records;
    try {
      records = await request;
    } catch (error) {
      if (requests.get(key) === request) requests.delete(key);
      throw error;
    }
    if (!records.has(filmUrl)) throw new Error('Film detail shard does not contain this film');
    return records.get(filmUrl);
  };
}

export async function loadCatalogueIndexDirect(snapshot, cache = 'default', fetcher = fetch) {
  if (!snapshot?.catalogue_index_url) throw new Error('This snapshot does not include a full catalogue index');
  const response = await fetcher(snapshot.catalogue_index_url, { cache });
  if (!response.ok) throw new Error(`Catalogue index request failed: ${response.status}`);
  return validateCatalogueIndex(await response.json(), snapshot);
}

export function loadCatalogueIndex(snapshot, cache = 'default') {
  if (typeof Worker !== 'function') return loadCatalogueIndexDirect(snapshot, cache);
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('./ranking-worker.js', import.meta.url), { type: 'module' });
    } catch {
      resolve(loadCatalogueIndexDirect(snapshot, cache));
      return;
    }
    const finish = (callback, value) => {
      worker.terminate();
      callback(value);
    };
    worker.addEventListener('message', (event) => {
      if (event.data.error) finish(reject, new Error(event.data.error));
      else finish(resolve, event.data.index);
    }, { once: true });
    worker.addEventListener('error', () => {
      worker.terminate();
      loadCatalogueIndexDirect(snapshot, cache).then(resolve, reject);
    }, { once: true });
    worker.postMessage({ kind: 'catalogue-index', snapshot, cache });
  });
}
