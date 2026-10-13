import { Page } from '@playwright/test';
import { NO_SESSION, expect, signedIn, test } from './support/session';

/**
 * The "E" mark over the sidebar (owner, 2026-10-12: "logo is not aligned with the new side bar, the 'E' is to the
 * right").
 *
 * From 1440px the menu is a sidebar, and the bar's mark stands over it: the "E" on the same centre line as the nav
 * icons below it, expanded or collapsed to its icon rail, and "ETL Console" starting where the nav labels start.
 * Below 1440px there is no sidebar, and the mark starts where the page does, like the title under it.
 *
 * Layout only a browser can measure (jsdom lays nothing out), so it is pinned here rather than in a unit spec.
 */

test.skip(!signedIn(), NO_SESSION);

interface Box { x: number; centre: number }
interface Geometry { mark: Box; word: Box | null; icon: Box | null; label: Box | null; title: Box | null }

async function geometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const shown = (el: Element | null) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
    const box = (el: Element | null) => {
      if (!shown(el)) return null;
      const b = el!.getBoundingClientRect();
      return { x: b.x, centre: b.x + b.width / 2 };
    };
    return {
      mark: box(document.querySelector('header app-brand-mark .brand-e'))!,
      word: box(document.querySelector('header app-brand-mark .brand-word')),
      icon: box(document.querySelector('.app-sidebar .side-link .nav-child-icon')),
      label: box(document.querySelector('.app-sidebar .side-label')),
      title: box(document.querySelector('main h1')),
    };
  });
}

async function open(page: Page, width: number, collapsed: boolean): Promise<Geometry> {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(c => localStorage.setItem('etl_nav_collapsed', c ? '1' : '0'), collapsed);
  await page.goto('/pipelines/list');
  await expect(page.locator('main h1')).toBeVisible();
  if (width >= 1440) await expect(page.locator('.app-sidebar .side-link').first()).toBeVisible();
  return geometry(page);
}

for (const width of [1440, 1920, 2560]) {
  test(`at ${width}px the mark stands on the sidebar icons' centre line, the wordmark on the labels' edge`, async ({ page }) => {
    const g = await open(page, width, false);
    expect(Math.abs(g.mark.centre - g.icon!.centre), 'the "E" over the icons').toBeLessThanOrEqual(1);
    expect(Math.abs(g.word!.x - g.label!.x), '"ETL Console" over the labels').toBeLessThanOrEqual(1);
  });

  test(`at ${width}px, collapsed to the icon rail, the mark stays on the icons' centre line`, async ({ page }) => {
    const g = await open(page, width, true);
    expect(g.label, 'no labels on the rail').toBeNull();
    expect(Math.abs(g.mark.centre - g.icon!.centre), 'the "E" over the icons').toBeLessThanOrEqual(1);
  });
}

test('below 1440px, with the menu on the bar, the mark starts where the page does', async ({ page }) => {
  const g = await open(page, 1280, false);
  expect(g.icon, 'no sidebar').toBeNull();
  expect(Math.abs(g.mark.x - g.title!.x), 'the "E" over the title').toBeLessThanOrEqual(1);
});
