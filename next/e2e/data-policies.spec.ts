import { test, expect, APIRequestContext, Browser, Page, TestInfo } from '@playwright/test';
import { hasToken, NEEDS, sessionFor, tokenFor } from './support/session';
import { lendPages } from './support/workspace';
import { hasFixtures, riverside } from './support/fixtures';
import { join } from 'path';

/**
 * MIG-254: Administration › Data policies, against ai-service's live policy (MIG-243) for Riverside Health.
 *
 * The administrator (role admin) edits Internal's retention to 7 days and saves; a reload shows it saved. The policy the
 * workspace had before the run is read first and put back afterwards, level by level. ai-service has no way to delete a
 * saved level, so a level that was an unsaved default is put back by SAVING its default values: the workspace's
 * effective policy is unchanged, but that level then reads "saved" (with the default's values).
 *
 * Needs ai-service behind :9098 and a console at E2E_BASE_URL with MIG-254. Sign-in through support/session.ts:
 *   admin                    Riverside's administrator
 *   user                     optional: Riverside's reviewer, a TENANT_USER whose profile does not hold Prompts
 *   E2E_SHOTS                optional: a folder the screenshots are also written to
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';

interface Level { sensitivity: string; modelRule: string; allowedModels: string[]; retentionDays: number | null;
  aiWriteTools: boolean; minFieldsWarning: boolean; saved: boolean; deliveryOptions?: unknown; }

async function sessionOf(request: APIRequestContext, token: string, extraPages: string[] = []): Promise<Record<string, unknown>> {
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  const pages = await (await request.get(`${api}/pageAccess.json/mine`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const pageKeys = pages?.data?.pageKeys == null ? null : [...pages.data.pageKeys, ...extraPages];
  return { username: claims.sub, fullName: claims.sub, userRole: claims.userRole, appUserId: claims.appUserId,
    tenantId: claims.tenantId, accessToken: token, refreshToken: '', pageKeys };
}

async function pageAs(browser: Browser, session: Record<string, unknown>): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(user => window.localStorage.setItem('etl_auth_user', JSON.stringify(user)), session);
  return page;
}

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  const extra = process.env['E2E_SHOTS'];
  if (extra) await page.screenshot({ path: join(extra, `${name}.png`), fullPage: true });
}

async function policy(request: APIRequestContext): Promise<Level[]> {
  const r = await (await request.get(`${api}/aiPrompt.json/dataPolicy`, { headers: { Authorization: `Bearer ${tokenFor('admin')}` } })).json();
  expect(r.status, r.message).toBe('SUCCESS');
  return r.data.levels as Level[];
}

/** What a level does, without whether it is saved or its stored-only delivery options. */
const effective = (l: Level) => ({ sensitivity: l.sensitivity, modelRule: l.modelRule, allowedModels: [...l.allowedModels].sort(),
  retentionDays: l.retentionDays, aiWriteTools: l.aiWriteTools, minFieldsWarning: l.minFieldsWarning });

test.describe.configure({ mode: 'serial' });

test.describe('MIG-254: Administration › Data policies', () => {
  test.skip(!hasToken('admin'), NEEDS.admin);
  let before: Level[] = [];

  test.beforeAll(async ({ request }) => { before = await policy(request); });

  /** Puts back every level that differs from what the workspace had; a level that was a default is saved as one. */
  test.afterAll(async ({ request }) => {
    if (!before.length) return;
    const now = await policy(request);
    const changed = before.filter(b => JSON.stringify(effective(b)) !== JSON.stringify(effective(now.find(n => n.sensitivity === b.sensitivity)!)));
    if (!changed.length) return;
    const levels = changed.map(effective);
    const r = await (await request.post(`${api}/aiPrompt.json/dataPolicy`, { headers: { Authorization: `Bearer ${tokenFor('admin')}` }, data: { levels } })).json();
    expect(r.status, r.message).toBe('SUCCESS');
    expect((await policy(request)).map(effective)).toEqual(before.map(effective));
  });

  test('shows the policy the workspace has -- the defaults when nothing is saved', async ({ browser, request }, info) => {
    const page = await pageAs(browser, await sessionOf(request, tokenFor('admin')!));
    await page.goto('/administration/data-policies');
    await expect(page.getByRole('heading', { name: 'Data policies', level: 1 })).toBeVisible();
    for (const name of ['Public', 'Internal', 'Sensitive']) await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
    if (before.every(l => !l.saved)) {
      await expect(page.locator('[data-state]')).toContainText('Not saved yet — these are the defaults');
      await expect(page.locator('[data-level="sensitive"] select[name="modelRule"]')).toHaveValue('local');
      await expect(page.locator('[data-level="public"] input[name="aiWriteTools"]')).toBeChecked();
      await expect(page.locator('[data-level="sensitive"] input[name="aiWriteTools"]')).not.toBeChecked();
    }
    const internal = before.find(l => l.sensitivity === 'internal')!;
    await expect(page.locator('[data-level="internal"] input[name="retention"]')).toHaveValue(internal.retentionDays == null ? '' : String(internal.retentionDays));
    await expect(page.getByRole('button', { name: 'Save policy' })).toBeDisabled();
    await shot(page, info, 'data-policies-before');
    await page.context().close();
  });

  test('saves Internal\'s retention as 7 days, and a reload shows it saved', async ({ browser, request }, info) => {
    test.skip(before.find(l => l.sensitivity === 'internal')?.retentionDays === 7, 'Internal already keeps 7 days');
    const page = await pageAs(browser, await sessionOf(request, tokenFor('admin')!));
    await page.goto('/administration/data-policies');
    const internal = page.locator('[data-level="internal"]');
    await internal.locator('input[name="retention"]').fill('7');
    await expect(page.locator('[data-dirty]')).toHaveText('1 level changed');
    const saved = page.waitForResponse(r => r.url().includes('/aiPrompt.json/dataPolicy') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save policy' }).click();
    // Only the changed level is sent; the service's own message is the toast.
    expect((await saved).request().postDataJSON().levels.map((l: Level) => l.sensitivity)).toEqual(['internal']);
    await expect(page.getByRole('status').filter({ hasText: 'Data policy saved (1 level(s)).' })).toBeVisible();
    await expect(internal.locator('.pill').first()).toHaveText('Saved');
    await page.reload();
    await expect(internal.locator('input[name="retention"]')).toHaveValue('7');
    await expect(internal.locator('.pill').first()).toHaveText('Saved');
    await expect(page.locator('[data-state]')).not.toContainText('Not saved yet');
    await shot(page, info, 'data-policies-saved');
    await page.context().close();
  });

  test('a member holding Prompts reads it and changes nothing; one without it is refused', async ({ browser, request }, info) => {
    test.skip(!hasToken('user') || !hasFixtures(), NEEDS.user);
    // The reviewer's profile does not hold Prompts: the page is lent to them for this test (the gateway checks it on the
    // read as well as the console), and their exceptions are put back exactly as they were before the refusal is checked.
    const admin = await sessionFor(request, 'admin');
    const giveBack = await lendPages(request, admin, riverside().reviewer, ['ai-prompts']);
    try {
      const reader = await pageAs(browser, await sessionOf(request, tokenFor('user', { newSignIn: true })!));
      await reader.goto('/administration/data-policies');
      await expect(reader.locator('[data-read-only]')).toContainText('Only a workspace administrator can change the data policy.');
      await expect(reader.locator('[data-level="internal"]')).toContainText('Keep run files');
      await expect(reader.locator('[data-level] select, [data-level] input')).toHaveCount(0);
      await expect(reader.getByRole('button', { name: 'Save policy' })).toHaveCount(0);
      await shot(reader, info, 'data-policies-member');
      await reader.context().close();
    } finally {
      await giveBack(request);
    }

    const refused = await pageAs(browser, await sessionOf(request, tokenFor('user', { newSignIn: true })!));
    await refused.goto('/administration/data-policies');
    await expect(refused).toHaveURL(/\/unauthorized\?page=ai-prompts/);
    await refused.context().close();
  });

  test('the AI Assistant names the policy it works under', async ({ browser, request }) => {
    const page = await pageAs(browser, await sessionOf(request, tokenFor('admin')!));
    await page.goto('/ai/assistant');
    const context = page.locator('[data-context]');
    await expect(context).not.toContainText('None configured');
    await expect(context.getByRole('link', { name: /Saved|Partly saved|Defaults \(not saved\)/ })).toHaveAttribute('href', '/administration/data-policies');
    await expect(page.locator('[data-policy] li')).toHaveCount(3);
    await page.context().close();
  });
});
