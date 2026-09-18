import { test, expect, APIRequestContext, Browser, Page } from '@playwright/test';

/**
 * A model as a pipeline step, end to end, as a tenant admin: a model connection is added
 * and tested, a prompt is written with two variables and tried against the model, a
 * pipeline gets an AI step configured in the drawer (prompt, variable map), a task on it
 * shows the step as a read-only card, and a run of a job on that task carries the model's
 * answer in its history. Cleans up in reverse through the API.
 *
 * Needs:
 *   E2E_TENANT_ADMIN / E2E_TENANT_ADMIN_PASSWORD   a TENANT_ADMIN whose workspace has a
 *                                                  default Kafka profile and a topic
 *   a local Ollama the server can reach (host.docker.internal:11434) with E2E_OLLAMA_MODEL
 *   (default gemma3:1b) pulled -- the Try it and the run make real calls
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';
const admin = { username: process.env['E2E_TENANT_ADMIN'], password: process.env['E2E_TENANT_ADMIN_PASSWORD'] };
const MODEL = process.env['E2E_OLLAMA_MODEL'] ?? 'gemma3:1b';

const STAMP = Date.now().toString(36);
const CONNECTION = `E2E Ollama ${STAMP}`;
const PROMPT = `E2E summarise ${STAMP}`;
const PIPELINE_ID = `E2EAI${STAMP.toUpperCase()}`;
const PIPELINE_NAME = `E2E AI pipeline ${STAMP}`;
const TASK_NAME = `E2E AI task ${STAMP}`;
const JOB_NAME = `E2E AI job ${STAMP}`;

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
  const input = page.locator(`#${boxId}`);
  await input.click();
  await input.fill(typed);
  await input.locator('..').locator('[role="option"]', { hasText: label }).first().click();
  await expect(input).toHaveValue(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

test.describe('AI prompts in pipelines', () => {
  test.skip(!admin.username || !admin.password, 'Set E2E_TENANT_ADMIN(_PASSWORD) to run this.');

  let session: Session;
  let headers: Record<string, string>;
  let connectionId: number | null = null;
  let promptId: number | null = null;
  let pipelineKey: number | null = null;
  let taskId: number | null = null;
  let jobId: number | null = null;

  test.beforeAll(async ({ request }) => {
    session = await signIn(request, admin.username!, admin.password!);
    headers = { Authorization: `Bearer ${session.token}` };
  });

  test.afterAll(async ({ request }) => {
    if (!session) return;
    if (jobId) await request.put(`${api}/sourceJob.json/deleteSourceJob`, { headers, data: { jobId } });
    if (taskId) await request.put(`${api}/sourceTask.json/deleteSourceTask`, { headers, data: { taskDetailId: taskId } });
    if (pipelineKey) await request.delete(`${api}/pipeline.json/delete?pipelineKey=${pipelineKey}`, { headers });
    if (promptId) await request.delete(`${api}/aiPrompt.json/delete?promptId=${promptId}`, { headers });
    if (connectionId) await request.delete(`${api}/aiConnection.json/delete?connectionId=${connectionId}`, { headers });
  });

  test('connection → prompt tried → AI step on a pipeline → task → run carries the answer', async ({ browser, request }) => {
    test.setTimeout(240_000);
    const page = await pageAs(browser, session);

    // ── 1. Model connection: add, test (lists the models), see it on the pane ────────────
    await page.goto('/ai/connections');
    await page.getByRole('button', { name: 'New connection' }).click();
    await page.getByRole('heading', { name: 'New model connection' }).waitFor();
    await page.locator('#cxName').fill(CONNECTION);
    await page.locator('#cxProvider').selectOption('Ollama');
    await page.locator('#cxModel').fill(MODEL);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText(`"${CONNECTION}" saved.`)).toBeVisible();
    const connections = await (await request.get(`${api}/aiConnection.json/list`, { headers })).json();
    connectionId = connections.data.find((c: any) => c.name === CONNECTION)?.connectionId ?? null;
    expect(connectionId, 'the connection exists').toBeTruthy();
    await page.locator('.kafka-rail-item', { hasText: CONNECTION }).click();
    await page.getByRole('button', { name: 'Test connection' }).click();
    await expect(page.locator('.kafka-strip')).toContainText('model(s) listed');

    // ── 2. Prompt: two variables (added from the template), try it, save & activate ──────
    await page.goto('/ai/prompts/new');
    await page.getByRole('heading', { name: 'New prompt' }).waitFor();
    await page.locator('#pName').fill(PROMPT);
    await pick(page, 'pConnection', STAMP, CONNECTION);
    await page.locator('#pSystem').fill('You are a claims analyst. Answer in one short sentence.');
    await page.locator('#pTemplate').fill('Claim {{claim_id}}: summarise {{document_text}}');
    // Typing the placeholders made their rows; give them samples.
    const rows = page.locator('.prompt-vars tbody tr');
    await expect(rows).toHaveCount(2);
    await rows.nth(0).locator('input[formcontrolname="sample"]').fill('CLM-E2E-1');
    await rows.nth(1).locator('input[formcontrolname="sample"]').fill('Patient seen for a routine check; total billed 120.');
    await page.locator('.prompt-try').getByRole('button', { name: 'Run' }).click();
    await expect(page.locator('.prompt-try').getByText('answered')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('.prompt-try .prompt-out')).not.toBeEmpty();
    await page.getByRole('button', { name: 'Save & activate' }).click();
    await expect(page.getByText(/saved as v1 and active/)).toBeVisible();
    const prompts = await (await request.get(`${api}/aiPrompt.json/list`, { headers })).json();
    promptId = prompts.data.find((p: any) => p.name === PROMPT)?.promptId ?? null;
    expect(promptId, 'the prompt exists').toBeTruthy();

    // ── 3. Pipeline with an AI step, configured in the drawer ────────────────────────────
    // A topic on the workspace's default Kafka profile: that is the connection the task
    // editor lands on, and the broker the run is dispatched to.
    const profiles = await (await request.get(`${api}/kafkaConnectionProfile.json/fetchAllProfiles`, { headers })).json();
    const defaultProfile = profiles.data.find((p: any) => p.isDefault && p.status === 'Active');
    expect(defaultProfile, 'the workspace has a default Kafka profile').toBeTruthy();
    const topics = await (await request.get(`${api}/setting.json/topics?kafkaConnectionProfileId=${defaultProfile.kafkaConnectionProfileId}`, { headers })).json();
    const topic = topics.data.find((t: any) => t.status === 'Active');
    expect(topic, 'the default profile has a topic').toBeTruthy();
    await page.goto('/settings/pipelines');
    await page.getByRole('button', { name: 'New pipeline' }).click();
    await page.getByRole('heading', { name: 'New pipeline' }).waitFor();
    await page.locator('#pipelineId').fill(PIPELINE_ID);
    await page.locator('#pipelineName').fill(PIPELINE_NAME);
    await pick(page, 'pipelineTopic', topic.serviceName.slice(0, 12), topic.serviceName);
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Add field' }).click();
    await page.locator('#tagKey0').fill('claim_id'); await page.locator('#label0').fill('Claim id');
    await page.locator('#tagKey1').fill('document'); await page.locator('#label1').fill('Document text');
    await page.locator('#tagKey2').fill('summary'); await page.locator('#label2').fill('AI summary');
    await page.locator('#fieldType2').selectOption('ai');
    await page.locator('.ai-step-line').getByRole('button', { name: 'Configure' }).click();
    await expect(page.getByRole('heading', { name: 'AI step · <summary>' })).toBeVisible();
    await pick(page, 'aiStepPrompt', STAMP, PROMPT);
    const map = page.locator('.side-panel tbody select');
    await map.nth(0).selectOption('claim_id');
    await map.nth(1).selectOption('document');
    await expect(page.locator('.side-panel-foot')).toContainText('Ready');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.locator('.ai-step-line')).toContainText(PROMPT);
    await page.getByRole('button', { name: 'Create pipeline' }).click();
    await expect(page.getByText(`"${PIPELINE_NAME}" saved`)).toBeVisible();
    const pipelines = await (await request.get(`${api}/pipeline.json/listForTopic?sourceTaskTypeId=${topic.sourceTaskTypeId}`, { headers })).json();
    pipelineKey = pipelines.data.find((p: any) => p.pipelineId === PIPELINE_ID)?.pipelineKey ?? null;
    expect(pipelineKey, 'the pipeline exists').toBeTruthy();

    // A prompt a pipeline runs cannot be deactivated.
    const refused = await (await request.put(`${api}/aiPrompt.json/setStatus?promptId=${promptId}&status=Inactive`, { headers })).json();
    expect(refused.status).toBe('ERROR');
    expect(refused.message).toContain('pipeline(s) run this prompt');

    // ── 4. Task: the step is a read-only card, the other fields are inputs ───────────────
    await page.goto('/tasks/new');
    await page.getByRole('heading', { name: 'New task' }).waitFor();
    await page.locator('#taskName').fill(TASK_NAME);
    await expect(page.locator('#taskProfile')).not.toHaveValue('');
    await pick(page, 'taskType', topic.serviceName.slice(0, 12), topic.serviceName);
    await pick(page, 'pipeline', PIPELINE_ID, PIPELINE_ID);
    await expect(page.locator('.ai-step-card')).toContainText(PROMPT);
    await page.locator('[id="ff-|claim_id"]').fill('CLM-E2E-2');
    await page.locator('[id="ff-|document"]').fill('Patient seen for a fracture of the left tibia; total billed 412.');
    await page.getByRole('button', { name: 'Create task' }).click();
    await expect(page.getByText('Task created.')).toBeVisible();
    const tasks = await (await request.post(`${api}/sourceTask.json/listSourceTask?page=1&limit=1000`, { headers, data: {} })).json();
    taskId = tasks.data.find((t: any) => t.taskName === TASK_NAME)?.taskDetailId ?? null;
    expect(taskId, 'the task exists').toBeTruthy();

    // ── 5. A manual job, run now: the step runs before dispatch and the history says so ──
    const job = await (await request.post(`${api}/sourceJob.json/addSourceJob`, { headers, data: {
      jobName: JOB_NAME, taskDetail: { taskDetailId: taskId }, execution: 'Manual', priority: 1,
      maxAttempts: 1, retryBackoffSeconds: 30, jobStatus: 'Active', completeJob: false, failJob: false, skipJob: false,
    } })).json();
    expect(job.status, job.message).toBe('SUCCESS');
    const jobs = await (await request.get(`${api}/sourceJob.json/listSourceJob?page=1&limit=1000`, { headers })).json();
    jobId = jobs.data.find((j: any) => j.jobName === JOB_NAME)?.jobId ?? null;
    expect(jobId, 'the job exists').toBeTruthy();
    const ran = await (await request.post(`${api}/sourceJob.json/runSourceJob`, { headers, data: { jobId } })).json();
    expect(ran.status, ran.message).toBe('SUCCESS');
    let queueRow: any = null;
    await expect.poll(async () => {
      const queue = await (await request.get(`${api}/sourceJob.json/fetchSourceJobQueueListWithJobId?jobId=${jobId}`, { headers })).json();
      queueRow = queue.data?.jobQueues?.[0] ?? null;
      return queueRow?.jobStatus ?? 'none';
    }, { timeout: 120_000, intervals: [3000] }).not.toMatch(/^(Queue|none)$/);
    const steps = await (await request.get(`${api}/aiPrompt.json/runsForJob?jobQueueId=${queueRow.jobQueueId}`, { headers })).json();
    expect(steps.data).toHaveLength(1);
    expect(steps.data[0].run.status, steps.data[0].run.error).toBe('ok');
    expect(steps.data[0].run.stepTag).toBe('summary');

    await page.goto(`/jobs/${jobId}/runs/${queueRow.jobQueueId}/logs`);
    await expect(page.getByText('AI steps')).toBeVisible();
    await expect(page.locator('.detail-panel .side-panel-list li').first()).toContainText('answered');
    await expect(page.locator('.detail-panel .side-panel-list li').first()).toContainText(PROMPT);
  });
});
