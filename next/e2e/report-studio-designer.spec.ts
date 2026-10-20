import { expect, test, Page } from '@playwright/test';
import { canSignIn, NEEDS, pageAs, Session, sessionFor } from './support/session';
import { hasFixtures, NEEDS_FIXTURES } from './support/fixtures';
import { stamp, template, uploadedImage, woundJson } from './support/report-studio';

/**
 * Report Studio's designer, live (MIG-404): Riverside's administrator makes a blank template, fills the canvas with
 * pasted synthetic wound-clinic data, adds a heading, a text, a table bound to the data's visits and an image from the
 * asset library, reorders them, undoes and redoes, lets the draft save itself, tests it with pasted JSON (the PDF's page
 * count shows) and publishes v1. The image is "E2E wound chart icon <stamp>", uploaded through the API for the run (a
 * generated PNG, never a photo); the template is "E2E wound check <stamp>". Both stay (the owner removes test data).
 */
const STAMP = stamp();
const NAME = `E2E wound check ${STAMP}`;
const IMAGE = `E2E wound chart icon ${STAMP}`;

let admin: Session;
let templateId = '';

const props = (page: Page) => page.getByRole('complementary', { name: 'Properties' });
const layers = (page: Page) => page.getByRole('list', { name: 'Layers' });

/** The Layers rows' labels, top to bottom. */
async function layerOrder(page: Page): Promise<string[]> {
  await page.getByRole('tab', { name: 'Layers' }).click();
  await expect(layers(page).locator('.rsd-layer').first()).toBeVisible();
  return (await layers(page).locator('.rsd-layer > span.truncate').allTextContents()).map(t => t.trim());
}

/** Adds a palette entry (after the selected block) from the Components tab. */
async function add(page: Page, label: string): Promise<void> {
  await page.getByRole('tab', { name: 'Components' }).click();
  await page.locator('.rsd-palette').getByRole('button', { name: label, exact: true }).click();
}

test.describe('Report Studio: the designer (live)', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  test.beforeAll(async ({ request }) => {
    admin = await sessionFor(request, 'admin');
    await uploadedImage(request, admin, IMAGE);
  });

  test('a blank template: blocks added, bound, reordered, undone and redone, saved by itself', async ({ browser, request }) => {
    const page = await pageAs(browser, admin, { viewport: { width: 1920, height: 1080 } });
    await page.goto('/reports/templates');
    await page.getByRole('button', { name: 'New template' }).click();
    const made = page.getByRole('dialog');
    await made.getByLabel('Template name').fill(NAME);
    await made.getByLabel('Category').fill('Clinical quality');
    await made.getByRole('button', { name: 'Create the draft' }).click();
    await expect(page).toHaveURL(/\/reports\/templates\/[0-9A-Z]{26}\/design$/);
    templateId = /templates\/([0-9A-Z]{26})\/design/.exec(page.url())![1];
    await expect(page.getByRole('heading', { level: 1, name: NAME })).toBeVisible();
    await expect(page.getByText('Draft v1', { exact: true })).toBeVisible();

    // Test data first, so the pickers offer its paths: pasted JSON, read at once, never stored.
    await page.getByRole('button', { name: 'Test data: none' }).click();
    const data = page.getByRole('dialog');
    await data.getByLabel('Paste JSON').fill(woundJson());
    await data.getByRole('button', { name: 'Fill the canvas' }).click();
    await expect(page.getByRole('button', { name: /^Test data: / })).toContainText('1 record');

    // A heading after the blank template's intro text.
    await page.getByRole('tab', { name: 'Layers' }).click();
    await layers(page).getByRole('button', { name: /Describe what this report shows/ }).click();
    await add(page, 'Heading');
    await props(page).getByLabel('Text', { exact: true }).fill('Wound assessment summary');
    // A text block reading the data.
    await add(page, 'Text');
    await props(page).getByLabel('Text', { exact: true }).fill('Clinic: {{primary.clinic}}. A draft for a clinician to review.');
    // A table bound to the visits, with two columns.
    await add(page, 'Table');
    await props(page).getByLabel('Collection').selectOption('visits');
    await props(page).getByLabel('Column 1 field').selectOption('patient');
    await props(page).getByLabel('Column 1 label').fill('Patient');
    await props(page).getByLabel('Column 1 label').press('Tab');
    await props(page).getByRole('button', { name: 'Column', exact: true }).click();
    await props(page).getByLabel('Column 2 field').selectOption('areaCm2');
    await props(page).getByLabel('Column 2 label').fill('Area cm²');
    await props(page).getByLabel('Column 2 label').press('Tab');
    await expect(props(page).getByText('Data matches · 3 sample rows')).toBeVisible();
    // An image from the asset library.
    await add(page, 'Image or logo');
    await props(page).getByLabel('Image', { exact: true }).selectOption({ label: `${IMAGE} · v1` });

    // The canvas draws the data: the table's rows and the clinic's name.
    const canvas = page.getByRole('region', { name: 'Page canvas' });
    await expect(canvas.getByText('Patient B (fictional)')).toBeVisible();
    await expect(canvas.getByText('Clinic: Riverside wound clinic (synthetic).')).toBeVisible();

    const before = await layerOrder(page);
    expect(before.slice(0, 6)).toEqual([NAME, 'Describe what this report shows.', 'Wound assessment summary',
      expect.stringMatching(/^Clinic: \{\{primary\.clinic\}\}\./), 'primary.visits', 'Image or logo']);
    // Reorder: the summary heading moves above the intro (Alt+Up), then undo and redo.
    await layers(page).getByRole('button', { name: /Wound assessment summary/ }).click();
    await page.keyboard.press('Alt+ArrowUp');
    await expect.poll(async () => (await layerOrder(page)).indexOf('Wound assessment summary'))
      .toBe(before.indexOf('Wound assessment summary') - 1);
    const moved = await layerOrder(page);
    await page.getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
    await expect.poll(() => layerOrder(page)).toEqual(before);
    await page.getByRole('button', { name: 'Redo (Ctrl+Y)' }).click();
    await expect.poll(() => layerOrder(page)).toEqual(moved);

    // Autosave: five seconds after the last change, and the server has it.
    await expect(page.getByText(/^Saved \d{2}:\d{2}$/)).toBeVisible({ timeout: 20_000 });
    const saved = await template(request, admin, templateId);
    const components = saved.draft.definition.template.components as Record<string, unknown>[];
    const types = components.map(c => c['type']);
    expect(types).toEqual(expect.arrayContaining(['heading', 'text', 'table', 'image']));
    const table = components.find(c => c['type'] === 'table')!;
    expect(table['dataset']).toBe('primary.visits');
    expect((table['columns'] as { field: string }[]).map(c => c.field)).toEqual(['patient', 'areaCm2']);
    const titles = components.filter(c => c['type'] === 'heading' || c['type'] === 'text').map(c => c['content']);
    expect(titles.indexOf('Wound assessment summary')).toBeLessThan(titles.indexOf('Describe what this report shows.'));
    expect((saved.draft.definition.template.assets as { alt: string }[]).map(a => a.alt)).toContain(IMAGE);
    await page.context().close();
  });

  test('tested with pasted JSON (the PDF\'s pages show), then published as v1', async ({ browser, request }) => {
    test.skip(!templateId, 'the template was not made');
    const page = await pageAs(browser, admin, { viewport: { width: 1920, height: 1080 } });
    await page.goto(`/reports/templates/${templateId}/design`);
    await expect(page.getByRole('heading', { level: 1, name: NAME })).toBeVisible();
    await page.getByRole('button', { name: 'Preview' }).click();
    const panel = page.getByRole('dialog');
    await panel.getByLabel('Paste JSON').fill(woundJson());
    await panel.getByRole('button', { name: 'Show the PDF' }).click();
    await expect(panel.getByText(/^1 page PDF · 0 errors/)).toBeVisible({ timeout: 30_000 });
    await panel.getByRole('button', { name: 'Check and show' }).click();
    await expect(panel.getByText('1 record', { exact: false })).toBeVisible();
    await expect(panel.frameLocator('iframe[title="Report preview"]').getByText('Patient C (fictional)')).toBeVisible();
    await panel.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: 'Publish v1' }).click();
    const publish = page.getByRole('dialog');
    await publish.getByLabel('What changed').fill('E2E: first version, wound table and chart icon');
    await publish.getByRole('button', { name: 'Publish v1' }).click();
    await expect(page.getByText(`${NAME} v1 published.`)).toBeVisible();
    await expect(page.getByText('Published v1', { exact: true })).toBeVisible();
    const after = await template(request, admin, templateId);
    expect(after.currentPublishedVersion).toBe(1);
    await page.context().close();
  });
});
