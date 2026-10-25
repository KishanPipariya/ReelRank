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

export function validateSnapshot(snapshot) {
  const supportedVersion = snapshotSchema.properties.schema_version.const;
  if (!snapshot || snapshot.schema_version !== supportedVersion) {
    throw new Error(`Unsupported snapshot schema version: ${snapshot?.schema_version ?? 'missing'}`);
  }
  validateAgainstSchema(snapshot, snapshotSchema);
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
