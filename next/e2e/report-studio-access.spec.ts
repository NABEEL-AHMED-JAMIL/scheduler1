import { expect, test, Browser, Page } from '@playwright/test';
import { api, authOf, canMintPeople, canSignIn, NEEDS, pageAs, Session, sessionAsPerson, sessionFor } from './support/session';
import { hasFixtures, meridian, NEEDS_FIXTURES, riverside } from './support/fixtures';
import { isolationRows } from './support/report-studio';

/**
 * Report Studio's isolation and access, live (MIG-403..406):
 *   - Meridian's administrator gets "not found" for Riverside's template, report and asset, by id, in the API and on the
 *     screens -- the same answer as an id that never existed, so nothing leaks.
 *   - Riverside's viewer holds none of Report Studio's pages: every screen refuses them.
 *   - Riverside's reviewer reads the library and may approve, and nothing else: no Generate again or Archive, no
 *     templates, no assets, and the API refuses them a template.
 *   - The test platform administrator opens Riverside's template in the designer read only.
 * Its rows are made once and reused by name ("E2E isolation wound template", "... report", "... icon"; see
 * support/report-studio.ts): this spec only reads them, so nothing is approved, changed or added after the first run.
 */
let admin: Session;
let rows: { templateId: string; reportId: string; assetId: string };

const view = (browser: Browser, s: Session): Promise<Page> => pageAs(browser, s, { viewport: { width: 1920, height: 1080 } });

test.describe('Report Studio: isolation and access (live)', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);
  test.setTimeout(120_000);

  test.beforeAll(async ({ request }) => {
    test.setTimeout(120_000);
    admin = await sessionFor(request, 'admin');
    rows = await isolationRows(request, admin);
  });

  test('Meridian\'s administrator gets "not found" for Riverside\'s ids, in the API and on the screens', async ({ browser, request }) => {
    test.skip(!canMintPeople(), 'needs the mint script (E2E_MINT=1) to sign in as Meridian\'s administrator');
    const other = await sessionAsPerson(request, meridian().admin);
    expect(other.tenantId, 'Meridian\'s administrator is in Meridian').toBe(meridian().tenantId);
    const { templateId, reportId, assetId } = rows;
    const calls: [string, string, number, string][] = [
      ['GET', `/reportTemplate.json/fetchById?templateId=${templateId}`, 404, 'TEMPLATE_NOT_FOUND'],
      ['GET', `/reportTemplate.json/version?templateId=${templateId}&version=1`, 404, 'TEMPLATE_NOT_FOUND'],
      ['GET', `/reportLibrary.json/report?reportId=${reportId}`, 404, 'REPORT_NOT_FOUND'],
      ['GET', `/reportAsset.json/asset?assetId=${assetId}`, 404, 'NO_SUCH_ASSET'],
      ['GET', `/reportAsset.json/file?assetId=${assetId}`, 404, ''],
    ];
    for (const [method, path, status, code] of calls) {
      const answer = await request.fetch(`${api}${path}`, { method, headers: authOf(other) });
      expect(answer.status(), `${method} ${path} as Meridian's administrator`).toBe(status);
      if (code) expect((await answer.json()).code, path).toBe(code);
    }
    const link = await request.post(`${api}/reportLibrary.json/downloadLink`, { headers: authOf(other), data: { reportId, version: 1, format: 'PDF' } });
    expect(link.status(), 'no download link for Riverside\'s report').toBe(404);
    const approval = await request.post(`${api}/reportApprove.json/approve`, { headers: authOf(other), data: { reportId, version: 1 } });
    expect(approval.status(), 'nor an approval').toBe(404);
    // Riverside's own administrator reads all three.
    for (const path of [`/reportTemplate.json/fetchById?templateId=${templateId}`, `/reportLibrary.json/report?reportId=${reportId}`,
      `/reportAsset.json/asset?assetId=${assetId}`]) {
      expect((await request.get(`${api}${path}`, { headers: authOf(admin) })).status(), `${path} as Riverside's administrator`).toBe(200);
    }

    const page = await view(browser, other);
    for (const [url, sentence] of [[`/reports/templates/${templateId}`, 'No such template.'], [`/reports/templates/${templateId}/design`, 'No such template.'],
      [`/reports/library/${reportId}`, 'No such report.'], [`/reports/assets/${assetId}`, 'No such asset.']]) {
      await page.goto(url);
      await expect(page.getByText(sentence), url).toBeVisible();
    }
    await page.goto('/reports/library');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(page.getByText('E2E isolation wound report')).toHaveCount(0);
    await page.context().close();
  });

  test('Riverside\'s viewer is refused every Report Studio page', async ({ browser, request }) => {
    test.skip(!canSignIn('viewer'), NEEDS.viewer);
    const viewer = await sessionFor(request, 'viewer');
    expect(viewer.appUserId, 'Riverside\'s viewer').toBe(riverside().viewer);
    const page = await view(browser, viewer);
    for (const [url, key] of [['/reports/overview', 'report-studio'], ['/reports/templates', 'report-templates'],
      [`/reports/templates/${rows.templateId}/design`, 'report-templates'], ['/reports/new', 'report-generate'],
      ['/reports/library', 'report-library'], [`/reports/library/${rows.reportId}`, 'report-library'], ['/reports/assets', 'report-assets']]) {
      await page.goto(url);
      await expect(page, url).toHaveURL(new RegExp(`/unauthorized\\?page=${key}`));
    }
    await page.context().close();
  });

  test('Riverside\'s reviewer reads the library and may approve, and nothing more', async ({ browser, request }) => {
    test.skip(!canSignIn('user'), NEEDS.user);
    const reviewer = await sessionFor(request, 'user');
    expect(reviewer.appUserId, 'Riverside\'s reviewer').toBe(riverside().reviewer);
    const page = await view(browser, reviewer);
    await page.goto(`/reports/library/${rows.reportId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'E2E isolation wound report' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Generate again' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Archive' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Approve and sign v1' })).toBeVisible();
    for (const [url, key] of [['/reports/templates', 'report-templates'], [`/reports/templates/${rows.templateId}/design`, 'report-templates'],
      ['/reports/new', 'report-generate'], ['/reports/assets', 'report-assets']]) {
      await page.goto(url);
      await expect(page, url).toHaveURL(new RegExp(`/unauthorized\\?page=${key}`));
    }
    const made = await request.post(`${api}/reportTemplate.json/create`, { headers: authOf(reviewer), data: { from: 'BLANK', name: 'E2E reviewer may not make this' } });
    expect(made.status(), 'the reviewer cannot make a template').toBe(403);
    await page.context().close();
  });

  test('the platform administrator\'s designer is read only', async ({ browser, request }) => {
    test.skip(!canSignIn('platform'), NEEDS.platform);
    const platform = await sessionFor(request, 'platform');
    const page = await view(browser, platform);
    await page.goto(`/reports/templates/${rows.templateId}/design`);
    await expect(page.getByRole('heading', { level: 1, name: 'E2E isolation wound template' })).toBeVisible();
    await expect(page.getByText(/Read only · Publishing needs an approver/)).toBeVisible();
    await expect(page.getByText('Published versions never change')).toBeVisible();
    await expect(page.locator('.rsd-palette').getByRole('button', { name: 'Heading', exact: true })).toBeDisabled();
    for (const name of [/^Publish v/, 'Ask for approval', /^Start a draft/, 'Preview']) {
      await expect(page.getByRole('button', { name }), String(name)).toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: 'Undo (Ctrl+Z)' })).toBeDisabled();
    await page.getByRole('tab', { name: 'Layers' }).click();
    await page.getByRole('list', { name: 'Layers' }).getByRole('button', { name: /Wounds this visit/ }).click();
    await expect(page.getByRole('complementary', { name: 'Properties' }).getByLabel('Collection')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Delete (Delete)' })).toHaveCount(0);
    await page.context().close();
  });
});
