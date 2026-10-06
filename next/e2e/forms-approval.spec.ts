import { test, expect, APIRequestContext, Browser, Page } from '@playwright/test';
import { canSignIn, NEEDS, pageAs as signedIn, Session, sessionFor } from './support/session';
import { formNamed, getJson } from './support/workspace';

/**
 * MIG-279, live and read-only: the form "MIG-277 visit check (synthetic)" starts the workflow mig279-visit-approval,
 * and one of its submissions was approved by Alex (4597). Both are FOUND (MIG-330: they were pinned as form 1001 and
 * submission 1004). The administrator (4537) sees the workflow on the form, the approval on Submissions, and opens the
 * form's rows in Analytics Studio.
 * Sign-in through support/session.ts: E2E_TENANT_ADMIN_TOKEN (mint-test-token.sh 4537 900), or E2E_TENANT_ADMIN(_PASSWORD).
 */
const FORM_NAME = 'MIG-277 visit check (synthetic)';
let s: Session;

async function pageAs(browser: Browser, request: APIRequestContext): Promise<Page> {
  s ??= await sessionFor(request, 'admin');
  return signedIn(browser, s, { viewport: { width: 1440, height: 1000 } });
}

test.describe('Forms: approval and dataset (live, read-only)', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);

  test('the approval shows on Submissions, and the rows open in Analytics Studio', async ({ browser, request }) => {
    const page = await pageAs(browser, request);
    const form = (await formNamed(request, s, FORM_NAME)).formId;
    const approved = ((await getJson(request, s, `/formSubmission.json/list?formId=${form}&limit=50`)).data ?? [])
      .find((x: { workflowStatus?: string }) => x.workflowStatus === 'Approved')?.submissionId;
    expect(approved, `a submission of "${FORM_NAME}" whose approval was given`).toBeTruthy();
    await page.goto(`/forms/submissions?formId=${form}`);
    await expect(page.locator(`[data-submission="${approved}"] [data-approval] .pill`)).toHaveText('Approved');

    await page.locator('[data-open-analytics]').click();
    await expect(page).toHaveURL(/\/data\/analytics\?connection=/);
    await expect(page.getByText(`datasets/forms/form-${form}/*.json`).first()).toBeVisible();
  });

  test('the form names its approval workflow in the builder', async ({ browser, request }) => {
    const page = await pageAs(browser, request);
    await page.goto('/forms/builder');
    await page.getByRole('button', { name: 'Edit MIG-277 visit check (synthetic)' }).click();
    await expect(page.locator('[data-form-editor]')).toContainText('starts workflow "MIG-279 visit approval (synthetic)"');
    await page.locator('[data-tab="settings"]').click();
    await expect(page.locator('#formWorkflow')).toHaveValue('mig279-visit-approval');
  });
});
