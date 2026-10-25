import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const baseUrl = process.env.SITE_URL || 'http://127.0.0.1:4173';
const snapshot = JSON.parse(await readFile('web/data/snapshot.json', 'utf8'));
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const browser = await chromium.launch({ headless: true });

function check(condition, message) {
  if (!condition) throw new Error(`Accessibility interaction check failed: ${message}`);
}

async function scan(page, name) {
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
}

async function openSite(options = {}) {
  const { configUsername, path, ...contextOptions } = options;
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await page.route('**/site-config.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ letterboxd_username: configUsername || snapshot.username }),
  }));
  await page.goto(`${baseUrl}${path || '/'}`, { waitUntil: 'domcontentloaded' });
  return { context, page };
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

    check(await page.getByLabel('Search film titles, years, genres, synopses, and source lists').count() === 1, 'Search field has an accessible name.');
    check(await page.getByLabel('Sort films').count() === 1, 'Sort control has an accessible name.');
    check(await page.getByRole('group', { name: 'Filter films' }).count() === 1, 'Watched filters have a labelled group.');
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
    await page.keyboard.press('Escape');
    check(await page.locator('#search-input').inputValue() === '', 'Escape clears the search.');

    await page.keyboard.press('/');
    await page.keyboard.press('Tab');
    check(await page.evaluate(() => document.activeElement.dataset.filter === 'all'), 'Tab moves from search into the filter buttons.');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    check(await page.evaluate(() => document.activeElement.matches('#genre-filter > summary')), 'Tab reaches the genre disclosure.');
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
      const metrics = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
      check(metrics.documentWidth <= metrics.viewportWidth, `${label} has no horizontal page overflow (${metrics.documentWidth}px > ${metrics.viewportWidth}px).`);
      console.log(`${label}: no horizontal overflow at ${width}px CSS viewport.`);
    }

    await page.locator('#genre-filter > summary').click();
    const menuBounds = await page.locator('.genre-filter-menu').evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const parentBounds = document.querySelector('#genre-filter').getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, width: bounds.width, viewportWidth: window.innerWidth, parent: { left: parentBounds.left, right: parentBounds.right, width: parentBounds.width } };
    });
    check(menuBounds.left >= 0 && menuBounds.right <= menuBounds.viewportWidth, `Genre menu fits within the narrow viewport (${JSON.stringify(menuBounds)}).`);
    console.log('Keyboard navigation, accessible names, and live announcements passed.');
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
    const { context, page } = await openSite(options);
    await page.waitForSelector('#site-shell:not([hidden])');
    await page.waitForSelector('.film-card');
    await scan(page, name);
    if (name === 'desktop') {
      await page.locator('.overview-toggle').first().click();
      await scan(page, 'expanded synopsis');
      await page.locator('#search-input').fill('no matching title 4k9z');
      await scan(page, 'no results');
    }
    await context.close();
  }

  await checkKeyboardAndReflow();

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
} finally {
  await browser.close();
}
