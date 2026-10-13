import { Component, DestroyRef, ElementRef, HostListener, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { columnLabel } from '../../../shared/ui/column-label';
import type { ExportFile } from '../analytics.service';
import { BoardApi, PageColumn, TablePage, TableRequest } from './board-api';
import type { BoardFilterOutcome, BoardFilterWire } from './board-filters';
import {
  ColumnFilter, ColumnKind, PAGE_SIZES, cellText, clausesOf, columnKind, isNumberColumn, isSet, nextSort, pageText, readLayout,
  writeLayout,
} from './table-filters';

/** What a table reads: a saved statement over one dataset, or two. */
export interface TableSource {
  connection: string;
  path: string;
  connection2?: string | null;
  path2?: string | null;
  sql: string;
}

/** What a table tells its tile after each read. */
export interface TableRead {
  state: 'running' | 'done' | 'failed';
  error?: string;
  outcomes?: BoardFilterOutcome[];
  ms?: number;
}

/**
 * A dashboard's details table: a saved statement's result, paged, sorted, searched and filtered BY THE SERVER, so a
 * table over 138,000 orders holds 25 of them in the browser and a count.
 *
 *   [search]                                     1,204 of 138,116 rows   [Columns ▾]  [Export CSV]
 *   Order date ▲ | Region | Channel | Net sales
 *   [from][to]   | [All ▾]| [All ▾]  | [min][max]
 *   ...
 *   Rows 1–25 of 1,204                         25 per page ▾   ‹ 1 / 49 ›
 *
 * A column's filter follows its data: a select for a column of few values (the server lists them on the first page),
 * a range for numbers and dates (an open bound is the column's own lowest or highest), "contains" for other text. The
 * board's filters arrive with every page, so the table is narrowed with the rest of the board. Numbers are right-aligned
 * and grouped; a column the reader may not see is masked by the server, in the page and in the export alike. Export CSV
 * downloads every row the table counts, in its order, through the export endpoint -- metered as any download is.
 *
 * Hidden columns and the page size are the viewer's own, kept in this browser per table.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-board-table',
  imports: [Icon],
  host: { class: 'board-table' },
  styles: `
    :host { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
    .bt-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .bt-search { position: relative; width: 16rem; max-width: 100%; }
    .bt-count { margin-left: auto; font-size: 12px; color: var(--text-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .bt-scroll { overflow: auto; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); overscroll-behavior: contain; position: relative; }
    .bt-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; }
    .bt-table th, .bt-table td { padding: 0.4375rem 0.75rem; text-align: left; white-space: nowrap; border-bottom: 1px solid var(--border-subtle); }
    .bt-table thead th { position: sticky; z-index: 1; background: var(--surface-sunken); font-weight: 600; font-size: 12px; color: var(--text-secondary); }
    .bt-table thead tr.bt-head th { top: 0; }
    .bt-table thead tr.bt-filters th { top: 2.125rem; padding-top: 0.25rem; padding-bottom: 0.375rem; font-weight: 400; }
    .bt-table td.num, .bt-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
    .bt-table tbody tr:hover td { background: var(--surface-sunken); }
    .bt-table td.is-null { color: var(--text-muted); }
    .bt-cell { display: block; max-width: 22rem; overflow: hidden; text-overflow: ellipsis; }
    .bt-sort { display: inline-flex; align-items: center; gap: 0.25rem; font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
    .bt-sort:hover { color: var(--text-primary); }
    .bt-sort:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; border-radius: var(--radius-sm); }
    .bt-input { min-height: 0; height: 1.625rem; padding: 0 0.375rem; font-size: 12px; min-width: 4.5rem; width: 100%; }
    .bt-pair { display: flex; gap: 0.25rem; min-width: 9.5rem; }
    .bt-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; font-size: 12px; color: var(--text-secondary); }
    .bt-pager { margin-left: auto; display: inline-flex; align-items: center; gap: 0.375rem; }
    .bt-pop { position: absolute; right: 0; top: calc(100% + 0.25rem); z-index: 40; width: 16rem; max-height: 20rem; overflow-y: auto; padding: 0.5rem; }
    .bt-veil { position: absolute; inset: 0; background: color-mix(in srgb, var(--surface-raised) 55%, transparent); display: flex;
      align-items: flex-start; justify-content: center; padding-top: 3rem; pointer-events: none; }
    .bt-skel { display: block; height: 0.75rem; border-radius: var(--radius-sm); background: var(--surface-sunken); }
  `,
  template: `
    <div class="bt-tools">
      <label class="bt-search">
        <span class="sr-only">Search every text column</span>
        <app-icon name="search" size="0.9em" class="absolute left-2 top-1/2 -translate-y-1/2 icon-muted" />
        <input type="search" class="input pl-7 py-1 text-sm w-full" placeholder="Search the rows" [value]="search()" data-test="bt-search"
               (input)="onSearch($any($event.target).value)" />
      </label>
      @if (anyColumnFilter()) {
        <button type="button" class="btn btn-ghost btn-xs" data-test="bt-clear" (click)="clearFilters()"><app-icon name="close" size="0.85em" />Clear column filters</button>
      }
      <span class="bt-count" data-test="bt-count">{{ countText() }}</span>
      <div class="relative">
        <button type="button" class="btn btn-ghost btn-xs" [attr.aria-expanded]="columnsOpen()" (click)="columnsOpen.set(!columnsOpen())">
          <app-icon name="table" size="0.9em" />Columns{{ hidden().length ? ' (' + hidden().length + ' hidden)' : '' }}
        </button>
        @if (columnsOpen()) {
          <div class="card shadow-xl bt-pop" role="dialog" aria-label="Show or hide columns">
            @for (column of columns(); track column.name) {
              <label class="flex items-center gap-2 text-sm py-1 px-1 rounded hover:bg-[color:var(--surface-sunken)]">
                <input type="checkbox" class="checkbox" [checked]="!hidden().includes(column.name)" (change)="toggleColumn(column.name)" />
                <span class="truncate">{{ label(column.name) }}</span>
              </label>
            }
          </div>
        }
      </div>
      <button type="button" class="btn btn-default btn-xs" data-test="bt-export" [disabled]="exporting() || !page()?.totalRows" (click)="exportCsv()">
        <app-icon name="download" size="0.9em" [busy]="exporting()" />{{ exporting() ? 'Exporting…' : 'Export CSV' }}
      </button>
    </div>
    @if (exportNote()) { <p class="text-xs text-[color:var(--text-muted)]">{{ exportNote() }}</p> }

    @if (error()) {
      <div class="flex items-start gap-2 text-sm text-crit-500 py-3" role="alert"><app-icon name="alert" class="icon-crit shrink-0 mt-0.5" />{{ error() }}</div>
    } @else {
      <div class="bt-scroll" [style.max-height.px]="maxHeight()" [attr.aria-busy]="loading()">
        <table class="bt-table" [attr.aria-label]="name() || 'Table'" [attr.aria-rowcount]="(page()?.totalRows ?? 0) + 1">
          <thead>
            <tr class="bt-head">
              @for (column of shownColumns(); track column.name) {
                <th scope="col" [class.num]="isNumber(column)" [attr.aria-sort]="ariaSort(column.name)">
                  <button type="button" class="bt-sort" [title]="'Sort by ' + label(column.name)" (click)="sortBy(column.name)">
                    {{ label(column.name) }}
                    @if (sort()?.column === column.name) { <app-icon [name]="sort()!.direction === 'ASC' ? 'arrowUp' : 'arrowDown'" size="0.85em" /> }
                  </button>
                </th>
              }
            </tr>
            <tr class="bt-filters">
              @for (column of shownColumns(); track column.name) {
                @let kind = kindOf(column);
                @let f = filters()[column.name] ?? {};
                <th [class.num]="isNumber(column)">
                  @switch (kind) {
                    @case ('select') {
                      <select class="input bt-input" [attr.aria-label]="'Filter ' + label(column.name)" (change)="setFilter(column.name, { value: $any($event.target).value })">
                        <option value="" [selected]="!f.value">All</option>
                        @for (v of facets()[column.name]; track v) { <option [value]="v" [selected]="v === f.value">{{ v }}</option> }
                      </select>
                    }
                    @case ('text') {
                      <input class="input bt-input" placeholder="Contains…" [attr.aria-label]="'Filter ' + label(column.name) + ', contains'"
                             [value]="f.text ?? ''" (input)="setFilterSoon(column.name, { text: $any($event.target).value })" />
                    }
                    @case ('number') {
                      <span class="bt-pair">
                        <input class="input bt-input" type="number" [placeholder]="'≥ ' + (bounds(column.name)[0] ?? 'min')" [attr.aria-label]="label(column.name) + ' from'"
                               [value]="f.from ?? ''" (input)="setFilterSoon(column.name, { from: $any($event.target).value, to: f.to })" />
                        <input class="input bt-input" type="number" [placeholder]="'≤ ' + (bounds(column.name)[1] ?? 'max')" [attr.aria-label]="label(column.name) + ' to'"
                               [value]="f.to ?? ''" (input)="setFilterSoon(column.name, { from: f.from, to: $any($event.target).value })" />
                      </span>
                    }
                    @case ('date') {
                      <span class="bt-pair">
                        <input class="input bt-input" type="date" [min]="bounds(column.name)[0] ?? ''" [max]="bounds(column.name)[1] ?? ''" [attr.aria-label]="label(column.name) + ' from'"
                               [value]="f.from ?? ''" (change)="setFilter(column.name, { from: $any($event.target).value, to: f.to })" />
                        <input class="input bt-input" type="date" [min]="bounds(column.name)[0] ?? ''" [max]="bounds(column.name)[1] ?? ''" [attr.aria-label]="label(column.name) + ' to'"
                               [value]="f.to ?? ''" (change)="setFilter(column.name, { from: f.from, to: $any($event.target).value })" />
                      </span>
                    }
                  }
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @if (!page() && loading()) {
              @for (row of skeletonRows; track row) {
                <tr>@for (c of skeletonCols; track c) { <td><span class="bt-skel pulse" [style.width.%]="60 + ((row * 7 + c * 13) % 35)"></span></td> }</tr>
              }
            }
            @for (row of rows(); track $index) {
              <tr>
                @for (column of shownColumns(); track column.name) {
                  @let raw = row[indexOf(column.name)];
                  <td [class.num]="isNumber(column)" [class.is-null]="raw === null"><span class="bt-cell" [title]="raw ?? 'null'">{{ cell(raw, column) }}</span></td>
                }
              </tr>
            } @empty {
              @if (page()) { <tr><td [attr.colspan]="shownColumns().length || 1" class="text-center text-[color:var(--text-muted)] py-6">No row matches these filters.</td></tr> }
            }
          </tbody>
        </table>
        @if (loading() && page()) { <div class="bt-veil" aria-hidden="true"><app-icon name="refresh" class="spin icon-muted" /></div> }
      </div>
      <div class="bt-foot">
        <span data-test="bt-page-text">{{ footText() }}</span>
        <div class="bt-pager">
          <label class="flex items-center gap-1">
            <select class="input bt-input w-auto" aria-label="Rows per page" (change)="setPageSize(+$any($event.target).value)">
              @for (size of pageSizes; track size) { <option [value]="size" [selected]="size === pageSize()">{{ size }} per page</option> }
            </select>
          </label>
          <button type="button" class="btn btn-ghost btn-icon btn-xs" aria-label="Previous page" [disabled]="pageAt() === 0 || loading()" (click)="goTo(pageAt() - 1)"><app-icon name="chevronLeft" /></button>
          <span class="tabular-nums">{{ pageAt() + 1 }} / {{ pageCount() }}</span>
          <button type="button" class="btn btn-ghost btn-icon btn-xs" aria-label="Next page" [disabled]="pageAt() + 1 >= pageCount() || loading()" (click)="goTo(pageAt() + 1)"><app-icon name="chevronRight" /></button>
        </div>
      </div>
    }
  `,
})
export class BoardTable {
  private readonly api = inject(BoardApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;

  readonly source = input<TableSource | null>(null);
  readonly boardFilters = input<BoardFilterWire[]>([]);
  /** Bumped by the board to read the table again (Run every widget, the tile's refresh). */
  readonly reload = input(0);
  readonly name = input('');
  /** The viewer's layout for this table is kept under this key. */
  readonly storageKey = input('');
  readonly maxHeight = input(560);
  readonly read = output<TableRead>();

  readonly label = columnLabel;
  readonly pageSizes = PAGE_SIZES;
  readonly skeletonRows = [0, 1, 2, 3, 4, 5];
  readonly skeletonCols = [0, 1, 2, 3, 4];

  readonly page = signal<TablePage | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly pageAt = signal(0);
  readonly pageSize = signal(25);
  readonly sort = signal<{ column: string; direction: 'ASC' | 'DESC' } | null>(null);
  readonly search = signal('');
  readonly filters = signal<Record<string, ColumnFilter>>({});
  readonly hidden = signal<string[]>([]);
  readonly columnsOpen = signal(false);
  readonly exporting = signal(false);
  readonly exportNote = signal('');
  /** The facets and bounds of the result under the board's filters, read with its first page. */
  readonly facets = signal<Record<string, string[]>>({});
  private readonly ranges = signal<Record<string, string[]>>({});

  private readonly typed = new Subject<void>();
  private inFlight: Subscription | null = null;
  private needFacets = true;
  private seq = 0;

  readonly columns = computed<PageColumn[]>(() => this.page()?.columnMeta ?? []);
  readonly shownColumns = computed(() => this.columns().filter(c => !this.hidden().includes(c.name)));
  readonly rows = computed(() => this.page()?.rows ?? []);
  private readonly indexes = computed(() => new Map(this.columns().map((c, i) => [c.name, i])));
  readonly anyColumnFilter = computed(() => Object.values(this.filters()).some(isSet));
  readonly pageCount = computed(() => Math.max(1, Math.ceil((this.page()?.totalRows ?? 0) / this.pageSize())));
  readonly countText = computed(() => {
    const page = this.page();
    if (!page) return '';
    const total = page.totalRows.toLocaleString();
    return page.filtered && page.unfilteredRows !== undefined && page.unfilteredRows !== page.totalRows
      ? `${total} of ${page.unfilteredRows.toLocaleString()} rows` : `${total} row${page.totalRows === 1 ? '' : 's'}`;
  });
  readonly footText = computed(() => {
    const page = this.page();
    return page ? pageText(this.pageAt(), this.pageSize(), page.rows.length, page.totalRows) : '';
  });

  constructor() {
    this.typed.pipe(debounceTime(350), takeUntilDestroyed(this.destroyRef)).subscribe(() => { this.pageAt.set(0); this.fetch(); });
    // The viewer's layout, read once per table.
    effect(() => {
      const key = this.storageKey();
      if (!key) return;
      const layout = readLayout(key);
      untracked(() => { this.hidden.set(layout.hidden); this.pageSize.set(layout.pageSize); });
    });
    // A new statement, new board filters or a reload: the first page again, with its facets.
    effect(() => {
      this.source();
      this.boardFilters();
      this.reload();
      untracked(() => { this.needFacets = true; this.pageAt.set(0); this.fetch(); });
    });
    this.destroyRef.onDestroy(() => this.inFlight?.unsubscribe());
  }

  isNumber(column: PageColumn): boolean { return isNumberColumn(column); }
  kindOf(column: PageColumn): ColumnKind { return columnKind(column, this.facets()); }
  bounds(column: string): string[] { return this.ranges()[column] ?? []; }
  indexOf(column: string): number { return this.indexes().get(column) ?? -1; }
  cell(raw: string | null | undefined, column: PageColumn): string { return cellText(raw, column); }
  ariaSort(column: string): string | null {
    const sort = this.sort();
    return sort?.column === column ? (sort.direction === 'ASC' ? 'ascending' : 'descending') : null;
  }

  onSearch(term: string): void { this.search.set(term); this.typed.next(); }

  sortBy(column: string): void {
    this.sort.set(nextSort(this.sort(), column));
    this.pageAt.set(0);
    this.fetch();
  }

  setFilter(column: string, filter: ColumnFilter): void {
    this.filters.update(all => ({ ...all, [column]: filter }));
    this.pageAt.set(0);
    this.fetch();
  }

  /** A typed filter waits for the typing to stop: one read, not one per key. */
  setFilterSoon(column: string, filter: ColumnFilter): void {
    this.filters.update(all => ({ ...all, [column]: filter }));
    this.typed.next();
  }

  clearFilters(): void {
    this.filters.set({});
    this.pageAt.set(0);
    this.fetch();
  }

  goTo(page: number): void {
    if (page < 0 || page >= this.pageCount()) return;
    this.pageAt.set(page);
    this.fetch();
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
    this.saveLayout();
    this.pageAt.set(0);
    this.fetch();
  }

  toggleColumn(column: string): void {
    this.hidden.update(list => list.includes(column) ? list.filter(c => c !== column) : [...list, column]);
    this.saveLayout();
  }

  private saveLayout(): void {
    if (this.storageKey()) writeLayout(this.storageKey(), { hidden: this.hidden(), pageSize: this.pageSize() });
  }

  private request(page: number, facets: boolean): TableRequest | null {
    const source = this.source();
    if (!source) return null;
    return {
      ...source, page, pageSize: this.pageSize(), boardFilters: this.boardFilters(),
      sort: this.sort()?.column ?? null, direction: this.sort()?.direction ?? null, search: this.search(),
      filters: clausesOf(this.filters(), this.columns(), this.facets(), this.ranges()), facets,
    };
  }

  private fetch(): void {
    const request = this.request(this.pageAt(), this.needFacets);
    if (!request) return;
    const mine = ++this.seq;
    const started = performance.now();
    this.inFlight?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.read.emit({ state: 'running' });
    this.inFlight = this.api.rows(request).subscribe({
      next: response => {
        if (mine !== this.seq) return;
        this.loading.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          const message = response.message || 'This table could not be read.';
          this.error.set(message);
          this.read.emit({ state: 'failed', error: message });
          return;
        }
        const page = response.data;
        if (request.facets) {
          this.facets.set(page.facets ?? {});
          this.ranges.set(page.ranges ?? {});
          this.needFacets = false;
        }
        this.page.set(page);
        this.read.emit({ state: 'done', outcomes: page.boardFilters, ms: Math.round(performance.now() - started) });
      },
      error: err => {
        if (mine !== this.seq) return;
        this.loading.set(false);
        const message = err?.error?.message || 'This table could not be read.';
        this.error.set(message);
        this.read.emit({ state: 'failed', error: message });
      },
    });
  }

  exportCsv(): void {
    const request = this.request(0, false);
    if (!request) return;
    this.exporting.set(true);
    this.exportNote.set('');
    const file = (this.name() || 'table').replace(/[^\w.-]+/g, '-').slice(0, 60);
    this.api.exportCsv(request, file).subscribe({
      next: response => {
        this.exporting.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.exportNote.set(response.message || 'The export could not be made.');
          return;
        }
        save(response.data);
        this.exportNote.set(response.data.truncated
          ? (response.data.notice || 'That file holds part of the rows, not all of them.')
          : `Exported ${response.data.rowCount.toLocaleString()} rows.`);
      },
      error: err => {
        this.exporting.set(false);
        this.exportNote.set(err?.error?.message || 'The export could not be made.');
      },
    });
  }

  @HostListener('document:mousedown', ['$event'])
  onDocument(event: MouseEvent): void {
    if (!this.columnsOpen() || !(event.target instanceof Node)) return;
    const pop = this.host.querySelector('.bt-pop');
    const toggle = pop?.parentElement;
    if (toggle && !toggle.contains(event.target)) this.columnsOpen.set(false);
  }
}

/** A base64 file saved by the browser, decoded through bytes so nothing above 127 is re-encoded. */
function save(file: ExportFile): void {
  const binary = atob(file.content);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: file.contentType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  link.click();
  URL.revokeObjectURL(url);
}
