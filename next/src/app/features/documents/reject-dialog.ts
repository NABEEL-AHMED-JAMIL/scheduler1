import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormDialog } from '../../shared/ui/form-dialog';
import { Field } from '../../shared/ui/field';

export interface RejectDialogData { name: string; }

/** The service keeps a reason of at most this many characters. */
export const MAX_REASON = 500;

/**
 * Rejecting a document asks why (MIG-272): the reason is kept with the document, and it leaves the queue without a
 * row in its type's dataset. Closes with the reason, or null.
 */
@Component({
  selector: 'app-reject-dialog',
  imports: [FormDialog, Field],
  template: `
    <app-form-dialog heading="Reject this document?" [subtitle]="data.name" confirmLabel="Reject" [danger]="true"
                     [confirmDisabled]="!reason().trim() || tooLong()" (confirmed)="done()" (cancelled)="ref.close(null)">
      <app-field label="Why" for="rejectReason" [required]="true"
                 [hint]="'Kept with the document. ' + reason().length + ' of ' + max + ' characters.'"
                 [error]="tooLong() ? 'At most ' + max + ' characters.' : ''">
        <textarea id="rejectReason" class="input min-h-24" rows="3" placeholder="Not one of our documents; a duplicate; unreadable …"
                  [value]="reason()" (input)="reason.set($any($event.target).value)"></textarea>
      </app-field>
    </app-form-dialog>
  `,
})
export class RejectDialog {
  readonly ref = inject<DialogRef<string | null>>(DialogRef);
  readonly data = inject<RejectDialogData>(DIALOG_DATA);
  readonly max = MAX_REASON;
  readonly reason = signal('');
  readonly tooLong = computed(() => this.reason().trim().length > MAX_REASON);

  done(): void {
    const reason = this.reason().trim();
    if (reason && !this.tooLong()) this.ref.close(reason);
  }
}
