import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { BucketSummary, StorageService } from '../../objects/storage.service';
import { RenderPanel, RenderSource } from '../../tools/converter/render-panel';

/**
 * A PDF from a dataset or a run (MIG-253), made from Reports › From pipelines. It was a mode of the Document Converter;
 * the tools redesign (owner-approved 2026-11-02) took it out of the file converter, since it prints rows through a
 * template rather than converting a file. The same render panel, in a panel over this page.
 */
@Component({
  selector: 'app-make-pdf-panel',
  imports: [SidePanel, Segmented, RenderPanel],
  template: `
    <app-side-panel heading="Make a PDF" subtitle="Rows from a dataset or from a run, printed through a template.">
      <app-segmented [value]="source()" (valueChange)="source.set($event)" [options]="options" ariaLabel="Where the rows come from" />
      <div class="mt-4">
        @if (source() === 'dataset') {
          <app-render-panel source="dataset" [buckets]="buckets()" />
        } @else {
          <app-render-panel source="execution" [buckets]="buckets()" />
        }
      </div>
      <ng-container foot>
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Close</button>
      </ng-container>
    </app-side-panel>
  `,
})
export class MakePdfPanel {
  readonly ref = inject(DialogRef);
  private readonly data = inject<{ source: RenderSource }>(DIALOG_DATA);
  readonly options: SegmentOption<RenderSource>[] = [
    { id: 'dataset', label: 'From a dataset', icon: 'table' },
    { id: 'execution', label: 'From a run', icon: 'play' },
  ];
  readonly source = signal<RenderSource>(this.data.source);
  readonly buckets = signal<BucketSummary[]>([]);

  constructor() {
    inject(StorageService).buckets().subscribe({
      next: r => { if (r.status === API_SUCCESS) this.buckets.set(r.data ?? []); },
      error: () => this.buckets.set([]),
    });
  }
}
