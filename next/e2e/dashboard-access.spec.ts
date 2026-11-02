import { APIRequestContext, expect, test } from '@playwright/test';
import { api, canMintPeople, pageAs, Session, sessionAsPerson } from './support/session';
import { hasFixtures, NEEDS_FIXTURES, riverside } from './support/fixtures';
import { pickOption } from './support/advanced-select';

/**
 * Owner 2026-11-02 ("Dashboards showing to all users"): a dashboard's audience, set in its Share panel and held by the
 * server on every path. Riverside's administrator shares one board with the reviewer alone (view); the reviewer then finds
 * it and opens it read-only, and the viewer -- outside the audience -- finds it nowhere: not on the list, not by its link
 * (the page says it is not here), not by the API (404 on the board, 403 on its tile).
 *
 * The board is the suite's own synthetic row, "E2E Dashboard access", found or made by name and put back to "everyone in
 * the workspace" before each run; it is left in place afterwards. Needs the mint script (E2E_MINT=1) and the rebuild's
 * state file (synthetic Riverside people).
 */

const BOARD_NAME = 'E2E Dashboard access';
test.describe.configure({ mode: 'serial', timeout: 120_000 });
test.skip(!canMintPeople(), 'needs the mint script (E2E_MINT=1) to sign in as Riverside\'s people');
test.skip(!hasFixtures(), NEEDS_FIXTURES);

let admin: Session;
let boardId = 0;
let tileId = 0;
let reviewerName = '';

async function call(request: APIRequestContext, s: Session, method: 'GET' | 'POST', path: string, body?: unknown) {
  const headers = { Authorization: `Bearer ${s.token}` };
  const answer = method === 'GET' ? await request.get(`${api}${path}`, { headers })
    : await request.post(`${api}${path}`, { headers, data: body });
  return { status: answer.status(), body: await answer.json().catch(() => ({})) };
}

test.beforeAll(async ({ request }) => {
  admin = await sessionAsPerson(request, riverside().admin);
  const boards = await call(request, admin, 'GET', '/analyticsWorkspace.json/fetchAllDashboards');
  const found = (boards.body.data ?? []).find((b: { dashboardName: string }) => b.dashboardName === BOARD_NAME);
  if (found) {
    boardId = found.analyticsDashboardId;
  } else {
    const made = await call(request, admin, 'POST', '/analyticsWorkspace.json/saveDashboard',
      { dashboardName: BOARD_NAME, dashboardDescription: 'Synthetic: who can see a dashboard (e2e dashboard-access)' });
    boardId = made.body.data.analyticsDashboardId;
  }
  const opened = await call(request, admin, 'GET', `/analyticsWorkspace.json/fetchDashboardById?analyticsDashboardId=${boardId}`);
  tileId = opened.body.data.widgets?.[0]?.analyticsDashboardWidgetId ?? 0;
  if (!tileId) {
    const queries = await call(request, admin, 'GET', '/analyticsLibrary.json/fetchAllQueries');
    const query = (queries.body.data ?? [])[0];
    expect(query, 'Riverside has a saved query to put on the board').toBeTruthy();
    const tile = await call(request, admin, 'POST', '/analyticsWorkspace.json/saveWidget',
      { analyticsDashboardId: boardId, analyticsQueryId: query.analyticsQueryId, widgetTitle: 'Synthetic tile', visualizationType: 'table' });
    tileId = tile.body.data.analyticsDashboardWidgetId;
  }
  // Every run starts from a board for everyone, as every board was before the audience existed.
  const reset = await call(request, admin, 'POST', '/analyticsWorkspace.json/saveDashboardAccess',
    { analyticsDashboardId: boardId, audience: 'WORKSPACE', workspaceAccess: 'EDIT', shares: [] });
  expect(reset.status).toBe(200);
  const people = await call(request, admin, 'GET', '/analyticsWorkspace.json/fetchSharePeople');
  const reviewer = (people.body.data ?? []).find((p: { appUserId: number }) => p.appUserId === riverside().reviewer);
  reviewerName = reviewer?.fullName?.trim() || reviewer?.username;
  expect(reviewerName, 'the reviewer is an active member of Riverside').toBeTruthy();
});

test('the owner shares the board with one person, and the board says so', async ({ browser }) => {
  const page = await pageAs(browser, admin);
  await page.goto(`/data/analytics/dashboards?board=${boardId}`);
  await expect(page.getByRole('heading', { level: 1, name: BOARD_NAME })).toBeVisible();
  await expect(page.locator('[data-test=board-audience]')).toContainText('Everyone in the workspace');

  await page.locator('[data-test=share-board]').click();
  const panel = page.locator('[data-test=share-panel]');
  await expect(panel).toBeVisible();
  await panel.locator('[data-test=share-chosen] input').check();
  await expect(panel.locator('[data-test=share-empty]')).toBeVisible();
  await pickOption(panel.locator('#share-add'), { label: reviewerName });
  await expect(panel.locator(`[data-share="PERSON:${riverside().reviewer}"]`)).toContainText(reviewerName);
  await panel.locator('[data-test=share-save]').click();
  await expect(panel).toBeHidden();
  await expect(page.locator('[data-test=board-audience]')).toContainText(`Shared with`);

  // The change is in the board's history.
  await page.locator('[data-test=share-board]').click();
  await expect(page.locator('[data-test=share-history] summary')).toContainText('Changes to who can see it');
  await page.locator('[data-test=share-history] summary').click();
  await expect(page.locator('[data-test=share-history]')).toContainText(`Shared with ${reviewerName} (can view)`);
  await page.context().close();
});

test('the person it is shared with finds it and opens it read-only', async ({ browser, request }) => {
  const reviewer = await sessionAsPerson(request, riverside().reviewer);
  const page = await pageAs(browser, reviewer);
  await page.goto('/data/analytics/dashboards');
  await expect(page.locator('a.dash-card', { hasText: BOARD_NAME })).toBeVisible({ timeout: 60_000 });
  await page.goto(`/data/analytics/dashboards?board=${boardId}`);
  await expect(page.getByRole('heading', { level: 1, name: BOARD_NAME })).toBeVisible();
  await expect(page.locator('[data-test=board-audience]')).toContainText('you can view, not change it');
  await expect(page.getByRole('button', { name: /^Chart theme/ })).toHaveCount(0);
  await page.context().close();
  // The server holds it too: a tile cannot be added by a view share, whatever the reviewer's pages.
  const write = await call(request, reviewer, 'POST', '/analyticsWorkspace.json/saveWidget',
    { analyticsDashboardId: boardId, analyticsQueryId: 1, widgetTitle: 'Planted', visualizationType: 'table' });
  expect(write.status).toBe(403);
});

test('someone outside the audience finds the board nowhere', async ({ browser, request }) => {
  const viewer = await sessionAsPerson(request, riverside().viewer);
  const page = await pageAs(browser, viewer);
  await page.goto('/data/analytics/dashboards');
  await expect(page.locator('a.dash-card').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('a.dash-card', { hasText: BOARD_NAME })).toHaveCount(0);
  await page.goto(`/data/analytics/dashboards?board=${boardId}`);
  await expect(page.locator('[data-test=board-missing]')).toBeVisible();
  await expect(page.locator('[data-test=board-missing]')).toContainText('may not be shared with you');
  await page.context().close();

  expect((await call(request, viewer, 'GET', `/analyticsWorkspace.json/fetchDashboardById?analyticsDashboardId=${boardId}`)).status).toBe(404);
  const listed = await call(request, viewer, 'GET', '/analyticsWorkspace.json/fetchAllDashboards');
  expect((listed.body.data ?? []).map((b: { analyticsDashboardId: number }) => b.analyticsDashboardId)).not.toContain(boardId);
  const tile = await call(request, viewer, 'POST', `/analytics.json/query?boardId=${boardId}`,
    { boardId: String(boardId), widgetId: String(tileId) });
  expect(tile.status).toBe(403);
});
