import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Subscription } from 'rxjs';
import { Icon } from '../../../shared/ui/icon';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { ToastService } from '../../../shared/ui/toast.service';
import { refusalOf } from '../../../shared/ui/blob-refusal';
import { formatSize } from '../../../shared/ui/format-size';
import { StorageService } from '../../objects/storage.service';
import { PdfViewer } from '../../objects/preview/pdf-viewer';
import { attachmentName } from '../run-steps/run-steps.model';
import { RunItemsApi, refusalText } from './run-items.api';
import { ItemFile, ItemFilesPage, formatBadge, previewKind, rangeLabel, zipLabel } from './run-items.model';

/** What the file list is for: one item's files, of one step or of all of them. */
export interface ItemFilesData {
  jobQueueId: number;
  ref: string;
  label: string;
  stepKey?: string | null;
  stepName?: string | null;
  attempt?: number | null;
  /** Opens with this file shown (a chip in the item's panel). */
  preview?: ItemFile | null;
}

/** How many files a page of the list holds. */
export const FILES_PAGE = 15;
/** Text shown in a preview, at most; the rest is in the download. */
const TEXT_CHARS = 200_000;

/**
 * MIG-420: the files a step made for one item -- "Page images · 40 files" -- with a search, a grid of thumbnails or a
 * list, a page of fifteen at a time, a preview of an image, a PDF or a text file, and Download all as one zip. Every
 * file is read through HttpClient as a blob, so the sign-in's token goes with it; the thumbnails and the preview are
 * object URLs, released when the page of files changes or the panel closes.
 */
@Component({
  selector: 'app-run-item-files',
  imports: [Icon, Segmented, PdfViewer],
  styles: `
    .rf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); gap: 0.75rem; }
    .rf-thumb { display: flex; flex-direction: column; gap: 0.375rem; min-width: 0; text-align: left; }
    .rf-thumb-box { aspect-ratio: 3 / 4; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--surface-sunken);
                    display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .rf-thumb:hover .rf-thumb-box, .rf-thumb:focus-visible .rf-thumb-box { border-color: var(--border-control); }
    .rf-thumb img { width: 100%; height: 100%; object-fit: cover; }
    .rf-thumb-name { font-size: 0.75rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rf-list { list-style: none; margin: 0; padding: 0; }
    .rf-list > li { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0; border-bottom: 1px solid var(--border-subtle); }
    .rf-list > li:last-child { border-bottom: 0; }
    .rf-preview { flex: 1; min-height: 24rem; display: flex; flex-direction: column; }
    .rf-preview img { max-width: 100%; max-height: 70vh; object-fit: contain; margin: 0 auto; }
  `,
  template: `
    <aside class="side-panel" role="dialog" [attr.aria-label]="title()" data-test="item-files">
      <header class="side-panel-head">
        <div class="min-w-0 flex-1 flex flex-col gap-2.5">
          <div class="flex items-start gap-2">
            <div class="min-w-0 flex-1">
              <h2 class="text-base font-semibold truncate" data-test="files-title">{{ title() }}</h2>
              <p class="text-sm text-[color:var(--text-secondary)] truncate"><span class="mono">{{ data.label }}</span>@if (data.stepName) { · {{ data.stepName }} step }</p>
            </div>
            @if ((page()?.total ?? 0) > 0) {
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
          @if (!shown()) {
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

      <div class="side-panel-body flex flex-col gap-3">
        @if (shown(); as f) {
          <div class="flex flex-wrap items-center gap-2" data-test="file-preview">
            <button type="button" class="btn btn-default btn-sm" (click)="closePreview()"><app-icon name="arrowLeft" />All files</button>
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
              <p class="text-sm text-[color:var(--text-muted)]" aria-busy="true">Reading the file…</p>
            }
          </div>
        } @else if (error()) {
          <p class="text-sm text-crit-500" role="alert">{{ error() }}</p>
        } @else if (!page()) {
          <p class="text-sm text-[color:var(--text-muted)]" aria-busy="true">Reading the files…</p>
        } @else if (!page()!.files.length) {
          <p class="text-sm text-[color:var(--text-muted)]">{{ search() ? 'No file matches.' : 'This step kept no files for the item.' }}</p>
        } @else if (view() === 'grid') {
          <div class="rf-grid" data-test="files-grid">
            @for (f of page()!.files; track f.fileRef) {
              <button type="button" class="rf-thumb" [disabled]="!!f.expired || page()?.downloadable === false" [attr.data-file]="f.fileRef"
                      [attr.aria-label]="(previewKind(f) ? 'Look at ' : 'Download ') + f.name" (click)="pick(f)">
                <span class="rf-thumb-box">
                  @if (thumbs().get(f.fileRef); as url) { <img [src]="url" alt="" /> }
                  @else { <span class="pill pill-neutral mono">{{ badge(f) }}</span> }
                </span>
                <span class="rf-thumb-name" [title]="f.name">{{ short(f.name) }}</span>
                @if (f.expired) { <span class="text-[11px] text-warn-600">Expired</span> }
              </button>
            }
          </div>
        } @else {
          <ul class="rf-list" data-test="files-list">
            @for (f of page()!.files; track f.fileRef) {
              <li [attr.data-file]="f.fileRef">
                <span class="pill pill-neutral mono shrink-0">{{ badge(f) }}</span>
                <span class="min-w-0 flex-1 truncate text-sm" [title]="f.name">{{ f.name }}</span>
                <span class="text-xs text-[color:var(--text-muted)] tabular whitespace-nowrap">{{ size(f) }}</span>
                @if (f.expired) { <span class="text-xs text-warn-600">Expired</span> }
                @if (previewKind(f)) {
                  <button type="button" class="btn btn-default btn-xs" [disabled]="!!f.expired" [attr.aria-label]="'Look at ' + f.name" (click)="pick(f)"><app-icon name="eye" />View</button>
                }
                <button type="button" class="btn btn-default btn-xs" [disabled]="!!f.expired" [attr.aria-label]="'Download ' + f.name" (click)="download(f)"><app-icon name="download" />Download</button>
              </li>
            }
          </ul>
        }
      </div>

      @if (!shown() && (page()?.total ?? 0) > 0) {
        <footer class="side-panel-foot text-sm text-[color:var(--text-secondary)]">
          <span class="tabular" data-test="files-range">{{ range() }}</span>
          <span class="flex-1"></span>
          @if (pageNo() > 0) { <button type="button" class="btn btn-default btn-sm" (click)="goTo(pageNo() - 1)">Previous {{ pageSize }}</button> }
          @if (hasNext()) { <button type="button" class="btn btn-default btn-sm" data-test="files-next" (click)="goTo(pageNo() + 1)">Next {{ nextCount() }}</button> }
        </footer>
      }
    </aside>
  `,
})
export class RunItemFiles implements OnInit {
  readonly data = inject<ItemFilesData>(DIALOG_DATA);
  readonly ref = inject(DialogRef);
  private readonly api = inject(RunItemsApi);
  private readonly toast = inject(ToastService);

  readonly pageSize = FILES_PAGE;
  /** ZT-I18: a tile names a file by what follows its document's name (page-01.png), which a narrow tile would cut off. */
  short(name: string): string {
    const stem = (this.data.label ?? '').replace(/\.[^.]+$/, '');
    return stem && name.startsWith(stem + '-') && name.length > stem.length + 1 ? name.slice(stem.length + 1) : name;
  }

  readonly views: SegmentOption<'grid' | 'list'>[] = [{ id: 'grid', label: 'Grid', icon: 'image' }, { id: 'list', label: 'List', icon: 'list' }];
  readonly view = signal<'grid' | 'list'>('grid');
  readonly search = signal('');
  readonly pageNo = signal(0);
  readonly page = signal<ItemFilesPage | null>(null);
  readonly error = signal('');
  readonly zipping = signal(false);
  readonly thumbs = signal<ReadonlyMap<string, string>>(new Map());
  readonly shown = signal<ItemFile | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly previewText = signal<string | null>(null);
  readonly previewError = signal('');

  readonly title = computed(() => {
    const total = this.page()?.total;
    const what = this.data.stepName || 'Files';
    return total === undefined ? what : `${what} · ${total.toLocaleString('en-GB')} ${total === 1 ? 'file' : 'files'}`;
  });
  readonly range = computed(() => { const p = this.page(); return p ? rangeLabel(this.pageNo(), FILES_PAGE, p.total) : ''; });
  readonly hasNext = computed(() => (this.pageNo() + 1) * FILES_PAGE < (this.page()?.total ?? 0));
  readonly nextCount = computed(() => Math.min(FILES_PAGE, (this.page()?.total ?? 0) - (this.pageNo() + 1) * FILES_PAGE));

  readonly badge = formatBadge;
  readonly previewKind = previewKind;
  readonly zipLabel = zipLabel;
  size(f: ItemFile): string { return f.bytes === null || f.bytes === undefined ? '' : formatSize(f.bytes); }

  private request?: Subscription;
  private thumbReads: Subscription[] = [];
  private previewRead?: Subscription;
  private typing: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request?.unsubscribe();
      this.previewRead?.unsubscribe();
      if (this.typing) clearTimeout(this.typing);
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
    const body: Parameters<RunItemsApi['files']>[0] = { jobQueueId: this.data.jobQueueId, ref: this.data.ref, page: this.pageNo(), size: FILES_PAGE };
    if (this.data.stepKey) body.stepKey = this.data.stepKey;
    if (this.search().trim()) body.search = this.search().trim();
    if (this.data.attempt) body.attempt = this.data.attempt;
    this.request = this.api.files(body).subscribe({
      next: page => { this.page.set(page); this.readThumbs(page.files); },
      error: err => this.error.set(refusalText(err, 'The files could not be read.')),
    });
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

  /** The page's images as thumbnails: each read inline as a blob (the grid shows a format badge until it lands). */
  private readThumbs(files: ItemFile[]): void {
    this.releaseThumbs();
    // ZT-M21: a sensitive pipeline's files, to a person without the permission: listed, nothing read.
    if (this.page()?.downloadable === false) return;
    for (const f of files.filter(x => !x.expired && previewKind(x) === 'image')) {
      this.thumbReads.push(this.api.file(this.data.jobQueueId, this.data.ref, f.fileRef, true).subscribe({
        next: blob => this.thumbs.update(map => new Map(map).set(f.fileRef, URL.createObjectURL(blob))),
        error: () => { /* the badge stays in its place */ },
      }));
    }
  }

  private releaseThumbs(): void {
    this.thumbReads.forEach(s => s.unsubscribe());
    this.thumbReads = [];
    this.thumbs().forEach(url => URL.revokeObjectURL(url));
    this.thumbs.set(new Map());
  }

  /** A file that previews opens here; any other downloads. */
  pick(f: ItemFile): void {
    if (f.expired) return;
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
