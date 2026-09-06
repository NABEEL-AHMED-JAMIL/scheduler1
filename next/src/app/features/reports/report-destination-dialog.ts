import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';

export interface ReportDestinationOptions {
  kind: 'bucket' | 'submit';
}
export interface ReportDestinationResult {
  bucket: string;
  folder: string;
  submitUrl: string;
}

/**
 * Where "Save"/"Submit" ask for a bucket+folder or an endpoint URL.
 *
 * These used to be sequential window.prompt() calls -- unstyled, blocking the tab, and the one
 * dialog in the app that didn't go through the app's own CDK-dialog components the way every
 * other confirm/input flow does (Confirm, PromptDialog, ShareDialog). Two kinds share one
 * component rather than two near-identical files, since the shape (a card, a couple of labelled
 * inputs, Cancel/Confirm) is otherwise the same either way.
 */
@Component({
  selector: 'app-report-destination-dialog',
  template: `
    <form class="card shadow-2xl w-[26rem] max-w-[calc(100vw-2rem)] overflow-hidden"
          (submit)="submit($event)">
      <div class="px-5 pt-4 pb-3">
        @if (data.kind === 'bucket') {
          <h2 class="text-base font-semibold">Save into a bucket</h2>
          <p class="text-sm text-[color:var(--text-secondary)] mt-1">
            Written as a file inside the folder you name.
          </p>

          <label class="label mt-3" for="bucket">Bucket</label>
          <input id="bucket" class="input" cdkFocusInitial placeholder="etl-bucket"
                 [value]="bucket()" (input)="bucket.set($any($event.target).value)" />

          <label class="label mt-3" for="folder">Folder</label>
          <input id="folder" class="input" placeholder="reports"
                 [value]="folder()" (input)="folder.set($any($event.target).value)" />
        } @else {
          <h2 class="text-base font-semibold">Submit the report</h2>
          <p class="text-sm text-[color:var(--text-secondary)] mt-1">
            Posted as JSON to the endpoint you give.
          </p>

          <label class="label mt-3" for="submitUrl">Endpoint URL</label>
          <input id="submitUrl" type="url" class="input" cdkFocusInitial placeholder="https://…"
                 [value]="submitUrl()" (input)="submitUrl.set($any($event.target).value)" />
        }
      </div>
      <div class="flex justify-end gap-2 px-5 py-3 border-t border-subtle">
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Cancel</button>
        <button type="submit" class="btn btn-primary btn-sm" [disabled]="!valid()">
          {{ data.kind === 'bucket' ? 'Save' : 'Submit' }}
        </button>
      </div>
    </form>
  `,
})
export class ReportDestinationDialog {
  readonly ref = inject<DialogRef<ReportDestinationResult>>(DialogRef);
  readonly data = inject<ReportDestinationOptions>(DIALOG_DATA);

  readonly bucket = signal('etl-bucket');
  readonly folder = signal('reports');
  readonly submitUrl = signal('');

  valid(): boolean {
    return this.data.kind === 'bucket'
      ? !!this.bucket().trim()
      : /^https?:\/\/\S+/.test(this.submitUrl().trim());
  }

  submit(event: Event): void {
    event.preventDefault();
    if (!this.valid()) return;
    this.ref.close({
      bucket: this.bucket().trim(),
      folder: this.folder().trim() || 'reports',
      submitUrl: this.submitUrl().trim(),
    });
  }
}
