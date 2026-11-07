import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import { catalogueCsv } from '../web/catalogue-download.js';
import { checkRetestRegressions } from './ui-stress-regressions.mjs';

const require = createRequire(import.meta.url);
const baseUrl = process.env.SITE_URL || 'http://127.0.0.1:4173';
const fixture = JSON.parse(await readFile(new URL('../tests/fixtures/browser-snapshot.json', import.meta.url), 'utf8'));
const outputDirectory = '/tmp/reelrank-ui-stress-fixed';
await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
let activePage;

async function openFixture(options) {
  const context = await browser.newContext({ reducedMotion: 'reduce', ...options });
  const page = await context.newPage();
  activePage = page;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/data/local/snapshot.json', (route) => route.fulfill({ status: 404 }));
  await context.route('**/site-config.json', (route) => route.fulfill({ json: { letterboxd_username: fixture.username } }));
  await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: fixture }));
  await context.route('https://image.tmdb.org/**', (route) => route.abort());
  return { context, page, errors };
}

async function settled(page) {
  await page.locator('#site-shell:not([hidden])').waitFor();
  await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent.startsWith('Showing'));
}

async function fits(locator, label) {
  const geometry = await locator.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  assert.ok(geometry.scroll <= geometry.client + 1, `${label} overflows: ${JSON.stringify(geometry)}`);
}

async function checkWorstCase(page, name) {
  const card = page.locator('#film-grid > .film-card').last();
  await card.scrollIntoViewIfNeeded();
  const titleWidth = await card.locator('.film-title').evaluate((element) => element.getBoundingClientRect().width);
  assert.ok(titleWidth >= 100, `${name}: long year leaves the film title readable`);
  await fits(card.locator('.film-title-row'), `${name}: year row`);
  await fits(card.locator('.film-year'), `${name}: year`);
  await fits(card.locator('.film-count'), `${name}: appearance count`);
  await fits(card.locator('.film-count strong'), `${name}: complete number`);
  assert.equal(await card.locator('.film-count strong').textContent(), Number.MAX_SAFE_INTEGER.toLocaleString());
  const tag = card.locator('.genre-tag-long');
  const genre = await tag.getAttribute('title');
  assert.equal(genre.length, 512);
  assert.ok(await tag.evaluate((element) => element.getBoundingClientRect().height) <= 52, `${name}: compact genre chip`);
  assert.equal(await tag.locator('.genre-tag-label').textContent(), genre);
  if (name === '320') await page.screenshot({ path: `${outputDirectory}/card-320.png`, animations: 'disabled' });

  await card.locator('.film-detail-trigger').click();
  await fits(page.locator('#film-detail-dialog'), `${name}: detail dialog`);
  await fits(page.locator('.film-detail-score'), `${name}: detail score`);
  assert.equal(await page.locator('.film-detail-genres .genre-tag-long').textContent(), genre);
  assert.equal(await page.locator('.film-detail-genres .genre-tag-long').evaluate((element) => getComputedStyle(element).borderRadius), '0px');
  await page.locator('.film-detail-score').scrollIntoViewIfNeeded();
  if (name === '320') await page.screenshot({ path: `${outputDirectory}/score-320.png`, animations: 'disabled' });
  await page.locator('#film-detail-close').click();

  await page.locator('.featured-film .film-detail-trigger').click();
  const sourceLinks = page.locator('.film-note-sources .list-links a');
  await page.locator('.film-note-sources').evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  for (let index = 0; index < 2; index += 1) {
    await fits(sourceLinks.nth(index), `${name}: source list ${index + 1}`);
    assert.ok(await sourceLinks.nth(index).evaluate((element) => element.getBoundingClientRect().height) > 24, `${name}: full source title wraps`);
  }
  assert.notEqual(await sourceLinks.nth(0).textContent(), await sourceLinks.nth(1).textContent());
  if (name === '320') await page.screenshot({ path: `${outputDirectory}/sources-320.png`, animations: 'disabled' });
  await page.locator('#film-detail-close').click();

  await page.locator('#ledger-display-button').click();
  await fits(page.locator('#film-ledger-rows .ledger-film-year').last(), `${name}: table year`);
  await fits(page.locator('.ledger-film-count.has-long-count'), `${name}: table count`);
  await page.locator('#poster-display-button').click();
}

try {
  for (const profile of [
    { name: '320', width: 320 }, { name: '1440', width: 1440 }, { name: '2560', width: 2560 },
    { name: '200-reflow', width: 720 }, { name: 'dark-320', width: 320, colorScheme: 'dark' },
    { name: 'text-200', width: 320, suffix: '&text=200' }, { name: 'rtl-320', width: 320, suffix: '&dir=rtl' },
  ]) {
    const { context, page, errors } = await openFixture({ viewport: { width: profile.width, height: 900 }, colorScheme: profile.colorScheme || 'light' });
    await page.goto(`${baseUrl}/?data=demo${profile.suffix || ''}`, { waitUntil: 'domcontentloaded' });
    await settled(page);
    for (const mode of ['demo', 'worst', 'empty', 'one', '100000']) {
      const control = page.locator(`[data-dev-data="${mode}"]`);
      if (await control.getAttribute('aria-pressed') !== 'true') {
        await control.click();
        await page.waitForFunction((selected) => (new URLSearchParams(location.search).get('data') || 'demo') === selected, mode);
        await settled(page);
      }
      assert.equal(await control.getAttribute('aria-pressed'), 'true');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${profile.name}/${mode}: page fits`);
      if (mode === 'worst') await checkWorstCase(page, profile.name);
      if (mode === 'empty') assert.match(await page.locator('#status-message-copy').textContent(), /No films are available/);
      if (mode === 'one') {
        assert.equal(await page.locator('#film-total-label').textContent(), 'film found');
        assert.equal(await page.locator('#list-total-label').textContent(), 'liked list scanned');
        assert.match(await page.locator('#collection-scope').textContent(), /1 detailed film\./);
        assert.match(await page.locator('#collection-footnote').textContent(), /Browsing 1 ranked film\./);
      }
      if (mode === '100000') assert.equal(await page.locator('.film-card').count(), 42);
      console.log(`${profile.name}/${mode}: passed`);
    }

    const filmUrl = 'https://letterboxd.com/film/reelrank-stress-99999/';
    await page.goto(`${baseUrl}/?data=100000${profile.suffix || ''}&film=${encodeURIComponent(filmUrl)}`, { waitUntil: 'domcontentloaded' });
    await settled(page);
    await page.locator('#film-detail-dialog[open]').waitFor();
    assert.equal(await page.locator('#film-detail-position').textContent(), 'Film 99,999 of 100,000');
    await fits(page.locator('#film-detail-dialog'), `${profile.name}: large shared-film dialog`);
    await page.locator('#film-detail-next').click();
    assert.equal(await page.locator('#film-detail-position').textContent(), 'Film 100,000 of 100,000');
    assert.equal(await page.locator('#film-detail-next').isDisabled(), true);
    await page.locator('#film-detail-previous').click();
    assert.equal(await page.locator('#film-detail-title').textContent(), 'Stress case film 99999');
    await page.locator('#film-detail-close').click();
    await page.waitForFunction(() => !new URLSearchParams(location.search).has('film'));
    assert.equal(await page.evaluate(() => document.activeElement.id), 'collection-title');
    if (['320', 'dark-320'].includes(profile.name)) {
      await page.goto(`${baseUrl}/?data=worst`, { waitUntil: 'domcontentloaded' });
      await settled(page);
      await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
      const violations = await page.evaluate(async () => (await axe.run(document, { exclude: [['#dev-data-switch']] })).violations.map((violation) => violation.id));
      assert.deepEqual(violations, [], `${profile.name}: axe`);
    }
    assert.deepEqual(errors, [], `${profile.name}: no uncaught browser errors`);
    await context.close();
  }

  // A late full ranking must update navigation while preserving reading content and focus.
  const { context, page, errors } = await openFixture({ viewport: { width: 1440, height: 900 } });
  const rankedFilms = Array.from({ length: 6001 }, (_, index) => fixture.films[index] || {
    title: `Background ranking film ${index}`, year: '2000', watched: false, liked_in: 1,
    letterboxd_url: `https://letterboxd.com/film/background-ranking-${index}/`, lists: [],
  });
  const snapshot = { ...fixture, film_count: rankedFilms.length, unwatched_count: rankedFilms.filter((film) => !film.watched).length, ranking_csv_url: '/data/ranking-stress.csv' };
  let releaseRanking;
  const rankingGate = new Promise((resolve) => { releaseRanking = resolve; });
  await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: snapshot }));
  await context.route('**/data/ranking-stress.csv', async (route) => {
    await rankingGate;
    await route.fulfill({ contentType: 'text/csv', body: catalogueCsv(rankedFilms) });
  });
  await page.goto(`${baseUrl}/?film=${encodeURIComponent(fixture.films[0].letterboxd_url)}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#film-detail-dialog[open]').waitFor();
  assert.equal(await page.locator('#film-detail-position').textContent(), `Film 1 of ${fixture.films.length}`);
  await page.locator('.film-note-synopsis').evaluate((element) => { window.stressSynopsis = element; });
  await page.locator('#film-detail-next').focus();
  const scrollBefore = await page.locator('#film-detail-dialog').evaluate((element) => element.scrollTop);
  releaseRanking();
  await page.waitForFunction(() => document.querySelector('#film-detail-position').textContent === 'Film 1 of 6,001');
  assert.equal(await page.locator('.film-note-synopsis').evaluate((element) => element === window.stressSynopsis), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'film-detail-next');
  assert.ok(Math.abs(await page.locator('#film-detail-dialog').evaluate((element) => element.scrollTop) - scrollBefore) < 2);
  assert.deepEqual(errors, []);
  await page.locator('.film-detail-genres .genre-tag').first().click();
  await page.waitForFunction(() => !new URLSearchParams(location.search).has('film'));
  assert.equal(await page.locator('#film-detail-dialog').evaluate((element) => element.open), false);
  assert.ok(new URL(page.url()).searchParams.has('genre'));
  await context.close();
  console.log('Background ranking refresh preserves reading content, focus, and position: passed');
  await checkRetestRegressions({ openFixture, baseUrl, fixture, outputDirectory, fits });
} catch (error) {
  await activePage?.screenshot({ path: `${outputDirectory}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
