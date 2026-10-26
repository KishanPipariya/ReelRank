import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const baseUrl = process.env.SITE_URL || 'http://127.0.0.1:4173';
const requestedScenario = process.argv.find((arg) => arg.startsWith('--scenario='))?.split('=')[1] || process.argv[2] || 'all';
const scenarios = new Set(['all', 'catalogue', 'sharing', 'preferences', 'recovery', 'accessibility', 'reflow']);
if (!scenarios.has(requestedScenario)) throw new Error(`Unknown browser scenario "${requestedScenario}". Choose: ${[...scenarios].join(', ')}`);
const runs = (...names) => requestedScenario === 'all' || names.includes(requestedScenario);
const snapshot = JSON.parse(await readFile('tests/fixtures/browser-snapshot.json', 'utf8'));
const visualLayout = JSON.parse(await readFile('tests/fixtures/visual-layout-baselines.json', 'utf8'));
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const browser = await chromium.launch({ headless: true });
const tracedContexts = new WeakSet();
let activePage;

function check(condition, message) {
  if (!condition) throw new Error(`Accessibility interaction check failed: ${message}`);
}

async function checkCatalogueSectionFlow(page, label) {
  const layout = await page.evaluate(() => {
    const selectors = ['.catalogue-controls', '.catalogue-actions', '.catalogue-results'];
    const bounds = selectors.map((selector) => {
      const element = document.querySelector(selector);
      const rect = element.getBoundingClientRect();
      return { selector, top: rect.top, bottom: rect.bottom, height: rect.height };
    });
    const searchHelp = document.querySelector('#search-help').textContent;
    const collectionScope = document.querySelector('#collection-scope').textContent;
    return {
      bounds,
      searchHelp,
      collectionScope,
      contextInControls: document.querySelector('.collection-context').parentElement.matches('.catalogue-controls'),
      savedViewsInControls: document.querySelector('#saved-views').parentElement.matches('.catalogue-controls'),
      summaryInContext: document.querySelector('#programme-note').parentElement.matches('.collection-context'),
      summaryOutsideSavedViews: !document.querySelector('#programme-note').closest('#saved-views'),
      posterWallInResults: document.querySelector('#film-grid').parentElement.matches('.catalogue-results'),
      posterToggleInViewTools: document.querySelector('#poster-display-button').closest('.catalogue-actions') !== null,
      featuredBeforePosterWall: (() => {
        const feature = document.querySelector('#top-billed');
        const firstPoster = document.querySelector('#film-grid > .film-card');
        return feature.hidden || !firstPoster || feature.getBoundingClientRect().bottom <= firstPoster.getBoundingClientRect().top + 1;
      })(),
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    };
  });

  check(layout.contextInControls && layout.savedViewsInControls, `${label} keeps search context and saved settings inside the catalogue-controls section.`);
  check(layout.summaryInContext && layout.summaryOutsideSavedViews, `${label} keeps the selection summary with catalogue context and outside the saved-views disclosure.`);
  check(layout.posterWallInResults && layout.posterToggleInViewTools, `${label} separates poster results from display controls.`);
  check(layout.featuredBeforePosterWall, `${label} keeps the featured-film section clear of the poster wall.`);
  check(layout.collectionScope.includes('title, original title, director, year, genre, synopsis, and source list')
    && layout.searchHelp.includes('title, original title, director, year, genre, synopsis, and source list'), `${label} uses matching search coverage in visible and accessible descriptions.`);
  check(layout.bounds.every((section, index) => section.height > 0 && (index === 0 || layout.bounds[index - 1].bottom <= section.top + 1)), `${label} catalogue sections are visible and do not overlap (${JSON.stringify(layout.bounds)}).`);
  check(layout.pageWidth <= layout.viewportWidth, `${label} catalogue sections do not create horizontal page overflow.`);
}

async function scan(page, name) {
  try {
    if (!(await page.evaluate(() => Boolean(window.axe)))) await page.addScriptTag({ path: axePath });
    const result = await page.evaluate((tags) => axe.run(document, {
      runOnly: { type: 'tag', values: tags },
    }), wcagTags);
    if (result.violations.length) {
      const details = result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        targets: violation.nodes.map((node) => node.target),
      }));
      throw new Error(`${name} accessibility violations:\n${JSON.stringify(details, null, 2)}`);
    }
    console.log(`${name}: ${result.passes.length} axe checks passed, no violations.`);
  } catch (error) {
    await saveDiagnostics(page, name);
    throw error;
  }
}

async function saveDiagnostics(page, label) {
  if (!page || page.isClosed()) return;
  const fileName = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await page.screenshot({ path: `/tmp/reelrank-${fileName}.png`, fullPage: true }).catch(() => {});
  const context = page.context();
  if (tracedContexts.delete(context)) {
    await context.tracing.stop({ path: `/tmp/reelrank-${fileName}.zip` }).catch(() => {});
  }
}

async function checkFeaturedVisualLayout(page, label) {
  const geometry = await page.locator('.featured-film').first().evaluate((element) => {
    const poster = element.querySelector('.featured-film-poster').getBoundingClientRect();
    const copy = element.querySelector('.featured-film-copy').getBoundingClientRect();
    const filmGrid = document.querySelector('#film-grid');
    return {
      posterRight: poster.right,
      copyLeft: copy.left,
      copyWidth: copy.width,
      posterAspectRatio: poster.width / poster.height,
      featuredColumns: getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length,
      gridColumns: getComputedStyle(filmGrid).gridTemplateColumns.trim().split(/\s+/).length,
      viewportWidth: innerWidth,
      pageWidth: document.documentElement.scrollWidth,
    };
  });
  const profile = label === 'mobile' ? 'mobile' : 'desktop';
  const baseline = visualLayout[profile];
  check(geometry.copyLeft >= geometry.posterRight - 2, `${label} featured poster and copy columns do not overlap.`);
  check(geometry.copyWidth >= 110, `${label} featured copy remains readable (${geometry.copyWidth}px).`);
  check(geometry.pageWidth <= geometry.viewportWidth, `${label} has no horizontal page overflow.`);
  check(geometry.gridColumns === baseline.gridColumns, `${label} poster grid has ${geometry.gridColumns} columns; expected ${baseline.gridColumns}.`);
  check(geometry.featuredColumns === baseline.featuredColumns, `${label} featured panel has ${geometry.featuredColumns} columns; expected ${baseline.featuredColumns}.`);
  check(Math.abs(geometry.posterAspectRatio - baseline.posterAspectRatio) <= baseline.posterRatioTolerance, `${label} featured poster aspect ratio drifted (${geometry.posterAspectRatio.toFixed(3)}).`);
  if (label === 'dark mode') return;
  const screenshotPath = `/tmp/reelrank-visual-${profile}.png`;
  await page.locator('#top-billed').screenshot({ path: screenshotPath, animations: 'disabled' });
  console.log(`${label}: saved visual review screenshot to ${screenshotPath}.`);
}

async function checkCatalogInteractions(page) {
  await page.locator('#sort-select').selectOption('title');
  check(new URL(page.url()).searchParams.get('sort') === 'title', 'Sort selection is reflected in the URL.');
  await page.goBack();
  check(!new URL(page.url()).searchParams.has('sort'), 'Browser Back restores the previous sort state.');
  await page.goForward();
  check(new URL(page.url()).searchParams.get('sort') === 'title', 'Browser Forward restores the selected sort.');
  await page.setViewportSize({ width: 390, height: 844 });
  const expandableCard = page.locator('.film-card:visible:has(.genre-tag-more)').first();
  await expandableCard.locator('.genre-tag-more').click();
  check(await expandableCard.locator('.genre-tags').evaluate((element) => element.classList.contains('is-expanded')), 'Film genre expansion opens.');
  await expandableCard.locator('.genre-tag[data-genre]').first().click();
  const retainedExpandedCard = page.locator('.film-card:visible:has(.genre-tag-more) .genre-tags.is-expanded').first();
  check(await retainedExpandedCard.count() === 1, 'Film genre expansion survives a catalog rerender.');
  await page.locator('#clear-search-state').click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#sort-select').selectOption('title');
  const directorCard = page.locator('.film-card:visible').filter({ hasText: 'Portrait of a Lady on Fire' });
  await directorCard.locator('.director-filter[data-director="Céline Sciamma"]').click();
  check(await directorCard.locator('.director-filter[data-director="Céline Sciamma"]').getAttribute('aria-pressed') === 'true', 'Cached director controls reflect the selected filter.');
  check(await directorCard.locator('.film-score-meter').evaluate((meter) => meter.style.getPropertyValue('--score-share')) === '100%', 'Cached score bars rescale to the filtered results.');
  const longListUrl = snapshot.films.flatMap((film) => film.lists || []).find((url) => url.includes('halliwells-top-1000'));
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(`${baseUrl}/?list=${encodeURIComponent(longListUrl)}`, { waitUntil: 'domcontentloaded' });
  const sourceFilterChip = page.locator('#active-source-list-filters .active-source-list-chip');
  await sourceFilterChip.waitFor();
  const sourceChipHeight = await sourceFilterChip.evaluate((chip) => chip.getBoundingClientRect().height);
  check(sourceChipHeight <= 30, `Long source-list filter chip remains a single compact line (${sourceChipHeight}px).`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Long source-list filter chip does not cause mobile overflow.');
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#catalog-filters > summary').click();
  check(await page.locator('#catalog-filters').evaluate((element) => element.open), 'Filters panel opens before using its facet controls.');
  await page.locator('#runtime-options [data-runtime="under-90"]').click();
  check(new URL(page.url()).searchParams.get('runtime') === 'under-90', 'Runtime selection is reflected in the URL.');
  check(await page.locator('#heading-count').textContent() === '01', 'Under-90-minute selection returns the matching film.');
  check(await page.locator('#active-genre-filters').getByRole('button', { name: 'Remove runtime filter: Under 90 min' }).count() === 1, 'Runtime selection has a named removable filter chip.');
  await page.locator('#runtime-options [data-runtime="90-120"]').click();
  check(await page.locator('#heading-count').textContent() === '03', '90–120-minute selection respects inclusive boundaries.');
  await page.locator('#runtime-options [data-runtime=""]').click();
  await page.locator('#sort-select').selectOption('title');
  await page.locator('#country-index-options .country-index-option:visible').first().click();
  check(Boolean(new URL(page.url()).searchParams.get('country')), 'Country selection is reflected in the URL.');
  check(await page.locator('#country-index-options .country-index-option[aria-pressed="true"]').count() === 1, 'Country filter selection has one active state.');
  await page.locator('#ledger-display-button').click();
  check(await page.locator('#film-ledger-view').isVisible(), 'Ledger control displays the ledger.');
  check(new URL(page.url()).searchParams.get('view') === 'ledger', 'View selection is reflected in the URL.');
  await page.locator('#poster-display-button').click();
  check(await page.locator('#film-grid').isVisible(), 'Poster wall control restores the poster grid.');
  await page.locator('#country-index-options .country-index-option[aria-pressed="true"]').click();
  await page.locator('#sort-select').selectOption('rank');
  await page.locator('.film-detail-trigger:visible').first().click();
  check(await page.locator('#film-detail-dialog').evaluate((dialog) => dialog.open), 'Film details control opens the programme notes dialog.');
  check(await page.locator('#film-detail-position').textContent() === 'Film 1 of 8', 'Film details show position in the current results separately from overall rank.');
  await page.locator('#film-detail-next').click();
  check(await page.locator('#film-detail-title').textContent() === 'Arrival', 'Next navigates in current result order without closing the dialog.');
  await page.locator('#film-detail-previous').click();
  check(await page.locator('#film-detail-title').textContent() === 'The Third Man', 'Previous returns to the earlier film.');
  check(await page.evaluate(() => document.activeElement.id === 'film-detail-next'), 'Film navigation keeps focus on a usable adjacent control when it reaches the first film.');
  await page.locator('#film-detail-close').click();
  check(!(await page.locator('#film-detail-dialog').evaluate((dialog) => dialog.open)), 'Programme notes dialog closes from its close control.');
  await page.waitForFunction(() => !new URL(location.href).searchParams.has('film'));
  await page.locator('.poster-link:visible').first().click();
  check(await page.locator('#film-detail-dialog').evaluate((dialog) => dialog.open), 'Poster buttons open film details.');
  check(Boolean(new URL(page.url()).searchParams.get('film')), 'Opening details adds a stable film identifier to the URL.');
  check(await page.getByRole('link', { name: /Open on Letterboxd/ }).count() === 1, 'Film details retain the explicit Letterboxd link.');
  await page.locator('#film-detail-next').click();
  check(new URL(page.url()).searchParams.get('film') === await page.locator('#film-detail-content input[aria-label^="Share link"]').inputValue().then((url) => new URL(url).searchParams.get('film')), 'Detail navigation and copy link use the current film.');
  await page.goBack();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has('film'));
  check(!(await page.locator('#film-detail-dialog').evaluate((dialog) => dialog.open)), 'Browser Back closes the detail dialog.');
  await page.goForward();
  await page.waitForFunction(() => new URL(location.href).searchParams.has('film'));
  check(await page.locator('#film-detail-dialog').evaluate((dialog) => dialog.open), 'Browser Forward restores the detail dialog.');
  await page.locator('#film-detail-close').click();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has('film'));
  await page.locator('#runtime-options [data-runtime="90-120"]').click();
  await page.locator('#sort-select').selectOption('title');
  await page.locator('.film-detail-trigger:visible').first().click();
  check(await page.locator('#film-detail-title').textContent() === 'Arrival', 'Details start with the first film in the sorted, filtered results.');
  check(await page.locator('#film-detail-position').textContent() === 'Film 1 of 3', 'Detail position counts only matching films.');
  await page.locator('#film-detail-next').click();
  check(await page.locator('#film-detail-title').textContent() === 'Portrait of a Lady on Fire', 'Next follows the chosen sort within the runtime filter.');
  check((await page.locator('.film-detail-kicker').textContent()).includes('007'), 'Detail browsing preserves overall catalogue rank.');
  await page.locator('#film-detail-next').click();
  check(await page.locator('#film-detail-next').isDisabled(), 'Next is disabled at the end of the filtered results.');
  check(await page.evaluate(() => document.activeElement.id === 'film-detail-previous'), 'Reaching the last film keeps focus on an enabled navigation control.');
  await page.keyboard.press('Escape');
}

async function checkHistoryPosition() {
  const { context, page } = await openSite({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  try {
    const longSnapshot = structuredClone(snapshot);
    const model = longSnapshot.films[0];
    for (let index = 0; index < 50; index += 1) longSnapshot.films.push({ ...structuredClone(model), title: `History fixture ${String(index + 1).padStart(2, '0')}`, original_title: `History fixture ${index + 1}`, letterboxd_title: `History fixture ${index + 1}`, letterboxd_url: `https://letterboxd.com/film/history-fixture-${index + 1}/`, tmdb_id: 700000 + index, watched: true, liked_in: 1 });
    longSnapshot.film_count = longSnapshot.displayed_film_count = longSnapshot.films.length;
    longSnapshot.unwatched_count = longSnapshot.displayed_unwatched_count = snapshot.films.filter((film) => !film.watched).length;
    await page.route('**/data/snapshot.json', (route) => route.fulfill({ json: longSnapshot }));
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#load-more').click();
    const target = page.locator('.film-card:visible').filter({ hasText: 'History fixture 02' }).locator('.poster-link');
    await target.waitFor();
    await target.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    const before = await page.evaluate(() => scrollY);
    const originalHref = await target.getAttribute('href');
    await target.click();
    check(new URL(page.url()).searchParams.has('film'), 'The detail anchor opens a real film URL.');
    await page.goBack();
    await page.locator('#film-detail-dialog').waitFor({ state: 'hidden' });
    check(await page.locator('.film-card:visible').filter({ hasText: 'History fixture 02' }).count() === 1, 'Back restores results beyond the first 40 films.');
    check(Math.abs(await page.evaluate(() => scrollY) - before) < 5, 'Back restores browsing position after closing details.');
    await page.goForward();
    await page.locator('#film-detail-title').waitFor();
    check((await page.locator('#film-detail-title').textContent()).includes('History fixture 02'), 'Forward reopens the same detail.');
    await page.locator('#film-detail-close').click();
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('film'));
    check(await page.evaluate(() => !new URL(location.href).searchParams.has('film')), 'Manual close removes the film URL.');
    check(await page.evaluate(() => document.activeElement.classList.contains('poster-link')), 'Manual close restores focus to the triggering poster link.');
    await page.goto(new URL(originalHref, baseUrl).href, { waitUntil: 'domcontentloaded' });
    await page.locator('#film-detail-title').waitFor();
    await page.locator('#film-detail-close').click();
    await page.locator('#film-detail-dialog').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('film'));
    check(await page.evaluate(() => document.activeElement.id === 'collection-title'), 'A directly opened film restores focus to the collection heading when closed.');
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#load-more').click();
    await page.locator('.film-card:visible').filter({ hasText: 'History fixture 03' }).scrollIntoViewIfNeeded();
    const expandedPosition = await page.evaluate(() => scrollY);
    await page.evaluate(() => { const select = document.querySelector('#sort-select'); select.value = 'title'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.goBack();
    check(await page.locator('.film-card:visible').count() > 44, 'Back after a sort restores the expanded result limit.');
    check(Math.abs(await page.evaluate(() => scrollY) - expandedPosition) < 5, 'Back after a sort restores the expanded browsing position.');
  } catch (error) { await saveDiagnostics(page, 'history-position-failure'); throw error; }
  finally { await context.close(); }
}

async function checkDetailPresentation(page, label) {
  await page.locator('.film-detail-trigger:visible').first().click();
  const next = page.locator('#film-detail-next');
  for (const hover of [false, true]) {
    if (hover) await next.hover();
    const contrast = await next.evaluate((button) => {
      const luminance = (color) => {
        const channels = color.match(/[\d.]+/g).slice(0, 3).map((value) => {
          const channel = Number(value) / 255;
          return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        });
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
      };
      const style = getComputedStyle(button);
      const values = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => b - a);
      return (values[0] + .05) / (values[1] + .05);
    });
    check(contrast >= 4.5, `${label} navigation ${hover ? 'hover' : 'default'} text contrast is at least 4.5:1 (${contrast.toFixed(2)}:1).`);
  }
  const initialViewport = page.viewportSize();
  for (const width of label === 'mobile' ? [320, 390, 600, 601, 720] : [initialViewport.width]) {
    await page.setViewportSize({ ...initialViewport, width });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const layout = await page.locator('#film-detail-dialog').evaluate((dialog) => {
      const bounds = dialog.getBoundingClientRect();
      const controls = [...dialog.querySelectorAll('.film-detail-step')].map((button) => button.getBoundingClientRect());
      return bounds.left >= 0 && bounds.right <= innerWidth && dialog.scrollWidth <= dialog.clientWidth
        && controls.every((control) => control.left >= bounds.left && control.right <= bounds.right && control.height >= 40)
        && controls[0].right <= controls[1].left;
    });
    check(layout, `${label} detail controls fit at ${width}px without overlap and retain 40px targets.`);
  }
  await page.setViewportSize(initialViewport);
  await scan(page, `${label} film details`);
  await page.locator('#film-detail-dialog').screenshot({ path: `/tmp/reelrank-details-${label.replaceAll(' ', '-')}.png`, animations: 'disabled' });
  await page.locator('#film-detail-close').click();
  await page.locator('#film-detail-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => !new URL(location.href).searchParams.has('film'));
}

async function checkBrokenPosterFallback() {
  const { context, page } = await openSite();
  const brokenSnapshot = structuredClone(snapshot);
  brokenSnapshot.films[0].poster_url = 'https://image.tmdb.org/t/p/w500/unavailable-poster.jpg';
  await page.route('**/data/snapshot.json', (route) => route.fulfill({ json: brokenSnapshot }));
  await page.route('**/unavailable-poster.jpg', (route) => route.abort());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.featured-film-poster .poster-fallback-title').waitFor();
  await page.locator('.film-detail-trigger:visible').first().click();
  await page.locator('.film-detail-poster .poster-fallback-title').waitFor();
  check(await page.locator('.film-detail-poster .poster-fallback-title').textContent() === snapshot.films[0].title, 'A failed detail poster displays the designed fallback with the correct title.');
  await context.close();
}

async function checkSavedPreferences() {
  const { context, page } = await openSite({ localPreferences: { view: 'ledger' }, compactSnapshot: true });
  await page.route('**/chosen-poster.jpg', (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Fe8AAAAASUVORK5CYII=', 'base64'),
  }));
  await page.route('**/data/poster-galleries.json', (route) => route.fulfill({ json: {
    snapshot_refreshed_at: snapshot.refreshed_at,
    galleries: { '329865': [{ path: '/chosen-poster.jpg', language: 'fr' }] },
  } }));
  await page.waitForSelector('#site-shell:not([hidden])');
  check(await page.locator('#film-ledger-view').isVisible(), 'A saved Ledger preference applies on a bare home visit.');
  await page.locator('#poster-display-button').click();
  await page.locator('#programme-share > summary').click();
  const link = new URL(await page.locator('#programme-share-url').inputValue());
  check(link.searchParams.get('view') === 'posters', 'A shared default Poster Wall programme overrides a recipient Ledger preference.');
  await page.goto(link.href, { waitUntil: 'domcontentloaded' });
  check(await page.locator('#film-grid').isVisible(), 'An explicit shared Poster Wall layout wins over stored preferences.');
  await page.locator('#programme-share > summary').click();
  await page.locator('#saved-views > summary').click();
  await page.locator('#saved-views').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/reelrank-saved-views-desktop.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#saved-views').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/reelrank-saved-views-mobile.png', animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#preset-name').fill('A saved view');
  await page.locator('#preset-save').click();
  check(await page.locator('#preset-list option').count() === 2, 'Users can save named filter presets.');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#preset-export').click();
  const exportFile = await downloadPromise;
  const exportContents = await readFile(await exportFile.path());
  await page.locator('#preset-list').selectOption('');
  await page.locator('#preset-apply').click();
  check((await page.locator('#preset-status').textContent()).includes('Choose a preset'), 'Empty preset selections do not apply the first saved item.');
  await page.locator('#preset-list').selectOption('0');
  await page.locator('#preset-apply').click();
  check((await page.locator('#preset-status').textContent()).includes('Applied'), 'Users can apply a saved preset.');
  await page.locator('#preset-delete').click();
  check(await page.locator('#preset-list option').count() === 1, 'Users can delete a saved preset.');
  await page.locator('#preset-import-file').setInputFiles({ name: exportFile.suggestedFilename(), mimeType: 'application/json', buffer: exportContents });
  check(await page.locator('#preset-list option').count() === 2, 'Users can import an exported saved view.');
  await page.locator('.film-card:visible').filter({ hasText: 'Arrival' }).first().locator('.film-detail-trigger').click();
  check(await page.locator('.film-note-sources a').count() > 0, 'Compact list IDs retain linked source provenance in film details.');
  await page.getByRole('button', { name: 'Browse posters for Arrival' }).click();
  await page.locator('.poster-viewer-option').first().click();
  await page.locator('#poster-viewer-close').click();
  await page.locator('#film-detail-close').click();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has('film'));
  check((await page.locator('.film-card').filter({ hasText: 'Arrival' }).first().locator('.poster-image').getAttribute('src'))?.includes('chosen-poster.jpg'), 'Choosing an alternate poster updates the visible catalogue art.');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#site-shell:not([hidden])');
  check((await page.locator('.film-card').filter({ hasText: 'Arrival' }).first().locator('.poster-image').getAttribute('src'))?.includes('chosen-poster.jpg'), 'A selected alternate poster persists after reload.');
  await page.locator('.film-card').filter({ hasText: 'Arrival' }).first().locator('.film-detail-trigger').click();
  await page.getByRole('button', { name: 'Reset poster for Arrival to the catalogue original' }).click();
  check(await page.locator('.film-detail-poster .poster-fallback-title').textContent() === 'Arrival', 'Film details can reset one poster to its catalogue original.');
  await page.locator('#film-detail-close').click();
  await page.locator('#saved-views > summary').click();
  await page.locator('#reset-posters').click();
  check(await page.locator('#preset-status').textContent().then((text) => text.includes('Poster choices reset')), 'Global poster reset reports its outcome.');
  check(await page.locator('#preset-list option').count() === 2, 'Poster reset preserves saved views.');
  await page.locator('#clear-preferences').click();
  check(await page.locator('#preset-status').textContent().then((text) => text.includes('Local preferences cleared')), 'Clear local preferences reports its outcome.');
  check(await page.evaluate(() => localStorage.getItem('reelrank.preferences.v1')) === null, 'Clear local preferences removes only ReelRank preferences.');
  await context.close();
}

async function checkRetryLoading() {
  const { context, page } = await openSite();
  let attempts = 0;
  await page.unroute('**/data/snapshot.json');
  await page.route('**/data/snapshot.json', (route) => {
    attempts += 1;
    return attempts === 1 ? route.fulfill({ status: 503 }) : route.fulfill({ json: snapshot });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#retry-loading:visible').waitFor();
  await page.locator('#retry-loading').click();
  await page.waitForSelector('#site-shell:not([hidden])');
  check(attempts === 2, 'Retry loading makes a fresh request and restores the catalogue after a transient failure.');
  await context.close();
}

async function openSite(options = {}) {
  const { configUsername, path, localPreferences, compactSnapshot = false, ...contextOptions } = options;
  const context = await browser.newContext(contextOptions);
  if (localPreferences) await context.addInitScript((value) => {
    if (localStorage.getItem('reelrank.preferences.v1') === null) localStorage.setItem('reelrank.preferences.v1', JSON.stringify(value));
  }, localPreferences);
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  tracedContexts.add(context);
  const page = await context.newPage();
  activePage = page;
  await page.route('**/site-config.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ letterboxd_username: configUsername || snapshot.username }),
  }));
  const siteSnapshot = compactSnapshot ? (() => {
    const result = structuredClone(snapshot);
    result.source_lists = [...new Set(result.films.flatMap((film) => film.lists || []))];
    const listIndex = new Map(result.source_lists.map((url, index) => [url, index]));
    result.films.forEach((film) => { film.list_ids = (film.lists || []).map((url) => listIndex.get(url)); delete film.lists; });
    return result;
  })() : snapshot;
  await page.route('**/data/snapshot.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(siteSnapshot),
  }));
  await page.goto(`${baseUrl}${path || '/'}`, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

async function checkProgrammeSharing() {
  for (const width of [1440, 320]) {
    const { context, page } = await openSite({ viewport: { width, height: 900 }, colorScheme: width === 320 ? 'dark' : 'light', reducedMotion: 'reduce', path: '/?genre=Drama&filter=unwatched&sort=title&view=ledger' });
    await page.locator('#film-ledger-view').waitFor({ state: 'visible' });
    await page.locator('#search-input').fill('film');
    await page.locator('#programme-share > summary').click();
    await page.waitForFunction(() => new URL(document.querySelector('#programme-share-url').value).searchParams.get('q') === 'film');
    const link = await page.locator('#programme-share-url').inputValue();
    const shared = new URL(link);
    check(shared.searchParams.get('q') === 'film', `Share link includes the live search query (${link}).`);
    check(shared.searchParams.get('genre') === 'Drama' && shared.searchParams.get('filter') === 'unwatched', 'Share link includes selected facets.');
    check(shared.searchParams.get('view') === 'ledger' && shared.searchParams.get('sort') === 'title', 'Share link includes sorting and layout.');
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.copiedProgramme = text; } } }));
    await page.locator('#programme-share-copy').click();
    await page.waitForFunction(() => document.querySelector('#programme-share-status').textContent.includes('copied'));
    check(await page.evaluate((url) => window.copiedProgramme === url, link), 'Copy contains only the programme URL.');
    await page.locator('#search-input').fill('');
    await page.locator('#programme-share > summary').click();
    await page.locator('#programme-share > summary').click();
    await page.waitForFunction(() => document.querySelector('#programme-share-status').textContent === '');
    check(await page.locator('#programme-share-status').textContent() === '', 'Changing the selection clears stale copy feedback.');
    check(!new URL(await page.locator('#programme-share-url').inputValue()).searchParams.has('q'), 'Open share panel follows selection changes.');
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Clipboard unavailable'); } } }));
    await page.locator('#programme-share-copy').click();
    await page.waitForFunction(() => document.activeElement.id === 'programme-share-url');
    check(await page.locator('#programme-share-url').evaluate((input) => input.selectionEnd - input.selectionStart === input.value.length), 'Clipboard failure selects the link for manual copying.');
    await scan(page, `share programme ${width}px`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Share panel fits the viewport.');
    await page.goto(link, { waitUntil: 'domcontentloaded' });
    await page.locator('#film-ledger-view').waitFor({ state: 'visible' });
    check(await page.locator('#search-input').inputValue() === 'film', 'Opening a shared link restores the search.');
    check(await page.locator('#sort-select').inputValue() === 'title', 'Opening a shared link restores sorting.');
    await context.close();
  }
}

async function checkKeyboardAndReflow() {
  const { context, page } = await openSite({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });

  try {
    await page.waitForSelector('#site-shell:not([hidden])');
    await page.waitForSelector('.film-card');

    check(await page.getByLabel('Find a film or filmmaker', { exact: true }).count() === 1, 'Search field has an accessible name.');
    check(await page.getByLabel('Sort films').count() === 1, 'Sort control has an accessible name.');
    check(await page.getByRole('group', { name: 'Filter films', exact: true }).count() === 1, 'Watched filters have a labelled group.');
    check(await page.locator('#results-announcement').getAttribute('aria-live') === 'polite', 'Results use a polite live region.');

    await page.keyboard.press('Tab');
    await page.waitForFunction(() => document.activeElement.matches('.skip-link') && document.activeElement.getBoundingClientRect().top >= 0);
    const skipLinkState = await page.evaluate(() => {
      const link = document.activeElement;
      return {
        isSkipLink: link.classList.contains('skip-link'),
        visible: link.getBoundingClientRect().top >= 0,
        outline: getComputedStyle(link).outlineStyle,
      };
    });
    check(skipLinkState.isSkipLink && skipLinkState.visible, 'First Tab reveals the skip link.');
    check(skipLinkState.outline !== 'none', 'Keyboard focus has a visible outline.');

    await page.keyboard.press('Enter');
    check(await page.evaluate(() => document.activeElement.id === 'main-content'), 'Skip link moves focus to main content.');
    await page.keyboard.press('/');
    check(await page.evaluate(() => document.activeElement.id === 'search-input'), 'Slash shortcut focuses search.');
    const query = 'no matching title 6v2';
    await page.keyboard.type(query);
    await page.waitForFunction((value) => document.querySelector('#results-announcement').textContent.includes(value), query);
    check(await page.locator('#status-message').textContent().then((text) => text.includes('No films match')), 'Search has a clear no-results message.');
    check(await page.locator('#clear-query').isVisible(), 'A query has a visible clear action.');
    check(await page.locator('#empty-clear-query').isVisible(), 'Empty search results offer local recovery.');
    check(await page.locator('#selection-end').isHidden(), 'Empty results do not show an end-of-selection marker.');
    await page.locator('#empty-clear-query').evaluate((button) => button.click());
    check(await page.locator('#search-input').inputValue() === '', `Empty-state recovery clears the query (${JSON.stringify(await page.locator('#search-input').inputValue())}).`);
    check(await page.locator('#selection-end').isVisible(), 'A fully displayed selection has a closing marker.');
    await page.locator('#search-input').fill(query);
    await page.keyboard.press('Escape');
    check(await page.locator('#search-input').inputValue() === '', 'Escape clears the search.');

    await page.keyboard.press('/');
    await page.keyboard.press('Tab');
    check(await page.evaluate(() => document.activeElement.dataset.filter === 'all'), 'Tab moves from search into the filter buttons.');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    check(await page.evaluate(() => document.activeElement.matches('#catalog-filters > summary')), 'Tab reaches the Filters panel.');
    await page.keyboard.press('Enter');
    check(await page.locator('#catalog-filters').evaluate((element) => element.open), 'Enter opens the Filters panel.');
    await page.keyboard.press('Tab');
    check(await page.evaluate(() => document.activeElement.matches('#genre-filter > summary')), 'Tab reaches the genre disclosure inside the Filters panel.');
    await page.keyboard.press('Enter');
    check(await page.locator('#genre-filter').evaluate((element) => element.open), 'Enter opens the genre disclosure.');
    await page.keyboard.press('Tab');
    check(await page.evaluate(() => document.activeElement.id === 'close-genres'), 'Genre menu close button is keyboard reachable.');
    await page.keyboard.press('Tab');
    check(await page.evaluate(() => document.activeElement.id === 'genre-search'), 'Genre search is keyboard reachable.');
    await page.keyboard.press('Tab');
    check(await page.evaluate(() => document.activeElement.type === 'checkbox'), 'Genre options are keyboard reachable.');
    const firstGenre = await page.evaluate(() => document.activeElement.value);
    await page.keyboard.press('Space');
    await page.waitForFunction((genre) => document.querySelector('#results-announcement').textContent.includes(genre), firstGenre);
    check(await page.locator('#active-genre-filters').getByRole('button', { name: `Remove ${firstGenre} genre filter` }).count() === 1, 'Selected genre is exposed as a removable, named filter.');
    await page.keyboard.press('Escape');
    check(!(await page.locator('#genre-filter').evaluate((element) => element.open)), 'Escape closes the genre disclosure.');
    check(await page.evaluate(() => document.activeElement.matches('#genre-filter > summary')), 'Closing the genre disclosure restores focus to its trigger.');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    check(await page.evaluate(() => document.activeElement.id === 'close-genres'), 'Close control remains reachable after selecting a genre.');
    await page.keyboard.press('Enter');
    check(!(await page.locator('#genre-filter').evaluate((element) => element.open)), 'Enter activates the genre menu Close control.');
    check(await page.evaluate(() => document.activeElement.matches('#genre-filter > summary')), 'Close control returns focus to the genre trigger.');

    for (const [width, label] of [[720, '200% zoom equivalent'], [360, '400% zoom equivalent'], [320, 'narrow mobile']]) {
      await page.setViewportSize({ width, height: 900 });
      await checkCatalogueSectionFlow(page, label);
      const metrics = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth, overflowing: [...document.querySelectorAll('body *')].filter((element) => element.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map((element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}.${element.className?.baseVal || element.className || ''}:${Math.round(element.getBoundingClientRect().right)}`) }));
      check(metrics.documentWidth <= metrics.viewportWidth, `${label} has no horizontal page overflow (${metrics.documentWidth}px > ${metrics.viewportWidth}px; ${metrics.overflowing.join(', ')}).`);
      console.log(`${label}: no horizontal overflow at ${width}px CSS viewport.`);
    }

    await page.locator('#genre-filter > summary').click();
    const menuBounds = await page.locator('#genre-filter .genre-filter-menu').evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const parentBounds = document.querySelector('#genre-filter').getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, width: bounds.width, viewportWidth: window.innerWidth, parent: { left: parentBounds.left, right: parentBounds.right, width: parentBounds.width } };
    });
    check(menuBounds.left >= 0 && menuBounds.right <= menuBounds.viewportWidth, `Genre menu fits within the narrow viewport (${JSON.stringify(menuBounds)}).`);
    console.log('Keyboard navigation, accessible names, and live announcements passed.');
  } catch (error) {
    await saveDiagnostics(page, 'keyboard-and-reflow-failure');
    throw error;
  } finally {
    await context.close();
  }
}

try {
  for (const [name, options] of [
    ['desktop', { viewport: { width: 1440, height: 1000 }, colorScheme: 'light', reducedMotion: 'reduce' }],
    ['mobile', { viewport: { width: 390, height: 844 }, colorScheme: 'light', reducedMotion: 'reduce' }],
    ['dark mode', { viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', reducedMotion: 'reduce' }],
  ]) {
    if (!runs('accessibility', 'catalogue') || (requestedScenario === 'catalogue' && name !== 'desktop')) continue;
    const { context, page } = await openSite(options);
    await page.waitForSelector('#site-shell:not([hidden])');
    await page.waitForSelector('.film-card');
    await scan(page, name);
    await checkCatalogueSectionFlow(page, name);
    await checkFeaturedVisualLayout(page, name);
    await checkDetailPresentation(page, name);
    if (name === 'desktop') {
      await checkCatalogInteractions(page);
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#site-shell:not([hidden])');
      await page.locator('.film-detail-trigger:visible').first().click();
      await scan(page, 'expanded programme notes');
      await page.locator('#film-detail-close').click();
      await page.locator('#search-input').fill('no matching title 4k9z');
      await scan(page, 'no results');
    }
    await context.close();
  }

  if (runs('catalogue')) await checkHistoryPosition();
  if (runs('sharing')) await checkProgrammeSharing();
  if (runs('preferences')) await checkSavedPreferences();
  if (runs('recovery')) { await checkRetryLoading(); await checkBrokenPosterFallback(); }
  if (runs('accessibility', 'reflow')) await checkKeyboardAndReflow();

  if (runs('accessibility')) {
  const { context: setupContext, page: setupPage } = await openSite({
    viewport: { width: 320, height: 800 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
    configUsername: 'another-viewer',
  });
  await setupPage.waitForSelector('#setup-state:not([hidden])');
  await scan(setupPage, 'setup screen');
  const overflow = await setupPage.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) throw new Error('Setup screen overflows horizontally at 320px.');
  await setupContext.close();

  const { context: demoContext, page: demoPage } = await openSite({
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
    configUsername: 'another-viewer',
    path: '/?demo=1',
  });
  await demoPage.waitForSelector('#demo-banner:not([hidden])');
  const banner = await demoPage.locator('#demo-banner').innerText();
  if (!banner.includes(`@${snapshot.username}`) || !banner.includes('@another-viewer')) {
    throw new Error(`Demo banner does not clearly identify both profiles: ${banner}`);
  }
  await scan(demoPage, 'labelled demo preview');
  await demoContext.close();
  }
} catch (error) {
  await saveDiagnostics(activePage, 'browser-check-failure');
  throw error;
} finally {
  await browser.close();
}
