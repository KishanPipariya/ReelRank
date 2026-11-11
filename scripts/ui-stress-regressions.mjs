import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { catalogueCsv } from '../web/catalogue-download.js';

export async function checkRetestRegressions({ openFixture, baseUrl, fixture, outputDirectory, fits }) {
  const measurements = [];
  for (const profile of [
    { name: '320', width: 320 }, { name: '1440', width: 1440 }, { name: '2560', width: 2560 },
    { name: '720', width: 720 }, { name: 'dark', width: 320, colorScheme: 'dark' },
    { name: 'text200', width: 320, suffix: '&text=200' }, { name: 'rtl', width: 320, suffix: '&dir=rtl' },
  ]) {
    const { context, page, errors } = await openFixture({ viewport: { width: profile.width, height: 900 }, colorScheme: profile.colorScheme || 'light' });
    const suffix = profile.suffix || '';
    await page.goto(`${baseUrl}/?data=worst${suffix}&film=${encodeURIComponent('https://letterboxd.com/film/reelrank-stress-13/')}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#film-detail-dialog[open]').waitFor();
    const fallback = await page.locator('.film-detail-poster .poster-fallback-title').evaluate((element) => {
      const title = element.getBoundingClientRect();
      const cover = element.closest('.poster-fallback').getBoundingClientRect();
      return { height: title.height, visible: title.height > 0 && title.top >= cover.top && title.bottom <= cover.bottom };
    });
    assert.ok(fallback.visible, `${profile.name}: fallback title stays visible`);
    if (profile.name === '320') await page.screenshot({ path: `${outputDirectory}/retest-fallback-fixed.png`, animations: 'disabled' });
    if (profile.width >= 1440 || profile.colorScheme === 'dark') {
      const genre = page.locator('.film-detail-genres .genre-tag-long');
      await genre.hover();
      const contrast = await genre.evaluate((element) => {
        const luminance = (color) => {
          const values = color.match(/[\d.]+/g).slice(0, 3).map((value) => {
            const n = Number(value) / 255;
            return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
          });
          return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
        };
        const values = [luminance(getComputedStyle(element).color), luminance(getComputedStyle(element.closest('dialog')).backgroundColor)].sort((a, b) => b - a);
        return (values[0] + .05) / (values[1] + .05);
      });
      assert.ok(contrast >= 4.5, `${profile.name}: long-genre hover contrast ${contrast}`);
      measurements.push({ profile: profile.name, hoverContrast: contrast });
      if (profile.name === '1440' || profile.name === 'dark') await page.screenshot({ path: `${outputDirectory}/retest-hover-${profile.name}-fixed.png`, animations: 'disabled' });
    }
    await page.locator('#film-detail-close').click();
    await page.waitForFunction(() => !new URLSearchParams(location.search).has('film'));
    const longFilm = page.locator('#film-grid > .film-card').filter({ hasText: 'The Long Journey: A Complete Chronicle' }).first();
    await longFilm.locator('.film-detail-trigger').click();
    await page.locator('#film-detail-dialog').evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await page.locator('#film-detail-close').click();
    await page.waitForFunction(() => !new URLSearchParams(location.search).has('film'));
    await page.locator('.featured-film .film-detail-trigger').click();
    assert.equal(await page.locator('#film-detail-dialog').evaluate((element) => element.scrollTop), 0);
    if (profile.name === '320') await page.screenshot({ path: `${outputDirectory}/retest-reopen-fixed.png`, animations: 'disabled' });
    await page.locator('#film-detail-close').click();

    const extended = structuredClone(fixture);
    extended.films[0].countries = ['United Kingdom of Great Britain and Northern Ireland'];
    extended.refreshed_at = new Date(Date.now() + 3 * 86400000).toISOString();
    await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: extended }));
    await page.goto(`${baseUrl}/?${suffix}&film=${encodeURIComponent(extended.films[0].letterboxd_url)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#film-detail-dialog[open]').waitFor();
    await fits(page.locator('.film-detail-facts .cinephile-country-primary'), `${profile.name}: full country`);
    assert.equal(await page.locator('.film-detail-facts .cinephile-country-primary').evaluate((element) => getComputedStyle(element).whiteSpace), 'normal');
    assert.match(await page.locator('#refreshed-label').getAttribute('title'), /^Edition timestamp is in the future/);
    if (profile.name === '320') {
      await page.locator('.film-detail-facts').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${outputDirectory}/retest-country-fixed.png`, animations: 'disabled' });
    }
    await page.goto(`${baseUrl}/?data=one${suffix}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#site-shell:not([hidden])').waitFor();
    assert.equal(await page.locator('#ranking-download').textContent(), 'Download displayed 1 film (CSV)');
    assert.deepEqual(errors, []);
    measurements.push({ profile: profile.name, fallbackTitleHeight: fallback.height, newFilmScrollTop: 0, countryFits: true, futureTooltip: true, singularDownload: true });
    await context.close();
    console.log(`${profile.name}: hover, fallback, fresh-dialog, country, future-date and singular regressions passed`);
  }

  {
    const { context, page } = await openFixture({ viewport: { width: 320, height: 900 } });
    const films = Array.from({ length: 41 }, (_, index) => ({ ...fixture.films[0], title: `Archive film ${index + 1}`, letterboxd_url: `https://letterboxd.com/film/retest-archive-${index + 1}/` }));
    const snapshot = { ...fixture, films, film_count: 41, displayed_film_count: 41, unwatched_count: 0, displayed_unwatched_count: 0 };
    await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: snapshot }));
    await page.goto(`${baseUrl}/?sort=title`, { waitUntil: 'domcontentloaded' });
    await page.locator('#load-more:visible').waitFor();
    assert.equal(await page.locator('#load-more').textContent(), 'Show 1 more film · 1 left');
    const single = { ...snapshot, films: [films[0]], film_count: 1, displayed_film_count: 1, ranking_csv_url: '/data/ranking-single.csv' };
    await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: single }));
    await context.route('**/data/ranking-single.csv', (route) => route.fulfill({ contentType: 'text/csv', body: catalogueCsv(single.films) }));
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#site-shell:not([hidden])').waitFor();
    assert.equal(await page.locator('#ranking-download').textContent(), 'Download all 1 film (CSV)');
    await context.close();
    console.log('Single remaining film and full-ranking download labels passed');
  }

  {
    const { context, page, errors } = await openFixture({ viewport: { width: 320, height: 900 } });
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Fe8AAAAASUVORK5CYII=', 'base64');
    let allowRetry = false;
    let releaseLate;
    let releaseClosed;
    const lateGate = new Promise((resolve) => { releaseLate = resolve; });
    const closedGate = new Promise((resolve) => { releaseClosed = resolve; });
    await context.route('**/data/poster-galleries-fixture.json', (route) => route.fulfill({ json: {
      snapshot_refreshed_at: fixture.refreshed_at,
      galleries: { 421017: [{ path: '/retest-failed.jpg', language: 'fr' }, { path: '/retest-working.jpg', language: 'en' }, { path: '/retest-late.jpg', language: 'de' }, { path: '/retest-closed.jpg', language: 'it' }] },
    } }));
    await context.route('**/retest-working.jpg', (route) => route.fulfill({ contentType: 'image/png', body: png }));
    await context.route('**/retest-failed.jpg', (route) => allowRetry ? route.fulfill({ contentType: 'image/png', body: png }) : route.abort());
    await context.route('**/retest-late.jpg', async (route) => { await lateGate; await route.fulfill({ contentType: 'image/png', body: png }); });
    await context.route('**/retest-closed.jpg', async (route) => { await closedGate; await route.fulfill({ contentType: 'image/png', body: png }); });
    await page.goto(`${baseUrl}/?data=worst`, { waitUntil: 'domcontentloaded' });
    await page.locator('.film-card').filter({ hasText: 'Logistics' }).first().locator('.film-detail-trigger').click();
    await page.locator('.film-detail-gallery-button').filter({ hasText: 'View other posters' }).click();
    const options = page.locator('.poster-viewer-option');
    const savedChoice = () => page.evaluate(() => JSON.parse(localStorage.getItem('reelrank.preferences.v1') || '{}').posterChoices?.['421017']);
    const waitSaved = () => page.waitForFunction(() => document.querySelector('#poster-viewer-feedback').textContent === 'Poster choice saved on this device.');
    await options.nth(2).click();
    await waitSaved();
    assert.match(await savedChoice(), /retest-working.jpg$/);
    await options.nth(1).click();
    await page.waitForFunction(() => document.querySelector('#poster-viewer-feedback').textContent.startsWith('Could not load'));
    assert.match(await savedChoice(), /retest-working.jpg$/);
    assert.match(await page.locator('#poster-viewer-image').getAttribute('src'), /retest-working.jpg$/);
    assert.equal(await page.locator('#poster-viewer-retry').isVisible(), true);
    assert.equal(await options.nth(1).locator('.poster-viewer-thumbnail-fallback').isVisible(), true);
    assert.equal(await options.locator('img').evaluateAll((images) => images.filter((image) => image.checkVisibility() && image.complete && !image.naturalWidth).length), 0);
    await page.screenshot({ path: `${outputDirectory}/retest-poster-error-fixed.png`, animations: 'disabled' });
    allowRetry = true;
    await page.locator('#poster-viewer-retry').click();
    await waitSaved();
    assert.match(await savedChoice(), /retest-failed.jpg$/);
    assert.equal(await options.nth(1).locator('.poster-viewer-thumbnail-fallback').isHidden(), true);
    await options.nth(3).click();
    await options.nth(2).click();
    await waitSaved();
    const lateResponse = page.waitForResponse((response) => response.url().endsWith('/retest-late.jpg'));
    releaseLate();
    await lateResponse;
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.match(await savedChoice(), /retest-working.jpg$/);
    await options.nth(4).click();
    await page.locator('#poster-viewer-close').click();
    await page.locator('#poster-viewer-dialog').waitFor({ state: 'hidden' });
    const closedResponse = page.waitForResponse((response) => response.url().endsWith('/retest-closed.jpg'));
    releaseClosed();
    await closedResponse;
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.match(await savedChoice(), /retest-working.jpg$/);
    assert.deepEqual(errors, []);
    measurements.push({ posterFailurePreservesChoice: true, retryRecovers: true, lateSelectionIgnored: true, closedViewerDoesNotSave: true });
    await context.close();
    console.log('Failed poster, successful retry, superseded selection, and closed-viewer races passed');
  }
  await writeFile(`${outputDirectory}/retest-fixed-measurements.json`, JSON.stringify(measurements, null, 2));
}
