import { test, expect } from '@playwright/test';
import { APIRequestContext } from '@playwright/test';
import { api, authOf, canSignIn, NEEDS, pageAs, Session, sessionFor } from './support/session';

/**
 * Rate cards, end to end: the platform administrator saves a new version of the calculation through the
 * editor, the page lists it with what changed, a bill drafted before keeps its version, and a
 * fresh draft is priced with the new one. A tenant administrator never sees the page.
 *
 * Needs a running metering service (etl_meter) behind the console. Sign-in through support/session.ts:
 *   platform  the TEST platform administrator (rebuild.json's platformAdmin) -- never the owner's own account
 *   admin     a TENANT_ADMIN, for the negative case (Riverside Health's administrator)
 *
 * Rate cards are never deleted, and the version this saves ("E2E <stamp>: images at ...") is the platform's DEFAULT
 * from the 1st of next month. So afterwards the card that was next month's default before the test (the demo's
 * "Standard 2026") is saved again, unchanged, as a newer version from that same day: next month bills as it would have,
 * and the two versions stay in the history.
 */

interface Card { version: number; name: string; currency: string; effective_from: string;
  items: { meter: string; unit: string; per: number; unit_price: number; included_quantity?: number; tiers?: unknown[] }[] }

/** Saves `base` again as the default from `day`: what puts next month back after the test's version. */
async function restoreDefault(request: APIRequestContext, s: Session, base: Card, day: string): Promise<void> {
  const r = await (await request.put(`${api}/billing.json/rateCard`, { headers: authOf(s), data: {
    name: base.name, tenant_id: null, effective_from: day, currency: base.currency, based_on_version: base.version,
    note: `Put back by the e2e suite after its rate-card check (v${base.version}'s items, unchanged)`,
    items: base.items.map(i => ({ meter: i.meter, unit: i.unit, per: i.per, unit_price: i.unit_price,
      included_quantity: i.included_quantity ?? 0, tiers: i.tiers ?? [] })),
  } })).json();
  if (r.status !== 'SUCCESS') console.log(`[e2e] could not put rate card v${base.version} back from ${day}: ${r.message}`);
}


test.describe('rate cards', () => {
  /** Next month's default before the test, the day it starts, and the name of the version the test saves. */
  let undo: { s: Session; base: Card; day: string; name: string } | null = null;

  test.afterAll(async ({ request }) => {
    if (!undo) return;
    const cards: Card[] = (await (await request.get(`${api}/billing.json/rateCards`, { headers: authOf(undo.s) })).json()).data?.cards ?? [];
    if (cards.some(c => c.name === undo!.name)) await restoreDefault(request, undo.s, undo.base, undo.day);
  });

  test('a new version is saved from the editor, listed, and prices only the bills that come after', async ({ browser, request }) => {
    test.skip(!canSignIn('platform'), NEEDS.platform);
    test.setTimeout(120_000);
    const session = await sessionFor(request, 'platform');
    const auth = authOf(session);
    const health = await (await request.get(`${api}/billing.json/health`, { headers: auth })).json();
    test.skip(health.status !== 'SUCCESS' || health.data?.status !== 'ok', 'The metering service is not up behind this console.');

    const before = await (await request.get(`${api}/billing.json/rateCards`, { headers: auth })).json();
    const versionsBefore: number[] = before.data.cards.map((c: { version: number }) => c.version);
    // The editor starts from the default card in effect, which an earlier run may have set to these very prices: pick
    // a price and an allowance that differ from it, or "1 changed" never appears.
    const today0 = new Date().toISOString().slice(0, 10);
    const base = (await (await request.get(`${api}/billing.json/rateCard?day=${today0}`, { headers: auth })).json()).data;
    const baseImages = (base?.items ?? []).find((i: { meter: string }) => i.meter === 'ai.vision.images');
    const price = Number(baseImages?.unit_price) === 0.02 ? '0.03' : '0.02';
    const included = Number(baseImages?.included_quantity) === 10 ? '11' : '10';
    const stamp = Date.now().toString(36);
    const name = `E2E ${stamp}: images at ${price}`;
    const first = new Date(); first.setDate(1); first.setMonth(first.getMonth() + 1);
    const day = first.toISOString().slice(0, 10);
    const nextBase: Card = (await (await request.get(`${api}/billing.json/rateCard?day=${day}`, { headers: auth })).json()).data;
    expect(nextBase?.items?.length, `the default card in effect on ${day}`).toBeGreaterThan(0);
    undo = { s: session, base: nextBase, day, name };

    const page = await pageAs(browser, session);
    await page.goto('/billing/rates');
    await expect(page.getByRole('heading', { name: 'Rate cards' })).toBeVisible();
    await expect(page.getByText('Default card today')).toBeVisible();

    // The editor: a name, one price, one allowance, saved as a new default version from the 1st of next month.
    await page.getByRole('button', { name: 'New version', exact: true }).click();
    const panel = page.getByRole('dialog');
    await expect(panel.getByRole('heading', { name: /^New version from / })).toBeVisible();
    await panel.locator('#rcName').fill(name);
    await panel.locator('#rcNote').fill(`Playwright: images described at ${price}, ${included} free a month`);
    await panel.getByLabel('Images described price').fill(price);
    await panel.getByLabel('Images described included').fill(included);
    await expect(panel.getByText('1 changed')).toBeVisible();
    await panel.getByRole('button', { name: 'Save version' }).click();
    await expect(page.getByText(new RegExp(`${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')} saved as v\\d+`))).toBeVisible();

    // Listed, selected, and the change named against its base.
    const after = await (await request.get(`${api}/billing.json/rateCards`, { headers: auth })).json();
    const saved = after.data.cards.find((c: { name: string }) => c.name === name);
    expect(saved, 'the saved version is listed by the API').toBeTruthy();
    expect(versionsBefore).not.toContain(saved.version);
    expect(saved.tenant_id).toBeNull();
    const images = saved.items.find((i: { meter: string }) => i.meter === 'ai.vision.images');
    expect(Number(images.unit_price)).toBe(Number(price));
    expect(Number(images.included_quantity)).toBe(Number(included));
    expect(saved.items.length).toBeGreaterThan(10);                     // everything else carried over
    await expect(page.getByRole('heading', { name: `${name} v${saved.version}` })).toBeVisible();
    await expect(page.getByText(/Changed from v\d+: Images described/)).toBeVisible();
    await expect(page.getByText('not yet in effect')).toBeVisible();   // dated the 1st of next month: the Scheduled tile counts it

    // A bill already issued keeps its version; the card in effect this month is unchanged (the new one starts next month).
    const invoices = await (await request.get(`${api}/billing.json/invoices`, { headers: auth })).json();
    const issued = (invoices.data as { status: string; rateCardVersion: number | null; number: string }[]).find(i => i.status !== 'draft' && i.rateCardVersion);
    if (issued) {
      const detail = await (await request.get(`${api}/billing.json/invoice?number=${issued.number}`, { headers: auth })).json();
      expect(detail.data.rateCardVersion).toBe(issued.rateCardVersion);
      expect(detail.data.rateCardVersion).not.toBe(saved.version);
    }
    const today = new Date().toISOString().slice(0, 10);
    const inEffect = await (await request.get(`${api}/billing.json/rateCard?day=${today}`, { headers: auth })).json();
    expect(inEffect.data.version).not.toBe(saved.version);
    const nextMonth = new Date(); nextMonth.setDate(1); nextMonth.setMonth(nextMonth.getMonth() + 1);
    const later = await (await request.get(`${api}/billing.json/rateCard?day=${nextMonth.toISOString().slice(0, 10)}`, { headers: auth })).json();
    expect(later.data.version).toBe(saved.version);
    await page.context().close();
  });

  test('a tenant administrator is kept off the page and cannot change the calculation', async ({ browser, request }) => {
    test.skip(!canSignIn('admin'), NEEDS.admin);
    const session = await sessionFor(request, 'admin');
    const auth = authOf(session);
    const refused = await (await request.put(`${api}/billing.json/rateCard`, { headers: auth, data: { name: 'x', effective_from: '2099-01-01', items: [] } })).json();
    expect(refused.status).toBe('ERROR');
    const list = await (await request.get(`${api}/billing.json/rateCards`, { headers: auth })).json();
    expect(list.status).toBe('ERROR');
    const page = await pageAs(browser, session);
    await page.goto('/billing/rates');
    await expect(page.getByRole('heading', { name: 'Rate cards' })).toHaveCount(0);
    await page.goto('/billing/usage');
    await expect(page.getByText(/Priced with/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'rate cards' })).toHaveCount(0);
    await page.context().close();
  });
});
