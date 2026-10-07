import { test, expect, Browser, Page } from '@playwright/test';
import { hasToken, NEEDS, pageAs as signedIn, Session, sessionFor } from './support/session';
import { inactivateWorkflow } from './support/forms';

/**
 * Workflows (MIG-276), live, in Riverside Health: the administrator (role admin) designs a workflow in the designer --
 * an approval by the workspace's reviewer (role user), then a notice to the requester -- publishes it, and starts two
 * test requests; the reviewer decides them in their Task inbox (a rejection asks for a reason first); the administrator
 * follows both in My requests. Escalation is the SLA sweep's, hours later: WorkflowEnginePostgresTest and the MIG-274
 * live check cover it.
 *
 * It CREATES a workflow ("E2E purchase <time>") and two requests. The workflow service deletes neither, so the workflow
 * is switched to Inactive when the describe ends and the two decided requests stay with it. The reviewer must hold the
 * task-inbox page (the rebuilt Reviewer profile does); the rebuild's own open tasks in their inbox are never touched.
 * Sign-in through support/session.ts (roles admin and user).
 */
const stamp = new Date().toISOString().slice(5, 19).replace(/[-:T]/g, '');
const NAME = `E2E purchase ${stamp}`;
const KEY = `e2e-purchase-${stamp}`;

async function pageAs(browser: Browser, s: Session): Promise<Page> {
  return signedIn(browser, s, { viewport: { width: 1440, height: 900 } });
}

async function startTest(page: Page, reference: string, amount: number): Promise<number> {
  await page.getByRole('tab', { name: 'Test run' }).click();
  await page.getByLabel('Title').fill(`Purchase ${reference}`);
  await page.getByLabel('Reference').fill(reference);
  await page.getByLabel('The request\'s fields (JSON)').fill(JSON.stringify({ amount, vendor: 'Acme' }));
  await page.locator('[data-test="start-test"]').click();
  const link = page.locator('[data-test="test-link"]');
  await expect(link).toContainText(`Purchase ${reference}`);
  return Number(/#(\d+)/.exec((await link.textContent())!)![1]);
}

test.describe.serial('Workflows: design, publish, submit, approve, reject (live)', () => {
  test.skip(!hasToken('admin') || !hasToken('user'), `${NEEDS.admin}; ${NEEDS.user}`);
  let admin: Session;
  let user: Session;
  /** The reviewer's name as the people picker and the request history print it, and the step named after them. */
  let person = '';
  let step = '';
  let approved = 0;
  let rejected = 0;

  test.beforeAll(async ({ request }) => {
    admin = await sessionFor(request, 'admin');
    user = await sessionFor(request, 'user');
    person = user.fullName ?? user.username;
    step = `${person} approves`;
  });

  test.afterAll(async ({ request }) => {
    if (admin) await inactivateWorkflow(request, await sessionFor(request, 'admin'), KEY);
  });

  test('the administrator designs and publishes a workflow, then starts two requests', async ({ browser }) => {
    const page = await pageAs(browser, admin);
    await page.goto('/workflows/designer');
    await expect(page.getByRole('heading', { level: 1, name: 'Workflow designer' })).toBeVisible();

    await expect(page.locator('[data-workflow]').first()).toBeVisible();
    await page.locator('[data-test="new-workflow"]').click();
    const form = page.locator('[data-test="new-form"]');
    await form.getByLabel('Name', { exact: true }).fill(NAME);
    await expect(form.getByLabel('Key', { exact: true })).toHaveValue(KEY);
    await form.getByRole('button', { name: 'Create and design' }).click();
    await expect(page.locator(`[data-workflow="${KEY}"]`)).toHaveClass(/is-on/);

    // The first step: an approval, by the reviewer.
    const panel = page.locator('[data-test="step-panel"]');
    await expect(panel.getByRole('heading', { name: 'Approval' })).toBeVisible();
    await panel.getByLabel('Name', { exact: true }).fill(step);
    await panel.getByLabel('Who approves', { exact: true }).selectOption('user');
    await panel.getByRole('combobox', { name: 'Who approves: person' }).fill(person);
    await panel.getByRole('option', { name: new RegExp(person) }).first().click();
    await expect(page.locator('[data-step="approval"]')).toContainText(person);

    // Then: tell the requester.
    await page.locator('[data-test="add-step"]').click();
    await page.locator('[data-add="notify"]').click();
    await panel.getByLabel('Message').fill('Your purchase request was approved.');
    await expect(page.locator('[data-step]')).toHaveCount(2);

    await page.getByLabel('What changed').fill(`E2E: ${step}, then the requester is told`);
    await page.locator('[data-test="publish"]').click();
    await expect(page.getByText('Published as version 1.')).toBeVisible();
    await expect(page.locator('[data-workflow="' + KEY + '"]')).toContainText('v1');

    approved = await startTest(page, `po-${stamp}-a`, 1200);
    await page.getByRole('tab', { name: 'Steps' }).click();
    rejected = await startTest(page, `po-${stamp}-b`, 90000);
    expect(rejected).toBeGreaterThan(approved);
  });

  test('the reviewer approves one and rejects the other, with a reason', async ({ browser }) => {
    const page = await pageAs(browser, user);
    await page.goto('/workflows/inbox');
    await expect(page.getByRole('heading', { level: 1, name: 'Task inbox' })).toBeVisible();

    const detail = page.locator('[data-test="task-detail"]');
    const row = (ref: string) => page.locator('.inbox-row', { hasText: `Purchase po-${stamp}-${ref}` });

    // The first request: approve.
    await row('a').click();
    await expect(detail).toContainText('1200');
    await expect(detail).toContainText(`${step}: waiting for`);
    await detail.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(detail).toContainText('approved by you');

    // The second: a rejection with no reason is refused here, then sent with one.
    await page.locator('[data-test="tab-mine"]').click();
    await row('b').click();
    await expect(detail).toContainText('90000');
    await detail.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect(page.getByText('Say why you are rejecting this: a reason is required.')).toBeVisible();
    await detail.getByLabel('Comment').fill('Over the quarter\'s budget');
    await detail.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect(detail).toContainText('rejected by you');
    await expect(detail).toContainText('Over the quarter\'s budget');

    // The designer is not the reviewer's page.
    await page.goto('/workflows/designer');
    await expect(page.getByRole('heading', { name: 'Workflow designer isn\'t part of your access' })).toBeVisible();
  });

  test('the administrator follows both in My requests', async ({ browser }) => {
    const page = await pageAs(browser, admin);
    await page.goto(`/workflows/requests?id=${approved}`);
    const request = page.locator('[data-test="request-detail"]');
    await expect(request).toContainText('Approved');
    await expect(request).toContainText(`${step}: approved by ${person}`);
    await expect(request).toContainText('Request approved');

    await page.goto(`/workflows/requests?id=${rejected}`);
    await expect(request).toContainText('Rejected');
    await expect(request).toContainText('Over the quarter\'s budget');
  });
});
