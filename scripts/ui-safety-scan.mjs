import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.SITE_URL || 'http://127.0.0.1:4173';
const evidence = process.env.SAFETY_OUTPUT || '/tmp/reelrank-ui-safety';
const fixture = JSON.parse(await readFile(new URL('../tests/fixtures/browser-snapshot.json', import.meta.url), 'utf8'));

async function settled(page) {
  await page.locator('#site-shell:not([hidden])').waitFor();
  await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent.startsWith('Showing'));
}

async function checkOpener({ context, page, width }) {
  await page.goto(`${baseUrl}/?view=ledger`);
  await settled(page);
  const opener = page.locator('#film-ledger-rows button').filter({ hasText: 'list appearance' }).first();
  await opener.focus();
  await opener.press('Enter');
  const dialog = page.locator('#film-detail-dialog');
  await dialog.locator('.film-note-sources:focus').waitFor();
  await page.goBack();
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement !== document.body);
  const focus = await page.evaluate(() => ({ tag: document.activeElement.tagName, label: document.activeElement.getAttribute('aria-label') }));
  await page.screenshot({ path: `${evidence}/source-opener-${width}.png`, animations: 'disabled' });
  assert.equal(focus.tag, 'BUTTON', JSON.stringify(focus));
  assert.match(focus.label, /source lists that include The Third Man/);
  await page.goForward();
  await dialog.waitFor();
  await dialog.locator('#film-detail-close').press('Enter');
  await page.waitForFunction(() => document.activeElement?.matches('#film-ledger-rows .ledger-film-count'));

  const snapshot = structuredClone(fixture);
  const arrival = snapshot.films.find((film) => film.title === 'Arrival');
  arrival.letterboxd_url = '';
  snapshot.films.push({ ...arrival, title: 'Arrival: Festival Cut', overview: 'The earlier festival edition.' });
  for (const field of ['film_count', 'displayed_film_count', 'unwatched_count', 'displayed_unwatched_count', 'tmdb_match_count']) snapshot[field] += 1;
  await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: snapshot }));
  await page.goto(`${baseUrl}/?view=ledger`);
  await settled(page);
  const links = ['Arrival', 'Arrival: Festival Cut'].map((title) => page.getByRole('link', { name: `Read film details for ${title}`, exact: true }));
  const filmKeys = await Promise.all(links.map(async (link) => new URL(await link.getAttribute('href')).searchParams.get('film')));
  assert.notEqual(...filmKeys);
  await links[1].press('Enter');
  await dialog.waitFor();
  await page.reload();
  await dialog.waitFor();
  assert.equal(await dialog.locator('#film-detail-title').textContent(), 'Arrival: Festival Cut');
  await page.screenshot({ path: `${evidence}/duplicate-id-${width}.png`, animations: 'disabled' });
}

async function checkFilterState({ page, width }) {
  await page.goto(`${baseUrl}/?sort=relevance&q=+`);
  await settled(page);
  const sort = page.locator('#sort-select');
  assert.equal(await sort.inputValue(), 'rank');

  await page.locator('#catalogue-tools>summary').click();
  await page.locator('#saved-views>summary').click();
  await page.locator('.saved-view-portability>summary').click();
  await page.locator('#preset-import-file').setInputFiles({
    name: 'saved-relevance.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, presets: [{ name: 'Relevance', state: { sort: 'relevance', query: ' ' } }] })),
  });
  await page.waitForFunction(() => document.querySelector('#preset-status').textContent.includes('Imported 1 saved view'));
  await page.locator('#preset-list').selectOption('0');
  await page.locator('#preset-apply').click();
  await settled(page);
  assert.equal(await sort.inputValue(), 'rank');
  assert.equal(new URL(page.url()).searchParams.has('sort'), false);
  assert.doesNotMatch(await page.locator('#results-announcement').textContent(), /Relevance/);

  await page.goto(`${baseUrl}/?q=Arrival&sort=relevance`);
  await settled(page);
  assert.equal(await sort.inputValue(), 'relevance');
  await page.locator('#search-input').press('Escape');
  await page.waitForFunction(() => !new URLSearchParams(location.search).has('q'));
  assert.equal(await sort.inputValue(), 'rank');
  assert.equal(new URL(page.url()).searchParams.has('sort'), false);

  await page.goto(`${baseUrl}/?view=ledger&dir=rtl&text=200`);
  await settled(page);
  const opener = page.getByRole('link', { name: 'Read film details for Arrival', exact: true });
  await opener.press('Enter');
  const dialog = page.locator('#film-detail-dialog');
  await dialog.getByRole('button', { name: 'Filter by Science Fiction', exact: true }).press('Enter');
  await dialog.waitFor({ state: 'hidden' });
  // Dialog close dispatches on the next rendering update.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('#collection-title').evaluate((heading) => document.activeElement === heading), true);
  assert.deepEqual(new URL(page.url()).searchParams.getAll('genre'), ['Science Fiction']);
  await page.screenshot({ path: `${evidence}/filter-focus-${width}.png`, animations: 'disabled' });
}

async function checkGenreDisclosure({ context, page, width }) {
  const genres = ['Science Fiction', 'Drama', 'Mystery', 'Thriller', 'Adventure', 'Romance', 'Fantasy', 'History'];
  for (const count of [5, 8]) {
    const snapshot = structuredClone(fixture);
    snapshot.films.find((film) => film.title === 'Arrival').genres = genres.slice(0, count);
    await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: snapshot }));
    await page.goto(`${baseUrl}/?view=ledger&dir=rtl&text=200`);
    await settled(page);
    await page.getByRole('link', { name: 'Read film details for Arrival', exact: true }).press('Enter');
    const group = page.locator('#film-detail-dialog[open] .film-detail-genres');
    const more = group.locator('.genre-tag-more');
    const visibleGenres = () => group.locator('[data-genre]').evaluateAll((tags) => tags.map((tag) => tag.dataset.genre));
    await group.waitFor();
    assert.deepEqual(await visibleGenres(), genres.slice(0, Math.min(count, 6)));
    if (count <= 6) {
      assert.equal(await more.count(), 0);
    } else {
      assert.equal(await more.getAttribute('aria-expanded'), 'false');
      await more.press('Enter');
      assert.deepEqual(await visibleGenres(), genres);
      assert.equal(await more.getAttribute('aria-expanded'), 'true');
      await more.tap();
      assert.deepEqual(await visibleGenres(), genres.slice(0, 6));
      assert.equal(await more.getAttribute('aria-expanded'), 'false');
      await more.press('Enter');
      assert.deepEqual(await visibleGenres(), genres);
      assert.equal(await more.evaluate((button) => document.activeElement === button), true);
    }
    await group.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${evidence}/genres-${count}-${width}.png`, animations: 'disabled' });
  }

  const poster = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="540"><rect width="360" height="540" fill="navy"/></svg>';
  const requests = [];
  await context.route('https://image.tmdb.org/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    return /^\/t\/p\/(w\d+|original)\/safety\.jpg$/.test(path)
      ? route.fulfill({ contentType: 'image/svg+xml', body: poster }) : route.fulfill({ status: 404 });
  });
  for (const size of ['w500', 'original']) {
    const snapshot = structuredClone(fixture);
    snapshot.films.find((film) => film.title === 'Arrival').poster_url = `https://image.tmdb.org/t/p/${size}/safety.jpg`;
    await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: snapshot }));
    await page.goto(`${baseUrl}/?view=ledger&dir=rtl&text=200`);
    await settled(page);
    await page.getByRole('link', { name: 'Read film details for Arrival', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'View poster for Arrival', exact: true }).tap();
    const zoom = page.locator('#poster-viewer-zoom');
    await page.waitForFunction(() => !document.querySelector('#poster-viewer-zoom').disabled);
    await zoom.press('Enter');
    await page.waitForFunction(() => document.querySelector('#poster-viewer-zoom').getAttribute('aria-pressed') === 'true');
    await zoom.tap();
    await page.waitForFunction(() => document.querySelector('#poster-viewer-zoom').getAttribute('aria-pressed') === 'false');
    assert.match(await page.locator('#poster-viewer-image').getAttribute('src'), /\/w500\/safety\.jpg$/);
    assert.equal(await page.locator('#poster-viewer-feedback').textContent(), '');
    assert.equal(await page.evaluate(() => Boolean(JSON.parse(localStorage.getItem('reelrank.preferences.v1') || '{}').posterChoices)), false);
  }
  assert.ok(requests.includes('/t/p/original/safety.jpg'));
  assert.ok(requests.includes('/t/p/w500/safety.jpg'));
  assert.ok(!requests.includes('/t/p/500/safety.jpg'));
  await page.screenshot({ path: `${evidence}/poster-fit-${width}.png`, animations: 'disabled' });
}

const cycles = [checkOpener, checkFilterState, checkGenreDisclosure];
const selected = process.argv.slice(2).map(Number);
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [index, check] of cycles.entries()) {
    if (selected.length && !selected.includes(index + 1)) continue;
    for (const width of [320, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 740 }, reducedMotion: 'reduce',
        colorScheme: index === 0 ? 'light' : 'dark', hasTouch: index === 2,
      });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await context.route('**/data/local/snapshot.json', (route) => route.fulfill({ status: 404 }));
        await context.route('**/site-config.json', (route) => route.fulfill({ json: { letterboxd_username: fixture.username } }));
        await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: fixture }));
        await context.route('https://image.tmdb.org/**', (route) => route.abort());
        await check({ context, page, width });
        assert.deepEqual(errors, []);
        console.log(`Safety cycle ${index + 1} at ${width}px passed`);
      } finally { await context.close(); }
    }
  }
} finally { await browser.close(); }
