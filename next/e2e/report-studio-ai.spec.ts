import { expect, test, Page, TestInfo } from '@playwright/test';
import { join } from 'path';
import { api, authOf, canSignIn, NEEDS, pageAs, Session, sessionFor } from './support/session';
import { hasFixtures, NEEDS_FIXTURES } from './support/fixtures';
import { stamp, template, woundDefinition, WOUND_DATA } from './support/report-studio';

/**
 * Report Studio phase 6, live: the designer's AI assistant on the workspace's own local model. Riverside's administrator
 * opens a wound-check draft that keeps the synthetic wound clinic data as its test sample, asks the assistant for charts
 * (one model call, fields only), sees the proposal as a list of changes and on the page (the new chart outlined, a banner
 * saying nothing changed), then accepts it: the chart is in the draft, saved as the next revision, and Undo is offered.
 * Screens at 1920 and 1024, light and dark (E2E_SHOTS copies them out). The template "E2E AI designer <stamp>" stays.
 */
const NAME = `E2E AI designer ${stamp()}`;
let admin: Session;
let templateId = '';

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: info.outputPath(`${name}.png`) });
  const extra = process.env['E2E_SHOTS'];
  if (extra) await page.screenshot({ path: join(extra, `${name}.png`) });
}

test.describe('Report Studio: the AI assistant (live)', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);
  test.setTimeout(420_000);

  test.beforeAll(async ({ request }) => {
    admin = await sessionFor(request, 'admin');
    const made = await (await request.post(`${api}/reportTemplate.json/create`,
      { headers: authOf(admin), data: { from: 'IMPORT', name: NAME, definition: woundDefinition(NAME) } })).json();
    templateId = made.data.templateId;
    const kept = await request.post(`${api}/reportTemplate.json/sample/save?templateId=${templateId}`, {
      headers: authOf(admin),
      data: { name: 'Synthetic wound clinic', source: { connector: 'INLINE_JSON', text: JSON.stringify(WOUND_DATA), format: 'JSON' } },
    });
    expect(kept.status(), 'the test sample is kept with the draft').toBe(200);
  });

  test('charts are proposed, shown on the page, accepted as one undo step and saved', async ({ browser, request }, info) => {
    const page = await pageAs(browser, admin, { viewport: { width: 1920, height: 1080 }, colorScheme: 'light' });
    await page.goto(`/reports/templates/${templateId}/design`);
    const panel = page.locator('[data-ai-panel]');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Proposes changes', { timeout: 30_000 });
    await expect(panel.getByText('Include sample values'), 'the kept sample is the test data').toBeVisible({ timeout: 30_000 });
    await panel.getByRole('radio', { name: 'Suggest charts' }).click();
    await panel.locator('textarea').fill('Compare each wound\'s area.');
    const ask = panel.locator('[data-ai-ask]');
    await expect(ask).toBeEnabled({ timeout: 30_000 });
    await ask.click();
    await expect(panel.locator('[data-ai-proposal]')).toBeVisible({ timeout: 360_000 });
    const card = panel.locator('[data-ai-proposal]');
    await expect(card).toContainText('Proposed');
    await expect(card).toContainText('+ Chart');
    await expect(card).toContainText('Sent: fields only');
    await card.locator('[data-ai-preview]').click();
    await expect(page.locator('[data-ai-preview-banner]')).toBeVisible();
    await panel.scrollIntoViewIfNeeded();
    await shot(page, info, 'ai-designer-1920-light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await shot(page, info, 'ai-designer-1920-dark');
    await page.setViewportSize({ width: 1024, height: 768 });
    await panel.locator('[data-ai-proposal]').scrollIntoViewIfNeeded();
    await shot(page, info, 'ai-designer-1024-dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await shot(page, info, 'ai-designer-1024-light');
    await page.setViewportSize({ width: 1920, height: 1080 });

    const before = (await template(request, admin, templateId)).draft.revision;
    await card.locator('[data-ai-accept]').click();
    await expect(card).toContainText('Applied to the draft and saved', { timeout: 30_000 });
    await expect(page.locator('[data-ai-preview-banner]')).toHaveCount(0);
    await expect.poll(async () => (await template(request, admin, templateId)).draft.revision, { timeout: 30_000 }).toBe(before + 1);
    const draft = await (await request.get(`${api}/reportTemplate.json/version?templateId=${templateId}&version=draft`, { headers: authOf(admin) })).json();
    expect(JSON.stringify(draft.data.definition.template.components), 'the chart is in the saved draft').toContain('"type":"chart"');
    await expect(page.getByRole('button', { name: 'Undo (Ctrl+Z)' })).toBeEnabled();
    await shot(page, info, 'ai-designer-accepted-1920-light');
  });
});
