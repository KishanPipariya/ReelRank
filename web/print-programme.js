export function createProgrammePrinter(dependencies) {
  const {
    printFormatSelect, printProgrammeContainer, printProgrammeTitle,
    printProgrammeUsername, printProgrammeDate, printProgrammeContext,
    printProgrammeFilms, topBilledTitle, profileUsername, searchInput,
    getCurrentMatchingFilms, getFilms, getState, getAvailableSourceLists,
    getSnapshotRefreshedAt, compareFilms, formatEditionDate, languageNameFor,
  } = dependencies;

  function buildPrintProgramme() {
    const state = getState();
    const currentMatchingFilms = getCurrentMatchingFilms();
    const films = getFilms();
    const availableSourceLists = getAvailableSourceLists();
    const snapshotRefreshedAt = getSnapshotRefreshedAt();
    const readerEdition = printFormatSelect.value === 'reader';
    printProgrammeContainer.classList.toggle('print-programme-reader', readerEdition);
    document.querySelector('#print-programme-kicker').textContent = readerEdition
      ? 'ReelRank · Reader’s edition'
      : 'ReelRank · Catalogue edition';
    const filmsForProgramme = [...currentMatchingFilms].sort((left, right) => compareFilms(left, right, 'year-oldest'));
    printProgrammeTitle.textContent = topBilledTitle.textContent || 'ReelRank film selection';
    printProgrammeUsername.textContent = profileUsername.textContent;
    printProgrammeDate.textContent = formatEditionDate(snapshotRefreshedAt);
    printProgrammeDate.dateTime = snapshotRefreshedAt;
    const activeFilters = [
      state.filter === 'all' ? '' : `${state.filter} films`,
      state.directors.length ? `directors: ${state.directors.join(' / ')}` : '',
      state.sourceLists.length ? `liked lists: ${state.sourceLists.map((url) => availableSourceLists.find((item) => item.url === url)?.label).filter(Boolean).join(' / ')}` : '',
      state.country ? `country: ${state.country}` : '',
      state.language ? `original language: ${state.language === 'unknown' ? 'unknown' : languageNameFor(state.language)}` : '',
      state.decade !== '' ? `decade: ${state.decade}s` : '',
      state.runtime ? `runtime: ${state.runtime === 'under-90' ? 'under 90 min' : state.runtime === '90-120' ? '90–120 min' : 'over 120 min'}` : '',
      state.genres.length ? `genres: ${state.genres.join(' / ')}` : '',
      searchInput.value.trim() ? `search: ${searchInput.value.trim()}` : '',
    ].filter(Boolean);
    const selectedView = activeFilters.length ? `Selected view: ${activeFilters.join(' · ')}` : 'Full catalogue';
    printProgrammeContext.textContent = `${filmsForProgramme.length} ${filmsForProgramme.length === 1 ? 'film' : 'films'} · Arranged by release year · ${selectedView}`;
    printProgrammeFilms.replaceChildren();

    if (!filmsForProgramme.length) {
      const empty = document.createElement('p');
      empty.className = 'print-programme-empty';
      empty.textContent = 'No films match this selection.';
      printProgrammeFilms.append(empty);
      return;
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
      catalogueNumber.textContent = `No. ${String(films.indexOf(film) + 1).padStart(3, '0')}`;
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
      if (Number.isInteger(film.runtime_minutes) && film.runtime_minutes > 0) facts.push(`${film.runtime_minutes} min`);
      const language = typeof film.original_language === 'string' ? film.original_language.trim() : '';
      const originalTitle = typeof film.original_title === 'string' ? film.original_title.trim() : '';
      const isNonEnglish = language && language.toLocaleLowerCase().split('-')[0] !== 'en';
      const hasDistinctOriginalTitle = originalTitle && originalTitle.localeCompare(film.title || '', undefined, { sensitivity: 'accent' }) !== 0;
      if (isNonEnglish && hasDistinctOriginalTitle) facts.push(`Original title: ${originalTitle}`);
      if (isNonEnglish) facts.push(`Original language: ${languageNameFor(language)}`);
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
      if (readerEdition && typeof film.overview === 'string' && film.overview.trim()) {
        const synopsis = document.createElement('p');
        synopsis.className = 'print-film-synopsis';
        const overview = film.overview.trim();
        if (overview.length <= 260) synopsis.textContent = overview;
        else {
          const excerpt = overview.slice(0, 260);
          const lastSpace = excerpt.lastIndexOf(' ');
          synopsis.textContent = `${excerpt.slice(0, lastSpace > 180 ? lastSpace : 260).replace(/[.,;:!?]$/, '')}…`;
        }
        entry.append(synopsis);
      }
      yearList.append(entry);
    });
  }

  return function printProgramme() {
    buildPrintProgramme();
    window.print();
  };
}
