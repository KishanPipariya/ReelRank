import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { catalogueCsv } from '../web/catalogue-download.js';

export async function checkR3Regressions({ openFixture, baseUrl, fixture, outputDirectory }) {
  const measurements = [];
  const directors = ['Bill Roberts', 'Paul Satterfield', 'Wilfred Jackson', 'Ben Sharpsteen', 'James Algar', 'T. Hee', 'Hamilton Luske', 'Samuel Armstrong', 'Jim Handley', 'Norman Ferguson', 'David Hand'];
  const countries = ['Denmark', 'France', 'Netherlands', 'Norway', 'Sweden', 'Finland', 'Iceland', 'United Kingdom', 'Italy', 'Belgium'];
  const film = { ...fixture.films[0], title: 'Collaborative restoration programme', directors, countries };
  const snapshot = { ...fixture, films: [film], film_count: 1, displayed_film_count: 1, unwatched_count: 0, displayed_unwatched_count: 0, tmdb_match_count: 0 };
  for (const width of [320, 1440]) {
    const { context, page, errors } = await openFixture({ viewport: { width, height: 900 } });
    try {
      await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: snapshot }));
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.locator('#site-shell:not([hidden])').waitFor();
      await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent.startsWith('Showing'));
      await page.locator('.featured-film .film-detail-trigger').click();
      const more = page.locator('.film-detail-director .director-more-button');
      await more.click();
      assert.equal(await more.evaluate((element) => element === document.activeElement), true);
      assert.match(await more.getAttribute('aria-label'), /^Show 1 more director;/);
      await more.press('Enter');
      assert.equal(await page.locator('.film-detail-director .director-filter').count(), 11);
      await more.press('Enter');
      assert.equal(await page.locator('.film-detail-director .director-filter').count(), 2);
      assert.equal(await more.evaluate((element) => element === document.activeElement), true);
      const countryMore = page.locator('.film-detail-facts .country-more-button');
      await countryMore.click();
      assert.match(await countryMore.getAttribute('aria-label'), /^Show 1 more country;/);
      await countryMore.press('Enter');
      assert.equal(await page.locator('.film-detail-facts .country-filter-button').count(), 10);
      if (width === 320) await page.screenshot({ path: `${outputDirectory}/r3-metadata-controls.png`, animations: 'disabled' });
      const three = { ...snapshot, films: [{ ...film, directors: directors.slice(0, 3) }] };
      await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: three }));
      await page.goto(`${baseUrl}/?view=ledger`, { waitUntil: 'domcontentloaded' });
      const ledgerMore = page.locator('.ledger-director-cell .director-more-button');
      await ledgerMore.waitFor();
      assert.match(await ledgerMore.getAttribute('aria-label'), /^Show 1 more director for/);
      await ledgerMore.click();
      assert.equal(await ledgerMore.evaluate((element) => element === document.activeElement), true);
      await ledgerMore.press('Enter');
      assert.equal(await page.locator('.ledger-director-cell .director-filter').count(), 2);
      assert.deepEqual(errors, []);
      measurements.push({ width, metadataFocusPreserved: true, singularDirector: true, singularCountry: true, ledgerKeyboardCollapse: true });
    } finally { await context.close(); }
  }
  const staleCases = [['sourceLists', ['https://letterboxd.com/fixture/list/retired-festival-edition/']], ['genres', ['Archive restoration']], ['directors', ['Aleksandra Wiśniewska-Kowalczyk']], ['country', 'Switzerland'], ['language', 'tl'], ['decade', 1920], ['runtime', 'over-120']];
  for (const width of [320, 1440]) {
    for (const [field, value] of staleCases) {
      const { context, page, errors } = await openFixture({ viewport: { width, height: 900 } });
      try {
        const sparse = structuredClone(fixture);
        sparse.films.forEach((film) => { film.runtime_minutes = null; });
        await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: sparse }));
        await context.addInitScript(([field, value]) => { if (!localStorage.getItem('reelrank.preferences.v1')) localStorage.setItem('reelrank.preferences.v1', JSON.stringify({ presets: [{ name: 'Previous edition', state: { [field]: value } }] })); }, [field, value]);
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
        await page.locator('#site-shell:not([hidden])').waitFor();
        await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent.startsWith('Showing'));
        await page.locator('#catalogue-tools>summary').click();
        await page.locator('#saved-views>summary').click();
        await page.locator('#preset-list').selectOption('0');
        await page.locator('#preset-apply').click();
        await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 0 of 0 films');
        const selectedUrl = page.url();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 0 of 0 films');
        assert.equal(page.url(), selectedUrl);
        const chip = page.locator('.active-genre-chip');
        assert.equal(await chip.count(), 1);
        if (width === 320 && field === 'sourceLists') await chip.screenshot({ path: `${outputDirectory}/r3-persisted-source.png`, animations: 'disabled' });
        await chip.click();
        await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 8 of 8 films');
        await page.goBack();
        await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 0 of 0 films');
        assert.equal(await page.locator('.active-genre-chip').count(), 1);
        assert.deepEqual(errors, []);
        measurements.push({ width, staleFacet: field, reloadPreserves: true, removable: true, backPreserves: true });
      } finally { await context.close(); }
    }
    const { context, page } = await openFixture({ viewport: { width, height: 900 } });
    try {
      await page.goto(`${baseUrl}/?list=${encodeURIComponent('https://letterboxd.com/film/not-a-list/')}`, { waitUntil: 'domcontentloaded' });
      await page.locator('#site-shell:not([hidden])').waitFor();
      await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 8 of 8 films');
      assert.equal(new URL(page.url()).searchParams.has('list'), false);
    } finally { await context.close(); }
  }
  for (const width of [320, 1440]) {
    const films = fixture.films.slice(0, 2).map((film, index) => ({ ...film, title: 'Home', letterboxd_title: 'Home', year: '2019', letterboxd_year: '2019', original_title: 'Home', letterboxd_url: '', tmdb_id: null, tmdb_url: '', directors: [index ? 'Second restoration team' : 'First restoration team'], overview: index ? 'Second-only archive synopsis.' : 'First-only archive synopsis.' }));
    const duplicateSnapshot = { ...fixture, films, film_count: 2, displayed_film_count: 2, unwatched_count: films.filter((film) => !film.watched).length, displayed_unwatched_count: films.filter((film) => !film.watched).length, tmdb_match_count: 0 };
    const { context, page, errors } = await openFixture({ viewport: { width, height: 900 } });
    try {
      await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: duplicateSnapshot }));
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.locator('#site-shell:not([hidden])').waitFor();
      await page.locator('.film-card .film-detail-trigger').first().click();
      assert.equal(await page.locator('#film-detail-position').textContent(), 'Film 2 of 2');
      const key = new URL(page.url()).searchParams.get('film');
      const share = await page.locator('.film-detail-share-url').inputValue();
      assert.equal(new URL(share).searchParams.get('film'), key);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('#film-detail-dialog[open]').waitFor();
      assert.equal(await page.locator('#film-detail-position').textContent(), 'Film 2 of 2');
      assert.ok((await page.locator('.film-detail-copy').textContent()).includes('Second-only'));
      await page.goto(share, { waitUntil: 'domcontentloaded' });
      await page.locator('#film-detail-dialog[open]').waitFor();
      assert.equal(await page.locator('#film-detail-position').textContent(), 'Film 2 of 2');
      if (width === 320) await page.screenshot({ path: `${outputDirectory}/r3-local-film-link.png`, animations: 'disabled' });
      const identical = { ...duplicateSnapshot, films: [films[0], { ...films[0] }], unwatched_count: 0, displayed_unwatched_count: 0 };
      await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: identical }));
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.locator('.film-card .film-detail-trigger').first().click();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('#film-detail-dialog[open]').waitFor();
      assert.equal(await page.locator('#film-detail-position').textContent(), 'Film 2 of 2');
      assert.deepEqual(errors, []);
      measurements.push({ width, distinctLocalLinks: true, copiedLinkReload: true, identicalOccurrenceDistinct: true });
    } finally { await context.close(); }
  }
  for (const width of [320, 1440]) {
    for (const openEarly of [false, true]) {
      const film = { ...fixture.films.find((film) => Number.isSafeInteger(film.tmdb_id)), poster_url: 'https://image.tmdb.org/t/p/w500/r3-original.jpg' };
      const other = { ...film, title: 'Sparse companion', letterboxd_title: 'Sparse companion', letterboxd_url: 'https://letterboxd.com/film/r3-companion/', watched: true };
      const partial = { ...fixture, films: [film], film_count: 2, displayed_film_count: 1, unwatched_count: film.watched ? 0 : 1, displayed_unwatched_count: film.watched ? 0 : 1, tmdb_match_count: 1, ranking_csv_url: '/data/ranking-r3-poster.csv' };
      const { context, page, errors } = await openFixture({ viewport: { width, height: 900 } });
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      try {
        const alternate = 'https://image.tmdb.org/t/p/w500/r3-alternate.jpg';
        await context.addInitScript(({ id, alternate }) => { if (!localStorage.getItem('reelrank.preferences.v1')) localStorage.setItem('reelrank.preferences.v1', JSON.stringify({ posterChoices: { [id]: alternate } })); }, { id: film.tmdb_id, alternate });
        await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: partial }));
        await context.route('**/ranking-r3-poster.csv', async (route) => { await gate; await route.fulfill({ contentType: 'text/csv', body: catalogueCsv([film, other]) }); });
        await context.route('https://image.tmdb.org/**', (route) => route.fulfill({ contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="${route.request().url().includes('alternate') ? '#164c45' : '#9c421d'}"/><text x="200" y="310" text-anchor="middle" fill="white" font-size="36">${route.request().url().includes('alternate') ? 'ALTERNATE' : 'ORIGINAL'}</text></svg>` }));
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
        await page.locator('#site-shell:not([hidden])').waitFor();
        await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent.startsWith('Showing'));
        if (openEarly) {
          await page.locator('.featured-film .film-detail-trigger').click();
          await page.locator('.film-note-synopsis').evaluate((element) => { window.r3Synopsis = element; });
        }
        release();
        await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 2 of 2 films');
        if (!openEarly) await page.locator('.featured-film .film-detail-trigger').click();
        else assert.equal(await page.locator('.film-note-synopsis').evaluate((element) => element === window.r3Synopsis), true);
        await page.locator('.film-detail-gallery-button').filter({ hasText: 'Reset poster' }).click();
        await page.waitForFunction(() => document.querySelector('.film-detail-poster img')?.getAttribute('src').endsWith('/r3-original.jpg'));
        assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('reelrank.preferences.v1')).posterChoices), {});
        if (openEarly) assert.equal(await page.locator('.film-note-synopsis').evaluate((element) => element === window.r3Synopsis), true);
        await page.locator('.film-detail-poster-trigger').click();
        await page.waitForFunction(() => document.querySelector('#poster-viewer-caption').dataset.posterUrl.endsWith('/r3-original.jpg'));
        await page.locator('#poster-viewer-close').click();
        if (width === 320 && openEarly) await page.screenshot({ path: `${outputDirectory}/r3-poster-reset.png`, animations: 'disabled' });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('#film-detail-dialog[open]').waitFor();
        await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 2 of 2 films');
        assert.ok((await page.locator('.film-detail-poster img').getAttribute('src')).endsWith('/r3-original.jpg'));
        assert.deepEqual(errors, []);
        measurements.push({ width, openEarly, resetRestoresOriginal: true, previewUsesOriginal: true, reloadPreservesReset: true });
      } finally { release(); await context.close(); }
    }
  }
  await writeFile(`${outputDirectory}/r3-measurements.json`, JSON.stringify(measurements, null, 2));
  console.log('R3 metadata, stale URL state, local links and sidecar poster reset passed');
}
