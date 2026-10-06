import { test, expect, APIRequestContext, Browser, Page, TestInfo } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * MIG-253: Documents -- the converter's Dataset → PDF and From an execution, Reports as generated outputs, and
 * Storage's file details, as workspace 2924's administrator (4537), against the live media-service render (MIG-232)
 * and Core's run outputs.
 *
 * Live data it reads: schedule 2849 "UI-CHECK registry chain job 0929" and its latest run that still keeps
 * customers-clean.json (found at start through the API, or E2E_FILES_RUN), which kept a 3-row dataset (3 rows,
 * customers-clean.json) and uploaded ui-review-s3/registry-live-check/customers-clean.json. What it writes, and leaves:
 * one PDF, ui-review-s3/reports/UI-CHECK run 7405 e2e.pdf (overwritten on each run). Nothing else is saved.
 *
 * Needs media-service and Core behind :9098 and a console at E2E_BASE_URL with MIG-253 (`ng serve --port 4422`). Sign-in:
 *   E2E_TENANT_ADMIN_TOKEN   a TENANT_ADMIN access token (etl-platform/scripts/mint-test-token.sh 4537 900)
 *   E2E_SHOTS                optional: a folder the screenshots are also written to
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';
const token = process.env['E2E_TENANT_ADMIN_TOKEN'];
const SCHEDULE = 'UI-CHECK registry chain job 0929';
const SAVED = 'UI-CHECK run 7405 e2e';

interface Session { data: Record<string, unknown>; }

/** The schedule's latest completed run that still keeps customers-clean.json, and that dataset's id. */
let RUN = 0;
let DATASET = 0;

async function keptRun(request: APIRequestContext): Promise<{ run: number; dataset: number }> {
  const headers = { Authorization: `Bearer ${token}` };
  const pinned = Number(process.env['E2E_FILES_RUN'] ?? 0);
  const runs = pinned ? [{ jobQueueId: pinned, jobStatus: 'Completed' }]
    : (await (await request.get(`${api}/sourceJob.json/fetchSourceJobQueueListWithJobId?jobId=2849`, { headers })).json())?.data?.jobQueues ?? [];
  for (const run of runs.filter((r: { jobStatus: string }) => r.jobStatus === 'Completed').slice(0, 3)) {
    const outputs = (await (await request.get(`${api}/sourceJob.json/runOutputs?jobQueueId=${run.jobQueueId}`, { headers })).json())?.data?.outputs ?? [];
    const kept = outputs.find((o: { kind: string; name: string; expired?: boolean }) => o.kind === 'file' && o.name === 'customers-clean.json' && !o.expired);
    if (kept) return { run: run.jobQueueId, dataset: kept.runDatasetId };
  }
  throw new Error('Schedule 2849 has no recent run that still keeps customers-clean.json: run it once (Run now), then run this spec.');
}

async function session(request: APIRequestContext): Promise<Session> {
  const claims = JSON.parse(Buffer.from(token!.split('.')[1], 'base64url').toString('utf8'));
  const pages = await (await request.get(`${api}/pageAccess.json/mine`, { headers: { Authorization: `Bearer ${token}` } })).json();
  return { data: { username: claims.sub, fullName: claims.sub, userRole: claims.userRole, appUserId: claims.appUserId,
    tenantId: claims.tenantId, accessToken: token, refreshToken: '', pageKeys: pages?.data?.pageKeys } };
}

async function pageAs(browser: Browser, s: Session, width = 1440): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, acceptDownloads: true });
  const page = await context.newPage();
  // A worktree's node_modules is a symlink out of the project, so `ng serve` answers pdf.js's worker at its /@fs/
  // path with 403 and every preview says "could not be opened". The same worker is served as an asset
  // (angular.json copies it to /pdfjs-dist/build/); hand that over. A built console never asks for /@fs/.
  await page.route('**/@fs/**/pdfjs-dist/build/pdf.worker*', async route => {
    const worker = await page.request.get('/pdfjs-dist/build/pdf.worker.mjs');
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: await worker.body() });
  });
  await page.goto('/');
  await page.evaluate(user => window.localStorage.setItem('etl_auth_user', JSON.stringify(user)), s.data);
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

/** Whether ui-review-s3 can be listed right now (LocalStack is not persistent and is sometimes down). */
async function bucketReadable(request: APIRequestContext): Promise<boolean> {
  const r = await request.get(`${api}/storage.json/listObjects?bucket=ui-review-s3&prefix=&maxKeys=1`,
    { headers: { Authorization: `Bearer ${token}` } });
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
  test.skip(!token, 'Set E2E_TENANT_ADMIN_TOKEN to run this.');
  let s: Session;
  test.beforeAll(async ({ request }) => {
    s = await session(request);
    // The run is found, not pinned: Reports reads each schedule's latest runs, so a pinned run drops out of it as soon
    // as the schedule runs a few more times (run 7405 did on 2026-09-29).
    const kept = await keptRun(request);
    RUN = kept.run;
    DATASET = kept.dataset;
  });

  test('Dataset → PDF: two pasted rows, the default layout, a PDF preview, and the download', async ({ browser }, info) => {
    const page = await pageAs(browser, s);
    const renders = await recordRenders(page);
    await page.goto('/documents/converter');
    await page.getByRole('button', { name: 'Dataset → PDF' }).click();
    await page.locator('#render-rows').fill('[{"region":"North","revenue":1234.5},{"region":"South","revenue":980}]');
    await expect(page.getByText('2 rows · 2 columns: region, revenue')).toBeVisible();
    await page.locator('#render-title').fill('UI-CHECK regions');

    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const preview = await nextRender(renders, 0);
    expect(preview.status).toBe('SUCCESS');
    expect(Buffer.from(preview.data!.outputBase64, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
    await expectPdfPreview(page);
    await shot(page, info, 'documents-dataset-preview');

    await page.locator('#render-name').fill('UI-CHECK regions e2e');
    await page.getByRole('button', { name: 'Make PDF' }).click();
    expect((await nextRender(renders, 1)).status).toBe('SUCCESS');
    const download = page.waitForEvent('download');
    await page.locator('[data-render-result]').getByRole('button', { name: 'Download' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('UI-CHECK regions e2e.pdf');
    expect(readFileSync((await file.path())!).subarray(0, 5).toString()).toBe('%PDF-');
  });

  /** Schedule 2849 → its latest kept run → that run's one kept dataset, picked in the converter. */
  async function pickKeptRun(page: Page): Promise<void> {
    await page.goto('/documents/converter');
    await page.getByRole('button', { name: 'From an execution' }).click();
    await page.locator('#render-schedule').fill('registry chain');
    await page.getByRole('option', { name: new RegExp(`^${SCHEDULE}`) }).click();
    await page.locator('#render-run').selectOption(String(RUN));
    // The run kept one dataset, so it is picked without asking.
    await expect(page.locator('#render-dataset')).toHaveValue(String(DATASET));
    await expect(page.getByText(`3 rows from run #${RUN}, ready to render.`)).toBeVisible();
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

  test('From an execution: the kept run\'s PDF saved to ui-review-s3/reports/', async ({ browser }) => {
    const page = await pageAs(browser, s);
    test.skip(!(await bucketReadable(page.request)), 'ui-review-s3 cannot be listed (LocalStack down): saving is not checked.');
    const renders = await recordRenders(page);
    await pickKeptRun(page);
    await page.locator('#render-name').fill(SAVED);
    await page.getByText('Save the file to a bucket').click();
    await page.locator('#render-bucket').fill('ui-review');
    await page.getByRole('option', { name: /UI-REVIEW LocalStack S3/ }).click();
    await expect(page.locator('#render-folder')).toHaveValue('reports/');
    await page.getByRole('button', { name: 'Make PDF' }).click();
    expect((await nextRender(renders, 0)).status).toBe('SUCCESS');
    await expect(page.locator('[data-render-result]')).toContainText('saved to ui-review-s3');
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
    await expect(run.filter({ hasText: `Kept by run #${RUN}` })).toContainText('Ready');
    await expect(run.filter({ hasText: `Kept by run #${RUN}` })).toContainText('UI-CHECK registry chain task 0929');
    await expect(run.filter({ hasText: 'ui-review-s3/registry-live-check/customers-clean.json' })).toContainText('In storage');
    if (bucket) await expect(rows.filter({ hasText: `${SAVED}.pdf` })).toBeVisible();
    else await expect(page.getByRole('alert')).toContainText('ui-review-s3/reports/ could not be read');
    await expect(page.locator('[data-reports-reach]')).toContainText('recent runs');
    await shot(page, info, 'documents-reports');

    await run.filter({ hasText: `Kept by run #${RUN}` }).getByRole('button', { name: 'Preview customers-clean.json' }).click();
    expect((await nextRender(renders, 0)).status).toBe('SUCCESS');
    const dialog = page.getByRole('dialog', { name: 'Preview of customers-clean.json' });
    await expect(dialog.locator('canvas').first()).toBeVisible();
  });

  test('Storage: the details of a file the kept run uploaded name the run and pipeline', async ({ browser }, info) => {
    const page = await pageAs(browser, s);
    test.skip(!(await bucketReadable(page.request)), 'ui-review-s3 cannot be listed (LocalStack down).');
    await page.goto('/documents/files?bucket=ui-review-s3&prefix=registry-live-check/');
    await page.getByRole('button', { name: 'Actions for customers-clean.json' }).click();
    await page.getByRole('menuitem', { name: 'Details' }).click();
    const panel = page.getByRole('dialog', { name: 'customers-clean.json' });
    await expect(panel.getByRole('link', { name: `Run #${RUN}` })).toBeVisible();
    await expect(panel).toContainText('UI-CHECK registry chain task 0929');
    await expect(panel).toContainText('No policy');
    await expect(panel).toContainText('169 B');
    await shot(page, info, 'documents-file-details');
  });
});
