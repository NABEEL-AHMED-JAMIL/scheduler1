import { test, expect, APIRequestContext, Browser, Page, TestInfo } from '@playwright/test';
import { hasToken, NEEDS, tokenFor } from './support/session';
import { join } from 'path';

/**
 * MIG-288: Data › Data Catalog against analytics-service for workspace 2924 -- the strip, the list with its sensitive
 * fields, an asset's panel with columns, tags and lineage -- at a wide screen and a tablet; and the prompt editor's
 * file picker naming its variable plainly (no {{ }} in its heading).
 *
 * Sign-in: E2E_TENANT_ADMIN_TOKEN (etl-platform/scripts/mint-test-token.sh 4537 900); E2E_SHOTS optional.
 * Reads only: nothing is created or changed.
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';

async function sessionOf(request: APIRequestContext, token: string): Promise<Record<string, unknown>> {
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  const pages = await (await request.get(`${api}/pageAccess.json/mine`, { headers: { Authorization: `Bearer ${token}` } })).json();
  return { username: claims.sub, fullName: claims.sub, userRole: claims.userRole, appUserId: claims.appUserId,
    tenantId: claims.tenantId, accessToken: token, refreshToken: '', pageKeys: pages?.data?.pageKeys ?? null };
}

async function pageAs(browser: Browser, session: Record<string, unknown>, width = 1920, height = 1080): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height } });
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

test.describe('Data Catalog', () => {
  test.skip(!hasToken('admin'), NEEDS.admin);

  for (const [width, height, label] of [[1920, 1080, 'wide'], [1024, 768, 'tablet']] as const) {
    test(`the list, the strip and an asset's panel (${label})`, async ({ browser, request }, info) => {
      const page = await pageAs(browser, await sessionOf(request, tokenFor('admin')!), width, height);
      await page.goto('/data/catalog');
      await page.getByRole('heading', { name: 'Data Catalog' }).waitFor();
      await expect(page.getByText('With sensitive fields')).toBeVisible();
      await page.locator('#catalogSearch').fill('MIG286-customers');
      const row = page.locator('tr[data-asset]').filter({ hasText: 'MIG286-customers.csv' });
      await expect(row).toBeVisible();
      await expect(row).toContainText('Restricted');
      await expect(row).toContainText('card number');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no page-wide horizontal scroll').toBe(true);
      await shot(page, info, `catalog-list-${label}`);

      await row.click();
      const panel = page.locator('[data-catalog-panel]');
      await expect(panel).toBeVisible();
      await expect(panel.locator('tr[data-column="email"]')).toBeVisible();
      await expect(panel.locator('[data-sensitivity]')).toHaveText('Restricted');
      await shot(page, info, `catalog-panel-${label}`);
      await page.getByRole('button', { name: 'Close' }).click();

      await page.locator('#catalogSearch').fill('MIG-287 clean customers');
      await page.locator('tr[data-asset]').filter({ hasText: 'MIG-287 clean customers' }).first().click();
      const lineage = page.locator('[data-lineage]');
      await expect(lineage).toContainText('live-customers.csv');
      await expect(lineage).toContainText('UI-CHECK registry chain job 0929');
      await expect(lineage).toContainText('MIG-287 customer health');
      await shot(page, info, `catalog-lineage-${label}`);
      await page.context().close();
    });
  }

  test('the prompt editor names the variable a file fills, without template braces', async ({ browser, request }, info) => {
    const page = await pageAs(browser, await sessionOf(request, tokenFor('admin')!));
    await page.goto('/ai/prompts/new');
    await page.getByRole('heading', { name: 'New prompt' }).waitFor();
    await page.locator('#pTemplate').fill('Summarise {{file_name}}');
    await page.locator('.prompt-vars tbody tr').first().getByRole('button', { name: 'Fill from a file' }).click();
    const heading = page.locator('.side-panel-head h2');
    await expect(heading).toHaveText('Choose a file for file_name');
    await expect(heading).not.toContainText('{{');
    await shot(page, info, 'prompt-file-picker-heading');
    await page.context().close();
  });

  test('Ask your data answers a question about numbers with a query it shows, and hands it to Analytics Studio (MIG-283)',
    async ({ browser, request }, info) => {
      // The local model can take minutes to load when Ollama swaps models. The same question is asked through the API
      // first, which loads it; the page's own question then answers in seconds. Well inside a token's fifteen minutes.
      test.setTimeout(480_000);
      const question = 'Which city has the largest total amount among UI-REVIEW customers?';
      const token = tokenFor('admin')!;
      const warm = await request.post(`${api}/askData.json/ask`, { headers: { Authorization: `Bearer ${token}` },
        data: { question }, timeout: 300_000, failOnStatusCode: false });
      expect(warm.status(), 'the warm-up question was answered').toBeLessThan(500);
      const page = await pageAs(browser, await sessionOf(request, token));
      await page.goto('/data/ask');
      await page.locator('[data-test="question"]').fill(question);
      await page.locator('[data-test="ask"]').click();
      const answer = page.locator('[data-test="query-answer"]');
      await expect(answer).toBeVisible({ timeout: 150_000 });
      await expect(answer.locator('[data-test="query-sql"]')).toContainText('GROUP BY');
      await expect(answer.locator('[data-test="query-rows"]')).toContainText('Nairobi');
      await shot(page, info, 'ask-query-answer');
      await answer.locator('[data-test="open-analytics"]').click();
      await expect(page).toHaveURL(/\/data\/analytics\?/);
      await expect(page.locator('app-sql-editor')).toContainText('GROUP BY', { timeout: 30_000 });
      await shot(page, info, 'ask-query-in-analytics');
      await page.context().close();
    });
});

