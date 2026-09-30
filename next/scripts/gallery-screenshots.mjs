// MIG-257: screenshots of the dev-only component gallery, in both themes.
//
// Needs a DEVELOPMENT server, since a production build has no gallery route:
//   npx ng serve --port 4466        (then, in another shell)
//   node scripts/gallery-screenshots.mjs [baseUrl]
//
// Writes test-results/mig257-gallery/: the whole page per theme, one image per section per theme,
// and one with the toasts showing. test-results/ is git-ignored.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4466';
const out = 'test-results/mig257-gallery';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
    await page.goto(`${base}/dev/gallery?theme=${theme}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-gallery="charts"] app-heatmap');
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    if (isDark !== (theme === 'dark')) throw new Error(`theme did not switch to ${theme}`);
    await page.screenshot({ path: `${out}/gallery-${theme}-full.png`, fullPage: true });
    for (const section of await page.$$eval('[data-gallery]', els => els.map(e => e.getAttribute('data-gallery')))) {
      await page.locator(`[data-gallery="${section}"]`).screenshot({ path: `${out}/${theme}-${section}.png` });
    }
    await page.getByRole('button', { name: 'Show toasts' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${theme}-toasts.png` });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`screenshots in ${out}`);
