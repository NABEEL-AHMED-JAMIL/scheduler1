import { AfterViewInit, Component, DestroyRef, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { Icon } from './icon';
import { BlurLoader } from './blur-loader';
import { LoadError } from './load-error';
import { RowSnap } from './row-snap';

/**
 * Shared chrome for the list screens: a titled card with a filter slot, plus consistent
 * loading, error and empty states. Every table screen had its own slightly different version
 * of these three states in the old app, which is why some rendered a bare header when a
 * filter matched nothing.
 */
@Component({
  selector: 'app-table-shell',
  imports: [Icon, BlurLoader, LoadError, RowSnap],
  styles: `
    .table-toolbar-controls {
      display: flex; flex: 1 1 auto; flex-wrap: wrap; align-items: center; justify-content: flex-end;
      gap: 0.5rem; min-width: 0;
    }
    /* The search box grows into the line's free room and shrinks before anything wraps; pages' own max-w-* caps
       made it the first thing cut ("Search name, code, service or t"). */
    .table-toolbar-controls ::ng-deep .search-field { flex: 1 1 15rem; min-width: 12rem; max-width: 24rem; }
    /* Set when the controls would wrap beside the heading: the heading takes its own line and the controls the next. */
    .table-toolbar.is-stacked > h2 { flex-basis: 100%; }
  `,
  template: `
    <div class="card overflow-hidden">
      <div class="table-toolbar flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-b border-subtle"
          >
        <h2 class="text-sm font-semibold mr-auto">
          {{ heading() }}
          @if (total() !== null) {
            <span class="text-[color:var(--text-muted)] font-normal">
              ({{ shown() }} of {{ total() }})
            </span>
          }
        </h2>
        <!-- Review 2026-10-07 (M16): the controls are one group. When the heading and the group fit on one line they
             share it; when the group would wrap beside the heading, the heading takes a line of its own (is-stacked,
             set by stackToolbar) and the group the next, the search box taking the room that is left -- never Columns
             alone on a second line, never a cut placeholder. -->
        <div class="table-toolbar-controls">
        <ng-content select="[toolbar]" />
        @if (columns().length >= 5) {
          <!-- Owner, 2026-09-24: choose which columns to see. Read from the table's own headings, so every
               list gets it; remembered per table. Blank and Actions columns always stay. -->
          <div class="relative">
            <button type="button" class="btn btn-default btn-sm" [attr.aria-expanded]="columnsOpen()"
                    (click)="columnsOpen.set(!columnsOpen())" (keydown.escape)="columnsOpen.set(false)">
              <app-icon name="eye" />Columns
              @if (hiddenCount()) { <span class="pill pill-neutral ml-1">{{ hiddenCount() }} hidden</span> }
            </button>
            @if (columnsOpen()) {
              <div class="fixed inset-0 z-10" aria-hidden="true" (click)="columnsOpen.set(false)"></div>
              <div class="card absolute right-0 top-full mt-1 z-20 py-1 shadow-lg min-w-52 max-h-80 overflow-y-auto text-sm"
                   role="group" aria-label="Columns to show">
                @for (column of columns(); track column) {
                  <label class="menu-item flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" class="checkbox" [checked]="!isHidden(column)"
                           [disabled]="!isHidden(column) && visibleCount() === 1"
                           (change)="toggleColumn(column)" />
                    <span class="truncate">{{ column }}</span>
                  </label>
                }
                @if (hiddenCount()) {
                  <button type="button" class="btn btn-ghost btn-xs w-full mt-1" (click)="showAllColumns()">Show all</button>
                }
              </div>
            }
          </div>
        }
        </div>
      </div>

      <!-- A second row for controls that come and go -- bulk selection above all. Putting them
           in the toolbar made the filters slide sideways the moment a row was ticked, because
           the heading's mr-auto and the new group's ml-auto split the free space between them.
           Down here nothing above can move.

           Shown by an input rather than by whether anything was projected: content inside an
           @if lives in an embedded view and does not match a projection selector, so asking the
           caller directly is the only reliable signal. -->
      @if (showSubbar()) {
        <div class="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-subtle bg-sunken">
          <ng-content select="[subbar]" />
        </div>
      }

      @if (loading() && isEmpty()) {
        <!-- Nothing to show yet: a plain spinner. Once rows exist, a reload keeps them under
             a blur (see the last branch) rather than swapping them for this block. -->
        <div class="px-6 py-14 text-center text-sm text-[color:var(--text-muted)]">
          <div class="spinner mx-auto mb-3" role="status" aria-label="Loading"></div>
          Loading…
        </div>
      } @else if (error() && !loading()) {
        <app-load-error [message]="error()" [retryable]="errorRetryable()" (retry)="retry.emit()">
          <ng-content select="[error-action]" />
        </app-load-error>
      } @else if (isEmpty() && !loading()) {
        <div class="px-6 py-14 text-center">
          <app-icon [name]="emptyIcon()" size="1.75rem"
                    class="icon-muted block mx-auto mb-3" />
          <p class="text-sm text-[color:var(--text-secondary)]">{{ emptyMessage() }}</p>
          <div class="mt-4"><ng-content select="[empty-action]" /></div>
        </div>
      } @else {
        <!-- The rows scroll inside their own box so the toolbar above and the pager below
             stay put. Without it a 369-entry log ran the page to 15,000px and the view
             switcher, search and refresh were all off-screen by the second row. -->
        <app-blur-loader [active]="loading()" label="Refreshing…">
          <!-- appRowSnap: the box ends on a row boundary, not halfway through one (UI review U7). -->
          <div class="overflow-x-auto" [class.scroll-table]="scrollRows()" [appRowSnap]="scrollRows()"><ng-content /></div>
        </app-blur-loader>
      }
      <!-- Outside the scroll box: paging controls that scroll away with the rows are
           unreachable exactly when a long list makes them necessary. -->
      <ng-content select="[pager]" />
    </div>
  `,
})
export class TableShell implements AfterViewInit {
  readonly heading = input.required<string>();
  /** Whether the second toolbar row is shown. See the note in the template. */
  readonly showSubbar = input(false);
  readonly loading = input(false);
  readonly error = input('');
  /**
   * False when trying again cannot help (a record that does not exist): Try again is hidden and
   * the page's `[error-action]` content, such as a link back to the list, shows instead.
   */
  readonly errorRetryable = input(true);
  readonly isEmpty = input(false);
  readonly emptyMessage = input('Nothing here yet.');
  /** Something that suggests what is missing beats a generic box on every screen. */
  readonly emptyIcon = input('inbox');
  /**
   * Whether the rows scroll in their own box, keeping the toolbar and pager pinned.
   *
   * On by default because that is what a long list needs: a 369-entry log ran the page to
   * 15,000px and put the view switcher, search and refresh off-screen by the second row. A
   * screen whose list is short enough to read in one piece can turn it off and let the page
   * scroll instead, which costs the pinning but reads more naturally.
   */
  readonly scrollRows = input(true);
  readonly shown = input<number | null>(null);
  readonly total = input<number | null>(null);
  readonly retry = output<void>();
  /** Where the column choice is remembered; the heading when not given. */
  readonly columnsKey = input('');

  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
  protected readonly columnsOpen = signal(false);
  /** The table's hideable columns, by heading. */
  protected readonly columns = signal<string[]>([]);
  private readonly hidden = signal<string[]>([]);
  protected readonly hiddenCount = computed(() => this.hidden().filter(h => this.columns().includes(h)).length);
  protected readonly visibleCount = computed(() => this.columns().length - this.hiddenCount());
  private restoredKey = '';
  private observer?: MutationObserver;
  private resized?: ResizeObserver;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.observer?.disconnect(); this.resized?.disconnect(); });
  }

  ngAfterViewInit(): void {
    this.refreshColumns();
    // M16: re-decided whenever the toolbar's width or its controls change (a filter that comes and goes).
    const toolbar = this.host.querySelector<HTMLElement>('.table-toolbar');
    if (toolbar && typeof ResizeObserver !== 'undefined') {
      // In the next frame, not inside the observer's own delivery: stacking changes the toolbar's height, which the
      // observer would otherwise report again in the same frame ("ResizeObserver loop completed ...").
      this.resized = new ResizeObserver(() => requestAnimationFrame(() => this.stackToolbar(toolbar)));
      this.resized.observe(toolbar);
    }
    // Rows re-render (paging, filters, a reload), so the choice is re-applied whenever the table's children
    // change. Only childList: the display changes made here must not wake it again.
    this.observer = new MutationObserver(() => { this.refreshColumns(); if (toolbar) this.stackToolbar(toolbar); });
    this.observer.observe(this.host, { childList: true, subtree: true });
  }

  /**
   * Review 2026-10-07 (M16): whether the controls wrap when they share the heading's line. Measured with the heading
   * inline; when any control sits below the first, the heading takes its own line (is-stacked). Toggled within one
   * callback, so the size the observer sees settles at once.
   */
  stackToolbar(toolbar: HTMLElement): void {
    const group = toolbar.querySelector<HTMLElement>('.table-toolbar-controls');
    if (!group) return;
    toolbar.classList.remove('is-stacked');
    const tops = Array.from(group.children).map(c => (c as HTMLElement).getBoundingClientRect())
      .filter(r => r.width > 0).map(r => Math.round(r.top));
    if (tops.some(top => top > tops[0] + 4)) toolbar.classList.add('is-stacked');
  }

  protected isHidden(column: string): boolean {
    return this.hidden().includes(column);
  }

  protected toggleColumn(column: string): void {
    if (this.isHidden(column)) this.hidden.set(this.hidden().filter(h => h !== column));
    else if (this.visibleCount() > 1) this.hidden.set([...this.hidden(), column]);
    this.saveColumns();
  }

  protected showAllColumns(): void {
    this.hidden.set([]);
    this.saveColumns();
  }

  private storeKey(): string {
    return 'etl_table_cols:' + (this.columnsKey() || this.heading());
  }

  private saveColumns(): void {
    try { localStorage.setItem(this.storeKey(), JSON.stringify(this.hidden())); } catch { /* not remembered */ }
    this.refreshColumns();
  }

  private refreshColumns(): void {
    const table = this.host.querySelector('table');
    const heads = table ? Array.from(table.querySelectorAll(':scope > thead > tr:first-child > th')) : [];
    const labels = heads.map(th => (th.textContent ?? '').replace(/\s+/g, ' ').trim());
    const hideable = labels.filter(label => label && label.toLowerCase() !== 'actions');
    if (hideable.join('\u0000') !== this.columns().join('\u0000')) this.columns.set(hideable);
    const key = this.storeKey();
    if (key !== this.restoredKey) {
      this.restoredKey = key;
      try {
        const saved = JSON.parse(localStorage.getItem(key) ?? '[]');
        this.hidden.set(Array.isArray(saved) ? saved.filter((v: unknown) => typeof v === 'string') : []);
      } catch { this.hidden.set([]); }
    }
    if (!table) return;
    const hide = labels.map(label => !!label && label.toLowerCase() !== 'actions' && this.hidden().includes(label));
    // The footer too: without it a total row kept every cell and each figure sat under the wrong heading.
    table.querySelectorAll<HTMLTableRowElement>(':scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr').forEach(row => {
      const cells = Array.from(row.children) as HTMLElement[];
      // A detail row spans the whole table in one cell: it has no columns to hide.
      if (cells.length !== labels.length) return;
      cells.forEach((cell, i) => {
        const display = hide[i] ? 'none' : '';
        if (cell.style.display !== display) cell.style.display = display;
      });
    });
  }
}
