import { test, expect, APIRequestContext, Browser, Page } from '@playwright/test';

/**
 * Wave 5 by Friday (owner 2026-09-29): Forms (lite) and the result review (MIG-237) as workspace 2924's administrator
 * (4537), and the menu without the deferred modules (Data Catalog, Connector Hub). Read-only: it submits
 * nothing, decides no review and saves no form.
 *
 * Live data it reads: the Active form "Wound follow-up (synthetic, demo)" (form 1000, linked to job 2853, the wound
 * assessment), and job 2853's newest run whose review is still pending (found at start through the API; a form
 * submission or an inbox batch makes one). Sign-in: E2E_TENANT_ADMIN_TOKEN (etl-platform/scripts/mint-test-token.sh
 * 4537 900).
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';
const token = process.env['E2E_TENANT_ADMIN_TOKEN'];
const FORM = 'Wound follow-up (synthetic, demo)';
const WOUND_JOB = 2853;

interface Session { data: Record<string, unknown>; }

async function session(request: APIRequestContext): Promise<Session> {
  const claims = JSON.parse(Buffer.from(token!.split('.')[1], 'base64url').toString('utf8'));
  const pages = await (await request.get(`${api}/pageAccess.json/mine`, { headers: { Authorization: `Bearer ${token}` } })).json();
  return { data: { username: claims.sub, fullName: claims.sub, userRole: claims.userRole, appUserId: claims.appUserId,
    tenantId: claims.tenantId, accessToken: token, refreshToken: '', pageKeys: pages?.data?.pageKeys } };
}

async function pageAs(browser: Browser, s: Session, width = 1440): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(user => window.localStorage.setItem('etl_auth_user', JSON.stringify(user)), s.data);
  return page;
}

/** Job 2853's newest run (of its latest ten) whose review is still pending, or 0. */
async function pendingReview(request: APIRequestContext): Promise<number> {
  const headers = { Authorization: `Bearer ${token}` };
  const runs = await (await request.get(`${api}/sourceJob.json/fetchSourceJobQueueListWithJobId?jobId=${WOUND_JOB}`, { headers })).json();
  for (const run of (runs?.data?.jobQueues ?? []).slice(0, 10)) {
    if (run.jobStatus !== 'Completed') continue;
    const review = await (await request.get(`${api}/sourceJob.json/review?jobQueueId=${run.jobQueueId}`, { headers })).json();
    if (review?.data?.reviewStatus === 'PENDING') return run.jobQueueId;
  }
  return 0;
}

test.describe('Forms (lite), the result review, and the Friday menu (live)', () => {
  test.skip(!token, 'Set E2E_TENANT_ADMIN_TOKEN to run this.');
  let s: Session;
  test.beforeAll(async ({ request }) => { s = await session(request); });

  test('the menu offers All forms and the Task inbox, and none of the deferred modules', async ({ browser }) => {
    const page = await pageAs(browser, s, 390);
    await page.goto('/');
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    const menu = page.locator('nav.mobile-nav');
    await expect(menu).toBeVisible();
    // Sections open on a click; open every one so their pages are in the page.
    for (const section of await menu.locator('button[aria-expanded="false"]').all()) await section.click();
    await expect(menu.getByRole('link', { name: 'All forms' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Submissions' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Ask your data' })).toBeVisible();
    // Workflows is built (MIG-276); Data Catalog and Connector Hub are still off the menu.
    await expect(menu.getByRole('link', { name: 'Task inbox' })).toBeVisible();
    for (const gone of ['Data Catalog', 'Connector Hub', 'Coming soon']) {
      await expect(menu.getByText(gone, { exact: true })).toHaveCount(0);
    }
  });

  test('All forms lists the wound form, and its fill-in page asks for its five fields', async ({ browser }) => {
    const page = await pageAs(browser, s);
    await page.goto('/forms/builder');
    await expect(page.getByRole('heading', { level: 1, name: 'Forms' })).toBeVisible();
    const row = page.locator('tr[data-form]', { hasText: FORM });
    await expect(row).toBeVisible();
    const formId = await row.getAttribute('data-form');
    await page.goto(`/forms/${formId}/fill`);
    for (const label of ['Case id', 'Patient id', 'Visit date', 'Wound site', 'Photo in the inbox']) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /send|submit/i })).toBeVisible();
  });

  test('a wound run waiting for review shows who must review, and Approve / Reject', async ({ browser, request }) => {
    const run = await pendingReview(request);
    test.skip(!run, `Job ${WOUND_JOB} has no completed run pending review: send the wound form once, then run this spec.`);
    const page = await pageAs(browser, s);
    await page.goto(`/pipelines/schedules/${WOUND_JOB}/runs/${run}/logs`);
    const review = page.locator('[data-review]');
    await expect(review).toBeVisible();
    await expect(review.getByRole('heading', { name: 'Result review' })).toBeVisible();
    await expect(review.getByText('Waiting for review')).toBeVisible();
    await expect(review.getByText('Needs: Our team')).toBeVisible();
    await expect(review.getByRole('button', { name: 'Approve' })).toBeEnabled();
    await expect(review.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });
  test('Ask your data fits a phone: no suggestion pushes the page sideways', async ({ browser }) => {
    const page = await pageAs(browser, s, 390);
    await page.goto('/data/ask');
    await expect(page.locator('[data-test="suggestions"] button').first()).toBeVisible({ timeout: 30_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'the page is wider than the phone by').toBeLessThanOrEqual(0);
  });
});
