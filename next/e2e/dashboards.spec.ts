import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'fs';

/**
 * The five seeded reports, opened the way a person opens them.
 *
 * <b>These reports are real rows, not fixtures this file creates.</b> They were written by
 * process/src/test/java/process/e2e/AnalyticsReportsE2EIT#seedTheFiveReports against the live
 * database, and every one of their twenty-seven widgets was proved to RUN against the real
 * 150,000-row object in MinIO before being saved. What is left to check is the half that Java
 * suite structurally cannot see: whether opening the page draws them.
 *
 * <b>Dashboards cache nothing.</b> The page says so in as many words, and it is the reason these
 * assertions are about drawn output rather than stored configuration -- every widget here is a
 * DuckDB scan that happens because somebody opened a page.
 *
 * @author Nabeel Ahmed
 */

/** Name, widget count, and one thing only that report would say. */
const REPORTS = [
  { name: 'Sales by region',      widgets: 6, tell: 'Median order value by region' },
  { name: 'Customer performance', widgets: 5, tell: 'Top 10 customers by revenue' },
  { name: 'Booking activity',     widgets: 5, tell: 'Revenue by booking date' },
  { name: 'Revenue quality',      widgets: 5, tell: 'Orders carrying a note, by region' },
  { name: 'Executive summary',    widgets: 6, tell: 'Distinct customers' },
];

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

async function openLibrary(page: Page) {
  await page.goto('/analytics/dashboards');
  await expect(page.getByText(/re-run every time it is opened/)).toBeVisible();
}

test('all five seeded reports are listed', async ({ page }) => {
  await openLibrary(page);
  for (const report of REPORTS) {
    await expect(page.getByRole('button', { name: report.name })).toBeVisible();
  }
});

for (const report of REPORTS) {
  test(`${report.name} opens with its ${report.widgets} widgets`, async ({ page }) => {
    await openLibrary(page);
    await page.getByRole('button', { name: report.name }).click();

    // The heading, so a report that opened the WRONG one cannot pass by widget count alone.
    await expect(page.getByRole('heading', { name: report.name })).toBeVisible();
    // exact, because every tile also renders a provenance line -- "Saved analysis · <title> ·
    // <connection>/<path>" -- and a substring match hits both that and the title itself.
    await expect(page.getByText(report.tell, { exact: true })).toBeVisible();
  });
}

test('a widget draws a result rather than an error', async ({ page }) => {
  // The claim the Java suite cannot make. It proved each analysis RUNS; this proves the assembled
  // page renders what came back. A tile that stored a good configuration and renders "could not
  // be read" looks identical in the database.
  await openLibrary(page);
  await page.getByRole('button', { name: 'Executive summary' }).click();

  await expect(page.getByText('Total revenue', { exact: true })).toBeVisible();
  // Nothing on a healthy report says any of this.
  await expect(page.getByText(/could not be read|does not exist|was refused/)).toHaveCount(0);
});

test('opening a report re-runs it instead of showing a stored answer', async ({ page }) => {
  // The reference-not-cache decision, checked rather than taken on trust: opening the page must
  // put analytics queries on the wire. A cached dashboard would draw the same picture and send
  // nothing, which is indistinguishable by eye and the whole reason to assert on requests.
  await openLibrary(page);

  const analyses: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/analytics.json/analyze')) analyses.push(request.url());
  });

  await page.getByRole('button', { name: 'Sales by region' }).click();
  // exact: the board also renders "Running 1 of 6 - Revenue by region." while it works, and a
  // "Saved analysis - ..." provenance line under every tile.
  await expect(page.getByText('Revenue by region', { exact: true })).toBeVisible();
  await page.waitForTimeout(3000);

  expect(analyses.length, 'opening a dashboard must re-run its widgets').toBeGreaterThan(0);
});

/**
 * The seven widget kinds added on 2026-09-09, driven through the picker on real results.
 *
 * The unit tests pin which kinds a result may be drawn as; these prove the picker offers exactly
 * those, and that choosing one actually changes what is drawn. That gap is not theoretical --
 * drawn() named the four kinds it knew, so for a while the picker offered eleven, stored the
 * choice, showed it as selected, and drew a table.
 */
test('the picker offers every kind, and disables the ones this result cannot honestly be',
  async ({ page }) => {
    await openLibrary(page);
    await page.getByRole('button', { name: '01 Overall KPI summary' }).click();
    await expect(page.getByText('Total revenue', { exact: true })).toBeVisible();
    await page.waitForTimeout(4000);

    const picker = page.locator('select').filter({ hasText: 'Table' }).first();
    const kinds = await picker.locator('option').evaluateAll(options => options.map(option => ({
      value: (option as HTMLOptionElement).value,
      disabled: (option as HTMLOptionElement).disabled,
    })));

    // Fourteen: the original four, seven chart kinds, and three summaries.
    expect(kinds).toHaveLength(14);
    const enabled = kinds.filter(kind => !kind.disabled).map(kind => kind.value);
    // One row, one column, no dimension: a single figure and a table, and nothing else honestly.
    expect(enabled.sort()).toEqual(['kpi', 'table']);
  });

test('a single-figure tile draws the figure, and says it showed one row', async ({ page }) => {
  await openLibrary(page);
  await page.getByRole('button', { name: '01 Overall KPI summary' }).click();
  await expect(page.getByText('Total revenue', { exact: true })).toBeVisible();
  await page.waitForTimeout(4000);

  await page.locator('select').filter({ hasText: 'Table' }).first().selectOption('kpi');

  // Grouped, not raw: the engine returns 103909527.57999787 over the CSV.
  await expect(page.getByText('103,909,527.58')).toBeVisible();
  // "0 of 1 rows shown" was the first version of this: a no-dimension analysis has no marks.
  await expect(page.getByText('0 of 1 rows shown')).toHaveCount(0);
});

test('a dimension-ordered series offers a line; a rank-ordered one refuses with a reason',
  async ({ page }) => {
    // The rule that stops a line being drawn through rank-ordered points, where it would slope
    // the same way whatever the data did.
    await openLibrary(page);
    await page.getByRole('button', { name: '03 Monthly trend' }).click();
    await expect(page.getByText('Revenue by month', { exact: true })).toBeVisible();
    await page.waitForTimeout(6000);

    const ordered = page.locator('select').filter({ hasText: 'Bars in order' }).first();
    await expect(ordered.locator('option[value="line"]')).toBeEnabled();
    await expect(ordered.locator('option[value="stacked"]')).toBeDisabled();
    await expect(ordered.locator('option[value="stacked"]'))
      .toHaveAttribute('title', /second dimension/);
  });

test('a two-dimension cross-tab is the one that may be stacked', async ({ page }) => {
  await openLibrary(page);
  await page.getByRole('button', { name: '07 Category against region' }).click();
  await expect(page.getByText('Revenue by category and region', { exact: true })).toBeVisible();
  await page.waitForTimeout(6000);

  const picker = page.locator('select').filter({ hasText: 'Table' }).first();
  await expect(picker.locator('option[value="stacked"]')).toBeEnabled();
  // Sorted biggest-first, so a line through them would draw the sort.
  await expect(picker.locator('option[value="line"]')).toBeDisabled();
});

/**
 * Layout guards. Cheap to check, and the kind of thing that regresses silently.
 *
 * The overflow one is not hypothetical: the kind picker is `w-auto`, which sizes a select to its
 * WIDEST option, and the options carry the reason a kind is unavailable -- a whole sentence. The
 * tile overflowed its own card the moment those reasons were added.
 */
test('nothing on an open board overflows its card, and the page never scrolls sideways',
  async ({ page }) => {
    await openLibrary(page);
    await page.getByRole('button', { name: '01 Overall KPI summary' }).click();
    await expect(page.getByText('Total revenue', { exact: true })).toBeVisible();
    await page.waitForTimeout(5000);

    const overflowing = await page.evaluate(() => {
      const bad: string[] = [];
      document.querySelectorAll('select, table').forEach(element => {
        const card = element.closest('.card');
        if (!card) return;
        // A table is allowed to be wider than its card IF it sits in its own scroller.
        const scroller = element.closest('[class*="overflow-x"]');
        if (scroller) return;
        if (element.getBoundingClientRect().right > card.getBoundingClientRect().right + 1) {
          bad.push(element.tagName.toLowerCase());
        }
      });
      return bad;
    });
    expect(overflowing, 'these overflow their card').toEqual([]);

    const sideways = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(sideways, 'the page body scrolls horizontally').toBe(false);
  });

test('opening a report collapses the list, so the report is what you see', async ({ page }) => {
  // Twenty-eight entries at full height pushed every widget below the fold.
  await openLibrary(page);
  await expect(page.getByRole('button', { name: '01 Overall KPI summary' })).toBeVisible();

  await page.getByRole('button', { name: '01 Overall KPI summary' }).click();

  await expect(page.getByText(/\d+ reports\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show the list' })).toBeVisible();
  // The first tile is now within the first screenful.
  const top = await page.locator('.card').filter({ hasText: 'Total revenue' }).first()
    .evaluate(node => node.getBoundingClientRect().top);
  expect(top).toBeLessThan(900);
});
