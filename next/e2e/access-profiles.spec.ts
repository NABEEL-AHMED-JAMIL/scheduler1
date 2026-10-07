import { test, expect, APIRequestContext } from '@playwright/test';
import { api, authOf, canSignIn, NEEDS, pageAs, Session, sessionFor, sessionOf, signInWithPassword, tokenFor } from './support/session';

/**
 * Access profiles, end to end: a tenant administrator makes a profile and puts a person on it, and that
 * person's console shrinks to match -- menu, direct URL, and the API behind it.
 *
 * Needs two people in one workspace (support/session.ts): Riverside Health's administrator (role admin) and its
 * viewer (role viewer, a TENANT_USER whom no other spec signs in as), or both by password.
 *
 * Leaves the workspace as it found it: the person goes back on the profile they had WITH THE EXCEPTIONS THEY HAD
 * (any are cleared for the test, which asserts the profile's pages alone, and put back afterwards), and the profile
 * made here is deleted. The "Request access" it sends leaves a notification for the administrator.
 */

const PROFILE = `E2E Reviewer ${Date.now().toString(36)}`;

/** The member signed in afresh: a new password sign-in, or the token's session re-read (its pages are the server's). */
async function memberNow(request: APIRequestContext): Promise<Session> {
  const token = tokenFor('viewer', { newSignIn: true });
  if (token) return sessionOf(request, token);
  return signInWithPassword(request, process.env['E2E_TENANT_VIEWER']!, process.env['E2E_TENANT_VIEWER_PASSWORD']!);
}

interface PersonAccess { appUserId: number; username: string; allowedExceptions: string[]; withheldExceptions: string[] }

test.describe('access profiles', () => {
  test.skip(!canSignIn('admin') || !canSignIn('viewer'), `${NEEDS.admin}; ${NEEDS.viewer}`);

  let adminSession: Session;
  let member: { username: string };
  let memberRow: Record<string, any>;
  let before: PersonAccess | undefined;
  let createdProfileId: number | null = null;

  test.beforeAll(async ({ request }) => {
    adminSession = await sessionFor(request, 'admin');
    const self = await memberNow(request);
    member = { username: self.username };
    const users = await request.get(`${api}/appUser.json/listUsers`, { headers: authOf(adminSession) });
    memberRow = (await users.json()).data.find((u: any) => u.appUserId === self.appUserId);
    expect(memberRow, `${member.username} is in the admin's workspace`).toBeTruthy();
    // What the person holds besides their profile, so it can be put back; then none, so the test sees the profile alone.
    const people = await (await request.get(`${api}/pageAccess.json/listPeople`, { headers: authOf(adminSession) })).json();
    before = people.data.find((p: PersonAccess) => p.appUserId === self.appUserId);
    await request.delete(`${api}/pageAccess.json/clearPageAccess?appUserId=${memberRow.appUserId}`, { headers: authOf(adminSession) });
  });

  test.afterAll(async ({ request }) => {
    if (!adminSession || !memberRow) return;
    const headers = authOf(adminSession);
    // Put the person back on whatever they had -- profile, then each exception -- and then the profile can go.
    const id = memberRow.appUserId;
    await request.put(`${api}/pageAccess.json/assignProfile`, { headers,
      params: memberRow.pageAccessProfileId ? { appUserId: id, pageAccessProfileId: memberRow.pageAccessProfileId } : { appUserId: id } });
    await request.delete(`${api}/pageAccess.json/clearPageAccess?appUserId=${id}`, { headers });
    for (const pageKey of before?.allowedExceptions ?? []) {
      await request.put(`${api}/pageAccess.json/setPageAccess`, { headers, params: { appUserId: id, pageKey, allowed: true } });
    }
    for (const pageKey of before?.withheldExceptions ?? []) {
      await request.put(`${api}/pageAccess.json/setPageAccess`, { headers, params: { appUserId: id, pageKey, allowed: false } });
    }
    const after = (await (await request.get(`${api}/pageAccess.json/listPeople`, { headers })).json()).data
      .find((p: PersonAccess) => p.appUserId === id);
    expect([...after.allowedExceptions].sort(), 'the member\'s exceptions are back').toEqual([...(before?.allowedExceptions ?? [])].sort());
    if (createdProfileId) {
      await request.delete(`${api}/pageAccess.json/deleteProfile?pageAccessProfileId=${createdProfileId}`, { headers });
    }
  });

  test('an admin makes a profile, assigns it, and the person\'s console follows', async ({ browser, request }) => {
    // --- the admin, in the browser: create a Reports-only profile
    const adminPage = await pageAs(browser, adminSession);
    await adminPage.goto('/administration/access-profiles');
    await expect(adminPage.getByRole('heading', { name: 'Access profiles' })).toBeVisible();
    // The dialog takes the page catalogue the screen fetched; opened before it lands, it lists "0 of 0" pages.
    await expect(adminPage.locator('app-stat-tile', { hasText: 'can be granted or withheld' })).toContainText(/Pages\s*[1-9]/);
    await adminPage.getByTestId('new-profile').click();
    await adminPage.getByLabel('Profile name').fill(PROFILE);
    await adminPage.getByLabel('Description').fill('Made by the end-to-end test.');
    await adminPage.locator('input[data-page="reports"]').check();
    await adminPage.getByRole('button', { name: 'Create' }).click();
    const card = adminPage.locator(`[data-profile="${PROFILE}"]`);
    await expect(card).toBeVisible();
    await expect(card.getByText('Run analytics', { exact: true })).toBeVisible();   // the reports page's name since MIG-246
    await expect(card.getByText('No one on it yet')).toBeVisible();

    const listed = await request.get(`${api}/pageAccess.json/listProfiles`, { headers: authOf(adminSession) });
    const created = (await listed.json()).data.find((p: any) => p.profileName === PROFILE);
    expect(created).toBeTruthy();
    createdProfileId = created.pageAccessProfileId;

    // --- the admin, in the browser: put the person on it from the user dialog
    await adminPage.goto('/administration/users');
    const row = adminPage.locator('tr', { hasText: member.username }).first();
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
    const memberSession = await memberNow(request);
    expect(memberSession.data['mustChangePassword'],
      `${member.username} still owes a password change; the console would hold them on /profile. Use an account with a settled password.`).not.toBe(true);
    expect(memberSession.data['pageAccessProfileName']).toBe(PROFILE);
    expect(memberSession.data['pageKeys']).toEqual(['reports']);

    const memberPage = await pageAs(browser, memberSession);
    await memberPage.goto('/dashboard');
    const nav = memberPage.locator('nav, header').first();
    // MIG-246: Operations is Pipelines, Tools and Object Browser are Documents, Assistants is AI.
    await expect(nav.getByRole('button', { name: 'Pipelines', exact: true })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Documents', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: 'AI', exact: true })).toHaveCount(0);

    // A direct URL to a withheld page lands on the access page, naming it, with a way to ask.
    await memberPage.goto('/objects/analytics');
    await expect(memberPage).toHaveURL(/\/unauthorized\?page=analytics/);
    await expect(memberPage.getByRole('heading', { name: /Analytics Studio isn't part of your access/ })).toBeVisible();
    await memberPage.getByRole('button', { name: 'Request access' }).click();
    await expect(memberPage.getByRole('button', { name: 'Asked' })).toBeVisible();

    // The page they do hold opens -- at its old address too (MIG-246 redirect).
    await memberPage.goto('/operations/reports');
    await expect(memberPage).toHaveURL(/\/pipelines\/run-analytics$/);

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
    const afterTick = await memberNow(request);
    expect(afterTick.data['pageKeys']).toEqual(['reports', 'analytics']);
    const allowed = await request.get(`${api}/analytics.json/listQueries`, {
      headers: { Authorization: `Bearer ${afterTick.token}` }, failOnStatusCode: false });
    expect(allowed.status()).not.toBe(403);

    // Reset puts them back on the profile alone.
    await gridPage.locator(`[data-reset="${member.username}"]`).click();
    await expect(box).toHaveAttribute('data-open', 'false');
    await expect(gridPage.locator(`[data-reset="${member.username}"]`)).toHaveCount(0);
    const afterReset = await memberNow(request);
    expect(afterReset.data['pageKeys']).toEqual(['reports']);
    await gridPage.context().close();

    // The admin heard the request.
    const bell = await request.get(`${api}/notification.json/list?unreadOnly=true&page=0&limit=5`,
      { headers: authOf(adminSession) });
    const titles = (await bell.json()).data.map((n: any) => n.title);
    expect(titles).toContain('Page access requested');
  });
});
