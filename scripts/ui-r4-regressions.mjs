import assert from 'node:assert/strict';

export async function checkR4Regressions({ openFixture, baseUrl, outputDirectory, fixture }) {
  for (const width of [320, 1440]) {
    const { context, page, errors } = await openFixture({ viewport: { width, height: 900 } });
    try {
      await page.goto(`${baseUrl}/?data=worst&q=${encodeURIComponent('🦊')}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 1 of 1 film');
      assert.match(await page.locator('#results-announcement').textContent(), /1 matching film for 🦊/);
      assert.equal(await page.locator('.featured-film-title').textContent(), '🦊 Fox');
      await page.locator('#collection-title').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${outputDirectory}/r4-symbol-search-${width}.png`, animations: 'disabled' });
      assert.deepEqual(errors, []);

      await page.goto(`${baseUrl}/?view=ledger`, { waitUntil: 'domcontentloaded' });
      const ledgerTrigger = page.locator('#film-ledger-rows .film-detail-trigger').first();
      await ledgerTrigger.focus();
      await ledgerTrigger.press('Enter');
      await page.locator('#film-detail-dialog[open]').waitFor();
      await page.goBack();
      await page.waitForFunction(() => !document.querySelector('#film-detail-dialog').open
        && document.activeElement === document.querySelector('#film-ledger-rows .film-detail-trigger'));
      assert.equal(new URL(page.url()).searchParams.has('film'), false);
      await page.screenshot({ path: `${outputDirectory}/r4-ledger-focus-${width}.png`, animations: 'disabled' });

      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 8 of 8 films');
      await page.locator('#catalog-filters>summary').click();
      await page.locator('.more-filters>summary').click();
      await page.locator('summary[aria-label="Original language filter"]').click();
      const language = page.locator('#language-index-options [data-language="en"]');
      await language.focus();
      await language.press('Enter');
      await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 7 of 7 films');
      assert.equal(await language.evaluate((button) => document.activeElement === button), true);
      assert.equal(await language.getAttribute('aria-pressed'), 'true');
      await language.press('Enter');
      await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 8 of 8 films');
      assert.equal(await language.evaluate((button) => document.activeElement === button), true);
      await page.screenshot({ path: `${outputDirectory}/r4-language-focus-${width}.png`, animations: 'disabled' });
      assert.deepEqual(errors, []);

      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 8 of 8 films');
      await page.locator('#catalogue-tools>summary').click();
      await page.locator('#saved-views>summary').click();
      await page.locator('.saved-view-portability>summary').click();
      const source = fixture.source_lists[fixture.films[0].list_ids[0]];
      const alias = source.replace('https://letterboxd.com/', 'https://www.letterboxd.com/').replace(/\/$/, '') + '?sort=popular#films';
      await page.locator('#preset-import-file').setInputFiles({
        name: 'festival-selection.json', mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ version: 1, presets: [{ name: 'Festival selection', state: { sourceLists: [alias, source.replace(/\/$/, '')] } }] })),
      });
      await page.waitForFunction(() => document.querySelector('#preset-status').textContent.includes('Imported 1 saved view'));
      await page.locator('#preset-list').selectOption('0');
      await page.locator('#preset-apply').click();
      await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 5 of 5 films');
      const appliedUrl = page.url();
      assert.deepEqual(new URL(appliedUrl).searchParams.getAll('list'), [source]);
      assert.equal(await page.locator('.active-source-list-chip').count(), 1);
      assert.doesNotMatch(await page.locator('.active-source-list-chip').textContent(), /Unavailable/);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 5 of 5 films');
      assert.equal(page.url(), appliedUrl);
      await page.locator('.active-source-list-chip').screenshot({ path: `${outputDirectory}/r4-import-source-${width}.png`, animations: 'disabled' });
      assert.deepEqual(errors, []);

      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent === 'Showing 8 of 8 films');
      assert.equal(await page.locator('.print-film-entry').count(), 0);
      await page.pdf({ path: `${outputDirectory}/r4-native-print-${width}.pdf`, format: 'A4' });
      assert.equal(await page.locator('.print-film-entry').count(), 8);
      assert.match(await page.locator('#print-programme-context').textContent(), /^8 films/);

      const staleQuery = 'Lantern Archive 1974 Restoration';
      const printed = await page.evaluate((query) => {
        let printCount = 0;
        window.print = () => { printCount += 1; };
        const input = document.querySelector('#search-input');
        input.value = query;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('#print-programme-button').click();
        return {
          printCount,
          context: document.querySelector('#print-programme-context').textContent,
          heading: document.querySelector('#print-programme-title').textContent,
          rows: document.querySelectorAll('.print-film-entry').length,
          onScreen: document.querySelector('#matching-films-count').textContent,
        };
      }, staleQuery);
      assert.deepEqual(printed, {
        printCount: 1,
        context: `0 films · Arranged by release year · Selected view: search: ${staleQuery}`,
        heading: staleQuery,
        rows: 0,
        onScreen: 'Showing 8 of 8 films',
      });
      await page.emulateMedia({ media: 'print' });
      await page.screenshot({ path: `${outputDirectory}/r4-current-print-${width}.png`, animations: 'disabled' });
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  console.log('R4: symbol search, keyboard focus, imported source round trips, and current/native print passed at 320 and 1440px');
}
