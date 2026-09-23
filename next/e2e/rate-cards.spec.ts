import { test, expect, APIRequestContext, Browser, Page } from '@playwright/test';

/**
 * Rate cards, end to end: the platform administrator saves a new version of the calculation through the
 * editor, the page lists it with what changed, a bill drafted before keeps its version, and a
 * fresh draft is priced with the new one. A tenant administrator never sees the page.
 *
 * Needs a running metering service (etl_meter) behind the console, and:
 *   E2E_PLATFORM_ADMIN / E2E_PLATFORM_ADMIN_PASSWORD   a PLATFORM_ADMIN
 *   E2E_TENANT_ADMIN / E2E_TENANT_ADMIN_PASSWORD       a TENANT_ADMIN, for the negative case
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

test.describe('rate cards', () => {
  test.skip(!platform.username || !platform.password, 'Set E2E_PLATFORM_ADMIN(_PASSWORD) to run this.');

  test('a new version is saved from the editor, listed, and prices only the bills that come after', async ({ browser, request }) => {
    test.setTimeout(120_000);
    const session = await signIn(request, platform.username!, platform.password!);
    const auth = { Authorization: `Bearer ${session.token}` };
    const health = await (await request.get(`${api}/billing.json/health`, { headers: auth })).json();
    test.skip(health.status !== 'SUCCESS' || health.data?.status !== 'ok', 'The metering service is not up behind this console.');

    const before = await (await request.get(`${api}/billing.json/rateCards`, { headers: auth })).json();
    const versionsBefore: number[] = before.data.cards.map((c: { version: number }) => c.version);
    const stamp = Date.now().toString(36);
    const name = `e2e ${stamp}: images at 0.02`;

    const page = await pageAs(browser, session);
    await page.goto('/billing/rates');
    await expect(page.getByRole('heading', { name: 'Rate cards' })).toBeVisible();
    await expect(page.getByText('Default card today')).toBeVisible();

    // The editor: a name, one price, one allowance, saved as a new default version from the 1st of next month.
    await page.getByRole('button', { name: 'New version', exact: true }).click();
    const panel = page.getByRole('dialog');
    await expect(panel.getByRole('heading', { name: /^New version from / })).toBeVisible();
    await panel.locator('#rcName').fill(name);
    await panel.locator('#rcNote').fill('Playwright: images described at 0.02, 10 free a month');
    await panel.getByLabel('Images described price').fill('0.02');
    await panel.getByLabel('Images described included').fill('10');
    await expect(panel.getByText('1 changed')).toBeVisible();
    await panel.getByRole('button', { name: 'Save version' }).click();
    await expect(page.getByText(new RegExp(`${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')} saved as v\\d+`))).toBeVisible();

    // Listed, selected, and the change named against its base.
    const after = await (await request.get(`${api}/billing.json/rateCards`, { headers: auth })).json();
    const saved = after.data.cards.find((c: { name: string }) => c.name === name);
    expect(saved, 'the saved version is listed by the API').toBeTruthy();
    expect(versionsBefore).not.toContain(saved.version);
    expect(saved.tenant_id).toBeNull();
    const images = saved.items.find((i: { meter: string }) => i.meter === 'ai.vision.images');
    expect(Number(images.unit_price)).toBe(0.02);
    expect(Number(images.included_quantity)).toBe(10);
    expect(saved.items.length).toBeGreaterThan(10);                     // everything else carried over
    await expect(page.getByRole('heading', { name: `${name} v${saved.version}` })).toBeVisible();
    await expect(page.getByText(/Changed from v\d+: Images described/)).toBeVisible();
    await expect(page.getByText('not yet in effect')).toBeVisible();   // dated the 1st of next month: the Scheduled tile counts it

    // A bill already issued keeps its version; the card in effect this month is unchanged (the new one starts next month).
    const invoices = await (await request.get(`${api}/billing.json/invoices`, { headers: auth })).json();
    const issued = (invoices.data as { status: string; rateCardVersion: number | null; number: string }[]).find(i => i.status !== 'draft' && i.rateCardVersion);
    if (issued) {
      const detail = await (await request.get(`${api}/billing.json/invoice?number=${issued.number}`, { headers: auth })).json();
      expect(detail.data.rateCardVersion).toBe(issued.rateCardVersion);
      expect(detail.data.rateCardVersion).not.toBe(saved.version);
    }
    const today = new Date().toISOString().slice(0, 10);
    const inEffect = await (await request.get(`${api}/billing.json/rateCard?day=${today}`, { headers: auth })).json();
    expect(inEffect.data.version).not.toBe(saved.version);
    const nextMonth = new Date(); nextMonth.setDate(1); nextMonth.setMonth(nextMonth.getMonth() + 1);
    const later = await (await request.get(`${api}/billing.json/rateCard?day=${nextMonth.toISOString().slice(0, 10)}`, { headers: auth })).json();
    expect(later.data.version).toBe(saved.version);
    await page.context().close();
  });

  test('a tenant administrator is kept off the page and cannot change the calculation', async ({ browser, request }) => {
    test.skip(!tenant.username || !tenant.password, 'Set E2E_TENANT_ADMIN(_PASSWORD) to run this.');
    const session = await signIn(request, tenant.username!, tenant.password!);
    const auth = { Authorization: `Bearer ${session.token}` };
    const refused = await (await request.put(`${api}/billing.json/rateCard`, { headers: auth, data: { name: 'x', effective_from: '2099-01-01', items: [] } })).json();
    expect(refused.status).toBe('ERROR');
    const list = await (await request.get(`${api}/billing.json/rateCards`, { headers: auth })).json();
    expect(list.status).toBe('ERROR');
    const page = await pageAs(browser, session);
    await page.goto('/billing/rates');
    await expect(page.getByRole('heading', { name: 'Rate cards' })).toHaveCount(0);
    await page.goto('/billing/usage');
    await expect(page.getByText(/Priced with/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'rate cards' })).toHaveCount(0);
    await page.context().close();
  });
});
