import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { StorageService, BucketSummary } from '../objects/storage.service';
import { Combobox } from '../../shared/ui/combobox';
import { FormDialog } from '../../shared/ui/form-dialog';
import { Field } from '../../shared/ui/field';
import { Observable } from 'rxjs';
import { API_SUCCESS } from '../../core/api/api.config';

export interface ReportDestinationOptions {
  kind: 'bucket' | 'submit';
  /**
   * Sends the export. When given, the dialog stays open until the server has answered, so a
   * refusal is shown beside what was typed; on success it closes with the server's message.
   */
  send?: (result: ReportDestinationResult) => Observable<{ status: string; message?: string }>;
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
  imports: [Combobox, FormDialog, Field],
  template: `
    <form (submit)="submit($event)">
      <app-form-dialog [heading]="data.kind === 'bucket' ? 'Save into a bucket' : 'Submit the report'"
                       [subtitle]="data.kind === 'bucket' ? 'Written as a file inside the folder you name.' : 'Posted as JSON to the endpoint you give.'"
                       [confirmLabel]="data.kind === 'bucket' ? 'Save' : 'Submit'"
                       [busyLabel]="data.kind === 'bucket' ? 'Saving…' : 'Submitting…'"
                       [saving]="sending()" [confirmDisabled]="!valid()"
                       (confirmed)="submit()" (cancelled)="ref.close()">
        <div class="form-stack">
          @if (data.kind === 'bucket') {
            <app-field label="Connection" for="bucket" [required]="true">
              @if (bucketsError()) {
                <p class="field-note text-crit-500" role="alert">{{ bucketsError() }}</p>
              } @else {
                <!-- The workspace's own connections, as the Object Browser offers them. It was free
                     text, and a typo showed up only as a toast after the dialog had closed. -->
                <app-combobox id="bucket" [selected]="bucket()" (selectedChange)="bucket.set($event)"
                              [options]="bucketOptions()" [allowClear]="false"
                              [placeholder]="loadingBuckets() ? 'Reading connections…' : 'Search connections…'" />
              }
            </app-field>
            <app-field label="Folder" for="folder">
              <input id="folder" class="input" placeholder="reports"
                     [value]="folder()" (input)="folder.set($any($event.target).value)" />
            </app-field>
          } @else {
            <app-field label="Endpoint URL" for="submitUrl" [required]="true">
              <input id="submitUrl" type="url" class="input" cdkFocusInitial placeholder="https://…"
                     [value]="submitUrl()" (input)="submitUrl.set($any($event.target).value)" />
            </app-field>
          }
          @if (sendError()) {
            <p class="field-note text-crit-500" role="alert">{{ sendError() }}</p>
          }
        </div>
      </app-form-dialog>
    </form>
  `,
})
export class ReportDestinationDialog {
  readonly ref = inject<DialogRef<ReportDestinationResult & { message?: string }>>(DialogRef);
  readonly data = inject<ReportDestinationOptions>(DIALOG_DATA);

  /** Blank rather than a platform default: reports go in a bucket the workspace added itself. */
  readonly bucket = signal('');
  readonly folder = signal('reports');
  readonly submitUrl = signal('');
  readonly sending = signal(false);
  readonly sendError = signal('');

  private readonly connections = signal<BucketSummary[]>([]);
  readonly loadingBuckets = signal(false);
  readonly bucketsError = signal('');
  readonly bucketOptions = computed(() =>
    this.connections().map(b => ({ value: b.bucket, label: b.label || b.bucket, hint: b.provider })));

  constructor() {
    if (this.data.kind !== 'bucket') return;
    this.loadingBuckets.set(true);
    inject(StorageService).buckets().subscribe({
      next: response => {
        this.loadingBuckets.set(false);
        if (response.status !== API_SUCCESS) { this.bucketsError.set(response.message || 'The connections could not be read.'); return; }
        this.connections.set(response.data ?? []);
      },
      error: err => {
        this.loadingBuckets.set(false);
        this.bucketsError.set(err?.error?.message || 'The connections could not be read.');
      },
    });
  }

  valid(): boolean {
    return this.data.kind === 'bucket'
      ? !!this.bucket().trim() && this.connections().some(c => c.bucket === this.bucket().trim())
      : /^https?:\/\/\S+/.test(this.submitUrl().trim());
  }

  submit(event?: Event): void {
    event?.preventDefault();
    if (!this.valid() || this.sending()) return;
    const result: ReportDestinationResult = {
      bucket: this.bucket().trim(),
      folder: this.folder().trim() || 'reports',
      submitUrl: this.submitUrl().trim(),
    };
    if (!this.data.send) { this.ref.close(result); return; }
    this.sending.set(true);
    this.sendError.set('');
    this.data.send(result).subscribe({
      next: response => {
        this.sending.set(false);
        if (response.status === API_SUCCESS) this.ref.close({ ...result, message: response.message });
        else this.sendError.set(response.message || 'That export did not complete.');
      },
      error: err => {
        this.sending.set(false);
        this.sendError.set(err?.error?.message || 'That export did not complete.');
      },
    });
  }
}
