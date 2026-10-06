import { test, expect, APIRequestContext, Browser, Page } from '@playwright/test';
import { canSignIn, NEEDS, pageAs as signedIn, Session, sessionFor } from './support/session';
import { getJson, jobNamed } from './support/workspace';

/**
 * Wave 5 by Friday (owner 2026-09-29): Forms (lite) and the result review (MIG-237) as workspace 2924's administrator
 * (4537), and the menu without the deferred modules (Data Catalog, Connector Hub). Read-only: it submits
 * nothing, decides no review and saves no form.
 *
 * Live data it reads, found by name (MIG-330: the job was pinned as 2853): the Active form "Wound follow-up (synthetic,
 * demo)", linked to the job "Wound intake job (synthetic, MIG-255)", the wound assessment, and that job's newest run
 * whose review is still pending (found at start through the API; a form submission or an inbox batch makes one).
 * Sign-in through support/session.ts: E2E_TENANT_ADMIN_TOKEN (4537 of 2924), or E2E_TENANT_ADMIN(_PASSWORD).
 */
const FORM = 'Wound follow-up (synthetic, demo)';
const WOUND_JOB_NAME = 'Wound intake job (synthetic, MIG-255)';
let WOUND_JOB = 0;

async function pageAs(browser: Browser, s: Session, width = 1440): Promise<Page> {
  return signedIn(browser, s, { viewport: { width, height: 900 } });
}

/** The wound job's newest run (of its latest ten) whose review is still pending, or 0. */
async function pendingReview(request: APIRequestContext, s: Session): Promise<number> {
  const runs = await getJson(request, s, `/sourceJob.json/fetchSourceJobQueueListWithJobId?jobId=${WOUND_JOB}`);
  for (const run of (runs?.data?.jobQueues ?? []).slice(0, 10)) {
    if (run.jobStatus !== 'Completed') continue;
    const review = await getJson(request, s, `/sourceJob.json/review?jobQueueId=${run.jobQueueId}`);
    if (review?.data?.reviewStatus === 'PENDING') return run.jobQueueId;
  }
  return 0;
}

test.describe('Forms (lite), the result review, and the Friday menu (live)', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);
  let s: Session;
  test.beforeAll(async ({ request }) => {
    s = await sessionFor(request, 'admin');
    WOUND_JOB = (await jobNamed(request, s, WOUND_JOB_NAME)).jobId;
  });

  test('the menu offers every Wave 5 module: forms, the Task inbox, Data Catalog and Connector Hub', async ({ browser }) => {
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
    // Since the demo moved to 12 October every Wave 5 module is built and on the menu; nothing is "Coming soon".
    await expect(menu.getByRole('link', { name: 'Task inbox' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Data Catalog' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Connector Hub' })).toBeVisible();
    await expect(menu.getByText('Coming soon', { exact: true })).toHaveCount(0);
  });

  test('All forms lists the wound form, and its fill-in page asks for its five fields', async ({ browser, request }) => {
    const page = await pageAs(browser, s);
    await page.goto('/forms/builder');
    await expect(page.getByRole('heading', { level: 1, name: 'Forms' })).toBeVisible();
    const row = page.locator('tr[data-form]', { hasText: FORM });
    await expect(row).toBeVisible();
    const formId = await row.getAttribute('data-form');
    // The fields are the form's current version's, read from the service: the form is live and is edited (its photo
    // field went from "Photo in the inbox" to an upload, "Wound photo", on 2026-10-06 in the middle of a run).
    const fields: { label: string }[] = (await getJson(request, s, `/form.json/fetch?formId=${formId}`)).data?.fields ?? [];
    expect(fields.map(f => f.label).slice(0, 4)).toEqual(['Case id', 'Patient id', 'Visit date', 'Wound site']);
    expect(fields).toHaveLength(5);
    await page.goto(`/forms/${formId}/fill`);
    for (const { label } of fields) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /send|submit/i })).toBeVisible();
  });

  test('a wound run waiting for review shows who must review, and Approve / Reject', async ({ browser, request }) => {
    const run = await pendingReview(request, s);
    test.skip(!run, `"${WOUND_JOB_NAME}" has no completed run pending review: send the wound form once, then run this spec.`);
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
