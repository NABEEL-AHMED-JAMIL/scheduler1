import { test, expect, Browser, Page } from '@playwright/test';
import { canSignIn, NEEDS, pageAs, Session, sessionFor } from './support/session';
import { hasFixtures, NEEDS_FIXTURES } from './support/fixtures';
import { LOCAL_BUILD_USE, useLocalBuild } from './support/local-build';

/**
 * Owner #25 and #28 (2026-10-19), on the console as Riverside Health's administrator: the developer portal from the
 * workspace's API clients (what each may call, a quick start, the reference and Identity's scopes agreeing) and from the
 * APIs it calls (each saved request with its last answer); an API client's history; the workflow designer's Call API step
 * picking a saved request. Reads only, except opening panels. It needs etl-platform's tests/call-api/call_api_check.py to
 * have run once (its "Call API check" collection, request and workflow); without them those two tests skip, saying so.
 */
test.use(LOCAL_BUILD_USE);

let s: Session;

async function open(browser: Browser): Promise<Page> {
  const page = await pageAs(browser, s, { viewport: { width: 1920, height: 1000 } });
  await useLocalBuild(page);
  return page;
}

test.describe('Call API and the developer portal (owner #25, #28)', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);
  test.beforeAll(async ({ request }) => { s = await sessionFor(request, 'admin'); });

  test('Your API clients: what a client may call, what it may not and why, a quick start, no scope disagreement', async ({ browser }) => {
    const page = await open(browser);
    await page.goto('/developers/portal/clients');
    await expect(page.locator('[data-client]').first()).toBeVisible();
    const clientId = await page.locator('[data-client]').first().getAttribute('data-client');
    await expect(page.locator('[data-quick-start]')).toContainText(`export CLIENT_ID="${clientId}"`);
    await expect(page.locator('[data-quick-start]')).toContainText('/v1/oauth/token');
    await expect(page.locator('[data-client-allowed] li').first()).toBeVisible();
    const denied = page.locator('[data-client-denied] li');
    if (await denied.count()) await expect(denied.first()).toContainText('needs');
    await expect(page.locator('[data-scope-disagreement]')).toHaveCount(0);
    // A link into the reference lands on that operation.
    await page.locator('[data-client-allowed] a').first().click();
    await expect(page).toHaveURL(/\/developers\/portal\/reference#op-/);
    await page.context().close();
  });

  test('APIs this workspace calls: each saved request, and its last answer on demand', async ({ browser }) => {
    const page = await open(browser);
    await page.goto('/developers/portal/connected');
    await page.locator('[data-collection], [data-developer-connected] section').first().waitFor();
    const request = page.locator('[data-request]').filter({ hasText: 'Create referral' }).first();
    test.skip(!(await request.count()), 'needs tests/call-api/call_api_check.py to have run once');
    await expect(request).toContainText('POST');
    await expect(request).toContainText('{{baseUrl}}/referrals');
    await request.getByRole('button', { name: 'Last answer' }).click();
    await expect(request.locator('[data-sample]')).toContainText(/HTTP \d{3}/);
    await page.context().close();
  });

  test('an API client\'s history slides over the right', async ({ browser }) => {
    const page = await open(browser);
    await page.goto('/developers/api-clients');
    await page.getByRole('button', { name: /Actions for/ }).first().click();
    await page.getByRole('menuitem', { name: 'History' }).click();
    const panel = page.locator('.side-panel-right');
    await expect(panel).toContainText('History');
    await expect(panel.locator('[data-client-history], p')).not.toHaveCount(0);
    await page.context().close();
  });

  test('the workflow designer\'s Call API step names its saved request and where the answer goes', async ({ browser }) => {
    const page = await open(browser);
    await page.goto('/workflows/designer?key=call-api-check');
    await page.getByRole('heading', { name: 'Approval workflows' }).waitFor();
    await page.waitForLoadState('networkidle');
    const node = page.getByText('Send the referral').first();
    test.skip(!(await node.count()), 'needs tests/call-api/call_api_check.py to have run once');
    // The first step is the one shown when a workflow opens.
    await expect(page.locator('#st-req')).toHaveValue(/POST · Call API check › Create referral/);
    await expect(page.locator('#st-save')).toHaveValue('referral');
    await expect(page.locator('[data-test="wf-api-variables"] input').first()).toBeVisible();
    await page.context().close();
  });
});
