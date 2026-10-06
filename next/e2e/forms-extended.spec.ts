import { test, expect, APIRequestContext, Browser, Page } from '@playwright/test';

/**
 * MIG-277, live: a member (4597) fills in "MIG-277 visit check (synthetic)" (form 1001, made for this check): picks a
 * patient from the lookup, sees Antibiotic appear (and become required) when infection is Yes, adds table rows, uploads a
 * photo, draws a signature, and sends. It SUBMITS one submission and uploads two files, and leaves them.
 * Sign-in: E2E_TENANT_USER_TOKEN (mint-test-token.sh 4597 900).
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';
const token = process.env['E2E_TENANT_USER_TOKEN'];
const FORM = Number(process.env['E2E_EXTENDED_FORM'] ?? 1001);

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

test.describe('Forms: lookup, rules, table, file, signature (live)', () => {
  test.skip(!token, 'Set E2E_TENANT_USER_TOKEN to run this.');

  test('a member fills in every new field type and sends it', async ({ browser, request }) => {
    const page = await pageAs(browser, request);
    await page.goto(`/forms/${FORM}/fill`);
    await expect(page.getByRole('heading', { level: 1, name: 'MIG-277 visit check (synthetic)' })).toBeVisible();

    await page.locator('[data-field="patient"]').selectOption('SYN-001');
    await expect(page.locator('[data-field="antibiotic"]')).toHaveCount(0);
    await page.locator('[data-field="infected"]').getByLabel('Yes').check();
    await expect(page.locator('[data-field="antibiotic"]')).toBeVisible();

    // Sending now names the rule's field.
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Antibiotic is required.')).toBeVisible();
    await page.locator('[data-field="antibiotic"]').fill('Amoxicillin');

    await page.locator('[data-add-row]').click();
    await page.getByLabel('Drug, row 1').fill('Amoxicillin');
    await page.getByLabel('mg, row 1').fill('500');

    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC', 'base64');
    await page.locator('[data-field="photo"] input[type="file"]').setInputFiles({ name: 'heel.png', mimeType: 'image/png', buffer: png });
    await expect(page.locator('[data-field="photo"] [data-upload]')).toContainText('heel.png');

    const pad = page.locator('canvas.signature-pad');
    const box = (await pad.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + box.height / 2);
    await page.mouse.down();
    for (let x = 30; x < 260; x += 20) await page.mouse.move(box.x + x, box.y + box.height / 2 + (x % 40 ? 12 : -12));
    await page.mouse.up();
    await page.locator('[data-sign]').click();
    await expect(page.locator('[data-signed]')).toBeVisible();

    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('[data-submitted]')).toContainText('Submitted');
  });
});
