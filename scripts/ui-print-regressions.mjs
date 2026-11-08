import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { validateSnapshot } from '../web/snapshot.js';

const snapshot = validateSnapshot(JSON.parse(await readFile(new URL('../tests/fixtures/print-boundaries.json', import.meta.url), 'utf8')));
const query = 'InternationalCinemaPreservationAndRestorationProgramme2026OriginalLanguageRestoredUncutVersionWithEnglishSubtitlesAndCommentaryTrack.mov';

export async function checkPrintTextRegressions({ openFixture, baseUrl, outputDirectory }) {
  const { context, page, errors } = await openFixture({ viewport: { width: 696, height: 1000 } });
  const measurements = [];
  try {
    await context.route('**/site-config.json', (route) => route.fulfill({ json: { letterboxd_username: snapshot.username } }));
    await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: snapshot }));
    await context.addInitScript(() => { window.print = () => { window.printTextRequested = true; }; });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#site-shell:not([hidden])').waitFor();
    await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent.startsWith('Showing'));
    await page.locator('#catalogue-tools>summary').click();
    await page.locator('#share-output>summary').click();

    async function prepare(format) {
      await page.locator('#print-format-select').selectOption(format);
      await page.locator('#print-programme-button').click();
      await page.waitForFunction(() => window.printTextRequested);
      await page.emulateMedia({ media: 'print' });
      await page.evaluate(() => document.fonts.ready);
    }
    // Text fragments, not only element boxes: a block can fit while its glyphs overflow.
    async function textFits(locator, boundary, label) {
      const geometry = await locator.evaluate((element, selector) => {
        const box = element.closest(selector).getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element);
        const lines = [...range.getClientRects()];
        return { client: element.clientWidth, scroll: element.scrollWidth, lines: lines.length,
          left: Math.min(...lines.map((line) => line.left)), right: Math.max(...lines.map((line) => line.right)),
          boundLeft: box.left, boundRight: box.right };
      }, boundary);
      assert.ok(geometry.left >= geometry.boundLeft - 1 && geometry.right <= geometry.boundRight + 1, `${label}: ${JSON.stringify(geometry)}`);
      return geometry;
    }

    for (const format of ['compact', 'reader']) {
      await prepare(format);
      assert.equal(await page.locator('.print-film-entry').count(), snapshot.films.length);
      for (const film of snapshot.films) {
        const row = page.locator('.print-film-entry').filter({ has: page.locator('h3').filter({ hasText: film.title }) });
        const title = row.locator('h3');
        const credits = row.locator('.print-film-credits');
        assert.equal(await title.textContent(), film.title);
        for (const director of film.directors || []) assert.ok((await credits.textContent()).includes(director));
        if (film.original_title) assert.ok((await credits.textContent()).includes(film.original_title));
        const titleGeometry = await textFits(title, '.print-film-details', `${format}: complete title`);
        const creditGeometry = await textFits(credits, '.print-film-details', `${format}: complete credits`);
        if (format === 'reader') {
          const synopsis = row.locator('.print-film-synopsis');
          const expected = film.overview.length <= 260 ? film.overview : `${film.overview.slice(0, 260)}…`;
          assert.equal(await synopsis.textContent(), expected);
          await textFits(synopsis, '.print-film-synopsis', 'Reader: complete existing synopsis excerpt');
        }
        measurements.push({ format, title: film.title.slice(0, 45), titleGeometry, creditGeometry });
      }
      await page.locator('.print-film-entry').filter({ hasText: 'ArchiveRestorationReference' }).screenshot({ path: `${outputDirectory}/print-text-title-${format}-fixed.png`, animations: 'disabled' });
      await page.locator('.print-film-entry').filter({ hasText: 'Original title and credit boundary' }).screenshot({ path: `${outputDirectory}/print-text-credit-${format}-fixed.png`, animations: 'disabled' });
      if (format === 'reader') await page.locator('.print-film-entry').filter({ hasText: 'Synopsis and year boundary' }).screenshot({ path: `${outputDirectory}/print-text-synopsis-fixed.png`, animations: 'disabled' });
      await page.emulateMedia({ media: 'screen' });
    }
    await page.locator('#search-input').fill(query);
    await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 1 of 1 film');
    for (const format of ['compact', 'reader']) {
      await prepare(format);
      const contextText = page.locator('#print-programme-context');
      assert.ok((await contextText.textContent()).endsWith(`search: ${query}`));
      const geometry = await textFits(contextText, '#print-programme', `${format}: full archive filename query`);
      assert.ok(geometry.scroll <= geometry.client + 1);
      measurements.push({ format, queryCharacters: query.length, queryGeometry: geometry });
      await page.locator('.print-programme-header').screenshot({ path: `${outputDirectory}/print-text-query-${format}-fixed.png`, animations: 'disabled' });
      await page.emulateMedia({ media: 'screen' });
    }
    assert.deepEqual(errors, []);
    await writeFile(`${outputDirectory}/print-text-fixed-measurements.json`, JSON.stringify(measurements, null, 2));
    console.log('Compact and Reader: full unbroken titles, original titles, credits, synopsis excerpt and search context fit');
  } finally {
    await context.close();
  }
}
