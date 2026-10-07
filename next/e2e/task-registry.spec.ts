import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { api, authOf, canSignIn, NEEDS, pageAs, Session, sessionFor } from './support/session';
import { bestEffort, Pipeline, pipelineById } from './support/workspace';
import { hasFixtures, NEEDS_FIXTURES, pipeline, pipelinesOf, riverside } from './support/fixtures';

/**
 * MIG-250: Configuration › Task Registry end to end, as Riverside Health's administrator: the list shows every kind
 * (Read, Process, Output and a Legacy row per pipeline), a task's side panel, an administrator's switch off and back to
 * its default (restored in afterAll whatever happens), and a Legacy row opening the existing pipeline dialog. The rebuilt
 * pipelines (support/fixtures.ts) are only viewed -- the readmission one's dialog is opened and cancelled; the save test
 * saves the spec's own "E2E legacy pipeline <stamp>", made for the run on the workspace's topic and deleted afterwards.
 *
 * Needs Core behind :9098 and a console at E2E_BASE_URL with MIG-250. Sign-in: support/session.ts (role admin).
 */
const SWITCHED = 'aggregate';
const STAMP = Date.now().toString(36).toUpperCase();
const CHECK_ID = `E2E_LEGACY_${STAMP}`;
const CHECK_NAME = `E2E legacy pipeline ${STAMP}`;


const headers = (s: Session) => authOf(s);
/** The rebuilt pipelines this spec lists (three of Riverside's), and the one whose dialog it opens (readmission). */
let LISTED: string[] = [];
let SHARED: Pipeline;
const KEY: Record<string, number> = {};
let TOPIC = 0;
/** The spec's own legacy pipeline, made for this run. */
let CHECK_KEY = 0;
const row = (page: Page, id: string) => page.locator(`tr[data-row="${id}"]`);

test.describe('Task Registry', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);

  let s: Session;
  test.beforeAll(async ({ request }) => {
    s = await sessionFor(request, 'admin');
    LISTED = pipelinesOf('riverside').slice(0, 3).map(([, p]) => p.pipelineId);
    for (const id of LISTED) KEY[id] = (await pipelineById(request, s, id)).pipelineKey;
    SHARED = await pipelineById(request, s, pipeline('readmission').pipelineId);
    KEY[SHARED.pipelineId] = SHARED.pipelineKey;
    // The topic the rebuilt pipelines publish on.
    TOPIC = riverside().topicId;
  });

  test.afterAll(async ({ request }) => {
    if (!s) return;
    // Never leave a task switched: back to its default, whatever the test did.
    await request.post(`${api}/pipeline.json/steps/tasks/enabled`, { headers: headers(s), data: { code: SWITCHED, enabled: null } });
    if (CHECK_KEY) await bestEffort(`delete pipeline ${CHECK_ID}`, () =>
      request.delete(`${api}/pipeline.json/delete?pipelineKey=${CHECK_KEY}`, { headers: headers(s) }));
  });

  test('lists every kind, and each pipeline as a Legacy task', async ({ browser }) => {
    const page = await pageAs(browser, s);
    await page.goto('/configuration/task-registry');
    await expect(page.getByRole('heading', { name: 'Task Registry' })).toBeVisible();
    for (const kind of ['Read', 'Process', 'Output', 'Legacy']) {
      await expect(page.locator(`tbody [data-kind="${kind}"]`).first()).toBeVisible();
    }
    for (const id of LISTED) await expect(row(page, `legacy:${KEY[id]}`)).toContainText('Legacy');
    await expect(row(page, `legacy:${SHARED.pipelineKey}`)).toContainText(SHARED.pipelineId);
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
    await page.getByRole('button', { name: `Open ${SHARED.pipelineName}` }).click();
    const panel = page.getByRole('dialog', { name: SHARED.pipelineName });
    await expect(panel).toContainText(SHARED.pipelineId);
    await expect(panel.locator('.pipeline-fields li').first()).toBeVisible();
    await expect(panel.getByRole('switch')).toHaveCount(0);
    await panel.getByRole('button', { name: 'Edit registry task' }).click();
    const dialog = page.locator('app-pipeline-dialog');
    await expect(dialog.getByRole('heading', { name: 'Edit registry task' })).toBeVisible();
    await expect(dialog.locator('#pipelineId')).toHaveValue(SHARED.pipelineId);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('a Legacy row\'s dialog saves as before: same pipeline, topic and fields in order', async ({ browser, request }) => {
    const key = await checkPipeline(request, s);
    const before = await fieldsOf(request, s, key);
    const page = await pageAs(browser, s);
    await page.goto('/configuration/task-registry');
    await page.getByRole('button', { name: `Open ${CHECK_NAME}` }).click();
    await page.getByRole('dialog', { name: CHECK_NAME }).getByRole('button', { name: 'Edit pipeline' }).click();
    const dialog = page.locator('app-pipeline-dialog');
    await expect(dialog.locator('#pipelineId')).toHaveValue(CHECK_ID);
    const sent = page.waitForRequest(r => r.url().includes('/pipeline.json/save') && r.method() === 'POST');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    const body = JSON.parse((await sent).postData() ?? '{}');
    expect(body).toMatchObject({ pipelineKey: key, pipelineId: CHECK_ID, pipelineName: CHECK_NAME, sourceTaskTypeId: TOPIC, status: 'Active' });
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

/** The spec's own legacy pipeline: found by its id, or created (and deleted in afterAll). */
async function checkPipeline(request: APIRequestContext, s: Session): Promise<number> {
  const list = await (await request.get(`${api}/pipeline.json/list?page=1&limit=1000&q=${CHECK_ID}`, { headers: headers(s) })).json();
  const found = (list.data?.rows ?? []).find((p: { pipelineId: string }) => p.pipelineId === CHECK_ID);
  if (found) return (CHECK_KEY = found.pipelineKey);
  const saved = await (await request.post(`${api}/pipeline.json/save`, { headers: headers(s), data: {
    pipelineId: CHECK_ID, pipelineName: CHECK_NAME, sourceTaskTypeId: TOPIC, status: 'Active',
    description: 'MIG-250 e2e: a legacy dialog saved from the Task Registry. Deleted by the spec.',
    fields: [
      { tagKey: 'inputKey', label: 'Input CSV', fieldType: 'text', required: true, position: 0 },
      { tagKey: 'format', label: 'Shape', fieldType: 'select', required: false, defaultValue: 'records', fieldOptions: 'records=JSON array\nlines=JSON Lines', position: 1 },
      { tagKey: 'note', label: 'Note', fieldType: 'textarea', required: false, helpText: 'Anything', position: 2 },
    ],
  } })).json();
  expect(saved.status, saved.message).toBe('SUCCESS');
  return checkPipeline(request, s);
}
