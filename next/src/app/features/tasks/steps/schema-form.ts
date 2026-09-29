import { Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { Field } from '../../../shared/ui/field';
import { Icon } from '../../../shared/ui/icon';
import { FieldSpec, JsonSchema, StepProblem, coerce, fieldsOf, parseJson, withValue } from './steps.model';

/**
 * A step's settings as a form, drawn from its task's JSON Schema (MIG-249 on MIG-231's configSchema): text and long
 * text, whole and decimal numbers, a switch, a choice from an enum, a list of plain values (one per line), a nested
 * object, a list of objects (rows with Add and Remove) -- and a raw-JSON box for a setting the schema says in a way a
 * form cannot (oneOf, a map, a list of lists). Nested objects are this same form, one level down.
 *
 * It keeps what it last handed back, so a parent that does not feed each change straight back still sees every edit
 * build on the one before. A problem from the server is shown at the setting its path names.
 */
@Component({
  selector: 'app-schema-form',
  imports: [Field, Icon],
  template: `
    <div class="flex flex-col gap-3 min-w-0">
      @for (f of fields(); track f.name) {
        @switch (f.kind) {
          @case ('boolean') {
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [hint]="f.description" [error]="errorOf(f)">
              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" class="checkbox" [id]="idOf(f)" [checked]="current()[f.name] === true" [disabled]="disabled()"
                       (change)="set(f.name, $any($event.target).checked)" />
                Yes
              </label>
            </app-field>
          }
          @case ('enum') {
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [hint]="f.description" [error]="errorOf(f)">
              <select [id]="idOf(f)" class="input" [value]="choiceIndex(f)" [disabled]="disabled()" (change)="pick(f, $any($event.target).value)">
                <option value="">{{ f.required ? 'Choose…' : 'None' }}</option>
                @for (option of f.options; track $index) {
                  <option [value]="'' + $index" [selected]="choiceIndex(f) === '' + $index">{{ optionText(option) }}</option>
                }
              </select>
            </app-field>
          }
          @case ('textarea') {
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [hint]="f.description" [error]="errorOf(f)">
              <textarea [id]="idOf(f)" class="input" rows="4" [value]="textOf(f)" [disabled]="disabled()"
                        (input)="set(f.name, coerceText(f, $any($event.target).value))"></textarea>
            </app-field>
          }
          @case ('list') {
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [error]="errorOf(f)"
                       [hint]="(f.description ? f.description + ' ' : '') + 'One per line.'">
              <textarea [id]="idOf(f)" class="input mono text-xs" rows="4" [value]="listText(f)" [disabled]="disabled()"
                        (input)="typeList(f, $any($event.target).value)"></textarea>
            </app-field>
          }
          @case ('object') {
            <fieldset class="schema-group min-w-0">
              <p class="label">{{ f.label }}@if (f.required) { <span class="text-crit-500 ml-0.5" aria-hidden="true">*</span> }</p>
              @if (f.description) { <p class="field-note text-[color:var(--text-muted)] -mt-1 mb-2">{{ f.description }}</p> }
              <app-schema-form [schema]="f.schema" [value]="objectOf(f)" [problems]="problemsUnder(f.name)" [idPrefix]="idOf(f)"
                               [disabled]="disabled()" (valueChange)="set(f.name, $event)" />
            </fieldset>
          }
          @case ('objects') {
            <fieldset class="schema-group min-w-0">
              <div class="flex items-center gap-2">
                <p class="label mb-0">{{ f.label }}@if (f.required) { <span class="text-crit-500 ml-0.5" aria-hidden="true">*</span> }</p>
                @if (!disabled()) {
                  <button type="button" class="btn btn-ghost btn-sm ml-auto" [attr.aria-label]="'Add a row to ' + f.label" (click)="addRow(f)">
                    <app-icon name="plus" />Add
                  </button>
                }
              </div>
              @if (f.description) { <p class="field-note text-[color:var(--text-muted)] mb-2">{{ f.description }}</p> }
              @for (row of rowsOf(f); track $index; let i = $index) {
                <div class="schema-row">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs text-[color:var(--text-muted)] mono">#{{ i + 1 }}</span>
                    @if (!disabled()) {
                      <button type="button" class="btn btn-ghost btn-icon btn-sm ml-auto" [attr.aria-label]="'Remove row ' + (i + 1) + ' of ' + f.label"
                              (click)="removeRow(f, i)"><app-icon name="trash" class="icon-crit" /></button>
                    }
                  </div>
                  <app-schema-form [schema]="f.schema.items!" [value]="row" [problems]="problemsUnder(f.name + '[' + i + ']')"
                                   [idPrefix]="idOf(f) + '-' + i" [disabled]="disabled()" (valueChange)="setRow(f, i, $event)" />
                </div>
              } @empty {
                <p class="text-xs text-[color:var(--text-muted)]">None yet.</p>
              }
              @for (message of ownProblems(f.name); track $index) {
                <p class="field-note text-crit-500" role="alert">{{ message }}</p>
              }
            </fieldset>
          }
          @case ('json') {
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [error]="errorOf(f)"
                       [hint]="(f.description ? f.description + ' ' : '') + 'As JSON: this setting takes a shape the form cannot draw.'">
              <textarea [id]="idOf(f)" class="input mono text-xs" rows="3" [value]="jsonText(f)" [disabled]="disabled()"
                        (input)="typeJson(f, $any($event.target).value)"></textarea>
            </app-field>
          }
          @default {
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [hint]="f.description" [error]="errorOf(f)">
              <input [id]="idOf(f)" class="input" [type]="f.kind === 'number' || f.kind === 'integer' ? 'number' : 'text'"
                     [attr.step]="f.kind === 'integer' ? 1 : null" [value]="textOf(f)" [disabled]="disabled()"
                     (input)="set(f.name, coerceText(f, $any($event.target).value))" />
            </app-field>
          }
        }
      }
    </div>
  `,
})
export class SchemaForm {
  readonly schema = input.required<JsonSchema>();
  readonly value = input<Record<string, unknown> | null | undefined>(null);
  /** The server's problems below this object, each at a path relative to it ("columns", "rows[0].id"). */
  readonly problems = input<StepProblem[]>([]);
  /** Prefixes every control's id, so a nested form's ids stay unique and a label's `for` finds its box. */
  readonly idPrefix = input('cfg');
  readonly disabled = input(false);
  readonly valueChange = output<Record<string, unknown>>();

  readonly fields = computed(() => fieldsOf(this.schema()));
  /** What this form last handed back, until the parent hands it a new value. */
  readonly current = linkedSignal<Record<string, unknown>>(() => ({ ...(this.value() ?? {}) }));
  /** What a raw-JSON or list box holds as typed: a half-typed value is not reformatted under the cursor. */
  private readonly typed = signal<Record<string, string>>({});
  private readonly jsonErrors = signal<Record<string, string>>({});

  idOf(f: FieldSpec): string { return `${this.idPrefix()}-${f.name}`; }

  set(name: string, value: unknown): void {
    const next = withValue(this.current(), name, value);
    this.current.set(next);
    this.valueChange.emit(next);
  }

  textOf(f: FieldSpec): string {
    const v = this.current()[f.name];
    return v === undefined || v === null ? '' : String(v);
  }

  coerceText(f: FieldSpec, raw: string): unknown { return coerce(f.kind, raw); }

  optionText(option: unknown): string { return typeof option === 'string' ? option : JSON.stringify(option); }

  /** The enum's options are bound by index: a choice may be a number or true, which a <select> would turn into text. */
  choiceIndex(f: FieldSpec): string {
    const v = this.current()[f.name];
    const at = f.options.findIndex(o => JSON.stringify(o) === JSON.stringify(v));
    return at < 0 ? '' : String(at);
  }

  pick(f: FieldSpec, index: string): void {
    this.set(f.name, index === '' ? undefined : structuredClone(f.options[Number(index)]));
  }

  listText(f: FieldSpec): string {
    const typed = this.typed()[f.name];
    if (typed !== undefined) return typed;
    const v = this.current()[f.name];
    return Array.isArray(v) ? v.map(x => String(x ?? '')).join('\n') : '';
  }

  typeList(f: FieldSpec, text: string): void {
    this.typed.update(t => ({ ...t, [f.name]: text }));
    const items = text.split('\n').map(line => line.trim()).filter(Boolean).map(line => coerce(f.itemKind, line));
    this.set(f.name, items);
  }

  jsonText(f: FieldSpec): string {
    const typed = this.typed()[f.name];
    if (typed !== undefined) return typed;
    const v = this.current()[f.name];
    return v === undefined ? '' : JSON.stringify(v, null, 2);
  }

  typeJson(f: FieldSpec, text: string): void {
    this.typed.update(t => ({ ...t, [f.name]: text }));
    const parsed = parseJson(text);
    if (parsed.error) {
      this.jsonErrors.update(e => ({ ...e, [f.name]: `Not JSON: ${parsed.error}` }));
      return;
    }
    this.jsonErrors.update(e => { const { [f.name]: _gone, ...rest } = e; return rest; });
    this.set(f.name, parsed.value);
  }

  objectOf(f: FieldSpec): Record<string, unknown> {
    const v = this.current()[f.name];
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  }

  rowsOf(f: FieldSpec): Record<string, unknown>[] {
    const v = this.current()[f.name];
    return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
  }

  addRow(f: FieldSpec): void { this.set(f.name, [...this.rowsOf(f), {}]); }

  removeRow(f: FieldSpec, index: number): void { this.set(f.name, this.rowsOf(f).filter((_, i) => i !== index)); }

  setRow(f: FieldSpec, index: number, row: Record<string, unknown>): void {
    this.set(f.name, this.rowsOf(f).map((r, i) => (i === index ? row : r)));
  }

  /** The problems at this very setting. */
  ownProblems(name: string): string[] {
    return this.problems().filter(p => p.field === name).map(p => p.message);
  }

  /** The problems below a setting, re-pathed for the form one level down. */
  problemsUnder(prefix: string): StepProblem[] {
    return this.problems()
      .filter(p => p.field.startsWith(`${prefix}.`) || p.field.startsWith(`${prefix}[`))
      .map(p => ({ field: p.field.slice(prefix.length).replace(/^\./, ''), message: p.message }));
  }

  /** The note under a box: a JSON box's own parse error first, then what the server said about it and below it. */
  errorOf(f: FieldSpec): string {
    const own = this.jsonErrors()[f.name];
    if (own) return own;
    const below = this.problemsUnder(f.name).map(p => `${p.field}: ${p.message}`);
    return [...this.ownProblems(f.name), ...below].join(' · ');
  }
}
