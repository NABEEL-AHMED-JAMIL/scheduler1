import { Component, inject, signal } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Icon } from '../../../shared/ui/icon';
import { InlineStatus, createLoadState } from '../../../shared/ui/loading';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { formatSize } from '../../../shared/ui/format-size';
import { ImageApi } from './image.api';
import { ImageDocument } from './image.model';

/** From Documents: the workspace's documents that are pictures (a photo sent in by mail, a form or an upload), newest first. */
@Component({
  selector: 'app-image-documents-picker',
  imports: [SidePanel, Icon, InlineStatus, ServerTimePipe],
  styles: `
    .dp-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.375rem; }
    .dp-list button { width: 100%; display: flex; align-items: center; gap: 0.625rem; text-align: left; padding: 0.5rem 0.75rem; font-size: 0.8125rem;
      border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--surface-raised); cursor: pointer; }
    .dp-list button:hover { background: var(--surface-sunken); }
    .dp-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
    .dp-meta { color: var(--text-muted); font-size: 0.75rem; white-space: nowrap; }
  `,
  template: `
    <app-side-panel heading="Pick a photo from Documents" subtitle="Pictures in this workspace's Documents">
      <app-inline-status [loading]="state.loading()" [error]="state.error()" label="Loading documents…" [empty]="state.loaded() && !rows().length"
                         emptyText="No picture in Documents yet." (retry)="load()" />
      <ul class="dp-list" data-test="documents-picker">
        @for (d of rows(); track d.ocrDocumentId) {
          <li><button type="button" (click)="ref.close(d)"><app-icon name="image" /><span class="dp-name">{{ d.name }}</span>
            <span class="dp-meta">@if (d.size != null) { {{ size(d.size) }} · }{{ d.createdAt ? (d.createdAt | serverTime: 'recent') : '' }}</span></button></li>
        }
      </ul>
      <ng-container foot><button type="button" class="btn btn-default btn-sm ml-auto" (click)="ref.close()">Cancel</button></ng-container>
    </app-side-panel>
  `,
})
export class DocumentsPicker {
  readonly ref = inject<DialogRef<ImageDocument | undefined>>(DialogRef);
  private readonly api = inject(ImageApi);
  readonly state = createLoadState();
  readonly rows = signal<ImageDocument[]>([]);

  constructor() { this.load(); }

  size(n: number): string {
    return formatSize(n);
  }

  load(): void {
    this.state.start();
    this.api.documents().subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) { this.state.fail(r, 'Documents could not be read.'); return; }
        this.rows.set(r.data.rows ?? []);
        this.state.done();
      },
      error: err => this.state.fail(err, 'Documents could not be read.'),
    });
  }
}
