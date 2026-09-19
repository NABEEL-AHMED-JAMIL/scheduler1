import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { RateCards } from './rate-cards';
import { RateCardEditor } from './rate-card-editor';
import { BillingApi, RateCard } from './billing.service';
import { priceDigits } from './billing-format';
import { WorkspacePicker } from './workspace-picker';
import { ToastService } from '../../shared/ui/toast.service';
import { API_SUCCESS } from '../../core/api/api.config';

/**
 * Rate cards: every version listed with who it is for and whether it prices today; a new
 * version is drafted from an existing one and saved as its own, never edited in place.
 */
const ITEMS = [
  { meter: 'seats.user_days', label: 'Seats', service: 'Seats', unit: 'user-day', per: 1, unit_price: '0.33', included_quantity: '0', tiers: [] },
  { meter: 'ai.tokens.in', label: 'Model tokens in', service: 'Model calls', unit: 'token', per: 1000, unit_price: '0.05', included_quantity: '1000', tiers: [{ from: '0', unit_price: '0.05' }, { from: '1500', unit_price: '0.02' }] },
  { meter: 'storage.bytes.deleted', label: 'Bytes deleted (data churn)', service: 'Storage', unit: 'byte', per: 1073741824, unit_price: '0.01', included_quantity: '0', tiers: [] },
];
const CARDS = [
  { version: 4, name: 'October', tenant_id: null, tenantName: null, effective_from: '2099-10-01', currency: 'USD', based_on_version: 2, note: '', items: ITEMS },
  { version: 3, name: 'MedAxis contract', tenant_id: 2905, tenantName: 'MedAxis', effective_from: '2026-09-01', currency: 'USD', based_on_version: 1, note: 'seats at 0.20', items: [{ ...ITEMS[0], unit_price: '0.20' }, ITEMS[1], ITEMS[2]] },
  { version: 2, name: 'Standard, churn free', tenant_id: null, tenantName: null, effective_from: '2026-09-01', currency: 'USD', based_on_version: 1, note: '', items: [ITEMS[0], ITEMS[1], { ...ITEMS[2], unit_price: '0' }] },
  { version: 1, name: 'Standard', tenant_id: null, tenantName: null, effective_from: '2026-01-01', currency: 'USD', based_on_version: null, note: '', items: ITEMS },
];

function page() {
  const api = { rateCards: vi.fn(() => of({ status: API_SUCCESS, data: { cards: CARDS } })), saveRateCard: vi.fn() };
  const dialog = { open: vi.fn(() => ({ closed: of(null) })) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: BillingApi, useValue: api }, { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } }, { provide: Dialog, useValue: dialog },
    { provide: WorkspacePicker, useValue: { tenantId: () => '2905', options: () => [{ value: '2905', label: 'MedAxis' }], ready: (then: () => void) => then() } },
  ] });
  const component = TestBed.runInInjectionContext(() => new RateCards());
  component.ngOnInit();
  return { component, api, dialog };
}

describe('RateCards', () => {
  it('lists every version, knows which price today, and selects the default in effect', () => {
    const { component } = page();
    expect(component.cards().map(c => c.version)).toEqual([4, 3, 2, 1]);
    expect(component.today().defaultCard?.version).toBe(2);           // v4 is dated ahead; v2 prices today
    expect(component.today().own.map(c => c.tenant_id)).toEqual([2905]);
    expect(component.upcoming()).toBe(1);
    expect(component.selectedVersion()).toBe(2);
    expect(component.isInEffect(component.cards()[0])).toBe(false);
    expect(component.isInEffect(component.cards()[1])).toBe(true);
    expect(component.forLabel(component.cards()[1])).toBe('MedAxis');
    expect(component.forLabel(component.cards()[3])).toBe('Every workspace');
  });

  it('filters by scope and search, and says what a version changed against its base', () => {
    const { component } = page();
    component.setScope('workspace');
    expect(component.visible().map(c => c.version)).toEqual([3]);
    component.setScope('workspace');                                   // toggles off
    component.search.set('churn');
    expect(component.visible().map(c => c.version)).toEqual([2]);
    expect(component.changedAgainstBase(component.cards()[2])).toEqual(['Bytes deleted (data churn)']);
    expect(component.changedAgainstBase(component.cards()[1])).toEqual(['Seats']);
    expect(component.changedAgainstBase(component.cards()[3])).toEqual([]);
  });

  it('shows prices, allowances and tiers as a person reads them, grouped by service', () => {
    const { component } = page();
    const c = component.cards()[3];
    expect(component.groups(c).map(g => g.service)).toEqual(['Seats', 'Model calls', 'Storage']);
    expect(component.price(c.items[2], 'USD')).toBe('$0.01 per GB');
    expect(component.price(c.items[0], 'USD')).toBe('$0.33 per user-day');
    expect(component.price({ ...c.items[0], unit_price: 0.045 }, 'USD')).toBe('$0.045 per user-day');
    expect([priceDigits(0.05), priceDigits(0.045), priceDigits(0.000032), priceDigits(3), priceDigits(0.0000001)]).toEqual([2, 3, 6, 2, 2]);
    expect(component.units(c.items[1], 1000)).toBe('1,000');
    expect(component.units(c.items[2], 2 * 1024 ** 3)).toBe('2 GB');
    expect(component.tierText(c.items[1], 'USD')).toEqual(['0 – 1,500: $0.05 / 1,000 per token', '1,500 and up: $0.02 / 1,000 per token']);
  });

  it('drafts a new version from the selected card in the side panel and reloads on save', () => {
    const { component, dialog, api } = page();
    component.select(component.cards()[3]);
    component.newVersion();
    expect(dialog.open).toHaveBeenCalledTimes(1);
    const config = (dialog.open as ReturnType<typeof vi.fn>).mock.calls[0][1] as { data: { base: RateCard; tenantId: number | null } };
    expect(config.data.base.version).toBe(1);
    expect(config.data.tenantId).toBeNull();
    expect(api.rateCards).toHaveBeenCalledTimes(1);
  });
});

function editor(base: RateCard, saved = { status: API_SUCCESS, data: { ...base, version: 9, name: 'Nine' } }) {
  const api = { saveRateCard: vi.fn(() => of(saved)) };
  const ref = { close: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: BillingApi, useValue: api }, { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    { provide: DialogRef, useValue: ref }, { provide: DIALOG_DATA, useValue: { base, workspaces: [{ value: '2905', label: 'MedAxis' }] } },
  ] });
  const component = TestBed.runInInjectionContext(() => new RateCardEditor());
  return { component, api, ref };
}

describe('RateCardEditor', () => {
  it('starts from the base card, marks what changed, and refuses a nameless or negative version', () => {
    const base = RateCards.numeric(CARDS[3] as unknown as RateCard);
    const { component } = editor(base);
    expect(component.items().length).toBe(3);
    expect(component.changed().size).toBe(0);
    expect(component.effectiveFrom()).toMatch(/^\d{4}-\d{2}-01$/);
    expect(component.draft()).toBe('Give the version a name.');
    component.name.set('Cheaper seats');
    component.set(0, 'unit_price', '-1');
    expect(component.draft()).toBe('Seats: nothing can be negative.');
    component.set(0, 'unit_price', '0.20');
    expect([...component.changed()]).toEqual(['seats.user_days']);
    component.set(0, 'included_quantity', '10');
    component.addTier(0); component.setTier(0, 0, 'from', '100'); component.setTier(0, 0, 'unit_price', '0.10');
    const draft = component.draft();
    expect(typeof draft).toBe('object');
    if (typeof draft === 'string') return;
    expect(draft.based_on_version).toBe(1);
    expect(draft.tenant_id).toBeNull();
    expect(draft.items[0]).toEqual({ meter: 'seats.user_days', unit: 'user-day', per: 1, unit_price: 0.2, included_quantity: 10, tiers: [{ from: 100, unit_price: 0.1 }] });
    expect(draft.items[1].tiers).toEqual([{ from: 0, unit_price: 0.05 }, { from: 1500, unit_price: 0.02 }]);
  });

  it('saves for a workspace and closes with the version the meter assigned', () => {
    const base = RateCards.numeric(CARDS[3] as unknown as RateCard);
    const { component, api, ref } = editor(base);
    component.name.set('MedAxis contract'); component.tenantId.set('2905');
    component.save();
    expect(api.saveRateCard).toHaveBeenCalledTimes(1);
    const sent = (api.saveRateCard as ReturnType<typeof vi.fn>).mock.calls[0][0] as { tenant_id: number | null; name: string };
    expect(sent.tenant_id).toBe(2905);
    expect(ref.close).toHaveBeenCalledWith(expect.objectContaining({ version: 9 }));
  });
});
