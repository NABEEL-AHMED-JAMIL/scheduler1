import { APIRequestContext, expect as expectNow, Locator, Page } from '@playwright/test';
import { api, authOf, defaultSession, NO_SESSION, Session, signedIn, test } from './support/session';
import { analyticsFixtures, ORDERS, PREFIX } from './support/analytics-fixtures';

/**
 * A click on a mark of every ECharts kind narrows the board, as a click on an SVG bar does
 * (owner, 2026-10-06: "events for echarts not working").
 *
 * One board, "E2E chart events", one tile per kind, every tile an ANALYSIS over the orders file:
 * a saved query's tile cannot be narrowed at all (that endpoint takes SQL and nothing else), which
 * is why the bars-and-a-line and the candlestick, which need two or four measures only a query
 * returns, are not here. The board and its analyses are made the first time they are missing and
 * kept, like every other "E2E" fixture.
 *
 * Each tile: find a mark by moving over the chart until ECharts shows the pointer cursor (it shows
 * it only over a mark that narrows), click it, and read the condition the board filter opened with.
 * A narrowing re-runs the board, which is stopped at once so the next click is not ignored.
 *
 * @author Nabeel Ahmed
 */

test.skip(!signedIn(), NO_SESSION);
const expect = expectNow.configure({ timeout: 45_000 });

const BOARD = `${PREFIX}chart events`;
const sum = { aggregation: 'SUM', field: 'amount' };
const SOURCES: Record<string, Record<string, unknown>> = {
  category: { dimensions: ['category'], measure: sum, sort: { by: 'MEASURE', direction: 'DESC' } },
  month: { dimensions: ['order_month'], measure: sum, sort: { by: 'DIMENSION', direction: 'ASC' } },
  categoryRegion: { dimensions: ['category', 'region'], measure: sum, sort: { by: 'MEASURE', direction: 'DESC' } },
  monthRegion: { dimensions: ['order_month', 'region'], measure: sum, sort: { by: 'DIMENSION', direction: 'ASC' } },
  categoryRegionChannel: { dimensions: ['category', 'region', 'channel'], measure: sum, sort: { by: 'MEASURE', direction: 'DESC' } },
  day: { dimensions: ['order_date'], measure: sum, sort: { by: 'DIMENSION', direction: 'ASC' } },
  dayChannel: { dimensions: ['order_date', 'channel'], measure: sum, sort: { by: 'DIMENSION', direction: 'ASC' } },
  hour: { dimensions: ['order_hour'], measure: sum, sort: { by: 'DIMENSION', direction: 'ASC' } },
  hourQuantity: { dimensions: ['order_hour', 'quantity'], measure: sum, sort: { by: 'DIMENSION', direction: 'ASC' } },
  oneCategory: { dimensions: ['category'], measure: sum, sort: { by: 'MEASURE', direction: 'DESC' },
    filters: { op: 'AND', clauses: [{ field: 'category', operator: 'EQ', value: 'Beauty' }] } },
};
const KINDS: [string, keyof typeof SOURCES][] = [
  ['barH', 'category'], ['waterfall', 'category'], ['pareto', 'category'], ['polarBar', 'category'], ['pictorialBar', 'category'],
  ['lineSmooth', 'month'], ['lineStep', 'month'], ['lineMarkers', 'month'], ['areaStacked', 'monthRegion'], ['areaShare', 'monthRegion'],
  ['rose', 'category'], ['halfDonut', 'category'], ['nestedPie', 'categoryRegion'],
  ['scatterTrend', 'hour'], ['bubble', 'hourQuantity'], ['effectScatter', 'hour'],
  ['boxplot', 'categoryRegion'], ['density', 'categoryRegion'], ['treemap', 'categoryRegion'], ['sunburst', 'categoryRegionChannel'],
  ['tree', 'categoryRegion'], ['sankey', 'categoryRegionChannel'], ['chord', 'categoryRegion'], ['heatmap', 'categoryRegion'],
  ['calendar', 'day'], ['funnel', 'category'], ['gauge', 'oneCategory'], ['radar', 'categoryRegion'], ['parallel', 'categoryRegion'],
  ['themeRiver', 'dayChannel'],
];

async function post(request: APIRequestContext, s: Session, path: string, data: unknown): Promise<any> {
  const answer = await (await request.post(`${api}/analyticsWorkspace.json/${path}`, { headers: authOf(s), data })).json();
  expectNow(answer.status, `${path}: ${answer.message}`).toBe('SUCCESS');
  return answer.data;
}

/** The board, made once: an analysis per source, a tile per kind. */
async function ensureBoard(request: APIRequestContext, s: Session, connection: string): Promise<number> {
  const boards = (await (await request.get(`${api}/analyticsWorkspace.json/fetchAllDashboards`, { headers: authOf(s) })).json()).data ?? [];
  const found = boards.find((b: { dashboardName: string }) => b.dashboardName === BOARD)?.analyticsDashboardId;
  if (found) return found;
  const id = (await post(request, s, 'saveDashboard', { dashboardName: BOARD, dashboardDescription: 'A tile per ECharts kind, to click (made by the e2e suite)' })).analyticsDashboardId;
  const analyses: Record<string, number> = {};
  for (const [name, config] of Object.entries(SOURCES)) {
    analyses[name] = (await post(request, s, 'saveAnalysis', { analysisName: `${PREFIX}events — ${name}`, connectionAlias: connection,
      datasetPath: ORDERS.path, analysisConfig: JSON.stringify(config) })).analyticsAnalysisId;
  }
  for (const [order, [kind, source]] of KINDS.entries()) {
    await post(request, s, 'saveWidget', { analyticsDashboardId: id, analyticsAnalysisId: analyses[source], widgetTitle: `Events — ${kind}`,
      visualizationType: kind, displayOrder: order });
  }
  return id;
}

/** A point over a mark that narrows: ECharts shows the pointer there and nowhere else. */
async function markUnder(page: Page, chart: Locator): Promise<{ x: number; y: number } | null> {
  const box = (await chart.boundingBox())!;
  for (let gy = 1; gy < 12; gy++) {
    for (let gx = 1; gx < 16; gx++) {
      const x = box.x + (box.width * gx) / 16, y = box.y + (box.height * gy) / 12;
      await page.mouse.move(x, y);
      const cursor = await chart.evaluate(el => getComputedStyle(el.querySelector('div > div') ?? el).cursor);
      if (cursor === 'pointer') return { x, y };
    }
  }
  return null;
}

let boardId = 0;
test.beforeAll(async ({ request }) => {
  test.setTimeout(600_000);
  const session = await defaultSession(request);
  const { connection } = await analyticsFixtures(request, session);
  boardId = await ensureBoard(request, session, connection);
});

test('a click on a mark of every ECharts kind narrows the board to what it stands for', async ({ page }) => {
  test.setTimeout(900_000);
  await page.goto(`/data/analytics/dashboards?board=${boardId}`);
  await expect(page.locator('.dash-facts', { hasText: 'Last run' })).toBeVisible({ timeout: 400_000 });
  const builder = page.locator('app-filter-builder');
  for (const [kind] of KINDS) {
    const tile = page.locator('app-analytics-widget', { hasText: `Events — ${kind}` });
    await tile.scrollIntoViewIfNeeded();
    const chart = tile.locator(`app-echart[data-kind="${kind}"][data-drawn]`);
    await expect.soft(chart, `${kind} is drawn by ECharts`).toBeVisible();
    if (!(await chart.count())) continue;
    const hit = await markUnder(page, chart);
    expect.soft(hit, `${kind} has a mark that narrows`).not.toBeNull();
    if (!hit) continue;
    // The click IS the apply: the board re-runs at once, its analyses carrying the clicked value
    // as an equality. Waited for on the wire, so a click that did nothing cannot pass on a filter
    // the previous kind left behind.
    const narrowed = page.waitForRequest(r => r.url().includes('/analytics.json/analyze') && /"operator":"EQ"/.test(r.postData() ?? ''),
      { timeout: 15_000 }).then(() => true, () => false);
    await page.mouse.click(hit.x, hit.y);
    expect.soft(await narrowed, `${kind}: a click narrowed the board`).toBe(true);
    await expect.soft(builder.getByLabel('Value for condition 1'), `${kind} shows the condition`).not.toHaveValue('');
    const stop = page.getByRole('button', { name: 'Stop' });
    if (await stop.count()) await stop.click();
  }
});
