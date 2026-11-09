import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { catalogueCsv } from '../web/catalogue-download.js';

export async function checkR2Regressions({ openFixture, baseUrl, fixture, outputDirectory }) {
  const measurements = [];
  for (const width of [320, 1440]) {
    const film = structuredClone(fixture.films.find((film) => Number.isSafeInteger(film.tmdb_id)));
    film.poster_url = 'https://image.tmdb.org/t/p/w500/r2-slow-poster.jpg';
    const snapshot = { ...fixture, films: [film], film_count: 1, displayed_film_count: 1, unwatched_count: film.watched ? 0 : 1, displayed_unwatched_count: film.watched ? 0 : 1, tmdb_match_count: 1 };
    const { context, page, errors } = await openFixture({ viewport: { width, height: 900 } });
    let release;
    let fail = true;
    const gate = new Promise((resolve) => { release = resolve; });
    try {
      await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: snapshot }));
      await context.route('**/r2-slow-poster.jpg', async (route) => {
        await gate;
        if (fail) await route.abort();
        else await route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Fe8AAAAASUVORK5CYII=', 'base64') });
      });
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.locator('#site-shell:not([hidden])').waitFor();
      await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent.startsWith('Showing'));
      await page.locator('.featured-film .film-detail-trigger').click();
      await page.locator('.film-detail-poster-trigger').click();
      release();
      await page.waitForFunction(() => document.querySelector('#poster-viewer-feedback').textContent.startsWith('Could not load'));
      await page.locator('.film-detail-poster-trigger').waitFor({ state: 'detached' });
      await page.locator('#poster-viewer-close').click();
      await page.waitForFunction(() => document.activeElement.classList.contains('film-detail-browse-posters'));
      assert.equal(await page.locator('#film-detail-dialog').evaluate((element) => element.open), true);
      if (width === 320) await page.screenshot({ path: `${outputDirectory}/r2-failed-poster-focus.png`, animations: 'disabled' });
      fail = false;
      await page.locator('#film-detail-close').click();
      await page.waitForFunction(() => !new URLSearchParams(location.search).has('film'));
      await page.locator('.featured-film .film-detail-trigger').click();
      await page.locator('.film-detail-poster-trigger').click();
      await page.waitForFunction(() => !document.querySelector('#poster-viewer-image').hidden);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.activeElement.classList.contains('film-detail-poster-trigger'));
      assert.deepEqual(errors, []);
      measurements.push({ width, removedOpenerFallsBackToBrowse: true, connectedOpenerRestored: true });
    } finally {
      release();
      await context.close();
    }
  }
  for (const width of [320, 1440]) {
    const { context, page, errors } = await openFixture({ viewport: { width, height: 900 } });
    try {
      await page.goto(`${baseUrl}/?language=es`, { waitUntil: 'domcontentloaded' });
      await page.locator('#site-shell:not([hidden])').waitFor();
      await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 1 of 1 film');
      assert.equal(await page.locator('#top-billed-title').textContent(), 'Spanish');
      assert.match(await page.locator('#results-announcement').textContent(), /original language: Spanish/);
      if (width === 320) await page.screenshot({ path: `${outputDirectory}/r2-language-heading.png`, animations: 'disabled' });
      const unknown = structuredClone(fixture);
      unknown.films.forEach((film, index) => { film.original_language = index === 0 ? '' : 'en'; });
      await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: unknown }));
      await page.goto(`${baseUrl}/?language=unknown`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 1 of 1 film');
      assert.equal(await page.locator('#top-billed-title').textContent(), 'Unknown language');
      assert.match(await page.locator('#results-announcement').textContent(), /original language: unknown/);
      const one = { ...fixture, films: [fixture.films[0]], film_count: 1, displayed_film_count: 1, unwatched_count: 0, displayed_unwatched_count: 0, tmdb_match_count: 0 };
      await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: one }));
      await page.goto(`${baseUrl}/?sort=relevance&q=+`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 1 of 1 film');
      assert.equal(await page.locator('#sort-select').inputValue(), 'rank');
      assert.equal(await page.locator('#top-billed-title').textContent(), 'Most listed');
      assert.deepEqual(errors, []);
      measurements.push({ width, languageHeading: true, languageAnnouncement: true, unknownLanguage: true, singleResultWithBlankRelevance: true });
    } finally { await context.close(); }
  }
  const retired = 'https://letterboxd.com/fixture/list/retired-festival-edition/';
  for (const width of [320, 1440]) {
    async function openSaved(page) {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.locator('#site-shell:not([hidden])').waitFor();
      await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent.startsWith('Showing'));
      await page.locator('#catalogue-tools>summary').click();
      await page.locator('#saved-views>summary').click();
    }
    {
      const { context, page, errors } = await openFixture({ viewport: { width, height: 900 } });
      try {
        await context.addInitScript((url) => localStorage.setItem('reelrank.preferences.v1', JSON.stringify({ presets: [{ name: 'Retired festival', state: { sourceLists: [url] } }] })), retired);
        await openSaved(page);
        await page.locator('#preset-list').selectOption('0');
        await page.locator('#preset-apply').click();
        await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 0 of 0 films');
        const chip = page.locator('#active-source-list-filters button');
        assert.equal(await chip.count(), 1);
        assert.ok((await chip.textContent()).includes(retired));
        assert.match(await chip.textContent(), /Unavailable list/);
        assert.ok((await page.locator('#results-announcement').textContent()).includes(retired));
        if (width === 320) { await chip.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${outputDirectory}/r2-retired-source.png`, animations: 'disabled' }); }
        await chip.click();
        await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 8 of 8 films');
        assert.deepEqual(errors, []);
        measurements.push({ width, retiredSourceVisibleRemovable: true });
      } finally { await context.close(); }
    }
    for (const action of ['apply', 'delete', 'removed']) {
      const { context, page, errors } = await openFixture({ viewport: { width, height: 900 } });
      try {
        const presets = [{ name: 'First view', state: { query: 'Third Man' } }, { name: 'Contact', state: { query: 'Arrival' } }, { name: 'Later view', state: { query: 'Roma' } }];
        await context.addInitScript((values) => { if (!localStorage.getItem('reelrank.preferences.v1')) localStorage.setItem('reelrank.preferences.v1', JSON.stringify({ presets: values })); }, presets);
        const other = await context.newPage();
        await openSaved(page);
        await openSaved(other);
        await page.locator('#preset-list').selectOption('1');
        await other.locator('#preset-list').selectOption(action === 'removed' ? '1' : '0');
        await other.locator('#preset-delete').click();
        await page.locator(action === 'delete' ? '#preset-delete' : '#preset-apply').click();
        if (action === 'apply') {
          assert.equal(await page.locator('#search-input').inputValue(), 'Arrival');
          assert.match(await page.locator('#preset-status').textContent(), /^Applied “Contact”/);
          assert.equal(await page.locator('#preset-list option:checked').textContent(), 'Contact');
        } else if (action === 'delete') {
          const names = await page.evaluate(() => JSON.parse(localStorage.getItem('reelrank.preferences.v1')).presets.map((preset) => preset.name));
          assert.deepEqual(names, ['Later view']);
          assert.match(await page.locator('#preset-status').textContent(), /^Deleted “Contact”/);
        } else {
          assert.equal(await page.locator('#search-input').inputValue(), '');
          assert.match(await page.locator('#preset-status').textContent(), /no longer available/);
          assert.equal(await page.locator('#preset-apply').isDisabled(), true);
        }
        if (width === 320 && action === 'apply') await page.screenshot({ path: `${outputDirectory}/r2-cross-tab-identity.png`, animations: 'disabled' });
        assert.deepEqual(errors, []);
        measurements.push({ width, crossTabAction: action, identityPreserved: true });
      } finally { await context.close(); }
    }
  }
  for (const width of [320, 1440]) {
    const detail = { ...fixture.films[0], title: 'Home', letterboxd_title: 'Home', year: '2019', letterboxd_year: '2019', original_title: 'Home', letterboxd_url: 'https://letterboxd.com/film/home-2019/', directors: ['Mariam Kapanadze'], overview: 'First-only restoration synopsis: Georgian animation.', tmdb_id: 91234, tmdb_url: 'https://www.themoviedb.org/movie/91234' };
    const other = { ...detail, letterboxd_url: 'https://letterboxd.com/film/home-2019-1/', liked_in: 1, watched: false };
    const snapshot = { ...fixture, films: [detail], film_count: 2, displayed_film_count: 1, unwatched_count: 1, displayed_unwatched_count: 0, tmdb_match_count: 1, ranking_csv_url: '/data/ranking-r2.csv' };
    const { context, page, errors } = await openFixture({ viewport: { width, height: 900 } });
    try {
      await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: snapshot }));
      await context.route('**/data/ranking-r2.csv', (route) => route.fulfill({ contentType: 'text/csv', body: catalogueCsv([detail, other]) }));
      await page.goto(`${baseUrl}/?film=${encodeURIComponent(other.letterboxd_url)}`, { waitUntil: 'domcontentloaded' });
      await page.locator('#film-detail-dialog[open]').waitFor();
      await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 2 of 2 films');
      assert.equal(await page.locator('#film-detail-position').textContent(), 'Film 2 of 2');
      const copy = await page.locator('.film-detail-copy').textContent();
      assert.ok(!copy.includes(detail.overview));
      assert.ok(!copy.includes('Mariam Kapanadze'));
      if (width === 320) await page.screenshot({ path: `${outputDirectory}/r2-ranking-identity.png`, animations: 'disabled' });
      await page.locator('#film-detail-previous').click();
      assert.ok((await page.locator('.film-detail-copy').textContent()).includes(detail.overview));
      assert.deepEqual(errors, []);
      measurements.push({ width, distinctRankingUrlPreservesIdentity: true, matchedMetadataRetained: true });
    } finally { await context.close(); }
  }
  await writeFile(`${outputDirectory}/r2-measurements.json`, JSON.stringify(measurements, null, 2));
  console.log('R2 media, language, saved-view and ranking identity regressions passed');
}
