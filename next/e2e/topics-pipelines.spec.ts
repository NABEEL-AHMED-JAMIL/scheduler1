import { test, expect, APIRequestContext, Browser, Page } from '@playwright/test';

/**
 * Topics and pipelines, end to end, as a tenant administrator: a topic is added under the workspace's
 * Kafka profile, a pipeline is defined on that topic, a task is made by picking the topic and
 * then one of its pipelines, the Source Tasks list narrows topic → pipeline, and the topic
 * refuses to be deleted while the pipeline still publishes on it. Every long picker on the way
 * is the searchable box, so the test types into it rather than choosing an <option>; the topic
 * boxes ask the server for what was typed, and the task's topic comes after its connection.
 *
 * Needs one real account, given through the environment so no password lives here:
 *
 *   E2E_TENANT_ADMIN / E2E_TENANT_ADMIN_PASSWORD   a TENANT_ADMIN whose workspace has a Kafka
 *                                                  profile marked default
 *
 * Skips without it. Cleans up in reverse -- task, pipeline, topic -- through the API.
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';
const admin = { username: process.env['E2E_TENANT_ADMIN'], password: process.env['E2E_TENANT_ADMIN_PASSWORD'] };

const STAMP = Date.now().toString(36);
const TOPIC_NAME = `E2E topic ${STAMP}`;
const KAFKA_TOPIC = `e2e-topic-${STAMP}`;
const PIPELINE_ID = `E2E${STAMP.toUpperCase()}`;
const PIPELINE_NAME = `E2E pipeline ${STAMP}`;
const TASK_NAME = `E2E task ${STAMP}`;

interface Session { data: Record<string, unknown>; token: string; }

async function signIn(request: APIRequestContext, username: string, password: string): Promise<Session> {
  const answer = await request.post(`${api}/auth.json/login`, { data: { username, password }, failOnStatusCode: false });
  const body = await answer.json();
  expect(body.status, `sign-in for ${username}`).toBe('SUCCESS');
  return { data: body.data, token: body.data.accessToken };
}

async function pageAs(browser: Browser, session: Session): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(user => window.localStorage.setItem('etl_auth_user', JSON.stringify(user)), session.data);
  return page;
}

/** Types into a searchable box and picks the row whose label contains `label`. */
async function pick(page: Page, boxId: string, typed: string, label: string): Promise<void> {
  // The id sits on the box's own <input>; its option list is a sibling inside the same wrapper.
  const input = page.locator(`#${boxId}`);
  await input.click();
  await input.fill(typed);
  await input.locator('..').locator('[role="option"]', { hasText: label }).first().click();
  await expect(input).toHaveValue(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

test.describe('topics and pipelines', () => {
  test.skip(!admin.username || !admin.password, 'Set E2E_TENANT_ADMIN(_PASSWORD) to run this.');

  let session: Session;
  let headers: Record<string, string>;
  let topicId: number | null = null;
  let pipelineKey: number | null = null;
  let taskId: number | null = null;

  test.beforeAll(async ({ request }) => {
    session = await signIn(request, admin.username!, admin.password!);
    headers = { Authorization: `Bearer ${session.token}` };
  });

  test.afterAll(async ({ request }) => {
    if (!session) return;
    if (taskId) await request.put(`${api}/sourceTask.json/deleteSourceTask`, { headers, data: { taskDetailId: taskId } });
    if (pipelineKey) await request.delete(`${api}/pipeline.json/delete?pipelineKey=${pipelineKey}`, { headers });
    if (topicId) await request.delete(`${api}/setting.json/deleteSourceTaskType?sourceTaskTypeId=${topicId}`, { headers });
  });

  test('a topic is added under the profile, a pipeline on the topic, a task through both', async ({ browser, request }) => {
    const page = await pageAs(browser, session);

    // ── 1. Kafka & Topics: add a topic under the workspace's profile ─────────────────────
    await page.goto('/configuration/kafka');
    await page.getByRole('button', { name: 'Add topic' }).click();
    // The dialog animates in; a fill that lands mid-mount is dropped.
    await page.getByRole('heading', { name: 'New topic' }).waitFor();
    await page.locator('#serviceName').fill(TOPIC_NAME);
    await page.locator('#topic').fill(KAFKA_TOPIC);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText(`Topic saved with`)).toBeVisible();
    const topics = await (await request.get(`${api}/setting.json/appSetting`, { headers })).json();
    topicId = topics.data.sourceTaskTypes.find((t: any) => t.serviceName === TOPIC_NAME)?.sourceTaskTypeId ?? null;
    expect(topicId, 'the topic exists').toBeTruthy();

    // The topic row is listed under the profile, with no pipeline yet and a broker test.
    const topicRow = page.locator('.kafka-topics tbody tr', { hasText: TOPIC_NAME });
    await expect(topicRow).toBeVisible();
    await expect(topicRow.getByText(KAFKA_TOPIC)).toBeVisible();
    await topicRow.getByRole('button', { name: 'Test topic' }).click();
    await expect(topicRow.getByText(/reachable|does not exist|Could not reach/)).toBeVisible();

    // ── 2. Pipelines: define one on that topic (the topic box is searchable) ─────────────
    await page.goto('/configuration/pipelines');
    await page.getByRole('button', { name: 'New pipeline' }).click();
    await page.getByRole('heading', { name: 'New pipeline' }).waitFor();
    await page.locator('#pipelineId').fill(PIPELINE_ID);
    await page.locator('#pipelineName').fill(PIPELINE_NAME);
    await pick(page, 'pipelineTopic', STAMP, TOPIC_NAME);
    await page.getByRole('button', { name: /Add (a )?field/i }).first().click();
    await page.locator('input[formcontrolname="tagKey"], input[id^="tagKey"]').first().fill('input_folder');
    await page.locator('input[formcontrolname="label"], input[id^="label"]').first().fill('Input folder');
    await page.getByRole('button', { name: 'Create pipeline' }).click();
    await expect(page.getByText(`"${PIPELINE_NAME}" saved`)).toBeVisible();
    // The list is paged now; the topic's own list is the direct way to the row.
    const pipelines = await (await request.get(`${api}/pipeline.json/listForTopic?sourceTaskTypeId=${topicId}`, { headers })).json();
    const pipelineRow = pipelines.data.find((p: any) => p.pipelineId === PIPELINE_ID);
    pipelineKey = pipelineRow?.pipelineKey ?? null;
    expect(pipelineRow?.sourceTaskTypeId, 'the pipeline names the topic').toBe(topicId);

    // The topic row on the Kafka pane now names it (one pipeline shows inline, by name).
    await page.goto('/configuration/kafka');
    await expect(page.locator('.kafka-topics tbody tr', { hasText: TOPIC_NAME }).locator('a', { hasText: PIPELINE_NAME })).toBeVisible();

    // ── 3. A task: connection → topic → pipeline, each list fetched on the pick before ──
    await page.goto('/operations/tasks/new');
    await page.getByRole('heading', { name: 'New task' }).waitFor();
    await page.locator('#taskName').fill(TASK_NAME);
    await expect(page.locator('#pipeline')).toHaveAttribute('placeholder', 'Pick a topic first');
    // A tenant administrator's one default connection is picked for them; the topic was added under it.
    await expect(page.locator('#taskProfile')).not.toHaveValue('');
    await pick(page, 'taskType', STAMP, TOPIC_NAME);
    await expect(page.locator('#pipeline')).toHaveAttribute('placeholder', /this topic’s pipelines/);
    await pick(page, 'pipeline', STAMP, PIPELINE_NAME);
    await expect(page.getByText(`Defined for ${PIPELINE_ID}`)).toBeVisible();
    await page.getByLabel('Input folder').fill('e2e/in');
    await page.getByRole('button', { name: 'Create task' }).click();
    await expect(page.getByText('Task created.')).toBeVisible();
    // listSourceTask is a POST with an optional search body; page/limit ride on the query string.
    const tasks = await (await request.post(`${api}/sourceTask.json/listSourceTask?page=1&limit=1000`, { headers, data: {} })).json();
    const taskRow = tasks.data.find((t: any) => t.taskName === TASK_NAME);
    taskId = taskRow?.taskDetailId ?? null;
    expect(taskRow?.pipelineId).toBe(PIPELINE_ID);
    expect(taskRow?.sourceTaskType?.sourceTaskTypeId).toBe(topicId);

    // ── 4. Source Tasks: filter topic → pipeline lands on that one row ───────────────────
    await page.goto('/operations/tasks');
    await pick(page, 'tasks-topic', STAMP, TOPIC_NAME);
    await pick(page, 'tasks-pipeline', PIPELINE_ID, PIPELINE_ID);
    await expect(page.locator('table tbody tr')).toHaveCount(1);
    await expect(page.locator('table tbody tr').first()).toContainText(TASK_NAME);

    // ── 5. The topic cannot go while the pipeline publishes on it ────────────────────────
    const refused = await (await request.delete(`${api}/setting.json/deleteSourceTaskType?sourceTaskTypeId=${topicId}`, { headers })).json();
    expect(refused.status).toBe('ERROR');
    expect(refused.message).toContain('still publish');
  });
});
