import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../core/api/api.config';
import { ToastService } from '../../shared/ui/toast.service';
import { SidePanel } from '../../shared/ui/side-panel';
import { Icon } from '../../shared/ui/icon';
import { Field } from '../../shared/ui/field';
import { Combobox, ComboboxOption } from '../../shared/ui/combobox';
import { BillingApi, MODEL_PRICED_METERS, RateCard, RateCardDraft, RateItem, RateTier, modelOfMeter } from './billing.service';
import { firstOfMonth } from './billing-format';

/** One item as it is being edited: strings in the inputs, numbers on save. */
interface EditItem {
  meter: string; label: string; service: string; unit: string; per: number;
  unit_price: string; included_quantity: string; tiers: { from: string; unit_price: string }[];
}
export interface RateCardEditorData { base: RateCard; workspaces: ComboboxOption[]; tenantId?: number | null; }

/**
 * A new version of the calculation, drafted from an existing one. Nothing here edits a saved
 * card: the meter keeps every version, and a bill names the one that priced it. What can
 * change per item is the price, what it is priced per, a monthly allowance, and graduated tiers.
 */
@Component({
  selector: 'app-rate-card-editor',
  imports: [SidePanel, Icon, Combobox, Field],
  template: `
    <app-side-panel [heading]="'New version from ' + data.base.name + ' v' + data.base.version" subtitle="Saved as its own version; bills already drafted keep the one they were priced with.">
      <div class="form-grid mb-4">
        <app-field class="col-span-2" label="Name" for="rcName" [required]="true">
          <input id="rcName" class="input" [value]="name()" (input)="name.set($any($event.target).value)" placeholder="What changed, or who it is for" /></app-field>
        <app-field label="For" for="rcFor" hint="A workspace's own card wins over the default from its effective date.">
          <app-combobox id="rcFor" [selected]="tenantId() ?? ''" (selectedChange)="tenantId.set($event || null)" [options]="forOptions" [allowClear]="false" placeholder="Every workspace" /></app-field>
        <app-field label="Effective from" for="rcFrom" [required]="true" hint="Prices bills for periods that start on or after this day.">
          <input id="rcFrom" class="input mono" type="date" [value]="effectiveFrom()" (input)="effectiveFrom.set($any($event.target).value)" /></app-field>
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

      <ng-container foot>
        @if (error()) { <span class="text-xs text-crit-500 mr-auto">{{ error() }}</span> }
        <button type="button" class="btn btn-ghost btn-sm ml-auto" (click)="ref.close(null)">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" (click)="save()" [disabled]="saving()"><app-icon name="save" />{{ saving() ? 'Saving…' : 'Save version' }}</button>
      </ng-container>
    </app-side-panel>
  `,
})
export class RateCardEditor {
  readonly ref = inject<DialogRef<RateCard | null>>(DialogRef);
  readonly data = inject<RateCardEditorData>(DIALOG_DATA);
  private readonly api = inject(BillingApi);
  private readonly toast = inject(ToastService);

  readonly name = signal('');
  readonly tenantId = signal<string | null>(this.data.tenantId != null ? String(this.data.tenantId) : (this.data.base.tenant_id != null ? String(this.data.base.tenant_id) : null));
  readonly effectiveFrom = signal(RateCardEditor.firstOfNextMonth());
  readonly note = signal('');
  readonly items = signal<EditItem[]>(this.data.base.items.map(RateCardEditor.editable));
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
  readonly removed = signal<string[]>([]);

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
    return {
      name: this.name().trim(), tenant_id: this.tenantId() ? Number(this.tenantId()) : null, effective_from: this.effectiveFrom(),
      currency: this.data.base.currency, based_on_version: this.data.base.version, note: this.note().trim(), items,
      ...(this.removed().length ? { removed: this.removed() } : {}),
    };
  }

  save(): void {
    const draft = this.draft();
    if (typeof draft === 'string') { this.error.set(draft); return; }
    this.error.set(''); this.saving.set(true);
    this.api.saveRateCard(draft).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message); return; }
        this.toast.success(`${r.data.name} saved as v${r.data.version}.`);
        this.ref.close(r.data);
      },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message || 'The version could not be saved.'); },
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
