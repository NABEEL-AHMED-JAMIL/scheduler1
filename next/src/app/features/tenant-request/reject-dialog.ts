import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import { Field } from '../../shared/ui/field';
import { FormDialog } from '../../shared/ui/form-dialog';

/**
 * Rejecting a workspace request, with the reason.
 *
 * A plain yes/no confirm was used before, which is why decision_note was written on every
 * rejection and was null on every row: the column, the endpoint parameter and the display were
 * all in place, and nothing ever collected the text.
 *
 * The reason is optional. An obvious spam request does not deserve a paragraph, and requiring
 * one would only produce "no" typed a hundred times. Whoever reads the list later sees the note
 * where there is one and nothing where there is not.
 *
 * Nobody outside sees this. No mail is sent on rejection, so it is a note to colleagues.
 */
@Component({
  selector: 'app-reject-dialog',
  imports: [FormsModule, Field, FormDialog],
  template: `
    <app-form-dialog [heading]="'Reject the request from ' + data.organisationName + '?'"
        subtitle="No tenant or account is created. The request is kept, marked rejected."
        confirmLabel="Reject request" [saving]="saving()"
        (cancelled)="ref.close(null)" (confirmed)="submit()">
      <app-field label="Reason" for="rejectReason"
                 hint="Optional, and only visible to platform administrators here.">
        <textarea id="rejectReason" class="input" rows="3" [(ngModel)]="note" name="note"
                  [ngModelOptions]="{standalone: true}"
                  placeholder="Not a real organisation."></textarea>
      </app-field>
    </app-form-dialog>
  `,
})
export class RejectDialog {
  readonly ref = inject<DialogRef<string | null>>(DialogRef);
  readonly data = inject<{ organisationName: string }>(DIALOG_DATA);

  readonly saving = signal(false);
  note = '';

  submit(): void {
    // Closed with the text rather than a boolean, so the caller cannot forget to read it --
    // which is exactly how the note went missing the first time.
    this.ref.close(this.note.trim());
  }
}
