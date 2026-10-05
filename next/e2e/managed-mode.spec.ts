import { test, expect, Browser, Page, Route, TestInfo } from '@playwright/test';
import { join } from 'path';
import { LIVE, LIVE_IDS } from '../src/app/characterisation/fixtures.live';

/**
 * MIG-254: the tenant management mode in the console.
 *
 * The platform's only administrator is the owner's account, which these tests never act as: every platform-admin
 * and MANAGED scene runs on an unsigned session whose every API call is answered here (page.route), so nothing
 * leaves the browser. One live smoke runs as a SELF workspace's administrator (E2E_TENANT_ADMIN_TOKEN, minted with
 * etl-platform/scripts/mint-test-token.sh 4537) and shows the console exactly as before: no banner.
 */
const liveToken = process.env['E2E_TENANT_ADMIN_TOKEN'];
const REFUSAL = 'This workspace is managed by our team, so this cannot be changed here. Contact your account team to request the change.';

function token(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify({ sub: 'e2e@example.com', appUserId: 5001, exp: 4102444800, ...claims })).toString('base64url');
  return `header.${payload}.unsigned`;
}

function session(claims: Record<string, unknown>, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { username: 'e2e@example.com', fullName: 'Sam Staff', userRole: claims['userRole'], appUserId: 5001,
    tenantId: claims['tenantId'] ?? null, tenantName: claims['tenantId'] ? 'Claude Demo' : null,
    accessToken: token(claims), refreshToken: 'r-' + String(claims['userRole']), pageKeys: null, ...extra };
}

const PLATFORM = session({ userRole: 'PLATFORM_ADMIN' });
const MANAGED_ADMIN = session({ userRole: 'TENANT_ADMIN', tenantId: 2924, mgmt: 'MANAGED' }, { appUserId: 4537, fullName: 'Casey Admin' });
const SELF_ADMIN = session({ userRole: 'TENANT_ADMIN', tenantId: 2924, mgmt: 'SELF' }, { appUserId: 4537, fullName: 'Casey Admin' });
const STAFF_SESSION = session({ userRole: 'TENANT_ADMIN', tenantId: 2924, mgmt: 'MANAGED', msvc: true },
  { managedService: true, managementMode: 'MANAGED', refreshToken: 'r-managed' });

interface Seen { method: string; path: string; body: unknown; auth: string | null }
type Answer = unknown | ((seen: Seen) => { status: number; body: unknown });

/**
 * Answers every API call: `answers` by "METHOD /path" (a function may pick a status), then the characterisation's
 * captured answers, then an empty success. Returns what was asked, in order.
 */
async function fakeApi(page: Page, answers: Record<string, Answer> = {}): Promise<Seen[]> {
  const seen: Seen[] = [];
  await page.route(/:9098\//, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    // The job-events socket and anything else off the API: nothing reaches the gateway from a faked session.
    if (!url.pathname.includes('/api/v1/')) { await route.abort(); return; }
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    const key = `${req.method()} ${path}`;
    const params = [...url.searchParams.keys()].sort().map(k => `${k}=${url.searchParams.get(k)}`).join('&');
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    const one: Seen = { method: req.method(), path: params ? `${path}?${params}` : path, body, auth: req.headers()['authorization'] ?? null };
    seen.push(one);
    let status = 200;
    let reply: unknown;
    if (key in answers) {
      const a = answers[key];
      if (typeof a === 'function') ({ status, body: reply } = (a as (s: Seen) => { status: number; body: unknown })(one));
      else reply = a;
    } else if (params && `${key}?${params}` in LIVE) reply = LIVE[`${key}?${params}`];
    else if (key in LIVE) reply = LIVE[key];
    else reply = { status: 'SUCCESS', message: 'OK', data: [] };
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(reply),
      headers: { 'access-control-allow-origin': '*' } });
  });
  return seen;
}

async function pageAs(browser: Browser, user: Record<string, unknown> | null, width = 1440,
  held?: Record<string, unknown>): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.addInitScript(([u, h]) => {
    if (!sessionStorage.getItem('e2e-seeded')) {
      if (u) localStorage.setItem('etl_auth_user', JSON.stringify(u));
      if (h) localStorage.setItem('etl_platform_session', JSON.stringify(h));
      sessionStorage.setItem('e2e-seeded', '1');
    }
  }, [user, held ?? null] as const);
  return context.newPage();
}

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  const extra = process.env['E2E_SHOTS'];
  if (extra) await page.screenshot({ path: join(extra, `${name}.png`), fullPage: true });
}

test.describe('MIG-254: a MANAGED workspace, as its own administrator (faked)', () => {
  test('the build screens say who builds them and offer no writes', async ({ browser }, info) => {
    const page = await pageAs(browser, MANAGED_ADMIN);
    await fakeApi(page);
    await page.goto('/pipelines');
    await expect(page.getByText('Managed by our team')).toBeVisible();
    await expect(page.getByText("Our team builds and changes this workspace's pipelines, so they are read-only here.")).toBeVisible();
    await expect(page.getByRole('link', { name: 'New pipeline' })).toHaveCount(0);
    await shot(page, info, 'managed-pipelines');
    await page.goto('/pipelines/schedules');
    await expect(page.getByText("this workspace's schedules, so they are read-only here")).toBeVisible();
    await expect(page.getByRole('link', { name: 'New schedule' })).toHaveCount(0);
    await page.goto(`/ai/prompts/${LIVE_IDS.promptId}/edit`);
    await expect(page.getByText("this workspace's prompts, so they are read-only here")).toBeVisible();
    await expect(page.getByRole('button', { name: /Save & activate/ })).toBeDisabled();
    await page.close();
  });

  // Owner 2026-09-29: running is not building (Run now / Run with stay); Queue, Kafka and Task Registry are build screens.
  test('a managed customer still runs a schedule; Queue, Kafka and Task Registry are read-only', async ({ browser }, info) => {
    const page = await pageAs(browser, MANAGED_ADMIN);
    await fakeApi(page);
    await page.goto('/pipelines/schedules');
    await expect(page.getByText('You can still run them.')).toBeVisible();
    await page.getByRole('button', { name: /^Actions for / }).first().click();
    await expect(page.getByRole('menuitem', { name: 'Run now' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Run with/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Skip next run' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Duplicate' })).toHaveCount(0);
    await shot(page, info, 'managed-schedule-menu');
    await page.keyboard.press('Escape');
    await page.goto('/pipelines/queue');
    await expect(page.getByText('You can still see every run and its logs.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Actions for run #/ })).toHaveCount(0);
    await page.goto('/configuration/kafka');
    await expect(page.getByText("this workspace's Kafka connections and topics, so they are read-only here")).toBeVisible();
    await expect(page.getByRole('button', { name: 'New connection' })).toHaveCount(0);
    await page.goto('/configuration/task-registry');
    await expect(page.getByText("this workspace's pipelines and tasks, so they are read-only here")).toBeVisible();
    await expect(page.getByRole('button', { name: 'New pipeline' })).toHaveCount(0);
    await shot(page, info, 'managed-task-registry');
    await page.close();
  });

  test('Administration offers our team\'s activity, and it lists what they did', async ({ browser }) => {
    const page = await pageAs(browser, MANAGED_ADMIN);
    const seen = await fakeApi(page, { 'GET /managedService.json/actions': { status: 'SUCCESS', message: '', paging: { nextBeforeId: null },
      data: [{ id: 42, tenantId: 2924, appUserId: 5001, fullName: 'Sam Staff', username: 'staff@example.com', service: 'process',
        method: 'POST', path: '/sourceTask.json/updateSourceTask', target: 'sourceTaskId=1854', builderAction: true, createdAt: '2026-09-28 10:05:00' }] } });
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Administration' }).click();
    await page.getByRole('link', { name: /Our team's activity/ }).click();
    await expect(page.getByRole('heading', { name: "Our team's activity" })).toBeVisible();
    // Read as a person reads it (UI review U6); the raw method and path are on the row's tooltip.
    await expect(page.getByText('Source task › Update source task')).toBeVisible();
    expect(seen.filter(s => s.path.startsWith('/managedService.json/actions')).map(s => s.path)).toEqual(['/managedService.json/actions?limit=50']);
    await page.close();
  });

  test('a write the server refuses shows its words verbatim', async ({ browser }) => {
    // The token still says SELF (issued before a switch), the server already knows better.
    const page = await pageAs(browser, SELF_ADMIN);
    await fakeApi(page, { 'POST /aiPrompt.json/save': () => ({ status: 403, body: { status: 'ERROR', message: REFUSAL } }) });
    await page.goto(`/ai/prompts/${LIVE_IDS.promptId}/edit`);
    await page.getByRole('button', { name: /Save & activate/ }).click();
    await expect(page.getByText(REFUSAL).first()).toBeVisible();
    await page.close();
  });
});

test.describe('MIG-254: a platform administrator (faked; the owner\'s account is never used)', () => {
  const TENANTS = { status: 'SUCCESS', message: '', data: [
    { tenantId: 2924, tenantName: 'Claude Demo', tenantCode: 'DEMO', status: 'Active', managementMode: 'SELF', userCount: 3 },
    { tenantId: 3001, tenantName: 'Workspace B', tenantCode: 'WSB', status: 'Active', managementMode: 'MANAGED', userCount: 1 }] };

  test('Tenants: a Mode column, and switching asks first and says who is signed out', async ({ browser }, info) => {
    const page = await pageAs(browser, PLATFORM);
    const seen = await fakeApi(page, { 'GET /tenant.json/listTenants': TENANTS,
      'PUT /tenant.json/changeManagementMode': { status: 'SUCCESS', message: 'Tenant "Claude Demo" is now MANAGED. Its people sign in again to continue.' } });
    await page.goto('/administration/tenants');
    await expect(page.getByText('Self-managed').first()).toBeVisible();
    await page.getByRole('button', { name: 'Make managed' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Make Claude Demo managed by our team?')).toBeVisible();
    await expect(dialog.getByText(/Everyone in Claude Demo is signed out now/)).toBeVisible();
    await shot(page, info, 'tenants-mode-confirm');
    await dialog.getByRole('button', { name: 'Switch and sign out' }).click();
    await expect(page.getByText('Tenant "Claude Demo" is now MANAGED.', { exact: false })).toBeVisible();
    expect(seen.find(s => s.method === 'PUT')?.body).toEqual({ tenantId: 2924, managementMode: 'MANAGED' });
    await page.close();
  });

  test('Managed service: grants, Grant and Revoke', async ({ browser }, info) => {
    const page = await pageAs(browser, PLATFORM);
    const seen = await fakeApi(page, {
      'GET /tenant.json/listTenants': TENANTS,
      'GET /appUser.json/listUsers': { status: 'SUCCESS', message: '', data: [
        { appUserId: 5001, username: 'staff@example.com', fullName: 'Sam Staff', userRole: 'PLATFORM_ADMIN', status: 'Active', tenantId: null }] },
      'GET /managedService.json/listGrants': { status: 'SUCCESS', message: '', data: [{ grantId: 11, tenantId: 3001, tenantName: 'Workspace B',
        managementMode: 'MANAGED', appUserId: 5001, fullName: 'Sam Staff', username: 'staff@example.com', grantedAt: '2026-09-28 10:00:00', revokedAt: null }] },
      'POST /managedService.json/grant': { status: 'SUCCESS', message: 'Granted.' },
      'POST /managedService.json/revoke': { status: 'SUCCESS', message: 'Revoked. The staff member signs in again.' },
    });
    await page.goto('/administration/managed-service');
    await expect(page.getByRole('cell', { name: /Sam Staff/ }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Grant', exact: true }).click();
    const grant = page.getByRole('dialog');
    await grant.getByLabel('Staff member').selectOption({ label: 'Sam Staff (staff@example.com)' });
    await grant.getByLabel('Workspace').selectOption({ label: 'Claude Demo' });
    await shot(page, info, 'managed-service-grant');
    await grant.getByRole('button', { name: 'Grant', exact: true }).click();
    await expect(page.getByText('Granted.')).toBeVisible();
    expect(seen.find(s => s.path === '/managedService.json/grant')?.body).toEqual({ tenantId: 2924, appUserId: 5001 });
    await page.getByRole('button', { name: 'Revoke Sam Staff in Workspace B' }).click();
    const confirm = page.getByRole('dialog');
    await expect(confirm.getByText(/signed out everywhere/)).toBeVisible();
    await confirm.getByRole('button', { name: 'Revoke and sign out' }).click();
    await expect(page.getByText('Revoked. The staff member signs in again.')).toBeVisible();
    expect(seen.find(s => s.path === '/managedService.json/revoke')?.body).toEqual({ tenantId: 3001, appUserId: 5001 });
    await page.close();
  });

  test('Staff activity pages back', async ({ browser }) => {
    const page = await pageAs(browser, PLATFORM);
    const row = (id: number) => ({ id, tenantId: 3001, tenantName: 'Workspace B', appUserId: 5001, fullName: 'Sam Staff', service: 'process',
      method: 'POST', path: `/sourceTask.json/change${id}`, builderAction: true, createdAt: '2026-09-28 10:05:00' });
    const seen = await fakeApi(page, { 'GET /managedService.json/actions': (s: Seen) => ({ status: 200, body: s.path.includes('beforeId')
      ? { status: 'SUCCESS', message: '', data: [row(40)], paging: { nextBeforeId: null } }
      : { status: 'SUCCESS', message: '', data: [row(42), row(41)], paging: { nextBeforeId: 41 } } }) });
    await page.goto('/administration/staff-activity');
    await expect(page.getByText('Source task › Change42')).toBeVisible();
    await page.getByRole('button', { name: 'Load older' }).click();
    await expect(page.getByText('Source task › Change40')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Load older' })).toHaveCount(0);
    expect(seen.map(s => s.path).filter(p => p.startsWith('/managedService.json/actions')))
      .toEqual(['/managedService.json/actions?limit=50', '/managedService.json/actions?beforeId=41&limit=50']);
    await page.close();
  });

  test('Work in a workspace: a managed session with its banner, and Exit back to the platform session', async ({ browser }, info) => {
    const page = await pageAs(browser, PLATFORM);
    const seen = await fakeApi(page, {
      'GET /managedService.json/myWorkspaces': { status: 'SUCCESS', message: '', data: [{ grantId: 11, tenantId: 2924, tenantName: 'Claude Demo',
        managementMode: 'MANAGED', appUserId: 5001, grantedAt: '2026-09-28 10:00:00' }] },
      'POST /managedService.json/openSession': { status: 'SUCCESS', message: 'Managed-service session opened.', data: STAFF_SESSION },
    });
    await page.goto('/administration/work-in-workspace');
    await page.getByRole('button', { name: 'Work in Claude Demo' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    const bar = page.locator('[data-managed-session]');
    await expect(bar).toContainText('Managed session: Claude Demo — every change is audited');
    await shot(page, info, 'managed-session-bar');
    // Our staff build in a MANAGED workspace: no customer banner, and the writes are there.
    await page.goto('/pipelines');
    await expect(bar).toBeVisible();
    await expect(page.getByText('Managed by our team')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'New pipeline' })).toBeVisible();
    await bar.getByRole('button', { name: 'Exit' }).click();
    await expect(page).toHaveURL(/\/administration\/work-in-workspace$/);
    await expect(bar).toHaveCount(0);
    const logout = seen.find(s => s.path === '/auth.json/logout');
    expect(logout?.auth).toBe(`Bearer ${STAFF_SESSION['accessToken']}`);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('etl_auth_user')!).accessToken)).toBe(PLATFORM['accessToken']);
    await page.close();
  });
});

test.describe('MIG-254: live smoke, a SELF workspace', () => {
  test.skip(!liveToken, 'E2E_TENANT_ADMIN_TOKEN is not set');

  test('4537 (SELF) sees no banner and builds as before', async ({ browser }) => {
    const claims = JSON.parse(Buffer.from(liveToken!.split('.')[1], 'base64url').toString('utf8'));
    const page = await pageAs(browser, { username: claims.sub, fullName: claims.sub, userRole: claims.userRole, appUserId: claims.appUserId,
      tenantId: claims.tenantId, accessToken: liveToken, refreshToken: '', pageKeys: null });
    expect(claims.mgmt ?? 'SELF').toBe('SELF');
    await page.goto('/pipelines');
    await expect(page.getByRole('heading', { name: 'Pipelines', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New pipeline' })).toBeVisible();
    await expect(page.getByText('Managed by our team')).toHaveCount(0);
    await expect(page.locator('[data-managed-session]')).toHaveCount(0);
    await page.close();
  });
});
