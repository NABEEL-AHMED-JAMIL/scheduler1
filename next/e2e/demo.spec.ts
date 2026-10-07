import { test, expect, APIRequestContext, Browser, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { api, authOf, claimsOf, pageAs, Session, sessionOf } from './support/session';
import { forbiddenIds } from './support/fixtures';

/**
 * The sales demo's two paths (MIG-319), headless, against the demo workspaces that etl-platform/demo/setup.py builds:
 *
 *   A  Northwind Group (SELF), its admin: an invoice whose total does not add up is uploaded to Document
 *      Intelligence, read by the local model, and stopped in review with the rule that failed.
 *   C  Harbor Health (MANAGED), its admin: a follow-up visit with a wound photo is submitted through the
 *      form; the run measures it and waits for review, which Executions and the run's review panel show. The
 *      customer's build screens carry the managed banner (story D in one look).
 *
 * The ids come from etl-platform/.state/demo/ids.json (setup.py writes it). Tokens are minted with
 * etl-platform/scripts/mint-test-token.sh for those two admins only; never printed, never for the owner. Each test
 * leaves what a rehearsal leaves (a document, a submission and its run): etl-platform/demo/reset.py clears them.
 * Opt-in: E2E_DEMO=1 (they upload and run the local models, minutes not seconds).
 *
 * <b>Not runnable on the rebuilt platform.</b> The 2026-10-06 wipe removed both workspaces and ids.json; the rebuild
 * (rebuild.json, support/fixtures.ts) made Riverside, Meridian and Open Data Lab instead, with no wound form and with
 * Meridian's invoices as demo data the suite must not add to. Until setup.py's workspaces exist again, this skips.
 */
const PLATFORM = resolve(__dirname, '../../../etl-platform');
const IDS = resolve(PLATFORM, '.state/demo/ids.json');
const MINT = process.env['E2E_MINT_SCRIPT'] ?? resolve(PLATFORM, 'scripts/mint-test-token.sh');
const WOUND = resolve(__dirname, '../../../process-main/src/test/resources/e2e/wound');
const ready = process.env['E2E_DEMO'] === '1' && existsSync(IDS) && existsSync(MINT);
const ids = ready ? JSON.parse(readFileSync(IDS, 'utf8')) : {};

function mint(appUserId: number): string {
  if (forbiddenIds().includes(appUserId)) throw new Error(`the demo smoke never acts as ${appUserId}, the owner's or api-check's`);
  const token = execFileSync('bash', [MINT, String(appUserId), '900'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, MINT_CALLER: 'playwright demo smoke' },
  }).trim();
  expect(claimsOf(token).appUserId).toBe(appUserId);
  return token;
}

async function signedIn(browser: Browser, request: APIRequestContext, appUserId: number, width = 1920): Promise<{ s: Session; page: Page }> {
  const s = await sessionOf(request, mint(appUserId));
  return { s, page: await pageAs(browser, s, { viewport: { width, height: width >= 1920 ? 1080 : 900 } }) };
}

/** A copy of a fixture whose bytes no earlier upload had (Document Intelligence refuses a file it has read). */
function freshCopy(path: string): Buffer {
  return Buffer.concat([readFileSync(path), Buffer.from(`\n%demo-smoke ${Date.now()}\n`)]);
}

test.describe('Sales demo paths (MIG-319)', () => {
  test.skip(!ready, 'needs E2E_DEMO=1 and etl-platform/.state/demo/ids.json (python3 etl-platform/demo/setup.py): the'
    + ' MIG-319 demo workspaces were wiped on 2026-10-06 and the rebuild does not recreate them');

  test('A: an invoice that does not add up stops in review with the failed check', async ({ browser, request }) => {
    test.setTimeout(10 * 60_000);
    const { s, page } = await signedIn(browser, request, ids.ap.admin);
    expect(s.tenantId).toBe(ids.ap.tenant);

    await page.goto('/documents/intelligence?tab=types');
    await expect(page.getByText('Demo AP invoice').first()).toBeVisible();

    const invoice = resolve(PLATFORM, 'demo/fixtures/out/ap/INV-NW-1007.pdf');
    const sent = await request.post(`${api}/documentOcr.json/upload`, { headers: authOf(s),
      multipart: { files: { name: 'INV-NW-1007.pdf', mimeType: 'application/pdf', buffer: freshCopy(invoice) } } });
    const accepted = (await sent.json()).data?.[0];
    expect(accepted?.outcome, accepted?.reason).toBe('Accepted');

    let extraction: any = null;
    await expect.poll(async () => {
      const intakes = (await (await request.get(`${api}/documentOcr.json/intakes?channel=upload&limit=50`, { headers: authOf(s) })).json()).data ?? [];
      const row = intakes.find((i: any) => i.ocrDocumentId === accepted.ocrDocumentId);
      if (!row?.extractionId) return 'reading';
      extraction = (await (await request.get(`${api}/documentExtraction.json/fetchById?extractionId=${row.extractionId}`, { headers: authOf(s) })).json()).data;
      return extraction?.status ?? 'reading';
    }, { timeout: 8 * 60_000, intervals: [5000] }).toMatch(/^(Review|Approved|Failed|Unclassified)$/);
    expect(extraction.status, 'the total does not add up, so it cannot be approved by itself').toBe('Review');
    expect(extraction.documentTypeId).toBe(ids.ap.documentTypeId);

    await page.goto(`/documents/review/${extraction.extractionId}`);
    await expect(page.getByText('Rule check', { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/Total due is not Subtotal \+ Sales tax\. They add up to 4483\.05/).first()).toBeVisible();
    await page.context().close();
  });

  test('C: a wound photo sent through the form is measured and waits for review; build screens are managed', async ({ browser, request }) => {
    test.setTimeout(6 * 60_000);
    const w = ids.wound;
    const { s, page } = await signedIn(browser, request, w.customerAdmin);
    expect(s.tenantId).toBe(w.tenant);

    // The nurse's submission, as the form's fill-in page sends it.
    const up = await request.post(`${api}/form.json/upload?formId=${w.formId}&field=image`, { headers: authOf(s),
      multipart: { file: { name: 'WC-0001.png', mimeType: 'image/png', buffer: readFileSync(resolve(WOUND, 'WC-0001.png')) } } });
    const upload = (await up.json()).data;
    expect(upload?.uploadId).toBeTruthy();
    const sent = await (await request.post(`${api}/form.json/submit`, { headers: authOf(s), data: { formId: w.formId,
      answers: { case_id: 'WC-0001', patient_id: 'SYN-001', visit_date: '2026-10-12', wound_site: 'left heel', image: [upload.uploadId] } } })).json();
    expect(sent.status, sent.message).toBe('SUCCESS');
    const run = sent.data.jobQueueId;
    expect(run, sent.message).toBeTruthy();

    await expect.poll(async () => {
      const q = (await (await request.get(`${api}/sourceJob.json/fetchSourceJobQueueListWithJobId?jobId=${w.jobId}`, { headers: authOf(s) })).json()).data?.jobQueues ?? [];
      return q.find((r: any) => r.jobQueueId === run)?.jobStatus ?? 'none';
    }, { timeout: 4 * 60_000, intervals: [3000] }).toMatch(/^(Completed|Failed|Interrupt)$/);
    const outputs = (await (await request.get(`${api}/sourceJob.json/runOutputs?jobQueueId=${run}`, { headers: authOf(s) })).json()).data;
    expect(outputs.reviewStatus).toBe('PENDING');

    await page.goto('/pipelines/executions');
    const waiting = page.locator('[data-review-waiting]');
    await expect(waiting).toContainText('Waiting for review');
    await expect(waiting).toContainText(`run #${run}`);
    await page.goto(`/pipelines/schedules/${w.jobId}/runs/${run}/logs`);
    const review = page.locator('[data-review]');
    await expect(review).toContainText('Result review');
    await expect(review).toContainText('Waiting for review');

    // D in one look: the customer's build screens are read-only, with the banner.
    await page.goto('/pipelines');
    await expect(page.locator('[data-managed-banner]')).toContainText('Managed by our team');
    await expect(page.getByRole('link', { name: 'New pipeline' })).toHaveCount(0);
    await page.context().close();
  });
});
