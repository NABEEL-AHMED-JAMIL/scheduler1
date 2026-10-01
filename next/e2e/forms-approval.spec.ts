import { test, expect, APIRequestContext, Browser, Page } from '@playwright/test';

/**
 * MIG-279, live and read-only: form 1001 ("MIG-277 visit check (synthetic)") starts the workflow
 * mig279-visit-approval; submission 1004's request was approved by Alex (4597). The administrator (4537) sees the
 * workflow on the form, the approval on Submissions, and opens the form's rows in Analytics Studio.
 * Sign-in: E2E_TENANT_ADMIN_TOKEN (mint-test-token.sh 4537 900).
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';
const token = process.env['E2E_TENANT_ADMIN_TOKEN'];

async function pageAs(browser: Browser, request: APIRequestContext): Promise<Page> {
  const claims = JSON.parse(Buffer.from(token!.split('.')[1], 'base64url').toString('utf8'));
  const pages = await (await request.get(`${api}/pageAccess.json/mine`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(user => window.localStorage.setItem('etl_auth_user', JSON.stringify(user)), {
    username: claims.sub, fullName: claims.sub, userRole: claims.userRole, appUserId: claims.appUserId, tenantId: claims.tenantId,
    accessToken: token, refreshToken: '', pageKeys: pages?.data?.pageKeys });
  return page;
}

test.describe('Forms: approval and dataset (live, read-only)', () => {
  test.skip(!token, 'Set E2E_TENANT_ADMIN_TOKEN to run this.');

  test('the approval shows on Submissions, and the rows open in Analytics Studio', async ({ browser, request }) => {
    const page = await pageAs(browser, request);
    await page.goto('/forms/submissions?formId=1001');
    await expect(page.locator('[data-submission="1004"] [data-approval]')).toHaveText('Approved');

    await page.locator('[data-open-analytics]').click();
    await expect(page).toHaveURL(/\/data\/analytics\?connection=/);
    await expect(page.getByText('datasets/forms/form-1001/*.json').first()).toBeVisible();
  });

  test('the form names its approval workflow in the builder', async ({ browser, request }) => {
    const page = await pageAs(browser, request);
    await page.goto('/forms/builder');
    await page.getByRole('button', { name: 'Edit MIG-277 visit check (synthetic)' }).click();
    await expect(page.locator('#formWorkflow')).toHaveValue('mig279-visit-approval');
  });
});
