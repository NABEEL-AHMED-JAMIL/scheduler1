import { test, expect, APIRequestContext, Browser, Page } from '@playwright/test';

/**
 * Wave 4: the Cron frequency in the schedule editor, end to end, as workspace 2924's administrator.
 *
 *  - Job 2852 ("UI-CHECK cron daily 0300 B 0929", Inactive, Cron `0 3 * * *`) opens with Cron chosen and its
 *    expression in the field, and without Repeat every.
 *  - An expression Core refuses (`* * * * * *`: seconds are not 0) is refused on Save, and Core's sentence shows under
 *    the field. The refusal writes nothing; the editor is then left with Cancel. Nothing else is saved, and the job
 *    is never activated.
 *
 * Needs Core with the Cron frequency (process 6f9261e) behind :9098 and a console at E2E_BASE_URL that has it (e.g.
 * `ng serve --port 4419`). Sign-in, either:
 *   E2E_TENANT_ADMIN_TOKEN                          a TENANT_ADMIN access token (e.g. from
 *                                                   etl-platform/scripts/mint-test-token.sh 4537 900), or
 *   E2E_TENANT_ADMIN / E2E_TENANT_ADMIN_PASSWORD    a TENANT_ADMIN's credentials
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';
const token = process.env['E2E_TENANT_ADMIN_TOKEN'];
const admin = { username: process.env['E2E_TENANT_ADMIN'], password: process.env['E2E_TENANT_ADMIN_PASSWORD'] };

const CRON_JOB = Number(process.env['E2E_CRON_JOB'] ?? 2852);

interface Session { data: Record<string, unknown>; token: string; }

async function session(request: APIRequestContext): Promise<Session> {
  if (token) {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    const pages = await (await request.get(`${api}/pageAccess.json/mine`, { headers: { Authorization: `Bearer ${token}` } })).json();
    return { token, data: { username: claims.sub, fullName: claims.sub, userRole: claims.userRole, appUserId: claims.appUserId,
      tenantId: claims.tenantId, accessToken: token, refreshToken: '', pageKeys: pages?.data?.pageKeys } };
  }
  const answer = await request.post(`${api}/auth.json/login`, { data: admin, failOnStatusCode: false });
  const body = await answer.json();
  expect(body.status, `sign-in for ${admin.username}`).toBe('SUCCESS');
  return { data: body.data, token: body.data.accessToken };
}

async function pageAs(browser: Browser, s: Session): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(user => window.localStorage.setItem('etl_auth_user', JSON.stringify(user)), s.data);
  return page;
}

test.describe('Schedules: Cron', () => {
  test.skip(!token && (!admin.username || !admin.password), 'Set E2E_TENANT_ADMIN_TOKEN, or E2E_TENANT_ADMIN(_PASSWORD), to run this.');

  let s: Session;
  let before: Record<string, unknown>;
  const detail = async (request: APIRequestContext) => (await (await request.get(
    `${api}/sourceJob.json/fetchSourceJobDetailWithSourceJobId?jobId=${CRON_JOB}`,
    { headers: { Authorization: `Bearer ${s.token}` } })).json()).data;

  test.beforeAll(async ({ request }) => {
    s = await session(request);
    before = await detail(request);
    // The fixture must be what the spec says it is, and it is never activated here.
    expect(before?.['jobStatus'], `job ${CRON_JOB} is Inactive`).toBe('Inactive');
    expect((before?.['scheduler'] as Record<string, unknown>)?.['frequency']).toBe('Cron');
  });

  test('a Cron job opens on its expression; one Core refuses shows its reason under the field', async ({ browser, request }) => {
    const page = await pageAs(browser, s);
    await page.goto(`/pipelines/schedules/${CRON_JOB}/edit`);
    await expect(page.locator('#frequency')).toHaveValue('Cron');
    const field = page.locator('#cronExpression');
    await expect(field).toHaveValue('0 3 * * *');
    await expect(page.locator('#interval')).toHaveCount(0);
    await expect(page.getByText('03:00 every day')).toBeVisible();

    await field.fill('* * * * * *');
    const saved = page.waitForResponse(r => r.url().includes('/sourceJob.json/updateSourceJob'));
    await page.getByRole('button', { name: 'Save changes' }).click();
    await saved;
    const note = page.locator('#cronExpression').locator('xpath=ancestor::app-field[1]');
    await expect(note).toContainText('at most once a minute');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL(new RegExp(`/pipelines/schedules/${CRON_JOB}/edit$`));

    await page.getByRole('link', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(/\/pipelines\/schedules$/);
    await page.context().close();

    // The refusal wrote nothing.
    const after = await detail(request);
    expect(after['jobStatus']).toBe('Inactive');
    expect((after['scheduler'] as Record<string, unknown>)['cronExpression']).toBe('0 3 * * *');
  });
});
