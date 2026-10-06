import { test, expect, APIRequestContext, Browser, Page } from '@playwright/test';
import { hasToken, NEEDS, tokenFor } from './support/session';

/**
 * Workflows (MIG-276), live, in workspace 2924: the administrator (4537) designs a workflow in the designer -- an
 * approval by Alex (4597), then a notice to the requester -- publishes it, and starts two test requests; Alex decides
 * them in his Task inbox (a rejection asks for a reason first); the administrator follows both in My requests. Escalation
 * is the SLA sweep's, hours later: WorkflowEnginePostgresTest and the MIG-274 live check cover it.
 *
 * It CREATES a workflow ("E2E purchase <time>") and two requests, and leaves them (the owner deletes test data). Alex
 * must hold the task-inbox page. Sign-in: E2E_TENANT_ADMIN_TOKEN (mint-test-token.sh 4537 900) and
 * E2E_TENANT_USER_TOKEN (mint-test-token.sh 4597 900).
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';
const stamp = new Date().toISOString().slice(5, 19).replace(/[-:T]/g, '');
const NAME = `E2E purchase ${stamp}`;
const KEY = `e2e-purchase-${stamp}`;

interface Session { data: Record<string, unknown>; }

async function session(request: APIRequestContext, token: string): Promise<Session> {
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  const pages = await (await request.get(`${api}/pageAccess.json/mine`, { headers: { Authorization: `Bearer ${token}` } })).json();
  return { data: { username: claims.sub, fullName: claims.sub, userRole: claims.userRole, appUserId: claims.appUserId,
    tenantId: claims.tenantId, accessToken: token, refreshToken: '', pageKeys: pages?.data?.pageKeys } };
}

async function pageAs(browser: Browser, s: Session): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(user => window.localStorage.setItem('etl_auth_user', JSON.stringify(user)), s.data);
  return page;
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
  let approved = 0;
  let rejected = 0;

  test.beforeAll(async ({ request }) => {
    admin = await session(request, tokenFor('admin')!);
    user = await session(request, tokenFor('user')!);
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

    // The first step: an approval, by Alex.
    const panel = page.locator('[data-test="step-panel"]');
    await expect(panel.getByRole('heading', { name: 'Approval' })).toBeVisible();
    await panel.getByLabel('Name', { exact: true }).fill('Alex approves');
    await panel.getByLabel('Who approves', { exact: true }).selectOption('user');
    await panel.getByRole('combobox', { name: 'Who approves: person' }).fill('Alex');
    await panel.getByRole('option', { name: /Alex/ }).first().click();
    await expect(page.locator('[data-step="approval"]')).toContainText('Alex');

    // Then: tell the requester.
    await page.locator('[data-test="add-step"]').click();
    await page.locator('[data-add="notify"]').click();
    await panel.getByLabel('Message').fill('Your purchase request was approved.');
    await expect(page.locator('[data-step]')).toHaveCount(2);

    await page.getByLabel('What changed').fill('E2E: Alex approves, then the requester is told');
    await page.locator('[data-test="publish"]').click();
    await expect(page.getByText('Published as version 1.')).toBeVisible();
    await expect(page.locator('[data-workflow="' + KEY + '"]')).toContainText('v1');

    approved = await startTest(page, `po-${stamp}-a`, 1200);
    await page.getByRole('tab', { name: 'Steps' }).click();
    rejected = await startTest(page, `po-${stamp}-b`, 90000);
    expect(rejected).toBeGreaterThan(approved);
  });

  test('Alex approves one and rejects the other, with a reason', async ({ browser }) => {
    const page = await pageAs(browser, user);
    await page.goto('/workflows/inbox');
    await expect(page.getByRole('heading', { level: 1, name: 'Task inbox' })).toBeVisible();

    const detail = page.locator('[data-test="task-detail"]');
    const row = (ref: string) => page.locator('.inbox-row', { hasText: `Purchase po-${stamp}-${ref}` });

    // The first request: approve.
    await row('a').click();
    await expect(detail).toContainText('1200');
    await expect(detail).toContainText('Alex approves: waiting for');
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

    // The designer is not Alex's page.
    await page.goto('/workflows/designer');
    await expect(page.getByRole('heading', { name: 'Workflow designer isn\'t part of your access' })).toBeVisible();
  });

  test('the administrator follows both in My requests', async ({ browser }) => {
    const page = await pageAs(browser, admin);
    await page.goto(`/workflows/requests?id=${approved}`);
    const request = page.locator('[data-test="request-detail"]');
    await expect(request).toContainText('Approved');
    await expect(request).toContainText('Alex approves: approved by Alex');
    await expect(request).toContainText('Request approved');

    await page.goto(`/workflows/requests?id=${rejected}`);
    await expect(request).toContainText('Rejected');
    await expect(request).toContainText('Over the quarter\'s budget');
  });
});
