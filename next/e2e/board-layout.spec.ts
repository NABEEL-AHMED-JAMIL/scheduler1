import { APIRequestContext, expect as expectNow, Page } from '@playwright/test';
import { api, authOf, defaultSession, NO_SESSION, Session, signedIn, test } from './support/session';
import { analyticsFixtures, ORDERS, PREFIX } from './support/analytics-fixtures';

/**
 * A board does not dance: hovering marks and a click that narrows the board move nothing on it
 * (owner, 2026-10-06, "the panel dances"; the fix is 6e3892d).
 *
 * Measured the way the browser scores it -- every layout-shift entry, including the ones within
 * half a second of the click that Cumulative Layout Shift forgives, because a board that jumps
 * on a click is what was reported -- at the two widths the owner reviews at, 1187 and 1920.
 *
 * The board is "E2E board layout": four tiles over the orders file, two drawn as SVG (ranked bars,
 * bars in order) and two by ECharts (horizontal bars, a donut-like rose), made the first time it
 * is missing and kept, like every other "E2E" fixture. A click on the ranked bars narrows all
 * four, so the whole board re-runs while it is measured.
 *
 * Also checks, on the same board, the text the browser actually draws in a tile's DOM: the chart
 * type scale (shared/charts/chart-type.ts) -- 11, 12 or 14px, or a figure's own scale -- where the
 * unit specs can only read classes.
 *
 * @author Nabeel Ahmed
 */

test.skip(!signedIn(), NO_SESSION);
const expect = expectNow.configure({ timeout: 45_000 });

const BOARD = `${PREFIX}board layout`;
const byCategory = { dimensions: ['category'], measure: { aggregation: 'SUM', field: 'amount' }, sort: { by: 'MEASURE', direction: 'DESC' } };
const TILES: [string, string][] = [
  ['Layout — ranked', 'ranked'], ['Layout — bars', 'bar'], ['Layout — horizontal', 'barH'], ['Layout — rose', 'rose'],
];

async function post(request: APIRequestContext, s: Session, path: string, data: unknown): Promise<any> {
  const answer = await (await request.post(`${api}/analyticsWorkspace.json/${path}`, { headers: authOf(s), data })).json();
  expectNow(answer.status, `${path}: ${answer.message}`).toBe('SUCCESS');
  return answer.data;
}

async function ensureBoard(request: APIRequestContext, s: Session, connection: string): Promise<number> {
  const boards: { dashboardName: string; analyticsDashboardId: number }[] =
    (await (await request.get(`${api}/analyticsWorkspace.json/fetchAllDashboards`, { headers: authOf(s) })).json()).data ?? [];
  const found = boards.find(b => b.dashboardName === BOARD)?.analyticsDashboardId;
  if (found) return found;
  const analysis = (await post(request, s, 'saveAnalysis', { analysisName: `${PREFIX}layout — revenue by category`, connectionAlias: connection,
    datasetPath: ORDERS.path, analysisConfig: JSON.stringify(byCategory) })).analyticsAnalysisId;
  const id = (await post(request, s, 'saveDashboard', { dashboardName: BOARD, dashboardDescription: 'Four tiles to hover and click (made by the e2e suite)' })).analyticsDashboardId;
  for (const [order, [title, kind]] of TILES.entries()) {
    await post(request, s, 'saveWidget', { analyticsDashboardId: id, analyticsAnalysisId: analysis, widgetTitle: title, visualizationType: kind, displayOrder: order });
  }
  return id;
}

let board = 0;
test.beforeAll(async ({ request }) => {
  test.setTimeout(600_000);
  const session = await defaultSession(request);
  const { connection } = await analyticsFixtures(request, session);
  board = await ensureBoard(request, session, connection);
});

/** Every layout shift from now on, whatever caused it. */
async function watchShifts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __shifts: { value: number; at: string[] }[] };
    w.__shifts = [];
    new PerformanceObserver(list => {
      for (const entry of list.getEntries() as unknown as { value: number; sources?: { node?: Node }[] }[]) {
        w.__shifts.push({ value: entry.value, at: (entry.sources ?? []).map(s => (s.node as Element | undefined)?.className?.toString?.().slice(0, 60) ?? s.node?.nodeName ?? '') });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}
const shifts = (page: Page) => page.evaluate(() => (window as unknown as { __shifts: { value: number; at: string[] }[] }).__shifts.splice(0));

async function openBoard(page: Page): Promise<void> {
  await page.goto(`/data/analytics/dashboards?board=${board}`);
  await expect(page.locator('.dash-facts', { hasText: 'Last run' })).toBeVisible({ timeout: 400_000 });
  await expect(page.locator('app-echart[data-kind="barH"][data-drawn]')).toBeVisible();
  await page.waitForTimeout(1500);
}

for (const width of [1187, 1920]) {
  test(`at ${width}px, hovering marks and a click that narrows the board move nothing`, async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize({ width, height: 1000 });
    await watchShifts(page);
    await openBoard(page);
    await shifts(page);

    // Hover: across every tile's chart, slowly enough for each tooltip and highlight to draw.
    for (const chart of await page.locator('app-widget-chart').all()) {
      const box = (await chart.boundingBox())!;
      for (let i = 0; i < 10; i++) {
        await page.mouse.move(box.x + box.width * (0.1 + 0.8 * ((i * 7) % 10) / 10), box.y + box.height * (0.1 + 0.8 * ((i * 3) % 10) / 10), { steps: 6 });
      }
    }
    await page.waitForTimeout(800);
    expect(await shifts(page), 'layout shifts while hovering').toEqual([]);

    // A click on a ranked bar narrows the board: every tile re-runs with the filter on.
    const ranked = page.locator('app-analytics-widget', { hasText: 'Layout — ranked' }).locator('app-ranked-bar button.cursor-pointer').first();
    const narrowed = page.waitForRequest(r => r.url().includes('/analytics.json/analyze') && /"operator":"EQ"/.test(r.postData() ?? ''));
    await ranked.click();
    await narrowed;
    await expect(page.locator('.dash-filter-pill')).toHaveText(/1 filter on/);
    await expect(page.locator('.dash-facts', { hasText: 'Last run' })).toBeVisible({ timeout: 400_000 });
    await page.waitForTimeout(1500);
    expect(await shifts(page), 'layout shifts on a click that narrows').toEqual([]);

    // Clearing it, the same.
    await page.locator('.dash-filter-clear').click();
    await expect(page.locator('.dash-filter-pill')).toHaveCount(0);
    await expect(page.locator('.dash-facts', { hasText: 'Last run' })).toBeVisible({ timeout: 400_000 });
    await page.waitForTimeout(1500);
    expect(await shifts(page), 'layout shifts on clearing the filter').toEqual([]);
  });

  test(`at ${width}px, the text a tile draws is on the chart type scale`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openBoard(page);
    const sizes = await page.evaluate(() => {
      const out: { text: string; px: number; figure: boolean; where: string }[] = [];
      document.querySelectorAll('app-analytics-widget *').forEach(element => {
        if (element.closest('svg, app-echart, .cdk-visually-hidden, .sr-only')) return;
        const own = Array.from(element.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent ?? '').join('').trim();
        if (!own || (element as HTMLElement).offsetParent === null) return;
        out.push({ text: own.slice(0, 24), px: parseFloat(getComputedStyle(element).fontSize), figure: !!element.closest('.kpi-figure'),
          where: (element.className?.toString?.() ?? '').slice(0, 40) });
      });
      return out;
    });
    expect(sizes.length).toBeGreaterThan(10);
    const off = sizes.filter(s => !s.figure && ![11, 12, 14].includes(Math.round(s.px)));
    expect(off, 'tile text off the 11/12/14px scale').toEqual([]);
    // The tile title is the largest text in a tile.
    const title = Math.max(...sizes.filter(s => /widget-title/.test(s.where)).map(s => s.px));
    expect(Math.max(...sizes.filter(s => !s.figure).map(s => s.px))).toBeLessThanOrEqual(title);
  });
}
