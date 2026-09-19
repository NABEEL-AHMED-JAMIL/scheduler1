import { test, expect, APIRequestContext, Browser, Page } from '@playwright/test';

/**
 * Invoices and Billing documents as rail + pane: the address names a bill, the pane shows it
 * with the QR code of its number, and the document list reads a PDF in place.
 *
 *   E2E_PLATFORM_ADMIN / E2E_PLATFORM_ADMIN_PASSWORD   a PLATFORM_ADMIN
 *   E2E_TENANT_ADMIN / E2E_TENANT_ADMIN_PASSWORD       a TENANT_ADMIN with an issued invoice
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';
const platform = { username: process.env['E2E_PLATFORM_ADMIN'], password: process.env['E2E_PLATFORM_ADMIN_PASSWORD'] };
const tenant = { username: process.env['E2E_TENANT_ADMIN'], password: process.env['E2E_TENANT_ADMIN_PASSWORD'] };

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

test.describe('invoices as rail and pane', () => {
  test.skip(!tenant.username || !tenant.password, 'Set E2E_TENANT_ADMIN(_PASSWORD) to run this.');

  test('the address names the bill, the pane carries its QR code, and a document reads in place', async ({ browser, request }) => {
    const session = await signIn(request, tenant.username!, tenant.password!);
    const auth = { Authorization: `Bearer ${session.token}` };
    const list = await (await request.get(`${api}/billing.json/invoices`, { headers: auth })).json();
    const issued = (list.data as { number: string; status: string; documentKinds: string[] }[]).find(i => i.status !== 'draft' && i.documentKinds?.includes('invoice'));
    test.skip(!issued, 'No issued invoice for this workspace yet.');

    const page = await pageAs(browser, session);
    await page.goto('/billing/invoices');
    await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();
    await expect(page.getByRole('listbox', { name: 'Invoices' })).toBeVisible();
    // Deep link: the pane shows that bill, its number is the heading, its QR is an image that loaded.
    await page.goto(`/billing/invoices/${issued!.number}`);
    await expect(page.getByRole('heading', { name: issued!.number })).toBeVisible();
    const qr = page.getByAltText(`QR code: ${issued!.number}`);
    await expect(qr).toBeVisible();
    expect(await qr.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByRole('listbox', { name: 'Invoices' }).getByRole('option', { selected: true })).toContainText(issued!.number);
    await expect(page.getByRole('heading', { name: /^Lines/ })).toBeVisible();
    // A tenant admin sees the slip action, never Issue or Void.
    await expect(page.getByRole('button', { name: /Upload payment slip|Record payment|PDF/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Issue' })).toHaveCount(0);
    // Picking another row in the rail changes the address.
    const options = page.getByRole('listbox', { name: 'Invoices' }).getByRole('option');
    if (await options.count() > 1) {
      await options.nth(1).click();
      await expect(page).not.toHaveURL(new RegExp(issued!.number + '$'));
    }
    // The document opens in Billing documents, read in the console's own viewer.
    await page.goto(`/billing/invoices/${issued!.number}`);
    await page.getByTitle('Open in Billing documents').first().click();
    await expect(page.getByRole('heading', { name: 'Billing documents' })).toBeVisible();
    await expect(page.getByRole('listbox', { name: 'Documents' }).getByRole('option', { selected: true })).toContainText(issued!.number);
    await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 });   // pdf.js drew the page
    await page.context().close();
  });

  test('the platform admin drafts from the head and sees every workspace in the rail', async ({ browser, request }) => {
    test.skip(!platform.username || !platform.password, 'Set E2E_PLATFORM_ADMIN(_PASSWORD) to run this.');
    const session = await signIn(request, platform.username!, platform.password!);
    const page = await pageAs(browser, session);
    await page.goto('/billing/invoices');
    await expect(page.getByRole('button', { name: /Draft month/ })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Workspace' })).toBeVisible();
    await expect(page.getByText('Drafts')).toBeVisible();
    await page.context().close();
  });
});
