import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Icon } from '../../shared/ui/icon';
import { formatSize } from '../../shared/ui/format-size';
import { PdfViewer } from '../objects/preview/pdf-viewer';
import { BillingApi, DOCUMENT_KIND_LABEL, DocumentRow } from './billing.service';

/**
 * A billing document read in place -- the same modal the Object Browser opens a file in, with
 * the console's own PDF viewer, so an invoice's PDF or a payment slip is looked at without
 * leaving the bill. Download and "open in a tab" stay in the header for whoever wants them.
 */
@Component({
  selector: 'app-document-view-dialog',
  imports: [Icon, DatePipe, PdfViewer],
  template: `
    <div class="card shadow-2xl w-[60rem] max-w-[calc(100vw-2rem)] max-h-[88vh] flex flex-col overflow-hidden">
      <div class="flex items-center gap-3 px-4 py-2.5 border-b shrink-0 border-subtle">
        <app-icon name="file" class="icon-info shrink-0" size="1.05em" />
        <div class="min-w-0 mr-auto">
          <div class="text-sm font-medium truncate leading-tight" [title]="data.fileName">{{ data.number || data.fileName }}</div>
          <div class="text-[11px] text-[color:var(--text-muted)] flex items-center gap-2 leading-tight mt-0.5">
            <span class="uppercase">{{ kindLabel[data.kind] }}</span>
            @if (data.sizeBytes) { <span>·</span><span>{{ humanSize(data.sizeBytes) }}</span> }
            <span>·</span><span>{{ data.issuedAt | date: 'd MMM yyyy, HH:mm' }}</span>
            @if (data.createdByName) { <span>·</span><span>{{ data.createdByName }}</span> }
          </div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" (click)="download()" [disabled]="!blob()"><app-icon name="download" />Download</button>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="openTab()" [disabled]="!blob()" title="Open in a new tab"><app-icon name="external" /></button>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="ref.close()" aria-label="Close"><app-icon name="close" /></button>
      </div>
      <div class="flex-1 min-h-0 h-[72vh] flex flex-col">
        @if (error()) {
          <div class="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8">
            <app-icon name="alert" size="1.6rem" class="icon-crit" /><p class="text-sm text-crit-500">{{ error() }}</p>
          </div>
        } @else if (!url()) {
          <div class="flex-1 flex flex-col items-center justify-center gap-3"><div class="spinner"></div><p class="text-sm text-[color:var(--text-muted)]">Reading {{ data.fileName }}…</p></div>
        } @else if (kind() === 'pdf') {
          <app-pdf-viewer [src]="url()" />
        } @else if (kind() === 'image') {
          <div class="flex-1 overflow-auto p-4 flex"><img [src]="url()" [alt]="data.fileName" class="max-w-full max-h-full object-contain m-auto" /></div>
        } @else {
          <div class="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8 text-sm text-[color:var(--text-muted)]">
            <app-icon name="file" size="1.5rem" class="icon-muted" /><p>{{ data.fileName }} — {{ data.contentType || 'unknown type' }}. Download it to read it.</p>
          </div>
        }
      </div>
    </div>
  `,
})
export class DocumentViewDialog implements OnInit, OnDestroy {
  readonly ref = inject<DialogRef<void>>(DialogRef);
  readonly data = inject<DocumentRow>(DIALOG_DATA);
  private readonly api = inject(BillingApi);
  readonly url = signal<string | null>(null);
  readonly blob = signal<Blob | null>(null);
  readonly error = signal('');
  readonly kindLabel = DOCUMENT_KIND_LABEL;
  readonly humanSize = formatSize;

  kind(): 'pdf' | 'image' | 'other' {
    const t = this.data.contentType ?? '';
    return t.includes('pdf') ? 'pdf' : t.startsWith('image/') ? 'image' : 'other';
  }

  ngOnInit(): void {
    this.api.documentBlob(this.data.documentId).subscribe({
      next: b => { this.blob.set(b); this.url.set(URL.createObjectURL(b)); },
      error: () => this.error.set('The document could not be read.'),
    });
  }
  ngOnDestroy(): void { const u = this.url(); if (u) URL.revokeObjectURL(u); }

  download(): void { const b = this.blob(); if (b) BillingApi.save(b, this.data.fileName); }
  openTab(): void { const b = this.blob(); if (b) BillingApi.open(b); }
}
