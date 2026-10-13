import { Component, computed, input, output } from '@angular/core';
import { Icon } from '../../../shared/ui/icon';
import { DateField } from '../../../shared/ui/date-field';
import { TimeField } from '../../../shared/ui/time-field';
import { PARAMETER_TYPES, ParameterType, RunParameter } from '../../jobs/run-parameters/run-parameters';
import { Problem } from './steps.model';

const NAME = /^[a-z][a-z0-9_]{0,39}$/;
/** The server's limit (RunParameters.MAX_PARAMETERS). */
export const MAX_PARAMETERS = 20;

/**
 * MIG-347: a pipeline's run parameters, on its Settings tab -- each a name its steps read as {{param.name}}, a type, a label
 * for the form, a default (what a scheduled run takes), whether a run must be given one, and a choice's choices. Run with…,
 * a backfill and the customer API give a run its values. The server checks them all again (DefinitionValidator); its
 * problems are shown on the row they are about.
 */
@Component({
  selector: 'app-parameter-editor',
  imports: [Icon, DateField, TimeField],
  styles: `
    .param-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .param-table th { text-align: left; font-size: 11px; font-weight: 600; color: var(--text-muted); padding: 0 0.375rem 0.375rem; white-space: nowrap; }
    .param-table td { padding: 0.25rem 0.375rem; vertical-align: top; }
    .param-table .input { min-width: 6rem; }
    .param-problem { font-size: 12px; color: var(--color-crit-500); padding: 0 0.375rem 0.375rem; }
  `,
  template: `
    @if (parameters().length) {
      <div class="overflow-x-auto">
        <table class="param-table" data-test="parameter-editor">
          <thead><tr><th>Name</th><th>Type</th><th>Label</th><th>Default</th><th>Required</th><th>Choices</th><th><span class="sr-only">Remove</span></th></tr></thead>
          <tbody>
            @for (p of parameters(); track $index; let i = $index) {
              <tr>
                <td><input class="input mono" [value]="p.name" [disabled]="disabled()" maxlength="40" [attr.aria-label]="'Name of parameter ' + (i + 1)"
                           [class.input-invalid]="!nameOk(p.name)" (input)="patch(i, { name: $any($event.target).value.trim() })" /></td>
                <td>
                  <select class="input" [value]="p.type" [disabled]="disabled()" [attr.aria-label]="'Type of ' + (p.name || 'parameter ' + (i + 1))"
                          (change)="setType(i, $any($event.target).value)">
                    @for (t of types; track t.id) { <option [value]="t.id" [selected]="p.type === t.id">{{ t.label }}</option> }
                  </select>
                </td>
                <td><input class="input" [value]="p.label || ''" [disabled]="disabled()" maxlength="120" [attr.aria-label]="'Label of ' + (p.name || 'parameter')"
                           (input)="patch(i, { label: $any($event.target).value || null })" /></td>
                <td>
                  @switch (p.type) {
                    @case ('boolean') {
                      <select class="input" [value]="text(p.default)" [disabled]="disabled()" [attr.aria-label]="'Default of ' + (p.name || 'parameter')"
                              (change)="patch(i, { default: $any($event.target).value === '' ? null : $any($event.target).value === 'true' })">
                        <option value="">None</option><option value="true" [selected]="text(p.default) === 'true'">Yes</option>
                        <option value="false" [selected]="text(p.default) === 'false'">No</option>
                      </select>
                    }
                    @case ('choice') {
                      <select class="input" [value]="text(p.default)" [disabled]="disabled()" [attr.aria-label]="'Default of ' + (p.name || 'parameter')"
                              (change)="patch(i, { default: $any($event.target).value || null })">
                        <option value="">None</option>
                        @for (c of p.choices || []; track c) { <option [value]="c" [selected]="text(p.default) === c">{{ c }}</option> }
                      </select>
                    }
                    @case ('date') {
                      <!-- The console's own date control: a day as 1 Jan 1900, never the browser's order. -->
                      <app-date-field [label]="'Default of ' + (p.name || 'parameter')" [value]="text(p.default)" [clearable]="true"
                                      [inactive]="disabled()" (valueChange)="setDefault(i, $event)" />
                    }
                    @case ('datetime') {
                      <div class="flex gap-1">
                        <app-date-field [label]="'Default day of ' + (p.name || 'parameter')" [value]="text(p.default).slice(0, 10)" [clearable]="true"
                                        [inactive]="disabled()" (valueChange)="setDefault(i, $event ? $event + 'T' + (text(p.default).slice(11, 16) || '00:00') : '')" />
                        <app-time-field [label]="'Default time of ' + (p.name || 'parameter')" [value]="text(p.default).slice(11, 16)" [inactive]="disabled()"
                                        (valueChange)="text(p.default) && setDefault(i, text(p.default).slice(0, 10) + 'T' + ($event || '00:00'))" />
                      </div>
                    }
                    @default {
                      <input class="input" [type]="inputType(p.type)" [value]="text(p.default)" [disabled]="disabled()"
                             [attr.aria-label]="'Default of ' + (p.name || 'parameter')" (input)="setDefault(i, $any($event.target).value)" />
                    }
                  }
                </td>
                <td class="text-center pt-2"><input type="checkbox" class="checkbox" [checked]="!!p.required" [disabled]="disabled()"
                           [attr.aria-label]="(p.name || 'parameter') + ' is required'" (change)="patch(i, { required: $any($event.target).checked || null })" /></td>
                <td>
                  @if (p.type === 'choice') {
                    <input class="input" [value]="(p.choices || []).join(', ')" [disabled]="disabled()" placeholder="north, south"
                           [attr.aria-label]="'Choices of ' + (p.name || 'parameter')" (change)="setChoices(i, $any($event.target).value)" />
                  }
                </td>
                <td><button type="button" class="btn btn-ghost btn-icon btn-sm" [disabled]="disabled()" (click)="remove(i)"
                            [attr.aria-label]="'Remove ' + (p.name || 'parameter ' + (i + 1))"><app-icon name="trash" /></button></td>
              </tr>
              @if (rowProblems()[i]; as problem) {
                <tr><td colspan="7" class="param-problem" role="alert">{{ problem }}</td></tr>
              }
            }
          </tbody>
        </table>
      </div>
    } @else {
      <p class="text-sm text-[color:var(--text-muted)] m-0">None: every run is the same. Add one to let a run, or each day of a backfill, be
        given a value.</p>
    }
    @if (!disabled()) {
      <button type="button" class="btn btn-default btn-sm mt-3" [disabled]="parameters().length >= max" (click)="add()" data-test="parameter-add">
        <app-icon name="plus" />Add a parameter</button>
    }
  `,
})
export class ParameterEditor {
  readonly parameters = input.required<RunParameter[]>();
  readonly disabled = input(false);
  /** The server's problems with the definition; those under parameters[i] are shown on row i. */
  readonly problems = input<Problem[]>([]);
  readonly changed = output<RunParameter[]>();

  readonly types = PARAMETER_TYPES;
  readonly max = MAX_PARAMETERS;
  readonly rowProblems = computed(() => {
    const out: Record<number, string> = {};
    for (const p of this.problems()) {
      const at = /^parameters\[(\d+)\](?:\.(\w+))?/.exec(p.path ?? '');
      if (at) out[Number(at[1])] = [out[Number(at[1])], `${at[2] ?? 'parameter'}: ${p.message}`].filter(Boolean).join(' · ');
    }
    return out;
  });

  nameOk(name: string): boolean {
    return NAME.test(name ?? '');
  }

  text(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
  }

  inputType(type: ParameterType): string {
    return type === 'number' ? 'number' : 'text';
  }

  add(): void {
    const taken = new Set(this.parameters().map(p => p.name));
    let n = this.parameters().length + 1;
    while (taken.has(`param_${n}`)) n++;
    this.changed.emit([...this.parameters(), { name: `param_${n}`, type: 'text' }]);
  }

  remove(index: number): void {
    this.changed.emit(this.parameters().filter((_, i) => i !== index));
  }

  patch(index: number, change: Partial<RunParameter>): void {
    this.changed.emit(this.parameters().map((p, i) => {
      if (i !== index) return p;
      const next: RunParameter = { ...p, ...change };
      for (const key of Object.keys(next) as (keyof RunParameter)[]) {
        if (next[key] === null || next[key] === undefined || next[key] === '') delete next[key];
      }
      return next;
    }));
  }

  /** A new type clears a default and choices that belong to the old one. */
  setType(index: number, type: ParameterType): void {
    const p = this.parameters()[index];
    this.patch(index, { type, default: null, choices: type === 'choice' ? (p.choices?.length ? p.choices : ['a', 'b']) : null });
  }

  setDefault(index: number, raw: string): void {
    const p = this.parameters()[index];
    if (!raw) { this.patch(index, { default: null }); return; }
    if (p.type === 'number' && Number.isFinite(Number(raw))) { this.patch(index, { default: Number(raw) }); return; }
    this.patch(index, { default: p.type === 'datetime' && raw.length === 16 ? `${raw}:00` : raw });
  }

  setChoices(index: number, raw: string): void {
    const choices = Array.from(new Set(raw.split(',').map(c => c.trim()).filter(Boolean))).slice(0, 50);
    const p = this.parameters()[index];
    const keep = choices.includes(this.text(p.default));
    this.patch(index, { choices, ...(keep ? {} : { default: null }) });
  }
}
