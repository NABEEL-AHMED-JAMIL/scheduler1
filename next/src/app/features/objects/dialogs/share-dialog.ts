import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';

/**
 * `title` and `subtitle` let a caller say what is actually being sent.
 *
 * The object browser emails N stored files as a ZIP, and the wording below says so. The chat
 * panel emails ONE generated export -- a reply converted to pdf, docx or xlsx -- where "Email 1
 * file / Sent as a ZIP attachment" is wrong on both halves. Overriding two strings keeps one
 * dialog rather than growing a second, near-identical one that would drift from it.
 */
export interface ShareOptions { count: number; title?: string; subtitle?: string; }
export interface ShareResult { recipientEmail: string; message: string; }

@Component({
  selector: 'app-share-dialog',
  template: `
    <form class="card shadow-2xl w-[28rem] max-w-[calc(100vw-2rem)] overflow-hidden"
          (submit)="submit($event)">
      <div class="px-5 pt-4 pb-3">
        <h2 class="text-base font-semibold">
          {{ data.title ?? 'Email ' + data.count + ' file' + (data.count === 1 ? '' : 's') }}
        </h2>
        <p class="text-sm text-[color:var(--text-secondary)] mt-1">
          {{ data.subtitle ?? 'Sent as a ZIP attachment.' }}
        </p>

        <label class="label mt-3" for="to">Recipient</label>
        <input id="to" type="email" class="input" cdkFocusInitial placeholder="name@example.com"
               [value]="email()" (input)="email.set($any($event.target).value)" />

        <label class="label mt-3" for="note">Message</label>
        <textarea id="note" class="input resize-y min-h-20" placeholder="Optional note"
                  [value]="message()" (input)="message.set($any($event.target).value)"></textarea>
      </div>
      <div class="flex justify-end gap-2 px-5 py-3 border-t border-subtle">
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Cancel</button>
        <button type="submit" class="btn btn-primary btn-sm" [disabled]="!valid()">Send</button>
      </div>
    </form>
  `,
})
export class ShareDialog {
  readonly ref = inject<DialogRef<ShareResult>>(DialogRef);
  readonly data = inject<ShareOptions>(DIALOG_DATA);
  readonly email = signal('');
  readonly message = signal('');

  valid(): boolean {
    // Deliberately loose: the server is the authority on deliverability, this only
    // catches an obviously incomplete address before a pointless round trip.
    return /\S+@\S+\.\S+/.test(this.email().trim());
  }

  submit(event: Event): void {
    event.preventDefault();
    if (this.valid()) {
      this.ref.close({ recipientEmail: this.email().trim(), message: this.message().trim() });
    }
  }
}
