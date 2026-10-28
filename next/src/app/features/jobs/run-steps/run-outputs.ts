import { Component, computed, inject, signal } from '@angular/core';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Dialog } from '@angular/cdk/dialog';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { chartable, openVisualise } from '../../analytics/charts/visualise-open';
import { RunOutput, formatsFor } from './run-steps.model';
import { outputLabel } from './run-page.model';
import { RunOutputView, RunOutputViewData, viewKind } from './run-output-view';
import { PreviewDialog, PreviewData } from '../../objects/preview/preview-dialog';
import { RunTimelineStore } from './run-timeline.store';
import { copyText } from '../../../shared/ui/clipboard.util';
import { ToastService } from '../../../shared/ui/toast.service';
import { createTableSort } from '../../../shared/ui/sort';
import { SortHeader } from '../../../shared/ui/sort-header';
import { AppLoading } from '../../../shared/ui/loading';
import { LoadError } from '../../../shared/ui/load-error';

/**
 * The run page's Outputs tab (Wave 4, sourceJob.json/runOutputs): what the run put out -- kept files download through
 * their dataset until they expire, bucket uploads from storage as the object browser does. Each says what it is the
 * way people say it: "PDF · 2 pages · 21.8 KB", "CSV · 40 rows · 2.1 KB" -- a report is never "1 row".
 */
@Component({
  selector: 'app-run-outputs',
  imports: [Icon, ServerTimePipe, CdkMenu, CdkMenuItem, CdkMenuTrigger, SortHeader, AppLoading, LoadError],
  styles: `
    .ro-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
    .ro-table th { text-align: left; font-weight: 600; font-size: 0.6875rem; letter-spacing: 0.04em; text-transform: uppercase;
                   color: var(--text-muted); padding: 0.5rem 1rem; border-bottom: 1px solid var(--border-subtle); white-space: nowrap; }
    .ro-table td { padding: 0.55rem 1rem; border-bottom: 1px solid var(--border-subtle); vertical-align: middle; }
    .ro-table tr:last-child td { border-bottom: 0; }
    .ro-group td { background: var(--surface-sunken); padding-block: 0.4rem; }
    .ro-name { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }
    .ro-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ro-actions { display: flex; justify-content: flex-end; gap: 0.25rem; white-space: nowrap; }
  `,
  template: `
    <section class="card overflow-clip" aria-labelledby="run-files-heading" data-test="run-outputs">
      <div class="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-subtle">
        <h2 id="run-files-heading" class="text-sm font-semibold">Files
          @if (files().length) { <span class="font-normal text-[color:var(--text-muted)]">· {{ shownCount() }}{{ shownCount() !== files().length ? ' of ' + files().length : '' }}</span> }</h2>
        <span class="flex-1"></span>
        @if (files().length > 6) {
          <select class="input py-1 text-xs w-36" aria-label="Type" [value]="typeFilter()" (change)="typeFilter.set($any($event.target).value)" data-test="output-type">
            <option value="">All types</option>
            @for (t of types(); track t) { <option [value]="t">{{ t }}</option> }
          </select>
          <input class="input py-1 text-xs w-56" type="search" placeholder="Find a file" aria-label="Find a file"
                 [value]="query()" (input)="query.set($any($event.target).value)" data-test="output-search" />
        }
      </div>
      <!-- Owner 2026-10-27: a failed read offers Try again; the files wait on the steps' read, so a failure of that one
           is said here too instead of "Reading the run's files…" for ever. -->
      @if (store.outputs() === 'error') {
        <app-load-error message="The run's files could not be read." (retry)="store.retryOutputs()" />
      } @else if (store.outputs() === null && store.legacy()) {
        <p class="px-4 py-3 text-xs text-[color:var(--text-muted)]">This run was not taken by the step engine, so it recorded no files.</p>
      } @else if (store.outputs() === null && store.readError()) {
        <app-load-error message="The run's steps could not be read, so neither could its files." (retry)="store.retry()" />
      } @else if (store.outputs() === null) {
        <app-loading shape="rows" [count]="3" label="Reading the run's files…" />
      } @else if (!files().length) {
        <p class="px-4 py-3 text-xs text-[color:var(--text-muted)]">No files were recorded for this run.</p>
      } @else {
        <div class="overflow-x-auto">
          <table class="ro-table">
            <thead><tr><th appSort="file" [sortBy]="sort">File</th><th appSort="type" [sortBy]="sort">Type</th>
              <th appSort="size" [sortBy]="sort">Size</th><th appSort="kept" [sortBy]="sort">Kept</th>
              <th class="text-right"><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              @for (g of groups(); track g.key) {
                <tr class="ro-group">
                  <td colspan="5">
                    <button type="button" class="flex items-center gap-1.5 text-xs font-medium text-[color:var(--text-secondary)]"
                            [attr.aria-expanded]="!isFolded(g.key)" (click)="toggle(g.key)" data-test="output-group">
                      <app-icon [name]="isFolded(g.key) ? 'chevronRight' : 'chevronDown'" size="0.9em" />
                      Step {{ g.step }} · <span class="mono">{{ g.stepKey }}</span>
                      <span class="font-normal text-[color:var(--text-muted)]">&nbsp;· {{ g.rows.length }} {{ g.rows.length === 1 ? 'file' : 'files' }}</span>
                    </button>
                  </td>
                </tr>
                @if (!isFolded(g.key)) {
                  @for (o of g.rows; track o.runOutputId) {
                    <tr class="exec-file" [attr.data-kind]="o.kind">
                      <td class="max-w-0 w-[44%]">
                        <div class="ro-name">
                          <app-icon [name]="iconOf(o)" size="1em" class="icon-muted shrink-0" />
                          <span class="font-medium" [title]="o.name">{{ o.name }}</span>
                        </div>
                      </td>
                      <td><span class="pill">{{ typeOf(o) }}</span></td>
                      <td class="whitespace-nowrap text-[color:var(--text-secondary)]" data-test="output-label">{{ sizeOf(o) }}</td>
                      <td class="whitespace-nowrap text-[color:var(--text-muted)] max-w-[16rem] truncate"
                          [title]="o.kind === 'bucket' ? (o.bucket + ' / ' + o.key) : ''">
                        @if (o.kind === 'file') {
                          @if (o.downloadable === false) {
                            <!-- ZT-M21: a sensitive pipeline's file -- listed, its bytes the permission's. -->
                            <span class="inline-flex items-center gap-1" data-test="sensitive-file" [title]="o.refusal || ''">
                              <app-icon name="lock" size="0.9em" />Sensitive · needs Download sensitive files
                            </span>
                          } @else if (o.expired) { <span class="text-warn-600">Expired</span> }
                          @else if (o.expiresAt) { With the run · until {{ o.expiresAt | serverTime:'recent' }} }
                          @else { With the run }
                        } @else {
                          <app-icon name="cloud" size="0.9em" class="icon-muted" /> {{ o.bucket }} / {{ o.key }}
                        }
                      </td>
                      <td>
                        <div class="ro-actions" role="group" [attr.aria-label]="'Actions for ' + o.name">
                          @if (canView(o)) {
                            <button type="button" class="btn btn-default btn-xs" data-test="view" [disabled]="!usable(o)"
                                    [attr.aria-label]="'View ' + o.name" [title]="o.expired ? 'This file has expired' : 'Look at this file here'" (click)="view(o)">
                              <app-icon name="eye" />View
                            </button>
                          }
                          @if (o.kind === 'file') {
                            @if (formatsFor(o.name, o.format).length === 1) {
                              <button type="button" class="btn btn-default btn-xs" [attr.data-format]="formatsFor(o.name, o.format)[0].id"
                                      [disabled]="!usable(o) || store.busy() !== ''" [attr.aria-label]="'Download ' + o.name"
                                      [title]="o.expired ? 'This file has expired and can no longer be downloaded' : 'Download as ' + formatsFor(o.name, o.format)[0].label"
                                      (click)="store.downloadDataset(o.runDatasetId!, formatsFor(o.name, o.format)[0].id, o.name)">
                                <app-icon name="download" />Download
                              </button>
                            } @else if (formatsFor(o.name, o.format).length > 1) {
                              <button type="button" class="btn btn-default btn-xs" data-test="download" [cdkMenuTriggerFor]="formats"
                                      [disabled]="!usable(o) || store.busy() !== ''" [attr.aria-label]="'Download ' + o.name + ' as…'">
                                <app-icon name="download" />Download<app-icon name="chevronDown" size="0.8em" />
                              </button>
                              <ng-template #formats>
                                <div cdkMenu class="card shadow-xl py-1 min-w-36 text-sm">
                                  @for (f of formatsFor(o.name, o.format); track f.id) {
                                    <button cdkMenuItem class="menu-item" [attr.data-format]="f.id"
                                            (cdkMenuItemTriggered)="store.downloadDataset(o.runDatasetId!, f.id, o.name)">As {{ f.label }}</button>
                                  }
                                </div>
                              </ng-template>
                            }
                          } @else {
                            <button type="button" class="btn btn-default btn-xs" data-test="download-upload" [disabled]="!usable(o) || store.busy() !== ''"
                                    [attr.aria-label]="'Download ' + o.name + ' from ' + o.bucket" (click)="store.downloadUpload(o)">
                              <app-icon name="download" />Download
                            </button>
                          }
                          <button type="button" class="btn btn-ghost btn-icon btn-xs" data-test="output-more" [cdkMenuTriggerFor]="more"
                                  [attr.aria-label]="'More for ' + o.name"><app-icon name="dots" /></button>
                          <ng-template #more>
                            <div cdkMenu class="card shadow-xl py-1 min-w-48 text-sm">
                              @if (canVisualise(o)) {
                                <button cdkMenuItem class="menu-item" data-test="visualise" [cdkMenuItemDisabled]="!usable(o)"
                                        (cdkMenuItemTriggered)="visualise(o)"><app-icon name="chart" />Visualise</button>
                              }
                              <button cdkMenuItem class="menu-item" (cdkMenuItemTriggered)="copyWhere(o)"><app-icon name="copy" />{{ o.kind === 'bucket' ? 'Copy bucket path' : 'Copy file name' }}</button>
                            </div>
                          </ng-template>
                        </div>
                      </td>
                    </tr>
                  }
                }
              } @empty {
                <tr><td colspan="5" class="text-[color:var(--text-muted)]">No file matches.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
})
export class RunOutputs {
  readonly store = inject(RunTimelineStore);
  private readonly dialog = inject(Dialog);
  readonly formatsFor = formatsFor;
  readonly files = this.store.outputList;

  private readonly toast = inject(ToastService);
  readonly query = signal('');
  readonly typeFilter = signal('');
  private readonly folded = signal<ReadonlySet<string>>(new Set());

  label(o: RunOutput): string { return outputLabel(o); }

  /** The Size column: rows or pages and bytes; the type has its own column, so it is not said twice. */
  sizeOf(o: RunOutput): string { return outputLabel(o).split(' · ').slice(1).join(' · ') || '—'; }

  /** A file's type as people say it: the format, else its extension. */
  typeOf(o: RunOutput): string { return (o.format || (/\.([a-z0-9]+)$/i.exec(o.name ?? '')?.[1] ?? 'file')).toUpperCase(); }

  iconOf(o: RunOutput): string {
    const t = this.typeOf(o);
    if (t === 'PDF') return 'file';
    if (['JSON', 'JSONL', 'NDJSON'].includes(t)) return 'code';
    if (['CSV', 'TSV', 'XLSX', 'PARQUET'].includes(t)) return 'table';
    if (['M4A', 'MP3', 'WAV', 'OGG', 'FLAC', 'WEBM'].includes(t)) return 'volume';
    if (['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP'].includes(t)) return 'image';
    return o.kind === 'bucket' ? 'cloud' : 'file';
  }

  usable(o: RunOutput): boolean {
    return o.kind === 'file' ? !o.expired && !!o.runDatasetId && o.downloadable !== false : !!o.bucket && !!o.key;
  }

  readonly types = computed(() => [...new Set(this.files().map(o => this.typeOf(o)))].sort());
  private readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    const t = this.typeFilter();
    return this.files().filter(o => (!t || this.typeOf(o) === t) && (!q || o.name.toLowerCase().includes(q) || (o.key ?? '').toLowerCase().includes(q)));
  });
  readonly shownCount = computed(() => this.shown().length);
  /** The files by the step that made them, in step order (owner 2026-10-20: one flat list of ten looked like a wall of buttons). */
  readonly groups = computed(() => {
    const byStep = new Map<string, { key: string; step: number; stepKey: string; rows: RunOutput[] }>();
    for (const o of this.shown()) {
      const key = `${o.stepIndex ?? 0}:${o.stepKey ?? ''}`;
      if (!byStep.has(key)) byStep.set(key, { key, step: (o.stepIndex ?? 0) + 1, stepKey: o.stepKey ?? '', rows: [] });
      byStep.get(key)!.rows.push(o);
    }
    // Owner 2026-10-27: a sort orders the files inside each step; the steps keep their order.
    return [...byStep.values()].sort((a, b) => a.step - b.step).map(g => ({ ...g, rows: this.sort.apply(g.rows) }));
  });

  /**
   * Owner 2026-10-27: the columns sort, inside each step's group. Size sorts by the bytes (a report's pages and a table's
   * rows come with them); Kept by when the file is kept until -- an upload kept in a bucket has no end and goes last.
   */
  readonly sort = createTableSort<RunOutput>({
    id: 'run-outputs',
    columns: {
      file: o => o.name,
      type: o => this.typeOf(o),
      size: { value: o => o.byteCount ?? o.rowCount, kind: 'number' },
      kept: { value: o => (o.kind === 'file' ? o.expiresAt : null), kind: 'date' },
    },
    initial: null,
  });

  isFolded(key: string): boolean { return this.folded().has(key); }
  toggle(key: string): void {
    const next = new Set(this.folded());
    if (next.has(key)) next.delete(key); else next.add(key);
    this.folded.set(next);
  }

  async copyWhere(o: RunOutput): Promise<void> {
    const text = o.kind === 'bucket' ? `${o.bucket}/${o.key}` : o.name;
    if (await copyText(text)) this.toast.success('Copied'); else this.toast.error('Could not copy; select the text instead.');
  }

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
