import snapshotSchema from './snapshot.schema.json' with { type: 'json' };

function validateAgainstSchema(value, schema, path = 'snapshot') {
  if (schema.$ref) {
    const target = schema.$ref.slice(2).split('/').reduce((node, key) => node[key.replaceAll('~1', '/').replaceAll('~0', '~')], snapshotSchema);
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
  if (typeof value === 'string' && value.length < (schema.minLength || 0)) throw new Error(`${path} must not be empty`);
  if (typeof value === 'string' && schema.pattern && !new RegExp(schema.pattern).test(value)) {
    throw new Error(`${path} does not match its required text pattern`);
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
  }
  if (schema.type === 'array' && schema.items) {
    value.forEach((item, index) => validateAgainstSchema(item, schema.items, `${path}[${index}]`));
  }
}

function isHttpsLetterboxdUrl(value, pathPattern) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && ['letterboxd.com', 'www.letterboxd.com'].includes(url.hostname)
      && !url.port
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && pathPattern.test(url.pathname);
  } catch {
    return false;
  }
}

export function validateSnapshot(snapshot) {
  const supportedVersion = snapshotSchema.properties.schema_version.const;
  if (!snapshot || snapshot.schema_version !== supportedVersion) {
    throw new Error(`Unsupported snapshot schema version: ${snapshot?.schema_version ?? 'missing'}`);
  }
  validateAgainstSchema(snapshot, snapshotSchema);
  let profilePath;
  try { profilePath = decodeURIComponent(new URL(snapshot.profile_url).pathname).replace(/\/+$/, '').toLocaleLowerCase(); }
  catch { profilePath = ''; }
  if (!isHttpsLetterboxdUrl(snapshot.profile_url, /^\/[^/]+\/?$/)
      || profilePath !== `/${snapshot.username.trim().replace(/^\/+|\/+$/g, '').toLocaleLowerCase()}`) {
    throw new Error('Snapshot profile_url must be the HTTPS Letterboxd profile for its username');
  }
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(snapshot.refreshed_at) || !Number.isFinite(Date.parse(snapshot.refreshed_at))) {
    throw new Error('Snapshot refreshed_at must be an ISO 8601 timestamp with a timezone');
  }
  if (Array.isArray(snapshot.source_lists)) {
    if (new Set(snapshot.source_lists).size !== snapshot.source_lists.length) {
      throw new Error('Snapshot source_lists cannot contain duplicates');
    }
    if (snapshot.source_lists.some((url) => !isHttpsLetterboxdUrl(url, /^\/[^/]+\/list\/[^/]+\/?$/))) {
      throw new Error('Snapshot source_lists must contain HTTPS Letterboxd list URLs');
    }
  }
  if (!Array.isArray(snapshot.films) || snapshot.films.some((film) => !Array.isArray(film.lists) && !Array.isArray(film.list_ids))) {
    throw new Error('Snapshot films must include lists or list_ids');
  }
  for (const [index, film] of snapshot.films.entries()) {
    if (film.letterboxd_url && !isHttpsLetterboxdUrl(film.letterboxd_url, /^\/film\/[^/]+\/?$/)) {
      throw new Error(`snapshot.films[${index}].letterboxd_url must be an HTTPS Letterboxd film URL`);
    }
    if (Array.isArray(film.lists)) {
      if (new Set(film.lists).size !== film.lists.length) throw new Error(`snapshot.films[${index}].lists cannot contain duplicates`);
      if (film.lists.some((url) => !isHttpsLetterboxdUrl(url, /^\/[^/]+\/list\/[^/]+\/?$/))) {
        throw new Error(`snapshot.films[${index}].lists must contain HTTPS Letterboxd list URLs`);
      }
    }
    if (Array.isArray(film.list_ids) && new Set(film.list_ids).size !== film.list_ids.length) {
      throw new Error(`snapshot.films[${index}].list_ids cannot contain duplicates`);
    }
  }
  if (snapshot.films.some((film) => Array.isArray(film.list_ids)
      && (!Array.isArray(snapshot.source_lists) || film.list_ids.some((id) => !Number.isSafeInteger(id) || id < 0 || id >= snapshot.source_lists.length)))) {
    throw new Error('Snapshot source list IDs are invalid');
  }
  if (snapshot.displayed_film_count !== snapshot.films.length
      || snapshot.displayed_film_count > snapshot.film_count
      || snapshot.unwatched_count > snapshot.film_count
      || snapshot.displayed_unwatched_count > snapshot.displayed_film_count
      || snapshot.tmdb_match_count > snapshot.displayed_film_count
      || snapshot.displayed_unwatched_count !== snapshot.films.filter((film) => !film.watched).length) {
    throw new Error('Snapshot does not match schema version 1');
  }
  return snapshot;
}

export function snapshotLoadErrorMessage(kind) {
  if (kind === 'json') return 'ReelRank found data/snapshot.json but could not read its JSON. Check the catalogue file and try again.';
  if (kind === 'schema') return 'ReelRank found data/snapshot.json but it does not match the supported catalogue format. Check the catalogue file and try again.';
  if (kind === 'initialization') return 'ReelRank loaded the catalogue but could not prepare the site. Try reloading the page.';
  return 'ReelRank could not load data/snapshot.json. Check that the catalogue file is present and reachable, then try again.';
}
