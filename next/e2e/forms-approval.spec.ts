import { test, expect, Browser, Page } from '@playwright/test';
import { api, authOf, canSignIn, NEEDS, pageAs as signedIn, Session, sessionFor } from './support/session';
import { getJson } from './support/workspace';
import { archiveForm, cancelRunning, inactivateWorkflow, makeForm, makeWorkflow, openTaskOf, submitForm } from './support/forms';
import { hasFixtures, NEEDS_FIXTURES, riverside } from './support/fixtures';

/**
 * MIG-279, live: a form starts an approval workflow, and the approval shows where the administrator looks. The rebuilt
 * workspace has no form with a workflow, so the spec makes them for the run: the workflow "E2E visit approval <stamp>"
 * (an approval by Riverside's reviewer, role user), the form "E2E approval form <stamp>" that starts it, and one
 * submission, which the reviewer approves through the task inbox's API. The administrator then sees the approval on
 * Submissions, opens the form's rows in Analytics Studio, and finds the workflow named on the form in the builder.
 * Afterwards the form is archived and the workflow switched off (neither service deletes); the submission, its request
 * and its dataset row stay with them. Sign-in through support/session.ts (roles admin and user).
 */
const STAMP = Date.now().toString(36);
const FORM_NAME = `E2E approval form ${STAMP}`;
const WORKFLOW_KEY = `e2e-visit-approval-${STAMP}`;
const WORKFLOW_NAME = `E2E visit approval ${STAMP}`;

let s: Session;
let form = 0;
let approved = 0;

async function pageAs(browser: Browser): Promise<Page> {
  return signedIn(browser, s, { viewport: { width: 1440, height: 1000 } });
}

test.describe('Forms: approval and dataset (live)', () => {
  test.skip(!canSignIn('admin') || !canSignIn('user'), `${NEEDS.admin}; ${NEEDS.user}`);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);

  test.beforeAll(async ({ request }) => {
    test.setTimeout(120_000);
    s = await sessionFor(request, 'admin');
    await makeWorkflow(request, s, WORKFLOW_KEY, WORKFLOW_NAME, 'form', [
      { key: 'approve', name: 'Reviewer approves', type: 'approval',
        assignee: { kind: 'user', value: String(riverside().reviewer) }, rejectNeedsComment: true },
    ]);
    form = await makeForm(request, s, FORM_NAME, [{ key: 'visit', label: 'Visit', type: 'text', required: true }], WORKFLOW_KEY);
    approved = (await submitForm(request, s, form, { visit: `E2E visit ${STAMP}` })).submissionId;
    // The reviewer approves it, as the Task inbox's Approve does.
    const reviewer = await sessionFor(request, 'user');
    const task = await openTaskOf(request, reviewer, WORKFLOW_KEY);
    const acted = await (await request.post(`${api}/taskInbox.json/act`, { headers: { ...authOf(reviewer),
      'Idempotency-Key': `e2e-${STAMP}-approve` }, data: { taskId: task.id, action: 'approve', comment: null } })).json();
    expect(acted.status, `approve task ${task.id}: ${acted.message}`).toBe('SUCCESS');
    await expect.poll(async () => ((await getJson(request, s, `/formSubmission.json/list?formId=${form}&limit=50`)).data ?? [])
      .find((x: { submissionId: number }) => x.submissionId === approved)?.workflowStatus,
    { timeout: 30_000, message: `submission ${approved}'s approval is recorded` }).toBe('Approved');
  });

  test.afterAll(async ({ request }) => {
    if (!s) return;
    if (form) await archiveForm(request, s, form);
    await cancelRunning(request, s, WORKFLOW_KEY);
    await inactivateWorkflow(request, s, WORKFLOW_KEY);
  });

  test('the approval shows on Submissions, and the rows open in Analytics Studio', async ({ browser }) => {
    const page = await pageAs(browser);
    await page.goto(`/forms/submissions?formId=${form}`);
    await expect(page.locator(`[data-submission="${approved}"] [data-approval] .pill`)).toHaveText('Approved');

    await page.locator('[data-open-analytics]').click();
    await expect(page).toHaveURL(/\/data\/analytics\?connection=/);
    await expect(page.getByText(`datasets/forms/form-${form}/*.json`).first()).toBeVisible();
  });

  test('the form names its approval workflow in the builder', async ({ browser }) => {
    const page = await pageAs(browser);
    await page.goto('/forms/builder');
    await page.getByRole('button', { name: `Edit ${FORM_NAME}` }).click();
    await expect(page.locator('[data-form-editor]')).toContainText(`starts workflow "${WORKFLOW_NAME}"`);
    await page.locator('[data-tab="settings"]').click();
    await expect(page.locator('#formWorkflow')).toHaveValue(WORKFLOW_KEY);
  });
});
