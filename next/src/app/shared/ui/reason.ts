import { Component, inject, signal } from '@angular/core';
import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import { Field } from './field';
import { FormDialog } from './form-dialog';

export interface ReasonOptions {
  title: string;
  subtitle?: string;
  /** The field's label; "Reason" unless said otherwise. */
  label?: string;
  hint?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** When true the confirm stays disabled until something is typed. */
  required?: boolean;
  /** A destructive action: the confirm button reads as one. */
  danger?: boolean;
}

/**
 * The app's own "say why" dialog, for the actions that need a line of text before they run --
 * voiding an invoice, rejecting a payment.
 *
 * These were window.prompt() calls: unstyled, blocking the tab, invisible to the theme, and
 * with a Cancel that reads as null and an empty OK that reads as "" -- two outcomes the
 * callers kept confusing. This closes with the trimmed text, or null when the person backed
 * out, and nothing else.
 */
@Component({
  selector: 'app-reason-dialog',
  imports: [FormsModule, Field, FormDialog],
  template: `
    <app-form-dialog [heading]="data.title" [subtitle]="data.subtitle || ''"
        [confirmLabel]="data.confirmLabel || 'Confirm'" [saving]="false" [danger]="!!data.danger"
        [confirmDisabled]="!!data.required && !text().trim()"
        (cancelled)="ref.close(null)" (confirmed)="submit()">
      <app-field [label]="data.label || 'Reason'" for="reasonText" [hint]="data.hint || ''">
        <textarea id="reasonText" class="input" rows="3" [ngModel]="text()" (ngModelChange)="text.set($event)"
                  name="reason" [ngModelOptions]="{standalone: true}" [placeholder]="data.placeholder || ''"
                  cdkFocusInitial></textarea>
      </app-field>
    </app-form-dialog>
  `,
})
export class ReasonDialog {
  readonly ref = inject<DialogRef<string | null>>(DialogRef);
  readonly data = inject<ReasonOptions>(DIALOG_DATA);
  readonly text = signal('');

  submit(): void {
    const text = this.text().trim();
    if (this.data.required && !text) return;
    this.ref.close(text);
  }
}

/** The text typed, or null when the dialog was dismissed. */
export function askReason(dialog: Dialog, options: ReasonOptions): Promise<string | null> {
  return new Promise(resolve => {
    dialog.open<string | null>(ReasonDialog, { data: options, hasBackdrop: true })
      .closed.subscribe(result => resolve(typeof result === 'string' ? result : null));
  });
}
