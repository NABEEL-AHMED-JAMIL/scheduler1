import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { API_BASE } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { PdfViewer } from '../../objects/preview/pdf-viewer';
import { rowsOf } from '../../analytics/charts/visualise-panel';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { copyText } from '../../../shared/ui/clipboard.util';
import { ToastService } from '../../../shared/ui/toast.service';
import { createTableSort } from '../../../shared/ui/sort';
import { SortHeader } from '../../../shared/ui/sort-header';
import { AppLoading, loadErrorText } from '../../../shared/ui/loading';

/** A kept file the run page can show: a PDF as itself, a table of rows as a table. */
export interface RunOutputViewData { name: string; runDatasetId: number; format: string | null; rowCount: number | null; }

/** The most rows the viewer draws; the rest are there in the download. */
export const VIEW_ROWS = 500;
/** A kept file larger than this is not read into the browser just to look at it (as Visualise). */
export const VIEW_READ_ROWS = 5000;

const PDF = ['pdf'];
const TABLE = ['csv', 'json', 'jsonl', 'ndjson', 'tsv', 'xlsx', 'parquet'];
/** A kept JSON file opens as formatted JSON (owner 2026-10-20: an insight is one object, not a table); Table is one click away. */
const JSON_FORMATS = ['json', 'jsonl', 'ndjson'];
/** A kept table's row as the viewer draws it: its place in the file (the # column) and its cells. */
export interface ViewRow { n: number; cells: (string | null)[]; }

/** The most characters of formatted JSON drawn; the rest is in the download. */
export const VIEW_JSON_CHARS = 200_000;

/**
 * What formatted JSON shows: one row as the object it is, several as the list. A text value that is itself JSON (a step
 * that kept a model's answer or a list as text) is shown as the JSON it holds, not as one escaped line.
 */
export function prettyJson(body: unknown): string {
  const value = Array.isArray(body) && body.length === 1 ? body[0] : body;
  return JSON.stringify(unpackJsonText(value, 0), null, 2) ?? '';
}

function unpackJsonText(value: unknown, depth: number): unknown {
  if (depth > 6) return value;
  if (typeof value === 'string') {
    const t = value.trim();
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { return unpackJsonText(JSON.parse(t), depth + 1); } catch { return value; }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(v => unpackJsonText(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, unpackJsonText(v, depth + 1)]));
  }
  return value;
}

/** How a kept file is shown, or null when it can only be downloaded. */
export function viewKind(name: string, format: string | null | undefined): 'pdf' | 'table' | null {
  const f = (format || name.split('.').pop() || '').toLowerCase();
  if (PDF.includes(f)) return 'pdf';
  if (TABLE.includes(f)) return 'table';
  return null;
}

/**
 * Owner 2026-10-20: the run page's Outputs had Download only -- a kept file is now viewed in place, read through the same
 * authorised runDataset call as its download: a PDF in the PDF viewer, a table as its first VIEW_ROWS rows. A bucket
 * upload opens the object browser's preview instead (RunOutputs), which already shows every kind of file.
 */
@Component({
  selector: 'app-run-output-view',
  imports: [Icon, PdfViewer, Segmented, SortHeader, AppLoading],
  template: `
    <div class="card shadow-2xl w-[72rem] max-w-[calc(100vw-2rem)] h-[88vh] flex flex-col overflow-hidden"
         role="dialog" [attr.aria-label]="'View ' + data.name" data-test="run-output-view">
      <div class="flex items-center gap-3 px-4 py-2.5 border-b shrink-0 border-subtle">
        <app-icon [name]="kind === 'pdf' ? 'file' : 'table'" class="icon-info shrink-0" />
        <div class="min-w-0 mr-auto">
          <div class="text-sm font-medium truncate" [title]="data.name">{{ data.name }}</div>
          <div class="text-[11px] text-[color:var(--text-muted)]">{{ subtitle() }}</div>
        </div>
        <button type="button" class="btn btn-ghost btn-icon shrink-0" (click)="ref.close()" aria-label="Close">
          <app-icon name="close" />
        </button>
      </div>
      @if (error()) {
        <div class="flex flex-col items-center justify-center gap-3 py-20 text-center" role="alert">
          <app-icon name="alert" size="1.75rem" class="icon-crit" />
          <p class="text-sm text-crit-500 max-w-md">{{ error() }}</p>
          @if (retryable()) {
            <button type="button" class="btn btn-default btn-sm" (click)="read()"><app-icon name="refresh" />Try again</button>
          }
        </div>
      } @else if (loading()) {
        <app-loading class="flex-1" shape="spinner" label="Reading the file…" />
      } @else if (kind === 'table' && !isJson && !rows().length) {
        <!-- Owner 2026-10-27: a kept table with no rows says so; it used to spin for ever. -->
        <p class="py-20 text-center text-sm text-[color:var(--text-muted)]" data-test="run-output-empty">This file has no rows.</p>
      } @else if (kind === 'pdf' && url()) {
        <app-pdf-viewer [src]="url()" />
      } @else if (kind === 'table' && isJson && mode() === 'json' && jsonText() !== null) {
        <div class="flex-1 min-h-0 p-3 flex flex-col gap-2" data-test="run-output-json">
          <div class="flex items-center gap-2">
            @if (columns().length) { <app-segmented [options]="modes" [(value)]="mode" ariaLabel="Show it as" /> }
            <span class="flex-1"></span>
            @if (jsonCut()) { <span class="text-xs text-[color:var(--text-muted)]">The first {{ jsonLimit.toLocaleString() }} characters · download it for the rest</span> }
            <button type="button" class="btn btn-default btn-xs" (click)="copyJson()" data-test="copy-json"><app-icon name="copy" />Copy</button>
          </div>
          <pre class="flex-1 min-h-0 overflow-auto mono text-xs leading-relaxed whitespace-pre-wrap break-words rounded p-3 bg-code border border-subtle">{{ jsonShown() }}</pre>
        </div>
      } @else if (kind === 'table' && columns().length) {
        @if (isJson) { <div class="px-3 pt-3"><app-segmented [options]="modes" [(value)]="mode" ariaLabel="Show it as" /></div> }
        <div class="flex-1 min-h-0 p-3">
          <div class="h-full overflow-auto rounded border border-subtle bg-code" data-test="run-output-table">
            <table class="table-modern preview-grid">
              <thead>
                <tr>
                  <th class="tabular text-[color:var(--text-muted)] text-right" appSort="#" [sortBy]="sort">#</th>
                  @for (c of columns(); track $index) { <th [title]="c" [appSort]="c" [sortBy]="sort">{{ c }}</th> }
                </tr>
              </thead>
              <tbody>
                @for (r of sortedRows(); track r.n) {
                  <tr>
                    <td class="tabular text-right text-[color:var(--text-muted)]">{{ r.n }}</td>
                    @for (v of r.cells; track $index) { <td [title]="v ?? ''">{{ v ?? '' }}</td> }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      } @else {
        <p class="py-20 text-center text-sm text-[color:var(--text-muted)]" data-test="run-output-empty">This file has nothing to show as a table.</p>
      }
    </div>
  `,
})
export class RunOutputView implements OnInit {
  readonly data = inject<RunOutputViewData>(DIALOG_DATA);
  readonly ref = inject(DialogRef);
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly kind = viewKind(this.data.name, this.data.format);
  readonly url = signal<string | null>(null);
  readonly columns = signal<string[]>([]);
  readonly rows = signal<(string | null)[][]>([]);
  readonly total = signal<number | null>(null);
  readonly error = signal('');
  /**
   * Owner 2026-10-27: the read's own flag. The spinner was the template's catch-all, so a shape it did not expect (a
   * first row with no keys) spun for ever; it now spins only while the read is out, and Try again follows a failed read.
   */
  readonly loading = signal(true);
  readonly retryable = signal(false);
  /** The rows with their place in the file, so a sort keeps each row's own number. */
  readonly indexed = computed<ViewRow[]>(() => this.rows().map((cells, i) => ({ n: i + 1, cells })));
  /** Owner 2026-10-27: the columns sort, each read as numbers, dates or text by what it holds; the file's order until then. */
  readonly sort = createTableSort<ViewRow>({
    id: 'run-output-view',
    columns: { '#': { value: r => r.n, kind: 'number', first: 'asc' } },
    dynamic: key => {
      const at = this.columns().indexOf(key);
      return at < 0 ? null : { value: r => r.cells[at], kind: 'auto' };
    },
    // A dialog that opens fresh for each file: the next file's columns are not this one's.
    remember: false,
  });
  readonly sortedRows = computed(() => this.sort.apply(this.indexed()));
  private readonly toast = inject(ToastService);
  readonly isJson = JSON_FORMATS.includes((this.data.format || this.data.name.split('.').pop() || '').toLowerCase());
  readonly modes: SegmentOption<'json' | 'table'>[] = [{ id: 'json', label: 'JSON' }, { id: 'table', label: 'Table' }];
  readonly mode = signal<'json' | 'table'>(this.isJson ? 'json' : 'table');
  readonly jsonLimit = VIEW_JSON_CHARS;
  readonly jsonText = signal<string | null>(null);
  readonly jsonCut = computed(() => (this.jsonText()?.length ?? 0) > VIEW_JSON_CHARS);
  readonly jsonShown = computed(() => (this.jsonText() ?? '').slice(0, VIEW_JSON_CHARS));

  constructor() {
    this.destroyRef.onDestroy(() => { const u = this.url(); if (u) URL.revokeObjectURL(u); });
  }

  async copyJson(): Promise<void> {
    const ok = await copyText(this.jsonText() ?? '');
    if (ok) this.toast.success('JSON copied'); else this.toast.error('Could not copy; select the text instead.');
  }

  subtitle(): string {
    if (this.kind === 'pdf') return 'The PDF the run kept';
    if (this.isJson && this.mode() === 'json') return 'The JSON the run kept, formatted';
    const total = this.total();
    if (total == null) return 'The table the run kept';
    const shown = Math.min(total, VIEW_ROWS);
    return shown < total
      ? `First ${shown.toLocaleString()} of ${total.toLocaleString()} rows · download it for the rest`
      : `${total.toLocaleString()} row${total === 1 ? '' : 's'}`;
  }

  ngOnInit(): void { this.read(); }

  read(): void {
    this.loading.set(true);
    this.error.set('');
    this.retryable.set(false);
    const failed = (err: unknown) => {
      this.loading.set(false);
      this.retryable.set(true);
      this.error.set(loadErrorText(err, 'The file could not be read; it may have expired.'));
    };
    const params = { runDatasetId: String(this.data.runDatasetId), format: this.kind === 'pdf' ? 'pdf' : 'json' };
    if (this.kind === 'pdf') {
      // Closed before the PDF arrives: no object URL is made that nothing would release.
      this.http.get(`${API_BASE}/sourceJob.json/runDataset`, { params, responseType: 'blob' }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: blob => {
          const old = this.url();
          if (old) URL.revokeObjectURL(old);
          this.url.set(URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })));
          this.loading.set(false);
        },
        // A blob error's body is a blob, so the words are the fallback's.
        error: () => failed(null),
      });
      return;
    }
    if (this.kind !== 'table') { this.loading.set(false); this.error.set('This file can only be downloaded.'); return; }
    if ((this.data.rowCount ?? 0) > VIEW_READ_ROWS) {
      this.loading.set(false);
      this.error.set(`This file has ${this.data.rowCount!.toLocaleString()} rows: download it, or open it with Visualise.`);
      return;
    }
    this.http.get<unknown>(`${API_BASE}/sourceJob.json/runDataset`, { params }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: body => {
        this.loading.set(false);
        if (this.isJson) this.jsonText.set(prettyJson(body));
        const table = rowsOf(body);
        if (!table) {
          if (this.isJson) { this.mode.set('json'); return; }
          // An empty list is a table with no rows, not a file that is not a table.
          if (Array.isArray(body) && !body.length) { this.total.set(0); return; }
          this.error.set('This file is not a table of rows.');
          return;
        }
        this.total.set(table.rows.length);
        this.columns.set(table.columns);
        this.rows.set(table.rows.slice(0, VIEW_ROWS));
      },
      error: err => failed(err),
    });
  }
}
