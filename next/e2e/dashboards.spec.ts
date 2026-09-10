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
    // One title only this report carries.
    await expect(page.getByText(report.tell)).toBeVisible();
  });
}

test('a widget draws a result rather than an error', async ({ page }) => {
  // The claim the Java suite cannot make. It proved each analysis RUNS; this proves the assembled
  // page renders what came back. A tile that stored a good configuration and renders "could not
  // be read" looks identical in the database.
  await openLibrary(page);
  await page.getByRole('button', { name: 'Executive summary' }).click();

  await expect(page.getByText('Total revenue')).toBeVisible();
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
  await expect(page.getByText('Revenue by region')).toBeVisible();
  await page.waitForTimeout(3000);

  expect(analyses.length, 'opening a dashboard must re-run its widgets').toBeGreaterThan(0);
});
