import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'fs';

/**
 * The screen driven without a pointer.
 *
 * Document 15's keyboard row said "only CodeMirror's Ctrl/Cmd+Enter", which was true: everything
 * else was reachable only because buttons are natively focusable, and reaching the grid meant
 * pressing Tab past ten view tabs one at a time.
 *
 * This is the half axe cannot check. axe reads the accessibility tree and will happily pass a
 * screen that is unusable by keyboard -- it has no opinion about focus order, about how many
 * stops something costs, or about whether a key does what a reader expects.
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
  await page.goto('/analytics');
  await page.locator('select').first().selectOption('etl-bucket');
  await page.getByRole('button', { name: /analytics-benchmark/ }).click();
  await page.getByRole('button', { name: /sales-10mb\.csv/ }).click();
  await expect(page.getByText(/150K/)).toBeVisible();
}

/** The id of whatever currently has focus, which is how the roving tabindex is observed. */
const focusedId = (page: Page) => page.evaluate(() => document.activeElement?.id ?? '');

test('the ten view tabs are ONE tab stop, not ten', async ({ page }) => {
  await openFixture(page);

  const stops = await page.locator('[id^="a-tab-"][tabindex="0"]').count();
  expect(stops).toBe(1);
  // The other nine are reachable by arrow key, not by Tab.
  expect(await page.locator('[id^="a-tab-"][tabindex="-1"]').count()).toBe(9);
});

test('arrow keys walk the strip and wrap at both ends', async ({ page }) => {
  await openFixture(page);
  await page.locator('#a-tab-overview').focus();

  await page.keyboard.press('ArrowRight');
  expect(await focusedId(page)).toBe('a-tab-data');

  await page.keyboard.press('ArrowLeft');
  expect(await focusedId(page)).toBe('a-tab-overview');

  // Left from the first lands on the last: the strip is a ring, so a reader heading for Activity
  // does not have to know it is ninth.
  await page.keyboard.press('ArrowLeft');
  expect(await focusedId(page)).toBe('a-tab-activity');

  await page.keyboard.press('Home');
  expect(await focusedId(page)).toBe('a-tab-overview');

  await page.keyboard.press('End');
  expect(await focusedId(page)).toBe('a-tab-activity');
});

test('arrowing does NOT open a tab — the scan is not spent on tabs passed over', async ({ page }) => {
  // The whole reason for manual activation. Four of these tabs are a full scan of the dataset
  // behind a four-permit governor; automatic activation would spend three of them on the way
  // from Details to Canvas.
  await openFixture(page);
  await page.locator('#a-tab-overview').focus();

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');

  // Focus has moved twice; the view has not moved at all.
  expect(await focusedId(page)).toBe('a-tab-compact');
  await expect(page.locator('#a-tab-overview')).toHaveAttribute('aria-current', 'true');
});

test('Enter opens the tab the reader arrowed to', async ({ page }) => {
  await openFixture(page);
  await page.locator('#a-tab-overview').focus();

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');

  await expect(page.locator('#a-tab-data')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByPlaceholder(/Search all rows/)).toBeVisible();
});

test('a column can be resized with the keyboard, and says what it is doing', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Data', exact: true }).click();

  const handle = page.getByRole('separator', { name: /Resize amount/ }).first();
  await expect(handle).toBeVisible();
  // Automatically sized, and it says so in the word a screen reader actually announces.
  await expect(handle).toHaveAttribute('aria-valuetext', 'automatic');

  await handle.focus();
  await page.keyboard.press('ArrowRight');

  await expect(handle).toHaveAttribute('aria-valuetext', /\d+ pixels/);
});
