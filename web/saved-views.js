import { parsePresetImport } from './local-preferences.js';

export function bindSavedViewControls(dependencies) {
  const {
    readPreferences, savePreferences, clearPreferences, state, searchInput,
    syncControls, updateUrlState, render, getFilms, originalPosterByFilm,
    filmCardByFilm, filmViews,
  } = dependencies;
  const presetName = document.querySelector('#preset-name');
  const presetList = document.querySelector('#preset-list');
  const presetStatus = document.querySelector('#preset-status');

  function savedPresets() {
    const items = readPreferences().presets;
    return Array.isArray(items) ? items.filter((item) => item && typeof item.name === 'string' && item.state) : [];
  }

  function renderPresets() {
    const current = presetList.value;
    presetList.replaceChildren(new Option('Choose a preset', ''));
    savedPresets().forEach((preset, index) => presetList.add(new Option(preset.name, String(index))));
    if ([...presetList.options].some((item) => item.value === current)) presetList.value = current;
  }

  function capturePresetState() {
    return {
      query: searchInput.value.trim(), filter: state.filter, sort: state.sort,
      genres: [...state.genres], directors: [...state.directors], sourceLists: [...state.sourceLists],
      country: state.country, language: state.language, decade: state.decade,
      runtime: state.runtime, view: state.view,
    };
  }

  document.querySelector('#preset-save').addEventListener('click', () => {
    const name = presetName.value.trim();
    if (!name) { presetStatus.textContent = 'Enter a name for this preset.'; presetName.focus(); return; }
    const presets = savedPresets().filter((preset) => preset.name.toLocaleLowerCase() !== name.toLocaleLowerCase());
    presets.push({ name, state: capturePresetState() });
    savePreferences({ presets });
    renderPresets();
    presetStatus.textContent = `Saved “${name}”.`;
  });

  document.querySelector('#preset-apply').addEventListener('click', () => {
    if (!presetList.value) { presetStatus.textContent = 'Choose a preset to apply.'; return; }
    const preset = savedPresets()[Number(presetList.value)];
    if (!preset) return;
    Object.assign(state, preset.state);
    searchInput.value = state.query || '';
    state.visibleLimit = 40;
    syncControls(); updateUrlState(); render();
    presetStatus.textContent = `Applied “${preset.name}”.`;
  });

  document.querySelector('#preset-delete').addEventListener('click', () => {
    if (!presetList.value) { presetStatus.textContent = 'Choose a preset to delete.'; return; }
    const index = Number(presetList.value);
    const presets = savedPresets();
    if (!Number.isInteger(index) || !presets[index]) return;
    const [removed] = presets.splice(index, 1);
    savePreferences({ presets }); renderPresets();
    presetStatus.textContent = `Deleted “${removed.name}”.`;
  });

  document.querySelector('#preset-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ version: 1, presets: savedPresets() }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = 'reelrank-saved-views.json'; link.click();
    URL.revokeObjectURL(link.href);
    presetStatus.textContent = `Exported ${savedPresets().length} saved ${savedPresets().length === 1 ? 'view' : 'views'}.`;
  });

  document.querySelector('#preset-import-trigger').addEventListener('click', () => document.querySelector('#preset-import-file').click());
  document.querySelector('#preset-import-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = parsePresetImport(JSON.parse(await file.text()));
      if (!imported) throw new Error('shape');
      const merged = [...savedPresets()];
      imported.forEach((item) => {
        const old = merged.findIndex((saved) => saved.name.toLocaleLowerCase() === item.name.toLocaleLowerCase());
        if (old >= 0) merged.splice(old, 1);
        merged.push(item);
      });
      if (!savePreferences({ presets: merged.slice(-100) })) { presetStatus.textContent = 'Could not save imported views in this browser.'; return; }
      renderPresets();
      presetStatus.textContent = `Imported ${imported.length} saved ${imported.length === 1 ? 'view' : 'views'}.`;
    } catch { presetStatus.textContent = 'That file is not a valid ReelRank saved views export.'; }
    event.target.value = '';
  });

  document.querySelector('#reset-posters').addEventListener('click', () => {
    if (!savePreferences({ posterChoices: {} })) { presetStatus.textContent = 'Could not save the poster reset in this browser.'; return; }
    getFilms().forEach((film) => {
      const original = originalPosterByFilm.get(film);
      if (original === undefined) delete film.poster_url;
      else film.poster_url = original;
      filmCardByFilm.delete(film);
      filmViews.updatePosterForFilm(film, film.poster_url);
    });
    render();
    presetStatus.textContent = 'Poster choices reset to the catalogue originals.';
  });

  document.querySelector('#clear-preferences').addEventListener('click', () => {
    const cleared = clearPreferences();
    presetStatus.textContent = cleared
      ? 'Local preferences cleared. Saved views and poster choices were removed.'
      : 'Could not clear local preferences in this browser.';
    if (!cleared) return;
    renderPresets();
    if (!new URLSearchParams(window.location.search).has('view') && state.view !== 'posters') {
      state.view = 'posters'; syncControls(); updateUrlState({ replace: true });
    }
    getFilms().forEach((film) => {
      const original = originalPosterByFilm.get(film);
      if (original === undefined) delete film.poster_url;
      else film.poster_url = original;
      filmCardByFilm.delete(film);
      filmViews.updatePosterForFilm(film, film.poster_url);
    });
    render();
  });

  renderPresets();
}
