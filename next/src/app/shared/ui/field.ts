import { Component, ElementRef, afterRenderEffect, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, startWith, switchMap } from 'rxjs';
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
    <div class="field" [class.field-invalid]="!!message()">
      <label class="label" [attr.for]="for()">
        {{ label() }}
        @if (required()) {
          <span class="text-crit-500 ml-0.5" aria-hidden="true">*</span>
          <span class="sr-only">(required)</span>
        }
      </label>
      <ng-content />
      @if (hint() && !message()) {
        <p class="field-note text-[color:var(--text-muted)]" [id]="noteId">{{ hint() }}</p>
      }
      @if (message()) {
        <p class="field-note text-crit-500 flex items-start gap-1.5" role="alert" [id]="noteId">
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
  /**
   * An error from somewhere other than the control's validators -- the server refused the
   * value, a connection test failed. Shown in the same place and the same way, ahead of them.
   */
  readonly error = input('');

  private static nextNote = 0;
  /** The note under the control -- hint or error -- which the control names in aria-describedby. */
  readonly noteId = `field-note-${++Field.nextNote}`;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // The control is the caller's, projected in, so the link is made on the element itself:
    // aria-describedby to the note while one shows, aria-invalid while it is an error. Any
    // description the caller set is kept.
    afterRenderEffect(() => {
      const id = this.for();
      const describe = !!(this.message() || this.hint());
      const invalid = !!this.message();
      if (!id) return;
      const control = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[id]')].find(e => e.id === id);
      if (!control) return;
      const others = (control.getAttribute('aria-describedby') ?? '').split(/\s+/)
        .filter(token => token && token !== this.noteId);
      const tokens = describe ? [...others, this.noteId] : others;
      if (tokens.length) control.setAttribute('aria-describedby', tokens.join(' '));
      else control.removeAttribute('aria-describedby');
      if (invalid) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
    });
  }
  /** Per-error overrides, keyed by validator name, for when the generic wording is too vague. */
  readonly errorMessages = input<Record<string, string>>({});

  /**
   * A reactive form control is not a signal, so a computed() reading control.errors takes its
   * value once and never recomputes -- the message stayed on screen while the field was being
   * corrected, and only ever refreshed because submitted() happened to change. Mirroring the
   * control's own event stream into a signal gives the computed something to depend on.
   * `events` rather than statusChanges because it reports touched as well, and the message is
   * withheld until a field is touched.
   */
  private readonly controlEvent = toSignal(
    toObservable(this.control).pipe(
      switchMap(control => control ? control.events.pipe(startWith(null)) : of(null))));

  /**
   * The red border used to be an opt-in `[class.input-invalid]` repeated per control, and it
   * had been added to two of the eleven controls on the job form -- so most fields announced a
   * problem in text while looking untouched. The wrapper carries it now: one place, every
   * control type, and nothing to remember at the call site.
   */
  readonly message = computed(() => {
    if (this.error()) return this.error();
    this.controlEvent();
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
