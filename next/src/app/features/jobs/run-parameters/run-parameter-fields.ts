import { Component, computed, input, model } from '@angular/core';
import { Field } from '../../../shared/ui/field';
import { DateField } from '../../../shared/ui/date-field';
import { ParameterValues, RunParameter, defaultText, parameterLabel, valueProblems } from './run-parameters';

/**
 * MIG-347: a run's parameter values, one input per declared parameter by its type -- a date, a date and time, text, a
 * number, yes or no, a choice -- each starting at its default. Used by "Run with…" and the backfill panel; the values are
 * the caller's model. A blank value takes the parameter's default.
 */
@Component({
  selector: 'app-run-parameter-fields',
  imports: [Field, DateField],
  template: `
    <div class="form-grid" data-test="run-parameters">
      @for (p of parameters(); track p.name) {
        <app-field [label]="label(p)" [for]="idPrefix() + '-' + p.name" [required]="!!p.required && !hasDefault(p)"
                   [hint]="hint(p)" [error]="problems()[p.name] || ''">
          @switch (p.type) {
            @case ('date') {
              <app-date-field [inputId]="idPrefix() + '-' + p.name" [label]="label(p)" [value]="values()[p.name] || ''"
                              [clearable]="!p.required" [inactive]="disabled()" (valueChange)="set(p.name, $event)" />
            }
            @case ('datetime') {
              <input [id]="idPrefix() + '-' + p.name" class="input" type="datetime-local" step="60" [value]="values()[p.name] || ''"
                     [disabled]="disabled()" (input)="set(p.name, $any($event.target).value)" />
            }
            @case ('number') {
              <input [id]="idPrefix() + '-' + p.name" class="input" type="number" inputmode="decimal" [value]="values()[p.name] || ''"
                     [disabled]="disabled()" (input)="set(p.name, $any($event.target).value)" />
            }
            @case ('boolean') {
              <select [id]="idPrefix() + '-' + p.name" class="input" [value]="values()[p.name] || ''" [disabled]="disabled()"
                      (change)="set(p.name, $any($event.target).value)">
                @if (!hasDefault(p)) { <option value="">—</option> }
                <option value="true" [selected]="values()[p.name] === 'true'">Yes</option>
                <option value="false" [selected]="values()[p.name] === 'false'">No</option>
              </select>
            }
            @case ('choice') {
              <select [id]="idPrefix() + '-' + p.name" class="input" [value]="values()[p.name] || ''" [disabled]="disabled()"
                      (change)="set(p.name, $any($event.target).value)">
                @if (!hasDefault(p)) { <option value="">Pick one</option> }
                @for (c of p.choices || []; track c) { <option [value]="c" [selected]="values()[p.name] === c">{{ c }}</option> }
              </select>
            }
            @default {
              <input [id]="idPrefix() + '-' + p.name" class="input" type="text" maxlength="500" [value]="values()[p.name] || ''"
                     [disabled]="disabled()" (input)="set(p.name, $any($event.target).value)" />
            }
          }
        </app-field>
      }
    </div>
  `,
})
export class RunParameterFields {
  readonly parameters = input.required<RunParameter[]>();
  readonly values = model.required<ParameterValues>();
  readonly idPrefix = input('param');
  readonly disabled = input(false);
  /** The server's sentence for a refused value, when it named one; the inputs' own checks otherwise. */
  readonly problems = computed(() => valueProblems(this.parameters(), this.values()));

  label(p: RunParameter): string {
    return parameterLabel(p);
  }

  hasDefault(p: RunParameter): boolean {
    return defaultText(p) !== '';
  }

  hint(p: RunParameter): string {
    const parts = [p.description ?? ''];
    if (this.hasDefault(p)) parts.push(`Default: ${defaultText(p)}.`);
    parts.push(`{{param.${p.name}}}`);
    return parts.filter(Boolean).join(' ');
  }

  set(name: string, value: string): void {
    this.values.update(v => ({ ...v, [name]: value }));
  }
}
