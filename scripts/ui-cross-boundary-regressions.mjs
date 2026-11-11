import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

export async function checkCrossBoundaryRegressions({ openFixture, baseUrl, fixture, outputDirectory }) {
  const measurements = [];
  for (const width of [320, 1440]) {
    for (const [name, overview, accepted] of [
      ['unicode-boundary', 'A'.repeat(19999) + '🎬', true],
      ['ascii-overflow', 'A'.repeat(20001), false],
    ]) {
      const snapshot = structuredClone(fixture);
      snapshot.films[0].overview = overview;
      const { context, page, errors } = await openFixture({ viewport: { width, height: 900 } });
      await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: snapshot }));
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      if (accepted) {
        await page.locator('#site-shell:not([hidden])').waitFor();
        await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent.startsWith('Showing'));
      } else {
        await page.locator('#retry-loading:not([hidden])').waitFor();
        assert.equal(await page.locator('#site-shell').isVisible(), false);
      }
      assert.deepEqual(errors, []);
      measurements.push({ name, width, accepted, codePoints: Array.from(overview).length, utf16Units: overview.length });
      if (width === 320) await page.screenshot({ path: `${outputDirectory}/contract-${name}-verified.png`, animations: 'disabled' });
      await context.close();
    }
  }
  const compact = JSON.parse(await readFile(new URL('../tests/fixtures/public-compact-snapshot.json', import.meta.url), 'utf8'));
  assert.equal(compact.tmdb_match_count, 0);
  for (const width of [320, 1440]) {
    const { context, page, errors } = await openFixture({ viewport: { width, height: 900 } });
    await context.route('**/site-config.json', (route) => route.fulfill({ json: { letterboxd_username: compact.username } }));
    await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: compact }));
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#site-shell:not([hidden])').waitFor();
    await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent.startsWith('Showing'));
    assert.equal(await page.locator('#tmdb-credit').isVisible(), compact.tmdb_match_count > 0);
    if (width === 320) await page.screenshot({ path: `${outputDirectory}/compact-no-attribution-verified.png`, fullPage: true, animations: 'disabled' });
    await page.locator('.featured-film .film-detail-trigger').click();
    const source = page.locator('.film-note-sources .list-links a');
    assert.equal(await source.count(), 1);
    assert.equal(await source.first().getAttribute('href'), compact.source_lists[0]);
    if (width === 320) await page.screenshot({ path: `${outputDirectory}/compact-source-verified.png`, animations: 'disabled' });
    await page.locator('#film-detail-close').click();
    await page.waitForFunction(() => !new URLSearchParams(location.search).has('film'));
    await page.locator('#search-input').fill('favorites');
    await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 1 of 1 film');
    await page.waitForFunction(() => new URLSearchParams(location.search).get('q') === 'favorites');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent.startsWith('Showing'));
    assert.equal(await page.locator('#matching-films-count').textContent(), 'Showing 1 of 1 film');
    measurements.push({ width, compactSourcePreserved: true, compactSourceSearch: true });
    const invalidDate = { ...compact, refreshed_at: '2026-02-30T00:00:00Z' };
    await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: invalidDate }));
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#retry-loading:not([hidden])').waitFor();
    assert.equal(await page.locator('#site-shell').isVisible(), false);
    measurements.push({ width, invalidCalendarDateRejected: true });
    const matched = structuredClone(compact);
    matched.films[0].tmdb_id = 329865;
    matched.tmdb_match_count = 1;
    await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: matched }));
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#site-shell:not([hidden])').waitFor();
    assert.equal(await page.locator('#tmdb-credit').isVisible(), true);
    measurements.push({ width, absentMetadataHidesAttribution: compact.tmdb_match_count === 0, matchedIdShowsAttribution: true });
    assert.deepEqual(errors, []);
    await context.close();
  }
  for (const colorScheme of ['light', 'dark']) {
    const { context, page, errors } = await openFixture({ viewport: { width: 696, height: 1000 }, colorScheme });
    await context.addInitScript(() => { window.print = () => { window.themePrintRequested = true; }; });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#site-shell:not([hidden])').waitFor();
    await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent.startsWith('Showing'));
    await page.locator('#catalogue-tools>summary').click();
    await page.locator('#share-output>summary').click();
    for (const format of ['compact', 'reader']) {
      await page.locator('#print-format-select').selectOption(format);
      await page.locator('#print-programme-button').click();
      await page.waitForFunction(() => window.themePrintRequested);
      await page.emulateMedia({ media: 'print' });
      const values = await page.locator('.print-film-details h3').evaluateAll((titles) => titles.map((element) => {
        const color = getComputedStyle(element).color;
        const background = getComputedStyle(document.body).backgroundColor;
        const luminance = (color) => {
          const values = color.match(/[\d.]+/g).slice(0, 3).map((value) => {
            const n = Number(value) / 255;
            return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
          });
          return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
        };
        const values = [luminance(color), luminance(background)].sort((a, b) => b - a);
        return { title: element.textContent, color, background, contrast: (values[0] + .05) / (values[1] + .05) };
      }));
      assert.equal(values.length, fixture.films.length);
      assert.ok(values.every((value) => value.contrast >= 4.5), `${format}/${colorScheme}: print title contrast`);
      measurements.push({ colorScheme, format, titles: values });
      if (colorScheme === 'dark') await page.locator('#print-programme').screenshot({ path: `${outputDirectory}/print-${format}-dark-verified.png`, animations: 'disabled' });
      await page.emulateMedia({ media: 'screen' });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  await writeFile(`${outputDirectory}/cross-boundary-measurements.json`, JSON.stringify(measurements, null, 2));
  console.log('Unicode/date contracts, compact source provenance/search, and light/dark print contrast passed');
}
