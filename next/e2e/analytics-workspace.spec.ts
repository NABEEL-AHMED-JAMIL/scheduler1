import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'fs';

/**
 * The alias the deployed console gives the MinIO bucket that holds the fixtures. It was
 * "etl-bucket" when these specs were written and is "worker-store" on the current stack; an
 * alias nobody has fails every spec at the first select, which looks nothing like what it is.
 */
const CONNECTION = process.env['E2E_CONNECTION'] ?? 'worker-store';

/**
 * The flow recorded in .ai/spec/E2E-FLOW.md, automated.
 *
 * <b>A note on selectors.</b> Several assertions here are scoped to a specific element rather
 * than to page text, and they had to be: the Canvas lists every saved analysis by name, and once
 * the report catalogues were seeded that list held 133 of them. A page-wide match on "by region"
 * then found twenty-seven saved analyses as well as the heading it meant. The looser version was
 * only ever correct in an empty workspace, which is not a state anybody's actually is in.
 *
 * Each test is one of that document's numbered steps, and the assertions are its "what proves it"
 * column. They read the SCREEN rather than component state on purpose: both defects this suite
 * exists because of were about what the assembled page says, and both were invisible to 1,065
 * unit tests that asserted signals.
 *
 * @author Nabeel Ahmed
 */

const DATASET = 'sales-10mb.csv';
const ROWS = '150,000';

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

/** Opens the fixture and waits for the workspace to describe it. */
async function openFixture(page: Page) {
  await page.goto('/objects/analytics');
  await page.getByLabel(/connection/i).or(page.locator('select').first())
    .selectOption(CONNECTION);
  await page.getByRole('button', { name: /analytics-benchmark/ }).click();
  await page.getByRole('button', { name: new RegExp(DATASET.replace('.', '\\.')) }).click();
  await expect(page.getByText(/150K/)).toBeVisible();
}

test('1 — the workspace opens a real dataset and offers all nine tabs', async ({ page }) => {
  // Nine, not ten: Columns was merged into Compact (its card opens under the row it describes),
  // and Details became the Overview.
  await openFixture(page);
  for (const tab of ['Overview', 'Data', 'Compact', 'Profile',
                     'Quality', 'Canvas', 'SQL', 'Charts', 'Activity']) {
    await expect(page.getByRole('button', { name: tab, exact: true })).toBeVisible();
  }
});

test('2 — sorting is the dataset’s, not the page’s', async ({ page }) => {
  // The most convincing wrong answer this screen could give: a grid that sorts the hundred rows
  // it happens to be holding looks exactly like one that sorted the hundred and fifty thousand.
  await openFixture(page);
  await page.getByRole('button', { name: 'Data', exact: true }).click();

  const header = page.locator('th button').filter({ hasText: /^amount/ });
  await header.click();
  await header.click();
  await expect(page.locator('th').filter({ has: page.locator('button', { hasText: /^amount/ }) }))
    .toHaveAttribute('aria-sort', 'descending');

  // 999.99 is the maximum across the whole file. The maximum of page one alone is far lower.
  await expect(page.locator('tbody tr').first()).toContainText('999.99');
});

test('3 — a search narrows on the server and says so against the whole file', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Data', exact: true }).click();

  await page.getByPlaceholder(/Search all rows/).fill('cust-26813');
  // "3 of 150,000" and not a bare "3": a narrowed count must never read as the size of the file.
  await expect(page.locator('p', { hasText: new RegExp(`of ${ROWS} rows`) })).toBeVisible();
});

test('4 — clearing a search restores the dataset rather than leaving it shrunk', async ({ page }) => {
  // The knownTotal trap in its second, worse direction. Clearing a filter is not narrowing, so the
  // request used to take the trusting branch while the client still held the filtered total, and
  // pages that exist stopped being offered.
  await openFixture(page);
  await page.getByRole('button', { name: 'Data', exact: true }).click();

  const search = page.getByPlaceholder(/Search all rows/);
  await search.fill('cust-26813');
  await expect(page.locator('p', { hasText: new RegExp(`of ${ROWS} rows`) })).toBeVisible();

  await search.fill('');
  await expect(page.locator('span', { hasText: /Page 1 of 1,500 · 100 rows a page/ })).toBeVisible();
});

test('5 — a drill narrows, and the breadcrumb takes you back where you started', async ({ page }) => {
  // The defect found by hand on 2026-09-09: "All rows" removed the filter and left the reader
  // grouped by the column they had drilled INTO, so the crumb promised a return and delivered a
  // different analysis.
  await openFixture(page);
  await page.getByRole('button', { name: 'Canvas', exact: true }).click();

  await page.locator('#a-dim-0').selectOption('region');
  await page.getByRole('button', { name: /Run analysis/ }).click();
  await expect(page.locator('h4', { hasText: /by region/ })).toBeVisible();

  await page.locator('#a-drill-next').selectOption('customer');
  await page.locator('#a-drill-dim').selectOption('region');
  await page.getByRole('button', { name: 'Drill', exact: true }).first().click();
  await expect(page.locator('h4', { hasText: /by customer/ })).toBeVisible();
  await expect(page.getByText('Filtered to', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'All rows', exact: true }).click();
  await expect(page.locator('h4', { hasText: /by region/ })).toBeVisible();
  await expect(page.getByText('Filtered to', { exact: true })).toHaveCount(0);
});

test('6 — Quality names what it checked instead of showing a green tick', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Quality', exact: true }).click();

  await expect(page.getByText(/Nothing needs attention/)).toBeVisible();
  await expect(page.getByText(/Checked 6 columns/)).toBeVisible();
  // The limit it states about itself. A clean bill that hid this would be overclaiming.
  await expect(page.getByText(/Duplicate rows are not part of this check/)).toBeVisible();
});

test('7 — Compact labels its estimates as estimates', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Compact', exact: true }).click();

  await expect(page.getByText(/COLUMN/i).first()).toBeVisible();
  // The distinct figures come from a HyperLogLog sketch and must never render as exact counts.
  await expect(page.getByText('≈', { exact: false }).first()).toBeVisible();
});

test('8 — dashboards say they re-run rather than caching a result', async ({ page }) => {
  await page.goto('/objects/analytics/dashboards');
  await expect(page.getByText(/re-run every time it is opened/)).toBeVisible();
});

test('9 — the saved-analysis library is reachable from the menu, not just by typing its address',
  async ({ page }) => {
    // It had a route and no entry. A page you can only reach by knowing the URL is a page nobody
    // reaches, and no unit test can see the difference -- the route existed and resolved fine.
    await page.goto('/objects/analytics');
    await page.getByRole('button', { name: 'Object Browser' }).click();
    await page.getByRole('link', { name: /Saved Analyses/ }).click();
    await expect(page).toHaveURL(/\/analytics\/dashboards/);
    await expect(page.getByText(/re-run every time it is opened/)).toBeVisible();
  });

test('10 — a Canvas drill narrows the Data tab, and says so', async ({ page }) => {
  // Document 07's "clicking a result applies a filter to the data table". The proof that it is
  // the SERVER narrowing and not the page hiding rows is the count: 150,000 has to become the
  // number of rows in one region, over the whole file, not a filtered view of the hundred in hand.
  await openFixture(page);
  await page.getByRole('button', { name: 'Canvas', exact: true }).click();
  await page.locator('#a-dim-0').selectOption('region');
  await page.getByRole('button', { name: /Run analysis/ }).click();
  await expect(page.locator('h4', { hasText: /by region/ })).toBeVisible();

  await page.locator('#a-drill-dim').selectOption('region');
  await page.getByRole('button', { name: 'Drill', exact: true }).first().click();
  await expect(page.getByText('Filtered to', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await expect(page.getByText('Narrowed by the Canvas')).toBeVisible();
  // The fixture holds five regions of 30,000 rows each. 30,000 is therefore the whole of one
  // region and not a filtered view of the hundred the page was holding -- the difference between
  // the server narrowing the dataset and the browser hiding rows, which is the entire claim.
  // "of 150,000" is the second half: a narrowed count must still name what it was narrowed FROM.
  await expect(page.locator('p', { hasText: /of 150,000 rows/ }))
    .toHaveText('30,000 of 150,000 rows');
  // 1,500 pages became 300: the pager divides the NARROWED total, and says which it is.
  await expect(page.locator('span', { hasText: /rows a page/ }))
    .toHaveText(/Page 1 of 300\s+·\s+100 rows a page\s+·\s+pages of the rows that match/);

  // And the reader can put it back.
  await page.getByRole('button', { name: 'Show all rows' }).click();
  await expect(page.getByText('Narrowed by the Canvas')).toHaveCount(0);
});

test('11 — a date column can be bucketed by month, and the heading says so', async ({ page }) => {
  // The gap that limited this module most: grouping a DATE column gave one bucket per day, so
  // "revenue by month" -- the grain a business reads -- was not expressible at all.
  await page.goto('/objects/analytics');
  await page.locator('select').first().selectOption(CONNECTION);
  await page.getByRole('button', { name: /analytics-samples/ }).click();
  await page.getByRole('button', { name: /orders\.csv/ }).click();
  await expect(page.getByText(/250K/)).toBeVisible();
  await page.getByRole('button', { name: 'Canvas', exact: true }).click();

  // A text column is offered no bucket: the server refuses a grain on one, rightly, and the
  // picker must not walk anybody into that.
  await page.locator('#a-dim-0').selectOption('region');
  await expect(page.locator('#a-grain-0')).toHaveCount(0);

  await page.locator('#a-dim-0').selectOption('order_date');
  await expect(page.locator('#a-grain-0')).toBeVisible();
  await page.locator('#a-grain-0').selectOption('MONTH');
  await page.locator('#a-agg').selectOption('SUM');
  await page.locator('#a-measure-field').selectOption('amount');
  await page.getByRole('button', { name: /Run analysis/ }).click();

  // Two years of orders: 24 months, not 730 days.
  await expect(page.locator('tbody tr')).toHaveCount(24);
  await expect(page.locator('thead th').first()).toContainText('order_date_month');
  // The heading has to carry the grain too. A row labelled 2024-07-01 under "by order_date"
  // reads as one day's takings rather than July's.
  await expect(page.locator('h4', { hasText: /Sum of amount by order_date by month/ }))
    .toBeVisible();
});
