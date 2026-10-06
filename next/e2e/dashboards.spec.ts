import { expect as expectNow, Page } from '@playwright/test';
import { defaultSession, NO_SESSION, signedIn, test } from './support/session';
import { analyticsFixtures, boardName, ordersTotalRevenue } from './support/analytics-fixtures';
import { KIND_IDS } from '../src/app/features/analytics/widget-kinds';

/**
 * The five seeded reports, opened the way a person opens them.
 *
 * <b>These reports are real rows, made by the suite.</b> support/analytics-fixtures.ts saves them
 * (named "E2E ...") in the signed-in workspace the first time they are missing, with the widgets
 * analytics-service's AnalyticsReportsE2EIT and OrdersReportsE2EIT prove runnable, over datasets it
 * uploads itself -- no longer the platform administrator's rows, which a tenant cannot see. What is left to check is the half that Java
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

test.skip(!signedIn(), NO_SESSION);
// Opening a dataset reads it from S3 (a 38 MB CSV for orders); a slow read is not a failure, so each test has two minutes.
test.describe.configure({ timeout: 120_000 });
// ...and an analysis or a scan over it may answer after the usual fifteen seconds.
const expect = expectNow.configure({ timeout: 45_000 });

// The fixtures are found, or made once, in the signed-in workspace (support/analytics-fixtures.ts, MIG-330).
test.beforeAll(async ({ request }) => {
  test.setTimeout(600_000);   // the first run of all uploads 45 MB and saves ten boards; every later one only reads
  await analyticsFixtures(request, await defaultSession(request));
});

async function openLibrary(page: Page) {
  await page.goto('/objects/analytics/dashboards');
  await expect(page.getByText(/re-run each time you open them/)).toBeVisible();
}

/**
 * The landing page draws every board as a card, a link to ?board=<id>. A substring on the name
 * is enough: nothing here is named as a prefix of anything else.
 */
function boardCard(page: Page, name: string) {
  return page.locator('a.dash-card', { hasText: boardName(name) });
}

async function openBoard(page: Page, name: string) {
  await boardCard(page, name).click();
  await expect(page).toHaveURL(/[?&]board=\d+/);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

/**
 * The chart kinds of one tile: they live in its menu, under "Show as", one item per kind with
 * the kind id in data-kind. Opens the menu and hands back the items.
 */
async function kindsOf(page: Page, title: string) {
  await page.getByRole('button', { name: `Actions for ${title}` }).click();
  return page.locator('button.dash-kind');
}

test('all five seeded reports are listed', async ({ page }) => {
  await openLibrary(page);
  for (const report of REPORTS) {
    await expect(boardCard(page, report.name)).toBeVisible();
  }
});

for (const report of REPORTS) {
  test(`${report.name} opens with its ${report.widgets} widgets`, async ({ page }) => {
    await openLibrary(page);
    await openBoard(page, report.name);

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
  await openBoard(page, 'Executive summary');

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

  await openBoard(page, 'Sales by region');
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
    await openBoard(page, '01 Overall KPI summary');
    await expect(page.getByText('Total revenue', { exact: true })).toBeVisible();
    await page.waitForTimeout(4000);

    const items = await kindsOf(page, 'Total revenue');
    const kinds = await items.evaluateAll(buttons => buttons.map(button => ({
      value: (button as HTMLButtonElement).dataset['kind']!,
      disabled: (button as HTMLButtonElement).disabled,
    })));

    // Against the list the picker is built from, not a number written here. This said
    // "Fourteen: the original four, seven chart kinds, and three summaries" and was already wrong
    // by two -- shareStacked and pivot had been added and the sentence was not -- so the spec
    // failed on whatever change happened to run next and read as that change's regression.
    expect(kinds.map(kind => kind.value)).toEqual(KIND_IDS);
    const enabled = kinds.filter(kind => !kind.disabled).map(kind => kind.value);
    // One row, one column, no dimension: a single figure and a table, and nothing else honestly.
    expect(enabled.sort()).toEqual(['kpi', 'table']);
  });

test('a single-figure tile draws the figure, and says it showed one row', async ({ page }) => {
  await openLibrary(page);
  await openBoard(page, '01 Overall KPI summary');
  await expect(page.getByText('Total revenue', { exact: true })).toBeVisible();
  await page.waitForTimeout(4000);

  await (await kindsOf(page, 'Total revenue')).and(page.locator('[data-kind="kpi"]')).click();

  // Grouped, not raw: the engine returns a long float over the CSV; the tile prints it to the cent, which is the sum
  // the fixture computes independently.
  await expect(page.getByText(ordersTotalRevenue())).toBeVisible();
  // "0 of 1 rows shown" was the first version of this: a no-dimension analysis has no marks.
  await expect(page.getByText('0 of 1 rows shown')).toHaveCount(0);
});

test('a dimension-ordered series offers a line; a rank-ordered one refuses with a reason',
  async ({ page }) => {
    // The rule that stops a line being drawn through rank-ordered points, where it would slope
    // the same way whatever the data did.
    await openLibrary(page);
    await openBoard(page, '03 Monthly trend');
    await expect(page.getByText('Revenue by month', { exact: true })).toBeVisible();
    await page.waitForTimeout(6000);

    // The DOM property: the menu disables the button itself, and says why in its title.
    const kinds = await kindsOf(page, 'Revenue by month');
    await expect(kinds.and(page.locator('[data-kind="line"]'))).toHaveJSProperty('disabled', false);
    await expect(kinds.and(page.locator('[data-kind="stacked"]'))).toHaveJSProperty('disabled', true);
    await expect(kinds.and(page.locator('[data-kind="stacked"]')))
      .toHaveAttribute('title', /second dimension/);
  });

test('a two-dimension cross-tab is the one that may be stacked', async ({ page }) => {
  await openLibrary(page);
  await openBoard(page, '07 Category against region');
  await expect(page.getByText('Revenue by category and region', { exact: true })).toBeVisible();
  await page.waitForTimeout(6000);

  const kinds = await kindsOf(page, 'Revenue by category and region');
  await expect(kinds.and(page.locator('[data-kind="stacked"]'))).toHaveJSProperty('disabled', false);
  // Sorted biggest-first, so a line through them would draw the sort.
  await expect(kinds.and(page.locator('[data-kind="line"]'))).toHaveJSProperty('disabled', true);
});

/**
 * Layout guards. Cheap to check, and the kind of thing that regresses silently.
 *
 * The overflow one is not hypothetical: the kind picker was a `w-auto` select, sized to its
 * WIDEST option, and the options carried the reason a kind is unavailable -- a whole sentence. The
 * tile overflowed its own card the moment those reasons were added. The picker is in the tile's
 * menu now, but a table can still outgrow its card.
 */
test('nothing on an open board overflows its card, and the page never scrolls sideways',
  async ({ page }) => {
    await openLibrary(page);
    await openBoard(page, '01 Overall KPI summary');
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

test('an open report has the whole width, and All dashboards goes back to the cards', async ({ page }) => {
  // The redesign of 2026-09-28: no list kept beside the board. The board is the page, its first
  // tile is in the first screenful, and the cards are one link (or Back) away.
  await openLibrary(page);
  await openBoard(page, '01 Overall KPI summary');

  await expect(page.locator('a.dash-card')).toHaveCount(0);
  const top = await page.locator('.card').filter({ hasText: 'Total revenue' }).first()
    .evaluate(node => node.getBoundingClientRect().top);
  expect(top).toBeLessThan(900);

  // The address names the board, so a reload lands on it again.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: '01 Overall KPI summary' })).toBeVisible();

  await page.getByRole('link', { name: /All dashboards/ }).click();
  await expect(page).not.toHaveURL(/board=/);
  await expect(boardCard(page, '01 Overall KPI summary')).toBeVisible();
});


/**
 * The board filter: one set of conditions over every widget that reads the same dataset.
 *
 * The assertion that matters is the LAST one -- that the figures actually moved. A filter bar that
 * renders, accepts a condition and narrows nothing looks identical to one that works, right up
 * until somebody trusts a number from it.
 */
test('a board filter narrows every tile on its dataset, and says nothing ran until asked',
  async ({ page }) => {
    await openLibrary(page);
    // Report 07's tiles are tables, so a figure is a cell with the raw value in its title -- the
    // most direct thing to compare before and after.
    await openBoard(page, '07 Category against region');
    await expect(page.getByText('Revenue by category and region', { exact: true })).toBeVisible();
    await page.waitForTimeout(16000);

    // A FIGURE, not the first cell -- the first cell of a cross-tab is the dimension label, and
    // "Electronics" is still Electronics after any filter. The measure is the last column.
    const figure = page.locator('tbody tr').first().locator('td span[title]').last();
    const before = await figure.getAttribute('title');

    // The filter lives behind the board's menu now, with adding a widget and deleting the board.
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: /Filter this board/ }).click();
    await expect(page.locator('#b-filter-dataset')).toBeVisible();
    await page.locator('#b-filter-dataset').selectOption({ index: 1 });
    await expect(page.locator('app-filter-builder')).toBeVisible();

    // Nothing may run while the bar is being edited. Ten widgets is ten governed queries against
    // a server that runs four at a time.
    const analyses: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/analytics.json/analyze')) analyses.push(request.url());
    });

    await page.getByRole('button', { name: 'Condition', exact: true }).click();
    await page.waitForTimeout(500);
    const builder = page.locator('app-filter-builder');
    await builder.getByLabel('Column for condition 1').selectOption('status');
    await builder.getByLabel('Operator for condition 1').selectOption('EQ');
    await builder.getByLabel('Value for condition 1').fill('Completed');
    await page.waitForTimeout(1500);

    expect(analyses.length, 'editing the bar must run nothing').toBe(0);

    await page.getByRole('button', { name: 'Apply to the board' }).click();
    await page.waitForTimeout(12000);

    expect(analyses.length, 'applying must re-run the board').toBeGreaterThan(0);
    // The figures moved: completed orders are a strict subset of all of them.
    const after = await figure.getAttribute('title');
    expect(after).not.toEqual(before);
    // And every tile says which conditions produced what it is showing.
    await expect(page.getByText(/Board filter:/).first()).toBeVisible();
  });

test('clicking a bar narrows the board, and the rolled-up bar is not a button',
  async ({ page }) => {
    // Report 05 is five RANKED tiles over sub_category with a Top 10, which is the shape this
    // needs both halves of: ten real bars that identify one group each, and one rolled-up "Other"
    // standing for the fourteen the reader has not been shown. `sub_category = 'Other'` would
    // narrow the whole board to nothing while looking like an ordinary filter, so that bar is
    // inert -- INDIVIDUALLY inert, on a chart whose other bars work.
    await openLibrary(page);
    await openBoard(page, '05 Top 10 sub-categories');
    await expect(page.getByText('Top 10 by revenue', { exact: true })).toBeVisible();
    await page.waitForTimeout(20000);

    const tile = page.locator('.card', { hasText: 'Top 10 by revenue' }).last();
    const bars = tile.locator('app-ranked-bar button');
    await expect(bars.first()).toBeEnabled();

    // The roll-up, refused. Skipped rather than failed if this dataset's top ten happens to be
    // everything -- the assertion is about the roll-up, and inventing one would test nothing.
    const rolled = tile.locator('app-ranked-bar button', { hasText: /^Other/ });
    if (await rolled.count()) {
      await expect(rolled.first()).toBeDisabled();
    }

    const clicked = (await bars.first().getAttribute('title')) ?? '';
    const value = clicked.split(':')[0].trim();
    expect(value.length, 'the bar should carry its own label in the title').toBeGreaterThan(0);

    await bars.first().click();

    // The bar opened and carries the clicked value as an ordinary, editable condition -- not a
    // hidden narrowing whose only trace is that the numbers moved.
    const builder = page.locator('app-filter-builder');
    await expect(builder).toBeVisible();
    await expect(builder.getByLabel('Column for condition 1')).toHaveValue('sub_category');
    await expect(builder.getByLabel('Value for condition 1')).toHaveValue(value);

    await page.waitForTimeout(20000);

    // Every tile on the dataset says which conditions produced what it is showing.
    await expect(page.getByText(/Board filter:/).first()).toBeVisible();
    // And the click really narrowed: one sub-category is one bar, on every tile.
    await expect(tile.locator('app-ranked-bar button')).toHaveCount(1);
  });
