import { Component, computed, inject, signal } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../core/api/api.config';
import { FormDialog } from '../../shared/ui/form-dialog';
import { Icon } from '../../shared/ui/icon';
import { FileDropzone } from '../../shared/ui/file-dropzone';
import { IntakeAnswer, OCR_EXTENSIONS, refusalText } from './documents.model';
import { DocumentsApi } from './documents.service';

/** At most this many files at once (media.intake.max-files); the service says so too. */
export const UPLOAD_MAX_FILES = 20;

/** What the overview does next: read its lists again when anything was taken. */
export interface UploadDocumentsResult { changed: boolean; }

/**
 * Upload documents (MIG-271): many files into Document Intelligence at once. Each file becomes one document -- read, then
 * classified and extracted on its own -- or, when the workspace already has the same file (by checksum, from any
 * channel), it is a duplicate of that one; a file that is empty, too large or not a type OCR reads is refused. What
 * became of each file is listed when the upload is done.
 */
@Component({
  selector: 'app-upload-documents-dialog',
  imports: [FormDialog, Icon, FileDropzone],
  template: `
    <app-form-dialog heading="Upload documents" subtitle="Each file becomes one document; the same file twice is kept once."
                     [confirmLabel]="answers() ? 'Done' : 'Upload ' + count()" busyLabel="Uploading…" [saving]="saving()"
                     [confirmDisabled]="!answers() && !files().length" [cancelLabel]="answers() ? 'Close' : 'Cancel'"
                     (confirmed)="confirm()" (cancelled)="close()">
      <div class="form-stack">
        @if (!answers()) {
          <app-file-dropzone [multiple]="true" [accept]="accept" [disabled]="saving()" (picked)="add($event)"
                             prompt="Drop PDFs or images here" [hint]="'PDF, PNG, JPEG, TIFF or BMP · up to ' + max + ' files at once'" />
          @if (files().length) {
            <ul class="divide-y divide-[color:var(--border-subtle)] text-sm" aria-label="Files to upload">
              @for (f of files(); track f.name + f.size; let i = $index) {
                <li class="flex items-center gap-2 py-1.5 min-w-0">
                  <app-icon name="file" size="0.95em" class="text-[color:var(--text-muted)]" />
                  <span class="truncate min-w-0 flex-1">{{ f.name }}</span>
                  <span class="text-xs text-[color:var(--text-muted)] tabular">{{ size(f.size) }}</span>
                  <button type="button" class="btn btn-ghost btn-icon btn-xs" [disabled]="saving()" (click)="remove(i)" [attr.aria-label]="'Remove ' + f.name">
                    <app-icon name="close" size="0.8em" /></button>
                </li>
              }
            </ul>
          }
          @if (tooMany()) { <p class="text-xs text-crit-500" role="alert">At most {{ max }} files at once; remove {{ files().length - max }}.</p> }
        } @else {
          <p class="text-sm">{{ summary() }}</p>
          <ul class="divide-y divide-[color:var(--border-subtle)] text-sm" aria-label="What became of each file">
            @for (a of answers(); track a.intakeId) {
              <li class="py-1.5 min-w-0">
                <div class="flex items-center gap-2 min-w-0">
                  <app-icon [name]="a.outcome === 'Accepted' ? 'checkCircle' : a.outcome === 'Duplicate' ? 'copy' : 'alert'" size="0.95em"
                            [class.icon-crit]="a.outcome === 'Refused'" [class.icon-warn]="a.outcome === 'Duplicate'" [class.icon-ok]="a.outcome === 'Accepted'" />
                  <span class="truncate min-w-0 flex-1">{{ a.fileName }}</span>
                  <span class="pill" [class.pill-ok]="a.outcome === 'Accepted'" [class.pill-warn]="a.outcome === 'Duplicate'"
                        [class.pill-crit]="a.outcome === 'Refused'">{{ outcomeLabel(a) }}</span>
                </div>
                @if (a.reason) { <p class="text-xs text-[color:var(--text-muted)] ml-6">{{ a.reason }}</p> }
              </li>
            }
          </ul>
        }
        @if (error()) { <p class="text-xs text-crit-500" role="alert">{{ error() }}</p> }
      </div>
    </app-form-dialog>
  `,
})
export class UploadDocumentsDialog {
  private readonly ref = inject<DialogRef<UploadDocumentsResult>>(DialogRef);
  private readonly api = inject(DocumentsApi);

  readonly max = UPLOAD_MAX_FILES;
  readonly accept = OCR_EXTENSIONS.map(e => '.' + e).join(',');
  readonly files = signal<File[]>([]);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly answers = signal<IntakeAnswer[] | null>(null);
  readonly count = computed(() => { const n = this.files().length; return n ? `${n} file${n === 1 ? '' : 's'}` : ''; });
  readonly tooMany = computed(() => this.files().length > this.max);
  readonly summary = computed(() => {
    const list = this.answers() ?? [];
    const of = (o: string) => list.filter(a => a.outcome === o).length;
    const made = of('Accepted');
    return `${made} document${made === 1 ? '' : 's'} made · ${of('Duplicate')} already here · ${of('Refused')} refused. `
      + (made ? 'Each is read, then classified and extracted; it appears under Recent documents.' : '');
  });

  /** Picked or dropped files join the list; the same file (name and size) is listed once. */
  add(picked: File[]): void {
    this.error.set('');
    this.files.update(list => {
      const seen = new Set(list.map(f => f.name + '|' + f.size));
      return [...list, ...picked.filter(f => !seen.has(f.name + '|' + f.size))];
    });
  }

  remove(i: number): void { this.files.update(list => list.filter((_, k) => k !== i)); }

  confirm(): void {
    if (this.answers()) { this.close(); return; }
    if (!this.files().length || this.tooMany()) return;
    this.saving.set(true); this.error.set('');
    this.api.upload(this.files()).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message || 'The files could not be uploaded.'); return; }
        this.answers.set(r.data ?? []);
      },
      error: err => { this.saving.set(false); this.error.set(refusalText(err, 'The files could not be uploaded.')); },
    });
  }

  close(): void {
    this.ref.close({ changed: (this.answers() ?? []).some(a => a.outcome === 'Accepted') });
  }

  outcomeLabel(a: IntakeAnswer): string {
    return a.outcome === 'Accepted' ? (a.ocrDocumentId ? `Document ${a.ocrDocumentId}` : 'Taken')
      : a.outcome === 'Duplicate' ? `Already here (${a.ocrDocumentId})` : 'Refused';
  }

  size(bytes: number): string {
    return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
