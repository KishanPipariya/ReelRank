import { sourceListLabel } from './source-list-label.js';
import { graphemePrefix } from './display-text.js';
import { runtimeLabelFor } from './runtime-label.js';

const printConfirmationThreshold = 1000;
const maxPrintProgrammeFilms = 10000;

export function createProgrammePrinter(dependencies) {
  const {
    printFormatSelect, printProgrammeContainer, printProgrammeTitle,
    printProgrammeUsername, printProgrammeDate, printProgrammeContext,
    printProgrammeFilms, printProgrammeStatus, profileUsername, searchInput,
    getSelection, rankForFilm, getState, getAvailableSourceLists,
    getSnapshotRefreshedAt, compareFilms, formatEditionDate, languageNameFor,
  } = dependencies;

  function showPrintGuidance(count, message) {
    printProgrammeTitle.textContent = 'Print preview not built';
    printProgrammeContext.textContent = `${count.toLocaleString()} films · ${message}`;
    printProgrammeFilms.replaceChildren();
    const guidance = document.createElement('p');
    guidance.className = 'print-programme-empty';
    guidance.textContent = message;
    printProgrammeFilms.append(guidance);
  }

  function buildPrintProgramme({ confirmLarge = false } = {}) {
    const state = getState();
    const query = searchInput.value.trim();
    const { matching, title: programmeTitle, loadedCount, rankedCount } = getSelection(query);
    if (matching.length > maxPrintProgrammeFilms) {
      const message = `Print preview is limited to ${maxPrintProgrammeFilms.toLocaleString()} films. Narrow your selection or download the catalogue CSV.`;
      printProgrammeStatus.textContent = message;
      showPrintGuidance(matching.length, message);
      return false;
    }
    if (matching.length > printConfirmationThreshold) {
      if (!confirmLarge) {
        const message = `Use Print selection to confirm a ${matching.length.toLocaleString()}-film print preview.`;
        printProgrammeStatus.textContent = message;
        showPrintGuidance(matching.length, message);
        return false;
      }
      const count = matching.length.toLocaleString();
      if (!window.confirm(`Build a print preview for ${count} films? Large print previews can use a lot of memory. Choose Cancel to narrow the selection or download the full catalogue CSV.`)) {
        printProgrammeStatus.textContent = `Print cancelled. Narrow the selection or download the catalogue CSV.`;
        showPrintGuidance(matching.length, printProgrammeStatus.textContent);
        return false;
      }
    }
    printProgrammeStatus.textContent = '';
    const availableSourceLists = getAvailableSourceLists();
    const snapshotRefreshedAt = getSnapshotRefreshedAt();
    const readerEdition = printFormatSelect.value === 'reader';
    printProgrammeContainer.classList.toggle('print-programme-reader', readerEdition);
    const filmsForProgramme = matching.sort((left, right) => compareFilms(left, right, 'year-oldest'));
    const synopsesNotLoaded = readerEdition ? filmsForProgramme.filter((film) =>
      film.detail_shard_url
      && film.detail_load_status !== 'loaded'
      && !(typeof film.overview === 'string' && film.overview.trim())
      && !(typeof film.detail_overview === 'string' && film.detail_overview.trim())).length : 0;
    const synopsisScope = synopsesNotLoaded
      ? `${synopsesNotLoaded.toLocaleString()} ${synopsesNotLoaded === 1 ? 'synopsis is' : 'synopses are'} not loaded. Open film details to include them.`
      : '';
    printProgrammeTitle.textContent = programmeTitle;
    printProgrammeUsername.textContent = profileUsername.textContent;
    printProgrammeDate.textContent = formatEditionDate(snapshotRefreshedAt);
    printProgrammeDate.dateTime = snapshotRefreshedAt;
    const activeFilters = [
      state.filter === 'all' ? '' : `${state.filter} films`,
      state.directors.length ? `directors: ${state.directors.join(' / ')}` : '',
      state.sourceLists.length ? `liked lists: ${state.sourceLists.map((url) => sourceListLabel(url, availableSourceLists)).join(' / ')}` : '',
      state.country ? `country: ${state.country}` : '',
      state.language ? `original language: ${state.language === 'unknown' ? 'unknown' : languageNameFor(state.language)}` : '',
      state.decade !== '' ? `decade: ${state.decade}s` : '',
      state.runtime ? `runtime: ${state.runtime === 'under-90' ? 'under 90 min' : state.runtime === '90-120' ? '90–120 min' : 'over 120 min'}` : '',
      state.genres.length ? `genres: ${state.genres.join(' and ')}` : '',
      query ? `search: ${query}` : '',
    ].filter(Boolean);
    const partialScope = loadedCount < rankedCount
      ? `Available catalogue: ${loadedCount.toLocaleString()} of ${rankedCount.toLocaleString()} ranked films loaded`
      : '';
    const selectedView = activeFilters.length ? `Selected view: ${activeFilters.join(' · ')}` : partialScope ? '' : 'Full catalogue';
    printProgrammeContext.textContent = [
      `${filmsForProgramme.length} ${filmsForProgramme.length === 1 ? 'film' : 'films'}`,
      'Arranged by release year', selectedView, partialScope,
      synopsisScope,
    ].filter(Boolean).join(' · ');
    printProgrammeFilms.replaceChildren();

    if (!filmsForProgramme.length) {
      const empty = document.createElement('p');
      empty.className = 'print-programme-empty';
      empty.textContent = 'No films match this selection.';
      printProgrammeFilms.append(empty);
      return true;
    }

    let currentYear = null;
    let yearList = null;
    filmsForProgramme.forEach((film) => {
      const year = film.year?.trim() || 'Year unknown';
      if (year !== currentYear) {
        const chapter = document.createElement('section');
        chapter.className = 'print-year-chapter';
        const heading = document.createElement('h2');
        heading.textContent = year;
        yearList = document.createElement('ol');
        yearList.className = 'print-year-films';
        chapter.append(heading, yearList);
        printProgrammeFilms.append(chapter);
        currentYear = year;
      }

      const entry = document.createElement('li');
      entry.className = 'print-film-entry';
      const catalogueNumber = document.createElement('span');
      catalogueNumber.className = 'print-film-number';
      catalogueNumber.textContent = `No. ${String(rankForFilm(film)).padStart(3, '0')}`;
      const details = document.createElement('div');
      details.className = 'print-film-details';
      const title = document.createElement('h3');
      title.textContent = film.title;
      const credits = document.createElement('p');
      credits.className = 'print-film-credits';
      const facts = [];
      const directors = [...new Set(Array.isArray(film.directors) ? film.directors : [])];
      if (directors.length) facts.push(`Directed by ${directors.join(', ')}`);
      const countries = [...new Set(Array.isArray(film.countries) ? film.countries : [])];
      if (countries.length) facts.push(countries.join(', '));
      if (Number.isInteger(film.runtime_minutes) && film.runtime_minutes > 0) facts.push(runtimeLabelFor(film.runtime_minutes));
      const language = typeof film.original_language === 'string' ? film.original_language.trim() : '';
      const originalTitle = typeof film.original_title === 'string' ? film.original_title.trim() : '';
      const hasNonEnglishLanguage = language && language.toLocaleLowerCase().split('-')[0] !== 'en';
      const hasDistinctOriginalTitle = originalTitle && originalTitle.localeCompare(film.title || '', undefined, { sensitivity: 'accent' }) !== 0;
      if (hasDistinctOriginalTitle) facts.push(`Original title: ${originalTitle}`);
      if (hasNonEnglishLanguage) facts.push(`Original language: ${languageNameFor(language)}`);
      if (film.watched) facts.push('Watched');
      credits.textContent = facts.join(' · ');
      details.append(title, credits);
      const score = document.createElement('p');
      score.className = 'print-film-score';
      const scoreValue = document.createElement('strong');
      const likedIn = Number(film.liked_in) || 0;
      scoreValue.textContent = likedIn.toLocaleString();
      score.append(scoreValue, ` ${likedIn === 1 ? 'list appearance' : 'list appearances'}`);
      entry.append(catalogueNumber, details, score);
      const overview = typeof film.detail_overview === 'string' && film.detail_overview.trim()
        ? film.detail_overview
        : film.overview;
      if (readerEdition && typeof overview === 'string' && overview.trim()) {
        const synopsis = document.createElement('p');
        synopsis.className = 'print-film-synopsis';
        const fullOverview = overview.trim();
        const excerpt = graphemePrefix(fullOverview, 260);
        if (excerpt === fullOverview) synopsis.textContent = fullOverview;
        else {
          const lastSpace = excerpt.lastIndexOf(' ');
          synopsis.textContent = `${(lastSpace > 180 ? excerpt.slice(0, lastSpace) : excerpt).replace(/[.,;:!?]$/, '')}…`;
        }
        entry.append(synopsis);
      }
      yearList.append(entry);
    });
    return true;
  }

  let builtForPrintButton = false;
  window.addEventListener('beforeprint', (event) => {
    if (!builtForPrintButton && !buildPrintProgramme()) event.preventDefault();
  });

  return function printProgramme() {
    if (!buildPrintProgramme({ confirmLarge: true })) return;
    builtForPrintButton = true;
    try { window.print(); }
    finally { builtForPrintButton = false; }
  };
}
