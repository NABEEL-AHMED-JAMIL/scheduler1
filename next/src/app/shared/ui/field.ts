import { Component, computed, input } from '@angular/core';
import { Icon } from './icon';
import { AbstractControl } from '@angular/forms';

/**
 * Label, control and error message in one place, so every form reports problems the same way
 * and in the same position. The old app repeated this markup per field, which is why some
 * fields showed errors above the input and others below, and a few showed none at all.
 */
@Component({
  selector: 'app-field',
  imports: [Icon],
  template: `
    <div class="field">
      <label class="label" [attr.for]="for()">
        {{ label() }}
        @if (required()) {
          <span class="text-crit-500 ml-0.5" aria-hidden="true">*</span>
          <span class="sr-only">(required)</span>
        }
      </label>
      <ng-content />
      @if (hint() && !message()) {
        <p class="field-note text-[color:var(--text-muted)]">{{ hint() }}</p>
      }
      @if (message()) {
        <p class="field-note text-crit-500 flex items-start gap-1.5" role="alert">
          <app-icon name="alert" size="0.9em" class="mt-px shrink-0" />
          <span>{{ message() }}</span>
        </p>
      }
    </div>
  `,
})
export class Field {
  readonly label = input.required<string>();
  readonly for = input<string>('');
  readonly control = input<AbstractControl | null>(null);
  readonly hint = input<string>('');
  readonly submitted = input(false);
  readonly required = input(false);
  /** Per-error overrides, keyed by validator name, for when the generic wording is too vague. */
  readonly errorMessages = input<Record<string, string>>({});

  readonly message = computed(() => {
    const control = this.control();
    if (!control || !control.errors) return '';
    // Errors stay hidden until the field has been touched or the form submitted, so a blank
    // form doesn't greet people in red.
    if (!control.touched && !this.submitted()) return '';
    const errors = control.errors;
    const overrides = this.errorMessages();
    for (const name of Object.keys(errors)) {
      if (overrides[name]) return overrides[name];
    }
    if (errors['required']) return `${this.label()} is required`;
    if (errors['email']) return 'Enter a valid email address';
    if (errors['min']) return `Must be at least ${errors['min'].min}`;
    if (errors['max']) return `Must be at most ${errors['max'].max}`;
    if (errors['minlength']) return `Use at least ${errors['minlength'].requiredLength} characters`;
    if (errors['pattern']) return `${this.label()} is not in the expected format`;
    if (errors['endBeforeStart']) return 'The end date is before the start date';
    return 'Check this value';
  });
}
