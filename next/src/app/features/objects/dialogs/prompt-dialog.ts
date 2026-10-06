import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Field } from '../../../shared/ui/field';

export interface PromptOptions {
  title: string;
  label: string;
  placeholder?: string;
  initial?: string;
  confirmLabel?: string;
  hint?: string;
}

/**
 * One text field in the shared dialog shell. Wrapped in a <form> so Enter still submits: the
 * shell's buttons are type="button", and a form with a single text input submits implicitly.
 */
@Component({
  selector: 'app-prompt-dialog',
  imports: [FormDialog, Field],
  template: `
    <form (submit)="submit($event)">
      <app-form-dialog [heading]="data.title" [confirmLabel]="data.confirmLabel || 'Save'"
                       [confirmDisabled]="!value().trim()"
                       (confirmed)="submit()" (cancelled)="ref.close()">
        <app-field [label]="data.label" for="value" [required]="true" [hint]="data.hint || ''">
          <input id="value" class="input" [value]="value()" cdkFocusInitial
                 [placeholder]="data.placeholder || ''"
                 (input)="value.set($any($event.target).value)" />
        </app-field>
      </app-form-dialog>
    </form>
  `,
})
export class PromptDialog {
  readonly ref = inject<DialogRef<string>>(DialogRef);
  readonly data = inject<PromptOptions>(DIALOG_DATA);
  readonly value = signal(this.data.initial ?? '');

  submit(event?: Event): void {
    event?.preventDefault();
    const trimmed = this.value().trim();
    if (trimmed) this.ref.close(trimmed);
  }
}
