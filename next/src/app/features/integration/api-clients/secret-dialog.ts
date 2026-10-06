import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Icon } from '../../../shared/ui/icon';
import { ToastService } from '../../../shared/ui/toast.service';
import { copyText } from '../../../shared/ui/clipboard.util';

export interface SecretDialogData {
  name: string;
  clientId: string;
  clientSecret: string;
  /** A rotation's new secret, rather than a new client's first. */
  rotated: boolean;
}

/**
 * MIG-332: an API client's secret, the one time it is shown -- on create and on rotate. Identity keeps only its hash, so
 * the dialog says so plainly and offers a copy of the id and the secret.
 */
@Component({
  selector: 'app-api-client-secret-dialog',
  imports: [FormDialog, Icon],
  template: `
    <app-form-dialog [heading]="data.rotated ? 'New secret for ' + data.name : 'API client made: ' + data.name"
        subtitle="Your portal exchanges the client id and secret for a 15-minute token at POST /v1/oauth/token."
        [showConfirm]="false" cancelLabel="Done" (cancelled)="ref.close()">
      <div class="rounded-md border border-subtle p-3 flex flex-col gap-3 bg-[color:var(--surface-inset)]" role="status" data-secret-shown>
        <p class="text-sm font-medium">Copy the secret now: it is not shown again.
          @if (data.rotated) { The old secret and every token it got no longer work. }</p>
        <label class="flex flex-col gap-1 text-xs text-[color:var(--text-muted)]">Client id
          <span class="flex items-center gap-2">
            <input class="input mono text-xs flex-1 min-w-0" readonly [value]="data.clientId" aria-label="Client id"
                   (focus)="$any($event.target).select()" />
            <button type="button" class="btn btn-default btn-sm" data-copy-id (click)="copy(data.clientId, 'id')">
              <app-icon [name]="copied() === 'id' ? 'check' : 'copy'" />{{ copied() === 'id' ? 'Copied' : 'Copy' }}
            </button>
          </span>
        </label>
        <label class="flex flex-col gap-1 text-xs text-[color:var(--text-muted)]">Client secret
          <span class="flex items-center gap-2">
            <input class="input mono text-xs flex-1 min-w-0" readonly [value]="data.clientSecret" aria-label="Client secret"
                   (focus)="$any($event.target).select()" cdkFocusInitial />
            <button type="button" class="btn btn-primary btn-sm" data-copy-secret (click)="copy(data.clientSecret, 'secret')">
              <app-icon [name]="copied() === 'secret' ? 'check' : 'copy'" />{{ copied() === 'secret' ? 'Copied' : 'Copy' }}
            </button>
          </span>
        </label>
      </div>
    </app-form-dialog>
  `,
})
export class SecretDialog {
  readonly ref = inject<DialogRef<void>>(DialogRef);
  readonly data = inject<SecretDialogData>(DIALOG_DATA);
  private readonly toast = inject(ToastService);
  readonly copied = signal<'id' | 'secret' | null>(null);

  async copy(value: string, which: 'id' | 'secret'): Promise<void> {
    const done = await copyText(value);
    this.copied.set(done ? which : null);
    if (!done) this.toast.error('Copy did not work here: select the text and copy it by hand.');
  }
}
