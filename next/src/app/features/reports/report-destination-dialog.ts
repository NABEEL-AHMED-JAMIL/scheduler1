import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { StorageService, BucketSummary } from '../objects/storage.service';
import { Combobox } from '../../shared/ui/combobox';
import { FormDialog } from '../../shared/ui/form-dialog';
import { Field } from '../../shared/ui/field';
import { Observable } from 'rxjs';
import { API_SUCCESS } from '../../core/api/api.config';
import { InlineStatus } from '../../shared/ui/loading';
import { RouterLink } from '@angular/router';

export interface ReportDestinationOptions {
  /** Where the report goes. Posting it to an endpoint ("Submit") was removed (owner, 2026-09-28). */
  kind: 'bucket';
  /**
   * Sends the export. When given, the dialog stays open until the server has answered, so a
   * refusal is shown beside what was typed; on success it closes with the server's message.
   */
  send?: (result: ReportDestinationResult) => Observable<{ status: string; message?: string }>;
}
export interface ReportDestinationResult {
  bucket: string;
  folder: string;
}

/**
 * Where "Save to bucket" asks for a connection and a folder.
 *
 * These used to be sequential window.prompt() calls -- unstyled, blocking the tab, and the one
 * dialog in the app that didn't go through the app's own CDK-dialog components the way every
 * other confirm/input flow does (Confirm, PromptDialog, ShareDialog).
 */
@Component({
  selector: 'app-report-destination-dialog',
  imports: [Combobox, FormDialog, Field, InlineStatus, RouterLink],
  template: `
    <form (submit)="submit($event)">
      <app-form-dialog heading="Save into a bucket" subtitle="Written as a file inside the folder you name."
                       confirmLabel="Save" busyLabel="Saving…"
                       [saving]="sending()" [confirmDisabled]="!valid()"
                       (confirmed)="submit()" (cancelled)="ref.close()">
        <div class="form-stack">
            <app-field label="Connection" for="bucket" [required]="true">
              @if (!bucketsError()) {
                <!-- The workspace's own connections, as the Object Browser offers them. It was free
                     text, and a typo showed up only as a toast after the dialog had closed. -->
                <app-combobox id="bucket" [selected]="bucket()" (selectedChange)="bucket.set($event)"
                              [options]="bucketOptions()" [allowClear]="false"
                              [placeholder]="loadingBuckets() ? 'Reading connections…' : 'Search connections…'" />
              }
              <!-- Owner 2026-10-27: loading, none (with where to add one) and a failed read with Try again. -->
              <app-inline-status [loading]="loadingBuckets()" [error]="bucketsError()" label="Reading connections…"
                                 [empty]="bucketsRead() && !bucketOptions().length" emptyText="No storage connection yet."
                                 (retry)="loadBuckets()">
                <a class="link-inline" routerLink="/connections/storage" (click)="ref.close()">Add one in Connections</a>
              </app-inline-status>
            </app-field>
            <app-field label="Folder" for="folder">
              <input id="folder" class="input" placeholder="reports"
                     [value]="folder()" (input)="folder.set($any($event.target).value)" />
            </app-field>
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
  readonly sending = signal(false);
  readonly sendError = signal('');

  private readonly connections = signal<BucketSummary[]>([]);
  readonly loadingBuckets = signal(false);
  readonly bucketsError = signal('');
  /** The connections answered (empty or not), so "none yet" is never said before they did. */
  readonly bucketsRead = signal(false);
  private readonly storage = inject(StorageService);
  readonly bucketOptions = computed(() =>
    this.connections().map(b => ({ value: b.bucket, label: b.label || b.bucket, hint: b.provider })));

  constructor() { this.loadBuckets(); }

  loadBuckets(): void {
    this.loadingBuckets.set(true);
    this.bucketsError.set('');
    this.storage.buckets().subscribe({
      next: response => {
        this.loadingBuckets.set(false);
        if (response.status !== API_SUCCESS) { this.bucketsError.set(response.message || 'The connections could not be read.'); return; }
        this.connections.set(response.data ?? []);
        this.bucketsRead.set(true);
      },
      error: err => {
        this.loadingBuckets.set(false);
        this.bucketsError.set(err?.error?.message || 'The connections could not be read.');
      },
    });
  }

  valid(): boolean {
    return !!this.bucket().trim() && this.connections().some(c => c.bucket === this.bucket().trim());
  }

  submit(event?: Event): void {
    event?.preventDefault();
    if (!this.valid() || this.sending()) return;
    const result: ReportDestinationResult = {
      bucket: this.bucket().trim(),
      folder: this.folder().trim() || 'reports',
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
