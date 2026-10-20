import { DateField } from '../../shared/ui/date-field';
import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { LIST_LIMIT } from '../../core/api/list-limit';
import { ToastService } from '../../shared/ui/toast.service';
import { SidePanel } from '../../shared/ui/side-panel';
import { Icon } from '../../shared/ui/icon';
import { Field } from '../../shared/ui/field';
import { Combobox, ComboboxOption } from '../../shared/ui/combobox';
import { BillingApi, MODEL_PRICED_METERS, RateCard, RateCardDraft, RateCardDraftRow, RateItem, RatePreview, RateRule, RateTier, RuleKind,
  modelOfMeter } from './billing.service';
import { firstOfMonth, formatUnitPrice } from './billing-format';
import { DATA_CLASSES, RULE_KINDS, byPrecedence, kindText, ruleProblems } from './rate-rules';
import { RatePreviewView } from './rate-preview';

/** One item as it is being edited: strings in the inputs, numbers on save. */
interface EditItem {
  meter: string; label: string; service: string; unit: string; per: number;
  unit_price: string; included_quantity: string; tiers: { from: string; unit_price: string }[];
}
/** One pricing rule as it is being edited (owner #23): the price as typed, a key that survives renumbering. */
interface EditRule { key: number; rule_no: number; meter: string; match_kind: RuleKind; match_value: string; unit_price: string; note: string; }
/**
 * `base` is the published version a new version is drafted from; `draft`, when given, is the saved draft being changed
 * (its card is what the panel opens with, and saving changes that draft).
 */
export interface RateCardEditorData { base: RateCard; workspaces: ComboboxOption[]; tenantId?: number | null; draft?: RateCardDraftRow | null; }
/** What the panel closes with: the version published, the draft saved, or nothing. */
export type RateCardEditorResult = RateCard | RateCardDraftRow | null;
/** A pipeline the rule picker offers: Core's list, as a platform administrator sees it (every workspace's). */
interface PipelineChoice { taskDetailId: number; taskName: string; tenantId?: number | null; tenantName?: string | null; }

/**
 * A new version of the calculation, drafted from an existing one. Nothing here edits a saved
 * card: the meter keeps every version, and a bill names the one that priced it. What can
 * change per item is the price, what it is priced per, a monthly allowance, and graduated tiers.
 */
@Component({
  selector: 'app-rate-card-editor',
  imports: [DateField, SidePanel, Icon, Combobox, Field, RatePreviewView],
  template: `
    <app-side-panel [heading]="data.draft ? 'Draft: ' + data.draft.name : 'New version from ' + data.base.name + ' v' + data.base.version"
                    [subtitle]="data.draft ? 'A draft prices nothing until it is published as a new version.' : 'Saved as its own version; bills already drafted keep the one they were priced with.'">
      <div class="form-grid mb-4">
        <app-field class="col-span-2" label="Name" for="rcName" [required]="true">
          <input id="rcName" class="input" [value]="name()" (input)="name.set($any($event.target).value)" placeholder="What changed, or who it is for" /></app-field>
        <app-field label="For" for="rcFor" hint="A workspace's own card wins over the default from its effective date.">
          <app-combobox id="rcFor" [selected]="tenantId() ?? ''" (selectedChange)="tenantId.set($event || null)" [options]="forOptions" [allowClear]="false" placeholder="Every workspace" /></app-field>
        <app-field label="Effective from" for="rcFrom" [required]="true" hint="Prices bills for periods that start on or after this day.">
          <app-date-field inputId="rcFrom" label="Effective from" [value]="effectiveFrom()" (valueChange)="effectiveFrom.set($event)" /></app-field>
        <app-field class="col-span-2" label="Note" for="rcNote">
          <input id="rcNote" class="input" [value]="note()" (input)="note.set($any($event.target).value)" placeholder="Why — the agreement, the ticket, the reason" /></app-field>
      </div>

      <div class="flex items-center justify-between mb-2">
        <span class="text-sm text-[color:var(--text-secondary)]">{{ items().length }} meters · {{ changed().size + removed().length }} changed</span>
        <span class="text-xs text-[color:var(--text-muted)]">{{ data.base.currency }}</span>
      </div>
      <table class="table-modern rate-edit lookup-entry-table">
        <thead><tr><th>Meter</th><th class="text-right">Price</th><th class="text-right">Per</th><th class="text-right">Included / month</th><th>Tiers</th></tr></thead>
        <tbody>
          @for (it of items(); track it.meter; let i = $index) {
            <tr [class.is-changed]="changed().has(it.meter)">
              <td><div class="font-medium flex items-center gap-1">{{ it.label }}
                    @if (isModelItem(it)) { <button type="button" class="btn btn-ghost btn-icon btn-xs" (click)="removeItem(i)" [attr.aria-label]="'Remove ' + it.label"><app-icon name="close" size="0.8em" /></button> }</div>
                  <div class="text-[11px] mono text-[color:var(--text-muted)]">{{ it.meter }} · {{ it.unit }}</div></td>
              <td class="text-right"><input class="input py-1 text-xs w-24 text-right mono" type="number" min="0" step="any" [value]="it.unit_price" (input)="set(i, 'unit_price', $any($event.target).value)" [attr.aria-label]="it.label + ' price'" /></td>
              <td class="text-right">
                @if (it.unit === 'byte') { <span class="text-xs text-[color:var(--text-muted)] pr-2" title="Bytes are priced per GB">GB</span> }
                @else { <input class="input py-1 text-xs w-24 text-right mono" type="number" min="1" step="1" [value]="it.per" (input)="setPer(i, $any($event.target).value)" [attr.aria-label]="it.label + ' per'" /> }
              </td>
              <td class="text-right"><input class="input py-1 text-xs w-28 text-right mono" type="number" min="0" step="any" [value]="it.included_quantity" (input)="set(i, 'included_quantity', $any($event.target).value)" [attr.aria-label]="it.label + ' included'" placeholder="0" /></td>
              <td>
                @for (t of it.tiers; track $index; let j = $index) {
                  <div class="flex items-center gap-1 mb-1">
                    <span class="text-[11px] text-[color:var(--text-muted)]">from</span>
                    <input class="input py-1 text-xs w-24 text-right mono" type="number" min="0" step="any" [value]="t.from" (input)="setTier(i, j, 'from', $any($event.target).value)" aria-label="Tier from" />
                    <span class="text-[11px] text-[color:var(--text-muted)]">at</span>
                    <input class="input py-1 text-xs w-20 text-right mono" type="number" min="0" step="any" [value]="t.unit_price" (input)="setTier(i, j, 'unit_price', $any($event.target).value)" aria-label="Tier price" />
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="removeTier(i, j)" aria-label="Remove tier"><app-icon name="close" size="0.8em" /></button>
                  </div>
                }
                <button type="button" class="btn btn-ghost btn-sm" (click)="addTier(i)"><app-icon name="plus" size="0.8em" />{{ it.tiers.length ? 'Band' : 'Tiers' }}</button>
              </td>
            </tr>
          }
        </tbody>
      </table>
      <div class="card p-4 mt-3">
        <h3 class="text-sm font-semibold">Price a model on its own</h3>
        <p class="text-xs text-[color:var(--text-muted)] mb-2">Tokens of a model with its own price are billed on their own line at that price; every other model stays on the meter's price.</p>
        <div class="flex flex-wrap items-end gap-2">
          <app-field label="Meter" for="rcModelMeter">
            <select id="rcModelMeter" class="input py-1 text-xs" [value]="modelMeter()" (change)="modelMeter.set($any($event.target).value)">
              @for (m of modelMeters; track m) { <option [value]="m">{{ labelOf(m) }}</option> }
            </select></app-field>
          <app-field label="Model" for="rcModelName" hint="As its connection names it, e.g. llama3.2:3b">
            <input id="rcModelName" class="input py-1 text-xs mono w-48" [value]="modelName()" (input)="modelName.set($any($event.target).value)" placeholder="llama3.2:3b" /></app-field>
          <app-field label="Price" for="rcModelPrice">
            <input id="rcModelPrice" class="input py-1 text-xs w-24 text-right mono" type="number" min="0" step="any" [value]="modelPrice()" (input)="modelPrice.set($any($event.target).value)" /></app-field>
          <button type="button" class="btn btn-default btn-sm" (click)="addModel()"><app-icon name="plus" size="0.8em" />Add</button>
        </div>
        @if (modelError()) { <p class="text-xs text-crit-500 mt-1" role="alert">{{ modelError() }}</p> }
      </div>
      <p class="text-xs text-[color:var(--text-muted)] mt-3">
        A period's quantity is priced after the allowance; with tiers, each band prices the units that fall in it (the first band starts at 0 with the price above unless a band says otherwise).
      </p>

      <!-- Owner #23: the version's pricing rules -- part of the version, so a change to one is a new version. -->
      <section class="card p-4 mt-3" data-test="rule-editor" aria-labelledby="rcRulesTitle">
        <div class="flex items-center justify-between gap-2 flex-wrap mb-1">
          <h3 id="rcRulesTitle" class="text-sm font-semibold m-0">Pricing rules <span class="font-normal text-[color:var(--text-muted)]">({{ rules().length }})</span></h3>
          <button type="button" class="btn btn-default btn-sm" (click)="addRule()" data-test="add-rule"><app-icon name="plus" size="0.8em" />Rule</button>
        </div>
        <p class="text-xs text-[color:var(--text-muted)] mb-2">
          A rule gives one meter its own unit price for one pipeline, the pipelines with a tag, or a data class. Usage is matched in the order below —
          a pipeline first, then a tag (the lower number first), then a data class — and usage no rule matches keeps the card's price.
          The meter's unit, allowance and tiers stay the card's: the card's own usage takes the allowance first.
        </p>
        @if (rules().length) {
          <table class="table-modern rate-edit lookup-entry-table" data-test="rule-table">
            <thead><tr><th class="w-12">Order</th><th>Meter</th><th>Matches</th><th class="text-right">Price</th><th>Note</th><th class="w-16"></th></tr></thead>
            <tbody>
              @for (r of orderedRules(); track r.key; let k = $index) {
                <tr [attr.data-rule]="r.rule_no">
                  <td class="tabular text-xs"><div class="font-medium">{{ k + 1 }}</div><div class="text-[11px] text-[color:var(--text-muted)] mono">#{{ r.rule_no }}</div></td>
                  <td>
                    <select class="input py-1 text-xs" [value]="r.meter" (change)="setRule(r.key, 'meter', $any($event.target).value)" [attr.aria-label]="'Rule ' + r.rule_no + ' meter'">
                      @for (it of items(); track it.meter) { <option [value]="it.meter" [selected]="it.meter === r.meter">{{ it.label }}</option> }
                    </select>
                  </td>
                  <td>
                    <div class="flex items-center gap-1 flex-wrap">
                      <select class="input py-1 text-xs w-28" [value]="r.match_kind" (change)="setKind(r.key, $any($event.target).value)" [attr.aria-label]="'Rule ' + r.rule_no + ' matches'">
                        @for (kd of kinds; track kd) { <option [value]="kd" [selected]="kd === r.match_kind">{{ kindLabel(kd) }}</option> }
                      </select>
                      @switch (r.match_kind) {
                        @case ('PIPELINE') {
                          <app-combobox class="w-56" [options]="pipelineOptions()" [selected]="r.match_value" (selectedChange)="pickPipeline(r.key, $event)"
                                        [ariaLabel]="'Rule ' + r.rule_no + ' pipeline'" [placeholder]="pipelinesLoading() ? 'Loading pipelines…' : 'Find a pipeline'" [allowClear]="false" />
                        }
                        @case ('TAG') {
                          <input class="input py-1 text-xs w-40" [value]="r.match_value" (input)="setRule(r.key, 'match_value', $any($event.target).value)"
                                 placeholder="research" [attr.aria-label]="'Rule ' + r.rule_no + ' tag'" />
                        }
                        @default {
                          <select class="input py-1 text-xs w-32" [value]="r.match_value" (change)="setRule(r.key, 'match_value', $any($event.target).value)" [attr.aria-label]="'Rule ' + r.rule_no + ' data class'">
                            @for (c of classes; track c) { <option [value]="c" [selected]="c === r.match_value">{{ c }}</option> }
                          </select>
                        }
                      }
                    </div>
                  </td>
                  <td class="text-right">
                    <input class="input py-1 text-xs w-24 text-right mono" type="number" min="0" step="any" [value]="r.unit_price" (input)="setRule(r.key, 'unit_price', $any($event.target).value)" [attr.aria-label]="'Rule ' + r.rule_no + ' price'" />
                    <div class="text-[11px] text-[color:var(--text-muted)] whitespace-nowrap">card {{ cardPrice(r.meter) }}</div>
                  </td>
                  <td><input class="input py-1 text-xs w-40" [value]="r.note" maxlength="200" (input)="setRule(r.key, 'note', $any($event.target).value)" placeholder="What the bill calls it" [attr.aria-label]="'Rule ' + r.rule_no + ' note'" /></td>
                  <td class="whitespace-nowrap">
                    @if (r.match_kind === 'TAG' && k > 0 && orderedRules()[k - 1].match_kind === 'TAG') {
                      <button type="button" class="btn btn-ghost btn-icon btn-xs" (click)="raiseTag(r.key)" [attr.aria-label]="'Try rule ' + r.rule_no + ' before the tag above'" title="Try before the tag above"><app-icon name="chevronUp" size="0.8em" /></button>
                    }
                    <button type="button" class="btn btn-ghost btn-icon btn-xs" (click)="removeRule(r.key)" [attr.aria-label]="'Remove rule ' + r.rule_no"><app-icon name="close" size="0.8em" /></button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <p class="text-xs text-[color:var(--text-secondary)] m-0">No rules: every meter is priced by the card's own price.</p>
        }
        @if (problems().length) {
          <ul class="text-xs text-crit-500 mt-2 mb-0 pl-4 list-disc" role="alert" data-test="rule-problems">
            @for (p of problems(); track p) { <li>{{ p }}</li> }
          </ul>
        }
      </section>

      @if (preview() || previewing() || previewError()) {
        <section class="card p-4 mt-3" data-test="editor-preview" aria-labelledby="rcPreviewTitle">
          <h3 id="rcPreviewTitle" class="text-sm font-semibold mb-2">What last month would have cost with it</h3>
          @if (previewing()) { <span class="text-xs text-[color:var(--text-muted)]"><span class="spinner inline-block align-middle mr-2"></span>Pricing last month…</span> }
          @else if (previewError()) { <span class="text-xs text-crit-500" role="alert">{{ previewError() }}</span> }
          @else { <app-rate-preview [preview]="preview()" [currency]="data.base.currency" /> }
        </section>
      }

      <ng-container foot>
        @if (error()) { <span class="text-xs text-crit-500 mr-auto">{{ error() }}</span> }
        <button type="button" class="btn btn-ghost btn-sm ml-auto" (click)="ref.close(null)">Cancel</button>
        <button type="button" class="btn btn-default btn-sm" (click)="runPreview()" [disabled]="previewing() || saving()" data-test="preview"><app-icon name="eye" />Preview last month</button>
        <button type="button" class="btn btn-default btn-sm" (click)="saveDraft()" [disabled]="saving()" data-test="save-draft"><app-icon name="file" />Save draft</button>
        <button type="button" class="btn btn-primary btn-sm" (click)="save()" [disabled]="saving()"><app-icon name="save" />{{ saving() ? 'Saving…' : 'Save version' }}</button>
      </ng-container>
    </app-side-panel>
  `,
})
export class RateCardEditor {
  readonly ref = inject<DialogRef<RateCardEditorResult>>(DialogRef);
  readonly data = inject<RateCardEditorData>(DIALOG_DATA);
  private readonly api = inject(BillingApi);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  /** The card the panel opens with: the draft's, else the base version's. */
  private readonly opened: RateCardDraft | null = this.data.draft?.card ?? null;
  readonly name = signal(this.opened?.name ?? '');
  readonly tenantId = signal<string | null>(this.opened ? (this.opened.tenant_id != null ? String(this.opened.tenant_id) : null)
    : this.data.tenantId != null ? String(this.data.tenantId) : (this.data.base.tenant_id != null ? String(this.data.base.tenant_id) : null));
  readonly effectiveFrom = signal(this.opened?.effective_from ?? RateCardEditor.firstOfNextMonth());
  readonly note = signal(this.opened?.note ?? '');
  readonly items = signal<EditItem[]>(this.opened ? this.openedItems(this.opened) : this.data.base.items.map(RateCardEditor.editable));
  readonly saving = signal(false);
  readonly error = signal('');
  readonly forOptions: ComboboxOption[] = [{ value: '', label: 'Every workspace (default card)' }, ...this.data.workspaces];

  // ---- per-model prices (MIG-308) ----
  readonly modelMeters = MODEL_PRICED_METERS;
  readonly modelMeter = signal(MODEL_PRICED_METERS[0]);
  readonly modelName = signal('');
  readonly modelPrice = signal('');
  readonly modelError = signal('');
  /** Per-model items of the base card this version leaves out. */
  readonly removed = signal<string[]>(this.opened?.removed ?? []);

  // ---- pricing rules (owner #23) ----
  readonly kinds = RULE_KINDS;
  readonly classes = DATA_CLASSES;
  private nextKey = 1;
  /** Core's pipelines, read once when a pipeline rule is shown or added (declared before the rules, which may ask for them). */
  readonly pipelines = signal<PipelineChoice[] | null>(null);
  readonly pipelinesLoading = signal(false);
  /** The draft's rules, else the base version's (a new version carries them over, as it carries its items). */
  readonly rules = signal<EditRule[]>((this.opened ? this.opened.rules ?? [] : this.data.base.rules ?? []).map(r => this.editableRule(r)));
  readonly orderedRules = computed(() => byPrecedence(this.rules()));
  /** The server's sentences from the last save, until the rules change. */
  readonly serverProblems = signal<string[]>([]);
  readonly problems = computed(() => [...new Set([...ruleProblems(this.ruleDrafts(), this.items().map(i => i.meter)), ...this.serverProblems()])]);
  /** The pipelines a PIPELINE rule may name: the card's workspace's, or every workspace's for the default card. */
  readonly pipelineOptions = computed<ComboboxOption[]>(() => {
    const tenant = this.tenantId() ? Number(this.tenantId()) : null;
    const listed = (this.pipelines() ?? []).filter(p => tenant == null || p.tenantId === tenant);
    const options = listed.map(p => ({ value: String(p.taskDetailId), label: `${p.taskName}${tenant == null && p.tenantName ? ' — ' + p.tenantName : ''} (#${p.taskDetailId})` }));
    // A rule naming a pipeline the list does not have (deleted, or another workspace's) keeps its value visible.
    for (const r of this.rules()) {
      if (r.match_kind === 'PIPELINE' && r.match_value && !options.some(o => o.value === r.match_value)) options.push({ value: r.match_value, label: `#${r.match_value}` });
    }
    return options;
  });
  // ---- the preview (owner #23, step 4) ----
  readonly preview = signal<RatePreview | null>(null);
  readonly previewing = signal(false);
  readonly previewError = signal('');

  /** Meters whose calculation differs from the card this one is drafted from. */
  readonly changed = computed(() => {
    const base = new Map(this.data.base.items.map(i => [i.meter, RateCardEditor.editable(i)]));
    const out = new Set<string>();
    for (const it of this.items()) {
      const b = base.get(it.meter);
      if (!b || JSON.stringify(RateCardEditor.numeric(b)) !== JSON.stringify(RateCardEditor.numeric(it))) out.add(it.meter);
    }
    return out;
  });

  isModelItem(it: EditItem): boolean { return modelOfMeter(it.meter) !== null; }
  labelOf(meter: string): string { return this.items().find(it => it.meter === meter)?.label ?? meter; }

  /** A price of a model's own, drafted from its meter's item: same unit and per, the price given (else the meter's). */
  addModel(): void {
    const model = this.modelName().trim();
    const meter = this.modelMeter();
    const name = `${meter}@${model}`;
    const base = this.items().find(it => it.meter === meter);
    if (!model) { this.modelError.set('Name the model.'); return; }
    if (model.includes('@')) { this.modelError.set('A model name cannot contain @.'); return; }
    if (name.length > 64) { this.modelError.set('That model name is too long to price on its own (48 characters at most).'); return; }
    if (this.items().some(it => it.meter === name)) { this.modelError.set('That model already has its own price here.'); return; }
    if (!base) { this.modelError.set('This card does not price that meter.'); return; }
    const price = this.modelPrice().trim() === '' ? base.unit_price : this.modelPrice().trim();
    if (Number.isNaN(Number(price)) || Number(price) < 0) { this.modelError.set('The price must be a number, not negative.'); return; }
    this.modelError.set('');
    const item: EditItem = { ...base, meter: name, label: `${base.label} (${model})`, unit_price: price, included_quantity: '', tiers: [] };
    // Next to its meter and the meter's other models, not at the bottom of the list.
    this.items.update(list => {
      let after = list.length - 1;
      list.forEach((it, k) => { if (it.meter === meter || it.meter.startsWith(meter + '@')) after = k; });
      return [...list.slice(0, after + 1), item, ...list.slice(after + 1)];
    });
    this.removed.update(list => list.filter(m => m !== name));
    this.modelName.set(''); this.modelPrice.set('');
  }
  /** Leaves a model's own price out: its tokens go back to the meter's price. A meter's own item stays. */
  removeItem(i: number): void {
    const it = this.items()[i];
    if (!it || !this.isModelItem(it)) return;
    if (this.data.base.items.some(b => b.meter === it.meter)) this.removed.update(list => [...list, it.meter]);
    this.items.update(list => list.filter((_, k) => k !== i));
  }

  set(i: number, key: 'unit_price' | 'included_quantity', value: string): void {
    this.items.update(list => list.map((it, k) => k === i ? { ...it, [key]: value } : it));
  }
  setPer(i: number, value: string): void {
    this.items.update(list => list.map((it, k) => k === i ? { ...it, per: Math.max(1, Math.floor(Number(value) || 1)) } : it));
  }
  addTier(i: number): void {
    this.items.update(list => list.map((it, k) => k === i ? { ...it, tiers: [...it.tiers, { from: it.tiers.length ? '' : '0', unit_price: it.unit_price }] } : it));
  }
  removeTier(i: number, j: number): void {
    this.items.update(list => list.map((it, k) => k === i ? { ...it, tiers: it.tiers.filter((_, x) => x !== j) } : it));
  }
  setTier(i: number, j: number, key: 'from' | 'unit_price', value: string): void {
    this.items.update(list => list.map((it, k) => k === i ? { ...it, tiers: it.tiers.map((t, x) => x === j ? { ...t, [key]: value } : t) } : it));
  }

  // ---- rules ----

  private editableRule(r: RateRule): EditRule {
    if (r.match_kind === 'PIPELINE') this.loadPipelines();
    return { key: this.nextKey++, rule_no: Number(r.rule_no), meter: r.meter, match_kind: r.match_kind, match_value: String(r.match_value ?? ''),
      unit_price: String(r.unit_price ?? ''), note: r.note ?? '' };
  }
  private ruleDrafts(): RateRule[] {
    return this.rules().map(r => ({ rule_no: r.rule_no, meter: r.meter, match_kind: r.match_kind, match_value: r.match_value,
      unit_price: r.unit_price.trim(), note: r.note.trim() || null }));
  }
  kindLabel(kind: RuleKind): string { return kindText(kind); }
  cardPrice(meter: string): string {
    const it = this.items().find(i => i.meter === meter);
    return it ? (it.tiers.length ? 'tiered' : formatUnitPrice(Number(it.unit_price), it.per, it.unit, this.data.base.currency)) : '—';
  }
  addRule(): void {
    const next = Math.max(0, ...this.rules().map(r => r.rule_no)) + 1;
    const meter = this.items().some(i => i.meter === 'pipeline.runs') ? 'pipeline.runs' : this.items()[0]?.meter ?? '';
    this.loadPipelines();
    this.rules.update(list => [...list, { key: this.nextKey++, rule_no: next, meter, match_kind: 'PIPELINE', match_value: '',
      unit_price: this.items().find(i => i.meter === meter)?.unit_price ?? '0', note: '' }]);
    this.serverProblems.set([]);
  }
  removeRule(key: number): void { this.rules.update(list => list.filter(r => r.key !== key)); this.serverProblems.set([]); }
  setRule(key: number, field: 'meter' | 'match_value' | 'unit_price' | 'note', value: string): void {
    this.rules.update(list => list.map(r => r.key === key ? { ...r, [field]: value } : r));
    this.serverProblems.set([]);
  }
  setKind(key: number, kind: RuleKind): void {
    if (kind === 'PIPELINE') this.loadPipelines();
    this.rules.update(list => list.map(r => r.key === key ? { ...r, match_kind: kind, match_value: kind === 'CLASS' ? 'sensitive' : '' } : r));
    this.serverProblems.set([]);
  }
  /** A pipeline picked: its id is the rule's value, and its name the note when none was written. */
  pickPipeline(key: number, value: string): void {
    const picked = (this.pipelines() ?? []).find(p => String(p.taskDetailId) === value);
    this.rules.update(list => list.map(r => r.key === key ? { ...r, match_value: value, note: r.note || picked?.taskName || '' } : r));
    this.serverProblems.set([]);
  }
  /** Tags are tried lowest number first: this tag rule swaps numbers with the tag rule tried before it. */
  raiseTag(key: number): void {
    const ordered = this.orderedRules();
    const k = ordered.findIndex(r => r.key === key);
    if (k < 1 || ordered[k - 1].match_kind !== 'TAG' || ordered[k].match_kind !== 'TAG') return;
    const [a, b] = [ordered[k - 1], ordered[k]];
    this.rules.update(list => list.map(r => r.key === a.key ? { ...r, rule_no: b.rule_no } : r.key === b.key ? { ...r, rule_no: a.rule_no } : r));
  }
  private loadPipelines(): void {
    if (this.pipelines() || this.pipelinesLoading()) return;
    this.pipelinesLoading.set(true);
    this.http.post<ApiResponse<PipelineChoice[]>>(`${API_BASE}/sourceTask.json/listSourceTask`, {}, { params: { limit: LIST_LIMIT } }).subscribe({
      next: r => { this.pipelinesLoading.set(false); this.pipelines.set(r.status === API_SUCCESS ? r.data ?? [] : []); },
      error: () => { this.pipelinesLoading.set(false); this.pipelines.set([]); },
    });
  }

  /** The panel's card for a draft: its items, named as the base version names them. */
  private openedItems(card: RateCardDraft): EditItem[] {
    const labels = new Map(this.data.base.items.map(i => [i.meter, i]));
    return card.items.map(i => RateCardEditor.editable({ ...labels.get(i.meter), ...i, label: labels.get(i.meter)?.label ?? i.meter,
      service: labels.get(i.meter)?.service } as RateItem));
  }

  draft(): RateCardDraft | string {
    if (!this.name().trim()) return 'Give the version a name.';
    if (!this.effectiveFrom()) return 'Say when it takes effect.';
    const items: RateCardDraft['items'] = [];
    for (const it of this.items()) {
      const n = RateCardEditor.numeric(it);
      if (n.unit_price < 0 || n.included_quantity < 0 || n.tiers.some(t => t.from < 0 || t.unit_price < 0)) return `${it.label}: nothing can be negative.`;
      if (Number.isNaN(n.unit_price) || n.tiers.some(t => Number.isNaN(t.from) || Number.isNaN(t.unit_price))) return `${it.label}: a price is missing.`;
      items.push({ meter: it.meter, unit: it.unit, per: it.per, ...n });
    }
    if (ruleProblems(this.ruleDrafts(), items.map(i => i.meter)).length) return 'Fix the pricing rules first.';
    return {
      name: this.name().trim(), tenant_id: this.tenantId() ? Number(this.tenantId()) : null, effective_from: this.effectiveFrom(),
      currency: this.data.base.currency, based_on_version: this.data.base.version, note: this.note().trim(), items,
      ...(this.removed().length ? { removed: this.removed() } : {}),
      // Every rule the version carries, always: an empty list is "no rules", never "the base's".
      rules: byPrecedence(this.ruleDrafts()),
    };
  }

  /** A refusal: its message, and the server's sentence per rule problem under the rules. */
  private refused(r: ApiResponse<unknown>): void {
    const problems = (r.data as { problems?: string[] } | null)?.problems ?? [];
    this.serverProblems.set(problems.filter(p => /^Rule \d/.test(p)));
    this.error.set(problems.length > 1 ? `${problems.length} problems: see below.` : r.message);
  }

  /** Publishes: a new version straight from a published base, or the draft saved then published. */
  save(): void {
    const draft = this.draft();
    if (typeof draft === 'string') { this.error.set(draft); return; }
    this.error.set(''); this.saving.set(true);
    const done = (r: ApiResponse<RateCard>) => {
      this.saving.set(false);
      if (r.status !== API_SUCCESS || !r.data) { this.refused(r); return; }
      this.toast.success(`${r.data.name} saved as v${r.data.version}.`);
      this.ref.close(r.data);
    };
    const failed = (err: { error?: { message?: string } }) => { this.saving.set(false); this.error.set(err?.error?.message || 'The version could not be saved.'); };
    const draftId = this.data.draft?.draft_id;
    if (draftId == null) { this.api.saveRateCard(draft).subscribe({ next: done, error: failed }); return; }
    this.api.saveRateCardDraft(draft, draftId).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.saving.set(false); this.refused(r); return; }
        this.api.publishRateCardDraft(draftId).subscribe({ next: done, error: failed });
      },
      error: failed,
    });
  }

  /** Saves a draft: it prices nothing until it is published. */
  saveDraft(): void {
    const draft = this.draft();
    if (typeof draft === 'string') { this.error.set(draft); return; }
    this.error.set(''); this.saving.set(true);
    this.api.saveRateCardDraft(draft, this.data.draft?.draft_id).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.refused(r); return; }
        this.toast.success(`${r.data.name} saved as a draft.`);
        this.ref.close(r.data);
      },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message || 'The draft could not be saved.'); },
    });
  }

  /** What last month would have cost with the card as it stands in the panel (nothing is saved). */
  runPreview(): void {
    const draft = this.draft();
    if (typeof draft === 'string') { this.error.set(draft); return; }
    this.error.set(''); this.previewing.set(true); this.previewError.set('');
    this.api.previewRateCard({ card: draft }).subscribe({
      next: r => {
        this.previewing.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.preview.set(null); this.previewError.set(r.message); this.refused(r); return; }
        this.preview.set(r.data);
      },
      error: err => { this.previewing.set(false); this.previewError.set(err?.error?.message || 'The preview could not be priced.'); },
    });
  }

  static editable(i: RateItem): EditItem {
    return {
      meter: i.meter, label: i.label ?? i.meter, service: i.service ?? '', unit: i.unit, per: Number(i.per) || 1,
      unit_price: String(i.unit_price ?? 0), included_quantity: Number(i.included_quantity) ? String(i.included_quantity) : '',
      tiers: (i.tiers ?? []).map(t => ({ from: String(t.from ?? 0), unit_price: String(t.unit_price) })),
    };
  }
  static numeric(it: EditItem): { unit_price: number; included_quantity: number; tiers: RateTier[] } {
    return {
      unit_price: Number(it.unit_price), included_quantity: Number(it.included_quantity) || 0,
      tiers: it.tiers.map(t => ({ from: Number(t.from), unit_price: Number(t.unit_price) })).sort((a, b) => a.from - b.from),
    };
  }
  static firstOfNextMonth(): string { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1); return firstOfMonth(d); }
}
