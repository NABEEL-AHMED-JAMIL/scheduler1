import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'fs';

/** The console's alias for the MinIO bucket that holds the fixtures; see analytics-workspace.spec.ts. */
const CONNECTION = process.env['E2E_CONNECTION'] ?? 'worker-store';

/**
 * How the workspace holds up in the dark, and on a small screen.
 *
 * Document 15 had both of these as PARTIAL with the same note: checked once, by hand. A thing
 * checked once by hand is true on the day and unverifiable after it, which is the state these
 * were in. Every assertion here runs on every suite run instead.
 *
 * <b>Contrast is checked by axe in BOTH themes, not just the light one.</b> A palette that passes
 * light and fails dark is the usual way this breaks: the tokens are redefined under a media query
 * and only one of the two ever gets looked at.
 *
 * @author Nabeel Ahmed
 */

function signedIn(): boolean {
  try {
    const state = JSON.parse(readFileSync('e2e/.auth/state.json', 'utf8'));
    return (state.origins ?? []).length > 0;
  } catch {
    return false;
  }
}

test.beforeEach(async () => {
  test.skip(!signedIn(),
    'No session. Start the stack and run with E2E_PASSWORD=… npx playwright test');
});

async function openFixture(page: Page) {
  await page.goto('/objects/analytics');
  await page.locator('select').first().selectOption(CONNECTION);
  await page.getByRole('button', { name: /analytics-samples/ }).click();
  await page.getByRole('button', { name: /orders\.csv/ }).click();
  await expect(page.getByText(/250K/)).toBeVisible();
}

/** Every element whose box escapes the viewport horizontally. */
async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const wide: string[] = [];
    const limit = document.documentElement.clientWidth;
    document.querySelectorAll('main *').forEach(element => {
      const box = element.getBoundingClientRect();
      if (box.width === 0) return;
      // Allowed IF it sits in something that scrolls sideways on purpose.
      if (element.closest('[class*="overflow-x"], [class*="scroll-table"]')) return;
      if (box.right > limit + 1) wide.push(element.tagName.toLowerCase());
    });
    return wide.slice(0, 5);
  });
}

test('the workspace fits a phone without the page scrolling sideways', async ({ page }) => {
  // A table is allowed to be wider than a phone; the PAGE is not. The difference is whether the
  // wide thing has its own scroller, which is what the check above allows for.
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixture(page);
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await expect(page.getByPlaceholder(/Search all rows/)).toBeVisible();

  expect(await overflowing(page), 'these escape the viewport').toEqual([]);
  const sideways = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(sideways, 'the page body scrolls horizontally on a phone').toBe(false);
});

test('a dashboard fits a phone too', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/objects/analytics/dashboards');
  await page.getByRole('listbox', { name: 'Dashboards' }).getByRole('option', { name: '01 Overall KPI summary' }).click();
  await expect(page.getByText('Total revenue', { exact: true })).toBeVisible();
  await page.waitForTimeout(6000);

  const sideways = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(sideways).toBe(false);
});

test('the workspace has no WCAG A/AA violations in DARK mode either', async ({ page }) => {
  // The usual way a palette breaks: tokens redefined under a media query, and only the light half
  // ever looked at.
  //
  // reducedMotion because axe is run the instant a tab is clicked, and `transition-colors` means
  // the element it measures may still be part-way between two states. That produced an
  // intermittent failure naming colours that are in neither theme -- #7d828a on #989da4 for a
  // pill whose settled values are ink-300 on ink-950, about 16:1. The app now honours the
  // preference for every transition, so asking for it here measures the colours a reader
  // actually sees rather than a frame of the animation.
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await openFixture(page);

  for (const tab of ['Overview', 'Data', 'Compact', 'Quality', 'Canvas']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map(v => `${tab}: ${v.id} — ${v.help}`)).toEqual([]);
  }
});

test('a dashboard has no WCAG A/AA violations in dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/objects/analytics/dashboards');
  await page.getByRole('listbox', { name: 'Dashboards' }).getByRole('option', { name: '04 Category distribution' }).click();
  await expect(page.getByText('Revenue share by category', { exact: true })).toBeVisible();
  await page.waitForTimeout(8000);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map(v => `${v.id} — ${v.help}`)).toEqual([]);
});

test('nothing on the page is invisible against its own background in dark mode', async ({ page }) => {
  // The failure a token that was only defined in the light block produces: text painted the same
  // colour as what is behind it. axe's contrast rule covers most of this; this catches the exact
  // case where the two are IDENTICAL, which is what a missing dark token looks like.
  await page.emulateMedia({ colorScheme: 'dark' });
  await openFixture(page);

  const invisible = await page.evaluate(() => {
    const bad: string[] = [];
    document.querySelectorAll('main *').forEach(element => {
      if (!(element.textContent ?? '').trim()) return;
      const style = getComputedStyle(element);
      if (style.color && style.backgroundColor
          && style.backgroundColor !== 'rgba(0, 0, 0, 0)'
          && style.color === style.backgroundColor) {
        bad.push(element.tagName.toLowerCase() + ' ' + style.color);
      }
    });
    return bad.slice(0, 5);
  });
  expect(invisible, 'text the same colour as its own background').toEqual([]);
});
