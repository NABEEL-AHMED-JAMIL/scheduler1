import { test, expect } from '@playwright/test';
import { api, authOf, canMintPeople, canSignIn, NEEDS, pageAs, Session, sessionAsPerson, sessionFor } from './support/session';
import { hasFixtures, meridian, openData } from './support/fixtures';

/**
 * Invoices and Billing documents as rail + pane: the address names a bill, the pane shows it
 * with the QR code of its number, and the document list reads a PDF in place.
 *
 * Sign-in through support/session.ts:
 *   admin     a TENANT_ADMIN whose workspace has an issued invoice: Riverside Health's administrator when Riverside has
 *             one, else the first rebuilt workspace's administrator that has (Meridian's October bill is issued and
 *             paid; support/fixtures.ts), minted for this read-only test
 *   platform  the TEST platform administrator -- never the owner's own account
 * Issuing a bill is the platform administrator's; the test reads only, and skips when no rebuilt workspace has one.
 */


test.describe('invoices as rail and pane', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);

  test('the address names the bill, the pane carries its QR code, and a document reads in place', async ({ browser, request }) => {
    type Bill = { number: string; status: string; documentKinds: string[] };
    const issuedOf = async (s: Session): Promise<Bill | undefined> =>
      ((await (await request.get(`${api}/billing.json/invoices`, { headers: authOf(s) })).json()).data as Bill[] ?? [])
        .find(i => i.status !== 'draft' && i.documentKinds?.includes('invoice'));
    let session = await sessionFor(request, 'admin');
    let issued = await issuedOf(session);
    for (const other of hasFixtures() && canMintPeople() ? [meridian().admin, openData().admin] : []) {
      if (issued) break;
      session = await sessionAsPerson(request, other);
      issued = await issuedOf(session);
    }
    test.skip(!issued, 'No rebuilt workspace has an issued invoice yet: issuing one is the platform administrator\'s.');

    const page = await pageAs(browser, session);
    await page.goto('/billing/invoices');
    await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();
    await expect(page.getByRole('listbox', { name: 'Invoices' })).toBeVisible();
    // Deep link: the pane shows that bill, its number is the heading, its QR is an image that loaded.
    await page.goto(`/billing/invoices/${issued!.number}`);
    await expect(page.getByRole('heading', { name: issued!.number })).toBeVisible();
    const qr = page.getByAltText(`QR code: ${issued!.number}`);
    await expect(qr).toBeVisible();
    expect(await qr.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByRole('listbox', { name: 'Invoices' }).getByRole('option', { selected: true })).toContainText(issued!.number);
    await expect(page.getByRole('heading', { name: /^Lines/ })).toBeVisible();
    // A tenant administrator sees the slip action, never Issue or Void.
    await expect(page.getByRole('button', { name: /Upload payment slip|Record payment|PDF/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Issue' })).toHaveCount(0);
    // Picking another row in the rail changes the address.
    const other = page.getByRole('listbox', { name: 'Invoices' }).getByRole('option').filter({ hasNotText: issued!.number }).first();
    if (await other.count()) {
      await other.click();
      await expect(page).not.toHaveURL(new RegExp(issued!.number + '$'));
    }
    // View reads the PDF in a modal, in the console's own viewer, without leaving the bill.
    await page.goto(`/billing/invoices/${issued!.number}`);
    await page.getByRole('button', { name: 'View', exact: true }).first().click();
    const modal = page.getByRole('dialog');
    await expect(modal.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
    await expect(modal.getByRole('button', { name: 'Download' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    // The folder icon goes to Billing documents, read in place there too.
    await page.getByTitle('Open in Billing documents').first().click();
    await expect(page.getByRole('heading', { name: 'Billing documents' })).toBeVisible();
    await expect(page.getByRole('listbox', { name: 'Documents' }).getByRole('option', { selected: true })).toContainText(issued!.number);
    await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 });   // pdf.js drew the page
    await page.context().close();
  });

  test('the platform administrator drafts from the head and sees every workspace in the rail', async ({ browser, request }) => {
    test.skip(!canSignIn('platform'), NEEDS.platform);
    const session = await sessionFor(request, 'platform');
    const page = await pageAs(browser, session);
    await page.goto('/billing/invoices');
    await expect(page.getByRole('button', { name: /Draft month/ })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Workspace' })).toBeVisible();
    await expect(page.getByText('Drafts')).toBeVisible();
    await page.context().close();
  });
});
