import { expect, test, Page } from '@playwright/test';
import { api, authOf, canSignIn, NEEDS, pageAs, Session, sessionFor } from './support/session';
import { hasFixtures, NEEDS_FIXTURES, riverside } from './support/fixtures';
import { download, publishedTemplate, report, stamp, Template, woundJson, WOUND_DATA } from './support/report-studio';

/**
 * Report Studio's reports, live (MIG-404 and MIG-406), one report through its life:
 *   - Create report (/reports/new): the template, then pasted data. Data without the visits the template's contract needs
 *     shows Missing and Generate stays locked; the full data matches 2 of 2, previews and checks clean, and generates v1,
 *     whose page shows the PDF and the HTML.
 *   - Generate again: v2 from v1's frozen data; v1 stays in Versions (nothing is overwritten).
 *   - Approve and sign: Riverside's administrator generated it and cannot approve it (no button; the API refuses);
 *     Riverside's reviewer approves v2 and it shows Signed.
 *   - Verify: the stored v2 holds; its signed PDF, downloaded through the API and sent back as a file, holds; the same
 *     file with one byte flipped does not.
 * The template "E2E wound visit template <stamp>" is imported and published through the API (the designer has its own
 * spec); the report is "E2E wound visit <stamp>". Synthetic data, fictional patients; everything stays.
 */
const STAMP = stamp();
const TEMPLATE = `E2E wound visit template ${STAMP}`;
const REPORT = `E2E wound visit ${STAMP}`;

let admin: Session;
let reviewer: Session;
let tpl: Template;
let reportId = '';

const view = (browser: import('@playwright/test').Browser, s: Session): Promise<Page> =>
  pageAs(browser, s, { viewport: { width: 1920, height: 1080 } });

test.describe('Report Studio: create, regenerate, approve and verify a report (live)', () => {
  test.skip(!canSignIn('admin') || !canSignIn('user'), `${NEEDS.admin}; ${NEEDS.user}`);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  test.beforeAll(async ({ request }) => {
    admin = await sessionFor(request, 'admin');
    reviewer = await sessionFor(request, 'user');
    expect(reviewer.appUserId, 'Riverside\'s reviewer').toBe(riverside().reviewer);
    tpl = await publishedTemplate(request, admin, TEMPLATE);
  });

  test('the wizard: missing data blocks Generate, matched data generates v1 with PDF and HTML', async ({ browser }) => {
    const page = await view(browser, admin);
    await page.goto('/reports/new');
    await expect(page.getByRole('heading', { level: 1, name: 'Create a report' })).toBeVisible();
    await page.getByLabel('Search templates').fill(TEMPLATE);
    await page.getByRole('button', { name: new RegExp(TEMPLATE) }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Connect the right data' })).toBeVisible();
    await page.getByLabel('Report name').fill(REPORT);

    // Data without the visits: the required list is Missing, and Generate is locked.
    await page.getByRole('button', { name: 'Paste JSON', exact: true }).click();
    const { visits: _visits, ...withoutVisits } = WOUND_DATA;
    await page.getByLabel('Paste JSON').fill(woundJson(withoutVisits));
    await expect(page.getByText('1 of 2 matched')).toBeVisible();
    await expect(page.getByText('Required field missing: visits')).toBeVisible();
    await expect(page.getByText('1 required field missing · can\'t generate yet')).toBeVisible();
    await page.getByRole('button', { name: 'Preview with problems' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Check before you generate' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate v1' })).toBeDisabled();
    await expect(page.getByText('Fix the blocking problem to generate.')).toBeVisible();
    await page.getByRole('button', { name: 'Back to mapping' }).click();

    // The full data: both fields matched, the preview checks clean, v1 is generated.
    await page.getByLabel('Paste JSON').fill(woundJson());
    await expect(page.getByText('2 of 2 matched')).toBeVisible();
    await expect(page.getByText('Required field missing')).toHaveCount(0);
    await page.getByRole('button', { name: 'Preview and check' }).click();
    await expect(page.getByText('Page 1 of 1')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('0 blocking')).toBeVisible();
    await expect(page.getByText('Data contract, bindings, assets and layout pass.')).toBeVisible();
    await page.getByLabel('Reason').fill('E2E: October wound clinic review');
    await page.getByRole('button', { name: 'Generate v1' }).click();
    await expect(page.getByText(/Version 1 is ready/)).toBeVisible({ timeout: 90_000 });
    await page.getByRole('button', { name: 'Open the report' }).click();

    await expect(page).toHaveURL(/\/reports\/library\/[0-9A-Z]{26}$/);
    reportId = /library\/([0-9A-Z]{26})$/.exec(page.url())![1];
    await expect(page.getByRole('heading', { level: 1, name: REPORT })).toBeVisible();
    await expect(page.getByText('Version 1', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download the PDF', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download the HTML', exact: true })).toBeVisible();
    await page.context().close();
  });

  test('Generate again makes v2 from v1\'s frozen data; v1 is kept', async ({ browser, request }) => {
    test.skip(!reportId, 'no report was made');
    const page = await view(browser, admin);
    await page.goto(`/reports/library/${reportId}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Generate again' })).toBeVisible();
    await expect(page.getByLabel('Data')).toHaveValue('same');
    await page.getByRole('button', { name: 'Check and generate v2' }).click();
    await expect(page.getByText('Version 2', { exact: true }).first()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('heading', { level: 2, name: 'Where version 2 came from' })).toBeVisible();

    await page.getByRole('tab', { name: /^Versions/ }).click();
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: 'v2' }).getByText('Current')).toBeVisible();
    await expect(rows.filter({ hasText: /^v1/ })).toHaveCount(1);
    const r = await report(request, admin, reportId);
    expect(r.versions.map((v: { version: number }) => v.version).sort()).toEqual([1, 2]);
    expect(r.currentVersion).toBe(2);
    await page.context().close();
  });

  test('the generator cannot approve their own version; the reviewer approves and signs it', async ({ browser, request }) => {
    test.skip(!reportId, 'no report was made');
    const own = await view(browser, admin);
    await own.goto(`/reports/library/${reportId}`);
    await expect(own.getByText('You generated it; someone else approves it.')).toBeVisible();
    await expect(own.getByRole('button', { name: /^Approve and sign/ })).toHaveCount(0);
    await own.context().close();
    const refused = await request.post(`${api}/reportApprove.json/approve`, { headers: authOf(admin), data: { reportId, version: 2 } });
    expect(refused.status(), 'the generator\'s own approval is refused').toBeGreaterThanOrEqual(400);
    expect((await refused.json()).code).toBe('APPROVAL_NOT_ALLOWED');

    const page = await view(browser, reviewer);
    await page.goto(`/reports/library/${reportId}`);
    await expect(page.getByRole('heading', { level: 1, name: REPORT })).toBeVisible();
    // Read only for the reviewer: no Generate again, no Archive.
    await expect(page.getByRole('heading', { level: 2, name: 'Generate again' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Archive' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Approve and sign v2' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Approve and sign' }).click();
    await expect(page.getByText('v2 approved and its PDF signed.')).toBeVisible({ timeout: 30_000 });
    // The Signed chip shows in the header and on the version's row.
    await expect(page.locator('.pill', { hasText: 'Signed' }).first()).toBeVisible();
    await expect(page.getByText('Approved and signed').first()).toBeVisible();
    const r = await report(request, admin, reportId);
    const v2 = r.versions.find((v: { version: number }) => v.version === 2);
    expect(v2.approval.approvedBy).toBe(reviewer.appUserId);
    expect(v2.approval.signed).toBe(true);
    await page.context().close();
  });

  test('the signature verifies by version and by file; one flipped byte fails it', async ({ browser, request }) => {
    test.skip(!reportId, 'no report was made');
    const signed = await download(request, admin, reportId, 2, 'PDF');
    const range = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)/.exec(signed.toString('latin1'));
    expect(range, 'the PDF carries a signature').toBeTruthy();
    const tampered = Buffer.from(signed);
    // A byte inside a content stream of the signed part (final-regression 10-20: a byte between objects made the file
    // unreadable as a PDF, so the check never reached "changed after signing"). The middle of the first stream's data.
    const text = signed.toString('latin1');
    const start = text.indexOf('stream', 0) + 'stream'.length + 2;
    const end = text.indexOf('endstream', start);
    expect(start > 'stream'.length + 1 && end > start && end < Number(range![2]), 'a content stream inside the signed bytes').toBe(true);
    const at = Math.floor((start + end) / 2);
    tampered[at] ^= 0x01;

    const page = await view(browser, admin);
    await page.goto(`/reports/library/${reportId}`);
    await page.getByRole('button', { name: 'Verify signature' }).click();
    const panel = page.getByRole('dialog');
    await expect(panel.getByText('The signature holds.')).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByText(`Yes: ${(await report(request, admin, reportId)).label} v2`)).toBeVisible();

    const picker = panel.getByLabel('A PDF to check');
    const checked = () => page.waitForResponse(r => r.url().includes('/reportLibrary.json/verifyFile'));
    let answer = checked();
    await picker.setInputFiles({ name: `${REPORT}-v2.pdf`, mimeType: 'application/pdf', buffer: signed });
    expect((await answer).status()).toBe(200);
    await expect(panel.getByText('The signature holds.')).toBeVisible({ timeout: 30_000 });
    answer = checked();
    await picker.setInputFiles({ name: `${REPORT}-v2-changed.pdf`, mimeType: 'application/pdf', buffer: tampered });
    expect((await answer).status()).toBe(200);
    await expect(panel.getByText('Not verified.')).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByText(/content was changed after signing/)).toBeVisible();
    await expect(panel.getByText('No stored approved version has this file')).toBeVisible();
    await page.context().close();
  });
});
