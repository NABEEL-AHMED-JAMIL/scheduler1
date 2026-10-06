import { test, expect, APIRequestContext, Browser, Page } from '@playwright/test';
import { canSignIn, NEEDS, Session, sessionFor } from './support/session';

/**
 * MIG-272: Document Intelligence's review flow end to end, as a workspace administrator.
 *
 * Seeds a document through the API -- OCR of the live-check scan in workspace 2924's storage connection, then an
 * extraction of it as an invoice, which leaves the vendor and the total to a reviewer -- and then, in the console:
 * opens it for review, clicks a field and sees its box highlighted and scrolled into view on the page image, corrects
 * the values the model missed, approves (over a failing rule if the type's rules say so, which the screen asks about),
 * and finds the document's row in the invoice dataset.
 *
 * Needs media-service and ai-service behind :9098 (the workspace's default model connection -- the local Ollama
 * gemma3:1b -- answers in a few seconds), workspace 2924's storage connection ui-review-s3 holding
 * ocr-live-check/ocr-live-check.png, and a console at E2E_BASE_URL (default :4400) that has MIG-272.
 * Sign-in, either:
 *   E2E_TENANT_ADMIN_TOKEN                          a TENANT_ADMIN access token (e.g. from
 *                                                   etl-platform/scripts/mint-test-token.sh 4537 900), or
 *   E2E_TENANT_ADMIN / E2E_TENANT_ADMIN_PASSWORD    a TENANT_ADMIN's credentials
 * What it makes -- an extraction, its corrections, an approved dataset row -- is left in place and marked with a
 * "UI-CHECK e2e" vendor: the workspace's owner clears test data.
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';
const BUCKET = process.env['E2E_OCR_BUCKET'] ?? 'ui-review-s3';
const KEY = process.env['E2E_OCR_KEY'] ?? 'ocr-live-check/ocr-live-check.png';
const VENDOR = `E2E vendor ${Date.now().toString(36)}`;

interface Field { fieldId: number; fieldKey: string; tableKey?: string | null; label?: string; value: string | null; page?: number | null; box?: unknown; }

async function pageAs(browser: Browser, s: Session, width = 1440, height = 900): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(user => window.localStorage.setItem('etl_auth_user', JSON.stringify(user)), s.data);
  return page;
}

/** GET or POST on the gateway, as the session; the envelope's data. */
async function call<T>(request: APIRequestContext, s: Session, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const headers = { Authorization: `Bearer ${s.token}` };
  const res = method === 'GET' ? await request.get(`${api}${path}`, { headers })
    : await request.post(`${api}${path}`, { headers, data: body });
  const json = await res.json();
  expect(json.status, `${method} ${path}: ${json.message}`).toBe('SUCCESS');
  return json.data as T;
}

/** Asks again while the row is still Queued or Running. */
async function settled<T extends { status: string }>(read: () => Promise<T>, what: string): Promise<T> {
  for (let i = 0; i < 90; i++) {
    const row = await read();
    if (row.status !== 'Queued' && row.status !== 'Running') return row;
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`${what} is still in progress after three minutes`);
}

/**
 * An extraction in Review: the scan read by OCR (an unchanged file answers its earlier read), then extracted as an
 * invoice. A small local model now and then answers something that is not an extraction (Failed): asked again.
 */
async function seed(request: APIRequestContext, s: Session): Promise<number> {
  const types = await call<{ documentTypeId: number; typeKey: string; builtIn: boolean; status: string }[]>(request, s, 'GET', '/documentType.json/fetchAll');
  const invoice = types.find(t => t.typeKey === 'invoice' && !t.builtIn && t.status === 'Active') ?? types.find(t => t.typeKey === 'invoice');
  expect(invoice, 'the invoice document type').toBeTruthy();
  const asked = await call<{ ocrDocumentId: number; status: string }>(request, s, 'POST', '/documentOcr.json/request', { bucket: BUCKET, key: KEY });
  const read = await settled(() => call<{ ocrDocumentId: number; status: string }>(request, s, 'GET',
    `/documentOcr.json/fetchById?ocrDocumentId=${asked.ocrDocumentId}`), 'the OCR read');
  expect(read.status, 'the OCR read').toBe('Done');
  let last = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const queued = await call<{ extractionId: number; status: string }>(request, s, 'POST', '/documentExtraction.json/extract',
      { ocrDocumentId: read.ocrDocumentId, documentTypeId: invoice!.documentTypeId });
    const done = await settled(() => call<{ extractionId: number; status: string; error?: string }>(request, s, 'GET',
      `/documentExtraction.json/fetchById?extractionId=${queued.extractionId}`), 'the extraction');
    if (done.status === 'Review') return done.extractionId;
    last = `${done.status}: ${done.error ?? ''}`;
  }
  throw new Error(`no extraction landed in Review (${last})`);
}

test.describe('Document Intelligence', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);

  let s: Session;
  test.beforeAll(async ({ request }) => { s = await sessionFor(request, 'admin'); });

  test('review: a field\'s box is highlighted, a value corrected, the document approved into its dataset', async ({ browser, request }, info) => {
    test.setTimeout(300_000);
    const extractionId = await seed(request, s);
    const detail = await call<{ fields: Field[] }>(request, s, 'GET', `/documentReview.json/fetchById?extractionId=${extractionId}`);
    const boxed = detail.fields.find(f => !f.tableKey && f.page && f.box);
    expect(boxed, 'a value read from the page, with its box').toBeTruthy();

    const page = await pageAs(browser, s);
    await page.goto(`/documents/review/${extractionId}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ocr-live-check.png');
    await expect(page.locator('[data-test="fields"]')).toContainText('need review');

    // ---- the highlighter: the page image loads through the API, the field's box lights up and comes into view
    await expect(page.locator('app-page-viewer img')).toHaveJSProperty('complete', true, { timeout: 20_000 });
    await page.locator('[data-test="fields"]').getByRole('button', { name: boxed!.label ?? boxed!.fieldKey }).click();
    const box = page.locator(`.doc-box[data-field-id="${boxed!.fieldId}"]`);
    await expect(box).toHaveClass(/doc-box-active/);
    await expect(box).toHaveAttribute('aria-pressed', 'true');
    await expect(box).toBeInViewport();
    await page.screenshot({ path: info.outputPath('review-highlight-1440.png'), fullPage: true });

    // ---- the keys: ↓ moves to the next field (with nothing typed into)
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.doc-field-active')).toHaveCount(1);

    // ---- corrections: the vendor and the total the model did not find
    await page.getByRole('textbox', { name: 'Vendor', exact: true }).fill(VENDOR);
    await page.getByRole('textbox', { name: 'Total', exact: true }).fill('9820.00');
    const saved = page.waitForResponse(r => r.url().includes('/documentReview.json/correct') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save corrections' }).click();
    expect((await saved).status()).toBe(200);
    await page.locator('[data-test="corrections"]').getByRole('button', { name: /Corrections/ }).click();
    await expect(page.locator('[data-test="corrections"]')).toContainText('vendor_name');
    await expect(page.locator('[data-test="blocking"]')).toHaveCount(0);

    // ---- approve: over a failing rule the screen asks first; then it moves on
    const approved = page.waitForResponse(r => r.url().includes('/documentReview.json/approve'));
    await page.getByRole('button', { name: 'Approve & next' }).click();
    const anyway = page.getByRole('button', { name: 'Approve anyway' });
    if (await anyway.isVisible({ timeout: 2_000 }).catch(() => false)) await anyway.click();
    expect((await approved).status()).toBe(200);
    await expect(page).not.toHaveURL(new RegExp(`/documents/review/${extractionId}$`), { timeout: 20_000 });

    // ---- the dataset: the approved document's row, with the corrected vendor as typed
    await page.goto('/documents/intelligence?tab=dataset');
    const dataset = page.locator('[data-test="dataset"]');
    await dataset.getByRole('combobox', { name: 'Document type' }).selectOption({ label: 'Invoice' });
    const row = dataset.locator('tbody tr', { hasText: `#${extractionId}` });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText(VENDOR);
    await page.screenshot({ path: info.outputPath('dataset-1440.png'), fullPage: true });

    // ---- read-only afterwards
    await page.goto(`/documents/review/${extractionId}`);
    await expect(page.locator('[data-test="view-only"]')).toContainText('Approved by you');
    await expect(page.getByRole('button', { name: 'Approve & next' })).toHaveCount(0);
  });

  test('review at a phone\'s width: the box still lights up and comes into view', async ({ browser, request }, info) => {
    test.setTimeout(300_000);
    const extractionId = await seed(request, s);
    const detail = await call<{ fields: Field[] }>(request, s, 'GET', `/documentReview.json/fetchById?extractionId=${extractionId}`);
    const boxed = detail.fields.find(f => !f.tableKey && f.page && f.box)!;
    const page = await pageAs(browser, s, 390, 844);
    await page.goto(`/documents/review/${extractionId}`);
    await expect(page.locator('app-page-viewer img')).toHaveJSProperty('complete', true, { timeout: 20_000 });
    await page.getByRole('textbox', { name: boxed.label ?? boxed.fieldKey, exact: true }).scrollIntoViewIfNeeded();
    await page.locator('[data-test="fields"]').getByRole('button', { name: boxed.label ?? boxed.fieldKey }).click();
    const box = page.locator(`.doc-box[data-field-id="${boxed.fieldId}"]`);
    await expect(box).toHaveClass(/doc-box-active/);
    await expect(box).toBeInViewport();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'no sideways scroll at 390px').toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath('review-highlight-390.png'), fullPage: true });
  });
});
