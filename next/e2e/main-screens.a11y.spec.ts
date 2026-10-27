import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { canSignIn, NEEDS, pageAs, sessionFor } from './support/session';

/**
 * ZT-C8 (the zero-tolerance campaign's accessibility pass, 2026-10-21): WCAG 2.1 A and AA by axe on the console's main screens
 * as a workspace administrator, light and dark, at 1920 and 1024 -- and a keyboard pass: the first 40 Tab stops of each screen
 * have a name a screen reader says and a visible focus ring. accessibility.spec.ts does the same for Analytics Studio's tabs.
 *
 * Found by it: the selected invoice's second line (#676f7f on the selection, 4.08:1) and an inactive API client's scopes (a row
 * dimmed with opacity, 3.34:1). What axe cannot judge -- whether a name is meaningful, whether focus order makes sense -- is not
 * covered here; keyboard.spec.ts walks two screens by hand.
 */
const SCREENS = ['/dashboard', '/runs/latest', '/data', '/reports/library', '/billing/usage', '/billing/invoices', '/forms/builder',
  '/administration/users', '/developers/api-clients'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1920, 1024]) {
    test(`${theme} at ${width}: the main screens pass axe and every early Tab stop is named and shows its focus`, async ({ browser, request }) => {
      test.skip(!canSignIn('admin'), NEEDS.admin);
      test.setTimeout(240_000);
      const session = await sessionFor(request, 'admin');
      const page = await pageAs(browser, session, { viewport: { width, height: width >= 1920 ? 1080 : 768 }, colorScheme: theme });
      const problems: string[] = [];
      for (const route of SCREENS) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(800);
        const axe = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        for (const v of axe.violations) problems.push(`${route}: ${v.id} (${v.impact}) on ${v.nodes.length}: ${v.nodes[0]?.target.join(' ')}`);
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        for (let i = 0; i < 40; i++) {
          await page.keyboard.press('Tab');
          const stop = await page.evaluate(() => {
            const e = document.activeElement as HTMLElement | null;
            if (!e || e === document.body) return null;
            const cs = getComputedStyle(e);
            const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (!!cs.boxShadow && cs.boxShadow !== 'none');
            const labelledBy = e.getAttribute('aria-labelledby');
            const name = (e.getAttribute('aria-label') || (labelledBy ? document.getElementById(labelledBy)?.textContent : '') || e.getAttribute('title')
              || e.innerText || (e as HTMLInputElement).labels?.[0]?.innerText || e.getAttribute('placeholder') || e.getAttribute('alt') || '').trim();
            return { what: `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}`, ring, name };
          });
          if (!stop) break;
          if (!stop.name) problems.push(`${route}: Tab stop ${i + 1} (${stop.what}) has no name`);
          if (!stop.ring) problems.push(`${route}: Tab stop ${i + 1} (${stop.what} "${stop.name.slice(0, 30)}") shows no focus`);
        }
      }
      await page.context().close();
      expect(problems).toEqual([]);
    });
  }
}
