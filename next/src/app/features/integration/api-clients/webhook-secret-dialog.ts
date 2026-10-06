import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Icon } from '../../../shared/ui/icon';
import { ToastService } from '../../../shared/ui/toast.service';
import { copyText } from '../../../shared/ui/clipboard.util';

export interface WebhookSecretDialogData {
  url: string;
  secret: string;
  /** A rotation's new secret: the old one keeps signing beside it for a day. */
  rotated: boolean;
}

/**
 * MIG-333: a webhook's signing secret, the one time it is shown -- when the webhook is made and when its secret is
 * rotated. The platform keeps it sealed and never shows it again; the receiver checks each request's signature with it.
 */
@Component({
  selector: 'app-webhook-secret-dialog',
  imports: [FormDialog, Icon],
  template: `
    <app-form-dialog [heading]="data.rotated ? 'New signing secret' : 'Webhook added'" [subtitle]="data.url"
        [showConfirm]="false" cancelLabel="Done" (cancelled)="ref.close()">
      <div class="rounded-md border border-subtle p-3 flex flex-col gap-3 bg-[color:var(--surface-inset)]" role="status" data-webhook-secret>
        <p class="text-sm font-medium">Copy the signing secret now: it is not shown again.
          @if (data.rotated) { The old secret keeps signing beside it for 24 hours, so your receiver can switch over. }</p>
        <p class="text-sm text-[color:var(--text-secondary)]">Your receiver checks Webhook-Signature: t and v1, where v1 is the
          HMAC-SHA256 of "t.body" with this secret, and refuses a t more than five minutes old.</p>
        <label class="flex flex-col gap-1 text-xs text-[color:var(--text-muted)]">Signing secret
          <span class="flex items-center gap-2">
            <input class="input mono text-xs flex-1 min-w-0" readonly [value]="data.secret" aria-label="Signing secret"
                   (focus)="$any($event.target).select()" cdkFocusInitial />
            <button type="button" class="btn btn-primary btn-sm" (click)="copy()">
              <app-icon [name]="copied() ? 'check' : 'copy'" />{{ copied() ? 'Copied' : 'Copy' }}
            </button>
          </span>
        </label>
      </div>
    </app-form-dialog>
  `,
})
export class WebhookSecretDialog {
  readonly ref = inject<DialogRef<void>>(DialogRef);
  readonly data = inject<WebhookSecretDialogData>(DIALOG_DATA);
  private readonly toast = inject(ToastService);
  readonly copied = signal(false);

  async copy(): Promise<void> {
    const done = await copyText(this.data.secret);
    this.copied.set(done);
    if (!done) this.toast.error('Copy did not work here: select the text and copy it by hand.');
  }
}
