import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { switchMap } from 'rxjs';
import { Icon } from '../../../shared/ui/icon';
import { PdfViewer } from '../../objects/preview/pdf-viewer';
import { GeneratedService } from './generated.service';
import { DEFAULT_OPTIONS, base64ToBlob, renderBody } from './generated.model';

export interface ReportPreviewData { name: string; runDatasetId: number; }

/**
 * MIG-253: a dataset a run kept, previewed as the PDF the default layout makes of it -- read from
 * Core, rendered by media-service, drawn by pdf.js from an object URL. Nothing is saved.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-report-preview-dialog',
  imports: [Icon, PdfViewer],
  template: `
    <div class="card shadow-2xl w-[56rem] max-w-[calc(100vw-2rem)] h-[88vh] flex flex-col overflow-hidden"
         role="dialog" [attr.aria-label]="'Preview of ' + data.name">
      <div class="flex items-center gap-3 px-4 py-2.5 border-b shrink-0 border-subtle">
        <app-icon name="file" class="icon-info shrink-0" />
        <div class="min-w-0 mr-auto">
          <div class="text-sm font-medium truncate" [title]="data.name">{{ data.name }}</div>
          <div class="text-[11px] text-[color:var(--text-muted)]">Rendered as a PDF with the default layout</div>
        </div>
        <button type="button" class="btn btn-ghost btn-icon shrink-0" (click)="ref.close()" aria-label="Close">
          <app-icon name="close" />
        </button>
      </div>
      @if (error()) {
        <div class="flex flex-col items-center justify-center gap-3 py-20 text-center" role="alert">
          <app-icon name="alert" size="1.75rem" class="icon-crit" />
          <p class="text-sm text-crit-500 max-w-md">{{ error() }}</p>
        </div>
      } @else if (url(); as src) {
        <app-pdf-viewer [src]="src" />
      } @else {
        <div class="flex flex-col items-center justify-center gap-3 py-20">
          <div class="spinner" role="status" aria-label="Rendering"></div>
          <p class="text-sm text-[color:var(--text-muted)]">Rendering…</p>
        </div>
      }
    </div>
  `,
})
export class ReportPreviewDialog implements OnInit {
  readonly data = inject<ReportPreviewData>(DIALOG_DATA);
  readonly ref = inject(DialogRef);
  private readonly service = inject(GeneratedService);
  readonly url = signal<string | null>(null);
  readonly error = signal('');

  constructor() {
    inject(DestroyRef).onDestroy(() => { const u = this.url(); if (u) URL.revokeObjectURL(u); });
  }

  ngOnInit(): void {
    const title = this.data.name.replace(/\.[^.]+$/, '');
    this.service.runDataset(this.data.runDatasetId).pipe(
      switchMap(rows => this.service.render(renderBody({ outputFormat: 'pdf', dataset: rows, options: { ...DEFAULT_OPTIONS, title } }))),
    ).subscribe({
      next: r => {
        if (r.status === 'SUCCESS' && r.data) this.url.set(URL.createObjectURL(base64ToBlob(r.data.outputBase64, 'application/pdf')));
        else this.error.set(r.message || 'The preview could not be rendered.');
      },
      error: e => this.error.set(e?.error?.message || 'The preview could not be rendered; the dataset may have expired.'),
    });
  }
}
