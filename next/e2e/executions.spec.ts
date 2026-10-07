import { readFileSync } from 'node:fs';
import { test, expect, Page } from '@playwright/test';
import { api, authOf, canSignIn, NEEDS, pageAs, Session, sessionFor } from './support/session';
import { getJson, jobById, jobs, keptRun, outputsOf, runsOf } from './support/workspace';
import { hasFixtures, NEEDS_FIXTURES, pipeline } from './support/fixtures';

/**
 * MIG-251: Schedules and Executions on the step engine, end to end, as Riverside Health's administrator. Nothing is
 * saved or deleted; when no recent run still keeps its file, the readmission schedule is run once (Run now) to make one.
 *
 * The fixtures are the rebuilt platform's (support/fixtures.ts reads etl-platform/.state/demo/rebuild.json), read only:
 *  - ENGINE/FILES: the "readmission" pipeline's schedule (read_file … save_file, upload_bucket, render_pdf) and its run
 *    from the rebuild -- or, once that run's kept file has expired, the schedule's latest Completed run that still keeps
 *    readmission-statistics.csv (or a fresh one). Its steps on the Timeline, as Core recorded them; a step's lines in
 *    the Console; the run's Files: the kept csv and the upload to the workspace's bucket.
 *  - NO_FILES: an older Completed run of the same job that recorded no outputs (only from before MIG-236; a rebuilt
 *    platform has none, and the check is then noted rather than made).
 *  - LEGACY: a run the legacy worker ran. The rebuilt platform has none (service-1/2/3 are retired and every rebuilt
 *    pipeline runs on the step engine), so that test skips saying so unless E2E_LEGACY_RUN/E2E_LEGACY_JOB pin one.
 *  - INBOX: the "xray" pipeline's schedule, started by a file arriving in the inbox, and the run that arrival made.
 *  - Run with a different AI model… from the Schedules row lists the job's AI steps and their models; it is offered only
 *    for a pipeline with an AI step (the x-ray schedule has a model step; the readmission one has none).
 *
 * Each can still be pinned (E2E_ENGINE_RUN, E2E_NO_FILES_RUN, E2E_LEGACY_RUN with E2E_LEGACY_JOB, E2E_INBOX_RUN,
 * E2E_FILES_RUN). Sign-in through support/session.ts (role admin).
 */
const KEPT_FILE = 'readmission-statistics.csv';

const ENGINE = { job: 0, run: Number(process.env['E2E_ENGINE_RUN'] ?? 0) };
// A run of the same job from before runs recorded their files (MIG-236): it has no Files to show, and never will.
const NO_FILES = { job: 0, run: Number(process.env['E2E_NO_FILES_RUN'] ?? 0) };
const LEGACY = { job: Number(process.env['E2E_LEGACY_JOB'] ?? 0), run: Number(process.env['E2E_LEGACY_RUN'] ?? 0) };
/** The inbox job and, unless E2E_INBOX_RUN pins one, the run its latest started arrival made (found at start). */
const INBOX = { job: 0, run: Number(process.env['E2E_INBOX_RUN'] ?? 0), file: '' };
/** A run that recorded its outputs: save_file kept the statistics csv, upload_bucket put it in the workspace's bucket. */
const FILES = { job: 0, run: Number(process.env['E2E_FILES_RUN'] ?? 0) };
const AI = { job: 0 };
const NAMES: Record<number, string> = {};

interface Step { key: string; task: string; status: string; recordsIn: number; recordsOut: number;
  datasets?: { name: string; rowCount: number; columns: string[] }[] }
let STEPS: Step[] = [];

const stepsAnswer = (page: Page) =>
  page.waitForResponse(r => r.url().includes('/sourceJob.json/stepExecutions') && r.request().method() === 'GET');
/** A count as the Timeline may print it: 101766 or 101,766. */
const count = (n: number) => `(?:${n}|${n.toLocaleString('en-US')})`;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test.describe('Executions', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);

  let s: Session;
  test.beforeAll(async ({ request }) => {
    test.setTimeout(240_000);   // a fresh run of the readmission schedule, when no recent one keeps its file
    s = await sessionFor(request, 'admin');
    const readmission = pipeline('readmission');
    ENGINE.job = FILES.job = NO_FILES.job = readmission.jobId;
    INBOX.job = pipeline('xray').jobId;
    AI.job = pipeline('xray').jobId;
    for (const job of await jobs(request, s)) NAMES[job.jobId] = job.jobName;
    await jobById(request, s, ENGINE.job);
    // Found, not pinned: a schedule's latest arrival and its kept files move on every time it runs, and a kept file
    // expires after its pipeline's datasetRetentionHours.
    if (!INBOX.run) {
      const arrivals = (await getJson(request, s, `/sourceJob.json/inboxArrivals?jobId=${INBOX.job}`))?.data ?? [];
      const started = arrivals.find((a: { outcome: string; jobQueueId?: number }) => a.outcome === 'Started' && a.jobQueueId);
      INBOX.run = started?.jobQueueId ?? 0;
      INBOX.file = started?.fileName ?? '';
      expect(INBOX.run, `job ${INBOX.job} has an inbox arrival that started a run`).toBeGreaterThan(0);
    }
    if (!FILES.run) {
      const rebuilt = readmission.run?.jobQueueId;
      const kept = rebuilt && (await outputsOf(request, s, rebuilt)).some(o => o.kind === 'file' && o.name === KEPT_FILE && !o.expired);
      FILES.run = kept ? rebuilt! : (await keptRun(request, s, FILES.job, KEPT_FILE)).run;
    }
    if (!ENGINE.run) ENGINE.run = FILES.run;
    const engine = await getJson(request, s, `/sourceJob.json/stepExecutions?jobQueueId=${ENGINE.run}`);
    expect(engine.data?.legacy, `run ${ENGINE.run} is a step-engine run`).toBe(false);
    STEPS = engine.data?.steps ?? [];
    expect(STEPS.length, `run ${ENGINE.run} recorded its steps`).toBeGreaterThan(2);
    if (!NO_FILES.run) {
      // Oldest first: the runs from before MIG-236 recorded nothing, and that never changes.
      for (const run of (await runsOf(request, s, NO_FILES.job)).filter(r => r.jobStatus === 'Completed').reverse()) {
        if (!(await outputsOf(request, s, run.jobQueueId)).length) {
          NO_FILES.run = run.jobQueueId;
          break;
        }
      }
    }
    if (!LEGACY.run) {
      // Any job's recent run the legacy worker ran (none, on a rebuilt platform: the test then skips saying so).
      search: for (const job of Object.keys(NAMES).map(Number)) {
        for (const run of (await runsOf(request, s, job)).slice(0, 3)) {
          if ((await getJson(request, s, `/sourceJob.json/stepExecutions?jobQueueId=${run.jobQueueId}`)).data?.legacy === true) {
            LEGACY.job = job;
            LEGACY.run = run.jobQueueId;
            break search;
          }
        }
      }
    }
  });

  test('a step-engine run: every step on the Timeline, a step\'s lines in the Console', async ({ browser }) => {
    const page = await pageAs(browser, s);
    await page.goto(`/pipelines/schedules/${ENGINE.job}/runs/${ENGINE.run}/logs`);
    const keys = STEPS.map(step => step.key);
    const read = STEPS.find(step => step.task === 'read_file') ?? STEPS[0];
    const saved = STEPS.find(step => step.task === 'save_file' && step.datasets?.length)!;
    expect(saved, `run ${ENGINE.run} has a save_file step`).toBeTruthy();

    const card = page.locator('.exec-steps');
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading', { name: /^Steps/ })).toContainText(`${keys.length} of ${keys.length} completed`);
    const rows = card.locator('.exec-step');
    await expect(rows).toHaveCount(keys.length);
    expect(await rows.evaluateAll(els => els.map(e => e.getAttribute('data-step')))).toEqual(keys);
    for (let i = 0; i < keys.length; i++) {
      const row = rows.nth(i);
      await expect(row).toContainText(STEPS[i].task);
      await expect(row.locator('app-status')).toContainText('Completed');
      await expect(row).toContainText(/[\d,]+ → [\d,]+ records/);
    }
    // The read step's counts are Core's own; save_file names the file it wrote.
    await expect(rows.nth(keys.indexOf(read.key)))
      .toContainText(new RegExp(`${count(read.recordsIn)} → ${count(read.recordsOut)} records`));
    await expect(rows.nth(keys.indexOf(saved.key))).toContainText(KEPT_FILE);

    // The Console: the read step's own lines, then another step's.
    await card.getByRole('button', { name: 'Console' }).click();
    await expect(card.getByRole('button', { name: 'Console' })).toHaveAttribute('aria-pressed', 'true');
    await card.getByLabel('Step to show').selectOption(read.key);
    const lines = card.locator('.log-console-line');
    await expect(lines.first()).toContainText(/Try 1 of \d+\./);
    await expect(lines.nth(1)).toBeVisible();
    await card.getByLabel('Step to show').selectOption(saved.key);
    await expect(card.locator('.log-console-line', { hasText: KEPT_FILE }).first()).toBeVisible();

    // A step's Log button opens the Console on it.
    const last = keys[keys.length - 1];
    await card.getByRole('button', { name: 'Timeline' }).click();
    await card.getByRole('button', { name: `Show the log of step ${last}` }).click();
    await expect(card.getByLabel('Step to show')).toHaveValue(last);
    await expect(lines.first()).toBeVisible();

    // The run's own entries are still there, below the steps.
    await expect(page.getByRole('heading', { name: 'Log entries' })).toBeVisible();
    await page.context().close();
  });

  test('a run\'s Files: the kept file downloads as csv, the upload names its bucket and key', async ({ browser, request }) => {
    const outputs = await outputsOf(request, s, FILES.run);
    const keptOut = outputs.find(o => o.kind === 'file' && o.name === KEPT_FILE)!;
    const uploadOut = outputs.find(o => o.kind === 'bucket')!;
    expect(uploadOut, `run ${FILES.run} uploaded a file to a bucket`).toBeTruthy();
    const savedStep = STEPS.find(step => step.key === keptOut.stepKey)!;
    const keptDataset = savedStep.datasets!.find(d => d.name === KEPT_FILE)!;

    const page = await pageAs(browser, s);
    await page.goto(`/pipelines/schedules/${FILES.job}/runs/${FILES.run}/logs`);
    const files = page.locator('.exec-files');
    await expect(files.getByText('Files', { exact: true })).toBeVisible();
    const kept = files.locator('.exec-file[data-kind="file"]', { hasText: KEPT_FILE });
    const upload = files.locator('.exec-file[data-kind="bucket"]', { hasText: uploadOut.key! });
    await expect(kept).toContainText(new RegExp(`${count(keptDataset.rowCount)} rows`));
    await expect(upload).toContainText(uploadOut.bucket!);
    await expect(upload).toContainText(uploadOut.key!);
    // The upload, from storage as the object browser downloads it.
    const [uploaded] = await Promise.all([page.waitForEvent('download'),
      upload.getByRole('button', { name: new RegExp(`^Download ${escape(uploadOut.name)} from ${escape(uploadOut.bucket!)}`) }).click()]);
    expect(uploaded.suggestedFilename()).toBe(uploadOut.name);

    // The kept file, as csv: named by the server, and its first line is the dataset's header.
    const [csv] = await Promise.all([page.waitForEvent('download'), kept.locator('[data-format="csv"]').click()]);
    expect(csv.suggestedFilename()).toBe(KEPT_FILE);
    const text = readFileSync(await csv.path(), 'utf8');
    expect(text.split(/\r?\n/)[0].split(',').map((c: string) => c.replace(/^"|"$/g, ''))).toEqual(keptDataset.columns);

    // The same dataset from its step on the Timeline, through the format menu.
    await page.getByRole('button', { name: `Download ${KEPT_FILE} from step ${savedStep.key}` }).click();
    await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText([/CSV/, /JSON/, /JSONL/]);
    const [jsonl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'JSONL' }).click()]);
    expect(jsonl.suggestedFilename()).toMatch(/\.jsonl$/);

    // An older run of the same job recorded no outputs (when the job is old enough to have one).
    if (NO_FILES.run) {
      await page.goto(`/pipelines/schedules/${NO_FILES.job}/runs/${NO_FILES.run}/logs`);
      await expect(page.locator('.exec-files')).toContainText('No files were recorded for this run.');
    } else {
      test.info().annotations.push({ type: 'note', description: `job ${NO_FILES.job} has no run from before MIG-236` });
    }
    await page.context().close();
  });

  test('a legacy run: the page as it was, with no steps card', async ({ browser }) => {
    test.skip(!LEGACY.run, 'The rebuilt platform has no run the legacy worker ran (service-1/2/3 are retired; every rebuilt'
      + ' pipeline runs on the step engine), and one cannot be made: pin E2E_LEGACY_JOB and E2E_LEGACY_RUN to check one.');
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
    await expect(row).toContainText(INBOX.file ? INBOX.file : /\.\w+/);
    const inbox = page.locator('.inbox-trigger');
    await expect(inbox).toContainText('arrives in the inbox starts this job');
    await expect(inbox.locator(`a[href$="/runs/${INBOX.run}/logs"]`)).toBeVisible();

    await page.goto(`/pipelines/schedules/${INBOX.job}/edit`);
    await expect(page.getByRole('heading', { name: 'When it runs' })).toBeVisible();
    await expect(page.locator('#onArrival')).toBeChecked();
    await expect(page.locator('#filePattern')).not.toHaveValue(/\//);
    await page.context().close();
  });

  for (const which of ['an AI pipeline', 'a pipeline with no AI step'] as const) {
    test(`Run with a different AI model… is offered for ${which} exactly when it has AI steps`, async ({ browser, request }) => {
      const job = which === 'an AI pipeline' ? AI.job : ENGINE.job;
      // What the dialog should list, asked directly: Chromium does not always keep a cross-origin answer's body.
      const body = await (await request.get(`${api}/sourceJob.json/aiModelChoice?jobId=${job}`, { headers: authOf(s) })).json();
      expect(body.status, body.message).toBe('SUCCESS');
      const hasAi = (body.data?.steps ?? []).length > 0;
      if (which === 'an AI pipeline' && !hasAi) {
        test.info().annotations.push({ type: 'note', description: `job ${job} has a model step, but Core lists no AI steps for it` });
      }
      const page = await pageAs(browser, s);
      await page.goto('/pipelines/schedules');
      await page.getByLabel('Search jobs').fill(NAMES[job]);
      await page.getByRole('button', { name: new RegExp(`^Actions for ${escape(NAMES[job])}`) }).first().click();
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
  }
});
