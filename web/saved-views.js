import { parsePresetImport } from './local-preferences.js';

export function bindSavedViewControls(dependencies) {
  const {
    readPreferences, savePreferences, replacePreferences, clearPreferences, state, searchInput,
    syncControls, updateUrlState, render, getFilms, originalPosterByFilm,
    readUndo, saveUndo, clearUndo,
    filmCardByFilm, filmViews,
  } = dependencies;
  const presetName = document.querySelector('#preset-name');
  const presetList = document.querySelector('#preset-list');
  const presetStatus = document.querySelector('#preset-status');
  const savedUndo = readUndo?.() || null;
  let pendingUndo = null;

  function showStatus(message, undo, undoLabel = 'Undo', undoneMessage = 'Change undone.', recovery = null) {
    if (undo !== undefined) {
      pendingUndo = undo ? { action: undo, expected: JSON.stringify(readPreferences()), label: undoLabel, undoneMessage, recovery } : null;
      if (undo) {
        const stored = recovery && saveUndo?.(recovery);
        if (!stored) message += ' Undo is available until you leave this page.';
      } else {
        clearUndo?.();
      }
    }
    presetStatus.replaceChildren(document.createTextNode(message));
    if (!pendingUndo) return;

    const undoButton = document.createElement('button');
    undoButton.className = 'preset-undo';
    undoButton.type = 'button';
    undoButton.textContent = 'Undo';
    undoButton.setAttribute('aria-label', undoLabel);
    undoButton.addEventListener('click', () => {
      const currentUndo = pendingUndo;
      if (!currentUndo) return;
      if (JSON.stringify(readPreferences()) !== currentUndo.expected) {
        showStatus('Undo is unavailable because local preferences changed after this action.', null);
        return;
      }
      if (!currentUndo.action()) {
        showStatus('Could not restore local preferences. Try Undo again.', currentUndo.action, currentUndo.label, currentUndo.undoneMessage, currentUndo.recovery);
        return;
      }
      showStatus(currentUndo.undoneMessage, null);
    });
    presetStatus.append(undoButton);
  }

  function recoveryRecord(before, label, undoneMessage, group) {
    return { before, expected: readPreferences(), label, undoneMessage, group };
  }

  function restorePreferencesFromJournal(recovery) {
    if (!replacePreferences(recovery.before)) return false;
    renderPresets();
    const viewIsInUrl = new URLSearchParams(window.location.search).has('view');
    if (!viewIsInUrl) {
      state.view = recovery.before.view || 'posters';
      syncControls();
      updateUrlState({ replace: true });
    }
    restorePosterChoices(recovery.before.posterChoices || {});
    return true;
  }

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

  function restorePosterChoices(choices = {}) {
    getFilms().forEach((film) => {
      const original = originalPosterByFilm.get(film);
      const selected = Number.isSafeInteger(film.tmdb_id) ? choices[String(film.tmdb_id)] : '';
      if (selected) film.poster_url = selected;
      else if (original === undefined) delete film.poster_url;
      else film.poster_url = original;
      filmCardByFilm.delete(film);
      filmViews.updatePosterForFilm(film, film.poster_url);
    });
    render();
  }

  document.querySelector('#preset-save').addEventListener('click', () => {
    const name = presetName.value.trim();
    if (!name) { showStatus('Enter a name for this preset.'); presetName.focus(); return; }
    const previousPreferences = readPreferences();
    const presets = savedPresets().filter((preset) => preset.name.toLocaleLowerCase() !== name.toLocaleLowerCase());
    presets.push({ name, state: capturePresetState() });
    if (!savePreferences({ presets })) { showStatus('Could not save this view in this browser.'); return; }
    renderPresets();
    presetList.value = '';
    showStatus(`Saved “${name}”.`, () => {
      if (!replacePreferences(previousPreferences)) return false;
      renderPresets();
      return true;
    }, `Undo saving “${name}”`, 'Saved views restored.', recoveryRecord(previousPreferences, `Undo saving “${name}”`, 'Saved views restored.', 'saved-views'));
  });

  document.querySelector('#preset-apply').addEventListener('click', () => {
    if (!presetList.value) { showStatus('Choose a preset to apply.'); return; }
    const preset = savedPresets()[Number(presetList.value)];
    if (!preset) return;
    Object.assign(state, preset.state);
    searchInput.value = state.query || '';
    state.visibleLimit = 40;
    syncControls(); updateUrlState(); render();
    showStatus(`Applied “${preset.name}”.`, null);
  });

  document.querySelector('#preset-delete').addEventListener('click', () => {
    if (!presetList.value) { showStatus('Choose a preset to delete.'); return; }
    const index = Number(presetList.value);
    const previousPreferences = readPreferences();
    const presets = savedPresets();
    if (!Number.isInteger(index) || !presets[index]) return;
    const [removed] = presets.splice(index, 1);
    if (!savePreferences({ presets })) { showStatus(`Could not delete “${removed.name}” in this browser.`); return; }
    renderPresets();
    presetList.value = '';
    showStatus(`Deleted “${removed.name}”.`, () => {
      if (!replacePreferences(previousPreferences)) return false;
      renderPresets();
      presetList.value = String(index);
      return true;
    }, `Undo deleting “${removed.name}”`, `Saved view “${removed.name}” restored.`, recoveryRecord(previousPreferences, `Undo deleting “${removed.name}”`, `Saved view “${removed.name}” restored.`, 'saved-views'));
  });

  document.querySelector('#preset-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ version: 1, presets: savedPresets() }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = 'reelrank-saved-views.json'; link.click();
    URL.revokeObjectURL(link.href);
    showStatus(`Exported ${savedPresets().length} saved ${savedPresets().length === 1 ? 'view' : 'views'}.`);
  });

  document.querySelector('#preset-import-trigger').addEventListener('click', () => document.querySelector('#preset-import-file').click());
  document.querySelector('#preset-import-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = parsePresetImport(JSON.parse(await file.text()));
      if (!imported) throw new Error('shape');
      const previousPreferences = readPreferences();
      const merged = [...savedPresets()];
      imported.forEach((item) => {
        const old = merged.findIndex((saved) => saved.name.toLocaleLowerCase() === item.name.toLocaleLowerCase());
        if (old >= 0) merged.splice(old, 1);
        merged.push(item);
      });
      if (!savePreferences({ presets: merged.slice(-100) })) { showStatus('Could not save imported views in this browser.'); return; }
      renderPresets();
      presetList.value = '';
      showStatus(`Imported ${imported.length} saved ${imported.length === 1 ? 'view' : 'views'}.`, () => {
        if (!replacePreferences(previousPreferences)) return false;
        renderPresets();
        return true;
      }, 'Undo importing saved views', 'Previous saved views restored.', recoveryRecord(previousPreferences, 'Undo importing saved views', 'Previous saved views restored.', 'saved-views'));
    } catch { showStatus('That file is not a valid ReelRank saved views export.'); }
    event.target.value = '';
  });

  document.querySelector('#reset-posters').addEventListener('click', () => {
    const previousPreferences = readPreferences();
    if (!savePreferences({ posterChoices: {} })) { showStatus('Could not save the poster reset in this browser.'); return; }
    restorePosterChoices();
    showStatus('Poster choices reset to the catalogue originals.', () => {
      if (!replacePreferences(previousPreferences)) return false;
      restorePosterChoices(readPreferences().posterChoices || {});
      return true;
    }, 'Undo resetting poster choices', 'Poster choices restored.', recoveryRecord(previousPreferences, 'Undo resetting poster choices', 'Poster choices restored.', 'local-settings'));
  });

  document.querySelector('#clear-preferences').addEventListener('click', () => {
    const previousPreferences = readPreferences();
    if (Object.keys(previousPreferences).length === 0) { showStatus('There are no local preferences to clear.'); return; }
    const cleared = clearPreferences();
    if (!cleared) { showStatus('Could not clear local preferences in this browser.'); return; }
    renderPresets();
    const previousView = state.view;
    const viewIsInUrl = new URLSearchParams(window.location.search).has('view');
    if (!new URLSearchParams(window.location.search).has('view') && state.view !== 'posters') {
      state.view = 'posters'; syncControls(); updateUrlState({ replace: true });
    }
    restorePosterChoices();
    showStatus('Local preferences cleared. Saved views and poster choices were removed.', () => {
      if (!replacePreferences(previousPreferences)) return false;
      renderPresets();
      if (!viewIsInUrl) { state.view = previousView; syncControls(); updateUrlState({ replace: true }); }
      restorePosterChoices(readPreferences().posterChoices || {});
      return true;
    }, 'Undo clearing local preferences', 'Local preferences restored.', recoveryRecord(previousPreferences, 'Undo clearing local preferences', 'Local preferences restored.', 'local-settings'));
  });

  renderPresets();
  if (savedUndo) {
    const tools = document.querySelector('#catalogue-tools');
    const group = document.querySelector(savedUndo.group === 'local-settings' ? '#local-settings' : '#saved-views');
    if (tools) tools.open = true;
    if (group) group.open = true;
    if (JSON.stringify(readPreferences()) !== JSON.stringify(savedUndo.expected)) {
      showStatus('Undo is unavailable because local preferences changed after this action.', null);
    } else {
      showStatus(savedUndo.label, () => restorePreferencesFromJournal(savedUndo), savedUndo.label, savedUndo.undoneMessage, savedUndo);
    }
  }
  return () => {
    if (pendingUndo) showStatus('Undo is unavailable because local preferences changed.', null);
  };
}
