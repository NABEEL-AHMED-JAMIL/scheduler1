import { test, expect, APIRequestContext, Page, TestInfo } from '@playwright/test';
import { join } from 'path';
import { api, authOf, canMintPeople, pageAs, Session, sessionAsPerson } from './support/session';
import { hasFixtures, meridian, NEEDS_FIXTURES, pipeline, riverside } from './support/fixtures';
import { ensureOrders, ORDERS } from './support/analytics-fixtures';
import { waitOnOwnerData } from './support/owner-data';

/**
 * MIG-357, "AI chooses, console draws", live on the rebuilt workspaces with qwen3:8b: a question about numbers answered as
 * an interactive chart drawn from an executed query, its figures checked against a query of our own; a pin that makes
 * a real tile; the AI Assistant's Chart tab; Visualise on a dataset and on a run's output; and a viewer who can read the
 * pinned tile but reaches no chart answer to pin.
 *
 * Needs ai-service, Analytics and the console behind :9098/:4400 with MIG-357, the three registered datasets (Riverside:
 * "Readmission encounters ...", "Hospital appointments and no-shows"; Meridian: "Retail orders") and a local model. Each
 * answer takes the model 5-30 seconds. E2E_SHOTS: a folder the screenshots are also written to, at 1920 and 1187 wide,
 * light and dark.
 */

const ANSWER_MS = 240_000;

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: false });
  const extra = process.env['E2E_SHOTS'];
  if (extra) await page.screenshot({ path: join(extra, `${name}.png`), fullPage: false });
}

/** Each width and theme, one screenshot of what is on screen now. */
async function shots(page: Page, info: TestInfo, name: string, focus?: string): Promise<void> {
  for (const width of [1920, 1187]) {
    await page.setViewportSize({ width, height: 1080 });
    for (const theme of ['light', 'dark'] as const) {
      const now = await page.evaluate(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
      // Dispatched, not clicked: an open panel's backdrop covers the header's button.
      // The top bar's theme menu (2026-10-13): open it, pick the theme.
      if (now !== theme) {
        await page.locator('button[title^="Theme:"]').first().dispatchEvent('click');
        await page.locator(`[data-theme-choice="${theme}"]`).first().dispatchEvent('click');
      }
      if (focus) await page.locator(focus).first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await shot(page, info, `${name}-${width}-${theme}`);
    }
  }
}

async function direct(request: APIRequestContext, s: Session, connection: string, path: string, sql: string): Promise<string[][]> {
  const body = await (await request.post(`${api}/analytics.json/query`, { headers: authOf(s), data: { connection, path, sql } })).json();
  expect(body.status, body.message).toBe('SUCCESS');
  return body.data.rows;
}

async function ask(page: Page, question: string): Promise<void> {
  const before = await page.locator('[data-turn]').count();
  await page.locator('#ask-question').fill(question);
  await page.locator('[data-test="ask"]').click();
  // The new turn first: the one before it is already answered, and would pass the wait below at once.
  await expect(page.locator('[data-turn]')).toHaveCount(before + 1);
  await expect(page.locator('[data-turn]').first().locator('h3')).toContainText(question);
  await expect(page.locator('[data-turn]').first()).toHaveAttribute('data-state', /answered|failed/, { timeout: ANSWER_MS });
  await expect(page.locator('[data-turn]').first()).toHaveAttribute('data-state', 'answered');
  await expect(page.locator('[data-turn]').first().locator('[data-test="chart-answer"]')).toBeVisible({ timeout: 30_000 });
}

/** The rows the answer's table shows, as text. */
async function tableRows(page: Page): Promise<string[][]> {
  return page.locator('[data-turn]').first().locator('[data-test="query-rows"] tbody tr').evaluateAll(rows =>
    rows.map(r => Array.from(r.querySelectorAll('td')).map(td => (td.textContent ?? '').trim())));
}

/** A figure as a number: the answer's table groups thousands ("698,758.58"), the direct query does not. */
const round = (v: string | number | null | undefined, places = 2) =>
  Number(Number(typeof v === 'string' ? v.replace(/,/g, '') : v).toFixed(places));

/**
 * Every figure a correct answer could hold, per group, from a query of our own: the group's rows, and for each value of
 * the outcome column its count, its percentage and its share -- whichever the model chose to chart, a figure on the
 * chart must be one of these.
 */
async function figuresBy(request: APIRequestContext, s: Session, connection: string, path: string, group: string, outcome: string):
    Promise<Map<string, number[]>> {
  const rows = await direct(request, s, connection, path,
    `SELECT "${group}", "${outcome}", count(*) FROM dataset GROUP BY 1, 2`);
  const by = new Map<string, Map<string, number>>();
  for (const [g, o, n] of rows) {
    if (!by.has(g)) by.set(g, new Map());
    by.get(g)!.set(o, Number(n));
  }
  const out = new Map<string, number[]>();
  for (const [g, counts] of by) {
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const figures = [total];
    for (const n of counts.values()) figures.push(n, 100 * n / total, n / total);
    out.set(g, figures);
  }
  return out;
}

/** Each figure of each row of the answer's table is one the data holds for that row's group. */
async function figuresHold(page: Page, want: Map<string, number[]>): Promise<number> {
  const shown = await tableRows(page);
  let checked = 0;
  for (const row of shown) {
    const figures = want.get(row[0]);
    expect(figures, `the group ${row[0]}`).toBeTruthy();
    for (const cell of row.slice(1)) {
      if (cell === '—' || Number.isNaN(Number(cell))) continue;
      const hit = figures!.some(f => Math.abs(round(f, 4) - round(cell, 4)) < 0.006 || Math.abs(round(f) - round(cell)) < 0.006);
      expect(hit, `${row[0]}: ${cell} is one of ${figures!.map(f => round(f, 4)).join(', ')}`).toBe(true);
      checked++;
    }
  }
  expect(checked, 'figures checked').toBeGreaterThan(0);
  return checked;
}

test.describe('MIG-357: charts for analytics questions', () => {
  test.skip(!hasFixtures(), NEEDS_FIXTURES);
  test.skip(!canMintPeople(), 'needs the mint script (E2E_MINT=1)');
  test.setTimeout(15 * 60_000);

  test('Riverside: readmission rate by age band and no-show rate by weekday, as charts whose figures are the data\'s',
    async ({ browser, request }, info) => {
      const s = await sessionAsPerson(request, riverside().admin);
      // Both questions read Kaggle files only the owner may upload again (support/owner-data.ts).
      await waitOnOwnerData(request, s, 'readmission', 'appointments');
      const page = await pageAs(browser, s, { viewport: { width: 1920, height: 1080 } });
      await page.goto('/data/ask');

      await ask(page, 'readmission rate by age band');
      const card = page.locator('[data-turn]').first().locator('[data-test="chart-answer"]');
      await expect(card).toHaveAttribute('data-kind', /.+/);
      // The figures on the chart are the data's: each one, against a query of our own.
      await figuresHold(page, await figuresBy(request, s, 'riverside-health-s3', 'datasets/readmission/diabetic_data.csv', 'age', 'readmitted'));
      await shots(page, info, 'ask-readmission', '[data-test="chart-answer"]');
      await page.locator('[data-test="change-chart"]').first().click();
      await expect(page.locator('[data-test="change-chart-menu"]')).toBeVisible();
      await shot(page, info, 'ask-readmission-change-chart');
      await page.keyboard.press('Escape');

      await ask(page, 'no-show rate by weekday');
      await figuresHold(page, await figuresBy(request, s, 'riverside-health-s3',
        'datasets/appointments/smart_hospital_appointment_dataset.csv', 'appointment_day', 'appointment_status'));
      await shots(page, info, 'ask-no-show', '[data-turn] [data-test="chart-answer"]');
    });

  test('Meridian: revenue by category per month, drawn per category along the month, and pinned to a new dashboard',
    async ({ browser, request }, info) => {
      const s = await sessionAsPerson(request, meridian().admin);
      // The orders sample is the suite's own (support/analytics-fixtures.ts): made again when the bucket lost it.
      await ensureOrders(request, s, meridian().storageAlias);
      const page = await pageAs(browser, s, { viewport: { width: 1920, height: 1080 } });
      await page.goto('/data/ask');
      await ask(page, 'revenue by category per month');
      const card = page.locator('[data-turn]').first().locator('[data-test="chart-answer"]');
      await expect(card).toHaveAttribute('data-kind', /lineSmooth|areaStacked|stacked|heatmap|barH|themeRiver|lineStep|lineMarkers|areaShare|groupedBar|pivot|table/);
      const want = await direct(request, s, meridian().storageAlias, ORDERS.path,
        "SELECT category, strftime(order_date, '%Y-%m-01'), sum(amount) FROM dataset GROUP BY 1, 2");
      const shown = await tableRows(page);
      const header = await page.locator('[data-turn]').first().locator('[data-test="query-rows"] thead th').allTextContents();
      const cat = header.findIndex(h => /categ/i.test(h));
      const month = header.findIndex(h => /month/i.test(h));
      const rev = header.length - 1;
      expect(shown.length).toBeGreaterThan(0);
      for (const row of shown) {
        const match = want.find(w => w[0] === row[cat] && w[1] === row[month].slice(0, 10));
        expect(match, `${row[cat]} ${row[month]}`).toBeTruthy();
        expect(round(row[rev]), `${row[cat]} ${row[month]}`).toBe(round(match![2]));
      }
      await shots(page, info, 'ask-revenue', '[data-turn] [data-test="chart-answer"]');

      const board = `AI charts ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
      await card.locator('[data-test="pin-chart"]').click();
      await page.locator('[data-test="pin-new"]').check();
      await page.locator('[data-test="pin-new-name"]').fill(board);
      await page.locator('[data-test="pin-save"]').click();
      await expect(page.locator('[data-test="pinned"]')).toContainText(board, { timeout: 20_000 });
      await shot(page, info, 'pin-done');
      await page.locator('[data-test="open-board"]').click();
      await expect(page.locator('app-analytics-widget')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('app-analytics-widget').first()).toContainText(/Revenue|revenue/, { timeout: 60_000 });
      await page.waitForTimeout(4000);
      await shots(page, info, 'pinned-board');
      info.annotations.push({ type: 'board', description: board });
    });

  test('the AI Assistant draws chart_data\'s answer in its Chart tab', async ({ browser, request }, info) => {
    const s = await sessionAsPerson(request, riverside().admin);
    // The no-show rate is the appointments file's, a Kaggle file only the owner may upload again.
    await waitOnOwnerData(request, s, 'appointments');
    const page = await pageAs(browser, s, { viewport: { width: 1920, height: 1080 } });
    await page.goto('/ai/assistant');
    await page.locator('textarea[aria-label="Message the assistant"]').fill('Show me the no-show rate by weekday as a chart.');
    // Exact: the conversation list beside the composer has questions with "send" in their names.
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.locator('[data-tab="chart"]')).toBeVisible({ timeout: ANSWER_MS });
    await page.locator('[data-tab="chart"]').click();
    await expect(page.locator('[data-test="chart-answer"]')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await shots(page, info, 'assistant-chart');
  });

  test('Visualise: a dataset in the Studio, suggested from the shape', async ({ browser, request }, info) => {
    const s = await sessionAsPerson(request, riverside().admin);
    await waitOnOwnerData(request, s, 'appointments');
    const page = await pageAs(browser, s, { viewport: { width: 1920, height: 1080 } });
    await page.goto(`/data/analytics?connection=${riverside().storageAlias}&path=` + encodeURIComponent('datasets/appointments/smart_hospital_appointment_dataset.csv'));
    await page.locator('[data-test="visualise"]').first().click();
    await expect(page.locator('[data-test="visualise"] [data-test="chart-answer"], app-visualise-panel [data-test="chart-answer"]').first())
      .toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-test="suggestions"] [data-suggestion]').first()).toBeVisible();
    await page.waitForTimeout(1500);
    await shots(page, info, 'visualise-dataset');
  });

  test('Visualise: a run\'s output, suggested from the shape', async ({ browser, request }, info) => {
    const s = await sessionAsPerson(request, riverside().admin);
    const page = await pageAs(browser, s, { viewport: { width: 1920, height: 1080 } });
    const readmission = pipeline('readmission');
    // The run's files are the run page's Outputs tab now, beside Steps, Map and Log.
    await page.goto(`/pipelines/schedules/${readmission.jobId}/runs/${readmission.run!.jobQueueId}`);
    await page.getByRole('tab', { name: /^Outputs/ }).click();
    const output = page.locator('.exec-file [data-test="visualise"]').first();
    await expect(output).toBeVisible({ timeout: 30_000 });
    await output.click();
    await expect(page.locator('app-visualise-panel [data-test="chart-answer"]').first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await shots(page, info, 'visualise-run-output');
  });

  test('a viewer reads the pinned tile but reaches no chart answer to pin', async ({ browser, request }, info) => {
    const viewer = await sessionAsPerson(request, meridian().viewer);
    const boards = await (await request.get(`${api}/analyticsWorkspace.json/fetchAllDashboards`, { headers: authOf(viewer) })).json();
    const pinned = (boards.data ?? []).find((b: { dashboardName: string }) => b.dashboardName.startsWith('AI charts '));
    test.skip(!pinned, 'no "AI charts" board yet: the Meridian test pins one');
    const page = await pageAs(browser, viewer, { viewport: { width: 1920, height: 1080 } });
    await page.goto(`/data/analytics/dashboards?board=${pinned.analyticsDashboardId}`);
    await expect(page.locator('app-analytics-widget').first()).toContainText(/Revenue|revenue/, { timeout: 60_000 });
    await page.waitForTimeout(3000);
    await shots(page, info, 'viewer-board');
    // Ask your data is not the viewer's page: the route says so, and no chart answer -- or its Pin -- is on screen.
    await page.goto('/data/ask');
    await expect(page).toHaveURL(/unauthorized/);
    await expect(page.locator('[data-test="pin-chart"]')).toHaveCount(0);
    await shot(page, info, 'viewer-ask-refused');
  });
});

