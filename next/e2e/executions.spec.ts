import { readFileSync } from 'node:fs';
import { test, expect, Page } from '@playwright/test';
import { api, authOf, canSignIn, NEEDS, pageAs, Session, sessionFor } from './support/session';
import { getJson, jobNamed, keptRun, runsOf } from './support/workspace';

/**
 * MIG-251: Schedules and Executions on the step engine, end to end, as workspace 2924's administrator. Nothing is saved
 * or deleted; when no recent run still keeps its file, the registry chain job is run once (Run now) to make one.
 *
 * The fixtures are FOUND, by name, never pinned by id (MIG-330: pinned job 2849 and runs 7383/7405 drifted twice):
 *  - ENGINE/FILES: "UI-CHECK registry chain job 0929" (sample, read_file, validate, transform, save_file,
 *    upload_bucket) and its latest Completed run that still keeps customers-clean.json -- or a fresh run of it. Its
 *    six steps on the Timeline, a step's lines in the Console, the run's Files.
 *  - NO_FILES: an older Completed run of the same job that recorded no outputs (from before MIG-236).
 *  - LEGACY: "UI-REVIEW Clean customers (manual, notify on completion)" and its latest run the worker ran (legacy).
 *  - INBOX: "UI-CHECK step engine job 0928", started by a file arriving in the inbox, and the run that arrival made.
 *  - Run with a different AI model… from the Schedules row lists the job's AI steps and their models; it is offered only
 *    for a pipeline with an AI step.
 *
 * Each can still be pinned (E2E_ENGINE_RUN, E2E_NO_FILES_RUN, E2E_LEGACY_RUN, E2E_INBOX_RUN, E2E_FILES_RUN). Sign-in
 * through support/session.ts: E2E_TENANT_ADMIN_TOKEN (4537 of 2924), or E2E_TENANT_ADMIN(_PASSWORD).
 */
const REGISTRY_JOB = 'UI-CHECK registry chain job 0929';
const LEGACY_JOB = 'UI-REVIEW Clean customers (manual, notify on completion)';
const INBOX_JOB = 'UI-CHECK step engine job 0928';

const ENGINE = { job: 0, run: Number(process.env['E2E_ENGINE_RUN'] ?? 0) };
// A run of the same job from before runs recorded their files (MIG-236): it has no Files to show, and never will.
const NO_FILES = { job: 0, run: Number(process.env['E2E_NO_FILES_RUN'] ?? 0) };
const LEGACY = { job: 0, run: Number(process.env['E2E_LEGACY_RUN'] ?? 0) };
/** The inbox job and, unless E2E_INBOX_RUN pins one, the run its latest started arrival made (found at start). */
const INBOX = { job: 0, run: Number(process.env['E2E_INBOX_RUN'] ?? 0) };
/** Wave 4: a run that recorded its outputs -- save_file kept customers-clean.json (3 rows), upload_bucket put it in ui-review-s3. */
const FILES = { job: 0, run: Number(process.env['E2E_FILES_RUN'] ?? 0) };
// The registry chain pipeline's steps; a Sample step was added in front of Read after this spec was written.
const STEPS = ['sample', 'read', 'check', 'shape', 'out', 'publish'];
const TASKS = ['sample', 'read_file', 'validate', 'transform', 'save_file', 'upload_bucket'];

const stepsAnswer = (page: Page) =>
  page.waitForResponse(r => r.url().includes('/sourceJob.json/stepExecutions') && r.request().method() === 'GET');

test.describe('Executions', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);

  let s: Session;
  test.beforeAll(async ({ request }) => {
    test.setTimeout(240_000);   // a fresh run of the registry chain job, when no recent one keeps its file
    s = await sessionFor(request, 'admin');
    ENGINE.job = FILES.job = NO_FILES.job = (await jobNamed(request, s, REGISTRY_JOB)).jobId;
    LEGACY.job = (await jobNamed(request, s, LEGACY_JOB)).jobId;
    INBOX.job = (await jobNamed(request, s, INBOX_JOB)).jobId;
    // Found, not pinned: a schedule's latest arrival and its kept files move on every time it runs (7387 and 7405
    // were overtaken on 2026-09-29, and a kept file expires after its pipeline's datasetRetentionHours).
    if (!INBOX.run) {
      const arrivals = (await getJson(request, s, `/sourceJob.json/inboxArrivals?jobId=${INBOX.job}`))?.data ?? [];
      INBOX.run = arrivals.find((a: { outcome: string; jobQueueId?: number }) => a.outcome === 'Started' && a.jobQueueId)?.jobQueueId ?? 0;
      expect(INBOX.run, `job ${INBOX.job} has an inbox arrival that started a run`).toBeGreaterThan(0);
    }
    if (!FILES.run) FILES.run = (await keptRun(request, s, FILES.job, 'customers-clean.json')).run;
    if (!ENGINE.run) ENGINE.run = FILES.run;
    const engine = await getJson(request, s, `/sourceJob.json/stepExecutions?jobQueueId=${ENGINE.run}`);
    expect(engine.data?.legacy, `run ${ENGINE.run} is a step-engine run`).toBe(false);
    expect(engine.data?.steps?.map((step: { key: string }) => step.key)).toEqual(STEPS);
    if (!NO_FILES.run) {
      // Oldest first: the runs from before MIG-236 recorded nothing, and that never changes.
      for (const run of (await runsOf(request, s, NO_FILES.job)).filter(r => r.jobStatus === 'Completed').reverse()) {
        if (!((await getJson(request, s, `/sourceJob.json/runOutputs?jobQueueId=${run.jobQueueId}`)).data?.outputs ?? []).length) {
          NO_FILES.run = run.jobQueueId;
          break;
        }
      }
    }
    if (!LEGACY.run) {
      for (const run of (await runsOf(request, s, LEGACY.job)).slice(0, 10)) {
        if ((await getJson(request, s, `/sourceJob.json/stepExecutions?jobQueueId=${run.jobQueueId}`)).data?.legacy === true) {
          LEGACY.run = run.jobQueueId;
          break;
        }
      }
    }
    expect(LEGACY.run, `"${LEGACY_JOB}" has a run the legacy worker ran`).toBeGreaterThan(0);
  });

  test('a step-engine run: every step on the Timeline, a step\'s lines in the Console', async ({ browser }) => {
    const page = await pageAs(browser, s);
    await page.goto(`/pipelines/schedules/${ENGINE.job}/runs/${ENGINE.run}/logs`);

    const card = page.locator('.exec-steps');
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading', { name: /^Steps/ })).toContainText(`${STEPS.length} of ${STEPS.length} completed`);
    const rows = card.locator('.exec-step');
    await expect(rows).toHaveCount(STEPS.length);
    expect(await rows.evaluateAll(els => els.map(e => e.getAttribute('data-step')))).toEqual(STEPS);
    for (let i = 0; i < STEPS.length; i++) {
      const row = rows.nth(i);
      await expect(row).toContainText(TASKS[i]);
      await expect(row.locator('app-status')).toContainText('Completed');
      await expect(row).toContainText(/\d+ → \d+ records/);
    }
    // read_file brought three rows in; save_file names the file it wrote.
    await expect(rows.nth(STEPS.indexOf('read'))).toContainText('2 → 3 records');
    await expect(rows.nth(STEPS.indexOf('out'))).toContainText('customers-clean.json');

    // The Console: the read step's own lines, then another step's.
    await card.getByRole('button', { name: 'Console' }).click();
    await expect(card.getByRole('button', { name: 'Console' })).toHaveAttribute('aria-pressed', 'true');
    await card.getByLabel('Step to show').selectOption('read');
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

    // An older run of the same job recorded no outputs (when the job is old enough to have one).
    if (NO_FILES.run) {
      await page.goto(`/pipelines/schedules/${NO_FILES.job}/runs/${NO_FILES.run}/logs`);
      await expect(page.locator('.exec-files')).toContainText('No files were recorded for this run.');
    } else {
      test.info().annotations.push({ type: 'note', description: `${REGISTRY_JOB} has no run from before MIG-236` });
    }
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
    await expect(page.getByRole('heading', { name: 'When it runs' })).toBeVisible();
    await expect(page.locator('#onArrival')).toBeChecked();
    await expect(page.locator('#filePattern')).not.toHaveValue(/\//);
    await page.context().close();
  });

  test('Run with a different AI model… lists the job\'s AI steps and models, and is offered only where there are some', async ({ browser, request }) => {
    // What the dialog should list, asked directly: Chromium does not always keep a cross-origin answer's body.
    const body = await (await request.get(`${api}/sourceJob.json/aiModelChoice?jobId=${ENGINE.job}`,
      { headers: authOf(s) })).json();
    expect(body.status, body.message).toBe('SUCCESS');
    const hasAi = (body.data?.steps ?? []).length > 0;
    const page = await pageAs(browser, s);
    await page.goto('/pipelines/schedules');
    await page.getByLabel('Search jobs').fill(String(ENGINE.job));
    await page.getByRole('button', { name: new RegExp(`^Actions for ${REGISTRY_JOB}`) }).click();
    const menu = page.getByRole('menu');
    // Every row action is where it was; the AI-model run sits after Run now, and only for a pipeline with an AI step
    // (review 2026-10-07).
    await expect(menu.getByRole('menuitem')).toHaveText([/Run now/, ...(hasAi ? [/Run with a different AI model…/] : []),
      /Skip next run/, /Edit/, /Executions/, /Ask about this job/, /Duplicate/, /Email notifications/, /Deactivate|Activate/, /Delete/]);
    if (!hasAi) {
      await expect(menu.getByRole('menuitem', { name: /Run with/ })).toHaveCount(0);
      await page.keyboard.press('Escape');
      await page.context().close();
      return;
    }
    await menu.getByRole('menuitem', { name: 'Run with a different AI model…' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Run with a different AI model' })).toBeVisible();
    await expect(dialog.locator('.ai-model-pick')).toHaveCount(body.data.steps.length);
    await expect(dialog.getByRole('button', { name: 'Run', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await page.context().close();
  });
});
