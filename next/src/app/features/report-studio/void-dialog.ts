import { Component, inject, signal } from '@angular/core';
import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';

export interface VoidData { label: string; version: number; signed: boolean; }

/**
 * Mark a report version VOID (Report Studio phase 4, owner 2026-10-20): the person says why. The version and its files
 * stay as they are; every download of it from now on is a copy marked VOID (a signed PDF's copy carries no signature).
 * It is not taken back.
 */
@Component({
  selector: 'app-rs-void-dialog',
  template: `
    <div class="card shadow-2xl w-[30rem] max-w-[calc(100vw-2rem)] overflow-hidden" role="dialog" aria-labelledby="rs-void-title">
      <div class="px-5 pt-4 pb-3 flex flex-col gap-2">
        <h2 id="rs-void-title" class="text-base font-semibold">Mark {{ data.label }} v{{ data.version }} VOID?</h2>
        <p class="text-sm text-[color:var(--text-secondary)]">The version and its files are kept as they are. Every download of it from now on is a copy marked
          VOID with your reason@if (data.signed) {, and carries no signature (the signed original is kept and still verifies)}. This cannot be taken back.</p>
        <label class="field"><span class="label">Why it is void</span>
          <textarea class="input text-sm" rows="3" maxlength="300" [value]="reason()" (input)="reason.set($any($event.target).value)"
                    placeholder="e.g. Generated from the wrong month's data" aria-label="Why it is void" cdkFocusInitial></textarea></label>
      </div>
      <div class="flex justify-end gap-2 px-5 py-3 border-t border-subtle">
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close(null)">Cancel</button>
        <button type="button" class="btn btn-danger btn-sm" [disabled]="!reason().trim()" (click)="ref.close(reason().trim())">Mark VOID</button>
      </div>
    </div>
  `,
})
export class VoidDialog {
  readonly ref = inject<DialogRef<string | null>>(DialogRef);
  readonly data = inject<VoidData>(DIALOG_DATA);
  readonly reason = signal('');
}

export function askVoidReason(dialog: Dialog, data: VoidData): Promise<string | null> {
  return new Promise(resolve => {
    dialog.open<string | null>(VoidDialog, { data, hasBackdrop: true }).closed.subscribe(r => resolve(typeof r === 'string' && r ? r : null));
  });
}
