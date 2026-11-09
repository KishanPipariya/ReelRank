import { sourceListLabel } from './source-list-label.js';

export function createFilterControls({ state, sources, elements, actions }) {
  function bindChipRemoval(chip, container, onRemove, fallback) {
    chip.addEventListener('click', () => {
      const index = document.activeElement === chip ? [...container.querySelectorAll('button')].indexOf(chip) : -1;
      onRemove();
      if (index < 0 || chip.isConnected) return;
      const remaining = container.querySelectorAll('button');
      (remaining[Math.min(index, remaining.length - 1)] || fallback())?.focus({ preventScroll: true });
    });
  }

  const activeChipFallback = () => elements.activeViewTools.querySelector('.active-genre-chip') || elements.searchInput;

  function appendFacetChip(container, label, ariaLabel, onRemove) {
    container.hidden = false;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'active-genre-chip';
    chip.textContent = `${label} ×`;
    chip.setAttribute('aria-label', ariaLabel);
    bindChipRemoval(chip, container, onRemove, activeChipFallback);
    container.append(chip);
  }

  function renderSelectedGenres() {
    elements.selectedGenres.replaceChildren();
    if (!state.genres.length) {
      const empty = document.createElement('span');
      empty.className = 'selected-genres-empty';
      empty.textContent = 'No genres selected';
      elements.selectedGenres.append(empty);
      return;
    }
    state.genres.forEach((genre) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'selected-genre-chip';
      chip.textContent = `${genre} ×`;
      chip.setAttribute('aria-label', `Remove ${genre} genre filter`);
      bindChipRemoval(chip, elements.selectedGenres, () => actions.toggleGenre(genre),
        () => elements.selectedGenres.closest('details')?.querySelector('summary'));
      elements.selectedGenres.append(chip);
    });
  }

  function renderSelectedSourceLists() {
    elements.selectedSourceLists.replaceChildren();
    if (!state.sourceLists.length) {
      const empty = document.createElement('span');
      empty.className = 'selected-genres-empty';
      empty.textContent = 'No source lists selected';
      elements.selectedSourceLists.append(empty);
      return;
    }
    state.sourceLists.forEach((url) => {
      const label = sourceListLabel(url, sources());
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'selected-genre-chip';
      chip.textContent = `${label} ×`;
      chip.setAttribute('aria-label', `Remove ${label} source list filter`);
      bindChipRemoval(chip, elements.selectedSourceLists, () => actions.toggleSourceList(url),
        () => elements.selectedSourceLists.closest('details')?.querySelector('summary'));
      elements.selectedSourceLists.append(chip);
    });
  }

  function renderActiveViewFilters() {
    const hasActiveView = Boolean(elements.searchInput.value.trim()) || state.filter !== 'all' || state.sort !== 'rank'
      || state.genres.length || state.directors.length || state.sourceLists.length || state.country || state.language || state.decade !== '' || state.runtime;
    elements.activeViewTools.hidden = !hasActiveView;
    elements.activeGenreFilters.replaceChildren();
    elements.activeGenreFilters.hidden = state.filter === 'all' && state.genres.length === 0 && !state.country && !state.language && state.decade === '' && !state.runtime;
    if (state.filter !== 'all') {
      const label = state.filter === 'watched' ? 'Watched' : 'Unwatched';
      appendFacetChip(elements.activeGenreFilters, label, `Remove ${state.filter} filter`, () => actions.setWatchFilter('all'));
    }
    state.genres.forEach((genre) => appendFacetChip(elements.activeGenreFilters, genre, `Remove ${genre} genre filter`, () => actions.toggleGenre(genre)));
    elements.activeDirectorFilters.replaceChildren();
    elements.activeDirectorFilters.hidden = state.directors.length === 0;
    state.directors.forEach((director) => appendFacetChip(elements.activeDirectorFilters, `Director: ${director}`, `Remove ${director} director filter`, () => actions.toggleDirector(director)));
    elements.activeSourceListFilters.replaceChildren();
    elements.activeSourceListFilters.hidden = state.sourceLists.length === 0;
    state.sourceLists.forEach((url) => {
      const label = sourceListLabel(url, sources());
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'active-genre-chip active-source-list-chip';
      chip.textContent = `List: ${label} ×`;
      chip.setAttribute('aria-label', `Remove ${label} source list filter`);
      bindChipRemoval(chip, elements.activeSourceListFilters, () => actions.toggleSourceList(url), activeChipFallback);
      elements.activeSourceListFilters.append(chip);
    });
    if (state.country) appendFacetChip(elements.activeGenreFilters, `Country: ${state.country}`, 'Remove production country filter', () => actions.setCountry(''));
    if (state.language) appendFacetChip(elements.activeGenreFilters, `Language: ${actions.languageLabel(state.language)}`, 'Remove original language filter', () => actions.setLanguage(''));
    if (state.decade !== '') appendFacetChip(elements.activeGenreFilters, `${state.decade}s`, 'Remove decade filter', () => actions.setDecade(''));
    if (state.runtime) {
      const label = state.runtime === 'under-90' ? 'Under 90 min' : state.runtime === '90-120' ? '90–120 min' : 'Over 120 min';
      appendFacetChip(elements.activeGenreFilters, label, `Remove runtime filter: ${label}`, () => actions.setRuntime(''));
    }
  }

  function syncControls() {
    elements.sortSelect.value = state.sort;
    elements.countryIndexOptions.querySelectorAll('[data-country]').forEach((button) => {
      const selected = button.dataset.country === state.country;
      button.setAttribute('aria-pressed', String(selected));
      if (selected && button.hidden) {
        elements.countryIndexSearch.value = '';
        actions.setCountryIndexExpanded(true);
      }
    });
    elements.languageIndexOptions.querySelectorAll('[data-language]').forEach((button) => {
      const selected = button.dataset.language === state.language;
      button.setAttribute('aria-pressed', String(selected));
      if (selected && button.hidden) {
        elements.languageIndexSearch.value = '';
        actions.setLanguageIndexExpanded(true);
      }
    });
    elements.posterDisplayButton.classList.toggle('is-active', state.view === 'posters');
    elements.posterDisplayButton.setAttribute('aria-pressed', String(state.view === 'posters'));
    elements.ledgerDisplayButton.classList.toggle('is-active', state.view === 'ledger');
    elements.ledgerDisplayButton.setAttribute('aria-pressed', String(state.view === 'ledger'));
    elements.decadeOptions.querySelectorAll('[data-decade]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.decade === (state.decade === '' ? '' : String(state.decade))));
    });
    elements.runtimeOptions.querySelectorAll('[data-runtime]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.runtime === state.runtime));
    });
    document.querySelectorAll('.filter-button').forEach((button) => {
      const selected = button.dataset.filter === state.filter;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    elements.genreOptions.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = state.genres.includes(input.value); });
    elements.genreFilterSummary.textContent = state.genres.length ? `All ${state.genres.length}` : 'Any';
    elements.clearGenresButton.hidden = state.genres.length === 0;
    renderSelectedGenres();
    elements.sourceListOptions.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = state.sourceLists.includes(input.value); });
    elements.sourceListFilterSummary.textContent = state.sourceLists.length ? `Any ${state.sourceLists.length}` : 'Any';
    const activeFilterCount = state.genres.length + state.directors.length + state.sourceLists.length
      + Number(Boolean(state.country)) + Number(state.decade !== '') + Number(Boolean(state.runtime));
    const totalActiveFilterCount = activeFilterCount + Number(Boolean(state.language));
    elements.catalogFilterCount.hidden = totalActiveFilterCount === 0;
    elements.catalogFilterCount.textContent = totalActiveFilterCount ? String(totalActiveFilterCount) : '';
    elements.catalogFilterCount.setAttribute('aria-label', `${totalActiveFilterCount} active ${totalActiveFilterCount === 1 ? 'filter' : 'filters'}`);
    elements.clearSourceListsButton.hidden = state.sourceLists.length === 0;
    renderSelectedSourceLists();
    renderActiveViewFilters();
  }

  return { syncControls, renderActiveViewFilters };
}
