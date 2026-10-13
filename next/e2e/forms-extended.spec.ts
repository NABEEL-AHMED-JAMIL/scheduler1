import { test, expect, APIRequestContext, Browser, Page } from '@playwright/test';
import { canSignIn, NEEDS, pageAs as signedIn, Session, sessionFor, sessionOf, signInWithPassword, tokenFor } from './support/session';
import { lendPages } from './support/workspace';
import { archiveForm, makeForm, submitForm } from './support/forms';
import { hasFixtures, NEEDS_FIXTURES, riverside } from './support/fixtures';

/**
 * MIG-277, live: a member -- Riverside's reviewer (role user) -- fills in the spec's own visit form: picks a patient from
 * the lookup, sees Antibiotic appear (and become required) when infection is Yes, adds table rows, uploads a photo, draws
 * a signature, and sends.
 *
 * The rebuilt workspace has no such form, so the administrator makes two for the run -- "E2E patients <stamp>" (one
 * submission, SYN-001, which the lookup offers) and "E2E visit check <stamp>" -- and archives both afterwards (forms are
 * never deleted). The reviewer's profile does not hold Forms, so the page is lent to them for the test and their
 * exceptions are put back exactly as they were. The submission and its two uploads stay with the archived form.
 * Sign-in through support/session.ts (roles admin and user).
 */
const STAMP = Date.now().toString(36);
const VISIT = `E2E visit check ${STAMP}`;

test.describe('Forms: lookup, rules, table, file, signature (live)', () => {
  test.skip(!canSignIn('user') || !canSignIn('admin'), `${NEEDS.user}; ${NEEDS.admin}`);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);

  let admin: Session;
  let form = Number(process.env['E2E_EXTENDED_FORM'] ?? 0);
  const made: number[] = [];
  let giveBack: ((request: APIRequestContext) => Promise<void>) | null = null;

  test.beforeAll(async ({ request }) => {
    admin = await sessionFor(request, 'admin');
    if (!form) {
      const patients = await makeForm(request, admin, `E2E patients ${STAMP}`,
        [{ key: 'patient_id', label: 'Patient id', type: 'text', required: true }]);
      made.push(patients);
      await submitForm(request, admin, patients, { patient_id: 'SYN-001' });
      form = await makeForm(request, admin, VISIT, [
        { key: 'patient', label: 'Patient', type: 'lookup', required: true, lookup: { formId: patients, field: 'patient_id' } },
        { key: 'infected', label: 'Infected', type: 'yesNo', required: true },
        { key: 'antibiotic', label: 'Antibiotic', type: 'text', required: false,
          showWhen: { field: 'infected', op: 'eq', value: true }, requiredWhen: { field: 'infected', op: 'eq', value: true } },
        { key: 'doses', label: 'Doses', type: 'table', required: false, maxRows: 2,
          columns: [{ key: 'drug', label: 'Drug', type: 'text', required: true }, { key: 'mg', label: 'mg', type: 'number', required: false }] },
        { key: 'photo', label: 'Photo', type: 'file', required: false, accept: ['png', 'jpg'], maxSizeMb: 5, maxFiles: 2 },
        { key: 'signed', label: 'Signature', type: 'signature', required: true },
      ]);
      made.push(form);
    }
    giveBack = await lendPages(request, admin, riverside().reviewer, ['forms']);
  });

  test.afterAll(async ({ request }) => {
    if (giveBack) await giveBack(request);
    for (const id of made) await archiveForm(request, admin, id);
  });

  async function pageAs(browser: Browser, request: APIRequestContext): Promise<Page> {
    // A fresh sign-in, as after the page was lent (the server may remember what an existing token was allowed).
    const token = tokenFor('user', { newSignIn: true });
    const s = token ? await sessionOf(request, token)
      : await signInWithPassword(request, process.env['E2E_TENANT_USER']!, process.env['E2E_TENANT_USER_PASSWORD']!);
    return signedIn(browser, s, { viewport: { width: 1440, height: 1000 } });
  }

  test('a member fills in every new field type and sends it', async ({ browser, request }) => {
    const page = await pageAs(browser, request);
    await page.goto(`/forms/${form}/fill`);
    await expect(page.getByRole('heading', { level: 1, name: VISIT })).toBeVisible();

    await page.locator('[data-field="patient"]').selectOption('SYN-001');
    await expect(page.locator('[data-field="antibiotic"]')).toHaveCount(0);
    await page.locator('[data-field="infected"]').getByLabel('Yes').check();
    await expect(page.locator('[data-field="antibiotic"]')).toBeVisible();

    // Sending now names the rule's field.
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Antibiotic is required.')).toBeVisible();
    await page.locator('[data-field="antibiotic"]').fill('Amoxicillin');

    await page.locator('[data-add-row]').click();
    await page.getByLabel('Drug, row 1').fill('Amoxicillin');
    await page.getByLabel('mg, row 1').fill('500');

    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC', 'base64');
    await page.locator('[data-field="photo"] input[type="file"]').setInputFiles({ name: 'heel.png', mimeType: 'image/png', buffer: png });
    await expect(page.locator('[data-field="photo"] [data-upload]')).toContainText('heel.png');

    const pad = page.locator('canvas.signature-pad');
    const box = (await pad.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + box.height / 2);
    await page.mouse.down();
    for (let x = 30; x < 260; x += 20) await page.mouse.move(box.x + x, box.y + box.height / 2 + (x % 40 ? 12 : -12));
    await page.mouse.up();
    await page.locator('[data-sign]').click();
    await expect(page.locator('[data-signed]')).toBeVisible();

    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('[data-submitted]')).toContainText('Submitted');
  });
});
