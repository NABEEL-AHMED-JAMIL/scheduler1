import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { Icon } from '../../../shared/ui/icon';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { ToastService } from '../../../shared/ui/toast.service';
import { LoadError } from '../../../shared/ui/load-error';
import { EmptyState } from '../../../shared/ui/empty-state';
import { BlurLoader } from '../../../shared/ui/blur-loader';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { refusalOf } from '../../../shared/ui/blob-refusal';
import { formatSize } from '../../../shared/ui/format-size';
import { AuthService } from '../../../core/auth/auth.service';
import { StorageService } from '../../objects/storage.service';
import { PdfViewer } from '../../objects/preview/pdf-viewer';
import { ReportStudioApi } from '../../report-studio/report-studio.api';
import { attachmentName } from '../run-steps/run-steps.model';
import { plural } from '../run-steps/run-page.model';
import { RunItemsApi, refusalText } from './run-items.api';
import {
  ItemFile, ItemFilesPage, ReportVersionFacts, fileIcon, formatBadge, previewKind, rangeLabel, reportLine, reportState, stepDescription,
  stepShortName, zipLabel,
} from './run-items.model';
import { PDF_FIRST_PAGE } from './pdf-first-page';

/** What the file list is for: one item's files, of one step or of all of them. */
export interface ItemFilesData {
  jobQueueId: number;
  ref: string;
  label: string;
  stepKey?: string | null;
  /** The step's name as Core says it (its whole name; the panel shows its short name). */
  stepName?: string | null;
  attempt?: number | null;
  /** Opens with this file shown (a chip in the item's panel). */
  preview?: ItemFile | null;
}

/** How many files a page of the list holds. */
export const FILES_PAGE = 15;
/** Text shown in a preview, at most; the rest is in the download. */
const TEXT_CHARS = 200_000;
/** ZT-I35: the loading skeleton shows only when an answer takes longer than this (a quick one never flickers). */
export const SKELETON_AFTER_MS = 150;
/** The largest PDF whose first page the browser draws itself (a bigger one keeps its type's icon). */
const DRAW_PDF_BYTES = 25 * 1024 * 1024;

/**
 * MIG-420: the files a step made for one item -- "1151 · Patient intake summary" -- with a picture of each (an image
 * itself, a PDF's first page: Report Studio's thumbnail for a report, else drawn here with pdf.js; else the type's icon),
 * its type, size and pages, and for a report its number, version and approval (Signed ✓ by whom and when, or Waiting for
 * approval) with Verify. ZT-I35: one file is one larger card with its facts beside it; Grid and List, the search and
 * Download all (zip) come from two files up. Every file is read through HttpClient as a blob, so the sign-in's token goes
 * with it; the pictures and the preview are object URLs, released when the page of files changes or the panel closes. A
 * sensitive pipeline's files, to a person without Download sensitive files, are listed and nothing of them is read.
 */
@Component({
  selector: 'app-run-item-files',
  imports: [NgTemplateOutlet, Icon, Segmented, PdfViewer, LoadError, EmptyState, BlurLoader, ServerTimePipe],
  styles: `
    .rf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: 0.875rem; }
    .rf-thumb { display: flex; flex-direction: column; gap: 0.375rem; min-width: 0; text-align: left; }
    .rf-thumb-box { aspect-ratio: 3 / 4; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--surface-sunken);
                    display: flex; align-items: center; justify-content: center; overflow: hidden; width: 100%; }
    .rf-thumb:hover .rf-thumb-box, .rf-thumb:focus-visible .rf-thumb-box { border-color: var(--border-control); }
    .rf-thumb:disabled { cursor: default; }
    .rf-thumb-box img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
    .rf-thumb-name { font-size: 0.75rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rf-thumb-meta { font-size: 0.6875rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rf-type { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 0.75rem; color: var(--text-muted); text-align: center; min-width: 0; }
    .rf-type-name { font-size: 0.75rem; color: var(--text-secondary); overflow-wrap: anywhere; line-height: 1.35; }
    .rf-pulse { width: 100%; height: 100%; background: var(--surface-inset); animation: pulse-soft 1.4s ease-in-out infinite; }
    @media (prefers-reduced-motion: reduce) { .rf-pulse { animation: none; } }
    .rf-one { display: grid; grid-template-columns: minmax(12rem, 17rem) minmax(0, 1fr); gap: 1.5rem; align-items: start; }
    .rf-one .rf-thumb-box { box-shadow: 0 1px 4px color-mix(in oklab, var(--text-primary) 10%, transparent); }
    .rf-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 0.375rem 1rem; margin: 0; font-size: 0.8125rem; }
    .rf-facts dt { color: var(--text-secondary); }
    .rf-facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .rf-list { list-style: none; margin: 0; padding: 0; }
    .rf-list > li { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0; border-bottom: 1px solid var(--border-subtle); }
    .rf-list > li:last-child { border-bottom: 0; }
    .rf-list-thumb { width: 2.5rem; flex: none; }
    .rf-preview { flex: 1; min-height: 24rem; display: flex; flex-direction: column; }
    .rf-preview img { max-width: 100%; max-height: 70vh; object-fit: contain; margin: 0 auto; }
    .rf-sk { border-radius: var(--radius-md); background: var(--surface-inset); animation: pulse-soft 1.4s ease-in-out infinite; }
    .rf-sk-page { aspect-ratio: 3 / 4; }
    @media (prefers-reduced-motion: reduce) { .rf-sk { animation: none; } }
    @media (max-width: 700px) { .rf-one { grid-template-columns: minmax(0, 1fr); } }
  `,
  template: `
    <aside class="side-panel" role="dialog" [attr.aria-label]="title()" data-test="item-files">
      <header class="side-panel-head">
        <div class="min-w-0 flex-1 flex flex-col gap-2.5">
          <div class="flex items-start gap-2">
            <div class="min-w-0 flex-1">
              <h2 class="text-base font-semibold break-words" data-test="files-title">{{ title() }}</h2>
              @if (countLine()) { <p class="text-sm text-[color:var(--text-secondary)] tabular" data-test="files-count">{{ countLine() }}</p> }
              @if (description()) { <p class="text-xs text-[color:var(--text-muted)] mt-0.5 break-words" data-test="files-step-desc">{{ description() }}</p> }
            </div>
            @if (many() && (page()?.total ?? 0) > 1) {
              <button type="button" class="btn btn-default btn-sm shrink-0" data-test="files-zip" [disabled]="zipping() || page()?.downloadable === false"
                      (click)="downloadAll()">
                <app-icon name="download" />{{ zipLabel(page()?.bytes) }}
              </button>
            }
            <button type="button" class="btn btn-ghost btn-icon btn-sm shrink-0" aria-label="Close" (click)="ref.close()"><app-icon name="close" /></button>
          </div>
          @if (page()?.downloadable === false) {
            <!-- ZT-M21: a sensitive pipeline's files are listed; their bytes are the Download sensitive files permission's. -->
            <p class="text-sm text-[color:var(--text-secondary)] inline-flex items-start gap-1.5" data-test="files-sensitive">
              <app-icon name="lock" size="0.95em" class="mt-0.5 shrink-0" />{{ page()?.refusal }}
            </p>
          }
          @if (!shown() && many()) {
            <div class="flex flex-wrap items-center gap-2">
              <label class="relative flex items-center flex-1 min-w-48">
                <span class="sr-only">Search files</span>
                <app-icon name="search" size="0.95em" class="icon-muted absolute left-2.5 pointer-events-none" />
                <input class="input input-sm w-full pl-8" type="search" placeholder="Search file names" [value]="search()"
                       (input)="typed($any($event.target).value)" (keydown.enter)="searchNow()" data-test="files-search" />
              </label>
              <app-segmented [options]="views" [(value)]="view" ariaLabel="Show files as" />
            </div>
          }
        </div>
      </header>

      <div class="side-panel-body flex flex-col gap-3" [attr.aria-busy]="loading() ? 'true' : null">
        @if (shown(); as f) {
          <div class="flex flex-wrap items-center gap-2" data-test="file-preview">
            <button type="button" class="btn btn-default btn-sm" (click)="closePreview()"><app-icon name="arrowLeft" />{{ single() ? 'Back' : 'All files' }}</button>
            <span class="pill pill-neutral mono">{{ badge(f) }}</span>
            <span class="text-sm font-medium truncate min-w-0" [title]="f.name">{{ f.name }}</span>
            <span class="flex-1"></span>
            <button type="button" class="btn btn-default btn-sm" [disabled]="!!f.expired" (click)="download(f)" [attr.aria-label]="'Download ' + f.name">
              <app-icon name="download" />Download</button>
          </div>
          <div class="rf-preview">
            @if (previewError()) {
              <p class="text-sm text-crit-500" role="alert">{{ previewError() }}</p>
            } @else if (previewKind(f) === 'image' && previewUrl()) {
              <img [src]="previewUrl()" [alt]="f.name" />
            } @else if (previewKind(f) === 'pdf' && previewUrl()) {
              <app-pdf-viewer [src]="previewUrl()" />
            } @else if (previewKind(f) === 'text' && previewText() !== null) {
              <pre class="flex-1 min-h-0 overflow-auto mono text-xs leading-relaxed whitespace-pre-wrap break-words rounded p-3 bg-code border border-subtle">{{ previewText() }}</pre>
            } @else {
              <div class="flex justify-center py-16"><span class="spinner" role="status" aria-label="Reading the file"></span></div>
            }
          </div>
        } @else if (error()) {
          <app-load-error [message]="error()" (retry)="load()" data-test="files-error" />
        } @else if (!page()) {
          @if (slow()) {
            <div class="rf-one" role="status" aria-label="Reading the files" data-test="files-skeleton">
              <div class="rf-sk rf-sk-page"></div>
              <div class="flex flex-col gap-3 pt-1">
                <div class="rf-sk h-5 w-3/4"></div><div class="rf-sk h-4 w-1/2"></div><div class="rf-sk h-4 w-2/3"></div><div class="rf-sk h-8 w-48 mt-2"></div>
              </div>
            </div>
          }
        } @else if (!page()!.files.length) {
          <app-empty-state class="py-10" icon="file" [title]="searched() ? 'No file matches' : 'No files'"
                           [message]="searched() ? 'No file of this item has that in its name.' : 'This step kept no files for the item.'" data-test="files-empty">
            @if (searched()) { <button type="button" class="btn btn-default btn-sm" (click)="typed(''); searchNow()">Show every file</button> }
          </app-empty-state>
        } @else {
          <app-blur-loader [active]="loading() && slow()" label="Reading the files">
            @if (single(); as f) {
              <div class="rf-one" data-test="files-one" [attr.data-file]="f.fileRef">
                <button type="button" class="rf-thumb" [disabled]="!openable(f)" [attr.aria-label]="'Open ' + f.name" (click)="pick(f)">
                  <ng-container *ngTemplateOutlet="picture; context: { $implicit: f }"></ng-container>
                </button>
                <div class="flex flex-col gap-3 min-w-0">
                  <h3 class="mono text-sm font-medium break-all" data-test="file-name">{{ f.name }}</h3>
                  <dl class="rf-facts" data-test="file-facts">
                    <dt>Type</dt><dd>{{ badge(f) }}</dd>
                    @if (size(f)) { <dt>Size</dt><dd class="tabular">{{ size(f) }}</dd> }
                    @if (pagesOf(f); as n) { <dt>Pages</dt><dd class="tabular" data-test="file-pages">{{ n }}</dd> }
                    @if (f.report; as r) { <dt>Report</dt><dd data-test="file-report">{{ reportLine(r) }}</dd> }
                    @if (stateOf(f); as st) {
                      <dt>Approval</dt>
                      <dd data-test="file-state">
                        @switch (st.kind) {
                          @case ('signed') { <span class="text-[color:var(--ok-text)] font-medium">Signed ✓</span> by {{ st.by }} · {{ st.at | serverTime:'recent' }} }
                          @case ('approved') { Approved by {{ st.by }} · {{ st.at | serverTime:'recent' }} · not signed }
                          @case ('waiting') { <span class="pill pill-warn"><app-icon name="clock" />Waiting for approval</span> }
                          @case ('rejected') { <span class="text-[color:var(--crit-text)]">Rejected</span> }
                          @case ('void') { <span class="text-[color:var(--crit-text)]">Void</span> }
                        }
                      </dd>
                    }
                    @if (f.expired) { <dt>Kept</dt><dd class="text-warn-600">Expired: no longer kept</dd> }
                  </dl>
                  <div class="flex flex-wrap gap-2 mt-1">
                    <ng-container *ngTemplateOutlet="actions; context: { $implicit: f, size: 'btn-sm' }"></ng-container>
                  </div>
                </div>
              </div>
            } @else if (view() === 'grid') {
              <div class="rf-grid" data-test="files-grid">
                @for (f of page()!.files; track f.fileRef) {
                  <button type="button" class="rf-thumb" [disabled]="!!f.expired || page()?.downloadable === false" [attr.data-file]="f.fileRef"
                          [attr.aria-label]="(previewKind(f) ? 'Open ' : 'Download ') + f.name" (click)="pick(f)">
                    <ng-container *ngTemplateOutlet="picture; context: { $implicit: f }"></ng-container>
                    <span class="rf-thumb-name" [title]="f.name">{{ short(f.name) }}</span>
                    <span class="rf-thumb-meta">{{ metaLine(f) }}</span>
                    @if (f.expired) { <span class="text-[11px] text-warn-600">Expired</span> }
                  </button>
                }
              </div>
            } @else {
              <ul class="rf-list" data-test="files-list">
                @for (f of page()!.files; track f.fileRef) {
                  <li [attr.data-file]="f.fileRef">
                    <span class="rf-list-thumb"><ng-container *ngTemplateOutlet="picture; context: { $implicit: f, small: true }"></ng-container></span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm" [title]="f.name">{{ f.name }}</span>
                      <span class="block text-xs text-[color:var(--text-secondary)] truncate">{{ metaLine(f) }}</span>
                    </span>
                    @if (f.expired) { <span class="text-xs text-warn-600">Expired</span> }
                    <ng-container *ngTemplateOutlet="actions; context: { $implicit: f, size: 'btn-xs' }"></ng-container>
                  </li>
                }
              </ul>
            }
          </app-blur-loader>
        }
      </div>

      @if (!shown() && many() && (page()?.total ?? 0) > 0) {
        <footer class="side-panel-foot text-sm text-[color:var(--text-secondary)]">
          <span class="tabular" data-test="files-range">{{ range() }}</span>
          <span class="flex-1"></span>
          @if (pageNo() > 0) { <button type="button" class="btn btn-default btn-sm" (click)="goTo(pageNo() - 1)">Previous {{ pageSize }}</button> }
          @if (hasNext()) { <button type="button" class="btn btn-default btn-sm" data-test="files-next" (click)="goTo(pageNo() + 1)">Next {{ nextCount() }}</button> }
        </footer>
      }
    </aside>

    <!-- A file's picture: an image itself, a PDF's first page, else its type's icon with its name. -->
    <ng-template #picture let-f let-small="small">
      <span class="rf-thumb-box" [attr.data-thumb]="f.fileRef">
        @if (thumbs().get(f.fileRef); as url) { <img [src]="url" [alt]="small ? '' : (previewKind(f) === 'pdf' ? 'The first page of ' : '') + f.name" data-test="file-thumb" /> }
        @else if (drawing().has(f.fileRef)) { <span class="rf-pulse" aria-hidden="true"></span> }
        @else {
          <span class="rf-type" data-test="file-type-icon">
            <app-icon [name]="icon(f)" [size]="small ? '1rem' : '1.75rem'" />
            @if (!small) { <span class="pill pill-neutral mono">{{ badge(f) }}</span><span class="rf-type-name">{{ f.name }}</span> }
          </span>
        }
      </span>
    </ng-template>

    <!-- Open (looked at here), Download, and Verify for a signed report. -->
    <ng-template #actions let-f let-size="size">
      @if (previewKind(f)) {
        <button type="button" class="btn btn-default {{ size }}" data-test="file-open" [disabled]="!openable(f)" [attr.aria-label]="'Open ' + f.name"
                (click)="pick(f)"><app-icon name="eye" />Open</button>
      }
      <button type="button" class="btn btn-default {{ size }}" data-test="file-download" [disabled]="!!f.expired || page()?.downloadable === false"
              [attr.aria-label]="'Download ' + f.name" (click)="download(f)"><app-icon name="download" />Download</button>
      @if (stateOf(f)?.kind === 'signed') {
        <button type="button" class="btn btn-default {{ size }}" data-test="file-verify" [attr.aria-label]="'Verify the signature of ' + reportLine(f.report)"
                title="Check the signed copy's signature in Reports" (click)="verify(f)"><app-icon name="shield" />Verify</button>
      }
    </ng-template>
  `,
})
export class RunItemFiles implements OnInit {
  readonly data = inject<ItemFilesData>(DIALOG_DATA);
  readonly ref = inject(DialogRef);
  private readonly api = inject(RunItemsApi);
  private readonly studio = inject(ReportStudioApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router, { optional: true });
  private readonly toast = inject(ToastService);
  private readonly drawPdf = inject(PDF_FIRST_PAGE);

  readonly pageSize = FILES_PAGE;
  /** ZT-I18: a tile names a file by what follows its document's name (page-01.png), which a narrow tile would cut off. */
  short(name: string): string {
    const stem = (this.data.label ?? '').replace(/\.[^.]+$/, '');
    return stem && name.startsWith(stem + '-') && name.length > stem.length + 1 ? name.slice(stem.length + 1) : name;
  }

  readonly views: SegmentOption<'grid' | 'list'>[] = [{ id: 'grid', label: 'Grid', icon: 'image' }, { id: 'list', label: 'List', icon: 'list' }];
  readonly view = signal<'grid' | 'list'>('grid');
  readonly search = signal('');
  /** The search the shown page was read with. */
  readonly searched = signal('');
  readonly pageNo = signal(0);
  readonly page = signal<ItemFilesPage | null>(null);
  readonly error = signal('');
  readonly loading = signal(false);
  /** The read has taken longer than SKELETON_AFTER_MS. */
  readonly slow = signal(false);
  readonly zipping = signal(false);
  readonly thumbs = signal<ReadonlyMap<string, string>>(new Map());
  /** The pictures being read or drawn. */
  readonly drawing = signal<ReadonlySet<string>>(new Set());
  /** A PDF's page count, from its drawing (a report's comes with it). */
  readonly pageCounts = signal<ReadonlyMap<string, number>>(new Map());
  /** Report Studio's word on each report version ("reportId vN"); null: it said nothing we may read. */
  readonly reportFacts = signal<ReadonlyMap<string, ReportVersionFacts | null>>(new Map());
  readonly shown = signal<ItemFile | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly previewText = signal<string | null>(null);
  readonly previewError = signal('');

  /** ZT-I35: "1151 · Patient intake summary": the item, and the step by its short name. */
  readonly stepTitle = computed(() => this.data.stepKey || this.data.stepName
    ? stepShortName({ key: this.data.stepKey, name: this.data.stepName }) : 'Files');
  readonly title = computed(() => `${this.data.label} · ${this.stepTitle()}`);
  readonly description = computed(() => stepDescription({ key: this.data.stepKey, name: this.data.stepName }));
  readonly countLine = computed(() => {
    const p = this.page();
    if (!p) return '';
    const n = plural(p.total, 'file');
    return this.searched() || !p.bytes ? n : `${n} · ${formatSize(p.bytes)}`;
  });
  /** Grid, List, the search and Download all: from two files up (or while a search narrows them). */
  readonly many = computed(() => (this.page()?.total ?? 0) > 1 || !!this.searched());
  /** The one file, shown as one larger card. */
  readonly single = computed(() => {
    const p = this.page();
    return p && !this.searched() && p.total === 1 && p.files.length === 1 ? p.files[0] : null;
  });
  readonly range = computed(() => { const p = this.page(); return p ? rangeLabel(this.pageNo(), FILES_PAGE, p.total) : ''; });
  readonly hasNext = computed(() => (this.pageNo() + 1) * FILES_PAGE < (this.page()?.total ?? 0));
  readonly nextCount = computed(() => Math.min(FILES_PAGE, (this.page()?.total ?? 0) - (this.pageNo() + 1) * FILES_PAGE));

  readonly badge = formatBadge;
  readonly icon = fileIcon;
  readonly previewKind = previewKind;
  readonly zipLabel = zipLabel;
  readonly reportLine = reportLine;
  size(f: ItemFile): string { return f.bytes === null || f.bytes === undefined ? '' : formatSize(f.bytes); }
  pagesOf(f: ItemFile): number | null { return f.report?.pages || this.pageCounts().get(f.fileRef) || null; }
  stateOf(f: ItemFile) {
    return f.report ? reportState(this.reportFacts().get(`${f.report.reportId} v${f.report.version}`)) : null;
  }
  /** "PDF · 505.8 KB · 4 pages · RPT-0086 v1". */
  metaLine(f: ItemFile): string {
    const pages = this.pagesOf(f);
    return [this.badge(f), this.size(f), pages ? plural(pages, 'page') : '', f.report ? `${f.report.number} v${f.report.version}` : '']
      .filter(Boolean).join(' · ');
  }
  openable(f: ItemFile): boolean { return !f.expired && this.page()?.downloadable !== false; }

  private request?: Subscription;
  private reads: Subscription[] = [];
  private previewRead?: Subscription;
  private typing: ReturnType<typeof setTimeout> | null = null;
  private slowTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  /** Bumped with each page of files: a drawing for an earlier page is dropped. */
  private generation = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.request?.unsubscribe();
      this.previewRead?.unsubscribe();
      if (this.typing) clearTimeout(this.typing);
      if (this.slowTimer) clearTimeout(this.slowTimer);
      this.releaseThumbs();
      this.releasePreview();
    });
  }

  ngOnInit(): void {
    this.load();
    if (this.data.preview) this.pick(this.data.preview);
  }

  load(): void {
    this.request?.unsubscribe();
    this.error.set('');
    this.loading.set(true);
    this.slow.set(false);
    if (this.slowTimer) clearTimeout(this.slowTimer);
    this.slowTimer = setTimeout(() => this.slow.set(true), SKELETON_AFTER_MS);
    const search = this.search().trim();
    const body: Parameters<RunItemsApi['files']>[0] = { jobQueueId: this.data.jobQueueId, ref: this.data.ref, page: this.pageNo(), size: FILES_PAGE };
    if (this.data.stepKey) body.stepKey = this.data.stepKey;
    if (search) body.search = search;
    if (this.data.attempt) body.attempt = this.data.attempt;
    this.request = this.api.files(body).subscribe({
      next: page => { this.done(); this.searched.set(search); this.page.set(page); this.readPictures(page); this.readReports(page.files); },
      error: err => { this.done(); this.error.set(refusalText(err, 'The files could not be read.')); },
    });
  }

  private done(): void {
    this.loading.set(false);
    this.slow.set(false);
    if (this.slowTimer) { clearTimeout(this.slowTimer); this.slowTimer = null; }
  }

  goTo(page: number): void {
    this.pageNo.set(Math.max(0, page));
    this.load();
  }

  typed(text: string): void {
    this.search.set(text);
    if (this.typing) clearTimeout(this.typing);
    this.typing = setTimeout(() => this.searchNow(), 350);
  }

  searchNow(): void {
    if (this.typing) { clearTimeout(this.typing); this.typing = null; }
    this.pageNo.set(0);
    this.load();
  }

  /**
   * The page's pictures: each image read inline as a blob; each PDF's first page -- a report's from Report Studio (when
   * this person may open Reports), else drawn here, one PDF at a time. ZT-M21: a sensitive pipeline's files, to a person
   * without the permission, are not read at all: their type's icon stays.
   */
  private readPictures(page: ItemFilesPage): void {
    this.releaseThumbs();
    const generation = ++this.generation;
    if (page.downloadable === false) return;
    const live = page.files.filter(f => !f.expired);
    for (const f of live.filter(x => previewKind(x) === 'image')) {
      this.mark(f.fileRef, true);
      this.reads.push(this.api.file(this.data.jobQueueId, this.data.ref, f.fileRef, true).subscribe({
        next: blob => { this.mark(f.fileRef, false); this.keep(f.fileRef, URL.createObjectURL(blob)); },
        error: () => this.mark(f.fileRef, false),
      }));
    }
    const pdfs = live.filter(x => previewKind(x) === 'pdf');
    pdfs.forEach(f => this.mark(f.fileRef, true));
    const width = page.total === 1 ? 480 : 260;
    void (async () => {
      for (const f of pdfs) {
        if (this.destroyed || generation !== this.generation) return;
        const url = await this.pdfPicture(f, width);
        if (this.destroyed || generation !== this.generation) { if (url) URL.revokeObjectURL(url); return; }
        this.mark(f.fileRef, false);
        if (url) this.keep(f.fileRef, url);
      }
    })();
  }

  /** A PDF's first page as an object URL, or null (its type's icon stays). */
  private async pdfPicture(f: ItemFile, width: number): Promise<string | null> {
    if (f.report && this.auth.canOpen('report-library')) {
      const url = await new Promise<string | null>(done => {
        this.reads.push(this.studio.reportThumbnail(f.report!.reportId, f.report!.version).subscribe({
          next: res => done(res.body && (res.headers.get('Content-Type') ?? '').includes('png') ? URL.createObjectURL(res.body) : null),
          error: () => done(null),
        }));
      });
      if (url) return url;
    }
    if ((f.bytes ?? 0) > DRAW_PDF_BYTES) return null;
    const blob = await new Promise<Blob | null>(done => {
      this.reads.push(this.api.file(this.data.jobQueueId, this.data.ref, f.fileRef, true).subscribe({ next: done, error: () => done(null) }));
    });
    if (!blob || this.destroyed) return null;
    try {
      const drawn = await this.drawPdf(new Blob([blob], { type: 'application/pdf' }), width);
      this.pageCounts.update(m => new Map(m).set(f.fileRef, drawn.pages));
      return drawn.url;
    } catch {
      return null;
    }
  }

  /** Report Studio's word on each report on the page -- signed, waiting -- read once per report, when this person may. */
  private readReports(files: ItemFile[]): void {
    if (!this.auth.canOpen('report-library')) return;
    const ids = [...new Set(files.filter(f => f.report?.reportId).map(f => f.report!.reportId))];
    for (const id of ids) {
      if ([...this.reportFacts().keys()].some(k => k.startsWith(`${id} v`))) continue;
      this.reads.push(this.studio.report(id).subscribe({
        next: r => this.reportFacts.update(m => {
          const next = new Map(m);
          for (const f of files.filter(x => x.report?.reportId === id)) {
            next.set(`${id} v${f.report!.version}`, r.versions.find(v => v.version === f.report!.version) ?? null);
          }
          return next;
        }),
        error: () => { /* nothing said of its approval: the report's number and version stay */ },
      }));
    }
  }

  private mark(fileRef: string, on: boolean): void {
    this.drawing.update(s => { const next = new Set(s); if (on) next.add(fileRef); else next.delete(fileRef); return next; });
  }

  private keep(fileRef: string, url: string): void {
    this.thumbs.update(map => new Map(map).set(fileRef, url));
  }

  private releaseThumbs(): void {
    this.reads.forEach(s => s.unsubscribe());
    this.reads = [];
    this.thumbs().forEach(url => URL.revokeObjectURL(url));
    this.thumbs.set(new Map());
    this.drawing.set(new Set());
  }

  /** A file that previews opens here; any other downloads. */
  pick(f: ItemFile): void {
    if (f.expired || this.page()?.downloadable === false) return;
    const kind = previewKind(f);
    if (!kind) { this.download(f); return; }
    this.releasePreview();
    this.shown.set(f);
    this.previewRead = this.api.file(this.data.jobQueueId, this.data.ref, f.fileRef, true).subscribe({
      next: async blob => {
        if (kind === 'text') {
          const text = await blob.text();
          this.previewText.set(text.length > TEXT_CHARS ? `${text.slice(0, TEXT_CHARS)}\n…` : text);
        } else {
          this.previewUrl.set(URL.createObjectURL(kind === 'pdf' ? new Blob([blob], { type: 'application/pdf' }) : blob));
        }
      },
      error: async err => this.previewError.set(await refusalOf(err) || 'The file could not be read; it may have expired.'),
    });
  }

  closePreview(): void {
    this.releasePreview();
    this.shown.set(null);
  }

  private releasePreview(): void {
    this.previewRead?.unsubscribe();
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set(null);
    this.previewText.set(null);
    this.previewError.set('');
  }

  download(f: ItemFile): void {
    this.api.file(this.data.jobQueueId, this.data.ref, f.fileRef, false).subscribe({
      next: blob => StorageService.saveBlob(blob, f.name),
      error: async err => this.toast.error(await refusalOf(err) || `${f.name} could not be downloaded.`),
    });
  }

  /** Verify: the report's page in Reports, with Verify signature open for this version. */
  verify(f: ItemFile): void {
    if (!f.report || !this.router) return;
    this.ref.close();
    void this.router.navigate(['/reports/library', f.report.reportId], { queryParams: { version: f.report.version, verify: 1 } });
  }

  /** Download all: a two-minute link for this person, then the zip, saved from its blob. */
  downloadAll(): void {
    if (this.zipping()) return;
    this.zipping.set(true);
    this.api.zip(this.data.jobQueueId, this.data.ref, this.data.stepKey).subscribe({
      next: response => {
        this.zipping.set(false);
        if (!response.body) { this.toast.error('The server returned an empty file.'); return; }
        const base = this.data.label.replace(/\.[a-z0-9]+$/i, '') || `item-${this.data.ref}`;
        StorageService.saveBlob(response.body, attachmentName(response.headers.get('content-disposition')) || `${base}-files.zip`);
      },
      error: async err => {
        this.zipping.set(false);
        this.toast.error(await refusalOf(err) || refusalText(err, 'The files could not be downloaded.'));
      },
    });
  }
}
