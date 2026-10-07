import { test, expect, APIRequestContext, Browser, Page, TestInfo } from '@playwright/test';
import { hasToken, NEEDS, sessionFor, tokenFor } from './support/session';
import { archiveForm, makeForm, submitForm } from './support/forms';
import { ensureObject, getJson, outputsOf, postJson } from './support/workspace';
import { hasFixtures, NEEDS_FIXTURES, pipeline, riverside } from './support/fixtures';
import { join } from 'path';

/**
 * MIG-288: Data › Data Catalog against analytics-service for Riverside Health -- the strip, the list with its sensitive
 * fields, an asset's panel with columns, tags and lineage -- at a wide screen and a tablet; and the prompt editor's
 * file picker naming its variable plainly (no {{ }} in its heading).
 *
 * The sensitive asset is the suite's own: e2e/catalog/E2E-card-holders.csv in the workspace's bucket (emails and test card
 * numbers), uploaded once and kept for the next run, and scanned through the API when the catalog has not classified it
 * yet. The lineage is the rebuilt readmission schedule's (support/fixtures.ts): the statistics file its run uploads,
 * the file it read, and the schedule itself. Ask your data is asked about a form the spec makes ("E2E orders <stamp>",
 * six answers), archived when the test ends. Nothing else is created or changed.
 *
 * Sign-in: support/session.ts (role admin); E2E_SHOTS optional.
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';
const CUSTOMERS_KEY = 'e2e/catalog/E2E-card-holders.csv';
const CUSTOMERS = ['customer_id,name,email,city,amount,card_number',
  'C-001,Ada Example,ada@example.com,Nairobi,1250.50,4111111111111111',
  'C-002,Bo Example,bo@example.com,Lagos,310.00,5500005555555559',
  'C-003,Cy Example,cy@example.com,Nairobi,980.25,340000000000009',
  'C-004,Di Example,di@example.com,Accra,120.00,6011000000000004',
  'C-005,Ed Example,ed@example.com,Lagos,75.40,4012888888881881',
  'C-006,Fa Example,fa@example.com,Nairobi,2200.00,4222222222222'].join('\n') + '\n';
/** The readmission run's uploaded statistics (the asset whose lineage is read) and the lineage's names. */
let LINEAGE_FILE = '';
let LINEAGE_NAMES: string[] = [];

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
  test.skip(!hasFixtures(), NEEDS_FIXTURES);

  test.beforeAll(async ({ request }) => {
    test.setTimeout(120_000);
    const s = await sessionFor(request, 'admin');
    const bucket = riverside().storageAlias;
    await ensureObject(request, s, bucket, CUSTOMERS_KEY, Buffer.from(CUSTOMERS));
    // The catalog takes the file up from storage's events; classify it when it has not been scanned yet.
    let asset: { assetId: number; sensitivity: string } | undefined;
    await expect.poll(async () => {
      asset = ((await getJson(request, s, '/analyticsCatalog.json/list?q=E2E-card-holders')).data ?? [])
        .find((a: { path: string; connection: string }) => a.path === CUSTOMERS_KEY && a.connection === bucket);
      return !!asset;
    }, { timeout: 60_000, message: `the catalog lists ${CUSTOMERS_KEY}` }).toBe(true);
    if (asset!.sensitivity !== 'Restricted') {
      const scanned = await postJson(request, s, `/analyticsCatalog.json/scan?assetId=${asset!.assetId}`);
      expect(scanned.data?.sensitivity, `the scan of ${CUSTOMERS_KEY}`).toBe('Restricted');
    }
    // The lineage: the readmission run's upload, as the catalog links it.
    const run = pipeline('readmission').run!.jobQueueId;
    const upload = (await outputsOf(request, s, run)).find(o => o.kind === 'bucket')!;
    expect(upload, `run ${run} uploaded a file`).toBeTruthy();
    LINEAGE_FILE = upload.name;
    const listed = ((await getJson(request, s, `/analyticsCatalog.json/list?q=${encodeURIComponent(upload.name)}`)).data ?? [])
      .find((a: { path: string }) => a.path === upload.key);
    expect(listed, `the catalog lists ${upload.bucket}/${upload.key}`).toBeTruthy();
    const graph = (await getJson(request, s, `/analyticsCatalog.json/lineage?assetId=${listed.assetId}&depth=2`)).data;
    LINEAGE_NAMES = (graph?.nodes ?? []).filter((n: { kind: string }) => n.kind === 'file' || n.kind === 'pipeline')
      .map((n: { name: string }) => n.name);
    expect(LINEAGE_NAMES.length, 'the upload has a pipeline and an input upstream').toBeGreaterThanOrEqual(3);
  });

  for (const [width, height, label] of [[1920, 1080, 'wide'], [1024, 768, 'tablet']] as const) {
    test(`the list, the strip and an asset's panel (${label})`, async ({ browser, request }, info) => {
      const page = await pageAs(browser, await sessionOf(request, tokenFor('admin')!), width, height);
      await page.goto('/data/catalog');
      await page.getByRole('heading', { name: 'Data Catalog' }).waitFor();
      await expect(page.getByText('With sensitive fields')).toBeVisible();
      await page.locator('#catalogSearch').fill('E2E-card-holders');
      const row = page.locator('tr[data-asset]').filter({ hasText: CUSTOMERS_KEY });
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

      await page.locator('#catalogSearch').fill(LINEAGE_FILE);
      await page.locator('tr[data-asset]').filter({ hasText: LINEAGE_FILE }).first().click();
      const lineage = page.locator('[data-lineage]');
      for (const name of LINEAGE_NAMES) await expect(lineage).toContainText(name);
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
      // Ask your data queries the workspace's datasets (forms, pipeline results), not loose files: the spec makes a form
      // of its own with a city and an amount, sends six answers, asks about them, and archives the form afterwards.
      const token = tokenFor('admin')!;
      const s = await sessionOf(request, token);
      const admin = await sessionFor(request, 'admin');
      const name = `E2E orders ${Date.now().toString(36)}`;
      const form = await makeForm(request, admin, name, [{ key: 'city', label: 'City', type: 'text', required: true },
        { key: 'amount', label: 'Amount', type: 'number', required: true }]);
      try {
        for (const [city, amount] of [['Nairobi', 1250.5], ['Lagos', 310], ['Nairobi', 980.25], ['Accra', 120], ['Lagos', 75.4], ['Nairobi', 2200]] as const) {
          await submitForm(request, admin, form, { city, amount });
        }
        const top = 'Nairobi';
        const question = `In the form "${name}", which city has the largest total amount?`;
        const warm = await request.post(`${api}/askData.json/ask`, { headers: { Authorization: `Bearer ${token}` },
          data: { question }, timeout: 300_000, failOnStatusCode: false });
        expect(warm.status(), 'the warm-up question was answered').toBeLessThan(500);
        const page = await pageAs(browser, s);
        await page.goto('/data/ask');
        await page.locator('[data-test="question"]').fill(question);
        await page.locator('[data-test="ask"]').click();
        const answer = page.locator('[data-test="query-answer"]');
        await expect(answer).toBeVisible({ timeout: 150_000 });
        await expect(answer.locator('[data-test="query-sql"]')).toContainText('GROUP BY');
        await expect(answer.locator('[data-test="query-rows"]')).toContainText(top);
        await shot(page, info, 'ask-query-answer');
        await answer.locator('[data-test="open-analytics"]').click();
        await expect(page).toHaveURL(/\/data\/analytics\?/);
        await expect(page.locator('app-sql-editor')).toContainText('GROUP BY', { timeout: 30_000 });
        await shot(page, info, 'ask-query-in-analytics');
        await page.context().close();
      } finally {
        await archiveForm(request, admin, form);
      }
    });
});

