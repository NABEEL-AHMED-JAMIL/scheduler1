import { Component, DestroyRef, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Icon } from '../../shared/ui/icon';
import { PdfViewer } from '../objects/preview/pdf-viewer';
import { ReportStudioApi, studioError } from './report-studio.api';
import { saveBlob } from './report-files';

/** The dialog's heading id, for the opener's ariaLabelledBy. */
export const REPORT_FILE_TITLE_ID = 'report-file-title';

export interface ReportFileView {
  reportId: string;
  version: number;
  format: 'PDF' | 'HTML';
  fileName: string;
  title: string;
}

/**
 * Owner 2026-10-20: "View" beside a version's files -- the PDF in the console's own PDF viewer (pages, zoom), the HTML in a
 * sandboxed frame (no scripts, nothing it can reach), read in place without downloading. Download stays in the header.
 * The file comes through the same signed, audited download as the Download button.
 */
@Component({
  selector: 'app-report-file-dialog',
  imports: [Icon, PdfViewer],
  template: `
    <div class="card shadow-2xl w-[64rem] max-w-[calc(100vw-2rem)] max-h-[90vh] flex flex-col overflow-hidden">
      <div class="flex items-center gap-3 px-4 py-2.5 border-b shrink-0 border-subtle">
        <app-icon [name]="data.format === 'PDF' ? 'file' : 'code'" class="icon-info shrink-0" size="1.05em" />
        <div class="min-w-0 mr-auto">
          <h2 [id]="titleId" class="text-sm font-medium truncate leading-tight" [title]="data.fileName">{{ data.title }}</h2>
          <div class="text-[11px] text-[color:var(--text-muted)] leading-tight mt-0.5">{{ data.format }} · version {{ data.version }} · {{ data.fileName }}</div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" (click)="download()" [disabled]="!blob()"><app-icon name="download" />Download</button>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="ref.close()" aria-label="Close"><app-icon name="close" /></button>
      </div>
      <div class="flex-1 min-h-0 h-[76vh] flex flex-col">
        @if (error()) {
          <div class="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8">
            <app-icon name="alert" size="1.6rem" class="icon-crit" /><p class="text-sm text-crit-500">{{ error() }}</p>
          </div>
        } @else if (!url()) {
          <div class="flex-1 flex flex-col items-center justify-center gap-3"><div class="spinner"></div><p class="text-sm text-[color:var(--text-muted)]">Reading {{ data.fileName }}…</p></div>
        } @else if (data.format === 'PDF') {
          <app-pdf-viewer [src]="url()" />
        } @else {
          <iframe class="flex-1 w-full border-0 bg-[color:var(--paper)]" [src]="frameUrl()" sandbox="" referrerpolicy="no-referrer"
                  [title]="data.title + ' (HTML)'" data-test="report-html-frame"></iframe>
        }
      </div>
    </div>
  `,
})
export class ReportFileDialog implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(ReportStudioApi);
  private readonly sanitizer = inject(DomSanitizer);
  readonly titleId = REPORT_FILE_TITLE_ID;
  readonly ref = inject<DialogRef<void>>(DialogRef);
  readonly data = inject<ReportFileView>(DIALOG_DATA);
  readonly url = signal<string | null>(null);
  readonly blob = signal<Blob | null>(null);
  readonly frameUrl = signal<SafeResourceUrl | null>(null);
  readonly error = signal('');

  ngOnInit(): void {
    this.api.download(this.data.reportId, this.data.version, this.data.format).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        if (!res.body) { this.error.set('The file is empty.'); return; }
        const type = this.data.format === 'PDF' ? 'application/pdf' : 'text/html';
        const b = new Blob([res.body], { type });
        const u = URL.createObjectURL(b);
        this.blob.set(b);
        this.url.set(u);
        // A blob URL made here, shown in a frame with every sandbox permission off: the report's HTML can run nothing.
        if (this.data.format === 'HTML') this.frameUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(u));
      },
      error: e => this.error.set(studioError(e, 'The file could not be read.').message),
    });
  }

  ngOnDestroy(): void { const u = this.url(); if (u) URL.revokeObjectURL(u); }

  download(): void { const b = this.blob(); if (b) saveBlob(b, this.data.fileName); }
}
