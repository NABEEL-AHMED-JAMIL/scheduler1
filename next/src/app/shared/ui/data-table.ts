import { AfterViewInit, Component, DestroyRef, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { Icon } from './icon';
import { BlurLoader } from './blur-loader';
import { LoadError } from './load-error';

/**
 * Shared chrome for the list screens: a titled card with a filter slot, plus consistent
 * loading, error and empty states. Every table screen had its own slightly different version
 * of these three states in the old app, which is why some rendered a bare header when a
 * filter matched nothing.
 */
@Component({
  selector: 'app-table-shell',
  imports: [Icon, BlurLoader, LoadError],
  template: `
    <div class="card overflow-hidden">
      <div class="table-toolbar flex flex-wrap items-center gap-2 px-4 py-3 border-b border-subtle"
          >
        <h2 class="text-sm font-semibold mr-auto">
          {{ heading() }}
          @if (total() !== null) {
            <span class="text-[color:var(--text-muted)] font-normal">
              ({{ shown() }} of {{ total() }})
            </span>
          }
        </h2>
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
              <div class="card absolute right-0 top-full mt-1 z-20 py-1 shadow-lg min-w-52 max-h-80 overflow-y-auto"
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
        <app-load-error [message]="error()" (retry)="retry.emit()" />
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
          <div class="overflow-x-auto" [class.scroll-table]="scrollRows()"><ng-content /></div>
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

  constructor() {
    inject(DestroyRef).onDestroy(() => this.observer?.disconnect());
  }

  ngAfterViewInit(): void {
    this.refreshColumns();
    // Rows re-render (paging, filters, a reload), so the choice is re-applied whenever the table's children
    // change. Only childList: the display changes made here must not wake it again.
    this.observer = new MutationObserver(() => this.refreshColumns());
    this.observer.observe(this.host, { childList: true, subtree: true });
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
    table.querySelectorAll<HTMLTableRowElement>(':scope > thead > tr, :scope > tbody > tr').forEach(row => {
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
