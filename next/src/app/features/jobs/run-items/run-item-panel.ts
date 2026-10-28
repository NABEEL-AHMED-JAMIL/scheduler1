import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { Icon } from '../../../shared/ui/icon';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ToastService } from '../../../shared/ui/toast.service';
import { copyText } from '../../../shared/ui/clipboard.util';
import { prettyJson } from '../run-steps/run-output-view';
import { RunItemsApi, refusalText } from './run-items.api';
import {
  ItemData, ItemDetail, ItemDetailStep, ItemFile, ItemVersion, RetryBody, dataTable, fileIcon, formatBadge, itemLook, itemPanelConfig, itemTime,
  retriedSentence, stepDescription, stepShortName,
} from './run-items.model';
import { ItemFilesData, RunItemFiles } from './run-item-files';
import { createTableSort } from '../../../shared/ui/sort';
import { SortHeader } from '../../../shared/ui/sort-header';
import { AppLoading, InlineStatus } from '../../../shared/ui/loading';
import { LoadError } from '../../../shared/ui/load-error';
import { BlurLoader } from '../../../shared/ui/blur-loader';

/** A row of a step's data as the table draws it: its place in the data and its cells. */
interface DataRow { n: number; cells: string[]; }

/** The panel's question: which run and item, the step whose data to show first, and whether the reader may retry. */
export interface ItemPanelData {
  jobQueueId: number;
  ref: string;
  stepKey?: string | null;
  canRetry: boolean;
  /** The list's filter and search: previous and next walk the items it shows. */
  status?: string | null;
  search?: string | null;
  /** What a sub-item is called ("page"), from the list's summary. */
  childNoun?: string | null;
  /** Called after a retry here, so the list behind the panel reads its items again. */
  onRetried?: () => void;
  /** MIG-421: the run's schedule, when the reader may open it: "All runs of this item" goes to its Items tab. */
  jobId?: string | number | null;
}

/** MIG-421: an OCR'd page's reading -- the text, how sure, where it came from -- from the OCR step's row. */
export interface PageReading {
  text: string; sureness: number | null; source: string | null; status: string | null; note: string | null;
  /** ZT-I25: how far the page was turned, clockwise in degrees, to be read upright (0 when it was read as it came). */
  rotation: number;
}

export function pageReading(data: ItemData | null | undefined): PageReading | null {
  const row = data?.rows?.[0];
  if (!row) return null;
  const sure = row['ocr_sureness'];
  return {
    text: String(row['ocr_text'] ?? ''),
    sureness: typeof sure === 'number' ? sure : sure === null || sure === undefined || sure === '' ? null : Number(sure),
    source: row['ocr_source'] === undefined || row['ocr_source'] === null ? null : String(row['ocr_source']),
    status: row['ocr_status'] === undefined || row['ocr_status'] === null ? null : String(row['ocr_status']),
    note: row['ocr_note'] === undefined || row['ocr_note'] === null ? null : String(row['ocr_note']),
    rotation: [90, 180, 270].includes(Number(row['ocr_rotation'])) ? Number(row['ocr_rotation']) : 0,
  };
}

/** The step a panel shows the data of first: the one asked for, else the step the item failed at, else the last with data. */
export function firstDataStep(detail: ItemDetail, asked: string | null | undefined): string | null {
  const withData = detail.steps.filter(s => s.hasData);
  if (asked && withData.some(s => s.key === asked)) return asked;
  const failed = detail.item.failedStep?.key;
  if (failed && withData.some(s => s.key === failed)) return failed;
  return withData.at(-1)?.key ?? null;
}

/** The steps that did not run for the item, for the "not made" chip (a failed step left them out). */
export function notMade(detail: ItemDetail): string[] {
  return detail.item.status === 'failed' ? detail.steps.filter(s => s.status === 'not_run').map(s => stepShortName(s)) : [];
}

/**
 * MIG-420: one item of a run, sliding over the right of its Items tab -- "Item 2 of 50" with the previous and the next,
 * its status and where it came from, Retry, its steps (how each went, a note, the time it took), why it failed, the
 * data it had at each step (as JSON, pretty, or as a table; masked columns marked), its files, and its earlier versions
 * when it was retried.
 */
@Component({
  selector: 'app-run-item-panel',
  imports: [Icon, Segmented, ServerTimePipe, SortHeader, AppLoading, InlineStatus, LoadError, BlurLoader],
  styles: `
    .ip-section { display: flex; flex-direction: column; gap: 0.5rem; }
    .ip-heading { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-secondary); }
    .ip-steps { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border-subtle); border-radius: var(--radius-card); overflow: clip; }
    .ip-steps > li { display: grid; grid-template-columns: 1.5rem minmax(8rem, 12rem) minmax(0, 1fr) 6rem 3.5rem; gap: 0.75rem; align-items: center;
                     padding: 0.55rem 0.875rem; font-size: 0.8125rem; }
    .ip-steps > li + li { border-top: 1px solid var(--border-subtle); }
    .ip-steps > li.is-failed { background: color-mix(in oklab, var(--crit-soft) 35%, var(--surface-raised)); }
    .ip-note { color: var(--text-secondary); }
    .ip-desc { display: block; font-size: 0.75rem; line-height: 1.35; color: var(--text-muted); overflow-wrap: anywhere; }
    .ip-note.is-failed { color: var(--crit-text); }
    .ip-dot { width: 1.375rem; height: 1.375rem; border-radius: var(--radius-full); display: inline-flex; align-items: center; justify-content: center; }
    .ip-dot.is-ok { background: var(--ok-soft); color: var(--ok-text); }
    .ip-dot.is-crit { background: var(--crit-soft); color: var(--crit-text); }
    .ip-dot.is-neutral { background: var(--surface-sunken); color: var(--text-muted); }
    .ip-dot.is-brand { background: var(--info-soft); color: var(--text-primary); }
    .ip-why { border: 1px solid var(--crit-soft); background: color-mix(in oklab, var(--crit-soft) 35%, var(--surface-raised)); border-radius: var(--radius-card);
              padding: 0.75rem 0.875rem; font-size: 0.875rem; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
    .ip-json { margin: 0; max-height: 26rem; overflow: auto; border-radius: var(--radius-card); padding: 0.875rem 1rem; font-size: 0.75rem; line-height: 1.6;
               white-space: pre-wrap; overflow-wrap: anywhere; }
    .ip-chip { display: inline-flex; align-items: center; gap: 0.5rem; min-height: 2.25rem; padding: 0 0.75rem; border: 1px solid var(--border-control);
               border-radius: var(--radius-md); font-size: 0.8125rem; max-width: 100%; }
    .ip-chip > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ip-chip.is-dashed { border-style: dashed; color: var(--text-secondary); }
    .ip-page { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border: 1px solid var(--border-subtle); border-radius: var(--radius-card); overflow: clip; }
    .ip-page > div { padding: 0.875rem; display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
    .ip-page > div + div { border-left: 1px solid var(--border-subtle); }
    .ip-page img { width: 100%; height: auto; max-height: 30rem; object-fit: contain; border-radius: var(--radius-md); background: var(--surface-sunken); }
    .ip-page pre { margin: 0; max-height: 30rem; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 0.75rem; line-height: 1.7;
                   padding: 0.75rem; border-radius: var(--radius-md); background: var(--surface-sunken); }
    @media (max-width: 1100px) { .ip-page { grid-template-columns: minmax(0, 1fr); } .ip-page > div + div { border-left: 0; border-top: 1px solid var(--border-subtle); } }
    button.ip-chip:hover { background: var(--surface-sunken); }
    @media (max-width: 1279px) { .ip-steps > li { grid-template-columns: 1.5rem minmax(7rem, 10rem) minmax(0, 1fr) 5rem 3rem; } }
  `,
  template: `
    <aside class="side-panel" role="dialog" [attr.aria-label]="'Item ' + (detail()?.item?.label ?? data.ref)" data-test="item-panel">
      <header class="side-panel-head">
        <div class="min-w-0 flex-1 flex flex-col gap-2.5">
          <div class="flex items-center gap-2">
            <span class="text-xs text-[color:var(--text-secondary)] tabular" data-test="item-position">
              @if (detail(); as d) { Item {{ d.item.index }} of {{ d.item.of }} }
            </span>
            <span class="flex-1"></span>
            <button type="button" class="btn btn-default btn-icon btn-sm" aria-label="Previous item" data-test="item-prev"
                    [disabled]="!detail()?.item?.prevRef" (click)="go(detail()!.item.prevRef!)"><app-icon name="chevronLeft" /></button>
            <button type="button" class="btn btn-default btn-icon btn-sm" aria-label="Next item" data-test="item-next"
                    [disabled]="!detail()?.item?.nextRef" (click)="go(detail()!.item.nextRef!)"><app-icon name="chevronRight" /></button>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Close" (click)="ref.close()"><app-icon name="close" /></button>
          </div>
          @if (detail(); as d) {
            <div class="flex flex-wrap items-center gap-3 min-w-0">
              <h2 class="mono text-lg font-medium truncate min-w-0" [title]="d.item.label" data-test="item-name">{{ d.item.label }}</h2>
              <span class="pill pill-{{ look().tone }}" data-test="item-status">{{ look().label }}</span>
            </div>
            <p class="text-sm text-[color:var(--text-secondary)] break-words" data-test="item-meta">{{ meta() }}</p>
            @if ((data.canRetry && !earlier() && d.item.status !== 'running') || data.jobId) {
              <div class="flex flex-wrap items-center gap-2">
                @if (data.canRetry && !earlier() && d.item.status !== 'running') {
                <button type="button" class="btn btn-sm" [class.btn-primary]="d.item.status === 'failed'" [class.btn-default]="d.item.status !== 'failed'"
                        data-test="item-retry" [disabled]="retrying()" (click)="retry('item')">
                  <app-icon name="play" />Retry this item</button>
                }
                @if (data.canRetry && !earlier() && d.item.status !== 'running' && d.retry.possible && d.retry.fromStep) {
                  <button type="button" class="btn btn-default btn-sm" data-test="item-retry-from" [disabled]="retrying()" (click)="retry('failed_step')">
                    Retry from {{ fromStepName(d) }}</button>
                } @else if (data.canRetry && d.retry.why && d.item.status === 'failed') {
                  <span class="text-xs text-[color:var(--text-muted)]" data-test="item-retry-why">{{ d.retry.why }}</span>
                }
                @if (data.jobId && !d.item.parentRef) {
                  <button type="button" class="btn btn-default btn-sm" data-test="item-all-runs" (click)="allRuns()">
                    <app-icon name="history" />All runs of this item</button>
                }
              </div>
            }
          }
        </div>
      </header>

      <div class="side-panel-body flex flex-col gap-5">
        <!-- Owner 2026-10-27: a failed read says why with Try again; another attempt is read with the item kept, dimmed. -->
        @if (error() && !detail()) {
          <app-load-error [message]="error()" (retry)="load(dataStep())" />
        } @else if (!detail()) {
          <app-loading shape="panel" [count]="5" label="Reading the item…" />
        } @else {
          @if (error()) { <app-inline-status [error]="error()" (retry)="load(dataStep())" /> }
          <app-blur-loader [active]="loading()" label="Reading the item…">
          <div class="flex flex-col gap-5">
          @let d = detail()!;
          @if (earlier()) {
            <p class="flex flex-wrap items-center gap-2 text-sm rounded-md px-3 py-2 bg-[color:var(--surface-sunken)]" data-test="item-earlier">
              <app-icon name="history" />An earlier version of this item: attempt {{ attempt() }}.
              <button type="button" class="link-inline" (click)="choose(null)">Back to the current one</button>
            </p>
          }

          @if (ocrStep(); as o) {
            <section class="ip-section" aria-labelledby="ip-page-heading" data-test="item-page-view">
              <div class="flex flex-wrap items-center gap-2">
                <h3 id="ip-page-heading" class="ip-heading mr-auto">Page image beside the text read</h3>
                @if (reading(); as r) {
                  @if (r.status === 'check') {
                    <span class="pill pill-warn" data-test="page-check">Check by hand · {{ sureText(r) }} sure</span>
                  } @else if (r.source === 'text-layer') {
                    <span class="pill pill-neutral">Its own text layer</span>
                  } @else if (r.sureness !== null) {
                    <span class="pill pill-ok">{{ sureText(r) }} sure</span>
                  }
                  @if (r.rotation) {
                    <span class="pill pill-neutral" data-test="page-rotation"
                      [title]="'The page was scanned turned; it was turned ' + r.rotation + '° clockwise before its text was read.'">
                      <app-icon name="redo" size="0.9em" />Turned {{ r.rotation }}° to read</span>
                  }
                }
              </div>
              <div class="ip-page">
                <div>
                  <span class="ip-heading">Page image</span>
                  @if (pageImage()) { <img [src]="pageImage()" [alt]="'The image of ' + d.item.label" data-test="page-image" /> }
                  @else if (pageImageNote()) { <p class="text-sm text-[color:var(--text-muted)]">{{ pageImageNote() }}</p> }
                  @else { <p class="text-sm text-[color:var(--text-muted)]" aria-busy="true">Reading the image…</p> }
                </div>
                <div>
                  <span class="ip-heading">Text read</span>
                  @if (reading(); as r) {
                    <pre class="mono" data-test="page-text">{{ r.text || '(no text was read)' }}</pre>
                    @if (r.note) { <p class="text-xs text-[color:var(--text-secondary)]">{{ r.note }}</p> }
                  } @else { <p class="text-sm text-[color:var(--text-muted)]" aria-busy="true">Reading the text…</p> }
                </div>
              </div>
            </section>
          }

          <section class="ip-section" aria-labelledby="ip-steps-heading">
            <h3 id="ip-steps-heading" class="ip-heading">Steps for this item</h3>
            <ol class="ip-steps" data-test="item-steps">
              @for (s of d.steps; track s.key) {
                <li [class.is-failed]="s.status === 'failed'" [attr.data-step]="s.key">
                  <span class="ip-dot" [class]="'ip-dot is-' + dotTone(s)" aria-hidden="true"><app-icon [name]="dotIcon(s)" size="0.8em" /></span>
                  <span class="min-w-0">
                    <span class="font-medium block" data-test="step-name">{{ short(s) }}<span class="sr-only">: {{ stateWord(s) }}</span></span>
                    @if (desc(s); as more) { <span class="ip-desc" data-test="step-desc">{{ more }}</span> }
                  </span>
                  <span class="ip-note truncate" [class.is-failed]="s.status === 'failed'" [title]="noteOf(s)">{{ noteOf(s) }}</span>
                  <span class="text-right tabular text-[color:var(--text-secondary)]">{{ s.durationMs === null || s.durationMs === undefined ? '' : time(s.durationMs) }}</span>
                  <span class="text-right">
                    @if (s.hasData) {
                      <button type="button" class="link-inline text-xs font-medium" [attr.aria-pressed]="dataStep() === s.key"
                              [attr.aria-label]="'View the data at ' + short(s)" (click)="showData(s.key)">View</button>
                    } @else { <span class="text-[color:var(--text-muted)]">—</span> }
                  </span>
                </li>
              }
            </ol>
          </section>

          @if (d.item.status === 'failed' && d.item.reason) {
            <section class="ip-section" aria-labelledby="ip-why-heading">
              <h3 id="ip-why-heading" class="ip-heading">Why it failed</h3>
              <div class="ip-why" data-test="item-why">{{ d.item.reason }}</div>
            </section>
          }

          @if (dataSteps().length) {
            <section class="ip-section" aria-labelledby="ip-data-heading">
              <div class="flex flex-wrap items-center gap-2">
                <h3 id="ip-data-heading" class="ip-heading mr-auto">Data at each step</h3>
                <div class="seg-wrap"><app-segmented [options]="dataSteps()" [value]="dataStep() ?? ''" (valueChange)="showData($event)" ariaLabel="Step data" /></div>
                <app-segmented [options]="modes" [(value)]="mode" ariaLabel="Show it as" />
                <button type="button" class="btn btn-default btn-xs" (click)="copy()" [disabled]="!stepData()" data-test="data-copy"><app-icon name="copy" />Copy</button>
              </div>
              @if (stepData(); as sd) {
                @if (sd.masked?.length) {
                  <p class="flex items-center gap-1.5 text-xs text-[color:var(--text-secondary)]" data-test="data-masked">
                    <app-icon name="lock" size="0.9em" />Masked for you: <span class="mono">{{ sd.masked!.join(', ') }}</span></p>
                }
                @if (sd.maskNote) { <p class="text-xs text-[color:var(--text-secondary)]">{{ sd.maskNote }}</p> }
                @if (sd.shared) { <p class="text-xs text-[color:var(--text-secondary)]">Made once for the run{{ sd.sharedBy ? ' and shared by ' + sd.sharedBy + ' items' : '' }}.</p> }
                @if (sd.note) { <p class="text-xs text-[color:var(--text-secondary)]">{{ sd.note }}</p> }
                @if (sd.expired) {
                  <p class="text-sm text-[color:var(--text-muted)]" data-test="data-expired">This step's data has expired: it is no longer kept.</p>
                } @else if (!sd.rows.length) {
                  <p class="text-sm text-[color:var(--text-muted)]">This step kept no rows for the item.</p>
                } @else if (mode() === 'json') {
                  <pre class="ip-json mono bg-code border border-subtle" data-test="data-json">{{ json() }}</pre>
                } @else {
                  <div class="overflow-auto max-h-[26rem] rounded-md border border-subtle" data-test="data-table">
                    <table class="table-modern">
                      <thead><tr>
                        @for (c of table().columns; track c) {
                          <th [attr.data-col]="c" [appSort]="c" [sortBy]="dataSort">
                            <span class="inline-flex items-center gap-1">{{ c }}@if (masked(c)) { <app-icon name="lock" size="0.85em" label="Masked" title="Masked for you" /> }</span>
                          </th>
                        }
                      </tr></thead>
                      <tbody>
                        @for (r of sortedData(); track r.n) {
                          <tr>@for (v of r.cells; track $index) { <td class="max-w-80 truncate" [title]="v">{{ v }}</td> }</tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }
                @if (sd.truncated) { <p class="text-xs text-[color:var(--text-muted)]">The first {{ sd.rows.length }} of {{ sd.rowCount ?? 'more' }} rows.</p> }
              } @else if (dataError()) {
                <app-inline-status [error]="dataError()" (retry)="showData(dataStep() ?? '', true)" />
              } @else {
                <app-loading shape="rows" [count]="3" label="Reading the step's data…" />
              }
            </section>
          }

          <section class="ip-section" aria-labelledby="ip-files-heading">
            <h3 id="ip-files-heading" class="ip-heading">Files for this item</h3>
            <div class="flex flex-wrap gap-2" data-test="item-files">
              @for (f of d.files; track f.fileRef) {
                <button type="button" class="ip-chip" [disabled]="!!f.expired" [attr.data-file]="f.fileRef"
                        [attr.aria-label]="'Open ' + f.name + (f.role === 'input' ? ', the input' : '')" (click)="openFile(f)">
                  <app-icon [name]="icon(f)" size="0.95em" class="icon-muted shrink-0" /><span class="pill pill-neutral mono">{{ badge(f) }}</span><span>{{ f.name }}{{ f.role === 'input' ? ' · input' : '' }}{{ f.report ? ' · ' + f.report.number + ' v' + f.report.version : '' }}{{ f.expired ? ' · expired' : '' }}</span>
                </button>
              }
              @if (d.fileCount > d.files.length) {
                <button type="button" class="ip-chip" data-test="item-all-files" (click)="openAll()"><span>All {{ d.fileCount }} files ›</span></button>
              }
              @if (notMade().length) {
                <span class="ip-chip is-dashed" data-test="item-not-made"><span>{{ notMade().join(', ') }}: not made (an earlier step failed)</span></span>
              }
              @if (!d.files.length && !notMade().length) { <span class="text-sm text-[color:var(--text-muted)]">No files were kept for this item.</span> }
            </div>
          </section>

          @if (d.versions.length > 1) {
            <section class="ip-section" aria-labelledby="ip-versions-heading">
              <h3 id="ip-versions-heading" class="ip-heading">Earlier versions</h3>
              <div class="flex flex-wrap gap-2" data-test="item-versions">
                @for (v of d.versions; track v.attempt) {
                  <button type="button" class="ip-chip" [attr.aria-pressed]="isShown(v)" [attr.data-attempt]="v.attempt" (click)="choose(v.current ? null : v.attempt)">
                    <span>Attempt {{ v.attempt }} · {{ versionWord(v) }}@if (v.endedAt) { · {{ v.endedAt | serverTime:'recent' }} }{{ v.current ? ' · current' : ' · earlier' }}</span>
                  </button>
                }
              </div>
            </section>
          }
          </div>
          </app-blur-loader>
        }
      </div>
    </aside>
  `,
})
export class RunItemPanel implements OnInit {
  readonly data = inject<ItemPanelData>(DIALOG_DATA);
  readonly ref = inject(DialogRef);
  private readonly api = inject(RunItemsApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router, { optional: true });

  readonly itemRef = signal(this.data.ref);
  /** MIG-421: an OCR'd page: its image (an object URL) and the text read. */
  readonly ocrStep = computed(() => (this.detail()?.steps ?? []).find(s => s.task === 'ocr_pages' && s.hasData) ?? null);
  readonly reading = signal<PageReading | null>(null);
  readonly pageImage = signal<string | null>(null);
  readonly pageImageNote = signal('');
  /** The attempt shown; null for the current one. */
  readonly attempt = signal<number | null>(null);
  readonly detail = signal<ItemDetail | null>(null);
  readonly error = signal('');
  /** The item is being read (a first read, another attempt, or after a retry). */
  readonly loading = signal(false);
  readonly retrying = signal(false);
  readonly dataStep = signal<string | null>(null);
  readonly stepData = signal<ItemData | null>(null);
  readonly dataError = signal('');
  readonly modes: SegmentOption<'json' | 'table'>[] = [{ id: 'json', label: 'JSON' }, { id: 'table', label: 'Table' }];
  readonly mode = signal<'json' | 'table'>('json');

  readonly earlier = computed(() => this.attempt() !== null);
  readonly look = computed(() => { const d = this.detail(); return d ? itemLook(d.item, this.data.childNoun ?? 'page') : { label: '', tone: 'neutral' as const }; });
  readonly meta = computed(() => {
    const item = this.detail()?.item;
    if (!item) return '';
    // ZT-I17: an item's key already holds its folder; the folder only goes before a bare label.
    const where = item.key && item.key !== item.label ? item.key : `${item.folder ?? ''}${item.label}`;
    const parts = [where];
    if (item.durationMs !== null && item.durationMs !== undefined) parts.push(itemTime(item.durationMs));
    if (item.fileCount) parts.push(`${item.fileCount} ${item.fileCount === 1 ? 'file' : 'files'}`);
    if (item.attempt && item.attempt > 1) parts.push(`attempt ${item.attempt}`);
    return parts.join(' · ');
  });
  readonly dataSteps = computed<SegmentOption<string>[]>(() =>
    (this.detail()?.steps ?? []).filter(s => s.hasData).map(s => ({ id: s.key, label: stepShortName(s) })));
  readonly notMade = computed(() => { const d = this.detail(); return d ? notMade(d) : []; });
  readonly json = computed(() => prettyJson(this.stepData()?.rows ?? []));
  readonly table = computed(() => dataTable(this.stepData() ?? { columns: [], rows: [] }));
  /**
   * Owner 2026-10-27: the step's data table sorts by any of its columns (numbers, dates or text, by what each holds);
   * the data's own order until one is picked, and Copy keeps that order.
   */
  readonly dataSort = createTableSort<DataRow>({
    id: 'run-item-data',
    columns: {},
    dynamic: key => {
      const at = this.table().columns.indexOf(key);
      return at < 0 ? null : { value: r => r.cells[at], kind: 'auto' };
    },
    // Each step's data has its own columns: a choice made on one is not carried to the next panel.
    remember: false,
  });
  readonly sortedData = computed(() => this.dataSort.apply(this.table().rows.map((cells, n) => ({ n, cells }))));

  readonly badge = formatBadge;
  readonly icon = fileIcon;
  /** ZT-I35: a step by its short name; the whole name, when it says more, as a muted line under it. */
  readonly short = stepShortName;
  readonly desc = stepDescription;
  fromStepName(d: ItemDetail): string {
    return stepShortName({ key: d.steps.find(s => s.index === d.retry.fromStepIndex)?.key, name: d.retry.fromStep });
  }
  time(ms: number): string { return itemTime(ms); }
  masked(column: string): boolean { return (this.stepData()?.masked ?? []).includes(column); }
  isShown(v: ItemVersion): boolean { return v.current ? this.attempt() === null : this.attempt() === v.attempt; }
  versionWord(v: ItemVersion): string { return v.status === 'failed' ? 'Failed' : v.status === 'running' ? 'Running' : 'Done'; }

  dotTone(s: ItemDetailStep): string {
    return s.status === 'done' || s.status === 'shared' ? 'ok' : s.status === 'failed' ? 'crit' : s.status === 'running' ? 'brand' : 'neutral';
  }
  dotIcon(s: ItemDetailStep): string {
    return s.status === 'done' || s.status === 'shared' ? 'check' : s.status === 'failed' ? 'alert' : s.status === 'running' ? 'zap' : 'minus';
  }
  stateWord(s: ItemDetailStep): string {
    return { done: 'done', shared: 'shared', failed: 'failed', running: 'running', not_run: 'not run', left_out: 'left out' }[s.status] ?? s.status;
  }
  noteOf(s: ItemDetailStep): string {
    if (s.note) return s.note;
    if (s.status === 'not_run') return 'Not run: an earlier step failed';
    if (s.status === 'left_out') return 'Left out for this item';
    if (s.status === 'shared') return s.sharedBy ? `Made once, shared by ${s.sharedBy} items` : 'Made once for the run';
    const parts: string[] = [];
    if (s.rows !== null && s.rows !== undefined) parts.push(`${s.rows.toLocaleString('en-GB')} ${s.rows === 1 ? 'row' : 'rows'}`);
    if (s.files) parts.push(`${s.files} ${s.files === 1 ? 'file' : 'files'}`);
    if (s.reusedFromAttempt) parts.push(`reused from attempt ${s.reusedFromAttempt}`);
    return parts.join(' · ');
  }

  private request?: Subscription;
  private dataRequest?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.request?.unsubscribe(); this.dataRequest?.unsubscribe(); this.dropImage(); });
  }

  sureText(r: PageReading): string { return r.sureness === null ? '' : `${Math.round(r.sureness)} %`; }

  /** "All runs of this item": the schedule's Items tab, showing every run that processed it. */
  allRuns(): void {
    const d = this.detail();
    if (!d || !this.data.jobId || !this.router) return;
    this.ref.close();
    this.router.navigate(['/pipelines/schedules', this.data.jobId, 'items'], { queryParams: { key: d.item.key } });
  }

  private dropImage(): void {
    const url = this.pageImage();
    if (url) URL.revokeObjectURL(url);
    this.pageImage.set(null);
  }

  /** MIG-421: an OCR'd page's image and the text read, side by side. */
  private readPage(detail: ItemDetail): void {
    this.reading.set(null);
    this.dropImage();
    this.pageImageNote.set('');
    const step = detail.steps.find(s => s.task === 'ocr_pages' && s.hasData);
    if (!step) return;
    this.api.data(this.data.jobQueueId, detail.item.ref, step.key, this.attempt()).subscribe({
      next: d => this.reading.set(pageReading(d) ?? { text: '', sureness: null, source: null, status: null, rotation: 0, note: d.note ?? null }),
      error: () => this.reading.set({ text: '', sureness: null, source: null, status: null, rotation: 0, note: 'The text read could not be shown.' }),
    });
    const image = detail.files.find(f => /\.(png|jpe?g|tiff?|bmp|webp)$/i.test(f.name) && !f.expired);
    if (!image) { this.pageImageNote.set('This page kept no image.'); return; }
    this.api.file(this.data.jobQueueId, detail.item.ref, image.fileRef, true).subscribe({
      next: blob => this.pageImage.set(URL.createObjectURL(blob)),
      error: () => this.pageImageNote.set('The page image could not be shown.'),
    });
  }

  ngOnInit(): void { this.load(this.data.stepKey ?? null); }

  /** Reads the item (the attempt shown), then the data of the step to show first. */
  load(stepKey: string | null): void {
    this.request?.unsubscribe();
    this.error.set('');
    this.loading.set(true);
    this.request = this.api.detail(this.data.jobQueueId, this.itemRef(), this.attempt(), this.data.status, this.data.search).subscribe({
      next: detail => {
        this.loading.set(false);
        this.detail.set(detail);
        this.readPage(detail);
        const first = firstDataStep(detail, stepKey);
        if (first) this.showData(first, true); else { this.dataStep.set(null); this.stepData.set(null); }
      },
      error: err => { this.loading.set(false); this.error.set(refusalText(err, 'The item could not be read.')); },
    });
  }

  /** The previous or the next item; the data shown stays at the same step when the item has it. */
  go(ref: string): void {
    if (!ref) return;
    this.itemRef.set(ref);
    this.attempt.set(null);
    this.detail.set(null);
    this.load(this.dataStep());
  }

  /** An earlier version (an attempt), or null for the current one. */
  choose(attempt: number | null): void {
    if (this.attempt() === attempt) return;
    this.attempt.set(attempt);
    this.load(this.dataStep());
  }

  showData(stepKey: string, force = false): void {
    if (!stepKey || (!force && stepKey === this.dataStep() && this.stepData())) return;
    this.dataStep.set(stepKey);
    this.stepData.set(null);
    this.dataError.set('');
    this.dataRequest?.unsubscribe();
    this.dataRequest = this.api.data(this.data.jobQueueId, this.itemRef(), stepKey, this.attempt()).subscribe({
      next: d => this.stepData.set(d),
      error: err => this.dataError.set(refusalText(err, 'This step\'s data could not be read.')),
    });
  }

  async copy(): Promise<void> {
    const sd = this.stepData();
    if (!sd) return;
    const text = this.mode() === 'json' ? this.json()
      : [this.table().columns, ...this.table().rows].map(r => r.join('\t')).join('\n');
    if (await copyText(text)) this.toast.success('Copied'); else this.toast.error('Could not copy; select the text instead.');
  }

  retry(from: RetryBody['from']): void {
    const d = this.detail();
    if (!d || this.retrying()) return;
    this.retrying.set(true);
    this.api.retry({ jobQueueId: this.data.jobQueueId, refs: [d.item.ref], from }).subscribe({
      next: answer => {
        this.retrying.set(false);
        this.toast.success(retriedSentence(answer.data, answer.message));
        this.data.onRetried?.();
        this.load(this.dataStep());
      },
      error: err => {
        this.retrying.set(false);
        this.toast.error(refusalText(err, 'The item could not be retried.'));
      },
    });
  }

  private filesData(preview: ItemFile | null): ItemFilesData {
    const d = this.detail()!;
    return { jobQueueId: this.data.jobQueueId, ref: d.item.ref, label: d.item.label, attempt: this.attempt(), preview };
  }

  openFile(f: ItemFile): void {
    if (f.expired || !this.detail()) return;
    this.dialog.open(RunItemFiles, itemPanelConfig({ ...this.filesData(f), stepKey: f.stepKey ?? null, stepName: f.stepName ?? null }));
  }

  openAll(): void {
    if (!this.detail()) return;
    this.dialog.open(RunItemFiles, itemPanelConfig(this.filesData(null)));
  }
}
