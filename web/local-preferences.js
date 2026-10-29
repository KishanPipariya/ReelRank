export const preferenceKey = 'reelrank.preferences.v1';
export const preferenceUndoKey = 'reelrank.preferences.undo.v1';

const presetStateKeys = ['query', 'filter', 'sort', 'view', 'genres', 'directors', 'sourceLists', 'country', 'language', 'decade', 'runtime'];

function cleanPresetState(saved) {
  const clean = { query: '', filter: 'all', sort: 'rank', view: 'posters', genres: [], directors: [], sourceLists: [], country: '', language: '', decade: '', runtime: '' };
  presetStateKeys.forEach((key) => { if (Object.hasOwn(saved, key)) clean[key] = saved[key]; });
  return clean;
}

export function validatePreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  if (['posters', 'ledger'].includes(value.view)) result.view = value.view;
  if (value.posterChoices && typeof value.posterChoices === 'object' && !Array.isArray(value.posterChoices)) {
    result.posterChoices = Object.fromEntries(Object.entries(value.posterChoices).filter(([id, url]) => /^\d+$/.test(id) && typeof url === 'string' && /^https:\/\/image\.tmdb\.org\/t\/p\/(?:w\d+|original)\//.test(url)));
  }
  if (Array.isArray(value.presets)) result.presets = value.presets.slice(0, 100).filter((preset) => {
    const saved = preset?.state;
    return preset && typeof preset === 'object' && !Array.isArray(preset) && typeof preset.name === 'string'
      && preset.name.trim() && preset.name.length <= 48 && saved && typeof saved === 'object' && !Array.isArray(saved)
      && (saved.query === undefined || typeof saved.query === 'string')
      && (saved.filter === undefined || ['all', 'watched', 'unwatched'].includes(saved.filter))
      && (saved.sort === undefined || ['rank', 'title', 'year-newest', 'year-oldest', 'relevance'].includes(saved.sort))
      && (saved.view === undefined || ['posters', 'ledger'].includes(saved.view))
      && ['genres', 'directors', 'sourceLists'].every((key) => saved[key] === undefined || (Array.isArray(saved[key]) && saved[key].every((item) => typeof item === 'string')))
      && (saved.country === undefined || typeof saved.country === 'string')
      && (saved.language === undefined || typeof saved.language === 'string')
      && (saved.decade === undefined || saved.decade === '' || (Number.isSafeInteger(saved.decade) && saved.decade >= 1000))
      && (saved.runtime === undefined || ['', 'under-90', '90-120', 'over-120'].includes(saved.runtime));
  });
  result.presets = result.presets?.map((preset) => ({ name: preset.name.trim(), state: cleanPresetState(preset.state) }));
  return result;
}

export function createLocalPreferences(storage) {
  function getStorage() { return storage || globalThis.localStorage; }
  function read() { try { return validatePreferences(JSON.parse(getStorage().getItem(preferenceKey) || '{}')); } catch { return {}; } }
  function save(patch) { try { getStorage().setItem(preferenceKey, JSON.stringify({ ...read(), ...patch })); return true; } catch { return false; } }
  function replace(value) { try { getStorage().setItem(preferenceKey, JSON.stringify(validatePreferences(value))); return true; } catch { return false; } }
  function clear() { try { getStorage().removeItem(preferenceKey); return true; } catch { return false; } }
  function readUndo() {
    try {
      const value = JSON.parse(getStorage().getItem(preferenceUndoKey) || 'null');
      if (!value || value.version !== 1 || !['saved-views', 'local-settings'].includes(value.group)
        || typeof value.label !== 'string' || typeof value.undoneMessage !== 'string'
        || !value.before || typeof value.before !== 'object' || Array.isArray(value.before)
        || !value.expected || typeof value.expected !== 'object' || Array.isArray(value.expected)) return null;
      return {
        version: 1,
        before: validatePreferences(value.before),
        expected: validatePreferences(value.expected),
        label: value.label.slice(0, 120),
        undoneMessage: value.undoneMessage.slice(0, 160),
        group: value.group,
      };
    } catch { return null; }
  }
  function saveUndo(record) {
    try {
      const safe = {
        version: 1,
        before: validatePreferences(record?.before),
        expected: validatePreferences(record?.expected),
        label: String(record?.label || 'Undo').slice(0, 120),
        undoneMessage: String(record?.undoneMessage || 'Change undone.').slice(0, 160),
        group: record?.group === 'local-settings' ? 'local-settings' : 'saved-views',
      };
      getStorage().setItem(preferenceUndoKey, JSON.stringify(safe));
      return true;
    } catch { return false; }
  }
  function clearUndo() { try { getStorage().removeItem(preferenceUndoKey); return true; } catch { return false; } }
  return { read, save, replace, clear, readUndo, saveUndo, clearUndo };
}

export function parsePresetImport(value) {
  const presets = Array.isArray(value) ? value : value && Array.isArray(value.presets) ? value.presets : null;
  if (!presets || presets.length > 100) return null;
  const valid = validatePreferences({ presets }).presets || [];
  if (valid.length !== presets.length) return null;
  return valid;
}
