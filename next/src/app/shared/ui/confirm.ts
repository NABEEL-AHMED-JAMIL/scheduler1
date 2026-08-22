import { Component, inject } from '@angular/core';
import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';

export interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
}

@Component({
  selector: 'app-confirm',
  template: `
    <div class="card shadow-2xl w-[26rem] max-w-[calc(100vw-2rem)] overflow-hidden">
      <div class="px-5 pt-4 pb-3">
        <h2 class="text-base font-semibold">{{ data.title }}</h2>
        <p class="text-sm text-[color:var(--text-secondary)] mt-1.5">{{ data.body }}</p>
      </div>
      <div class="flex justify-end gap-2 px-5 py-3 border-t" style="border-color: var(--border-subtle);">
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close(false)">Cancel</button>
        <button type="button" class="btn btn-sm" [class.btn-danger]="data.danger"
                [class.btn-primary]="!data.danger" (click)="ref.close(true)" cdkFocusInitial>
          {{ data.confirmLabel || 'Confirm' }}
        </button>
      </div>
    </div>
  `,
})
export class Confirm {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<ConfirmOptions>(DIALOG_DATA);
}

/** Small wrapper so callers don't repeat the CDK plumbing at every call site. */
export function confirmWith(dialog: Dialog, options: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    dialog.open<boolean>(Confirm, { data: options, hasBackdrop: true })
      .closed.subscribe(result => resolve(result === true));
  });
}
