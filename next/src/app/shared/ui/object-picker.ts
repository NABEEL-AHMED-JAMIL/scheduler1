import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../core/api/api.config';
import { BucketSummary, ObjectSummary, StorageService } from '../../features/objects/storage.service';
import { Combobox } from './combobox';
import { Icon } from './icon';
import { LoadError } from './load-error';
import { SidePanel, sidePanelConfig } from './side-panel';
import { formatSize } from './format-size';
import { Segmented, SegmentOption } from './segmented';
import { ServerTimePipe } from './server-time.pipe';
import { Pagination } from './pagination';
import { createPager } from './pager';
import { createTableSort, sortRows } from './sort';
import { SortHeader } from './sort-header';
import { AppLoading, InlineStatus, loadErrorText } from './loading';

export interface ObjectPickerOptions {
  /** What the pick is for -- shown as the panel's title. */
  heading?: string;
  /** Start here rather than at the bucket list. */
  bucket?: string;
  prefix?: string;
  /** Extensions to offer; the list opens narrowed to them, and "All files" shows the rest greyed. Empty means every file. */
  extensions?: string[];
  /** The file picked last time: its folder opens and its row is marked, so reopening keeps the selection. */
  selectedKey?: string;
}

export interface PickedObject {
  bucket: string;
  key: string;
  name: string;
  size?: number;
  contentType?: string;
  lastModified?: string;
}

/** A row of the list: a folder or file of the open folder, or a match of a search (which names its folder). */
type Row = ObjectSummary & { folderPath?: string };

/** The type filter: the caller's types, one of them, or everything (the rest greyed). */
const OFFERED = 'offered';
const ALL = 'all';

/** Rows a page; the pager's own sizes (50, 100, ...) after that. */
const PAGE = 50;

/**
 * One file, from any bucket the person can see (owner #27, 2026-10-19: the file picker pages, searches, filters by
 * type, shows size and date and keeps the selection).
 *
 * A wide panel with the console's table: Name, Type, Size and Modified, folders first, sortable, paged 50 at a time with
 * "Load more" when the folder holds more than the store sent. The search box narrows the open folder at once; Enter (or
 * "Search all of ...") asks Storage for every file under the folder, however deep, whose name holds the words
 * (storage.json/findObjects), and each match names its folder. The type chips start on the types the caller can use;
 * "All files" shows the rest greyed, so a person can see the file exists and is the wrong kind. A click selects a row
 * (the selection stays while searching, filtering and paging, and is said in the footer); "Use this file", a double
 * click, or Enter on the row answers it. Reopened with `selectedKey`, the picker opens that file's folder with it marked.
 */
@Component({
  selector: 'app-object-picker',
  imports: [SidePanel, Combobox, Icon, LoadError, Segmented, ServerTimePipe, Pagination, SortHeader, AppLoading, InlineStatus],
  styles: `
    .op-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .op-toolbar .search-field { flex: 1 1 16rem; min-width: 12rem; }
    .op-table { width: 100%; }
    .op-table td, .op-table th { padding-block: 0.45rem; }
    .op-table tbody tr { cursor: pointer; }
    .op-table tbody tr:hover > td { background: var(--surface-sunken); }
    .op-table tbody tr.is-selected > td { background: var(--pill-brand-bg); }
    .op-table tbody tr.is-off { cursor: not-allowed; color: var(--text-muted); }
    .op-table tbody tr:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
    .op-name { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }
    .op-name > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `,
  template: `
    <app-side-panel [heading]="data.heading || 'Pick a file'" [subtitle]="subtitle()">
      <div class="form-stack">
        @if (error() && !bucket()) {
          <app-load-error [message]="error()" (retry)="retry()" />
        }
        <div class="op-toolbar">
          <div class="min-w-56 flex-1 max-w-80">
            <label class="label" for="opBucket">Bucket</label>
            <app-combobox id="opBucket" [selected]="bucket()" (selectedChange)="openBucket($event)"
                          [placeholder]="bucketsLoading() ? 'Loading buckets…' : 'Choose a bucket'" [allowClear]="false"
                          [options]="bucketOptions()" [searching]="bucketsLoading()" />
          </div>
        </div>

        @if (!bucket()) {
          <!-- Owner 2026-10-27: loading until the bucket list answers, and a plain line when there is none. -->
          @if (bucketsLoading()) {
            <app-loading shape="list" label="Loading buckets…" [count]="3" />
          } @else if (buckets().length) {
            <ul class="object-picker-list" aria-label="Buckets">
              @for (b of buckets(); track b.bucket) {
                <li>
                  <button type="button" class="object-picker-row" (click)="openBucket(b.bucket)">
                    <app-icon name="database" size="1em" class="icon-info" />
                    <span class="truncate">{{ b.label || b.bucket }}</span>
                    <span class="text-xs text-[color:var(--text-muted)] ml-auto">{{ b.provider }}</span>
                  </button>
                </li>
              }
            </ul>
          } @else if (!error()) {
            <p class="text-sm text-[color:var(--text-muted)] rounded-md px-3 py-4 bg-sunken text-center" data-test="picker-no-bucket">
              No bucket you can open yet. A storage connection added under Connections makes one appear here.
            </p>
          }
        } @else {
          <nav class="flex items-center gap-1 flex-wrap text-xs" aria-label="Folder path">
            <app-icon name="folder" size="0.9em" class="icon-muted" />
            <button type="button" class="link-inline mono" (click)="browse('')">{{ bucket() }}</button>
            @for (crumb of crumbs(); track crumb.prefix) {
              <span class="text-[color:var(--text-muted)]">/</span>
              <button type="button" class="link-inline mono" (click)="browse(crumb.prefix)">{{ crumb.name }}</button>
            }
          </nav>

          <div class="op-toolbar">
            <div class="search-field">
              <app-icon name="search" size="0.95em" />
              <input class="input" [placeholder]="searching() ? 'Search all of ' + scopeLabel() : 'Filter this folder, Enter to search all of it'"
                     [value]="filter()" (input)="onFilter($any($event.target).value)" (keydown.enter)="search()"
                     aria-label="Search files" data-test="picker-search" />
            </div>
            @if (typeOptions().length > 1) {
              <app-segmented [value]="typeFilter()" (valueChange)="setType($event)" [options]="typeOptions()"
                             ariaLabel="File types" />
            }
          </div>

          @if (searching()) {
            <p class="text-xs text-[color:var(--text-secondary)] flex flex-wrap items-center gap-2" data-test="picker-search-note">
              <app-icon name="search" size="0.9em" />
              @if (searchLoading()) { Searching {{ scopeLabel() }}… }
              @else {
                {{ found().length }} {{ found().length === 1 ? 'file' : 'files' }} named like "{{ searchedFor() }}" in {{ scopeLabel() }}
                @if (searchTruncated()) { · the first {{ found().length }} shown; narrow the words or open a folder }
              }
              <button type="button" class="link-inline" (click)="clearSearch()">Back to the folder</button>
            </p>
          } @else if (filter().trim()) {
            <button type="button" class="btn btn-default btn-sm self-start" (click)="search()" data-test="picker-search-all">
              <app-icon name="search" />Search all of {{ scopeLabel() }} for "{{ filter().trim() }}"
            </button>
          }

          @if (loading() || searchLoading()) {
            <app-loading shape="rows" [label]="searchLoading() ? 'Searching…' : 'Reading the folder…'" [count]="5" />
          } @else if (error()) {
            <app-load-error [message]="error()" (retry)="retry()" />
          } @else if (!rows().length) {
            <div class="text-sm text-[color:var(--text-muted)] rounded-md px-3 py-4 bg-sunken text-center" data-test="picker-empty">
              {{ emptyText() }}
              @if (hiddenByType()) {
                <button type="button" class="link-inline ml-1" (click)="setType('all')">Show all {{ hiddenByType() }} {{ hiddenByType() === 1 ? 'file' : 'files' }}</button>
              }
            </div>
          } @else {
            <div class="overflow-x-auto rounded-lg border border-subtle">
              <table class="table-modern op-table" aria-label="Files" data-test="picker-table">
                <thead>
                  <tr>
                    <th appSort="name" [sortBy]="sort">Name</th>
                    <th class="w-24" appSort="type" [sortBy]="sort">Type</th>
                    <th class="w-24 text-right" appSort="size" [sortBy]="sort">Size</th>
                    <th class="w-40" appSort="modified" [sortBy]="sort">Modified</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of pagedRows(); track row.key) {
                    @if (row.folder) {
                      <tr tabindex="0" (click)="browse(row.key)" (keydown.enter)="browse(row.key)" [attr.data-key]="row.key">
                        <td><span class="op-name"><app-icon name="folder" size="1em" class="icon-info shrink-0" /><span>{{ row.name }}</span></span></td>
                        <td class="text-[color:var(--text-muted)]">Folder</td>
                        <td></td><td></td>
                      </tr>
                    } @else {
                      <tr tabindex="0" [class.is-off]="!offered(row)" [class.is-selected]="isSelected(row)"
                          [attr.aria-selected]="isSelected(row)" [attr.aria-disabled]="!offered(row) || null"
                          [title]="offered(row) ? row.key : 'Not a ' + data.extensions?.join(', ') + ' file'"
                          [attr.data-key]="row.key"
                          (click)="select(row)" (dblclick)="pick(row)" (keydown.enter)="pick(row)" (keydown.space)="select(row); $event.preventDefault()">
                        <td>
                          <span class="op-name">
                            <app-icon [name]="isSelected(row) ? 'check' : 'file'" size="1em" [class]="isSelected(row) ? 'icon-ok shrink-0' : 'icon-muted shrink-0'" />
                            <span>{{ row.name }}
                              @if (row.folderPath) { <span class="block mono text-xs text-[color:var(--text-muted)] truncate">{{ row.folderPath }}</span> }
                            </span>
                          </span>
                        </td>
                        <td><span class="pill pill-neutral">{{ typeOf(row) || '—' }}</span></td>
                        <td class="text-right tabular whitespace-nowrap">{{ sizeOf(row) }}</td>
                        <td class="tabular whitespace-nowrap text-[color:var(--text-secondary)]">{{ row.lastModified ? (row.lastModified | serverTime: 'dateTime') : '—' }}</td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
            @if (rows().length > pager.size()) {
              <app-pagination [total]="rows().length" [page]="pager.page()" [size]="pager.size()"
                              (goTo)="pager.goTo($event, rows().length)" (setSize)="pager.setSize($event)" />
            }
            @if (nextToken() && !searching()) {
              <button type="button" class="btn btn-default btn-sm self-start" (click)="browse(prefix(), true)" data-test="picker-more"
                      [disabled]="loadingMore()">
                <app-icon name="chevronDown" [busy]="loadingMore()" />This folder has more — load the next {{ batch }}
              </button>
              <!-- Owner 2026-10-27: a failed next batch is said here; the files already shown stay. -->
              <app-inline-status [error]="moreError()" (retry)="browse(prefix(), true)" />
            }
          }
        }
      </div>
      <ng-container foot>
        <span class="text-xs text-[color:var(--text-muted)] mr-auto min-w-0 truncate" data-test="picker-selection">
          @if (selected(); as s) {
            Selected: <span class="font-medium text-[color:var(--text-primary)]">{{ s.name }}</span>
            @if (s.size != null) { · {{ size(s.size) }} }
            @if (s.lastModified) { · {{ s.lastModified | serverTime: 'dateTime' }} }
          } @else if (data.extensions?.length) { Looking for {{ data.extensions!.join(', ') }} files. } @else { Any file type. }
        </span>
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" [disabled]="!selected()" (click)="useSelected()" data-test="picker-use">
          <app-icon name="check" />Use this file
        </button>
      </ng-container>
    </app-side-panel>
  `,
})
export class ObjectPicker {
  readonly ref = inject<DialogRef<PickedObject | undefined>>(DialogRef);
  readonly data = inject<ObjectPickerOptions>(DIALOG_DATA);
  private readonly storage = inject(StorageService);

  /** One read of a folder asks the store for this many. */
  readonly batch = 200;

  readonly buckets = signal<BucketSummary[]>([]);
  readonly bucket = signal(this.data.bucket ?? '');
  readonly prefix = signal(this.data.prefix ?? folderOf(this.data.selectedKey));
  readonly objects = signal<ObjectSummary[]>([]);
  readonly nextToken = signal<string | undefined>(undefined);
  readonly loading = signal(false);
  /** The next batch of a long folder: busy on its button, and why it failed beside it. */
  readonly loadingMore = signal(false);
  readonly moreError = signal('');
  /** The bucket list's first read: until it answers the picker says it is loading, not that there is no bucket. */
  readonly bucketsLoading = signal(true);
  readonly filter = signal('');
  /** Why the bucket list or this folder could not be read; shown with Try again in place of the rows. */
  readonly error = signal('');

  /** The type filter: the caller's types (OFFERED), one extension, or ALL. */
  readonly typeFilter = signal<string>(this.data.extensions?.length ? OFFERED : ALL);
  readonly pager = createPager<Row>(PAGE);
  /**
   * Owner 2026-10-27: the shared column sort -- Name A to Z first as before, Size and Modified largest / newest first,
   * and Type now too. Folders stay above files whatever the order: each group sorts on its own. A new order goes back
   * to the first page.
   */
  readonly sort = createTableSort<Row>({
    id: 'object-picker',
    columns: {
      name: r => r.name,
      type: r => (r.folder ? 'Folder' : this.typeOf(r)),
      size: { value: r => r.size, kind: 'number' },
      modified: { value: r => r.lastModified, kind: 'date' },
    },
    initial: { key: 'name', direction: 'asc' },
    onChange: () => this.pager.reset(),
  });

  /** The row chosen, kept while the folder, search, filter or page changes; reopening hands it back in. */
  readonly selected = signal<PickedObject | null>(this.data.bucket && this.data.selectedKey
    ? { bucket: this.data.bucket, key: this.data.selectedKey, name: nameOf(this.data.selectedKey) } : null);

  /** A search of the bucket (findObjects): the words searched for, and what came back. */
  readonly searchedFor = signal('');
  readonly found = signal<Row[]>([]);
  readonly searchLoading = signal(false);
  readonly searchTruncated = signal(false);
  readonly searching = computed(() => !!this.searchedFor());

  readonly bucketOptions = computed(() => this.buckets().map(b => ({ value: b.bucket, label: b.label || b.bucket, hint: b.provider })));
  readonly subtitle = computed(() => this.bucket() ? `${this.bucket()}/${this.prefix()}` : 'Any bucket you can see');
  readonly scopeLabel = computed(() => `${this.bucket()}/${this.prefix()}`);
  readonly crumbs = computed(() => {
    const parts = this.prefix().split('/').filter(Boolean);
    return parts.map((name, i) => ({ name, prefix: parts.slice(0, i + 1).join('/') + '/' }));
  });

  /** "mp3, m4a" (the caller's types), each of them when there are a few, and All files. */
  readonly typeOptions = computed<SegmentOption<string>[]>(() => {
    const wanted = (this.data.extensions ?? []).map(e => e.toLowerCase());
    if (!wanted.length) return [];
    const options: SegmentOption<string>[] = [{ id: OFFERED, label: wanted.length <= 3 ? wanted.join(', ') : 'Supported types' }];
    if (wanted.length > 1 && wanted.length <= 4) wanted.forEach(e => options.push({ id: e, label: e }));
    options.push({ id: ALL, label: 'All files' });
    return options;
  });

  /** Folders first, then files; narrowed by the filter (a folder) and the type; sorted. */
  readonly rows = computed<Row[]>(() => {
    const source: Row[] = this.searching() ? this.found() : this.objects();
    const q = this.searching() ? '' : this.filter().trim().toLowerCase();
    // A to Z first, so rows that tie on the chosen column (folders have no size) stay in name order.
    const all = sortRows(source.filter(o => (!q || o.name.toLowerCase().includes(q)) && (o.folder || this.passesType(o))),
      o => o.name, 'asc', 'text');
    return [...this.sort.apply(all.filter(o => o.folder)), ...this.sort.apply(all.filter(o => !o.folder))];
  });
  readonly pagedRows = computed(() => this.pager.slice(this.rows()));

  /** Files the type filter hides here: the empty state offers to show them. */
  readonly hiddenByType = computed(() => {
    if (this.typeFilter() === ALL) return 0;
    const source: Row[] = this.searching() ? this.found() : this.objects();
    return source.filter(o => !o.folder && !this.passesType(o)).length;
  });

  readonly emptyText = computed(() => {
    if (this.searching()) return `No ${this.typeWords()}file in ${this.scopeLabel()} is named like "${this.searchedFor()}".`;
    if (this.filter().trim()) return `Nothing here matches "${this.filter().trim()}". Press Enter to search all of ${this.scopeLabel()}.`;
    return this.hiddenByType() ? `No ${this.typeWords()}files in this folder.` : 'Nothing in this folder.';
  });

  private ticket = 0;
  private searchTicket = 0;

  constructor() {
    this.loadBuckets();
    if (this.bucket()) this.browse(this.prefix());
  }

  private loadBuckets(): void {
    this.bucketsLoading.set(true);
    this.storage.buckets().subscribe({
      next: r => {
        this.bucketsLoading.set(false);
        if (r.status === API_SUCCESS) {
          const list = r.data ?? [];
          this.buckets.set(list);
          // One bucket is the only place to look: open it rather than ask.
          if (!this.bucket() && list.length === 1) this.openBucket(list[0].bucket);
          return;
        }
        this.error.set(loadErrorText(r, 'The buckets could not be read.'));
      },
      error: err => { this.bucketsLoading.set(false); this.error.set(loadErrorText(err, 'The buckets could not be read.')); },
    });
  }

  /** Try again: the search or folder when one is open, otherwise the bucket list. */
  retry(): void {
    this.error.set('');
    if (this.searching()) this.search(this.searchedFor());
    else if (this.bucket()) this.browse(this.prefix());
    else this.loadBuckets();
  }

  openBucket(bucket: string): void {
    this.bucket.set(bucket);
    this.objects.set([]);
    this.clearSearch();
    if (bucket) this.browse('');
  }

  browse(prefix: string, append = false): void {
    this.prefix.set(prefix);
    if (!append) { this.filter.set(''); this.searchedFor.set(''); this.found.set([]); this.pager.reset(); }
    this.loading.set(!append);
    this.loadingMore.set(append);
    this.moreError.set('');
    if (!append) this.error.set('');
    const ticket = ++this.ticket;
    // A failed next batch keeps the rows already shown and says so by its button; a failed folder replaces them.
    const failed = (err: unknown) => {
      const words = loadErrorText(err, 'This folder could not be read.');
      if (append) this.moreError.set(words); else this.error.set(words);
    };
    this.storage.listObjects(this.bucket(), prefix, append ? this.nextToken() : undefined, this.batch).subscribe({
      next: r => {
        if (ticket !== this.ticket) return;
        this.loading.set(false);
        this.loadingMore.set(false);
        if (r.status !== API_SUCCESS) { failed(r); return; }
        const page = r.data?.objects ?? [];
        this.objects.update(current => append ? [...current, ...page] : page);
        this.nextToken.set(r.data?.nextContinuationToken);
      },
      error: err => {
        if (ticket !== this.ticket) return;
        this.loading.set(false);
        this.loadingMore.set(false);
        failed(err);
      },
    });
  }

  onFilter(value: string): void {
    this.filter.set(value);
    this.pager.reset();
    // Emptying the box ends a search: back to the folder as it was.
    if (!value.trim() && this.searching()) this.clearSearch();
  }

  /** Every file under the open folder, however deep, whose name holds the words (Storage's findObjects). */
  search(words = this.filter()): void {
    const query = words.trim();
    if (!query || !this.bucket()) return;
    this.searchedFor.set(query);
    this.searchLoading.set(true);
    this.searchTruncated.set(false);
    this.error.set('');
    this.pager.reset();
    const ticket = ++this.searchTicket;
    // The type filter narrows on screen, so "All files" can show what the search found of other kinds.
    this.storage.findObjects(this.bucket(), this.prefix(), query).subscribe({
      next: r => {
        if (ticket !== this.searchTicket) return;
        this.searchLoading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(loadErrorText(r, 'This bucket could not be searched.')); return; }
        this.found.set((r.data?.objects ?? []).map(o => ({ ...o, folderPath: folderOf(o.key) || '/' })));
        this.searchTruncated.set(!!r.data?.truncated);
      },
      error: err => {
        if (ticket !== this.searchTicket) return;
        this.searchLoading.set(false);
        this.error.set(loadErrorText(err, 'This bucket could not be searched.'));
      },
    });
  }

  clearSearch(): void {
    this.searchTicket++;
    this.searchedFor.set('');
    this.found.set([]);
    this.searchLoading.set(false);
    this.filter.set('');
    this.pager.reset();
  }

  setType(id: string): void {
    this.typeFilter.set(id);
    this.pager.reset();
  }

  offered(row: ObjectSummary): boolean {
    const wanted = this.data.extensions;
    if (!wanted?.length) return true;
    const name = row.name.toLowerCase();
    return wanted.some(ext => name.endsWith('.' + ext.toLowerCase()));
  }

  private passesType(row: ObjectSummary): boolean {
    const type = this.typeFilter();
    if (type === ALL) return true;
    if (type === OFFERED) return this.offered(row);
    return row.name.toLowerCase().endsWith('.' + type);
  }

  private typeWords(): string {
    const type = this.typeFilter();
    if (type === ALL) return '';
    return (type === OFFERED ? (this.data.extensions ?? []).join(', ') : type) + ' ';
  }

  typeOf(row: ObjectSummary): string {
    const dot = row.name.lastIndexOf('.');
    return dot > 0 ? row.name.slice(dot + 1).toLowerCase() : '';
  }

  sizeOf(row: ObjectSummary): string { return row.size == null ? '' : formatSize(row.size); }
  size = formatSize;

  isSelected(row: ObjectSummary): boolean {
    const s = this.selected();
    return !!s && s.bucket === this.bucket() && s.key === row.key;
  }

  select(row: ObjectSummary): void {
    if (row.folder || !this.offered(row)) return;
    this.selected.set(this.toPicked(row));
  }

  /** Answers with this row (a double click, or Enter on it). */
  pick(row: ObjectSummary): void {
    if (row.folder || !this.offered(row)) return;
    this.ref.close(this.toPicked(row));
  }

  useSelected(): void {
    const s = this.selected();
    if (s) this.ref.close(s);
  }

  private toPicked(row: ObjectSummary): PickedObject {
    return { bucket: this.bucket(), key: row.key, name: row.name, size: row.size, contentType: row.contentType, lastModified: row.lastModified };
  }
}

function folderOf(key: string | undefined): string {
  if (!key) return '';
  const cut = key.lastIndexOf('/');
  return cut >= 0 ? key.slice(0, cut + 1) : '';
}

function nameOf(key: string): string {
  return key.slice(key.lastIndexOf('/') + 1);
}

/** Opens the picker as a wide centred panel (owner 2026-09-30: pickers centred); resolves with the file or undefined. */
export function objectPickerConfig(options: ObjectPickerOptions) {
  return sidePanelConfig<ObjectPickerOptions>(options, 'wide');
}
