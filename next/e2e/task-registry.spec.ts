import { test, expect, APIRequestContext, Browser, Page } from '@playwright/test';

/**
 * MIG-250: Configuration › Task Registry end to end, as a workspace administrator of workspace 2924: the list shows
 * every kind (Read, Process, Output and a Legacy row per pipeline), a task's side panel, an administrator's switch
 * off and back to its default (restored in afterAll whatever happens), and a Legacy row opening the existing pipeline
 * dialog. The shared legacy pipeline 100167 (REF_CSV_CHECK_V1, used by 15 jobs) is only viewed; the save test saves
 * the spec's own "UI-CHECK legacy pipeline" (created once, left in place for the owner to clear).
 *
 * Needs Core behind :9098 and a console at E2E_BASE_URL with MIG-250 (e.g. `ng serve --port 4418`). Sign-in:
 *   E2E_TENANT_ADMIN_TOKEN   a TENANT_ADMIN access token (etl-platform/scripts/mint-test-token.sh 4537 900)
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';
const token = process.env['E2E_TENANT_ADMIN_TOKEN'];
const SWITCHED = 'aggregate';
const CHECK_ID = 'UI_CHECK_LEGACY_0929';

interface Session { data: Record<string, unknown>; token: string; }

async function session(request: APIRequestContext): Promise<Session> {
  const claims = JSON.parse(Buffer.from(token!.split('.')[1], 'base64url').toString('utf8'));
  const pages = await (await request.get(`${api}/pageAccess.json/mine`, { headers: { Authorization: `Bearer ${token}` } })).json();
  return { token: token!, data: { username: claims.sub, fullName: claims.sub, userRole: claims.userRole, appUserId: claims.appUserId,
    tenantId: claims.tenantId, accessToken: token, refreshToken: '', pageKeys: pages?.data?.pageKeys } };
}

async function pageAs(browser: Browser, s: Session): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(user => window.localStorage.setItem('etl_auth_user', JSON.stringify(user)), s.data);
  return page;
}

const headers = (s: Session) => ({ Authorization: `Bearer ${s.token}` });
const row = (page: Page, id: string) => page.locator(`tr[data-row="${id}"]`);

test.describe('Task Registry', () => {
  test.skip(!token, 'Set E2E_TENANT_ADMIN_TOKEN to run this.');

  let s: Session;
  test.beforeAll(async ({ request }) => { s = await session(request); });

  test.afterAll(async ({ request }) => {
    // Never leave a task switched: back to its default, whatever the test did.
    if (s) await request.post(`${api}/pipeline.json/steps/tasks/enabled`, { headers: headers(s), data: { code: SWITCHED, enabled: null } });
  });

  test('lists every kind, and each pipeline as a Legacy task', async ({ browser }) => {
    const page = await pageAs(browser, s);
    await page.goto('/configuration/task-registry');
    await expect(page.getByRole('heading', { name: 'Task Registry' })).toBeVisible();
    for (const kind of ['Read', 'Process', 'Output', 'Legacy']) {
      await expect(page.locator(`tbody [data-kind="${kind}"]`).first()).toBeVisible();
    }
    for (const key of [100167, 100175, 100177]) await expect(row(page, `legacy:${key}`)).toContainText('Legacy');
    await expect(row(page, 'legacy:100167')).toContainText('REF_CSV_CHECK_V1');
    await expect(row(page, 'write_database')).toContainText('Unavailable');
    await page.getByLabel('Kind').selectOption('Legacy');
    await expect(page.locator('tbody tr[data-row]').first()).toHaveAttribute('data-row', /^legacy:/);
    await expect(row(page, 'filter')).toHaveCount(0);
  });

  test('opens a task\'s panel: settings, input and output, how it runs', async ({ browser }) => {
    const page = await pageAs(browser, s);
    await page.goto('/configuration/task-registry');
    await page.getByRole('button', { name: 'Open Filter' }).click();
    const panel = page.getByRole('dialog', { name: 'Filter' });
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-setting="conditions"]')).toContainText('Repeatable group');
    await expect(panel.locator('[data-setting="column"]')).toBeVisible();
    await expect(panel).toContainText('filter_rows');
    await expect(panel).toContainText('Once, no retry');
    await expect(panel).toContainText('Any member');
    await expect(panel.getByRole('switch')).toBeEnabled();
    await panel.getByRole('button', { name: 'Close' }).last().click();
    await expect(panel).toHaveCount(0);
  });

  test('an administrator switches a task off and back to its default', async ({ browser, request }) => {
    const page = await pageAs(browser, s);
    await page.goto('/configuration/task-registry');
    await expect(row(page, SWITCHED)).toContainText('On');
    await page.getByRole('button', { name: 'Open Aggregate' }).click();
    const panel = page.getByRole('dialog', { name: 'Aggregate' });
    await panel.getByRole('switch').uncheck();
    await expect(panel.locator('app-task-state')).toContainText('Switched here');
    await expect(row(page, SWITCHED)).toContainText('Off');
    await panel.getByRole('button', { name: 'Put Aggregate back to its default' }).click();
    await expect(panel.locator('app-task-state')).not.toContainText('Switched here');
    await expect(row(page, SWITCHED)).toContainText('On');
    const line = (await (await request.get(`${api}/pipeline.json/steps/tasks`, { headers: headers(s) })).json())
      .data.find((t: { code: string }) => t.code === SWITCHED);
    expect(line).toMatchObject({ enabled: true, overridden: false });
  });

  test('a Legacy row opens the existing pipeline dialog (viewed only)', async ({ browser }) => {
    const page = await pageAs(browser, s);
    await page.goto('/configuration/task-registry');
    await page.getByRole('button', { name: 'Open Reference: CSV check and summarise' }).click();
    const panel = page.getByRole('dialog', { name: 'Reference: CSV check and summarise' });
    await expect(panel).toContainText('REF_CSV_CHECK_V1');
    await expect(panel.locator('.pipeline-fields li').first()).toBeVisible();
    await expect(panel.getByRole('switch')).toHaveCount(0);
    await panel.getByRole('button', { name: 'Edit pipeline' }).click();
    const dialog = page.locator('app-pipeline-dialog');
    await expect(dialog.getByRole('heading', { name: 'Edit pipeline' })).toBeVisible();
    await expect(dialog.locator('#pipelineId')).toHaveValue('REF_CSV_CHECK_V1');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('a Legacy row\'s dialog saves as before: same pipeline, topic and fields in order', async ({ browser, request }) => {
    const key = await checkPipeline(request, s);
    const before = await fieldsOf(request, s, key);
    const page = await pageAs(browser, s);
    await page.goto('/configuration/task-registry');
    await page.getByRole('button', { name: 'Open UI-CHECK legacy pipeline' }).click();
    await page.getByRole('dialog', { name: 'UI-CHECK legacy pipeline' }).getByRole('button', { name: 'Edit pipeline' }).click();
    const dialog = page.locator('app-pipeline-dialog');
    await expect(dialog.locator('#pipelineId')).toHaveValue(CHECK_ID);
    const sent = page.waitForRequest(r => r.url().includes('/pipeline.json/save') && r.method() === 'POST');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    const body = JSON.parse((await sent).postData() ?? '{}');
    expect(body).toMatchObject({ pipelineKey: key, pipelineId: CHECK_ID, pipelineName: 'UI-CHECK legacy pipeline', sourceTaskTypeId: 11831, status: 'Active' });
    expect(body.fields.map((f: { tagKey: string; position: number }) => `${f.position}:${f.tagKey}`)).toEqual(before.map(f => `${f.position}:${f.tagKey}`));
    await expect(dialog).toHaveCount(0);
    // Saved untouched: the stored fields are what they were.
    expect((await fieldsOf(request, s, key)).map(strip)).toEqual(before.map(strip));
  });
});

interface Field { pipelineFieldId?: number; tagKey: string; position: number; [k: string]: unknown; }
const strip = (f: Field) => { const { pipelineFieldId, ...rest } = f; return rest; };

async function fieldsOf(request: APIRequestContext, s: Session, key: number): Promise<Field[]> {
  const body = await (await request.get(`${api}/pipeline.json/fields?pipelineKey=${key}`, { headers: headers(s) })).json();
  expect(body.status).toBe('SUCCESS');
  return body.data;
}

/** The spec's own legacy pipeline: found by its id, or created once (and left for the owner to clear). */
async function checkPipeline(request: APIRequestContext, s: Session): Promise<number> {
  const list = await (await request.get(`${api}/pipeline.json/list?page=1&limit=1000&q=${CHECK_ID}`, { headers: headers(s) })).json();
  const found = (list.data?.rows ?? []).find((p: { pipelineId: string }) => p.pipelineId === CHECK_ID);
  if (found) return found.pipelineKey;
  const saved = await (await request.post(`${api}/pipeline.json/save`, { headers: headers(s), data: {
    pipelineId: CHECK_ID, pipelineName: 'UI-CHECK legacy pipeline', sourceTaskTypeId: 11831, status: 'Active',
    description: 'MIG-250 e2e: a legacy dialog saved from the Task Registry. Safe to delete.',
    fields: [
      { tagKey: 'inputKey', label: 'Input CSV', fieldType: 'text', required: true, position: 0 },
      { tagKey: 'format', label: 'Shape', fieldType: 'select', required: false, defaultValue: 'records', fieldOptions: 'records=JSON array\nlines=JSON Lines', position: 1 },
      { tagKey: 'note', label: 'Note', fieldType: 'textarea', required: false, helpText: 'Anything', position: 2 },
    ],
  } })).json();
  expect(saved.status, saved.message).toBe('SUCCESS');
  return checkPipeline(request, s);
}
