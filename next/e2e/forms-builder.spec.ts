import { test, expect, APIRequestContext, Browser, Page } from '@playwright/test';
import { canSignIn, NEEDS, pageAs as signedIn, sessionFor } from './support/session';

/**
 * MIG-280, live: the administrator (4537) builds a form in the new builder -- two fields from the palette, a rule in
 * Logic -- publishes it, fills it in and sends it, and finds the submission on Submissions with its strip. It CREATES a
 * form ("E2E builder <time>") and one submission, and leaves them. Sign-in: E2E_TENANT_ADMIN_TOKEN.
 */
const NAME = `E2E builder ${new Date().toISOString().slice(5, 19).replace(/[-:T]/g, '')}`;

async function pageAs(browser: Browser, request: APIRequestContext): Promise<Page> {
  return signedIn(browser, await sessionFor(request, 'admin'), { viewport: { width: 1440, height: 1000 } });
}

test.describe('Forms: build, publish, fill, submit (live)', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);

  test('a form built from the palette is published, filled in and shows on Submissions', async ({ browser, request }) => {
    const page = await pageAs(browser, request);
    await page.goto('/forms/builder');
    await page.locator('[data-new-form]').click();

    await page.locator('[data-tab="settings"]').click();
    await page.locator('[data-settings] #formName').fill(NAME);
    await page.locator('[data-tab="build"]').click();

    // The new form starts with one text question; make it the visitor's name, then add a yes/no from the palette.
    const props = page.locator('[data-field-props]');
    await props.getByLabel('Label', { exact: true }).fill('Visitor');
    await props.getByLabel('Required').check();
    // Each palette click selects the new field: wait for its panel before typing into it.
    await page.locator('[data-add-type="yesNo"]').click();
    await expect(props.locator('#fieldLabel1')).toBeVisible();
    await props.getByLabel('Label', { exact: true }).fill('Has a badge');
    await page.locator('[data-add-type="text"]').click();
    await expect(props.locator('#fieldLabel2')).toBeVisible();
    await props.getByLabel('Label', { exact: true }).fill('Badge number');
    await expect(page.locator('[data-field-row]')).toHaveCount(3);

    // Logic: the badge number only when they have a badge.
    await page.locator('[data-tab="logic"]').click();
    const rule = page.locator('[data-logic-field="badge_number"] [data-rule="showWhen"]');
    await rule.getByLabel('Show only when: field').selectOption('has_a_badge');
    await page.locator('[data-tab="build"]').click();
    await expect(page.locator('[data-field-row="2"]')).toContainText('Shown when Has a badge is Yes');

    await page.locator('[data-publish-form]').click();
    await expect(page.locator('[data-form-state]')).toContainText('Published');

    // Fill it in: the rule hides Badge number until "Yes".
    await page.getByRole('link', { name: 'Fill in' }).first().click();
    await page.locator('[data-field="visitor"]').fill('Sam');
    await expect(page.locator('[data-field="badge_number"]')).toHaveCount(0);
    await page.locator('[data-field="has_a_badge"]').getByLabel('Yes').check();
    await page.locator('[data-field="badge_number"]').fill('B-17');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('[data-submitted]')).toContainText('Submitted');

    await page.getByRole('link', { name: 'Submissions' }).click();
    await expect(page.locator('[data-submission]')).toHaveCount(1);
    await expect(page.getByText('These submissions at a glance').or(page.locator('app-stat-strip'))).toBeVisible();
  });
});
