import { Component, computed, input, output, signal } from '@angular/core';
import { Icon } from '../../../shared/ui/icon';
import { FROM_OPTIONS, JsonFrom, JsonKey, JsonType, TYPE_OPTIONS, cleanKey, keyClash, keySource, shapeFromExample } from './build-json.model';
import { StepProblem } from './steps.model';

/** The most keys a document and an item of a list hold (Core's schema: 200 and 100). */
const MAX_KEYS = 200;
const MAX_ITEM_KEYS = 100;

/**
 * MIG-451: Build JSON's shape editor -- the document's keys in order, each a dot path (patient.id nests an object) filled
 * from a column, a fixed value, a formula, a list of a column's values, or a list of objects with keys of their own. A
 * shape can be started from an example of the JSON wanted (pasted). Core checks it all again; its problems show on the
 * key they are about. The rest of the step's settings (Make, Group by, Write it...) are the schema form's.
 */
@Component({
  selector: 'app-build-json-editor',
  imports: [Icon],
  styles: `
    .bj-keys { display: flex; flex-direction: column; gap: 0.5rem; }
    .bj-row { display: grid; grid-template-columns: minmax(9rem, 1.2fr) minmax(8rem, 0.9fr) minmax(10rem, 1.6fr) minmax(7rem, 0.8fr) auto; gap: 0.375rem; align-items: start; }
    .bj-item { margin-left: 1.25rem; padding-left: 0.75rem; border-left: 2px solid var(--border-strong); display: flex; flex-direction: column; gap: 0.375rem; }
    .bj-head { font-size: 11px; font-weight: 600; color: var(--text-muted); }
    .bj-problem { font-size: 12px; color: var(--color-crit-500); }
    .bj-tools { display: flex; gap: 0.25rem; }
  `,
  template: `
    <section class="flex flex-col gap-3 min-w-0" aria-labelledby="bjHeading" data-test="build-json-editor">
      <div class="flex items-center gap-2 flex-wrap">
        <h3 id="bjHeading" class="section-title">Shape</h3>
        <span class="field-note text-[color:var(--text-muted)]">A dot in a key nests an object: patient.id, patient.name.</span>
        @if (!disabled()) {
          <button type="button" class="btn btn-default btn-sm ml-auto" data-test="bj-example-toggle" (click)="exampleOpen.set(!exampleOpen())">
            <app-icon name="code" />Start from an example
          </button>
        }
      </div>
      @if (exampleOpen()) {
        <div class="card p-4 flex flex-col gap-2" data-test="bj-example">
          <label class="label" for="bjExample">An example of the JSON wanted</label>
          <textarea id="bjExample" class="input mono text-xs resize-y min-h-32" spellcheck="false" [value]="example()"
                    placeholder='{ "patient": { "id": "P-101", "name": "…" }, "findings": [ { "code": "L89.1", "text": "…" } ], "source": "etl-console" }'
                    (input)="example.set($any($event.target).value)"></textarea>
          <p class="field-note">Each value becomes a key: a column of the same name when the rows have one, else the example's value. A list of
            objects becomes a list of objects, one per row. The keys replace the ones above.</p>
          @if (exampleError()) { <p class="bj-problem" role="alert">{{ exampleError() }}</p> }
          <div class="flex gap-2">
            <button type="button" class="btn btn-primary btn-sm" data-test="bj-example-use" [disabled]="!example().trim()" (click)="useExample()">
              <app-icon name="check" />Use these keys
            </button>
            <button type="button" class="btn btn-ghost btn-sm" (click)="exampleOpen.set(false)">Cancel</button>
          </div>
        </div>
      }

      <datalist id="bj-columns">@for (c of columns(); track c) { <option [value]="c"></option> }</datalist>
      <div class="bj-keys">
        @if (keys().length) {
          <div class="bj-row bj-head" aria-hidden="true"><span>Key</span><span>From</span><span>Value</span><span>Type</span><span></span></div>
        }
        @for (k of keys(); track $index; let i = $index) {
          <div class="flex flex-col gap-1" [attr.data-key]="k.key">
            <div class="bj-row">
              <input class="input mono" [value]="k.key" [disabled]="disabled()" maxlength="520" [attr.aria-label]="'Key ' + (i + 1)"
                     [class.input-invalid]="!!problemOf(i)" placeholder="patient.id" (input)="patch(i, { key: $any($event.target).value })" />
              <select class="input" [value]="k.from ?? 'column'" [disabled]="disabled()" [attr.aria-label]="'Where ' + (k.key || 'key ' + (i + 1)) + ' comes from'"
                      (change)="setFrom(i, $any($event.target).value)">
                @for (f of froms; track f.id) { <option [value]="f.id" [selected]="(k.from ?? 'column') === f.id" [title]="f.hint">{{ f.label }}</option> }
              </select>
              @switch (k.from ?? 'column') {
                @case ('value') {
                  <input class="input mono" [value]="valueText(k.value)" [disabled]="disabled()" [attr.aria-label]="'Value of ' + (k.key || 'key')"
                         placeholder="etl-console" (input)="patch(i, { value: valueOf($any($event.target).value) })" />
                }
                @case ('expression') {
                  <input class="input mono" [value]="k.expression ?? ''" [disabled]="disabled()" [attr.aria-label]="'Formula of ' + (k.key || 'key')"
                         placeholder="concat(first_name, ' ', last_name)" (input)="patch(i, { expression: $any($event.target).value })" />
                }
                @case ('rows') {
                  <label class="flex items-center gap-2 text-sm py-1.5">
                    <input type="checkbox" [checked]="!!k.distinct" [disabled]="disabled()" (change)="patch(i, { distinct: $any($event.target).checked })" />
                    Leave out repeats
                  </label>
                }
                @default {
                  <div class="flex flex-col gap-1">
                    <input class="input mono" [value]="k.column ?? ''" [disabled]="disabled()" list="bj-columns" autocomplete="off"
                           [attr.aria-label]="'Column of ' + (k.key || 'key')" placeholder="a column" (input)="patch(i, { column: $any($event.target).value })" />
                    @if (k.from === 'list') {
                      <label class="flex items-center gap-2 text-xs">
                        <input type="checkbox" [checked]="!!k.distinct" [disabled]="disabled()" (change)="patch(i, { distinct: $any($event.target).checked })" />
                        Leave out repeats
                      </label>
                    }
                  </div>
                }
              }
              @if ((k.from ?? 'column') === 'rows') { <span class="field-note py-1.5">{{ (k.fields ?? []).length }} key{{ (k.fields ?? []).length === 1 ? '' : 's' }} each</span> }
              @else {
                <select class="input" [value]="k.type ?? 'auto'" [disabled]="disabled()" [attr.aria-label]="'Type of ' + (k.key || 'key')"
                        (change)="patch(i, { type: $any($event.target).value })">
                  @for (t of types; track t.id) { <option [value]="t.id" [selected]="(k.type ?? 'auto') === t.id">{{ t.label }}</option> }
                </select>
              }
              <div class="bj-tools">
                <button type="button" class="btn btn-ghost btn-sm btn-icon" [disabled]="disabled() || i === 0" [attr.aria-label]="'Move ' + (k.key || 'key') + ' up'"
                        title="Move up" (click)="move(i, -1)"><app-icon name="sort" /></button>
                <button type="button" class="btn btn-ghost btn-sm btn-icon" [disabled]="disabled()" [attr.aria-label]="'Remove ' + (k.key || 'key')"
                        title="Remove" (click)="remove(i)"><app-icon name="trash" /></button>
              </div>
            </div>
            @if (problemOf(i); as p) { <p class="bj-problem">{{ p }}</p> }
            @if ((k.from ?? 'column') === 'rows') {
              <div class="bj-item" [attr.data-item-of]="k.key">
                @for (f of k.fields ?? []; track $index; let j = $index) {
                  <div class="bj-row">
                    <input class="input mono" [value]="f.key" [disabled]="disabled()" [attr.aria-label]="'Key ' + (j + 1) + ' of each ' + (k.key || 'item')"
                           [class.input-invalid]="!!innerProblem(i, j)" placeholder="code" (input)="patchInner(i, j, { key: $any($event.target).value })" />
                    <select class="input" [value]="f.from ?? 'column'" [disabled]="disabled()" [attr.aria-label]="'Where ' + (f.key || 'it') + ' comes from'"
                            (change)="patchInner(i, j, { from: $any($event.target).value })">
                      @for (o of innerFroms; track o.id) { <option [value]="o.id" [selected]="(f.from ?? 'column') === o.id">{{ o.label }}</option> }
                    </select>
                    @switch (f.from ?? 'column') {
                      @case ('value') {
                        <input class="input mono" [value]="valueText(f.value)" [disabled]="disabled()" [attr.aria-label]="'Value of ' + (f.key || 'key')"
                               (input)="patchInner(i, j, { value: valueOf($any($event.target).value) })" />
                      }
                      @case ('expression') {
                        <input class="input mono" [value]="f.expression ?? ''" [disabled]="disabled()" [attr.aria-label]="'Formula of ' + (f.key || 'key')"
                               (input)="patchInner(i, j, { expression: $any($event.target).value })" />
                      }
                      @default {
                        <input class="input mono" [value]="f.column ?? ''" [disabled]="disabled()" list="bj-columns" autocomplete="off"
                               [attr.aria-label]="'Column of ' + (f.key || 'key')" (input)="patchInner(i, j, { column: $any($event.target).value })" />
                      }
                    }
                    <select class="input" [value]="f.type ?? 'auto'" [disabled]="disabled()" [attr.aria-label]="'Type of ' + (f.key || 'key')"
                            (change)="patchInner(i, j, { type: $any($event.target).value })">
                      @for (t of types; track t.id) { <option [value]="t.id" [selected]="(f.type ?? 'auto') === t.id">{{ t.label }}</option> }
                    </select>
                    <div class="bj-tools">
                      <button type="button" class="btn btn-ghost btn-sm btn-icon" [disabled]="disabled()" [attr.aria-label]="'Remove ' + (f.key || 'key') + ' of each item'"
                              title="Remove" (click)="removeInner(i, j)"><app-icon name="trash" /></button>
                    </div>
                  </div>
                  @if (innerProblem(i, j); as p) { <p class="bj-problem">{{ p }}</p> }
                }
                @if (!disabled() && (k.fields ?? []).length < maxItemKeys) {
                  <button type="button" class="btn btn-default btn-sm self-start" (click)="addInner(i)"><app-icon name="plus" />Add a key to each item</button>
                }
              </div>
            }
          </div>
        } @empty {
          <p class="field-note">No keys yet: add one, or start from an example of the JSON wanted.</p>
        }
      </div>
      @if (!disabled() && keys().length < maxKeys) {
        <div class="flex gap-2 flex-wrap">
          <button type="button" class="btn btn-default btn-sm" data-test="bj-add-key" (click)="add('column')"><app-icon name="plus" />Add a key</button>
          <button type="button" class="btn btn-default btn-sm" data-test="bj-add-rows" (click)="add('rows')"><app-icon name="list" />Add a list of objects</button>
        </div>
      }
      @if (general(); as g) { <p class="bj-problem" role="alert">{{ g }}</p> }
      @if (keys().length) {
        <p class="field-note text-[color:var(--text-muted)]" data-test="bj-outline">{{ outline() }}</p>
      }
    </section>
  `,
})
export class BuildJsonEditor {
  readonly keys = input<JsonKey[]>([]);
  readonly columns = input<string[]>([]);
  readonly disabled = input(false);
  /** The server's problems with the step's settings, at paths relative to the config ("fields[2].column"). */
  readonly problems = input<StepProblem[]>([]);
  readonly changed = output<JsonKey[]>();

  readonly froms = FROM_OPTIONS;
  readonly innerFroms = FROM_OPTIONS.filter(f => f.id === 'column' || f.id === 'value' || f.id === 'expression');
  readonly types = TYPE_OPTIONS;
  readonly maxKeys = MAX_KEYS;
  readonly maxItemKeys = MAX_ITEM_KEYS;
  readonly exampleOpen = signal(false);
  readonly example = signal('');
  readonly exampleError = signal('');

  /** "patient.id ← patient_id · findings ← [{code, text}] · source ← "etl-console"": the shape in one line. */
  readonly outline = computed(() => this.keys().map(k => `${k.key || '?'} ← ${keySource(k) || '?'}`).join(' · '));
  readonly general = computed(() => this.problems().filter(p => p.field === 'fields').map(p => p.message).join(' · '));

  problemOf(i: number): string {
    const server = this.problems().filter(p => p.field.startsWith(`fields[${i}].`) && !p.field.startsWith(`fields[${i}].fields[`))
      .map(p => p.message);
    const clash = keyClash(this.keys(), i);
    return [...(clash ? [clash] : []), ...server].join(' · ');
  }

  innerProblem(i: number, j: number): string {
    const inner = this.keys()[i]?.fields ?? [];
    const clash = keyClash(inner, j);
    const server = this.problems().filter(p => p.field.startsWith(`fields[${i}].fields[${j}]`)).map(p => p.message);
    return [...(clash ? [clash] : []), ...server].join(' · ');
  }

  valueText(v: unknown): string { return v === null || v === undefined ? '' : String(v); }

  /** A fixed value as typed: a plain number, true, false and null are written as such; anything else is text. */
  valueOf(raw: string): string | number | boolean | null {
    const t = raw.trim();
    if (t === 'null' || t === '') return t === 'null' ? null : '';
    if (t === 'true' || t === 'false') return t === 'true';
    if (/^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(t)) return Number(t);
    return raw;
  }

  add(from: JsonFrom): void {
    const next: JsonKey = from === 'rows' ? { key: '', from: 'rows', fields: [{ key: '', column: '' }] } : { key: '', column: '' };
    this.emit([...this.keys(), next]);
  }

  remove(i: number): void { this.emit(this.keys().filter((_, n) => n !== i)); }

  move(i: number, by: number): void {
    const list = [...this.keys()];
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.emit(list);
  }

  patch(i: number, change: Partial<JsonKey>): void {
    this.emit(this.keys().map((k, n) => (n === i ? { ...k, ...change } : k)));
  }

  setFrom(i: number, from: JsonFrom): void {
    const k = this.keys()[i];
    const fields = from === 'rows' ? (k.fields?.length ? k.fields : [{ key: '', column: '' }]) : undefined;
    this.patch(i, { from, fields, type: from === 'rows' ? undefined : k.type as JsonType | undefined });
  }

  addInner(i: number): void {
    this.patch(i, { fields: [...(this.keys()[i].fields ?? []), { key: '', column: '' }] });
  }

  removeInner(i: number, j: number): void {
    this.patch(i, { fields: (this.keys()[i].fields ?? []).filter((_, n) => n !== j) });
  }

  patchInner(i: number, j: number, change: Partial<JsonKey>): void {
    this.patch(i, { fields: (this.keys()[i].fields ?? []).map((f, n) => (n === j ? { ...f, ...change } : f)) });
  }

  useExample(): void {
    try {
      const keys = shapeFromExample(JSON.parse(this.example()), this.columns());
      if (!keys.length) { this.exampleError.set('The example has no keys.'); return; }
      this.exampleError.set('');
      this.exampleOpen.set(false);
      this.emit(keys);
    } catch (e) {
      this.exampleError.set(e instanceof SyntaxError ? `Not JSON: ${e.message}` : (e as Error).message);
    }
  }

  private emit(keys: JsonKey[]): void {
    this.changed.emit(keys.map(k => cleanKey(k)));
  }
}
