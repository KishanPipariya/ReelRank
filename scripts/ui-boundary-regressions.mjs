import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { validateSnapshot } from '../web/snapshot.js';
import { savedViewLimit } from '../web/local-preferences.js';

export async function checkBoundaryRegressions({ openFixture, baseUrl, fixture, outputDirectory }) {
  const measurements = [];
  const profiles = [
    { name: '320', width: 320 }, { name: '1440', width: 1440 }, { name: '2560', width: 2560 },
    { name: '720', width: 720 }, { name: 'dark', width: 320, colorScheme: 'dark' },
    { name: 'text200', width: 320, suffix: '&text=200' }, { name: 'rtl', width: 320, suffix: '&dir=rtl' },
  ];
  const settled = async (page) => {
    await page.locator('#site-shell:not([hidden])').waitFor();
    await page.waitForFunction(() => document.querySelector('#matching-films-count').textContent.startsWith('Showing'));
  };
  for (const profile of profiles) {
    const options = { viewport: { width: profile.width, height: 900 }, colorScheme: profile.colorScheme || 'light' };
    {
      const { context, page, errors } = await openFixture(options);
      const presets = Array.from({ length: savedViewLimit }, (_, index) => ({ name: `Archive programme ${index + 1}`, state: { query: '' } }));
      await context.addInitScript((presets) => {
        if (!localStorage.getItem('reelrank.preferences.v1')) localStorage.setItem('reelrank.preferences.v1', JSON.stringify({ presets }));
      }, presets);
      await page.goto(`${baseUrl}/?${profile.suffix || ''}`, { waitUntil: 'domcontentloaded' });
      await settled(page);
      if (await page.locator('#catalogue-tools').getAttribute('open') === null) await page.locator('#catalogue-tools>summary').click();
      if (await page.locator('#saved-views').getAttribute('open') === null) await page.locator('#saved-views>summary').click();
      const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('reelrank.preferences.v1')).presets);
      const newName = 'Winter programme — restored films';
      await page.locator('#preset-name').fill(newName);
      await page.locator('#preset-save').click();
      assert.match(await page.locator('#preset-status').textContent(), /up to 100 views.*Delete a saved view/);
      assert.deepEqual(await stored(), presets, 'Rejected save preserves all existing views');
      assert.equal(await page.locator('#preset-list option').count(), savedViewLimit + 1);
      assert.equal(await page.locator('#preset-name').evaluate((element) => element === document.activeElement), true);
      if (profile.name === '320') await page.screenshot({ path: `${outputDirectory}/boundary-capacity-fixed.png`, animations: 'disabled' });
      await page.locator('#search-input').fill('Restoration');
      await page.locator('#preset-name').fill(presets[0].name.toUpperCase());
      await page.locator('#preset-save').click();
      assert.match(await page.locator('#preset-status').textContent(), /^Saved/);
      const replacement = await stored();
      assert.equal(replacement.length, savedViewLimit);
      assert.equal(replacement.at(-1).state.query, 'Restoration');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await settled(page);
      assert.equal((await stored()).at(-1).state.query, 'Restoration');
      if (await page.locator('#catalogue-tools').getAttribute('open') === null) await page.locator('#catalogue-tools>summary').click();
      if (await page.locator('#saved-views').getAttribute('open') === null) await page.locator('#saved-views>summary').click();
      await page.locator('#preset-status .preset-undo').click();
      assert.equal((await stored())[0].name, presets[0].name);
      assert.equal((await stored())[0].state.query, '');
      await page.locator('#preset-list').selectOption('0');
      await page.locator('#preset-delete').click();
      await page.locator('#preset-name').fill(newName);
      await page.locator('#preset-save').click();
      assert.equal((await stored()).length, savedViewLimit);
      assert.equal((await stored()).at(-1).name, newName);
      assert.deepEqual(errors, []);
      await context.close();
    }
    {
      const { context, page, errors } = await openFixture(options);
      const film = structuredClone(fixture.films.find((film) => Number.isSafeInteger(film.tmdb_id)));
      film.poster_url = '';
      const snapshot = { ...fixture, films: [film], film_count: 1, displayed_film_count: 1, unwatched_count: film.watched ? 0 : 1, displayed_unwatched_count: film.watched ? 0 : 1, tmdb_match_count: 1 };
      validateSnapshot(snapshot);
      await context.route('**/data/snapshot.json', (route) => route.fulfill({ json: snapshot }));
      await context.route('**/data/poster-galleries.json', (route) => route.fulfill({ json: {
        snapshot_refreshed_at: snapshot.refreshed_at,
        galleries: { [film.tmdb_id]: [{ path: '/boundary-valid-poster.jpg', language: 'en' }] },
      } }));
      await context.route('**/boundary-valid-poster.jpg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#164c45"/><circle cx="200" cy="245" r="145" fill="#e8ac70"/></svg>' }));
      await page.goto(`${baseUrl}/?${profile.suffix || ''}`, { waitUntil: 'domcontentloaded' });
      await settled(page);
      await page.locator('.featured-film .film-detail-trigger').click();
      const choose = async () => {
        await page.locator('.film-detail-browse-posters').click();
        await page.locator('.poster-viewer-option').first().click();
        await page.waitForFunction(() => document.querySelector('#poster-viewer-feedback').textContent === 'Poster choice saved on this device.');
        await page.locator('#poster-viewer-close').click();
        await page.locator('#poster-viewer-dialog').waitFor({ state: 'hidden' });
        await page.waitForFunction(() => document.querySelector('.film-detail-poster img')?.naturalWidth > 0);
        assert.match(await page.locator('.film-detail-poster img').getAttribute('src'), /boundary-valid-poster.jpg$/);
        assert.equal(await page.locator('.film-detail-poster-trigger').count(), 1);
        assert.equal(await page.locator('.film-detail-browse-posters').textContent(), 'View other posters');
      };
      await choose();
      if (profile.name === '320') await page.screenshot({ path: `${outputDirectory}/boundary-poster-choice-fixed.png`, animations: 'disabled' });
      await page.locator('#film-detail-close').click();
      await page.waitForFunction(() => !new URLSearchParams(location.search).has('film'));
      assert.match(await page.locator('.featured-film-poster img').getAttribute('src'), /boundary-valid-poster.jpg$/);
      assert.equal(await page.locator('.featured-film-poster .poster-fallback').count(), 0);
      assert.equal(await page.locator('.featured-film-poster .rank-chip').count(), 1);
      await page.locator('.featured-film .film-detail-trigger').click();
      await page.locator('.film-detail-gallery-button').filter({ hasText: 'Reset poster' }).click();
      assert.equal(await page.locator('.film-detail-poster-trigger').count(), 0);
      assert.equal(await page.locator('.poster-enlarge-cue').count(), 0);
      assert.equal(await page.locator('.film-detail-poster .poster-fallback-title').count(), 1);
      assert.equal(await page.locator('.film-detail-browse-posters').textContent(), 'Browse posters');
      if (profile.name === '320') await page.screenshot({ path: `${outputDirectory}/boundary-poster-reset-fixed.png`, animations: 'disabled' });
      // Repeat the transition without reloading: reset must leave Browse posters functional.
      await choose();
      await page.locator('.film-detail-gallery-button').filter({ hasText: 'Reset poster' }).click();
      await page.locator('#film-detail-close').click();
      assert.equal(await page.locator('.featured-film-poster img').count(), 0);
      assert.equal(await page.locator('.featured-film-poster .poster-fallback').count(), 1);
      assert.equal(await page.locator('.featured-film-poster .rank-chip').count(), 1);
      assert.deepEqual(errors, []);
      await context.close();
    }
    measurements.push({ profile: profile.name, capacityRefused: true, replacementAtCapacity: true, reloadUndo: true, deleteThenSave: true, posterChoiceImmediatelyVisible: true, resetRemovesEnlarge: true, browseAfterReset: true });
    console.log(`${profile.name}: saved-view capacity, replacement/undo and missing-poster transitions passed`);
  }
  {
    const { context, page, errors } = await openFixture({ viewport: { width: 696, height: 1000 } });
    await context.addInitScript(() => { window.print = () => { window.boundaryPrintRequested = true; }; });
    await page.goto(`${baseUrl}/?data=worst`, { waitUntil: 'domcontentloaded' });
    await settled(page);
    await page.locator('#catalogue-tools>summary').click();
    await page.locator('#share-output>summary').click();
    for (const format of ['compact', 'reader']) {
      await page.locator('#print-format-select').selectOption(format);
      await page.locator('#print-programme-button').click();
      await page.waitForFunction(() => window.boundaryPrintRequested);
      await page.emulateMedia({ media: 'print' });
      await page.evaluate(() => document.fonts.ready);
      const row = page.locator('.print-film-entry').filter({ hasText: 'Schema boundary: archive compilation' });
      const geometry = await row.evaluate((element) => {
        const score = element.querySelector('.print-film-score');
        const number = score.querySelector('strong');
        return { rowRight: element.getBoundingClientRect().right, scoreRight: score.getBoundingClientRect().right, scoreWidth: score.clientWidth, scoreScroll: score.scrollWidth, numberWidth: number.getBoundingClientRect().width, numberRight: number.getBoundingClientRect().right, text: number.textContent };
      });
      assert.equal(geometry.text, Number.MAX_SAFE_INTEGER.toLocaleString());
      assert.ok(geometry.numberWidth <= geometry.scoreWidth + 1);
      assert.ok(geometry.scoreScroll <= geometry.scoreWidth + 1);
      assert.ok(geometry.numberRight <= geometry.rowRight + 1);
      await row.screenshot({ path: `${outputDirectory}/boundary-print-${format}-fixed.png`, animations: 'disabled' });
      measurements.push({ format, ...geometry });
      await page.emulateMedia({ media: 'screen' });
    }
    assert.deepEqual(errors, []);
    await context.close();
    console.log('Compact and Reader print scores retain every digit inside the printable layout');
  }
  await writeFile(`${outputDirectory}/boundary-fixed-measurements.json`, JSON.stringify(measurements, null, 2));
}
