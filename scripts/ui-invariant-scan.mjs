import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { catalogueCsv } from '../web/catalogue-download.js';

const baseUrl = process.env.SITE_URL || 'http://127.0.0.1:4173';
const output = process.env.INVARIANT_OUTPUT || '/tmp/reelrank-ui-invariants';
const fixture = JSON.parse(await readFile(new URL('../tests/fixtures/browser-snapshot.json', import.meta.url), 'utf8'));
const local = process.argv.includes('--local');
const requested = process.argv.slice(2).filter((value) => value !== '--local').map(Number);
await mkdir(output, { recursive: true });

async function settled(page) {
  await page.locator('#site-shell:not([hidden])').waitFor();
  await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent.startsWith('Showing'));
}

async function inspectRankingTitles({ context, page, width }) {
  const snapshot = { ...fixture, film_count: 10, unwatched_count: fixture.unwatched_count + 2,
    ranking_csv_url: '/data/ranking-invariant.csv', ranking_csv_escaped_apostrophes: true };
  const csv = catalogueCsv(fixture.films).trimEnd()
    + `\r\n9,"'  + One",2010,no,0,https://letterboxd.com/film/plus-one-invariant/,\r\n10,"''=Installation",2010,no,0,https://letterboxd.com/film/installation-invariant/,\r\n`;
  await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: snapshot }));
  await context.route('**/data/ranking-invariant.csv', (route) => route.fulfill({ contentType: 'text/csv', body: csv }));
  await page.goto(`${baseUrl}/?view=ledger`, { waitUntil: 'domcontentloaded' });
  await settled(page);
  await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 10 of 10 films');
  const titles = await page.locator('#film-ledger-rows .ledger-film-title').allTextContents();
  assert.deepEqual(titles.slice(-2), ['  + One', "'=Installation"]);
  const lastTitle = page.locator('#film-ledger-rows .ledger-film-title').last();
  await lastTitle.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/ranking-titles-${width}.png`, animations: 'disabled' });
}

async function inspectViewRoundTrip({ page, width }) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await settled(page);
  await page.locator('#catalogue-tools>summary').click();
  await page.locator('#saved-views>summary').click();
  await page.locator('.saved-view-portability>summary').click();
  const state = {
    query: ' Arrival ', language: ' en ', genres: [' ', 'Science Fiction', 'Science Fiction'],
    directors: [' ', 'Denis Villeneuve'], country: ' ', decade: 10000, view: 'ledger',
  };
  await page.locator('#preset-import-file').setInputFiles({
    name: 'arrival-view.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, presets: [{ name: 'Arrival selection', state }] })),
  });
  await page.waitForFunction(() => document.querySelector('#preset-status').textContent.includes('Imported 1 saved view'));
  await page.locator('#preset-list').selectOption('0');
  await page.locator('#preset-apply').click();
  const one = () => page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 1 of 1 film');
  await one();
  const urlState = () => {
    const params = new URL(page.url()).searchParams;
    params.sort();
    return params.toString();
  };
  const applied = urlState();
  const params = new URLSearchParams(applied);
  assert.equal(params.get('q'), 'Arrival');
  assert.equal(params.get('language'), 'en');
  assert.deepEqual(params.getAll('genre'), ['Science Fiction']);
  assert.deepEqual(params.getAll('director'), ['Denis Villeneuve']);
  assert.equal(params.has('country') || params.has('decade'), false);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await one();
  assert.equal(urlState(), applied);
  await page.goBack();
  await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 8 of 8 films');
  await page.goForward();
  await one();
  assert.equal(urlState(), applied);
  await page.locator('#collection-title').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/view-round-trip-${width}.png`, animations: 'disabled' });
}

async function deferRanking(context, detail = fixture) {
  const extra = { title: 'The Festival Archive', year: '2019', watched: false, liked_in: 1,
    letterboxd_url: 'https://letterboxd.com/film/the-festival-archive/', lists: [] };
  const snapshot = { ...detail, film_count: 9, unwatched_count: detail.unwatched_count + 1,
    ranking_csv_url: '/data/ranking-invariant-delayed.csv' };
  const { promise, resolve } = Promise.withResolvers();
  await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: snapshot }));
  await context.route('**/data/ranking-invariant-delayed.csv', async (route) => {
    await promise;
    await route.fulfill({ contentType: 'text/csv', body: catalogueCsv([...fixture.films, extra]) });
  });
  return resolve;
}

async function inspectHistoryAlias({ context, page, width }) {
  const detail = structuredClone(fixture);
  detail.films[0].letterboxd_url = 'https://www.letterboxd.com/film/the-third-man';
  const release = await deferRanking(context, detail);
  try {
    await page.goto(`${baseUrl}/?view=ledger`, { waitUntil: 'domcontentloaded' });
    await settled(page);
    const opener = page.locator('#film-ledger-rows .film-detail-trigger').first();
    await opener.focus();
    await opener.press('Enter');
    await page.locator('#film-detail-dialog[open]').waitFor();
    assert.equal(await page.locator('#film-detail-position').textContent(), 'Film 1 of 8');
    const url = page.url();
    assert.equal(new URL(url).searchParams.get('film'), detail.films[0].letterboxd_url);
    release();
    await page.waitForFunction(() => document.querySelector('#film-detail-position')?.textContent === 'Film 1 of 9');
    assert.equal(await page.locator('#film-detail-next').isEnabled(), true);
    await page.goBack();
    await page.waitForFunction(() => !document.querySelector('#film-detail-dialog').open
      && document.activeElement === document.querySelector('#film-ledger-rows .film-detail-trigger'));
    await page.goForward();
    await page.locator('#film-detail-dialog[open]').waitFor();
    assert.equal(await page.locator('#film-detail-title').textContent(), 'The Third Man');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#film-detail-position')?.textContent === 'Film 1 of 9');
    assert.equal(await page.locator('#film-detail-title').textContent(), 'The Third Man');
    await page.screenshot({ path: `${output}/history-alias-${width}.png`, animations: 'disabled' });
    await page.goto(`${baseUrl}/?view=ledger`, { waitUntil: 'domcontentloaded' });
    await settled(page);
    const arrival = page.getByRole('link', { name: 'Read film details for Arrival', exact: true }).filter({ visible: true });
    await arrival.focus();
    await arrival.press('Enter');
    await page.getByRole('button', { name: 'Browse posters for Arrival' }).click();
    await page.locator('#poster-viewer-dialog[open]').waitFor();
    await page.goBack();
    await page.waitForFunction(() => !document.querySelector('#film-detail-dialog').open
      && !document.querySelector('#poster-viewer-dialog').open
      && document.activeElement?.getAttribute('aria-label') === 'Read film details for Arrival');
    await page.screenshot({ path: `${output}/nested-history-${width}.png`, animations: 'disabled' });
  } finally { release(); }
}

async function inspectAsyncDisclosure({ context, page, width }) {
  const release = await deferRanking(context);
  try {
    await page.goto(`${baseUrl}/?director=Carol+Reed`, { waitUntil: 'domcontentloaded' });
    await settled(page);
    const summary = page.locator('.director-filmography-disclosure > summary');
    await summary.focus();
    await summary.press('Enter');
    const film = page.locator('.director-filmography-title');
    await film.focus();
    assert.equal(await film.textContent(), 'The Third Man');
    await summary.evaluate((element) => { window.originalFilmographySummary = element; });
    release();
    await page.waitForFunction(() => document.querySelector('#catalogue-data-status').dataset.state === 'complete');
    assert.equal(await summary.evaluate((element) => element.parentElement.open && element === window.originalFilmographySummary), true);
    assert.equal(await film.evaluate((element) => document.activeElement === element), true);
    assert.match(await summary.textContent(), /1 catalogue film · 1 film matches current filters/);
    await page.screenshot({ path: `${output}/filmography-refresh-${width}.png`, animations: 'disabled' });
    await film.press('Enter');
    await page.locator('#film-detail-dialog[open]').waitFor();
    assert.equal(await page.locator('#film-detail-title').textContent(), 'The Third Man');
  } finally { release(); }
}

async function inspectOutputScope({ context, page, width }) {
  const release = await deferRanking(context);
  const rows = page.locator('.print-film-entry');
  const printContext = page.locator('#print-programme-context');
  const partialScope = 'Available catalogue: 8 of 9 ranked films loaded';
  const appPrint = () => page.evaluate(() => {
    window.print = () => {};
    document.querySelector('#print-programme-button').click();
  });
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await settled(page);
    await page.pdf({ path: `${output}/print-pending-${width}.pdf` });
    assert.equal(await rows.count(), 8);
    assert.equal(await printContext.textContent(), `8 films · Arranged by release year · ${partialScope}`);
    await page.locator('#search-input').fill('Arrival');
    await appPrint();
    assert.equal(await rows.count(), 1);
    assert.equal(await rows.locator('h3').textContent(), 'Arrival');
    assert.equal(await printContext.textContent(), `1 film · Arranged by release year · Selected view: search: Arrival · ${partialScope}`);
    const link = page.locator('#ranking-download');
    assert.equal(await link.textContent(), 'Download all 9 films (CSV)');
    release();
    await page.waitForFunction(() => document.querySelector('#catalogue-data-status').dataset.state === 'complete');
    await appPrint();
    assert.equal(await rows.count(), 1);
    assert.equal(await printContext.textContent(), '1 film · Arranged by release year · Selected view: search: Arrival');
    assert.equal(await link.getAttribute('download'), '');
    const csv = await link.evaluate(async (element) => (await fetch(element.href)).text());
    assert.match(csv, /The Festival Archive/);
    assert.equal(csv.trim().split('\r\n').length, 10);
    await page.locator('#search-input').fill('');
    await page.pdf({ path: `${output}/print-complete-${width}.pdf` });
    assert.equal(await rows.count(), 9);
    assert.equal(await printContext.textContent(), '9 films · Arranged by release year · Full catalogue');
  } finally { release(); }
}

async function inspectComposedLayout({ page, width }) {
  await page.goto(`${baseUrl}/?genre=Drama&genre=Thriller&text=200&dir=rtl`, { waitUntil: 'domcontentloaded' });
  await settled(page);
  assert.deepEqual(await page.evaluate(() => ({
    direction: document.documentElement.dir, font: getComputedStyle(document.documentElement).fontSize,
    dark: matchMedia('(prefers-color-scheme: dark)').matches,
  })), { direction: 'rtl', font: '32px', dark: true });
  const active = page.locator('#active-genre-filters');
  const drama = active.getByRole('button', { name: 'Remove Drama genre filter' });
  const thriller = active.getByRole('button', { name: 'Remove Thriller genre filter' });
  await drama.focus();
  await drama.press('Enter');
  assert.deepEqual(new URL(page.url()).searchParams.getAll('genre'), ['Thriller']);
  assert.equal(await thriller.evaluate((element) => document.activeElement === element), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: `${output}/chip-focus-composed-${width}.png`, animations: 'disabled' });
  await thriller.press('Enter');
  assert.equal(new URL(page.url()).searchParams.has('genre'), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'search-input');
  await page.goBack();
  await thriller.waitFor();
  await thriller.tap();
  assert.equal(new URL(page.url()).searchParams.has('genre'), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.evaluate(() => window.scrollTo({ top: 700, behavior: 'instant' }));
  await page.locator('#back-to-filters').waitFor();
  assert.deepEqual(await page.evaluate(() => {
    const tab = document.querySelector('#back-to-filters');
    const tabBox = tab.getBoundingClientRect();
    const resultsBox = document.querySelector('.catalogue-results').getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(tab);
    const textBox = range.getBoundingClientRect();
    return { separate: resultsBox.right < tabBox.left, labelFits: textBox.left >= tabBox.left && textBox.right <= tabBox.right };
  }), { separate: true, labelFits: true });
}

const checks = new Map([
  [1, inspectRankingTitles], [2, inspectViewRoundTrip], [3, inspectHistoryAlias],
  [4, inspectAsyncDisclosure], [5, inspectOutputScope], [6, inspectComposedLayout],
]);

async function checkFixtureInvariants(browser) {
  for (const [cycle, check] of checks) {
    if (requested.length && !requested.includes(cycle)) continue;
    for (const width of [320, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce',
        colorScheme: cycle === 6 ? 'dark' : 'light', hasTouch: cycle === 6 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await context.route('**/data/local/snapshot.json', (route) => route.fulfill({ status: 404 }));
        await context.route('**/site-config.json', (route) => route.fulfill({ json: { letterboxd_username: fixture.username } }));
        await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: fixture }));
        await context.route('https://image.tmdb.org/**', (route) => route.abort());
        await check({ context, page, width });
        assert.deepEqual(errors, []);
        console.log(`Invariant ${cycle} at ${width}px: passed`);
      } finally {
        await context.close();
      }
    }
  }
}

async function checkLocalMatrix(browser) {
  const measurements = [];
  for (const width of [320, 1440, 2560]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await context.route('https://image.tmdb.org/**', (route) => route.abort());
      await page.goto(`${baseUrl}/?data=demo`, { waitUntil: 'domcontentloaded' });
      await settled(page);
      for (const mode of ['demo', 'worst', 'empty', 'one', '100000']) {
        const control = page.locator(`[data-dev-data="${mode}"]`);
        if (await control.getAttribute('aria-pressed') !== 'true') {
          await control.click();
          await page.waitForFunction((selected) => (new URLSearchParams(location.search).get('data') || 'demo') === selected, mode);
          await settled(page);
        }
        assert.equal(await control.getAttribute('aria-pressed'), 'true');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        const shown = await page.locator('#matching-films-count').textContent();
        const total = await page.locator('#film-total').textContent();
        const cards = await page.locator('.film-card').count();
        if (mode === 'empty') assert.equal(total, '0');
        if (mode === 'one') assert.equal(total, '1');
        if (mode === '100000') { assert.equal(total, '100,000'); assert.equal(cards, 42); }
        measurements.push({ width, mode, shown, total, cards });
        if (mode === 'demo' || mode === 'worst') {
          await page.screenshot({ path: `${output}/local-${mode}-${width}.png`, animations: 'disabled' });
        }
        console.log(`Local ${mode} at ${width}px: ${shown}`);
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  await writeFile(`${output}/local-matrix.json`, JSON.stringify(measurements, null, 2) + '\n');
}

const browser = await chromium.launch();
try {
  if (local) await checkLocalMatrix(browser);
  else await checkFixtureInvariants(browser);
} finally {
  await browser.close();
}
