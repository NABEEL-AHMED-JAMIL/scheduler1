import { Component, computed, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Icon } from '../../shared/ui/icon';
import {
  BOOLEAN_TYPES, CHOICE_TYPES, DynamicFormField, SECTION_TYPE, inputTypeFor, optionsOf,
} from './dynamic-form.model';

/**
 * Renders a set of field definitions as an actual form.
 *
 * One renderer serves three callers -- the builder's live preview, the public fill page, and a
 * read-only view of a submission -- so a field can never look one way while being built and
 * another way while being filled in.
 */
@Component({
  selector: 'app-form-renderer',
  imports: [FormsModule, Icon],
  styles: [`
    :host { display: block; }
    /* A field's declared width is what it should get when there is room for it. Below that,
       four fields across becomes two, then one -- a quarter column on a tablet is 160px, which
       is not wide enough for an ordinary email address. The spans are set per field as custom
       properties so the breakpoints stay in CSS rather than being computed per render. */
    .cell { grid-column: span var(--span-sm) / span var(--span-sm); }
    @media (min-width: 640px) {
      .cell { grid-column: span var(--span-md) / span var(--span-md); }
    }
    @media (min-width: 1024px) {
      .cell { grid-column: span var(--span-lg) / span var(--span-lg); }
    }
  `],
  template: `
    <div class="grid grid-cols-12 gap-x-4 gap-y-3.5">
      @for (field of ordered(); track field.dynamicFormFieldId ?? field.fieldName; let i = $index) {
        <div class="cell" [style.--span-lg]="span(field)"
             [style.--span-md]="spanMedium(field)" [style.--span-sm]="12">
          @if (field.fieldType === 'section') {
            <!-- A section is a heading between fields, so it takes the full width and collects
                 nothing. The first one needs no rule above it. -->
            <div class="border-t pt-3 border-subtle" [class.border-t-0]="i === 0" [class.pt-0]="i === 0"
                >
              <h3 class="text-sm font-semibold">{{ field.fieldLabel }}</h3>
              @if (field.placeHolder) {
                <p class="field-note text-[color:var(--text-muted)]">{{ field.placeHolder }}</p>
              }
            </div>
          } @else {
            <div class="field" [class.field-invalid]="!!errorFor(field)">
              <label class="label" [attr.for]="idFor(field)">
                {{ field.fieldLabel }}
                @if (field.mandatory) {
                  <span class="text-crit-500 ml-0.5" aria-hidden="true">*</span>
                  <span class="sr-only">(required)</span>
                }
              </label>

              @switch (kindOf(field)) {
                @case ('textarea') {
                  <textarea [id]="idFor(field)" class="input" [rows]="textareaRows(field)" [disabled]="readOnly()"
                            [placeholder]="field.placeHolder || ''"
                            [ngModel]="valueOf(field)"
                            (ngModelChange)="set(field, $event)"></textarea>
                }
                @case ('select') {
                  <select [id]="idFor(field)" class="input" [disabled]="readOnly()"
                          [ngModel]="valueOf(field)" (ngModelChange)="set(field, $event)">
                    <option value="">{{ field.placeHolder || 'Choose…' }}</option>
                    @for (option of choices(field); track option) {
                      <option [value]="option">{{ option }}</option>
                    }
                  </select>
                }
                @case ('multi-select') {
                  <select [id]="idFor(field)" class="input" multiple size="4" [disabled]="readOnly()"
                          [ngModel]="valueOf(field)" (ngModelChange)="set(field, $event)">
                    @for (option of choices(field); track option) {
                      <option [value]="option">{{ option }}</option>
                    }
                  </select>
                }
                @case ('radio') {
                  <div class="flex flex-wrap gap-x-4 gap-y-1.5 pt-0.5">
                    @for (option of choices(field); track option) {
                      <label class="flex items-center gap-1.5 text-sm">
                        <input type="radio" [name]="idFor(field)" [value]="option"
                               [disabled]="readOnly()"
                               [checked]="valueOf(field) === option"
                               (change)="set(field, option)" />
                        {{ option }}
                      </label>
                    }
                  </div>
                }
                @case ('boolean') {
                  <label class="flex items-center gap-2 text-sm pt-0.5">
                    <input type="checkbox" [id]="idFor(field)" [disabled]="readOnly()"
                           [checked]="!!valueOf(field)"
                           (change)="set(field, $any($event.target).checked)" />
                    {{ field.placeHolder || 'Yes' }}
                  </label>
                }
                @default {
                  <input [id]="idFor(field)" class="input" [type]="inputType(field)"
                         [disabled]="readOnly()"
                         [placeholder]="field.placeHolder || ''"
                         [attr.minlength]="field.minLength" [attr.maxlength]="field.maxLength"
                         [attr.pattern]="field.pattern || null"
                         [ngModel]="valueOf(field)" (ngModelChange)="set(field, $event)" />
                }
              }

              @if (errorFor(field)) {
                <p class="field-note text-crit-500 flex items-start gap-1.5" role="alert">
                  <app-icon name="alert" size="0.9em" class="mt-px shrink-0" />
                  <span>{{ errorFor(field) }}</span>
                </p>
              }
            </div>
          }
        </div>
      }
      @if (!ordered().length) {
        <p class="col-span-12 text-sm text-[color:var(--text-muted)]">
          This form has no fields yet.
        </p>
      }
    </div>
  `,
})
export class FormRenderer {
  readonly fields = input<DynamicFormField[]>([]);
  /** The collected answers, keyed by fieldName. Two-way so a caller can seed and read it. */
  readonly value = model<Record<string, unknown>>({});
  readonly readOnly = input(false);
  /** Per-field messages, keyed by fieldName; set after a submit attempt. */
  readonly errors = input<Record<string, string>>({});
  readonly changed = output<Record<string, unknown>>();

  readonly ordered = computed(() =>
    [...this.fields()].sort((a, b) => (a.fieldOrder ?? 0) - (b.fieldOrder ?? 0)));

  /** A section always spans the row; everything else honours its width, defaulting to half. */
  span(field: DynamicFormField): number {
    if (field.fieldType === SECTION_TYPE) return 12;
    const width = field.fieldWidth ?? 6;
    return Math.min(12, Math.max(1, width));
  }

  /** Half-way to full width, so a row of four becomes a row of two before it becomes a list. */
  spanMedium(field: DynamicFormField): number {
    return Math.min(12, this.span(field) * 2);
  }

  kindOf(field: DynamicFormField): string {
    if (field.fieldType === 'textarea') return 'textarea';
    if (field.fieldType === 'select') return 'select';
    if (field.fieldType === 'multi-select') return 'multi-select';
    if (field.fieldType === 'radio') return 'radio';
    if (BOOLEAN_TYPES.includes(field.fieldType)) return 'boolean';
    return 'input';
  }

  /**
   * A full-width textarea is usually there for something long -- this form keeps a whole JSON
   * template in one -- so it gets more room than a narrow one sitting beside other fields.
   */
  textareaRows(field: DynamicFormField): number {
    return this.span(field) >= 12 ? 6 : 3;
  }

  choices(field: DynamicFormField): string[] { return optionsOf(field); }
  inputType(field: DynamicFormField): string { return inputTypeFor(field.fieldType); }
  idFor(field: DynamicFormField): string { return 'dff-' + (field.fieldName || field.dynamicFormFieldId); }
  errorFor(field: DynamicFormField): string { return this.errors()[field.fieldName] ?? ''; }

  valueOf(field: DynamicFormField): unknown {
    const current = this.value()[field.fieldName];
    if (current !== undefined && current !== null) return current;
    if (BOOLEAN_TYPES.includes(field.fieldType)) return field.defaultValue === 'true';
    if (field.fieldType === 'multi-select') return [];
    return field.defaultValue ?? '';
  }

  set(field: DynamicFormField, value: unknown): void {
    if (this.readOnly()) return;
    const next = { ...this.value(), [field.fieldName]: value };
    this.value.set(next);
    this.changed.emit(next);
  }
}

/** Required-field checking, shared by the fill page and anywhere else that submits. */
export function missingRequired(fields: DynamicFormField[],
                                value: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (field.fieldType === SECTION_TYPE || !field.mandatory) continue;
    const answer = value[field.fieldName];
    const empty = answer === undefined || answer === null || answer === ''
      || (Array.isArray(answer) && !answer.length)
      || (BOOLEAN_TYPES.includes(field.fieldType) && answer === false);
    if (empty) {
      errors[field.fieldName] = `${field.fieldLabel} is required.`;
      continue;
    }
    if (typeof answer === 'string') {
      if (field.minLength && answer.length < field.minLength) {
        errors[field.fieldName] = `Use at least ${field.minLength} characters.`;
      } else if (field.maxLength && answer.length > field.maxLength) {
        errors[field.fieldName] = `Use at most ${field.maxLength} characters.`;
      } else if (field.pattern && !new RegExp(field.pattern).test(answer)) {
        errors[field.fieldName] = `${field.fieldLabel} is not in the expected format.`;
      }
    }
  }
  return errors;
}

export { CHOICE_TYPES };
