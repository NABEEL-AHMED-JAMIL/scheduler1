import { test, expect, APIRequestContext, Browser, Page, TestInfo } from '@playwright/test';
import { authOf, hasToken, NEEDS, pageAs, sessionFor, tokenFor } from './support/session';
import { bestEffort, deleteObject, getJson } from './support/workspace';
import { hasFixtures, NEEDS_FIXTURES, riverside } from './support/fixtures';
import { join } from 'path';

/**
 * MIG-239: Documents › Inbox, as Riverside Health's administrator, against the live storage-service. The inbox is the
 * rebuilt workspace's (support/fixtures.ts), on its storage connection; its settings are only read.
 *
 * Uploads only files that match no job trigger: the x-ray schedule starts on chest-xray-* images, so these send a small
 * E2E-inbox-<stamp>.json (which is kept, and listed, and deleted again when the describe ends) and E2E-evil.exe (which
 * the service refuses, so nothing is stored). The settings dialog is opened and cancelled; the test fails if the page
 * ever asks to configure or turn off the inbox.
 *
 * Needs storage-service behind :9098 and a console at E2E_BASE_URL with the inbox page. Sign-in through
 * support/session.ts (role admin); E2E_SHOTS optional: a folder the screenshots are also written to.
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';

async function signedIn(browser: Browser, request: APIRequestContext, width = 1440): Promise<Page> {
  return pageAs(browser, await sessionFor(request, 'admin'), { viewport: { width, height: width < 600 ? 844 : 900 } });
}

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  const extra = process.env['E2E_SHOTS'];
  if (extra) await page.screenshot({ path: join(extra, `${name}.png`), fullPage: true });
}

/** Every request that would change the inbox's settings. */
function settingsWrites(page: Page): string[] {
  const writes: string[] = [];
  page.on('request', req => {
    if (/storage\.json\/inbox(\/configure)?$/.test(new URL(req.url()).pathname) && req.method() !== 'GET' && req.method() !== 'OPTIONS') {
      writes.push(`${req.method()} ${req.url()}`);
    }
  });
  return writes;
}

test.describe('Inbox (live storage-service)', () => {
  test.skip(!hasToken('admin'), NEEDS.admin);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);
  const uploaded: string[] = [];
  /** The storage connection's name as the page prints it (storage.json/buckets' label). */
  let label = '';

  test.beforeAll(async ({ request }) => {
    const s = await sessionFor(request, 'admin');
    const buckets: { bucket: string; label?: string }[] = (await getJson(request, s, '/storage.json/buckets')).data ?? [];
    label = buckets.find(b => b.bucket === riverside().storageAlias)?.label ?? riverside().storageAlias;
  });

  test.afterAll(async ({ request }) => {
    if (!uploaded.length) return;
    const s = await sessionFor(request, 'admin');
    // The arrivals list is a log: it keeps naming a file after the file itself is deleted.
    const arrivals: { fileName: string; alias: string; key: string }[] = (await getJson(request, s, '/storage.json/inbox/files?limit=50')).data ?? [];
    for (const arrival of arrivals.filter(a => uploaded.includes(a.fileName))) {
      await bestEffort(`delete ${arrival.key}`, () => deleteObject(request, s, arrival.alias, arrival.key));
    }
  });

  test('shows the configured inbox, its limit and its arrivals', async ({ browser, request }, info) => {
    const page = await signedIn(browser, request);
    await page.goto('/documents/inbox');
    await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible();
    await expect(page.getByText(label).first()).toBeVisible();
    await expect(page.getByText(/Up to \d+ MB a file/).first()).toBeVisible();
    // The newest arrival the service reports, whatever put it there: a fixed name (live-customers.csv) fell off the
    // list once a soak run uploaded a file every five minutes, and the page is right to show the newest first.
    const newest = (await (await request.get(`${api}/storage.json/inbox/files?limit=1`,
      { headers: authOf(tokenFor('admin')!) })).json())?.data?.[0];
    expect(newest?.fileName, 'the inbox has at least one arrival').toBeTruthy();
    await expect(page.getByRole('table').getByText(newest.fileName).first()).toBeVisible();
    await shot(page, info, 'inbox-1440');
  });

  test('uploads a small JSON file and lists it', async ({ browser, request }, info) => {
    const page = await signedIn(browser, request);
    await page.goto('/documents/inbox');
    const name = `E2E-inbox-${Date.now()}.json`;
    uploaded.push(name);
    await page.locator('app-file-dropzone input[type=file]').setInputFiles({
      name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ check: 'inbox e2e', at: new Date().toISOString() })),
    });
    const row = page.getByRole('list', { name: 'Uploads' }).locator('li').filter({ hasText: name });
    await expect(row).toHaveAttribute('data-state', 'done');
    await expect(row.getByText('File uploaded to the inbox.')).toBeVisible();
    // exact: the list also shows each arrival's storage key, which ends in the file's name.
    await expect(page.getByRole('table').getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByRole('table').locator('tr').filter({ hasText: name }).getByText('You')).toBeVisible();
    await shot(page, info, 'inbox-uploaded');
  });

  test('shows the service\'s refusal for an executable, word for word', async ({ browser, request }, info) => {
    const page = await signedIn(browser, request);
    await page.goto('/documents/inbox');
    await page.locator('app-file-dropzone input[type=file]').setInputFiles({
      name: 'E2E-evil.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ not really a program'),
    });
    const row = page.getByRole('list', { name: 'Uploads' }).locator('li').filter({ hasText: 'E2E-evil.exe' });
    await expect(row).toHaveAttribute('data-state', 'refused');
    await expect(row.getByRole('alert')).toHaveText('\'E2E-evil.exe\': .exe files are not accepted in the inbox.');
    await expect(page.getByRole('table').getByText('E2E-evil.exe')).toHaveCount(0);
    await shot(page, info, 'inbox-refused');
  });

  test('the settings dialog opens, and Cancel changes nothing', async ({ browser, request }, info) => {
    const page = await signedIn(browser, request);
    const writes = settingsWrites(page);
    await page.goto('/documents/inbox');
    await page.getByRole('button', { name: 'Inbox settings' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Inbox settings' })).toBeVisible();
    await expect(dialog.getByLabel(/Storage connection/)).toHaveValue(riverside().storageAlias);
    await expect(dialog.getByRole('button', { name: 'Turn off' })).toBeVisible();
    await shot(page, info, 'inbox-settings');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(label).first()).toBeVisible();
    expect(writes).toEqual([]);
  });

  test('a phone stacks upload, settings and arrivals', async ({ browser, request }, info) => {
    const page = await signedIn(browser, request, 390);
    await page.goto('/documents/inbox');
    await expect(page.getByRole('heading', { name: 'Upload' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, info, 'inbox-390');
  });
});
