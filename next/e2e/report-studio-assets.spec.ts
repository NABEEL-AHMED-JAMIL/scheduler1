import { expect, test, Page } from '@playwright/test';
import { api, authOf, canSignIn, NEEDS, pageAs, Session, sessionFor } from './support/session';
import { hasFixtures, NEEDS_FIXTURES } from './support/fixtures';
import { png, stamp } from './support/report-studio';

/**
 * Report Studio's Assets & branding, live (MIG-406):
 *   - Riverside's administrator uploads "E2E wound diagram <stamp>" (a PNG generated here: coloured bands, never a
 *     photo); an image is approved on upload. A PDF renamed to .png is refused by its content, and nothing is kept.
 *   - A brand profile, "E2E wound clinic brand <stamp>": made, its colours edited; a low-contrast text colour fails the WCAG
 *     check (Publish locked here, and the server refuses to publish such a draft); fixed, saved, published as v1 and made
 *     the workspace default. The default is handed back to the profile that held it before, so Riverside's demo reports
 *     keep their look; the profile itself stays (the owner removes test data).
 */
const STAMP = stamp();
const IMAGE = `E2E wound diagram ${STAMP}`;
const PROFILE = `E2E wound clinic brand ${STAMP}`;

let admin: Session;
let previousDefault: string | null = null;
let profileId = '';

const view = (browser: import('@playwright/test').Browser, s: Session): Promise<Page> =>
  pageAs(browser, s, { viewport: { width: 1920, height: 1080 } });

/** Sets one of the profile's colours by its text box, as a person types it and leaves the box. */
async function colour(page: Page, label: 'Main colour' | 'Text' | 'Background', hex: string): Promise<void> {
  const box = page.getByRole('textbox', { name: label, exact: true });
  await box.fill(hex);
  await box.press('Tab');
}

test.describe('Report Studio: assets and brand profiles (live)', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  test.beforeAll(async ({ request }) => {
    admin = await sessionFor(request, 'admin');
    const profiles = (await (await request.get(`${api}/reportAsset.json/brandProfiles`, { headers: authOf(admin) })).json()).data?.profiles ?? [];
    previousDefault = profiles.find((p: { isDefault?: boolean }) => p.isDefault)?.profileId ?? null;
  });

  test.afterAll(async ({ request }) => {
    // The workspace default goes back to the profile that held it before this run.
    if (admin && previousDefault && profileId) {
      const back = await request.post(`${api}/reportPublish.json/brandProfile/setDefault`, { headers: authOf(admin), data: { profileId: previousDefault } });
      expect(back.status(), 'the previous default is restored').toBe(200);
    }
  });

  test('an image uploads and is approved; a renamed non-image is refused', async ({ browser, request }) => {
    const page = await view(browser, admin);
    await page.goto('/reports/assets');
    await page.getByRole('button', { name: 'Upload asset' }).click();
    let panel = page.getByRole('dialog');
    await panel.getByLabel('Kind').selectOption('IMAGE');
    await panel.getByLabel('Name').fill(IMAGE);
    await panel.getByLabel('Description').fill('Synthetic wound-measurement diagram for E2E checks; not a clinical image.');
    await panel.getByLabel('File', { exact: true }).setInputFiles({ name: 'e2e-wound-diagram.png', mimeType: 'image/png', buffer: png() });
    await panel.getByRole('button', { name: 'Upload', exact: true }).click();
    await expect(page).toHaveURL(/\/reports\/assets\/[0-9A-Z]{26}$/);
    await expect(page.getByRole('heading', { level: 1, name: IMAGE })).toBeVisible();
    await expect(page.locator('.pill', { hasText: 'Approved' }).first()).toBeVisible();
    await expect(page.getByText(/· Image · Editors manage/)).toBeVisible();

    // A PDF named .png: refused by what it is, not by its name.
    await page.goto('/reports/assets');
    await page.getByRole('button', { name: 'Upload asset' }).click();
    panel = page.getByRole('dialog');
    await panel.getByLabel('Kind').selectOption('IMAGE');
    await panel.getByLabel('Name').fill(`${IMAGE} (renamed PDF)`);
    await panel.getByLabel('File', { exact: true }).setInputFiles({ name: 'wound-photo.png', mimeType: 'image/png',
      buffer: Buffer.from('%PDF-1.4\n% a document, not a picture\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n') });
    await panel.getByRole('button', { name: 'Upload', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText('is not a .png file');
    await panel.getByRole('button', { name: 'Cancel' }).click();
    const assets = (await (await request.get(`${api}/reportAsset.json/assets?q=${encodeURIComponent(IMAGE)}`, { headers: authOf(admin) })).json()).data.assets;
    expect(assets.map((a: { name: string }) => a.name)).toEqual([IMAGE]);
    await page.context().close();
  });

  test('a brand profile: colours edited, a low-contrast pair refused, published and made the default', async ({ browser, request }) => {
    const page = await view(browser, admin);
    await page.goto('/reports/assets');
    await page.getByRole('button', { name: 'New brand profile' }).click();
    const panel = page.getByRole('dialog');
    await panel.getByLabel('Name').fill(PROFILE);
    await panel.getByRole('button', { name: 'Create the draft' }).click();
    await expect(page).toHaveURL(/\/reports\/assets\/branding\/[0-9A-Z]{26}$/);
    profileId = /branding\/([0-9A-Z]{26})$/.exec(page.url())![1];
    await expect(page.getByRole('heading', { level: 1, name: PROFILE })).toBeVisible();
    await expect(page.getByText('Not published yet').first()).toBeVisible();

    await colour(page, 'Main colour', '#0B5394');
    await colour(page, 'Background', '#FFFFFF');
    // Light grey on white: under 4.5 : 1, so it cannot be published.
    await colour(page, 'Text', '#C8C8C8');
    await expect(page.getByText(/Contrast too low: text \d\.\d : 1/)).toBeVisible();
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText(/^Draft v1 saved\./)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish v1' })).toBeDisabled();
    // The server holds the same line: the saved low-contrast draft is not published.
    const detail = (await (await request.get(`${api}/reportAsset.json/brandProfile?profileId=${profileId}`, { headers: authOf(admin) })).json()).data;
    const refused = await request.post(`${api}/reportPublish.json/brandProfile/publish`, { headers: authOf(admin),
      data: { profileId, revision: detail.draft.revision, changeSummary: 'E2E: low contrast' } });
    expect(refused.status(), 'a low-contrast profile is not published').toBeGreaterThanOrEqual(400);

    // Dark text: it passes, saves and publishes.
    await colour(page, 'Text', '#1F2933');
    await expect(page.getByText(/Text and background pass WCAG AA contrast/)).toBeVisible();
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText(/^Draft v1 saved\./).last()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish v1' })).toBeEnabled();
    await page.getByRole('button', { name: 'Publish v1' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByText(`${PROFILE} v1 published.`)).toBeVisible();
    await expect(page.getByText('published v1').first()).toBeVisible();

    await page.getByRole('button', { name: 'Make the workspace default' }).click();
    await expect(page.getByText(`${PROFILE} is the workspace default now.`)).toBeVisible();
    const after = (await (await request.get(`${api}/reportAsset.json/brandProfile?profileId=${profileId}`, { headers: authOf(admin) })).json()).data;
    expect(after.isDefault).toBe(true);
    expect(after.currentPublishedVersion).toBe(1);
    expect(after.published.definition.colors).toMatchObject({ primary: '#0B5394', text: '#1F2933', background: '#FFFFFF' });
    await page.context().close();
  });
});
