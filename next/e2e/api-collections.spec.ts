import { test, expect, Browser, Page, Response } from '@playwright/test';
import { canSignIn, NEEDS, Session, sessionFor } from './support/session';

/**
 * MIG-247: API Collections end to end, as a workspace administrator -- create a collection, give it an
 * environment with a secret, add an API, Save & test it through the runner, change and save it, switch it off
 * and on, then import a Postman collection and read its report. Beside every step, the business rule: no secret
 * value ever reaches the browser. Every response from the API gateway is read and none may hold a secret this
 * spec sent (the environment's token, the Postman file's bearer token, its environment's secret) -- only the
 * requests that set them may carry them.
 *
 * Needs integration-service behind :9098 and a console at E2E_BASE_URL (default :4400) that has MIG-247.
 * Sign-in, either:
 *   E2E_TENANT_ADMIN_TOKEN                          a TENANT_ADMIN access token (e.g. from
 *                                                   etl-platform/scripts/mint-test-token.sh 4537 900), or
 *   E2E_TENANT_ADMIN / E2E_TENANT_ADMIN_PASSWORD    a TENANT_ADMIN's credentials
 * The test makes one real outbound call (E2E_ECHO_URL, default https://httpbin.org, which echoes the request:
 * its Authorization header must come back masked). Everything it makes is named "UI-CHECK e2e …" and deleted
 * at the end through the API.
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';
const ECHO = process.env['E2E_ECHO_URL'] ?? 'https://httpbin.org';

const STAMP = Date.now().toString(36);
const COLLECTION = `E2E collection ${STAMP}`;
const IMPORTED = `E2E import ${STAMP}`;
const SECRET = `e2e-secret-${STAMP}-${Math.random().toString(36).slice(2)}`;
const IMPORT_TOKEN = `e2e-import-token-${STAMP}`;
const IMPORT_ENV_SECRET = `e2e-import-env-${STAMP}`;
const SECRETS = [SECRET, IMPORT_TOKEN, IMPORT_ENV_SECRET];

async function pageAs(browser: Browser, s: Session): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(user => window.localStorage.setItem('etl_auth_user', JSON.stringify(user)), s.data);
  return page;
}

/** Every gateway response whose body holds one of the secrets: must stay empty. */
function watchForSecrets(page: Page): string[] {
  const leaks: string[] = [];
  page.on('response', async (r: Response) => {
    if (!r.url().startsWith(api.replace(/\/api\/v1$/, ''))) return;
    try {
      const body = await r.text();
      for (const s of SECRETS) if (body.includes(s)) leaks.push(`${r.request().method()} ${r.url()}`);
    } catch { /* no body (a preflight, a redirect) */ }
  });
  return leaks;
}

test.describe('API Collections', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);

  let s: Session;
  const made: number[] = [];

  test.beforeAll(async ({ request }) => { s = await sessionFor(request, 'admin'); });

  test.afterAll(async ({ request }) => {
    if (!s) return;
    const headers = { Authorization: `Bearer ${s.token}` };
    for (const id of made) await request.delete(`${api}/apiCollection.json/delete?collectionId=${id}`, { headers });
  });

  test('create → environment with a secret → add API → Save & test → save → import, and no secret comes back', async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await pageAs(browser, s);
    const leaks = watchForSecrets(page);
    // MIG-310: "Open collection" closes the import dialog from its own confirm; that used to throw NG0911.
    const angularErrors: string[] = [];
    page.on('console', m => { if (m.type() === 'error' && /NG0\d+/.test(m.text())) angularErrors.push(m.text()); });
    page.on('pageerror', e => { if (/NG0\d+/.test(e.message)) angularErrors.push(e.message); });

    // ---- create
    await page.goto('/integration/api-collections');
    await expect(page.getByRole('heading', { level: 1, name: 'API Collections' })).toBeVisible();
    await page.getByRole('button', { name: 'New collection' }).first().click();
    await page.locator('#acName').fill(COLLECTION);
    await page.locator('#acDescription').fill('Made by the MIG-247 Playwright spec');
    await page.locator('app-collection-dialog').getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('heading', { level: 1, name: COLLECTION })).toBeVisible();
    made.push(Number(page.url().split('/').pop()));

    // ---- an environment: a plain base URL, and a secret that is shown only as configured from now on
    await page.getByRole('button', { name: 'New environment' }).click();
    const env = page.locator('app-environment-dialog');
    await env.locator('#envName').fill('E2E env');
    await env.getByRole('button', { name: 'Add variable' }).click();
    await env.getByLabel('Name of variable 1').fill('baseUrl');
    await env.getByLabel('Value of baseUrl', { exact: true }).fill(ECHO);
    await env.getByRole('button', { name: 'Add variable' }).click();
    await env.getByLabel('Name of variable 2').fill('token');
    await env.getByLabel('Secret: token', { exact: true }).check();
    const secretBox = env.getByLabel('Value of token', { exact: true });
    await expect(secretBox).toHaveAttribute('type', 'password');
    await secretBox.fill(SECRET);
    await env.getByRole('button', { name: 'Create' }).click();
    const environments = page.locator('[data-test="environments"]');
    await expect(environments).toContainText('configured');
    await expect(page.locator('body')).not.toContainText(SECRET);

    // ---- add an API that signs in with the secret, and Save & test it
    await page.getByRole('button', { name: 'Add API' }).click();
    const panel = page.locator('app-side-panel');
    await panel.locator('#apiName').fill('E2E echo');
    await panel.locator('#apiUrl').fill('{{baseUrl}}/anything');
    await panel.getByRole('tab', { name: 'Headers' }).click();
    await panel.getByRole('button', { name: 'Add header' }).click();
    await panel.getByLabel('Header name 1').fill('Authorization');
    await panel.getByLabel('Header value 1').fill('Bearer {{token}}');
    await expect(panel.getByRole('button', { name: 'Save & test' })).toBeVisible();
    await panel.getByRole('button', { name: 'Save & test' }).click();
    const summary = panel.locator('[data-test="run-summary"]');
    await expect(summary).toBeVisible({ timeout: 45_000 });
    await expect(summary).toContainText('OK');
    await expect(summary).toContainText('HTTP 200');
    // The echo sends the Authorization header back; the runner masks the token before it leaves the service.
    await expect(panel.locator('app-response-viewer pre')).toContainText('"Authorization"');
    await expect(panel.locator('app-response-viewer')).not.toContainText(SECRET);
    await expect(panel.getByRole('heading', { name: 'Edit API · E2E echo' })).toBeVisible();

    // ---- change it and save: saved means nothing left to save, and the button is Test again
    await panel.locator('#apiDescription').fill('Echoes the request back');
    await panel.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect(panel.getByRole('button', { name: 'Test', exact: true })).toBeVisible();
    await panel.locator('.side-panel-foot').getByRole('button', { name: 'Close', exact: true }).click();

    const row = page.locator('[data-test="apis"] tbody tr', { hasText: 'E2E echo' });
    await expect(row).toContainText('200');

    // ---- disable and enable
    await row.getByRole('switch', { name: 'Disable E2E echo' }).click();
    await expect(row).toContainText('Disabled');
    await row.getByRole('switch', { name: 'Enable E2E echo' }).click();
    await expect(row).toContainText('Enabled');

    // ---- a stored secret is replace-only
    await page.getByRole('button', { name: 'Actions for the E2E env environment' }).click();
    await page.getByRole('menuitem', { name: 'Edit or replace secrets' }).click();
    await expect(env).toContainText('configured');
    await expect(env.getByLabel('Value of token', { exact: true })).toHaveCount(0);
    await env.getByRole('button', { name: 'Replace token' }).click();
    await expect(env.getByLabel('New value of token')).toHaveValue('');
    await env.getByRole('button', { name: 'Cancel' }).click();

    // ---- import a Postman collection with a literal bearer token and a secret environment value
    await page.goto('/integration/api-collections');
    await page.locator('main').getByRole('button', { name: 'Import' }).first().click();
    const dialog = page.locator('app-import-dialog');
    await dialog.locator('#impCollection').setInputFiles({ name: 'e2e.postman_collection.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      info: { name: IMPORTED, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      auth: { type: 'bearer', bearer: [{ key: 'token', value: IMPORT_TOKEN, type: 'string' }] },
      item: [{ name: 'Echo', item: [{ name: 'Get anything', request: { method: 'GET', url: '{{baseUrl}}/anything' } }] }],
    })) });
    await dialog.locator('#impEnvironments').setInputFiles({ name: 'e2e.postman_environment.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      name: 'E2E imported', values: [{ key: 'baseUrl', value: ECHO, enabled: true }, { key: 'apiSecret', value: IMPORT_ENV_SECRET, type: 'secret', enabled: true }],
    })) });
    await dialog.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Import report' })).toBeVisible({ timeout: 30_000 });
    await expect(dialog.locator('tbody')).toContainText('Get anything');
    await expect(dialog).not.toContainText(IMPORT_TOKEN);
    await dialog.getByRole('button', { name: 'Open collection' }).click();
    await expect(page.getByRole('heading', { level: 1, name: IMPORTED })).toBeVisible();
    made.push(Number(page.url().split('/').pop()));
    await expect(page.locator('[data-test="environments"]')).toContainText('configured');
    await expect(page.locator('body')).not.toContainText(IMPORT_ENV_SECRET);

    // ---- the rule, over every response of the whole run
    await page.waitForTimeout(500);
    expect(leaks, 'responses holding a secret').toEqual([]);
    expect(angularErrors, 'Angular runtime errors').toEqual([]);
  });
});
