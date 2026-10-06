import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { api, authOf, claimsOf, pageAs, Session, sessionOf } from './support/session';

/**
 * MIG-324: a new organisation's first hour, as its first administrator, through the console only and timed:
 * storage, the inbox and a file, a topic, the registry task, the pipeline and its steps, a schedule, Run now, the run
 * completed, and its output on the run's page. Every stage is a screen a new administrator uses; the API is only read,
 * to find what an earlier run of this spec already made and to wait for the run.
 *
 * Who: the QA Team workspace's administrator (appUserId 4600, workspace 2945), the owner's fresh organisation --
 * E2E_FIRST_HOUR_TOKEN, or minted by etl-platform/scripts/mint-test-token.sh for E2E_FIRST_HOUR_ADMIN_ID (default
 * 4600) when that script is on this machine. Never the owner's platform administrator (1000).
 *
 * Safe to rerun: each object is found by its "E2E first-hour" name and made only when missing; nothing is deleted.
 * Each run uploads the sample file again and points the pipeline's Read step at the new arrival's key, so the run
 * proves the whole path. The storage is LocalStack's bucket qa-team-2945 (etl-platform fixtures/localstack-buckets.tsv),
 * with keys LocalStack does not check; E2E_FIRST_HOUR_S3_ENDPOINT moves it.
 *
 * Prints the time of each stage and the total ("first-hour: ..."), which the MIG-324 card records.
 */
const OWNER_ID = 1000;
const ADMIN_ID = Number(process.env['E2E_FIRST_HOUR_ADMIN_ID'] ?? 4600);
const MINT = process.env['E2E_MINT_SCRIPT'] ?? resolve(__dirname, '../../../etl-platform/scripts/mint-test-token.sh');

const STORAGE = 'E2E first-hour storage';
const ALIAS = 'e2e-first-hour-s3';
const BUCKET = process.env['E2E_FIRST_HOUR_BUCKET'] ?? 'qa-team-2945';
const ENDPOINT = process.env['E2E_FIRST_HOUR_S3_ENDPOINT'] ?? 'http://host.docker.internal:4566';
const TOPIC = 'E2E first-hour topic';
const KAFKA_TOPIC = 'e2e-first-hour';
const REGISTRY_ID = 'E2E_FIRST_HOUR';
const REGISTRY_NAME = 'E2E first-hour orders';
const PIPELINE = 'E2E first-hour orders task';
const SCHEDULE = 'E2E first-hour orders schedule';
const FILE = 'e2e-first-hour-orders.csv';
const ROWS = ['order_id,customer,amount,status', 'A-1001,Northwind,120.50,paid', 'A-1002,Contoso,75.00,open',
  'A-1003,Fabrikam,310.25,paid', 'A-1004,Northwind,42.10,refunded'];

function token(): string | null {
  const given = process.env['E2E_FIRST_HOUR_TOKEN'];
  const minted = !given && existsSync(MINT) && ADMIN_ID !== OWNER_ID
    ? execFileSync('bash', [MINT, String(ADMIN_ID), '900'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000,
        env: { ...process.env, MINT_CALLER: 'playwright e2e (first-hour)' } }).trim()
    : null;
  const t = given || minted;
  if (!t) return null;
  if (Number(claimsOf(t).appUserId) === OWNER_ID) throw new Error('the first-hour walk never acts as the owner\'s platform administrator');
  return t;
}

const canRun = !!process.env['E2E_FIRST_HOUR_TOKEN'] || existsSync(MINT);

/** Types into a searchable box and picks the row whose label contains `label`. */
async function pick(page: Page, boxId: string, typed: string, label: string): Promise<void> {
  const input = page.locator(`#${boxId}`);
  await input.click();
  await input.fill(typed);
  await input.locator('..').locator('[role="option"]', { hasText: label }).first().click();
}

async function getJson(request: APIRequestContext, s: Session, path: string): Promise<any> {
  return (await request.get(`${api}${path}`, { headers: authOf(s) })).json().catch(() => ({}));
}

/** Opens a row's actions menu on a list screen and picks an item. */
async function rowAction(page: Page, rowText: string, item: string): Promise<void> {
  await page.locator('tbody tr', { hasText: rowText }).first().getByRole('button', { name: /^Actions for/ }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test.describe('a new organisation\'s first hour (MIG-324)', () => {
  test.skip(!canRun, 'needs E2E_FIRST_HOUR_TOKEN, or etl-platform/scripts/mint-test-token.sh to mint one for 4600');
  test.setTimeout(8 * 60_000);

  test('from an empty workspace to a first completed run and its output, in the console', async ({ browser, request }) => {
    const s = await sessionOf(request, token()!);
    expect(s.data['userRole'], 'the first administrator of a workspace').toBe('TENANT_ADMIN');
    const page = await pageAs(browser, s, { viewport: { width: 1920, height: 1080 } });
    const times: [string, number][] = [];
    const started = Date.now();
    let mark = started;
    const lap = (stage: string) => { const now = Date.now(); times.push([stage, (now - mark) / 1000]); mark = now; };

    // ── The dashboard: until a run has completed, it says what to do first ──────────────────────────────────────
    const jobsBefore = (await getJson(request, s, '/sourceJob.json/listSourceJob?page=1&limit=50')).data ?? [];
    const neverRan = !jobsBefore.some((j: any) => j.jobRunningStatus === 'Completed');
    await page.goto('/dashboard');
    if (neverRan) {
      await expect(page.getByRole('heading', { name: 'Get your first pipeline running' })).toBeVisible();
      await expect(page.locator('[data-step="storage"]').getByRole('link', { name: 'Storage connections' })).toBeVisible();
    }
    lap('dashboard');

    // ── 1. Storage ────────────────────────────────────────────────────────────────────────────────────────────────
    const connections = (await getJson(request, s, '/storageConnection.json/fetchAllConnections')).data ?? [];
    await page.goto('/integration/storage-connections');
    if (!connections.some((c: any) => c.alias === ALIAS)) {
      await page.getByRole('button', { name: 'New connection' }).click();
      const dialog = page.getByRole('dialog').last();
      await dialog.locator('#provider').selectOption('S3');
      await dialog.locator('#name').fill(STORAGE);
      await dialog.locator('#alias').fill(ALIAS);
      await dialog.locator('#description').fill('E2E test data (MIG-324): LocalStack S3, keys it does not check');
      await dialog.locator('#bucket').fill(BUCKET);
      await dialog.locator('#region').fill('us-east-1');
      await dialog.locator('#endpoint').fill(ENDPOINT);
      await dialog.locator('#accessKey').fill('test');
      await dialog.locator('#secretKey').fill('test');
      await dialog.getByRole('button', { name: 'Create' }).click();
      await expect(page.getByText('Connection created.')).toBeVisible();
    }
    await rowAction(page, STORAGE, 'Test connection');
    await expect(page.locator('tbody tr', { hasText: STORAGE }).getByText('OK', { exact: true })).toBeVisible({ timeout: 30_000 });
    lap('storage');

    // ── 2. The inbox, and a file in it ────────────────────────────────────────────────────────────────────────────
    await page.goto('/documents/inbox');
    const setUp = page.getByRole('button', { name: 'Set up the inbox' });
    await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
    if (await setUp.isVisible()) {
      await setUp.click();
      const dialog = page.getByRole('dialog').last();
      await dialog.locator('select').first().selectOption({ label: `${STORAGE} (${ALIAS})` });
      await dialog.getByRole('button', { name: 'Turn on the inbox' }).click();
      await expect(page.getByText('Drop files here')).toBeVisible();
    }
    const dir = mkdtempSync(join(tmpdir(), 'first-hour-'));
    writeFileSync(join(dir, FILE), ROWS.join('\n') + '\n');
    const before = new Set(((await getJson(request, s, '/storage.json/inbox/files')).data ?? []).map((f: any) => f.arrivalId));
    await page.locator('input[type=file]').first().setInputFiles(join(dir, FILE));
    // The arrival's key, as the arrivals list now shows it (MIG-324): what the Read step names.
    let arrival: any;
    await expect.poll(async () => {
      arrival = ((await getJson(request, s, '/storage.json/inbox/files')).data ?? []).find((f: any) => !before.has(f.arrivalId) && f.fileName === FILE);
      return !!arrival;
    }, { timeout: 30_000, message: 'the upload arrives' }).toBe(true);
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.locator(`[title="${arrival.key}"]`)).toBeVisible();
    const key = (await page.locator(`[title="${arrival.key}"]`).innerText()).trim();
    expect(key).toBe(arrival.key);
    lap('inbox and a file');

    // ── 3. A topic, on the platform's Kafka connection ────────────────────────────────────────────────────────────
    const topics = (await getJson(request, s, `/setting.json/topics?q=${encodeURIComponent(TOPIC)}&limit=5`)).data ?? [];
    if (!topics.some((t: any) => t.serviceName === TOPIC)) {
      await page.goto('/configuration/kafka');
      await page.getByRole('button', { name: 'Add topic' }).click();
      await page.getByRole('heading', { name: 'New topic' }).waitFor();
      await page.locator('#serviceName').fill(TOPIC);
      await page.locator('#topic').fill(KAFKA_TOPIC);
      await page.getByRole('button', { name: 'Create' }).click();
      await expect(page.getByText('Topic saved with')).toBeVisible();
    }
    lap('topic');

    // ── 4. The registry task the pipeline picks ───────────────────────────────────────────────────────────────────
    const registry = (await getJson(request, s, '/pipeline.json/list?page=1&limit=1000')).data?.rows ?? [];
    if (!registry.some((p: any) => p.pipelineId === REGISTRY_ID)) {
      await page.goto('/configuration/task-registry');
      await page.getByRole('button', { name: 'New pipeline' }).click();
      await page.getByRole('heading', { name: 'New pipeline' }).waitFor();
      const dialog = page.getByRole('dialog').last();
      await dialog.locator('#pipelineId').fill(REGISTRY_ID);
      await dialog.locator('#pipelineName').fill(REGISTRY_NAME);
      await pick(page, 'pipelineTopic', 'first-hour', TOPIC);
      await dialog.getByRole('button', { name: /Add (a )?field/i }).first().click();
      await dialog.locator('#tagKey0').fill('input_file');
      await dialog.locator('#label0').fill('Input file');
      await dialog.getByRole('button', { name: 'Create pipeline' }).click();
      await expect(page.getByText(`"${REGISTRY_NAME}" saved`)).toBeVisible();
    }
    lap('registry task');

    // ── 5. The pipeline, and its steps ────────────────────────────────────────────────────────────────────────────
    const tasks = (await (await request.post(`${api}/sourceTask.json/listSourceTask?page=1&limit=1000`, { headers: authOf(s), data: {} })).json()).data ?? [];
    const existing = tasks.find((t: any) => t.taskName === PIPELINE);
    if (existing) {
      await page.goto(`/pipelines/${existing.taskDetailId}/edit`);
    } else {
      await page.goto('/pipelines/new');
      await page.getByRole('heading', { name: 'New pipeline' }).waitFor();
      await page.locator('#taskName').fill(PIPELINE);
      await expect(page.locator('#taskProfile')).not.toHaveValue('');
      await pick(page, 'taskType', 'first-hour', TOPIC);
      await pick(page, 'pipeline', 'first-hour', REGISTRY_NAME);
      await page.getByLabel('Input file').fill('intake/');
      await page.getByRole('button', { name: 'Create pipeline' }).click();
      await expect(page.getByText('Task created.')).toBeVisible();
      // MIG-324: a new pipeline opens on its own page, where its steps are built next.
      await expect(page).toHaveURL(/\/pipelines\/\d+\/edit/);
    }
    await expect(page.getByRole('heading', { name: 'Edit pipeline' })).toBeVisible();
    const build = page.getByRole('button', { name: 'Build its steps' });
    const stepsTab = page.getByRole('tab', { name: 'Steps' });
    await expect(build.or(stepsTab)).toBeVisible();
    if (await build.isVisible()) {
      // No steps yet: Details says what that means and offers the builder (MIG-324).
      await expect(page.getByText('This pipeline has no steps yet')).toBeVisible();
      await build.click();
      await page.locator('#addStep').click();
      await page.locator('#addStep').fill('read');
      await page.getByRole('option', { name: /^Read CSV/ }).click();
      const read = page.getByRole('dialog', { name: /^Step 1/ });
      await read.locator('#stepKey').fill('orders');
      await read.locator('#cfg-bucket').fill(ALIAS);
      await read.locator('#cfg-key').fill(key);
      await read.locator('#cfg-format').selectOption('csv');
      await read.getByRole('button', { name: 'Apply' }).click();
      await page.locator('#addStep').click();
      await page.locator('#addStep').fill('save');
      await page.getByRole('option', { name: /^Save File/ }).click();
      const keep = page.getByRole('dialog', { name: /^Step 2/ });
      await keep.locator('#stepKey').fill('result');
      await keep.locator('#cfg-fileName').fill('orders.csv');
      await keep.locator('#cfg-format').selectOption('csv');
      await keep.getByRole('button', { name: 'Apply' }).click();
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('button', { name: 'Save steps' }).click();
    } else {
      await stepsTab.click();
      await page.getByRole('button', { name: 'Edit step orders' }).click();
      const read = page.getByRole('dialog', { name: /^Step 1/ });
      await read.locator('#cfg-key').fill(key);
      await read.getByRole('button', { name: 'Apply' }).click();
      await page.getByRole('button', { name: 'Save', exact: true }).click();
    }
    await expect(page.locator('.step-notice-ok')).toContainText(/Saved as version \d+\.|Unchanged: /);
    lap('pipeline and its steps');

    // ── 6. A schedule ─────────────────────────────────────────────────────────────────────────────────────────────
    let job = ((await getJson(request, s, '/sourceJob.json/listSourceJob?page=1&limit=1000')).data ?? []).find((j: any) => j.jobName === SCHEDULE);
    if (!job) {
      await page.goto('/pipelines/schedules/new');
      await page.locator('#jobName').fill(SCHEDULE);
      await pick(page, 'task', 'first-hour', PIPELINE);
      await page.locator('#execution').selectOption('Manual');
      await page.getByRole('button', { name: 'Create schedule' }).click();
      await expect(page.getByText('Job created.')).toBeVisible();
      job = ((await getJson(request, s, '/sourceJob.json/listSourceJob?page=1&limit=1000')).data ?? []).find((j: any) => j.jobName === SCHEDULE);
    }
    expect(job, 'the schedule exists').toBeTruthy();
    lap('schedule');

    // ── 7. Run now, and the run completes ─────────────────────────────────────────────────────────────────────────
    const runs = async () => (await getJson(request, s, `/sourceJob.json/fetchSourceJobQueueListWithJobId?jobId=${job.jobId}`)).data?.jobQueues ?? [];
    // An earlier run still going (a rerun soon after another) is waited for: Run now is refused while one is.
    await expect.poll(async () => (await runs()).some((r: any) => /^(Queue|Start|Running)$/.test(r.jobStatus)),
      { timeout: 180_000, intervals: [3000], message: 'no earlier run is still going' }).toBe(false);
    const seen = new Set((await runs()).map((r: any) => r.jobQueueId));
    await page.goto('/pipelines/schedules');
    await rowAction(page, SCHEDULE, 'Run now');
    await expect(page.getByText(`${SCHEDULE} queued to run.`)).toBeVisible();
    let run: any;
    await expect.poll(async () => {
      run = (await runs()).find((r: any) => !seen.has(r.jobQueueId));
      return run?.jobStatus ?? 'none';
    }, { timeout: 180_000, intervals: [2000, 3000], message: 'the run finishes' }).toMatch(/^(Completed|Failed|Stopped|Skipped|Interrupted)$/);
    expect(run.jobStatus, `run ${run.jobQueueId}: ${run.jobStatusMessage}`).toBe('Completed');
    lap('run now to completed');

    // ── 8. Its output, where the console shows it ─────────────────────────────────────────────────────────────────
    await rowAction(page, SCHEDULE, 'Executions');
    await page.locator('tr', { hasText: `#${run.jobQueueId}` }).getByRole('link', { name: 'Logs' }).click();
    await expect(page.getByRole('heading', { name: 'Run logs' })).toBeVisible();
    await expect(page.getByText('2 of 2 step(s) completed.').first()).toBeVisible();
    await expect(page.getByText('orders.csv').first()).toBeVisible();
    await expect(page.getByText(/Step result · 4 rows/)).toBeVisible();
    lap('output');

    // ── Once a run has completed, the dashboard's guide has done its job ──────────────────────────────────────────
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Get your first pipeline running' })).toHaveCount(0);

    const total = (Date.now() - started) / 1000;
    const line = `first-hour: ${times.map(([k, v]) => `${k} ${v.toFixed(1)}s`).join(', ')}; total ${total.toFixed(1)}s (run ${run.jobQueueId})`;
    console.log(line);
    test.info().annotations.push({ type: 'first-hour', description: line });
  });
});
