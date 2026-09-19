import { test, expect, APIRequestContext, Browser, Page } from '@playwright/test';

/**
 * Cost & usage, end to end: a tenant admin uploads a file of a known size and deletes it, and
 * the same month's page carries the delete -- as an operation, as bytes, and in the drill-down
 * under the object's own name with the person who did it.
 *
 * Needs a running metering service (etl_meter) behind the console, and:
 *   E2E_TENANT_ADMIN / E2E_TENANT_ADMIN_PASSWORD   a TENANT_ADMIN with a bucket of their own
 *   E2E_BUCKET                                     that bucket's alias (default: the first one listed)
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';
const admin = { username: process.env['E2E_TENANT_ADMIN'], password: process.env['E2E_TENANT_ADMIN_PASSWORD'] };

interface Session { data: Record<string, any>; token: string; }

async function signIn(request: APIRequestContext, username: string, password: string): Promise<Session> {
  const answer = await request.post(`${api}/auth.json/login`, { data: { username, password }, failOnStatusCode: false });
  const body = await answer.json();
  expect(body.status, `sign-in for ${username}`).toBe('SUCCESS');
  return { data: body.data, token: body.data.accessToken };
}

async function pageAs(browser: Browser, session: Session): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(user => window.localStorage.setItem('etl_auth_user', JSON.stringify(user)), session.data);
  return page;
}

test.describe('cost & usage', () => {
  test.skip(!admin.username || !admin.password, 'Set E2E_TENANT_ADMIN(_PASSWORD) to run this.');

  test('a delete is counted, priced, and named on the page', async ({ browser, request }) => {
    test.setTimeout(120_000);
    const session = await signIn(request, admin.username!, admin.password!);
    const auth = { Authorization: `Bearer ${session.token}` };

    const health = await (await request.get(`${api}/billing.json/health`, { headers: auth })).json();
    test.skip(health.status !== 'SUCCESS' || health.data?.status !== 'ok', 'The metering service is not reachable from the console.');

    const buckets = await (await request.get(`${api}/storage.json/buckets`, { headers: auth })).json();
    const bucket = process.env['E2E_BUCKET'] ?? buckets.data?.[0]?.bucket;
    expect(bucket, 'a bucket to work in').toBeTruthy();

    // A file of a known size, uploaded then deleted through the same API the browser uses.
    const size = 3 * 4096;
    const name = `e2e-billing-${Date.now().toString(36)}.txt`;
    const upload = await request.post(`${api}/storage.json/uploadObject`, { headers: auth, multipart: {
      bucket, prefix: 'e2e/', file: { name, mimeType: 'text/plain', buffer: Buffer.alloc(size, 'E') },
    } });
    expect((await upload.json()).status).toBe('SUCCESS');
    const gone = await request.delete(`${api}/storage.json/deleteObject?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent('e2e/' + name)}`, { headers: auth });
    expect((await gone.json()).status).toBe('SUCCESS');

    // The console batches its reports; give them a moment, then price them.
    await new Promise(resolve => setTimeout(resolve, 4000));
    await request.post(`${api}/billing.json/refresh`, { headers: auth });

    const page = await pageAs(browser, session);
    await page.goto('/administration/billing');
    await expect(page.getByRole('heading', { name: 'Cost & usage' })).toBeVisible();
    await expect(page.getByText('Priced with rate card')).toBeVisible();

    // The delete is on the page as a line...
    const deletedLine = page.getByRole('row').filter({ hasText: 'Bytes deleted (data churn)' });
    await expect(deletedLine).toBeVisible();
    // ...and behind the line, the object by name and the person who deleted it.
    await deletedLine.click();
    // The nested table's own row, not the wrapper row that holds the nested table.
    const detail = page.getByRole('row', { name: new RegExp(`^[\\w./-]*${name} `) });
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('12 KB');
    await expect(detail).toContainText(String(session.data['fullName'] ?? session.data['username']));

    // The tiles agree with the lines.
    await expect(page.getByText('Data deleted')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Storage deletes' })).toBeVisible();
  });
});
