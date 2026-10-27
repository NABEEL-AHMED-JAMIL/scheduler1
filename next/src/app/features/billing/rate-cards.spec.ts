import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { RateCards } from './rate-cards';
import { RateCardEditor } from './rate-card-editor';
import { BillingApi, RateCard, RateCardDraft, RateCardDraftRow, RatePreview } from './billing.service';
import { priceDigits } from './billing-format';
import { WorkspacePicker } from './workspace-picker';
import { ToastService } from '../../shared/ui/toast.service';
import { API_SUCCESS } from '../../core/api/api.config';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

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

/** Owner #23: a version with rules, a draft of it, and what the preview answers. */
const RULES = [
  { rule_no: 2, meter: 'seats.user_days', match_kind: 'TAG', match_value: 'research', unit_price: '0.10', note: null, label: 'tag research' },
  { rule_no: 1, meter: 'seats.user_days', match_kind: 'PIPELINE', match_value: '1933', unit_price: '0.05', note: 'X-ray triage', label: 'X-ray triage' },
  { rule_no: 3, meter: 'ai.tokens.in', match_kind: 'CLASS', match_value: 'sensitive', unit_price: '0.08', note: null, label: 'data class sensitive' },
];
const DRAFT = {
  draft_id: 31, tenant_id: null, tenantName: null, based_on_version: 1, name: 'Rules for November', effective_from: '2099-11-01',
  card: { name: 'Rules for November', tenant_id: null, effective_from: '2099-11-01', currency: 'USD', based_on_version: 1, note: 'research pricing',
    items: ITEMS.map(i => ({ meter: i.meter, unit: i.unit, per: i.per, unit_price: Number(i.unit_price), included_quantity: Number(i.included_quantity), tiers: [] })),
    rules: RULES },
} as unknown as RateCardDraftRow;
const PREVIEW = {
  period: '2026-09', tenantId: null, current: 1.5, draft: 1.2, difference: -0.3, onOwnCard: 1, rules: RULES,
  workspaces: [{ tenantId: 2905, tenantName: 'MedAxis', zone: 'America/Chicago', currentVersion: 2, currentName: 'Standard', current: 1.5, draft: 1.2,
    difference: -0.3, invoice: { number: 'INV-2026-09-0001', status: 'issued', total: 1.5, currency: 'USD', rateCardVersion: 2 },
    changes: [{ meter: 'seats.user_days', label: 'Seats', service: 'Seats', quantity: 10, current: 1.5, draft: 1.2, difference: -0.3, currentUnitPrice: 0.33,
      draftUnitPrice: 0.33, rules: [{ ruleNo: 1, matchKind: 'PIPELINE', matchValue: '1933', label: 'X-ray triage', quantity: 4, includedQuantity: 0,
        billableQuantity: 4, unitPrice: 0.05, amount: 0.2 }] }] }],
} as unknown as RatePreview;

function page() {
  const api = { rateCards: vi.fn(() => of({ status: API_SUCCESS, data: { cards: CARDS } })), saveRateCard: vi.fn(),
    rateCardDrafts: vi.fn(() => of({ status: API_SUCCESS, data: { drafts: [] } })) };
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
    expect(component.tierText(c.items[1], 'USD')).toEqual(['0 – 1,500: $0.05 per 1,000 tokens', '1,500 and up: $0.02 per 1,000 tokens']);
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

/** MIG-211: the card reads in sentence case, a free meter says Free, and "today" is the viewer's day, not UTC's. */
describe('RateCards, as rendered', () => {
  function rendered() {
    const api = { rateCards: vi.fn(() => of({ status: API_SUCCESS, data: { cards: CARDS } })), saveRateCard: vi.fn(),
    rateCardDrafts: vi.fn(() => of({ status: API_SUCCESS, data: { drafts: [] } })) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [RateCards], providers: [
      { provide: BillingApi, useValue: api }, { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } }, { provide: Dialog, useValue: { open: vi.fn() } },
      { provide: WorkspacePicker, useValue: { tenantId: () => '2905', options: () => [{ value: '2905', label: 'MedAxis' }], ready: (then: () => void) => then() } },
    ] });
    const fixture = TestBed.createComponent(RateCards);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('writes chips and rail states in sentence case', () => {
    const { el } = rendered();
    const pills = [...el.querySelectorAll('.lookup-detail-head .pill')].map(p => p.textContent!.trim());
    expect(pills).toEqual(['Every workspace', 'In effect', 'USD']);
    const subs = [...el.querySelectorAll('.lookup-rail-sub')].map(s => s.textContent!.replace(/\s+/g, ' ').trim());
    expect(subs[0]).toMatch(/^Scheduled · from 1 Oct 2099/);
    expect(subs[1]).toMatch(/^In effect · from 1 Sep 2026/);
    expect(subs[3]).toMatch(/^From 1 Jan 2026/);
    expect(el.textContent).toContain('A period is priced after the allowance');
  });

  it('a meter priced at nothing reads Free, and a tiered one Tiered', () => {
    const { el } = rendered();                                   // v2, the default in effect, has free churn
    const cells = [...el.querySelectorAll('.lookup-entry-table tbody td:nth-child(2)')].map(td => td.textContent!.trim());
    expect(cells).toContain('Free');
    // A tiered cell now also carries its bands below lg; the label still leads it.
    expect(cells.some(c => c.startsWith('Tiered'))).toBe(true);
    expect(cells.some(c => c.startsWith('tiered'))).toBe(false);
  });

  it("dates today by the viewer's calendar, so a card starting tomorrow is not in effect tonight", () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(2026, 7, 31, 23, 30));           // 31 Aug, 23:30 local: UTC is already 1 Sep in the Americas
      const { component } = rendered();
      expect(component.todayIso).toBe('2026-08-31');
      expect(component.today().defaultCard?.version).toBe(1);    // v2 starts 1 Sep: tomorrow, not today
      expect(component.upcoming()).toBe(3);                      // v2 and v3 (1 Sep) and v4 (2099)
    } finally { vi.useRealTimers(); }
  });
});

function editor(base: RateCard, saved: unknown = { status: API_SUCCESS, data: { ...base, version: 9, name: 'Nine' } }, draft: RateCardDraftRow | null = null) {
  const api = { saveRateCard: vi.fn(() => of(saved)),
    saveRateCardDraft: vi.fn((card: RateCardDraft) => of({ status: API_SUCCESS, data: { draft_id: draft?.draft_id ?? 31, name: card.name, card } })),
    publishRateCardDraft: vi.fn(() => of({ status: API_SUCCESS, data: { ...base, version: 12, name: 'Published' } })),
    previewRateCard: vi.fn(() => of({ status: API_SUCCESS, data: PREVIEW })) };
  const ref = { close: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    provideHttpClient(), provideHttpClientTesting(),
    { provide: BillingApi, useValue: api }, { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    { provide: DialogRef, useValue: ref }, { provide: DIALOG_DATA, useValue: { base, draft, workspaces: [{ value: '2905', label: 'MedAxis' }] } },
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

  it('shows a byte meter priced per GB as "GB", not a disabled 1073741824', () => {
    const base = RateCards.numeric(CARDS[3] as unknown as RateCard);
    editor(base);
    const fixture = TestBed.createComponent(RateCardEditor);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const perCells = [...el.querySelectorAll('.rate-edit tbody tr')].map(tr => tr.querySelectorAll('td')[2]);
    expect(perCells[2].textContent!.trim()).toBe('GB');
    expect(perCells[2].querySelector('input')).toBeNull();
    expect((perCells[1].querySelector('input') as HTMLInputElement).value).toBe('1000');
    expect([...el.querySelectorAll('.rate-edit th')].map(th => th.textContent!.trim())).toContain('Per');
    expect((el.querySelector('#rcNote') as HTMLInputElement).placeholder).toBe('Why — the agreement, the ticket, the reason');
  });

  // MIG-308: a model priced on its own is a `<meter>@<model>` item next to its meter; removing one sends it as removed.
  it('prices a model on its own next to its meter, refuses a bad name, and removes a saved one', () => {
    const base = RateCards.numeric({ ...CARDS[3], items: [ITEMS[0], ITEMS[1], { ...ITEMS[1], meter: 'ai.tokens.in@qwen2.5:7b', label: 'Model tokens in (qwen2.5:7b)', tiers: [], included_quantity: '0', unit_price: '0.4' }, ITEMS[2]] } as unknown as RateCard);
    const { component } = editor(base);
    component.name.set('Per-model AI');
    component.addModel();
    expect(component.modelError()).toBe('Name the model.');
    component.modelName.set('a@b'); component.addModel();
    expect(component.modelError()).toBe('A model name cannot contain @.');
    component.modelName.set('qwen2.5:7b'); component.addModel();
    expect(component.modelError()).toBe('That model already has its own price here.');
    component.modelName.set(' llama3.2:3b '); component.modelPrice.set('0.02'); component.addModel();
    expect(component.modelError()).toBe('');
    expect(component.items().map(i => i.meter)).toEqual(['seats.user_days', 'ai.tokens.in', 'ai.tokens.in@qwen2.5:7b', 'ai.tokens.in@llama3.2:3b', 'storage.bytes.deleted']);
    const added = component.items()[3];
    expect(added).toMatchObject({ label: 'Model tokens in (llama3.2:3b)', unit: 'token', per: 1000, unit_price: '0.02', included_quantity: '', tiers: [] });
    expect(component.changed().has('ai.tokens.in@llama3.2:3b')).toBe(true);
    // A meter's own item has no remove; a saved model price does, and goes as removed.
    component.removeItem(1);
    expect(component.items()).toHaveLength(5);
    component.removeItem(2);
    const draft = component.draft();
    if (typeof draft === 'string') throw new Error(draft);
    expect(draft.removed).toEqual(['ai.tokens.in@qwen2.5:7b']);
    expect(draft.items.map(i => i.meter)).toContain('ai.tokens.in@llama3.2:3b');
    expect(draft.items.find(i => i.meter === 'ai.tokens.in@llama3.2:3b')).toMatchObject({ unit_price: 0.02, per: 1000 });
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

/** Audit 09-22: the page as drawn -- one primary action, tier prices at any width, neutral workspace glyph. */
describe('RateCards, rendered', () => {
  function view() {
    const api = { rateCards: vi.fn(() => of({ status: API_SUCCESS, data: { cards: CARDS } })), saveRateCard: vi.fn(),
    rateCardDrafts: vi.fn(() => of({ status: API_SUCCESS, data: { drafts: [] } })) };
    const dialog = { open: vi.fn(() => ({ closed: of(null) })) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: BillingApi, useValue: api }, { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } }, { provide: Dialog, useValue: dialog },
      { provide: WorkspacePicker, useValue: { tenantId: () => '2905', options: () => [{ value: '2905', label: 'MedAxis' }], ready: (then: () => void) => then() } },
    ] });
    const fixture = TestBed.createComponent(RateCards);
    fixture.detectChanges();
    return { fixture, dialog, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('has one primary action in view: the pane\'s New version from this', () => {
    const { el } = view();
    const primaries = [...el.querySelectorAll('.btn-primary')].map(b => b.textContent!.trim());
    expect(primaries).toEqual(['New version from this']);
  });

  it('prints a tiered meter\'s bands under its price, for widths that hide the Tiers column', () => {
    const { el } = view();
    const row = [...el.querySelectorAll('.lookup-entry-table tbody tr')].find(tr => tr.textContent!.includes('Model tokens in'))!;
    const price = row.querySelectorAll('td')[1];
    const narrow = price.querySelector('.lg\\:hidden');
    expect(narrow?.textContent).toContain('1,500 and up: $0.02 per 1,000 tokens');
  });

  it('draws a workspace card with a neutral glyph, not the warning amber of a managed lookup', () => {
    const { el } = view();
    const glyphs = [...el.querySelectorAll('.lookup-rail-glyph')];
    expect(glyphs.some(g => g.classList.contains('is-managed'))).toBe(false);
  });

  it('starts "A card for one workspace" with no workspace chosen, rather than one picked on another screen', () => {
    const { component, dialog } = view();
    component.forOneWorkspace(component.cards()[3]);
    const data = (dialog.open.mock.calls[0] as unknown as [unknown, { data: { tenantId: number | null } }])[1].data;
    expect(data.tenantId).toBeNull();
  });
});

describe('RateCardEditor, rendered', () => {
  it('labels its fields with app-field: required stars, hints as field notes, no local .hint', () => {
    const base = RateCards.numeric(CARDS[3] as unknown as RateCard);
    editor(base);
    const fixture = TestBed.createComponent(RateCardEditor);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const label = (id: string) => el.querySelector(`label[for="${id}"]`)!;
    expect(label('rcName').textContent).toContain('(required)');
    expect(label('rcFrom').textContent).toContain('(required)');
    expect(label('rcNote').textContent).not.toContain('(required)');
    expect(el.querySelector('.hint')).toBeNull();
    expect([...el.querySelectorAll('.field-note')].map(n => n.textContent!.trim())).toContain('Prices bills for periods that start on or after this day.');
    // The changed-row rule is the console's one (styles.css .lookup-entry-table tr.is-changed), not a near-black local copy.
    expect(el.querySelector('table.rate-edit')!.classList).toContain('lookup-entry-table');
  });
});

/** Owner #23, steps 3 and 4: rules edited in the side panel, drafts saved and published, the preview of last month. */
describe('RateCardEditor, pricing rules', () => {
  it("carries the base version's rules over, in the order usage is matched, and sends every one", () => {
    const base = RateCards.numeric({ ...CARDS[3], rules: RULES } as unknown as RateCard);
    const { component } = editor(base);
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush({ status: API_SUCCESS, data: [] }));
    expect(component.orderedRules().map(r => r.rule_no)).toEqual([1, 2, 3]);
    component.name.set('With rules');
    const draft = component.draft();
    if (typeof draft === 'string') throw new Error(draft);
    expect(draft.rules?.map(r => [r.rule_no, r.match_kind, r.match_value, r.unit_price])).toEqual([[1, 'PIPELINE', '1933', '0.05'], [2, 'TAG', 'research', '0.1'],
      [3, 'CLASS', 'sensitive', '0.08']]);
  });

  it('adds, changes and removes a rule, and refuses one the server would refuse, in its words', () => {
    const base = RateCards.numeric(CARDS[3] as unknown as RateCard);
    const { component } = editor(base);
    component.name.set('With rules');
    component.addRule();
    const http = TestBed.inject(HttpTestingController);
    // ZT-A12 follow-up: ids and names only (Core's GET /sourceTask.json/names); the full list is a workspace's data.
    expect(http.match(r => r.url.includes('/sourceTask.json/listSourceTask'))).toEqual([]);
    const names = http.expectOne(r => r.url.endsWith('/sourceTask.json/names'));
    expect(names.request.method).toBe('GET');
    names.flush({ status: API_SUCCESS, data: [{ taskDetailId: 1933, taskName: 'X-ray triage', tenantId: 2905, tenantName: 'MedAxis' }] });
    const key = component.rules()[0].key;
    expect(component.problems()).toContain('Rule 1 needs a pipeline of 1 to 120 characters, with no space at either end.');
    expect(component.draft()).toBe('Fix the pricing rules first.');
    component.pickPipeline(key, '1933');
    expect(component.rules()[0]).toMatchObject({ match_value: '1933', note: 'X-ray triage' });
    expect(component.pipelineOptions()[0].label).toBe('X-ray triage — MedAxis (#1933)');
    component.setRule(key, 'unit_price', '0.001');
    expect(component.problems()).toEqual([]);
    component.setKind(key, 'CLASS');
    expect(component.rules()[0].match_value).toBe('sensitive');
    component.setRule(key, 'match_value', 'secret');
    expect(component.problems()).toContain('Rule 1: a data class is one of public, internal, sensitive.');
    component.removeRule(key);
    expect(component.rules()).toEqual([]);
  });

  it('raises a tag rule above the tag tried before it by swapping their numbers', () => {
    const base = RateCards.numeric({ ...CARDS[3], rules: [RULES[0], { ...RULES[0], rule_no: 4, match_value: 'pilot' }] } as unknown as RateCard);
    const { component } = editor(base);
    const pilot = component.rules().find(r => r.match_value === 'pilot')!;
    component.raiseTag(pilot.key);
    expect(component.orderedRules().map(r => r.match_value)).toEqual(['pilot', 'research']);
  });

  it('saves a draft, which prices nothing, and closes with it', () => {
    const base = RateCards.numeric(CARDS[3] as unknown as RateCard);
    const { component, api, ref } = editor(base);
    component.name.set('Drafted');
    component.saveDraft();
    expect(api.saveRateCardDraft).toHaveBeenCalledWith(expect.objectContaining({ name: 'Drafted', rules: [] }), undefined);
    expect(api.saveRateCard).not.toHaveBeenCalled();
    expect(ref.close).toHaveBeenCalledWith(expect.objectContaining({ draft_id: 31 }));
  });

  it('opens a saved draft, saves to it, and publishes it as a new version on Save version', () => {
    const base = RateCards.numeric(CARDS[3] as unknown as RateCard);
    const { component, api, ref } = editor(base, undefined, DRAFT);
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush({ status: API_SUCCESS, data: [] }));
    expect(component.name()).toBe('Rules for November');
    expect(component.effectiveFrom()).toBe('2099-11-01');
    expect(component.rules().length).toBe(3);
    expect(component.items()[0].label).toBe('Seats');
    component.save();
    expect(api.saveRateCardDraft).toHaveBeenCalledWith(expect.objectContaining({ name: 'Rules for November' }), 31);
    expect(api.publishRateCardDraft).toHaveBeenCalledWith(31);
    expect(ref.close).toHaveBeenCalledWith(expect.objectContaining({ version: 12 }));
  });

  it("shows the server's sentence per rule problem under the rules", () => {
    const base = RateCards.numeric(CARDS[3] as unknown as RateCard);
    const refused = { status: 'ERROR', message: 'Rule 1 prices api.calls (and 1 more)', data: { problems: ['Rule 1 prices api.calls, which this card has no price for.', 'Rule 2: x'] } };
    const { component, ref } = editor(base, refused);
    component.name.set('Refused');
    component.save();
    expect(component.problems()).toEqual(['Rule 1 prices api.calls, which this card has no price for.', 'Rule 2: x']);
    expect(component.error()).toBe('2 problems: see below.');
    expect(ref.close).not.toHaveBeenCalled();
  });

  it('previews last month with the card as it stands in the panel', () => {
    const base = RateCards.numeric(CARDS[3] as unknown as RateCard);
    const { component, api } = editor(base);
    component.name.set('Previewed');
    component.runPreview();
    expect(api.previewRateCard).toHaveBeenCalledWith({ card: expect.objectContaining({ name: 'Previewed' }) }, component.periods[0].value);
    expect(component.periods.map(p => p.label)[1]).toMatch(/^This month so far \(/);
    expect(component.preview()?.difference).toBe(-0.3);
  });
});

describe('RateCards, drafts and rules', () => {
  function withDrafts(confirm = true) {
    const api = { rateCards: vi.fn(() => of({ status: API_SUCCESS, data: { cards: [{ ...CARDS[0] }, { ...CARDS[1] }, { ...CARDS[2], rules: RULES }, CARDS[3]] } })),
      rateCardDrafts: vi.fn(() => of({ status: API_SUCCESS, data: { drafts: [DRAFT] } })),
      publishRateCardDraft: vi.fn(() => of({ status: API_SUCCESS, data: { ...CARDS[0], version: 12, name: 'Rules for November' } })),
      deleteRateCardDraft: vi.fn(() => of({ status: API_SUCCESS, data: {} })),
      previewRateCard: vi.fn(() => of({ status: API_SUCCESS, data: PREVIEW })), saveRateCard: vi.fn() };
    const dialog = { open: vi.fn(() => ({ closed: of(confirm) })) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: BillingApi, useValue: api }, { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } }, { provide: Dialog, useValue: dialog },
      { provide: WorkspacePicker, useValue: { tenantId: () => '2905', options: () => [{ value: '2905', label: 'MedAxis' }], ready: (then: () => void) => then() } },
    ] });
    const fixture = TestBed.createComponent(RateCards);
    fixture.detectChanges();
    return { fixture, api, dialog, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it("lists a version's rules in the order usage is matched, beside the card's own price", () => {
    const { el } = withDrafts();
    const rows = [...el.querySelectorAll('[data-test="rules-table"] tbody tr')].map(tr => tr.getAttribute('data-rule'));
    expect(rows).toEqual(['1', '2', '3']);
    const first = el.querySelector('[data-test="rules-table"] tbody tr')!.textContent!;
    expect(first).toContain('X-ray triage (#1933)');
    expect(first).toContain('$0.05 per user-day');
    expect(first).toContain('$0.33 per user-day');
  });

  it('lists drafts first; a draft shows its rules, previews last month and publishes after asking', async () => {
    const { el, component, api, fixture, dialog } = withDrafts();
    expect(el.querySelector('[data-test="draft-item"]')!.textContent).toContain('Rules for November');
    component.selectDraft(DRAFT);
    fixture.detectChanges();
    expect(el.querySelector('[data-test="draft-detail"]')!.textContent).toContain('A draft prices nothing');
    expect(el.querySelectorAll('[data-test="rules-table"] tbody tr').length).toBe(3);
    (el.querySelector('[data-test="preview-draft"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(api.previewRateCard).toHaveBeenCalledWith({ draftId: 31 }, component.periods[0].value);
    expect(el.querySelector('[data-test="preview-difference"]')!.textContent).toContain('−$0.3');
    expect(el.querySelector('[data-test="preview-workspaces"]')!.textContent).toContain('INV-2026-09-0001 issued (kept)');
    await component.publishDraft(DRAFT);
    expect(dialog.open).toHaveBeenCalled();
    expect(api.publishRateCardDraft).toHaveBeenCalledWith(31);
    expect(api.rateCards).toHaveBeenCalledTimes(2);
  });

  it('does not publish or discard when the person says no', async () => {
    const { component, api } = withDrafts(false);
    await component.publishDraft(DRAFT);
    await component.discardDraft(DRAFT);
    expect(api.publishRateCardDraft).not.toHaveBeenCalled();
    expect(api.deleteRateCardDraft).not.toHaveBeenCalled();
  });
});
