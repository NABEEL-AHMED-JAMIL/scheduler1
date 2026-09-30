import { Component, input, output } from '@angular/core';
import { Field } from '../../shared/ui/field';
import { Answers, FormField } from './forms.model';

/** One answer changed: the field's key and what it holds now (text as typed, a yes/no as a boolean). */
export interface AnswerChange {
  key: string;
  value: string | boolean | null;
}

/**
 * A form's fields as controls (Wave 5 Forms lite): text, long text, number, date, a choice, yes/no, e-mail -- each with
 * its label, help text, required mark and problem, in the form's order. It holds nothing itself: the answers and the
 * problems are the page's, and every change is handed back. The fill-in page and the builder's preview both draw it.
 */
@Component({
  selector: 'app-form-renderer',
  imports: [Field],
  template: `
    <div class="flex flex-col gap-4 min-w-0">
      @for (f of fields(); track $index; let i = $index) {
        <app-field [label]="f.label" [for]="idPrefix() + '-' + i" [required]="f.required" [hint]="f.help || ''"
                   [error]="problems()[f.key] || ''">
          @switch (f.type) {
            @case ('longText') {
              <textarea class="input" rows="4" [id]="idPrefix() + '-' + i" [value]="text(f.key)" [disabled]="disabled()"
                        [attr.data-field]="f.key" (input)="set(f.key, $any($event.target).value)"></textarea>
            }
            @case ('choice') {
              <select class="input" [id]="idPrefix() + '-' + i" [disabled]="disabled()" [attr.data-field]="f.key"
                      (change)="set(f.key, $any($event.target).value)">
                <option value="" [selected]="!text(f.key)">Choose…</option>
                @for (o of f.options ?? []; track o) {
                  <option [value]="o" [selected]="text(f.key) === o">{{ o }}</option>
                }
              </select>
            }
            @case ('yesNo') {
              <div class="flex items-center gap-4 text-sm" role="radiogroup" [id]="idPrefix() + '-' + i" [attr.aria-label]="f.label"
                   [attr.data-field]="f.key">
                <label class="flex items-center gap-1.5">
                  <input type="radio" [name]="idPrefix() + '-' + f.key" [checked]="answers()[f.key] === true" [disabled]="disabled()"
                         (change)="set(f.key, true)" />Yes
                </label>
                <label class="flex items-center gap-1.5">
                  <input type="radio" [name]="idPrefix() + '-' + f.key" [checked]="answers()[f.key] === false" [disabled]="disabled()"
                         (change)="set(f.key, false)" />No
                </label>
              </div>
            }
            @case ('date') {
              <input class="input" type="date" [id]="idPrefix() + '-' + i" [value]="text(f.key)" [disabled]="disabled()"
                     [attr.data-field]="f.key" (input)="set(f.key, $any($event.target).value)" />
            }
            @case ('number') {
              <input class="input" type="text" inputmode="decimal" [id]="idPrefix() + '-' + i" [value]="text(f.key)"
                     [disabled]="disabled()" [attr.data-field]="f.key" (input)="set(f.key, $any($event.target).value)" />
            }
            @case ('email') {
              <input class="input" type="email" autocomplete="off" [id]="idPrefix() + '-' + i" [value]="text(f.key)"
                     [disabled]="disabled()" [attr.data-field]="f.key" (input)="set(f.key, $any($event.target).value)" />
            }
            @default {
              <input class="input" type="text" [id]="idPrefix() + '-' + i" [value]="text(f.key)" [disabled]="disabled()"
                     [attr.data-field]="f.key" (input)="set(f.key, $any($event.target).value)" />
            }
          }
        </app-field>
      } @empty {
        <p class="text-sm text-[color:var(--text-muted)]">This form has no fields yet.</p>
      }
    </div>
  `,
})
export class FormRenderer {
  readonly fields = input.required<FormField[]>();
  readonly answers = input<Answers>({});
  readonly problems = input<Record<string, string>>({});
  readonly disabled = input(false);
  /** Keeps two renderers on one page (the builder's preview and a fill-in) from sharing control ids. */
  readonly idPrefix = input('form-field');
  readonly answerChange = output<AnswerChange>();

  text(key: string): string {
    const value = this.answers()[key];
    return typeof value === 'string' ? value : '';
  }

  set(key: string, value: string | boolean | null): void {
    this.answerChange.emit({ key, value });
  }
}
