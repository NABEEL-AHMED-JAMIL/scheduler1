import { Component, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Field } from '../../../shared/ui/field';

/**
 * `title` and `subtitle` let a caller say what is actually being sent.
 *
 * The object browser emails N stored files as a ZIP, and the wording below says so. The chat
 * panel emails ONE generated export -- a reply converted to pdf, docx or xlsx -- where "Email 1
 * file / Sent as a ZIP attachment" is wrong on both halves. Overriding two strings keeps one
 * dialog rather than growing a second, near-identical one that would drift from it.
 */
export interface ShareOptions {
  count: number; title?: string; subtitle?: string;
  /**
   * Sends the email. When given, the dialog stays open until the server has answered: a refusal
   * (an address it rejects, an attachment over the size limit) is shown here, with what was
   * typed still in place, instead of as a toast after the dialog has already gone.
   */
  send?: (result: ShareResult) => Observable<{ status: string; message?: string }>;
}
export interface ShareResult { recipientEmail: string; message: string; }

@Component({
  selector: 'app-share-dialog',
  imports: [FormDialog, Field],
  template: `
    <!-- In a <form> so Enter still sends: the shell's buttons are type="button". -->
    <form (submit)="submit($event)">
      <app-form-dialog [heading]="data.title ?? 'Email ' + data.count + ' file' + (data.count === 1 ? '' : 's')"
                       [subtitle]="data.subtitle ?? 'Sent as a ZIP attachment.'"
                       confirmLabel="Send" busyLabel="Sending…" [saving]="sending()"
                       [confirmDisabled]="!valid()" (confirmed)="submit()" (cancelled)="ref.close()">
        <div class="form-stack">
          <app-field label="Recipient" for="to" [required]="true">
            <input id="to" type="email" class="input" cdkFocusInitial placeholder="name@example.com"
                   [class.input-invalid]="showAddressError()"
                   [attr.aria-invalid]="showAddressError() ? 'true' : null"
                   [attr.aria-describedby]="showAddressError() ? 'to-error' : null"
                   [value]="email()" (input)="email.set($any($event.target).value)" (blur)="touched.set(true)" />
            <!-- Send stays off for an incomplete address; this says why, once the box is left. -->
            @if (showAddressError()) {
              <p id="to-error" class="field-note text-crit-500">Enter a full email address, like name&#64;example.com.</p>
            }
          </app-field>
          <app-field label="Message" for="note" hint="Optional.">
            <textarea id="note" class="input resize-y min-h-20" placeholder="Optional note"
                      [value]="message()" (input)="message.set($any($event.target).value)"></textarea>
          </app-field>
          @if (error()) {
            <p class="field-note text-crit-500" role="alert">{{ error() }}</p>
          }
        </div>
      </app-form-dialog>
    </form>
  `,
})
export class ShareDialog {
  readonly ref = inject<DialogRef<ShareResult>>(DialogRef);
  readonly data = inject<ShareOptions>(DIALOG_DATA);
  readonly email = signal('');
  readonly message = signal('');
  readonly sending = signal(false);
  readonly error = signal('');
  /** Left the recipient box at least once, or tried to send. */
  readonly touched = signal(false);
  readonly showAddressError = computed(() => this.touched() && !!this.email().trim() && !this.valid());

  valid(): boolean {
    // Deliberately loose: the server is the authority on deliverability, this only
    // catches an obviously incomplete address before a pointless round trip.
    return /\S+@\S+\.\S+/.test(this.email().trim());
  }

  submit(event?: Event): void {
    event?.preventDefault();
    this.touched.set(true);
    if (!this.valid() || this.sending()) return;
    const result = { recipientEmail: this.email().trim(), message: this.message().trim() };
    if (!this.data.send) { this.ref.close(result); return; }
    this.sending.set(true);
    this.error.set('');
    this.data.send(result).subscribe({
      next: response => {
        this.sending.set(false);
        if (response.status === 'SUCCESS') this.ref.close(result);
        else this.error.set(response.message || 'The email could not be sent.');
      },
      error: err => {
        this.sending.set(false);
        this.error.set(err?.error?.message || 'The email could not be sent.');
      },
    });
  }
}
