import { test, expect, APIRequestContext, Browser, Page, TestInfo } from '@playwright/test';
import { hasToken, NEEDS, sessionFor, tokenFor } from './support/session';
import { bestEffort, getJson } from './support/workspace';
import { hasFixtures, NEEDS_FIXTURES, riverside } from './support/fixtures';
import { join } from 'path';

/**
 * MIG-292: Integration › Connector Hub against integration-service for Riverside Health -- the connect flow on the
 * demo's stand-in customer database (etl-platform's demo_source_db, PostgreSQL): a wrong password shows its cause and its
 * fix, the right one goes on to tables, sync mode and schedule, and the new connection syncs; then the gallery and the
 * connections with their sync health at a wide screen and two tablets, light and dark, showing that connection.
 *
 * The rebuilt workspaces have no Connector Hub connection, so the spec makes its own ("E2E Connector Hub <stamp>",
 * syncing public.customers into the workspace's bucket) and deletes it when the describe ends; without
 * E2E_DEMO_DB_PASSWORD (demo_reader's, from etl-platform/secrets/demo_source_db.env) nothing can be made and every test
 * skips, saying so. Sign-in: support/session.ts (role admin); E2E_SHOTS optional.
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';
const demoPassword = process.env['E2E_DEMO_DB_PASSWORD'];
const NAME = `E2E Connector Hub ${Date.now()}`;
const NO_PASSWORD = 'needs E2E_DEMO_DB_PASSWORD (demo_reader\'s, etl-platform/secrets/demo_source_db.env): the connection'
  + ' these screens show is made by the connect test';

async function sessionOf(request: APIRequestContext, token: string): Promise<Record<string, unknown>> {
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  const pages = await (await request.get(`${api}/pageAccess.json/mine`, { headers: { Authorization: `Bearer ${token}` } })).json();
  return { username: claims.sub, fullName: claims.sub, userRole: claims.userRole, appUserId: claims.appUserId,
    tenantId: claims.tenantId, accessToken: token, refreshToken: '', pageKeys: pages?.data?.pageKeys ?? null };
}

async function pageAs(browser: Browser, session: Record<string, unknown>, width = 1920, height = 1080,
  colorScheme: 'light' | 'dark' = 'light'): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme });
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(user => window.localStorage.setItem('etl_auth_user', JSON.stringify(user)), session);
  return page;
}

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  const extra = process.env['E2E_SHOTS'];
  if (extra) await page.screenshot({ path: join(extra, `${name}.png`), fullPage: true });
}

async function noSidewaysScroll(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no page-wide horizontal scroll').toBe(true);
}

test.describe.serial('Connector Hub', () => {
  test.skip(!hasToken('admin'), NEEDS.admin);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);
  test.skip(!demoPassword, NO_PASSWORD);

  test.afterAll(async ({ request }) => {
    const s = await sessionFor(request, 'admin');
    const made = ((await getJson(request, s, '/connectorHub.json/connection/list')).data ?? [])
      .filter((c: { name: string }) => c.name === NAME);
    for (const c of made as { connectionId: number }[]) {
      await bestEffort(`delete connection ${c.connectionId}`, () => request.delete(`${api}/connectorHub.json/connection/delete`,
        { headers: { Authorization: `Bearer ${s.token}` }, params: { connectionId: c.connectionId } }));
    }
  });

  test('connecting the demo database: a wrong password says why and what to do, the right one syncs', async ({ browser, request }, info) => {
    test.setTimeout(180_000);
    const page = await pageAs(browser, await sessionOf(request, tokenFor('admin')!));
    const name = NAME;
    await page.goto('/integration/connectors');
    await page.locator('[data-new-connection]').click();
    await page.locator('[data-choose="postgres"]').click();
    await page.locator('#cName').fill(name);
    await page.locator('#cTarget').selectOption(riverside().storageAlias);
    await page.locator('[data-field="host"]').fill('demo-source-db');
    await page.locator('[data-field="port"]').fill('5432');
    await page.locator('[data-field="database"]').fill('shop');
    await page.locator('[data-field="username"]').fill('demo_reader');
    await page.locator('[data-field="sslMode"]').selectOption('DISABLE');
    await page.locator('[data-field="password"]').fill('not-the-password');
    await page.locator('[data-next]').click();
    const problem = page.locator('[data-problem]');
    await expect(problem).toContainText('Could not connect');
    await expect(problem).toContainText('Fix:');
    await shot(page, info, 'connect-wrong-password');

    await page.locator('[data-field="password"]').fill(demoPassword!);
    await page.locator('[data-next]').click();
    await expect(page.locator('[data-step="tables"]')).toBeVisible();
    await page.locator('[data-table="public.customers"]').check();
    await shot(page, info, 'connect-tables');
    await page.locator('[data-next]').click();
    await expect(page.locator('[data-step="sync"]')).toBeVisible();
    await expect(page.locator('[data-cursor="public.customers"]')).toHaveValue('updated_at');
    await shot(page, info, 'connect-sync');
    await page.locator('[data-next]').click();
    await page.locator('[data-schedule]').selectOption({ label: 'On demand' });
    await expect(page.locator('[data-summary]')).toContainText('1 table, incremental, on demand.');
    await page.locator('[data-finish]').click();

    const row = page.locator('tr[data-connection]').filter({ hasText: name });
    await expect(row).toBeVisible();
    // The sweep takes it up within seconds: the row then says when it last synced and how many rows it holds.
    await expect.poll(async () => {
      await page.getByRole('button', { name: 'Refresh' }).click();
      return (await row.textContent()) ?? '';
    }, { timeout: 60_000, intervals: [3000] }).toMatch(/ago\s*4\d/);
    await expect(row).toContainText('Active');
    await row.getByRole('button', { name }).click();
    const panel = page.locator('[data-connection-panel]');
    await expect(panel.locator('[data-runs]')).toContainText('Succeeded', { timeout: 30_000 });
    await expect(panel.locator('tr[data-stream="public.customers"]')).toContainText('email');
    await shot(page, info, 'connect-synced');
    await page.context().close();
  });
  for (const [width, height, label, scheme] of [[1920, 1080, 'wide', 'light'], [2560, 1440, 'wide-2560-dark', 'dark'],
    [1024, 768, 'tablet', 'light'], [768, 1024, 'tablet-portrait-dark', 'dark']] as const) {
    test(`the gallery, the connections and a connection (${label})`, async ({ browser, request }, info) => {
      const page = await pageAs(browser, await sessionOf(request, tokenFor('admin')!), width, height, scheme);
      await page.goto('/integration/connectors');
      await page.getByRole('heading', { name: 'Connector Hub' }).waitFor();
      await expect(page.locator('[data-connector="postgres"]')).toContainText('Connected');
      await expect(page.locator('[data-connector="mysql"]')).toContainText('Not yet');
      await expect(page.locator('[data-connector="hubspot"]')).toContainText('On request');
      const row = page.locator('tr[data-connection]').filter({ hasText: NAME });
      await expect(row).toBeVisible();
      await expect(row).toContainText('PostgreSQL');
      await noSidewaysScroll(page);
      if (scheme === 'dark') expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
      await shot(page, info, `connectors-${label}`);

      await page.getByRole('button', { name: 'Databases' }).click();
      await expect(page.locator('[data-connector="files"]')).toHaveCount(0);
      await page.getByRole('button', { name: /^All/ }).click();

      await row.getByRole('button', { name: NAME }).click();
      const panel = page.locator('[data-connection-panel]');
      await expect(panel).toBeVisible();
      await expect(panel.locator('[data-health]')).toContainText('Lag');
      await expect(panel.locator('tr[data-stream="public.customers"]')).toBeVisible();
      await expect(panel.locator('[data-runs]')).toContainText('Succeeded');
      await shot(page, info, `connection-${label}`);
      await page.context().close();
    });
  }

});
