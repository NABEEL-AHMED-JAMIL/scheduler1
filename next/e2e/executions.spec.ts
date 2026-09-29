import { readFileSync } from 'node:fs';
import { test, expect, APIRequestContext, Browser, Page } from '@playwright/test';

/**
 * MIG-251: Schedules and Executions on the step engine, end to end, as workspace 2924's administrator -- read only:
 * nothing is run, saved or deleted.
 *
 *  - A step-engine run (7396 of job 2849, "UI-CHECK registry chain job 0929": read_file, validate, transform,
 *    save_file, upload_bucket) shows its five steps on the Timeline, Completed with their records, and the Console
 *    shows a step's own lines.
 *  - A legacy run (7383 of job 2834) shows its page as it was: its entries, and no steps card.
 *  - A run a file started in the inbox (7387 of job 2848) names the file on Executions, and the job's trigger is
 *    stated there and in its editor (the Event start).
 *  - Run with… from the Schedules row lists the job's AI steps and their models, or says it has none; it is closed,
 *    not run.
 *
 * Needs Core (MIG-230, MIG-239, MIG-242) behind :9098 and a console at E2E_BASE_URL that has MIG-251 (e.g.
 * `ng serve --port 4417`). Sign-in, either:
 *   E2E_TENANT_ADMIN_TOKEN                          a TENANT_ADMIN access token (e.g. from
 *                                                   etl-platform/scripts/mint-test-token.sh 4537 900), or
 *   E2E_TENANT_ADMIN / E2E_TENANT_ADMIN_PASSWORD    a TENANT_ADMIN's credentials
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';
const token = process.env['E2E_TENANT_ADMIN_TOKEN'];
const admin = { username: process.env['E2E_TENANT_ADMIN'], password: process.env['E2E_TENANT_ADMIN_PASSWORD'] };

const ENGINE = { job: Number(process.env['E2E_ENGINE_JOB'] ?? 2849), run: Number(process.env['E2E_ENGINE_RUN'] ?? 7396) };
const LEGACY = { job: Number(process.env['E2E_LEGACY_JOB'] ?? 2834), run: Number(process.env['E2E_LEGACY_RUN'] ?? 7383) };
const INBOX = { job: Number(process.env['E2E_INBOX_JOB'] ?? 2848), run: Number(process.env['E2E_INBOX_RUN'] ?? 7387) };
/** Wave 4: a run that recorded its outputs -- save_file kept customers-clean.json (3 rows), upload_bucket put it in ui-review-s3. */
const FILES = { job: Number(process.env['E2E_FILES_JOB'] ?? 2849), run: Number(process.env['E2E_FILES_RUN'] ?? 7405) };
const STEPS = ['read', 'check', 'shape', 'out', 'publish'];
const TASKS = ['read_file', 'validate', 'transform', 'save_file', 'upload_bucket'];

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

const stepsAnswer = (page: Page) =>
  page.waitForResponse(r => r.url().includes('/sourceJob.json/stepExecutions') && r.request().method() === 'GET');

test.describe('Executions', () => {
  test.skip(!token && (!admin.username || !admin.password), 'Set E2E_TENANT_ADMIN_TOKEN, or E2E_TENANT_ADMIN(_PASSWORD), to run this.');

  let s: Session;
  test.beforeAll(async ({ request }) => {
    s = await session(request);
    // The fixtures this reads must be what the spec says they are: an engine run with five steps, and a legacy one.
    const headers = { Authorization: `Bearer ${s.token}` };
    const engine = await (await request.get(`${api}/sourceJob.json/stepExecutions?jobQueueId=${ENGINE.run}`, { headers })).json();
    expect(engine.data?.legacy, `run ${ENGINE.run} is a step-engine run`).toBe(false);
    expect(engine.data?.steps?.map((step: { key: string }) => step.key)).toEqual(STEPS);
    const legacy = await (await request.get(`${api}/sourceJob.json/stepExecutions?jobQueueId=${LEGACY.run}`, { headers })).json();
    expect(legacy.data?.legacy, `run ${LEGACY.run} is a legacy run`).toBe(true);
  });

  test('a step-engine run: every step on the Timeline, a step\'s lines in the Console', async ({ browser }) => {
    const page = await pageAs(browser, s);
    await page.goto(`/pipelines/schedules/${ENGINE.job}/runs/${ENGINE.run}/logs`);

    const card = page.locator('.exec-steps');
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading', { name: /^Steps/ })).toContainText('5 of 5 completed');
    const rows = card.locator('.exec-step');
    await expect(rows).toHaveCount(5);
    expect(await rows.evaluateAll(els => els.map(e => e.getAttribute('data-step')))).toEqual(STEPS);
    for (let i = 0; i < STEPS.length; i++) {
      const row = rows.nth(i);
      await expect(row).toContainText(TASKS[i]);
      await expect(row.locator('app-status')).toContainText('Completed');
      await expect(row).toContainText(/\d+ → \d+ records/);
    }
    // read_file brought three rows in; save_file names the file it wrote.
    await expect(rows.nth(0)).toContainText('0 → 3 records');
    await expect(rows.nth(3)).toContainText('customers-clean.json');

    // The Console: the first step's own lines, then another step's.
    await card.getByRole('button', { name: 'Console' }).click();
    await expect(card.getByRole('button', { name: 'Console' })).toHaveAttribute('aria-pressed', 'true');
    const lines = card.locator('.log-console-line');
    await expect(lines.first()).toContainText(/Try 1 of \d+\./);
    await expect(lines.nth(1)).toContainText(/row\(s\) from/);
    await card.getByLabel('Step to show').selectOption('out');
    await expect(lines.first()).toContainText('customers-clean.json');

    // A step's Log button opens the Console on it.
    await card.getByRole('button', { name: 'Timeline' }).click();
    await card.getByRole('button', { name: 'Show the log of step publish' }).click();
    await expect(card.getByLabel('Step to show')).toHaveValue('publish');
    await expect(lines.first()).toBeVisible();

    // The run's own entries are still there, below the steps.
    await expect(page.getByRole('heading', { name: 'Log entries' })).toBeVisible();
    await page.context().close();
  });

  test('a run\'s Files: the kept file downloads as csv, the upload names its bucket and key', async ({ browser }) => {
    const page = await pageAs(browser, s);
    await page.goto(`/pipelines/schedules/${FILES.job}/runs/${FILES.run}/logs`);
    const files = page.locator('.exec-files');
    await expect(files.getByText('Files', { exact: true })).toBeVisible();
    const kept = files.locator('.exec-file[data-kind="file"]');
    const upload = files.locator('.exec-file[data-kind="bucket"]');
    await expect(kept).toContainText('customers-clean.json');
    await expect(kept).toContainText('3 rows');
    await expect(upload).toContainText('ui-review-s3');
    await expect(upload).toContainText('registry-live-check/customers-clean.json');
    // The upload, from storage as the object browser downloads it.
    const [uploaded] = await Promise.all([page.waitForEvent('download'),
      upload.getByRole('button', { name: /^Download customers-clean.json from ui-review-s3/ }).click()]);
    expect(uploaded.suggestedFilename()).toBe('customers-clean.json');

    // The kept file, as csv: named by the server, and its first line is the header.
    const [csv] = await Promise.all([page.waitForEvent('download'), kept.locator('[data-format="csv"]').click()]);
    expect(csv.suggestedFilename()).toBe('customers-clean.csv');
    const text = readFileSync(await csv.path(), 'utf8');
    expect(text.split(/\r?\n/)[0]).toBe('customer_id,name,balance');

    // The same dataset from its step on the Timeline, through the format menu.
    await page.getByRole('button', { name: 'Download customers-clean.json from step out' }).click();
    await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText([/CSV/, /JSON/, /JSONL/]);
    const [jsonl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'JSONL' }).click()]);
    expect(jsonl.suggestedFilename()).toMatch(/\.jsonl$/);

    // An older run of the same job recorded no outputs.
    await page.goto(`/pipelines/schedules/${ENGINE.job}/runs/${ENGINE.run}/logs`);
    await expect(page.locator('.exec-files')).toContainText('No files were recorded for this run.');
    await page.context().close();
  });

  test('a legacy run: the page as it was, with no steps card', async ({ browser }) => {
    const page = await pageAs(browser, s);
    const answered = stepsAnswer(page);
    await page.goto(`/pipelines/schedules/${LEGACY.job}/runs/${LEGACY.run}/logs`);
    await answered;
    await expect(page.getByRole('heading', { name: 'Run logs' })).toBeVisible();
    await expect(page.locator('.log-timeline li').first()).toBeVisible();
    await expect(page.locator('.exec-steps')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Timeline' })).toHaveCount(1);
    await page.context().close();
  });

  test('a run a file started: the file on Executions, the trigger in the job\'s detail and editor', async ({ browser }) => {
    const page = await pageAs(browser, s);
    await page.goto(`/pipelines/schedules/${INBOX.job}/executions`);
    const row = page.locator('tbody tr', { hasText: `#${INBOX.run}` }).first();
    await expect(row).toContainText('.csv');
    const inbox = page.locator('.inbox-trigger');
    await expect(inbox).toContainText('arrives in the inbox starts this job');
    await expect(inbox.locator(`a[href$="/runs/${INBOX.run}/logs"]`)).toBeVisible();

    await page.goto(`/pipelines/schedules/${INBOX.job}/edit`);
    await expect(page.getByRole('heading', { name: 'Event' })).toBeVisible();
    await expect(page.locator('#onArrival')).toBeChecked();
    await expect(page.locator('#filePattern')).not.toHaveValue(/\//);
    await page.context().close();
  });

  test('Run with… lists the job\'s AI steps and models, or says it has none', async ({ browser, request }) => {
    // What the dialog should list, asked directly: Chromium does not always keep a cross-origin answer's body.
    const body = await (await request.get(`${api}/sourceJob.json/aiModelChoice?jobId=${ENGINE.job}`,
      { headers: { Authorization: `Bearer ${s.token}` } })).json();
    expect(body.status, body.message).toBe('SUCCESS');
    const page = await pageAs(browser, s);
    await page.goto('/pipelines/schedules');
    await page.getByLabel('Search jobs').fill(String(ENGINE.job));
    await page.getByRole('button', { name: /^Actions for UI-CHECK registry chain job 0929/ }).click();
    const menu = page.getByRole('menu');
    // Every row action is where it was, with Run with… after Run now.
    await expect(menu.getByRole('menuitem')).toHaveText([/Run now/, /Run with…/, /Skip next run/, /Edit/, /Executions/,
      /Ask about this job/, /Duplicate/, /Email notifications/, /Deactivate|Activate/, /Delete/]);
    await menu.getByRole('menuitem', { name: 'Run with…' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Run with…' })).toBeVisible();
    if ((body.data?.steps ?? []).length) {
      await expect(dialog.locator('.ai-model-pick')).toHaveCount(body.data.steps.length);
      await expect(dialog.getByRole('button', { name: 'Run', exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Cancel' }).click();
    } else {
      await expect(dialog).toContainText('no AI steps');
      await expect(dialog.getByRole('button', { name: 'Run', exact: true })).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Close' }).click();
    }
    await expect(dialog).toHaveCount(0);
    await page.context().close();
  });
});
