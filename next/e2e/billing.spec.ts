import { test, expect } from '@playwright/test';
import { api, authOf, canSignIn, NEEDS, pageAs, sessionFor } from './support/session';

/**
 * Cost & usage, end to end: a tenant administrator uploads a file of a known size and deletes it, and
 * the same month's page carries the delete -- as an operation, as bytes, and in the drill-down
 * under the object's own name with the person who did it.
 *
 * Needs a running metering service (etl_meter) behind the console, and a TENANT_ADMIN with a bucket of their own
 * (support/session.ts: E2E_TENANT_ADMIN_TOKEN, or E2E_TENANT_ADMIN(_PASSWORD)); E2E_BUCKET names that bucket's alias
 * (default: ui-review-s3 or worker-store when the workspace has one, else the first listed). The file it uploads is
 * deleted again by the test -- that delete is what is being measured.
 */


test.describe('cost & usage', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);

  test('a delete is counted, priced, and named on the page', async ({ browser, request }) => {
    test.setTimeout(120_000);
    const session = await sessionFor(request, 'admin');
    const auth = authOf(session);

    const health = await (await request.get(`${api}/billing.json/health`, { headers: auth })).json();
    test.skip(health.status !== 'SUCCESS' || health.data?.status !== 'ok', 'The metering service is not reachable from the console.');

    const buckets = await (await request.get(`${api}/storage.json/buckets`, { headers: auth })).json();
    // The workspace's test bucket when it has one: the first alias in the list is whatever sorts
    // first, and after a configuration test that is a connection made to fail on purpose.
    const listed: string[] = (buckets.data ?? []).map((b: { bucket: string }) => b.bucket);
    const bucket = process.env['E2E_BUCKET'] ?? ['ui-review-s3', 'worker-store'].find(b => listed.includes(b)) ?? listed[0];
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
    await page.goto('/billing/usage');
    await expect(page.getByRole('heading', { name: 'Cost & usage' })).toBeVisible();
    await expect(page.getByText(/Priced with/)).toBeVisible();

    // The delete is on the page as a line... A 12 KB delete costs less than a cent, and lines under a cent are folded
    // away behind one button now; unfold them.
    const tiny = page.locator('[data-tiny-toggle]');
    if (await tiny.count() && (await tiny.getAttribute('aria-pressed')) !== 'true') await tiny.click();
    const deletedLine = page.getByRole('row').filter({ hasText: 'Bytes deleted (data churn)' });
    await expect(deletedLine).toBeVisible();
    // ...and behind the line, the object by name and the person who deleted it.
    await deletedLine.click();
    // The nested table's own row, not the wrapper row that holds the nested table.
    const detail = page.getByRole('row', { name: new RegExp(`^[\\w./-]*${name} `) });
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('12 KB');
    await expect(detail).toContainText(String(session.fullName ?? session.data['fullName'] ?? session.username));

    // The tiles agree with the lines.
    await expect(page.getByText('Data deleted')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Storage deletes' })).toBeVisible();
  });
});
