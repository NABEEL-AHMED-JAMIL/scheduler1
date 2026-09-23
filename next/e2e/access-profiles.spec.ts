import { test, expect, APIRequestContext, Browser, Page } from '@playwright/test';

/**
 * Access profiles, end to end: a tenant administrator makes a profile and puts a person on it, and that
 * person's console shrinks to match -- menu, direct URL, and the API behind it.
 *
 * Needs two real accounts in one workspace, given through the environment so no password lives
 * here:
 *
 *   E2E_TENANT_ADMIN / E2E_TENANT_ADMIN_PASSWORD   a TENANT_ADMIN
 *   E2E_TENANT_USER  / E2E_TENANT_USER_PASSWORD    a TENANT_USER in the same workspace
 *
 * Skips without them. Leaves the workspace as it found it: the person goes back on the profile
 * they had, and the profile made here is deleted.
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';
const admin = { username: process.env['E2E_TENANT_ADMIN'], password: process.env['E2E_TENANT_ADMIN_PASSWORD'] };
const member = { username: process.env['E2E_TENANT_USER'], password: process.env['E2E_TENANT_USER_PASSWORD'] };

const PROFILE = `E2E Reviewer ${Date.now().toString(36)}`;

interface Session { data: Record<string, unknown>; token: string; appUserId: number; }

async function signIn(request: APIRequestContext, username: string, password: string): Promise<Session> {
  const answer = await request.post(`${api}/auth.json/login`, { data: { username, password }, failOnStatusCode: false });
  const body = await answer.json();
  expect(body.status, `sign-in for ${username}`).toBe('SUCCESS');
  return { data: body.data, token: body.data.accessToken, appUserId: body.data.appUserId };
}

async function pageAs(browser: Browser, session: Session): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(user => window.localStorage.setItem('etl_auth_user', JSON.stringify(user)), session.data);
  return page;
}

test.describe('access profiles', () => {
  test.skip(!admin.username || !admin.password || !member.username || !member.password,
    'Set E2E_TENANT_ADMIN(_PASSWORD) and E2E_TENANT_USER(_PASSWORD) to run this.');

  let adminSession: Session;
  let memberRow: Record<string, any>;
  let createdProfileId: number | null = null;

  test.beforeAll(async ({ request }) => {
    adminSession = await signIn(request, admin.username!, admin.password!);
    const users = await request.get(`${api}/appUser.json/listUsers`, { headers: { Authorization: `Bearer ${adminSession.token}` } });
    memberRow = (await users.json()).data.find((u: any) => u.username === member.username);
    expect(memberRow, `${member.username} is in the admin's workspace`).toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    if (!adminSession) return;
    const headers = { Authorization: `Bearer ${adminSession.token}` };
    // Put the person back on whatever they had, then the profile can go.
    await request.delete(`${api}/pageAccess.json/clearPageAccess?appUserId=${memberRow.appUserId}`, { headers });
    await request.put(`${api}/appUser.json/updateUser`, { headers, data: { ...memberRow, pageAccessProfileId: memberRow.pageAccessProfileId ?? null } });
    if (createdProfileId) {
      await request.delete(`${api}/pageAccess.json/deleteProfile?pageAccessProfileId=${createdProfileId}`, { headers });
    }
  });

  test('an admin makes a profile, assigns it, and the person\'s console follows', async ({ browser, request }) => {
    // --- the admin, in the browser: create a Reports-only profile
    const adminPage = await pageAs(browser, adminSession);
    await adminPage.goto('/administration/access-profiles');
    await expect(adminPage.getByRole('heading', { name: 'Access profiles' })).toBeVisible();
    await adminPage.getByTestId('new-profile').click();
    await adminPage.getByLabel('Profile name').fill(PROFILE);
    await adminPage.getByLabel('Description').fill('Made by the end-to-end test.');
    await adminPage.locator('input[data-page="reports"]').check();
    await adminPage.getByRole('button', { name: 'Create' }).click();
    const card = adminPage.locator(`[data-profile="${PROFILE}"]`);
    await expect(card).toBeVisible();
    await expect(card.getByText('Reports', { exact: true })).toBeVisible();
    await expect(card.getByText('No one on it yet')).toBeVisible();

    const listed = await request.get(`${api}/pageAccess.json/listProfiles`, { headers: { Authorization: `Bearer ${adminSession.token}` } });
    const created = (await listed.json()).data.find((p: any) => p.profileName === PROFILE);
    expect(created).toBeTruthy();
    createdProfileId = created.pageAccessProfileId;

    // --- the admin, in the browser: put the person on it from the user dialog
    await adminPage.goto('/administration/users');
    const row = adminPage.locator('tr', { hasText: member.username! }).first();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Actions' }).click();
    await adminPage.getByRole('menuitem', { name: /Edit/ }).click();
    const picker = adminPage.locator('#pageAccessProfileId');
    await expect(picker).toBeVisible();
    await picker.selectOption({ label: PROFILE });
    await adminPage.getByRole('button', { name: 'Save changes' }).click();
    await expect(adminPage.getByText(/updated/i).first()).toBeVisible();
    await adminPage.context().close();

    // --- the person: sign in fresh, and the console has shrunk
    const memberSession = await signIn(request, member.username!, member.password!);
    expect(memberSession.data['mustChangePassword'],
      `${member.username} still owes a password change; the console would hold them on /profile. Use an account with a settled password.`).not.toBe(true);
    expect(memberSession.data['pageAccessProfileName']).toBe(PROFILE);
    expect(memberSession.data['pageKeys']).toEqual(['reports']);

    const memberPage = await pageAs(browser, memberSession);
    await memberPage.goto('/dashboard');
    const nav = memberPage.locator('nav, header').first();
    await expect(nav.getByText('Operations')).toBeVisible();
    await expect(nav.getByText('Tools')).toHaveCount(0);
    await expect(nav.getByText('Assistants')).toHaveCount(0);

    // A direct URL to a withheld page lands on the access page, naming it, with a way to ask.
    await memberPage.goto('/objects/analytics');
    await expect(memberPage).toHaveURL(/\/unauthorized\?page=analytics/);
    await expect(memberPage.getByRole('heading', { name: /Analytics Studio isn't part of your access/ })).toBeVisible();
    await memberPage.getByRole('button', { name: 'Request access' }).click();
    await expect(memberPage.getByRole('button', { name: 'Asked' })).toBeVisible();

    // The page they do hold opens.
    await memberPage.goto('/operations/reports');
    await expect(memberPage).toHaveURL(/\/reports$/);

    // And the server refuses the API behind a withheld page, whatever the browser shows.
    const refused = await request.get(`${api}/analytics.json/listQueries`, {
      headers: { Authorization: `Bearer ${memberSession.token}` }, failOnStatusCode: false });
    expect(refused.status()).toBe(403);
    expect((await refused.json()).message).toContain('not part of your access');
    await memberPage.context().close();

    // --- the admin ticks one box in the grid: an exception on top of the profile
    const gridPage = await pageAs(browser, adminSession);
    await gridPage.goto('/administration/access-profiles');
    await gridPage.getByTestId('view-people').click();
    const box = gridPage.locator(`[data-cell="${member.username}|analytics"]`);
    await expect(box).toHaveAttribute('data-open', 'false');
    await box.check();
    await expect(box).toHaveAttribute('data-exception', 'true');
    await expect(gridPage.locator(`[data-reset="${member.username}"]`)).toContainText('1 exception');

    // The person now opens it -- sign-in, route and API agree -- while the profile is unchanged.
    const afterTick = await signIn(request, member.username!, member.password!);
    expect(afterTick.data['pageKeys']).toEqual(['reports', 'analytics']);
    const allowed = await request.get(`${api}/analytics.json/listQueries`, {
      headers: { Authorization: `Bearer ${afterTick.token}` }, failOnStatusCode: false });
    expect(allowed.status()).not.toBe(403);

    // Reset puts them back on the profile alone.
    await gridPage.locator(`[data-reset="${member.username}"]`).click();
    await expect(box).toHaveAttribute('data-open', 'false');
    await expect(gridPage.locator(`[data-reset="${member.username}"]`)).toHaveCount(0);
    const afterReset = await signIn(request, member.username!, member.password!);
    expect(afterReset.data['pageKeys']).toEqual(['reports']);
    await gridPage.context().close();

    // The admin heard the request.
    const bell = await request.get(`${api}/notification.json/list?unreadOnly=true&page=0&limit=5`,
      { headers: { Authorization: `Bearer ${adminSession.token}` } });
    const titles = (await bell.json()).data.map((n: any) => n.title);
    expect(titles).toContain('Page access requested');
  });
});
