import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../core/api/api.config';
import { FormDialog } from '../../shared/ui/form-dialog';
import { Combobox } from '../../shared/ui/combobox';
import { InlineStatus, createLoadState } from '../../shared/ui/loading';
import { BucketSummary, StorageService } from '../objects/storage.service';

/** What the dialog asks for: its words, and the folder it starts with. */
export interface KeepDialogData {
  heading: string;
  subtitle: string;
  confirmLabel: string;
  folder: string;
  /** A bucket to start on (the last one used). */
  bucket?: string;
}

export interface KeepChoice {
  bucket: string;
  folder: string;
}

/** "converted/2026-11/": this month's folder under converted/, the design's default for kept results. */
export function monthFolder(prefix: string, now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${prefix.replace(/\/+$/, '')}/${now.getFullYear()}-${month}/`;
}

/**
 * Keep a result in a bucket (the tools redesign): one of the workspace's buckets and a folder. Used by the Document
 * Converter's Keep in a bucket and Start a pipeline, and by Audio Transcript's Start a pipeline. The page sends it.
 */
@Component({
  selector: 'app-keep-dialog',
  imports: [FormDialog, Combobox, InlineStatus],
  template: `
    <app-form-dialog [heading]="data.heading" [subtitle]="data.subtitle" [confirmLabel]="data.confirmLabel"
                     [confirmDisabled]="!bucket()" (confirmed)="confirm()" (cancelled)="ref.close()">
      <div class="form-stack">
        <div class="field">
          <label class="label" for="keep-bucket">Bucket</label>
          <app-combobox id="keep-bucket" [selected]="bucket()" (selectedChange)="bucket.set($event)" [allowClear]="false"
                        [placeholder]="state.pending() ? 'Loading buckets…' : 'Choose a bucket'" [options]="options()" />
          <app-inline-status [loading]="state.loading()" [error]="state.error()" label="Loading buckets…"
                             [empty]="state.loaded() && !buckets().length" emptyText="No bucket yet." (retry)="load()" />
        </div>
        <div class="field">
          <label class="label" for="keep-folder">Folder</label>
          <input id="keep-folder" class="input mono" placeholder="converted/" [value]="folder()"
                 (input)="folder.set($any($event.target).value)" />
          <p class="field-note text-[color:var(--text-muted)]">Optional; the bucket's root if left empty.</p>
        </div>
      </div>
    </app-form-dialog>
  `,
})
export class KeepDialog {
  readonly ref = inject<DialogRef<KeepChoice | undefined>>(DialogRef);
  readonly data = inject<KeepDialogData>(DIALOG_DATA);
  private readonly storage = inject(StorageService);

  readonly state = createLoadState();
  readonly buckets = signal<BucketSummary[]>([]);
  readonly bucket = signal(this.data.bucket ?? '');
  readonly folder = signal(this.data.folder);
  readonly options = computed(() => this.buckets().map(b => ({ value: b.bucket, label: b.label || b.bucket, hint: b.provider })));

  constructor() { this.load(); }

  load(): void {
    this.state.start();
    this.storage.buckets().subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.state.fail(r, 'The buckets could not be read.'); return; }
        this.buckets.set(r.data ?? []);
        if (!this.bucket() && this.buckets().length === 1) this.bucket.set(this.buckets()[0].bucket);
        this.state.done();
      },
      error: err => this.state.fail(err, 'The buckets could not be read.'),
    });
  }

  confirm(): void {
    if (!this.bucket()) return;
    this.ref.close({ bucket: this.bucket(), folder: this.folder().trim() });
  }
}
