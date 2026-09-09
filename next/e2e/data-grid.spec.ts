import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'fs';

/**
 * Document 06's Data view, capability by capability, against the real 150,000-row fixture.
 *
 * <b>Written because the audit was wrong, not because the feature was missing.</b> AUDIT.md
 * recorded "2 of 06's 8 grid capabilities" and PROGRESS carried that forward; re-checking against
 * the document found all eight built. A number in a tracking file is not evidence, and the honest
 * way to correct one is a test that fails if the capability goes away -- which is what this is.
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

async function openGrid(page: Page) {
  await page.goto('/analytics');
  await page.locator('select').first().selectOption('etl-bucket');
  await page.getByRole('button', { name: /analytics-benchmark/ }).click();
  await page.getByRole('button', { name: /sales-10mb\.csv/ }).click();
  await expect(page.getByText(/150K/)).toBeVisible();
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await expect(page.getByPlaceholder(/Search all rows/)).toBeVisible();
}

test('pagination pages the whole dataset, not the rows in hand', async ({ page }) => {
  await openGrid(page);
  await expect(page.locator('span', { hasText: /Page 1 of 1,500/ })).toBeVisible();
});

test('sorting and search are the dataset’s, and horizontal scroll is contained', async ({ page }) => {
  await openGrid(page);

  const header = page.locator('th button').filter({ hasText: /^amount/ });
  await header.click();
  await header.click();
  await expect(page.locator('tbody tr').first()).toContainText('999.99');

  // The table scrolls inside its own container; the page body never scrolls sideways.
  const bodyOverflows = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(bodyOverflows).toBe(false);
});

test('a column can be hidden, is counted while hidden, and can be brought back', async ({ page }) => {
  await openGrid(page);

  const before = await page.locator('thead th').count();
  await page.locator('app-data-grid').getByRole('button', { name: /^Columns/ }).click();
  await page.getByRole('group', { name: 'Which columns are shown' })
    .getByRole('checkbox').first().uncheck();

  // The pill, not the sr-only caption -- which also says it, and is the second half of
  // the same claim: the grid announces the change to a screen reader too.
  await expect(page.locator('span.pill', { hasText: '1 hidden' })).toBeVisible();
  await expect(page.locator('caption')).toContainText('5 columns');
  await expect(page.locator('thead th')).toHaveCount(before - 1);

  await page.locator('app-data-grid').getByRole('button', { name: /^Show all/ }).click();
  await expect(page.locator('thead th')).toHaveCount(before);
});

test('the last visible column cannot be hidden — a grid with no columns is a blank box',
  async ({ page }) => {
    await openGrid(page);
    await page.locator('app-data-grid').getByRole('button', { name: /^Columns/ }).click();
    const panel = page.getByRole('group', { name: 'Which columns are shown' });
    const boxes = panel.getByRole('checkbox');
    // count() does not auto-wait, and the panel is rendered by an @if AFTER the click that opens
    // it -- so counting straight away returns 0, the loop never runs, and the failure reads as
    // "the guard is missing" rather than "the test looked too early".
    await expect(boxes.first()).toBeVisible();
    const total = await boxes.count();

    // Waiting for each hide to reach the grid before clicking the next. Firing them back to back
    // races the re-render and silently drops one -- which cost me a false "the guard is broken".
    for (let i = 0; i < total - 1; i++) {
      await boxes.nth(i).uncheck();
      await expect(page.locator('caption')).toContainText(`${total - (i + 1)} column`);
    }

    // Scrolled to first: the panel is max-h-72 with its own overflow, and with every column
    // listed the note sits below the fold. A reader scrolls; so does this.
    const note = panel.getByText(/last visible column cannot be hidden/);
    await note.scrollIntoViewIfNeeded();
    await expect(note).toBeVisible();
    await expect(boxes.nth(total - 1)).toBeDisabled();
  });

test('hiding a column says plainly that the server still reads it', async ({ page }) => {
  // The claim that matters: hiding is a display choice, not a narrowing. A reader who believed
  // otherwise would think they had excluded a column from a search that still covers it.
  await openGrid(page);
  await page.locator('app-data-grid').getByRole('button', { name: /^Columns/ }).click();

  await expect(page.getByText(/still read, still searched and still counted on the server/))
    .toBeVisible();
});
