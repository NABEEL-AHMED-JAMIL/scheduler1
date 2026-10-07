import { test, expect, APIRequestContext, Browser, Page } from '@playwright/test';
import { canSignIn, NEEDS, pageAs as signedIn, Session, sessionFor } from './support/session';
import { getJson } from './support/workspace';
import { hasFixtures, NEEDS_FIXTURES, pipeline, RebuiltPipeline } from './support/fixtures';

/**
 * Wave 5: Forms (lite) and the result review (MIG-237) as Riverside Health's administrator, and the menu with every
 * Wave 5 module. Read-only: it submits nothing, decides no review and saves no form.
 *
 * Live data it reads (support/fixtures.ts, the rebuilt platform's): the clinical-trial finder's Active form and its
 * fields, and the newest Completed run of a rebuilt schedule whose review is still pending (the partner-lab sign-off the
 * rebuild left open for the owner, or another found through the API) -- only looked at, never decided.
 * Sign-in through support/session.ts (role admin).
 */
let REVIEW_JOB = 0;

async function pageAs(browser: Browser, s: Session, width = 1440): Promise<Page> {
  return signedIn(browser, s, { viewport: { width, height: 900 } });
}

/** A run of a rebuilt schedule whose review is still pending: the one the rebuild left open first, else the newest. */
async function pendingReview(request: APIRequestContext, s: Session): Promise<number> {
  const labs = pipeline('labs') as RebuiltPipeline & { openSignoff?: { run: number } };
  const candidates = [labs.openSignoff?.run ?? 0];
  const waiting = (await getJson(request, s, '/sourceJob.json/review/waiting')).data?.runs ?? [];
  candidates.push(...waiting.map((r: { jobQueueId: number }) => r.jobQueueId));
  for (const run of candidates.filter(Boolean).slice(0, 10)) {
    const review = await getJson(request, s, `/sourceJob.json/review?jobQueueId=${run}`);
    if (review?.data?.reviewStatus === 'PENDING' && review.data.runStatus === 'Completed') {
      REVIEW_JOB = review.data.jobId;
      return run;
    }
  }
  return 0;
}

test.describe('Forms (lite), the result review, and the Friday menu (live)', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);
  let s: Session;
  test.beforeAll(async ({ request }) => {
    s = await sessionFor(request, 'admin');
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

  test('All forms lists the trial finder\'s form, and its fill-in page asks for its fields', async ({ browser, request }) => {
    const formId = pipeline('trials').formId!;
    const form = (await getJson(request, s, `/form.json/fetch?formId=${formId}`)).data;
    expect(form?.status, `form ${formId} is Active`).toBe('Active');
    const page = await pageAs(browser, s);
    await page.goto('/forms/builder');
    await expect(page.getByRole('heading', { level: 1, name: 'Forms' })).toBeVisible();
    const row = page.locator(`tr[data-form="${formId}"]`);
    await expect(row).toBeVisible();
    await expect(row).toContainText(form.name);
    // The fields are the form's current version's, read from the service: the form is live and may be edited.
    const fields: { label: string }[] = form.fields ?? [];
    expect(fields.length, `form ${formId} asks something`).toBeGreaterThan(0);
    await page.goto(`/forms/${formId}/fill`);
    for (const { label } of fields) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /send|submit/i })).toBeVisible();
  });

  test('a run waiting for review shows who must review, and Approve / Reject', async ({ browser, request }) => {
    const run = await pendingReview(request, s);
    test.skip(!run, 'No rebuilt schedule has a completed run pending review (the rebuild left the partner-lab sign-off open).');
    const page = await pageAs(browser, s);
    await page.goto(`/pipelines/schedules/${REVIEW_JOB}/runs/${run}/logs`);
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
