import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

export async function checkUnicodeExcerptRegressions({ openFixture, baseUrl, fixture, outputDirectory }) {
  const query = 'The Chronicles of the Last Voyage 🎬 Restoration Notes';
  const prefix = '映画の修復と保存に取り組む人々の記録。'.repeat(20).slice(0, 259);
  const measurements = [];
  for (const width of [320, 1440]) {
    const snapshot = structuredClone(fixture);
    snapshot.films[0].overview = `Reference: ${query}.`;
    snapshot.films[1].overview = prefix + '🎬' + '新たな旅が続く。'.repeat(20);
    const { context, page, errors } = await openFixture({ viewport: { width, height: 900 } });
    try {
      await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: snapshot }));
      await context.addInitScript(() => { window.print = () => { window.unicodePrintRequested = true; }; });
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.locator('#site-shell:not([hidden])').waitFor();
      await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent.startsWith('Showing'));
      await page.locator('#search-input').fill(query);
      await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 1 of 1 film');
      const heading = page.locator('#top-billed-title');
      assert.equal(await heading.isVisible(), true);
      const text = await heading.textContent();
      assert.equal(text, 'The Chronicles of the Last Voyage 🎬…');
      assert.equal(text.isWellFormed(), true);
      const geometry = await heading.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
      assert.ok(geometry.scroll <= geometry.client + 1);
      await heading.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${outputDirectory}/unicode-query-${width}-verified.png`, animations: 'disabled' });
      await page.locator('#search-input').fill('');
      await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 8 of 8 films');
      await page.locator('#catalogue-tools>summary').click();
      await page.locator('#share-output>summary').click();
      await page.locator('#print-format-select').selectOption('reader');
      await page.locator('#print-programme-button').click();
      await page.waitForFunction(() => window.unicodePrintRequested);
      await page.setViewportSize({ width: 696, height: 1000 });
      await page.emulateMedia({ media: 'print' });
      const row = page.locator('.print-film-entry').filter({ has: page.locator('h3').filter({ hasText: snapshot.films[1].title }) });
      const excerpt = await row.locator('.print-film-synopsis').textContent();
      assert.equal(excerpt, prefix + '🎬…');
      assert.equal(excerpt.isWellFormed(), true);
      if (width === 320) await row.screenshot({ path: `${outputDirectory}/unicode-reader-verified.png`, animations: 'disabled' });
      measurements.push({ width, heading: text, headingWellFormed: true, headingFits: geometry, readerTail: excerpt.slice(-12), readerWellFormed: true });
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  await writeFile(`${outputDirectory}/unicode-excerpt-measurements.json`, JSON.stringify(measurements, null, 2));
  console.log('Search headings and Reader excerpts preserve boundary emoji without lone surrogates');
}
