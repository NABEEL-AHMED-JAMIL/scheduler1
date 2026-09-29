import { test, expect, APIRequestContext, Browser, Page, Response } from '@playwright/test';

/**
 * MIG-248: Sources end to end, as a workspace administrator -- create a FILE source on the workspace's own storage
 * connection, test it, preview its first rows and infer its schema; add a database connection with a password and
 * see it only as "configured"; install a contract template, propose a contract from a sample, and validate payloads
 * against wound_intake (one that fails, with its errors by path, and one that holds).
 *
 * Beside every step, the business rule: a database password never comes back. Every response from the API gateway
 * is read, and none may hold the password this spec typed -- only the request that set it may carry it.
 *
 * Needs integration-service behind :9098, workspace 2924's storage connection ui-review-s3 holding
 * sources-live-check/live-customers.csv, and a console at E2E_BASE_URL (default :4400) that has MIG-248.
 * Sign-in, either:
 *   E2E_TENANT_ADMIN_TOKEN                          a TENANT_ADMIN access token (e.g. from
 *                                                   etl-platform/scripts/mint-test-token.sh 4537 900), or
 *   E2E_TENANT_ADMIN / E2E_TENANT_ADMIN_PASSWORD    a TENANT_ADMIN's credentials
 * Everything it makes is named "UI-CHECK e2e …" (the template it installs keeps the template's name) and is left
 * in place: the workspace's owner clears test data.
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';
const token = process.env['E2E_TENANT_ADMIN_TOKEN'];
const admin = { username: process.env['E2E_TENANT_ADMIN'], password: process.env['E2E_TENANT_ADMIN_PASSWORD'] };
const STORAGE = process.env['E2E_SOURCE_STORAGE'] ?? 'ui-review-s3';
const CSV_PATH = process.env['E2E_SOURCE_PATH'] ?? 'sources-live-check/live-customers.csv';

const STAMP = Date.now().toString(36);
const SOURCE = `UI-CHECK e2e source ${STAMP}`;
const CONNECTION = `UI-CHECK e2e db ${STAMP}`;
const CONTRACT = `UI-CHECK e2e contract ${STAMP}`;
const PASSWORD = `e2e-db-password-${STAMP}-${Math.random().toString(36).slice(2)}`;

interface Session { data: Record<string, unknown>; token: string; }

async function session(request: APIRequestContext): Promise<Session> {
  if (token) {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    const pages = await (await request.get(`${api}/pageAccess.json/mine`, { headers: { Authorization: `Bearer ${token}` } })).json();
    return { token, data: { username: claims.sub, fullName: claims.sub, userRole: claims.userRole, appUserId: claims.appUserId,
      tenantId: claims.tenantId, accessToken: token, refreshToken: '', pageKeys: pages?.data?.pageKeys } };
  }
  const answer = await request.post(`${api}/auth.json/login`, { data: admin, failOnStatusCode: false });
  const body = await answer.json();
  expect(body.status, `sign-in for ${admin.username}`).toBe('SUCCESS');
  return { data: body.data, token: body.data.accessToken };
}

async function pageAs(browser: Browser, s: Session): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(user => window.localStorage.setItem('etl_auth_user', JSON.stringify(user)), s.data);
  return page;
}

/** Every gateway response whose body holds the password: must stay empty. */
function watchForPassword(page: Page): { leaks: string[]; scanned: () => number } {
  const leaks: string[] = [];
  let scanned = 0;
  page.on('response', async (r: Response) => {
    if (!r.url().startsWith(api.replace(/\/api\/v1$/, ''))) return;
    try {
      const body = await r.text();
      scanned++;
      if (body.includes(PASSWORD)) leaks.push(`${r.request().method()} ${r.url()}`);
    } catch { /* no body (a preflight, a redirect) */ }
  });
  return { leaks, scanned: () => scanned };
}

test.describe('Sources', () => {
  test.skip(!token && (!admin.username || !admin.password), 'Set E2E_TENANT_ADMIN_TOKEN, or E2E_TENANT_ADMIN(_PASSWORD), to run this.');

  let s: Session;
  test.beforeAll(async ({ request }) => { s = await session(request); });

  test('a file source: create → test → preview → schema', async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await pageAs(browser, s);
    await page.goto('/integration/sources');
    await expect(page.getByRole('heading', { level: 1, name: 'Sources' })).toBeVisible();

    await page.getByRole('button', { name: 'New source' }).first().click();
    const panel = page.locator('app-source-panel');
    await expect(panel.getByRole('heading', { name: 'New source' })).toBeVisible();
    await panel.locator('#srcName').fill(SOURCE);
    await panel.getByRole('button', { name: 'File', exact: true }).click();
    await panel.locator('#srcStorage').selectOption(STORAGE);
    await panel.locator('#srcPath').fill(CSV_PATH);
    await panel.locator('#srcFormat').selectOption('CSV');

    // ---- test: a new source is saved first, since the service reads the saved one
    await expect(panel).toContainText('Unsaved changes are saved first');
    await panel.getByRole('button', { name: 'Test connection' }).click();
    const tested = panel.locator('[data-test="test-result"]');
    await expect(tested).toBeVisible({ timeout: 30_000 });
    await expect(tested).toContainText('Answered');
    await expect(panel.getByRole('heading', { name: `Edit source · ${SOURCE}` })).toBeVisible();

    // ---- preview: the first rows, as the service returned them
    await panel.getByRole('button', { name: 'Preview', exact: true }).click();
    const rows = panel.locator('[data-test="preview-rows"]');
    await expect(rows).toBeVisible({ timeout: 30_000 });
    await expect(rows.locator('thead')).toContainText('customer_id');
    await expect(rows.locator('tbody tr').first()).toBeVisible();

    // ---- schema: inferred from the preview, kept on the source, as fields and as raw JSON
    await panel.getByRole('button', { name: 'Infer schema' }).click();
    const fields = panel.locator('[data-test="schema-fields"]');
    await expect(fields).toBeVisible({ timeout: 30_000 });
    await expect(fields).toContainText('customer_id');
    await expect(fields).toContainText('Required');
    await panel.getByRole('button', { name: 'Raw JSON' }).click();
    await expect(panel.locator('[data-test="schema-raw"]')).toContainText('"properties"');

    await panel.locator('.side-panel-foot').getByRole('button', { name: 'Close', exact: true }).click();
    const row = page.locator('[data-test="sources"] tbody tr', { hasText: SOURCE });
    await expect(row).toContainText('Answered');
  });

  test('a database connection: the password is write-only', async ({ browser }) => {
    test.setTimeout(90_000);
    const page = await pageAs(browser, s);
    const watch = watchForPassword(page);
    await page.goto('/integration/sources?tab=connections');
    await page.getByRole('button', { name: 'New connection' }).first().click();
    const dialog = page.locator('app-connection-dialog');
    await dialog.locator('#dbName').fill(CONNECTION);
    await dialog.locator('#dbHost').fill('db.invalid');
    await dialog.locator('#dbDatabase').fill('ui_check');
    await dialog.locator('#dbUser').fill('ui_check_reader');
    const box = dialog.locator('#dbPassword');
    await expect(box).toHaveAttribute('type', 'password');
    await box.fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Create' }).click();

    const row = page.locator('[data-test="connections"] tbody tr', { hasText: CONNECTION });
    await expect(row).toContainText('configured');
    await expect(page.locator('body')).not.toContainText(PASSWORD);

    // Opened again: "configured" and Replace -- no box holds it, and Replace starts empty.
    await row.getByRole('button', { name: CONNECTION, exact: true }).click();
    await expect(dialog).toContainText('configured');
    await expect(dialog.locator('#dbPassword')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Replace' }).click();
    await expect(dialog.locator('#dbPassword')).toHaveValue('');
    await dialog.getByRole('button', { name: 'Keep the stored password' }).click();
    // Test: the host does not resolve, and the dialog says it did not connect.
    await dialog.getByRole('button', { name: 'Test connection' }).click();
    await expect(dialog.locator('[role="status"]')).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await page.waitForTimeout(500);
    expect(watch.scanned()).toBeGreaterThan(2);
    expect(watch.leaks, 'responses holding the database password').toEqual([]);
  });

  test('data contracts: install a template, propose one from a sample, validate payloads', async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await pageAs(browser, s);
    await page.goto('/integration/sources?tab=contracts');
    const contracts = page.locator('[data-test="contracts"]');
    await expect(contracts).toContainText('result_manifest');
    await expect(contracts).toContainText('System · read-only');

    // ---- install: wound_result, unless this workspace already has it (the spec may have run before)
    await page.getByRole('button', { name: 'Install template' }).click();
    const templates = page.locator('app-template-dialog');
    await expect(templates).toContainText('wound_intake');
    const install = templates.getByRole('button', { name: 'Install wound_result' });
    if (await install.count()) await install.click();
    await expect(templates.locator('li', { hasText: 'wound_result' })).toContainText('Installed', { timeout: 20_000 });
    await templates.getByRole('button', { name: 'Close' }).click();
    await expect(contracts).toContainText('wound_result');

    // ---- propose from a sample, mark a field required, save v1
    await page.getByRole('button', { name: 'New from sample' }).click();
    const sample = page.locator('app-contract-sample-dialog');
    await sample.locator('#csName').fill(CONTRACT);
    await sample.locator('#csSample').fill(JSON.stringify({ order_id: 'A-1', total: 12.5, note: 'x', items: [{ sku: 'S', qty: 1 }] }));
    await sample.getByRole('button', { name: 'Propose schema' }).click();
    await expect(sample.locator('[data-test="proposal-fields"]')).toContainText('order_id', { timeout: 20_000 });
    await sample.getByLabel('Required: note').uncheck();
    await sample.getByRole('button', { name: 'Save v1' }).click();
    await expect(contracts).toContainText(CONTRACT);

    // ---- validate against wound_intake: a payload that fails, then its template's example, which holds
    await contracts.getByRole('button', { name: 'wound_intake', exact: true }).click();
    const panel = page.locator('app-contract-panel');
    await expect(panel.locator('[data-test="schema-fields"]')).toContainText('case_id');
    await panel.locator('#ctPayload').fill(JSON.stringify({ case_id: '', patient: {}, images: [] }));
    await panel.getByRole('button', { name: 'Validate' }).click();
    const errors = panel.locator('[data-test="validation-errors"]');
    await expect(errors).toBeVisible({ timeout: 20_000 });
    await expect(errors).toContainText('$.captured_at');
    await expect(errors).toContainText('required');
    await panel.locator('#ctPayload').fill(JSON.stringify({
      case_id: 'WC-1001', patient: { mrn: 'M-77' }, wound: { location: 'left heel', type: 'pressure_injury' },
      images: [{ file_key: 'intake/WC-1001/1.jpg' }], captured_at: '2026-09-28T09:15:00-05:00',
    }));
    await panel.getByRole('button', { name: 'Validate' }).click();
    await expect(panel.locator('[data-test="validation"]')).toContainText('Holds', { timeout: 20_000 });
  });
});
