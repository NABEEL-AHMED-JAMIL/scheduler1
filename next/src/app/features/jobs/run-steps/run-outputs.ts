import { Component, inject } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { chartable, openVisualise } from '../../analytics/charts/visualise-open';
import { RunOutput, formatsFor } from './run-steps.model';
import { outputLabel } from './run-page.model';
import { RunOutputView, RunOutputViewData, viewKind } from './run-output-view';
import { PreviewDialog, PreviewData } from '../../objects/preview/preview-dialog';
import { RunTimelineStore } from './run-timeline.store';

/**
 * The run page's Outputs tab (Wave 4, sourceJob.json/runOutputs): what the run put out -- kept files download through
 * their dataset until they expire, bucket uploads from storage as the object browser does. Each says what it is the
 * way people say it: "PDF · 2 pages · 21.8 KB", "CSV · 40 rows · 2.1 KB" -- a report is never "1 row".
 */
@Component({
  selector: 'app-run-outputs',
  imports: [Icon, ServerTimePipe],
  template: `
    <section class="card overflow-clip" aria-labelledby="run-files-heading" data-test="run-outputs">
      <div class="flex items-center gap-2 px-4 py-2.5 border-b border-subtle">
        <h2 id="run-files-heading" class="text-sm font-semibold">Files
          @if (files().length) { <span class="font-normal text-[color:var(--text-muted)]">· {{ files().length }}</span> }</h2>
      </div>
      @if (store.outputs() === 'error') {
        <p class="px-4 py-3 text-xs text-[color:var(--text-muted)]">The run's files could not be read.</p>
      } @else if (store.outputs() === null) {
        <p class="px-4 py-3 text-xs text-[color:var(--text-muted)]">
          {{ store.legacy() ? 'This run was not taken by the step engine, so it recorded no files.' : 'Reading the run\\'s files…' }}</p>
      } @else {
        <ul class="divide-y divide-[color:var(--border-subtle)] text-xs">
          @for (o of files(); track o.runOutputId) {
            <li class="exec-file flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5" [attr.data-kind]="o.kind">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 min-w-0">
                  <app-icon [name]="o.kind === 'bucket' ? 'upload' : 'file'" size="0.95em" class="icon-muted shrink-0" />
                  <span class="mono font-medium truncate text-sm" [title]="o.name">{{ o.name }}</span>
                  <span class="text-[color:var(--text-secondary)] whitespace-nowrap" data-test="output-label">{{ label(o) }}</span>
                </div>
                <div class="mt-0.5 text-[color:var(--text-muted)]">
                  {{ o.kind === 'bucket' ? 'Uploaded' : 'Kept' }} by step {{ (o.stepIndex ?? 0) + 1 }} <span class="mono">{{ o.stepKey }}</span>
                  @if (o.kind === 'file') {
                    @if (o.expired) { · <span class="text-warn-600">Expired</span> }
                    @else if (o.expiresAt) { · kept until {{ o.expiresAt | serverTime:'recent' }} }
                  } @else if (o.bucket) {
                    · <span class="mono break-all">{{ o.bucket }} / {{ o.key }}</span>
                  }
                </div>
              </div>
              <div class="flex flex-wrap justify-end gap-1" role="group" [attr.aria-label]="'Download ' + o.name">
                @if (canView(o)) {
                  <button type="button" class="btn btn-default btn-xs" data-test="view"
                          [disabled]="o.kind === 'file' ? !!o.expired || !o.runDatasetId : !o.bucket || !o.key"
                          [attr.aria-label]="'View ' + o.name" [title]="o.expired ? 'This file has expired' : 'Look at this file here'" (click)="view(o)">
                    <app-icon name="eye" />View
                  </button>
                }
                @if (canVisualise(o)) {
                  <button type="button" class="btn btn-default btn-xs" data-test="visualise" [disabled]="o.kind === 'file' ? !!o.expired || !o.runDatasetId : !o.bucket || !o.key"
                          [attr.aria-label]="'Visualise ' + o.name" title="Suggested charts of this file" (click)="visualise(o)">
                    <app-icon name="chart" />Visualise
                  </button>
                }
                @if (o.kind === 'file') {
                  @for (f of formatsFor(o.name, o.format); track f.id) {
                    <button type="button" class="btn btn-default btn-xs" [attr.data-format]="f.id"
                            [disabled]="!!o.expired || !o.runDatasetId || store.busy() !== ''"
                            [title]="o.expired ? 'This file has expired and can no longer be downloaded' : 'Download as ' + f.label"
                            (click)="store.downloadDataset(o.runDatasetId!, f.id, o.name)">
                      <app-icon name="download" />{{ f.label }}
                    </button>
                  }
                } @else {
                  <button type="button" class="btn btn-default btn-xs" [disabled]="!o.bucket || !o.key || store.busy() !== ''"
                          [attr.aria-label]="'Download ' + o.name + ' from ' + o.bucket" (click)="store.downloadUpload(o)">
                    <app-icon name="download" />Download
                  </button>
                }
              </div>
            </li>
          } @empty {
            <li class="px-4 py-3 text-[color:var(--text-muted)]">No files were recorded for this run.</li>
          }
        </ul>
      }
    </section>
  `,
})
export class RunOutputs {
  readonly store = inject(RunTimelineStore);
  private readonly dialog = inject(Dialog);
  readonly formatsFor = formatsFor;
  readonly files = this.store.outputList;

  label(o: RunOutput): string { return outputLabel(o); }

  /** Owner 2026-10-20: every output can be looked at in place -- an upload with the object browser's preview (any kind), a
   *  kept file when it is a PDF or a table (RunOutputView); anything else only downloads. */
  canView(o: RunOutput): boolean { return o.kind === 'bucket' || viewKind(o.name, o.format) !== null; }

  view(o: RunOutput): void {
    if (o.kind === 'bucket') {
      if (!o.bucket || !o.key) return;
      this.dialog.open<boolean, PreviewData>(PreviewDialog, { data: { bucket: o.bucket, key: o.key, name: o.name }, hasBackdrop: true });
    } else if (o.runDatasetId && !o.expired) {
      this.dialog.open<unknown, RunOutputViewData>(RunOutputView,
        { data: { name: o.name, runDatasetId: o.runDatasetId, format: o.format ?? null, rowCount: o.rowCount ?? null }, hasBackdrop: true });
    }
  }

  /** MIG-357: a table the run put out can be charted -- a kept file read as rows, an upload through Analytics. */
  canVisualise(o: RunOutput): boolean { return chartable(o.name, o.format); }

  visualise(o: RunOutput): void {
    if (o.kind === 'bucket') {
      if (!o.bucket || !o.key) return;
      void openVisualise(this.dialog, { name: o.name, connection: o.bucket, path: o.key });
    } else if (o.runDatasetId) {
      void openVisualise(this.dialog, { name: o.name, runDatasetId: o.runDatasetId, rowCount: o.rowCount ?? null });
    }
  }
}
