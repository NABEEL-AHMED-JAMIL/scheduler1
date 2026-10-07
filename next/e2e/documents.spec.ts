import { test, expect, APIRequestContext, Browser, Page, TestInfo } from '@playwright/test';
import { api, authOf, canSignIn, NEEDS, pageAs as signedIn, Session, sessionFor } from './support/session';
import { bestEffort, deleteObject, getJson, keptRun as keptRunOf, outputsOf, Output, tasks } from './support/workspace';
import { hasFixtures, NEEDS_FIXTURES, pipeline, riverside } from './support/fixtures';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * MIG-253: Documents -- the converter's Dataset → PDF and From an execution, Reports as generated outputs, and
 * Storage's file details, as Riverside Health's administrator, against the live media-service render (MIG-232) and
 * Core's run outputs.
 *
 * Live data it reads (support/fixtures.ts, the rebuilt platform's, never changed): the "readmission" pipeline's schedule
 * and its latest run that still keeps readmission-statistics.csv (found at start through the API, or E2E_FILES_RUN;
 * when none does any more, the schedule is run once to make one), which kept that dataset and uploaded a copy to the
 * workspace's bucket. What it writes: one PDF, <bucket>/reports/E2E run report.pdf, deleted again when the describe ends.
 *
 * Needs media-service and Core behind :9098 and a console at E2E_BASE_URL with MIG-253. Sign-in through
 * support/session.ts (role admin); E2E_SHOTS optional: a folder the screenshots are also written to.
 */
const KEPT = 'readmission-statistics.csv';
const SAVED = 'E2E run report';
let s: Session;
/** The workspace's storage connection (alias), its label as the bucket picker shows it, and the schedule's name. */
let BUCKET = '';
let BUCKET_LABEL = '';
let SCHEDULE = '';
let TASK = '';

/** The schedule's latest completed run that still keeps the statistics csv, that dataset's id, rows and upload. */
let RUN = 0;
let DATASET = 0;
let ROWS = 0;
let UPLOAD: Output;

async function keptRun(request: APIRequestContext): Promise<{ run: number; dataset: number }> {
  const pinned = Number(process.env['E2E_FILES_RUN'] ?? 0);
  if (pinned) {
    const outputs = await outputsOf(request, s, pinned);
    return { run: pinned, dataset: outputs.find(o => o.name === KEPT)?.runDatasetId ?? 0 };
  }
  return keptRunOf(request, s, pipeline('readmission').jobId, KEPT);
}

async function pageAs(browser: Browser, s: Session, width = 1440): Promise<Page> {
  const page = await signedIn(browser, s, { viewport: { width, height: width < 600 ? 844 : 900 }, acceptDownloads: true });
  // A worktree's node_modules is a symlink out of the project, so `ng serve` answers pdf.js's worker at its /@fs/
  // path with 403 and every preview says "could not be opened". The same worker is served as an asset
  // (angular.json copies it to /pdfjs-dist/build/); hand that over. A built console never asks for /@fs/.
  await page.route('**/@fs/**/pdfjs-dist/build/pdf.worker*', async route => {
    const worker = await page.request.get('/pdfjs-dist/build/pdf.worker.mjs');
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: await worker.body() });
  });
  return page;
}

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  const extra = process.env['E2E_SHOTS'];
  if (extra) await page.screenshot({ path: join(extra, `${name}.png`), fullPage: true });
}

type RenderAnswer = { status: string; message?: string; data?: { outputBase64: string; pageCount?: number; save?: boolean } };

/**
 * Every render's answer, read as it passes (route.fetch + fulfill: the real service answers, nothing is faked).
 * Reading the body from a waitForResponse raced the page, which had already taken the bytes.
 */
async function recordRenders(page: Page): Promise<RenderAnswer[]> {
  const seen: RenderAnswer[] = [];
  await page.route('**/documentConverter.json/render', async route => {
    const response = await route.fetch();
    seen.push(await response.json());
    await route.fulfill({ response });
  });
  return seen;
}

async function nextRender(seen: RenderAnswer[], before: number): Promise<RenderAnswer> {
  await expect.poll(() => seen.length, { timeout: 30_000 }).toBeGreaterThan(before);
  return seen[before];
}

/** Whether the workspace's bucket can be listed right now (LocalStack is not persistent and is sometimes down). */
async function bucketReadable(request: APIRequestContext): Promise<boolean> {
  const r = await request.get(`${api}/storage.json/listObjects?bucket=${encodeURIComponent(BUCKET)}&prefix=&maxKeys=1`,
    { headers: authOf(s) });
  return (await r.json().catch(() => ({})))?.status === 'SUCCESS';
}

/** The preview is drawn by pdf.js from a blob: object URL -- never the template's HTML in the page. */
async function expectPdfPreview(page: Page): Promise<void> {
  const preview = page.getByRole('region', { name: 'Preview of the rendered PDF' });
  await expect(preview).toBeVisible();
  await expect(preview.locator('canvas').first()).toBeVisible();
  await expect(preview.getByText(/of \d+/)).toBeVisible();
  expect(await page.locator('iframe[srcdoc], [data-render-panel] iframe').count()).toBe(0);
}

test.describe('Documents: converter, Reports and file details (live)', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);
  test.beforeAll(async ({ request }) => {
    test.setTimeout(240_000);   // a fresh run of the schedule, when no recent one keeps its file
    s = await sessionFor(request, 'admin');
    BUCKET = riverside().storageAlias;
    const buckets: { bucket: string; label?: string }[] = (await getJson(request, s, '/storage.json/buckets')).data ?? [];
    BUCKET_LABEL = buckets.find(b => b.bucket === BUCKET)?.label ?? BUCKET;
    const readmission = pipeline('readmission');
    SCHEDULE = ((await getJson(request, s, '/sourceJob.json/listSourceJob?page=1&limit=1000')).data ?? [])
      .find((j: { jobId: number }) => j.jobId === readmission.jobId)?.jobName;
    TASK = (await tasks(request, s)).find(t => t.taskDetailId === readmission.taskId)?.taskName ?? '';
    expect(SCHEDULE && TASK, 'the readmission schedule and its pipeline').toBeTruthy();
    // The run is found, not pinned: Reports reads each schedule's latest runs, so a pinned run drops out of it as soon
    // as the schedule runs a few more times.
    const kept = await keptRun(request);
    RUN = kept.run;
    DATASET = kept.dataset;
    const steps = (await getJson(request, s, `/sourceJob.json/stepExecutions?jobQueueId=${RUN}`)).data?.steps ?? [];
    ROWS = steps.flatMap((st: { datasets?: { name: string; rowCount: number }[] }) => st.datasets ?? [])
      .find((d: { name: string }) => d.name === KEPT)?.rowCount ?? 0;
    UPLOAD = (await outputsOf(request, s, RUN)).find(o => o.kind === 'bucket')!;
    expect(UPLOAD, `run ${RUN} uploaded its statistics to the bucket`).toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    if (s && BUCKET) await bestEffort(`delete ${BUCKET}/reports/${SAVED}.pdf`, () => deleteObject(request, s, BUCKET, `reports/${SAVED}.pdf`));
  });

  test('Dataset → PDF: two pasted rows, the default layout, a PDF preview, and the download', async ({ browser }, info) => {
    const page = await pageAs(browser, s);
    const renders = await recordRenders(page);
    await page.goto('/documents/converter');
    await page.getByRole('button', { name: 'Dataset → PDF' }).click();
    await page.locator('#render-rows').fill('[{"region":"North","revenue":1234.5},{"region":"South","revenue":980}]');
    await expect(page.getByText('2 rows · 2 columns: region, revenue')).toBeVisible();
    await page.locator('#render-title').fill('E2E regions');

    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const preview = await nextRender(renders, 0);
    expect(preview.status).toBe('SUCCESS');
    expect(Buffer.from(preview.data!.outputBase64, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
    await expectPdfPreview(page);
    await shot(page, info, 'documents-dataset-preview');

    await page.locator('#render-name').fill('E2E regions');
    await page.getByRole('button', { name: 'Make PDF' }).click();
    expect((await nextRender(renders, 1)).status).toBe('SUCCESS');
    const download = page.waitForEvent('download');
    await page.locator('[data-render-result]').getByRole('button', { name: 'Download' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('E2E regions.pdf');
    expect(readFileSync((await file.path())!).subarray(0, 5).toString()).toBe('%PDF-');
  });

  /** The schedule → its latest kept run → that run's kept statistics, picked in the converter. */
  async function pickKeptRun(page: Page): Promise<void> {
    await page.goto('/documents/converter');
    await page.getByRole('button', { name: 'From an execution' }).click();
    await page.locator('#render-schedule').fill(SCHEDULE.split(' ').slice(0, 2).join(' '));
    await page.getByRole('option', { name: new RegExp(`^${SCHEDULE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click();
    await page.locator('#render-run').selectOption(String(RUN));
    // A run that kept one dataset has it picked without asking; this one also kept its PDF, so the csv is picked here.
    const dataset = page.locator('#render-dataset');
    if ((await dataset.inputValue()) !== String(DATASET)) await dataset.selectOption(String(DATASET));
    await expect(dataset).toHaveValue(String(DATASET));
    await expect(page.getByText(`${ROWS} rows from run #${RUN}, ready to render.`)).toBeVisible();
  }

  test('From an execution: the kept run\'s dataset previewed as a PDF', async ({ browser }, info) => {
    const page = await pageAs(browser, s);
    const renders = await recordRenders(page);
    await pickKeptRun(page);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const preview = await nextRender(renders, 0);
    expect(preview.status).toBe('SUCCESS');
    expect(Buffer.from(preview.data!.outputBase64, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
    await expectPdfPreview(page);
    await shot(page, info, 'documents-execution-preview');
  });

  test('From an execution: the kept run\'s PDF saved to the workspace\'s bucket, under reports/', async ({ browser }) => {
    const page = await pageAs(browser, s);
    test.skip(!(await bucketReadable(page.request)), `${BUCKET} cannot be listed (LocalStack down): saving is not checked.`);
    const renders = await recordRenders(page);
    await pickKeptRun(page);
    await page.locator('#render-name').fill(SAVED);
    await page.getByText('Save the file to a bucket').click();
    await page.locator('#render-bucket').fill(BUCKET_LABEL.split(' ')[0]);
    await page.getByRole('option', { name: new RegExp(BUCKET_LABEL) }).click();
    await expect(page.locator('#render-folder')).toHaveValue('reports/');
    await page.getByRole('button', { name: 'Make PDF' }).click();
    expect((await nextRender(renders, 0)).status).toBe('SUCCESS');
    await expect(page.locator('[data-render-result]')).toContainText(`saved to ${BUCKET}`);
    await expect(page.locator('[data-render-result]').getByRole('link', { name: 'Open in storage' })).toBeVisible();
  });

  test('Reports lists the kept run\'s outputs and the saved PDF, and previews the run\'s dataset', async ({ browser }, info) => {
    const page = await pageAs(browser, s);
    const renders = await recordRenders(page);
    const bucket = await bucketReadable(page.request);
    await page.goto('/documents/reports');
    const rows = page.locator('table tbody tr');
    const run = rows.filter({ has: page.getByRole('link', { name: `Run #${RUN}` }) });
    await expect(run.first()).toBeVisible();
    expect(await run.count()).toBeGreaterThanOrEqual(2);
    await expect(run.filter({ hasText: `Kept by run #${RUN}` }).first()).toContainText('Ready');
    await expect(run.filter({ hasText: `Kept by run #${RUN}` }).first()).toContainText(TASK);
    await expect(run.filter({ hasText: `${UPLOAD.bucket}/${UPLOAD.key}` })).toContainText('In storage');
    if (bucket) await expect(rows.filter({ hasText: `${SAVED}.pdf` })).toBeVisible();
    else await expect(page.getByRole('alert')).toContainText(`${BUCKET}/reports/ could not be read`);
    await expect(page.locator('[data-reports-reach]')).toContainText('recent runs');
    await shot(page, info, 'documents-reports');

    await run.filter({ hasText: `Kept by run #${RUN}` }).getByRole('button', { name: `Preview ${KEPT}` }).click();
    expect((await nextRender(renders, 0)).status).toBe('SUCCESS');
    const dialog = page.getByRole('dialog', { name: `Preview of ${KEPT}` });
    await expect(dialog.locator('canvas').first()).toBeVisible();
  });

  test('Storage: the details of a file the kept run uploaded name the run and pipeline', async ({ browser }, info) => {
    const page = await pageAs(browser, s);
    test.skip(!(await bucketReadable(page.request)), `${BUCKET} cannot be listed (LocalStack down).`);
    const folder = UPLOAD.key!.slice(0, UPLOAD.key!.lastIndexOf('/') + 1);
    const size = Number((await getJson(page.request, s, `/storage.json/objectMetadata?bucket=${encodeURIComponent(BUCKET)}&key=${encodeURIComponent(UPLOAD.key!)}`)).data?.size);
    await page.goto(`/documents/files?bucket=${encodeURIComponent(BUCKET)}&prefix=${encodeURIComponent(folder)}`);
    await page.getByRole('button', { name: `Actions for ${UPLOAD.name}` }).click();
    await page.getByRole('menuitem', { name: 'Details' }).click();
    const panel = page.getByRole('dialog', { name: UPLOAD.name });
    await expect(panel.getByRole('link', { name: `Run #${RUN}` })).toBeVisible();
    await expect(panel).toContainText(TASK);
    await expect(panel).toContainText('No policy');
    if (size < 1024) await expect(panel).toContainText(`${size} B`);
    else await expect(panel).toContainText(/\d+(\.\d+)? KB/);
    await shot(page, info, 'documents-file-details');
  });
});
