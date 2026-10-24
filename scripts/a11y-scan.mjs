import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const baseUrl = process.env.SITE_URL || 'http://127.0.0.1:4173';
const snapshot = JSON.parse(await readFile('web/data/snapshot.json', 'utf8'));
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const browser = await chromium.launch({ headless: true });

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
