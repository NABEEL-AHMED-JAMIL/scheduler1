import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { StorageService } from '../objects/storage.service';
import { fieldLabel } from './run-review-card';

/** One output a run recorded (sourceJob.json/runOutputs), as far as this card reads it. */
interface RunOutput {
  stepIndex?: number | null; stepKey?: string; task?: string; kind?: string; format?: string | null; name?: string;
  rowCount?: number | null; runDatasetId?: number | null; bucket?: string | null; key?: string | null; expired?: boolean;
}

type Row = Record<string, unknown>;

/** A value that names an image file. */
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;
/** Rows a reviewer reads here; the run page has every row. */
const MAX_ROWS = 200;
/** Photos loaded at once (each is a download). */
const MAX_PHOTOS = 24;
/** A column whose values sort rows into a few kinds: what a reviewer counts first. */
const CATEGORY_HINT = /(status|check|decision|priority|risk|trend|result|flag|outcome|tier|band|urgency|class)/i;
/** A column that tells one row of an item from another (its visit, its date, its role). */
const DISTINGUISH = /(role|visit|date|stage|step|period|version)/i;
/** Columns shown before "All columns". */
const FIRST_COLUMNS = 8;

/** A CSV file's rows (RFC 4180: quoted fields, doubled quotes, CRLF), keyed by its header. */
export function parseCsv(text: string): Row[] {
  const records: string[][] = [];
  let field = '', record: string[] = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { record.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      record.push(field); field = '';
      if (record.length > 1 || record[0] !== '') records.push(record);
      record = [];
    } else field += c;
  }
  if (field !== '' || record.length) { record.push(field); records.push(record); }
  const [head, ...body] = records;
  return head ? body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))) : [];
}

/** The columns worth a reviewer's eye: not the engine's own (_source_key), not paths the photo gallery already shows. */
export function shownColumns(rows: Row[], imageColumn: string | null): string[] {
  const all = rows.length ? Object.keys(rows[0]) : [];
  return all.filter(c => !c.startsWith('_') && c !== imageColumn && !(rows.every(r => typeof r[c] === 'string' && IMAGE.test(r[c] as string))));
}

/** The column naming each row's image, when every row that has one names an image file. */
export function imageColumnOf(rows: Row[]): string | null {
  if (!rows.length) return null;
  const candidates = Object.keys(rows[0]).filter(c => rows.some(r => typeof r[c] === 'string' && IMAGE.test(r[c] as string)));
  return candidates.find(c => /key|path/i.test(c)) ?? candidates[0] ?? null;
}

/** Up to two columns that sort the rows into a few kinds (2-6 values), the hinted names first: "Matches the chart 16 · Re-measure 2". */
export function breakdowns(rows: Row[], columns: string[]): { column: string; label: string; counts: { value: string; count: number }[] }[] {
  if (rows.length < 3) return [];
  const out = columns.map(column => {
    const counts = new Map<string, number>();
    for (const r of rows) { const v = String(r[column] ?? '').trim(); if (v) counts.set(v, (counts.get(v) ?? 0) + 1); }
    return { column, label: fieldLabel(column), counts: [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count) };
  }).filter(b => b.counts.length >= 2 && b.counts.length <= 6 && b.counts.every(c => c.value.length <= 60)
    && !b.counts.every(c => /^-?\d+(\.\d+)?$/.test(c.value)));
  const hinted = out.filter(b => CATEGORY_HINT.test(b.column));
  return (hinted.length ? hinted : out).slice(0, 2);
}

/** A row's identity first, then what tells its rows apart (a visit, a date), then its kinds, then the rest. */
export function orderedColumns(columns: string[], kinds: string[]): string[] {
  const id = columns.find(c => /(^id$|_id$|^name$|_name$)/i.test(c));
  const apart = columns.find(c => c !== id && DISTINGUISH.test(c));
  const front = [id, apart, ...kinds].filter((c, i, a): c is string => !!c && a.indexOf(c) === i);
  return [...front, ...columns.filter(c => !front.includes(c))];
}

/**
 * Owner 2026-10-21: a pipeline step's approval showed its raw subject (job id, step index, approval id, the first row's
 * fields) under "Request details", so a reviewer approving 18 photos saw one of them. This card shows what is being
 * approved: the step and its run in words, what the pipeline asks to be checked, the figures it reported, and the rows
 * themselves -- read from what the run kept before the approval step (a dataset, or a CSV it put in a bucket), with a
 * breakdown of their kinds to filter by and the photos they name. Generic: any pipeline, any domain.
 */
@Component({
  selector: 'app-pipeline-approval-card',
  imports: [Icon, RouterLink],
  styles: `
    .pac { display: flex; flex-direction: column; gap: 1.25rem; }
    .pac-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr)); gap: 0.75rem; margin: 0;
                 padding: 0.875rem 1rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); background: var(--surface-inset); }
    .pac-facts dt { font-size: 0.6875rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); font-weight: 600; }
    .pac-facts dd { margin: 0.125rem 0 0; font-size: 0.875rem; font-weight: 500; overflow-wrap: anywhere; }
    .pac-facts dd a { text-decoration: underline; text-underline-offset: 2px; }
    .pac-ask { display: flex; gap: 0.625rem; align-items: flex-start; padding: 0.75rem 1rem; border-radius: var(--radius-lg);
               border: 1px solid color-mix(in oklab, var(--accent-mark-strong) 35%, transparent); background: var(--accent-soft); font-size: 0.875rem; }
    .pac-ask b { display: block; font-size: 0.75rem; letter-spacing: 0.03em; text-transform: uppercase; margin-bottom: 0.125rem; }
    .pac-figures { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .pac-figure { border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 0.375rem 0.75rem; font-size: 0.8125rem; }
    .pac-figure span { color: var(--text-muted); margin-right: 0.375rem; }
    .pac-head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .pac-break { display: flex; flex-wrap: wrap; align-items: center; gap: 0.375rem; font-size: 0.8125rem; }
    .pac-break-label { color: var(--text-muted); margin-right: 0.125rem; }
    .pac-chip { border: 1px solid var(--border-subtle); border-radius: 999px; padding: 0.125rem 0.625rem; background: var(--surface);
                cursor: pointer; font-size: 0.8125rem; }
    .pac-chip:hover { background: var(--surface-sunken); }
    /* Selected as the console marks a selection (the open inbox row): the soft accent and its mark, never solid ink. */
    .pac-chip[aria-pressed='true'] { background: var(--accent-soft); color: var(--accent-text); border-color: var(--accent-mark-strong);
                                     box-shadow: 0 0 0 1px var(--accent-mark-strong); }
    .pac-chip b { font-weight: 600; margin-left: 0.25rem; }
    .pac-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr)); gap: 0.625rem; }
    .pac-photo { margin: 0; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); overflow: hidden; background: var(--surface-inset); }
    .pac-photo img, .pac-photo .pac-ph { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; }
    .pac-photo .pac-ph { display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: var(--text-muted); }
    .pac-photo figcaption { padding: 0.25rem 0.5rem; font-size: 0.75rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pac-table { max-height: 26rem; overflow: auto; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); }
    .pac-table thead th { position: sticky; top: 0; z-index: 1; background: var(--surface); }
    .pac-table td { white-space: nowrap; }
    .pac-photo.pac-odd { border-color: var(--color-warn-500); box-shadow: 0 0 0 1px var(--color-warn-500); }
    .pac-table tr.pac-odd td { background: var(--pill-warn-bg); }
    .pac-tech summary { cursor: pointer; font-size: 0.8125rem; color: var(--text-secondary); }
    .pac-tech dl { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: 0.5rem 1rem; margin: 0.625rem 0 0; }
    .pac-tech dt { font-size: 0.6875rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .pac-tech dd { margin: 0; font-size: 0.8125rem; font-family: var(--font-mono, monospace); }
  `,
  template: `
    <div class="pac" data-test="pipeline-approval-card">
      <dl class="pac-facts" data-test="approval-facts">
        <div><dt>Pipeline</dt><dd>{{ pipelineName() }}</dd></div>
        <div><dt>Run</dt><dd>@if (link()) { <a [routerLink]="link()!">#{{ jobQueueId() }}</a> } @else { #{{ jobQueueId() }} }</dd></div>
        <div><dt>Step</dt><dd>{{ stepName() }}</dd></div>
        <div><dt>Rows waiting</dt><dd>{{ rowCount() ?? '—' }}</dd></div>
        @if (requestedAt()) { <div><dt>Requested</dt><dd [title]="requestedAt()!">{{ when(requestedAt()) }}</dd></div> }
        @if (expiresAt()) { <div><dt>{{ open() ? 'Decide by' : 'Was due by' }}</dt><dd [title]="expiresAt()!">{{ when(expiresAt()) }}</dd></div> }
      </dl>

      @if (instructions()) {
        <div class="pac-ask" role="note" data-test="approval-instructions">
          <app-icon name="info" size="1.1em" class="mt-0.5 shrink-0" />
          <div><b>What to check</b>{{ instructions() }}</div>
        </div>
      }

      @if (figures().length) {
        <section aria-labelledby="pac-figures-title">
          <h3 class="section-title mb-2" id="pac-figures-title">Figures the step reported</h3>
          <div class="pac-figures" data-test="approval-figures">
            @for (f of figures(); track f.label) { <span class="pac-figure"><span>{{ f.label }}</span>{{ f.value }}</span> }
          </div>
        </section>
      }

      <section aria-labelledby="pac-rows-title" class="flex flex-col gap-3">
        <div class="pac-head">
          <h3 class="section-title m-0" id="pac-rows-title">Rows to approve</h3>
          @if (rows().length) { <span class="pill pill-neutral" data-test="approval-row-count">{{ shownRows().length }} of {{ rowCount() ?? rows().length }}</span> }
          @if (exceptions()) { <span class="pill pill-warn" data-test="approval-exceptions" title="Rows outside the commonest {{ breakdown()[0].label.toLowerCase() }}; listed first">{{ exceptions() }} to look at first</span> }
          <span class="flex-1"></span>
          @if (pdf(); as p) {
            <button type="button" class="btn btn-default btn-sm" (click)="openPdf(p)" [disabled]="opening()" data-test="approval-pdf"><app-icon name="file" />{{ p.name || 'Report PDF' }}</button>
          }
          @if (link()) { <a class="btn btn-ghost btn-sm" [routerLink]="link()!"><app-icon name="external" />Open the run</a> }
        </div>

        @if (loading()) {
          <p class="text-sm text-[color:var(--text-muted)]" data-test="approval-rows-loading">Reading the rows the run kept…</p>
        } @else if (!rows().length) {
          <p class="text-sm text-[color:var(--text-secondary)]" data-test="approval-rows-none">
            This run kept no copy of its rows before the approval step, so they cannot be listed here. Open the run to see each step's counts and log;
            a pipeline that keeps them (a "Save file" or "Upload to bucket" step before the approval) shows them here.
          </p>
        } @else {
          @for (b of breakdown(); track b.column) {
            <div class="pac-break" data-test="approval-breakdown">
              <span class="pac-break-label">{{ b.label }}:</span>
              @for (c of b.counts; track c.value) {
                <button type="button" class="pac-chip" [attr.aria-pressed]="isOn(b.column, c.value)" (click)="toggle(b.column, c.value)">{{ c.value }}<b>{{ c.count }}</b></button>
              }
            </div>
          }
          @if (photoRows().length) {
            <div class="pac-gallery" data-test="approval-photos">
              @for (p of photoRows(); track p.key) {
                <figure class="pac-photo" [class.pac-odd]="p.odd">
                  @if (photoUrls()[p.key]; as src) { <img [src]="src" [alt]="'Photo: ' + p.caption" loading="lazy" /> }
                  @else { <div class="pac-ph">{{ photoErrors()[p.key] ? 'Cannot be read' : 'Loading…' }}</div> }
                  <figcaption [title]="p.caption">{{ p.caption }}</figcaption>
                </figure>
              }
            </div>
            @if (shownRows().length > photoRows().length) { <p class="text-xs text-[color:var(--text-muted)] m-0">The first {{ photoRows().length }} photos; every row is in the table.</p> }
          }
          @if (allColumns().length > columns().length || allShown()) {
            <div class="flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
              <span>{{ columns().length }} of {{ allColumns().length }} columns</span>
              <button type="button" class="btn btn-ghost btn-xs" (click)="allShown.set(!allShown())" data-test="approval-columns">{{ allShown() ? 'Fewer columns' : 'All columns' }}</button>
            </div>
          }
          <div class="pac-table" data-test="approval-rows">
            <table class="table-modern">
              <thead><tr>@for (c of columns(); track c) { <th scope="col">{{ label(c) }}</th> }</tr></thead>
              <tbody>
                @for (r of shownRows(); track $index) { <tr [class.pac-odd]="odd(r)">@for (c of columns(); track c) { <td>{{ r[c] }}</td> }</tr> }
              </tbody>
            </table>
          </div>
          @if ((rowCount() ?? 0) > rows().length) { <p class="text-xs text-[color:var(--text-muted)] m-0">The first {{ rows().length }} rows; the run has all {{ rowCount() }}.</p> }
        }
      </section>

      <details class="pac-tech" data-test="approval-technical">
        <summary>Technical details</summary>
        <dl>
          @for (t of technical(); track t.label) { <div><dt>{{ t.label }}</dt><dd>{{ t.value }}</dd></div> }
        </dl>
      </details>
    </div>
  `,
})
export class PipelineApprovalCard {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(StorageService);
  private readonly destroyRef = inject(DestroyRef);

  /** The approval task's subject, as Core raised it (jobQueueId, stepKey, stepIndex, rowCount, instructions, fields...). */
  readonly subject = input.required<Record<string, unknown>>();
  /** Open tasks say "Decide by"; decided ones say when it was due. */
  readonly open = input<boolean>(false);

  readonly loading = signal(true);
  readonly outputs = signal<RunOutput[]>([]);
  readonly rows = signal<Row[]>([]);
  readonly rowsBucket = signal<string | null>(null);
  readonly filter = signal<{ column: string; value: string } | null>(null);
  readonly photoUrls = signal<Record<string, string>>({});
  readonly photoErrors = signal<Record<string, boolean>>({});
  readonly opening = signal(false);
  private released = false;

  private text(key: string): string | null {
    const v = this.subject()[key];
    return v === null || v === undefined || v === '' ? null : String(v);
  }
  private num(key: string): number | null {
    const v = Number(this.subject()[key]);
    return Number.isFinite(v) ? v : null;
  }

  readonly jobQueueId = computed(() => this.num('jobQueueId'));
  readonly attempt = computed(() => this.num('attempt') ?? 1);
  readonly stepIndex = computed(() => this.num('stepIndex'));
  readonly rowCount = computed(() => this.num('rowCount'));
  readonly instructions = computed(() => this.text('instructions'));
  readonly requestedAt = computed(() => this.text('requestedAt'));
  readonly expiresAt = computed(() => this.text('expiresAt'));
  readonly link = computed(() => { const l = this.text('link'); return l && l.startsWith('/') ? l : null; });
  /** "Wound photo measurement (workflow)" reads as the pipeline's name; the job's name, else its id. */
  readonly pipelineName = computed(() => this.text('jobName') ?? this.text('pipelineId') ?? '—');
  readonly stepName = computed(() => {
    const key = this.text('stepKey');
    const index = this.stepIndex();
    return (key ? fieldLabel(key) : 'Approval') + (index != null ? ` (step ${index + 1})` : '');
  });
  /** The figures the step filled from the run (its "fields"): a summary, not a row. */
  readonly figures = computed(() => {
    const f = this.subject()['fields'];
    return f && typeof f === 'object' ? Object.entries(f as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && v !== '').map(([label, value]) => ({ label, value: String(value) })) : [];
  });
  readonly technical = computed(() => (['pipelineId', 'jobId', 'jobQueueId', 'attempt', 'stepKey', 'stepIndex', 'approvalId'] as const)
    .filter(k => this.text(k) != null).map(k => ({ label: fieldLabel(k), value: this.text(k)! })));

  readonly pdf = computed(() => this.outputs().find(o => (o.format ?? '').toLowerCase() === 'pdf' && o.runDatasetId && !o.expired) ?? null);
  readonly imageColumn = computed(() => imageColumnOf(this.rows()));
  readonly allColumns = computed(() => {
    const cols = shownColumns(this.rows(), this.imageColumn());
    return orderedColumns(cols, breakdowns(this.rows(), cols).map(b => b.column));
  });
  readonly allShown = signal(false);
  readonly columns = computed(() => this.allShown() ? this.allColumns() : this.allColumns().slice(0, FIRST_COLUMNS));
  readonly breakdown = computed(() => breakdowns(this.rows(), this.allColumns()));
  /** The rows outside the first kind's commonest value (the photos to re-measure, the claims on hold): shown first, marked. */
  readonly isException = computed(() => {
    const b = this.breakdown()[0];
    const common = b?.counts[0]?.value;
    return (r: Row) => !!b && String(r[b.column] ?? '').trim() !== common;
  });
  readonly exceptions = computed(() => this.rows().filter(this.isException()).length);
  readonly shownRows = computed(() => {
    const f = this.filter();
    const rows = f ? this.rows().filter(r => String(r[f.column] ?? '').trim() === f.value) : this.rows();
    const odd = this.isException();
    return [...rows.filter(odd), ...rows.filter(r => !odd(r))];
  });
  /** The photos of the rows shown, captioned by the row's first identifying columns. */
  readonly photoRows = computed(() => {
    const col = this.imageColumn();
    if (!col) return [];
    const captionCols = this.allColumns().slice(0, 2);
    const odd = this.isException();
    return this.shownRows().filter(r => typeof r[col] === 'string' && IMAGE.test(r[col] as string)).slice(0, MAX_PHOTOS)
      .map(r => ({ key: r[col] as string, odd: odd(r),
        // A bare number says nothing on its own ("6"): it is named by its column ("Visit no 6").
        caption: captionCols.map(c => { const v = String(r[c] ?? ''); return /^-?\d+(\.\d+)?$/.test(v) ? `${fieldLabel(c)} ${v}` : v; })
          .filter(Boolean).join(' · ') || (r[col] as string) }));
  });

  constructor() {
    this.destroyRef.onDestroy(() => { this.released = true; this.dropPhotos(); });
    effect(() => {
      const id = this.jobQueueId();
      const attempt = this.attempt();
      untracked(() => this.load(id, attempt));
    });
    effect(() => {
      const photos = this.photoRows();
      const bucket = this.rowsBucket();
      untracked(() => this.loadPhotos(bucket, photos.map(p => p.key)));
    });
  }

  label(c: string): string { return fieldLabel(c); }

  odd(r: Row): boolean { return this.isException()(r); }

  isOn(column: string, value: string): boolean {
    const f = this.filter();
    return !!f && f.column === column && f.value === value;
  }

  toggle(column: string, value: string): void {
    this.filter.set(this.isOn(column, value) ? null : { column, value });
  }

  when(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  private load(jobQueueId: number | null, attempt: number): void {
    this.loading.set(true);
    this.rows.set([]);
    this.filter.set(null);
    if (jobQueueId == null) { this.loading.set(false); return; }
    this.http.get<ApiResponse<{ outputs?: RunOutput[] }>>(`${API_BASE}/sourceJob.json/runOutputs`,
      { params: { jobQueueId: String(jobQueueId), attempt: String(attempt) } }).subscribe({
      next: r => {
        const outs = r.status === API_SUCCESS ? r.data?.outputs ?? [] : [];
        this.outputs.set(outs);
        const source = this.rowsSource(outs);
        if (!source) { this.loading.set(false); return; }
        if (source.runDatasetId) {
          this.http.get<Row[]>(`${API_BASE}/sourceJob.json/runDataset`, { params: { runDatasetId: String(source.runDatasetId), format: 'json' } })
            .pipe(catchError(() => of([] as Row[]))).subscribe(rows => this.done(Array.isArray(rows) ? rows : [], null));
        } else {
          this.storage.download(source.bucket!, source.key!).subscribe({
            next: blob => blob.text().then(t => this.done(parseCsv(t), source.bucket!)),
            error: () => this.done([], null),
          });
        }
      },
      error: () => { this.outputs.set([]); this.loading.set(false); },
    });
  }

  /** What the run kept before the approval step: a table (dataset or bucket CSV), the one with the step's row count first, then the latest. */
  private rowsSource(outs: RunOutput[]): RunOutput | null {
    const before = this.stepIndex();
    const tabular = outs.filter(o => !o.expired && (o.stepIndex == null || before == null || o.stepIndex < before)
      && ((o.runDatasetId && ['csv', 'json', 'jsonl'].includes((o.format ?? '').toLowerCase()))
        || (o.kind === 'bucket' && o.bucket && o.key && (o.format ?? '').toLowerCase() === 'csv')));
    const want = this.rowCount();
    const ranked = [...tabular].sort((a, b) => Number((b.rowCount ?? -1) === want) - Number((a.rowCount ?? -1) === want)
      || (b.stepIndex ?? 0) - (a.stepIndex ?? 0));
    return ranked[0] ?? null;
  }

  private done(rows: Row[], bucket: string | null): void {
    if (this.released) return;
    this.rows.set(rows.slice(0, MAX_ROWS));
    this.rowsBucket.set(bucket ?? this.outputs().find(o => o.kind === 'bucket' && o.bucket)?.bucket ?? null);
    this.loading.set(false);
  }

  private dropPhotos(): void {
    Object.values(this.photoUrls()).forEach(u => URL.revokeObjectURL(u));
    this.photoUrls.set({});
  }

  private loadPhotos(bucket: string | null, keys: string[]): void {
    if (!bucket || !keys.length) return;
    const have = this.photoUrls();
    const missing = keys.filter(k => !have[k] && !this.photoErrors()[k]);
    if (!missing.length) return;
    forkJoin(missing.map(k => this.storage.download(bucket, k).pipe(map(b => ({ k, b })), catchError(() => of({ k, b: null as Blob | null })))))
      .subscribe(results => {
        if (this.released) return;
        const urls = { ...this.photoUrls() };
        const errors = { ...this.photoErrors() };
        for (const { k, b } of results) { if (b) urls[k] = URL.createObjectURL(b); else errors[k] = true; }
        this.photoUrls.set(urls);
        this.photoErrors.set(errors);
      });
  }

  /** The run's PDF in a new tab, through the same authorised read as Runs › its outputs. */
  openPdf(p: RunOutput): void {
    if (!p.runDatasetId) return;
    this.opening.set(true);
    this.http.get(`${API_BASE}/sourceJob.json/runDataset`, { params: { runDatasetId: String(p.runDatasetId), format: 'pdf' }, responseType: 'blob' })
      .subscribe({
        next: blob => {
          this.opening.set(false);
          const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
          window.open(url, '_blank', 'noopener');
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        },
        error: () => this.opening.set(false),
      });
  }
}
