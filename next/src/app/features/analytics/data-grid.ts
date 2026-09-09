import {
  Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal, untracked,
} from '@angular/core';
import { Icon } from '../../shared/ui/icon';
import { copyText } from '../../shared/ui/clipboard.util';
import { FilterClause, FilterOperator, OPERAND_COUNT } from './analytics.service';
import { FILTER_OPERATORS, isDateType, isNumericType } from './filter-builder';

/**
 * One column of the grid. `hidden` and `width` are the reader's own two conveniences and are the
 * only fields the grid ever overrides locally; name and type belong to the dataset.
 */
export interface GridColumn {
  name: string;
  /** DuckDB's own type name. Decides the default filter operator and the cell alignment. */
  type: string;
  hidden?: boolean;
  /** Pixels. Absent means "size to the content", which is what an untouched column does. */
  width?: number;
}

/** The sort the SERVER is applying, or was asked to apply. Never a sort of the page. */
export interface GridSort {
  column: string;
  direction: 'ASC' | 'DESC';
}

/** A column's new width, or null to hand it back to automatic sizing. */
export interface GridWidth {
  column: string;
  width: number | null;
}

/**
 * A cell the reader copied. THE WRITE HAS ALREADY HAPPENED by the time this is emitted -- see the
 * note on `copyCell` -- so a listener should report the outcome, not repeat the copy.
 */
export interface GridCopy {
  /** Index into the page of rows on screen, not a row number in the dataset. */
  row: number;
  column: string;
  /** The real cell value: null is a null, '' is an empty string, and they are different. */
  value: string | null;
  /** Whether the clipboard actually took it. False is common enough to be worth saying. */
  copied: boolean;
}

/**
 * The operators a header-row filter offers: the eight that take nothing or one plain operand.
 *
 * Derived from FILTER_OPERATORS rather than retyped, so the grid and the Canvas builder cannot
 * drift into two vocabularies -- the server compiles both through one FilterCompiler and a
 * fifteenth operator invented here would be refused at the far end of a round trip.
 *
 * The six left out are not missing features, they are operators that need more than one input to
 * express: BETWEEN, NUMERIC_RANGE and DATE_RANGE take two bounds, IN and NOT_IN take a list, and
 * RELATIVE_DATE takes a window token off a closed vocabulary. A header cell 90px wide cannot ask
 * for any of those honestly, and a half-expressed range is a predicate nobody wrote. The grid
 * says so and points at the builder instead.
 */
export const GRID_OPERATORS = FILTER_OPERATORS.filter(operator => {
  const operands = OPERAND_COUNT[operator.id];
  return (operands === 0 || operands === 1) && operator.id !== 'RELATIVE_DATE';
});

/** How narrow and how wide a reader may drag a column. Below ~64px a header is unreadable. */
export const MIN_COLUMN_WIDTH = 64;
export const MAX_COLUMN_WIDTH = 720;

/** One arrow key on a resize handle, and one with Shift held. */
const RESIZE_STEP = 16;
const RESIZE_STEP_LARGE = 64;

/** What an unresized cell may grow to before it truncates -- Tailwind's max-w-64, in pixels. */
const DEFAULT_CELL_MAX = 256;

/**
 * How long a keystroke waits before it becomes a request.
 *
 * Every search is a scan of the whole dataset on the server, so a character is not a query. Long
 * enough that typing "revenue" is one request rather than seven; short enough that a reader who
 * stops typing does not wonder whether anything is happening.
 */
const SEARCH_DEBOUNCE_MS = 300;

/** How long the tick stays on a copied cell. */
const COPIED_MS = 1400;

const STORE_PREFIX = 'etl.grid.';

/** The per-column facts, worked out once per change rather than once per cell per pass. */
interface GridColumnView {
  name: string;
  type: string;
  /** Position in the ORIGINAL column list, which is the position of this cell in every row. */
  index: number;
  width: number | null;
  /** What the cell may grow to: the set width, or the default truncation point. */
  maxWidth: number;
  ariaSort: 'ascending' | 'descending' | 'none';
  sorted: boolean;
  sortIcon: string;
  /** What pressing the header button will do next, said in words for the accessible name. */
  sortAction: string;
  operator: FilterOperator;
  /** Whether this operator wants a value typed beside it. */
  needsValue: boolean;
  value: string;
  /** Whether this column is currently narrowing the result. Drives the marker on the header. */
  filtering: boolean;
  numeric: boolean;
}

/** What the reader last asked the server for, so the busy line can name it. */
type Pending = '' | 'sort' | 'search' | 'filter';

/**
 * The dataset grid: one page of rows out of something that may hold millions of them.
 *
 * <b>Presentational. It issues no HTTP and holds no dataset state.</b> It renders the page it is
 * handed and emits what the reader did with it. The rows on screen are a window onto a file the
 * grid cannot see the rest of, and the server is the only thing that can.
 *
 * <b>SORTING IS SERVER-SIDE AND THIS IS THE WHOLE POINT.</b> A grid that sorts the array it
 * happens to be holding gives the most convincing wrong answer available on this screen: the
 * column looks sorted, the arrow says so, and the reader believes they are looking at the largest
 * values in the dataset when they are looking at the largest values on page 3 of 400. Nothing
 * here reorders `rows`. A header click emits the intent, the page goes busy, and whatever comes
 * back is rendered in the order it arrives in. The same applies to search and to filters: both
 * are scans of the whole file, and neither is approximated locally while the request is out.
 *
 * <b>The count says what it is counting.</b> Once a filter or a search is on, `totalRows` is the
 * count of MATCHING rows -- and a matching count printed alone reads as the size of the file. So
 * the header prints "1,204 of 250,000 rows" whenever the caller knows the unfiltered size, and
 * says "filtered" plainly when it does not.
 *
 * <b>Width and visibility are the reader's, not the data's.</b> They live in this component and,
 * given a `storageKey`, in localStorage; every access is wrapped, because a private window makes
 * the accessor itself throw rather than return nothing. The grid renders correctly when nothing
 * comes back, which is the normal case on a first visit.
 *
 * <b>Keyboard.</b> Sortable headers are real buttons carrying aria-sort. Cells are a roving
 * tabindex: one Tab reaches the grid, arrows move within it, Home/End walk a row, Ctrl+Home/End
 * jump to the corners, and Enter or Ctrl/Cmd+C copies the focused cell -- so copy-cell is
 * reachable without a mouse, which is the half of that feature usually left out. Resize handles
 * are focusable separators driven by the arrow keys.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-data-grid',
  imports: [Icon],
  host: { class: 'block min-w-0' },
  template: `
    <div class="flex flex-col gap-2 min-w-0">

      <!-- Toolbar. Everything that governs what the SERVER is asked for lives on one line, above
           the rows, so it stays put while the rows below it scroll. -->
      <div class="flex flex-wrap items-center gap-2 min-w-0">

        <label class="relative flex items-center min-w-0">
          <span class="sr-only">Search every text column</span>
          <app-icon name="search" size="0.85em"
                    class="absolute left-2 text-[color:var(--text-muted)] pointer-events-none" />
          <input type="search" class="input min-h-0 py-1 pl-7 pr-2 text-xs w-56 max-w-full"
                 placeholder="Search all rows…"
                 [value]="searchDraft()"
                 (input)="onSearchInput($any($event.target).value)"
                 (search)="flushSearch()"
                 (keydown.enter)="flushSearch()" />
        </label>

        <button type="button" class="btn btn-default btn-xs"
                [class.pill-solid-brand]="filterRowOpen()"
                [attr.aria-expanded]="filterRowOpen()"
                (click)="filterRowOpen.set(!filterRowOpen())">
          <app-icon name="filter" />Filters
          @if (activeFilters().length) {
            <span class="pill pill-brand ml-1">{{ activeFilters().length }}</span>
          }
        </button>

        <div class="relative">
          <button type="button" class="btn btn-default btn-xs"
                  [attr.aria-expanded]="columnsPanelOpen()"
                  (click)="columnsPanelOpen.set(!columnsPanelOpen())">
            <app-icon name="eye" />Columns
            @if (hiddenCount()) {
              <span class="pill pill-neutral ml-1">{{ hiddenCount() }} hidden</span>
            }
          </button>
          @if (columnsPanelOpen()) {
            <!-- A backdrop rather than a document listener: it closes on any click outside,
                 including one that lands on another control, and it disappears with the panel
                 instead of outliving it. -->
            <div class="fixed inset-0 z-10" aria-hidden="true"
                 (click)="columnsPanelOpen.set(false)"></div>
            <div class="card absolute right-0 top-full mt-1 z-20 p-2 w-56 max-h-72 overflow-y-auto
                        shadow-xl"
                 role="group" aria-label="Which columns are shown">
              <p class="text-[11px] text-[color:var(--text-muted)] px-1 pb-1">
                Hiding a column hides it here only — it is still read, still searched and still
                counted on the server.
              </p>
              @for (column of allColumns(); track column.name) {
                <label class="flex items-center gap-2 px-1 py-1 text-xs cursor-pointer rounded
                              hover:bg-sunken">
                  <input type="checkbox" [checked]="!column.hidden"
                         [disabled]="!column.hidden && visibleColumns().length === 1"
                         (change)="toggleColumn(column.name)" />
                  <span class="truncate" [title]="column.name">{{ column.name }}</span>
                </label>
              }
              @if (visibleColumns().length === 1) {
                <p class="field-note text-[color:var(--text-muted)] px-1">
                  The last visible column cannot be hidden — a grid with no columns is a blank box.
                </p>
              }
              <button type="button" class="btn btn-ghost btn-xs w-full mt-1"
                      [disabled]="!hiddenCount()" (click)="showAllColumns()">
                Show all {{ allColumns().length }}
              </button>
            </div>
          }
        </div>

        @if (anythingActive()) {
          <button type="button" class="btn btn-ghost btn-xs" (click)="clearAll()">
            <app-icon name="close" />Clear
          </button>
        }

        <!-- The count, and the one thing it must never do is let a filtered figure read as the
             size of the file. -->
        <div class="ml-auto text-right shrink-0">
          <p class="text-xs font-semibold">{{ countLabel() }}</p>
          <p class="text-[11px] text-[color:var(--text-muted)]">{{ pageLabel() }}</p>
        </div>
      </div>

      @if (activeFilters().length) {
        <div class="flex flex-wrap items-center gap-1.5">
          @for (clause of activeFilters(); track clause.field) {
            <span class="pill pill-neutral gap-1">
              {{ describe(clause) }}
              <button type="button" class="opacity-70 hover:opacity-100"
                      [attr.aria-label]="'Remove the filter on ' + clause.field"
                      (click)="clearFilter(clause.field)">
                <app-icon name="close" size="0.75em" />
              </button>
            </span>
          }
        </div>
      }

      <!-- What the server is doing, said while it does it. This line is the difference between a
           sort a reader can trust and a sort that merely looks applied. -->
      <p class="text-[11px] leading-snug" role="status"
         [class.text-[color:var(--text-muted)]]="!loading()"
         [class.text-[color:var(--accent-text)]]="loading()">
        @if (loading()) {
          {{ busyLabel() }}
        } @else if (sort()) {
          Sorted by <span class="font-medium">{{ sort()!.column }}</span>
          {{ sort()!.direction === 'ASC' ? 'ascending' : 'descending' }} on the server, across
          every row in the dataset — not just this page.
        } @else {
          Unsorted: pages follow the order the file is read in. Sorting, searching and filtering
          all run on the server over the whole dataset.
        }
      </p>

      <!-- The rows scroll sideways inside this box. The page body never does: a 200-column file
           would otherwise push the toolbar above and the pager below off to the left. -->
      <div class="card overflow-hidden">
        <div class="overflow-x-auto scroll-table" [attr.aria-busy]="loading() ? 'true' : null"
             [class.opacity-60]="loading()">
          <table class="table-modern" role="grid">
            <caption class="sr-only">{{ caption() }}</caption>
            <thead>
              <tr>
                @for (column of viewColumns(); track column.name) {
                  <th scope="col" [attr.aria-sort]="column.ariaSort"
                      [style.width.px]="column.width"
                      [style.minWidth.px]="column.width"
                      [style.maxWidth.px]="column.width">
                    <div class="flex items-center gap-1">
                      <button type="button" class="th-sort"
                              [class.th-sort-active]="column.sorted"
                              [attr.aria-label]="column.sortAction"
                              [title]="column.name + ' — ' + column.type"
                              (click)="toggleSort(column.name)">
                        <span class="truncate">{{ column.name }}</span>
                        <app-icon [name]="column.sortIcon" size="0.8em" />
                      </button>
                      @if (column.filtering) {
                        <app-icon name="filter" size="0.7em"
                                  class="text-[color:var(--accent-text)]"
                                  label="filtered" />
                      }
                      <!-- Focusable, so a column can be resized without a pointer. A separator
                           rather than a button: it has a value and a range, and that is what a
                           screen reader should hear when it lands on one. -->
                      <span class="ml-auto w-1.5 h-4 shrink-0 rounded cursor-col-resize
                                   hover:bg-[color:var(--border-strong)]
                                   focus-visible:bg-[color:var(--color-brand-500)] focus:outline-none"
                            role="separator" aria-orientation="vertical" tabindex="0"
                            [class.bg-[color:var(--color-brand-500)]]="resizing() === column.name"
                            [attr.aria-label]="'Resize ' + column.name +
                                               ' — arrow keys to size, delete to reset'"
                            [attr.aria-valuenow]="column.width"
                            [attr.aria-valuemin]="minWidth" [attr.aria-valuemax]="maxWidth"
                            (mousedown)="startResize($event, column.name)"
                            (dblclick)="resetWidth(column.name)"
                            (keydown)="onResizeKey($event, column.name)"></span>
                    </div>
                  </th>
                }
              </tr>
              @if (filterRowOpen()) {
                <!-- Deliberately NOT sticky. The row above it is pinned by .scroll-table, and a
                     second pinned row at the same offset would sit on top of the first. The
                     chips in the toolbar are what keep an active filter visible once this row
                     has scrolled away. -->
                <tr class="bg-sunken">
                  @for (column of viewColumns(); track column.name) {
                    <th scope="col" style="position: static" class="font-normal normal-case">
                      <div class="flex items-center gap-1">
                        <select class="input min-h-0 py-0.5 pl-1.5 pr-6 text-[11px] w-auto min-w-0"
                                [attr.aria-label]="'Filter operator for ' + column.name"
                                [value]="column.operator"
                                (change)="setOperator(column.name, $any($event.target).value)">
                          @for (operator of operators; track operator.id) {
                            <option [value]="operator.id"
                                    [selected]="operator.id === column.operator">
                              {{ operator.label }}
                            </option>
                          }
                        </select>
                        @if (column.needsValue) {
                          <input class="input min-h-0 py-0.5 px-1.5 text-[11px] w-full min-w-0"
                                 [type]="column.numeric ? 'number' : 'text'"
                                 [attr.aria-label]="'Filter value for ' + column.name"
                                 [value]="column.value"
                                 (change)="setValue(column.name, $any($event.target).value)" />
                        }
                      </div>
                    </th>
                  }
                </tr>
              }
            </thead>
            <tbody (focusin)="cellFocused.set(true)" (focusout)="onFocusOut($event)">
              @for (row of rows(); track $index; let r = $index) {
                <tr>
                  @for (column of viewColumns(); track column.name; let c = $index) {
                    <!-- The CELL is the control, not a button inside it. A dense grid holds
                         rows times columns of these, and a focusable button in every one of
                         them would make Tab a journey rather than a way in. -->
                    <td class="mono text-xs whitespace-nowrap truncate cursor-default
                               focus:outline-none focus-visible:ring-2"
                        [style.width.px]="column.width"
                        [style.minWidth.px]="column.width"
                        [style.maxWidth.px]="column.maxWidth"
                        [attr.tabindex]="isFocused(r, c) ? 0 : -1"
                        [attr.data-cell]="r + '-' + c"
                        [title]="row[column.index] ?? 'null'"
                        (focus)="focusRow.set(r); focusCol.set(c)"
                        (keydown)="onCellKey($event, r, c)">
                      <span class="inline-flex items-center gap-1 max-w-full">
                        <!-- A null is not an empty string, and a reader has to be able to tell:
                             one means the file had no value, the other means it had a blank. -->
                        @if (row[column.index] === null) {
                          <span class="text-[color:var(--text-muted)] italic">null</span>
                        } @else {
                          <span class="truncate">{{ row[column.index] }}</span>
                        }
                        @if (cellFocused() && isFocused(r, c)) {
                          <!-- Shown on the FOCUSED cell rather than on hover: a control that
                               exists only under a pointer is unreachable by keyboard and
                               invisible on a touch screen. A tap focuses, then this appears. -->
                          <button type="button" tabindex="-1"
                                  class="shrink-0 p-0.5 rounded text-[color:var(--text-muted)]
                                         hover:text-[color:var(--accent-text)]"
                                  [attr.aria-label]="'Copy ' + column.name"
                                  title="Copy this cell (Enter, or Ctrl/Cmd + C)"
                                  (click)="copyAt(r, c)">
                            <app-icon [name]="isCopied(r, c) ? 'check' : 'copy'" size="0.8em"
                                      [class]="isCopied(r, c) ? 'icon-ok' : ''" />
                          </button>
                        }
                      </span>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (!rows().length) {
          <div class="px-6 py-12 text-center">
            @if (loading()) {
              <div class="spinner mx-auto mb-3" role="status" aria-label="Loading"></div>
              <p class="text-sm text-[color:var(--text-muted)]">{{ busyLabel() }}</p>
            } @else if (filtered()) {
              <app-icon name="search" size="1.75rem" class="icon-muted block mx-auto mb-3" />
              <p class="text-sm text-[color:var(--text-secondary)]">
                No rows match. The dataset itself is unchanged — this is the filter, not the file.
              </p>
              <button type="button" class="btn btn-default btn-sm mt-4" (click)="clearAll()">
                Clear the search and filters
              </button>
            } @else {
              <app-icon name="table" size="1.75rem" class="icon-muted block mx-auto mb-3" />
              <p class="text-sm text-[color:var(--text-secondary)]">This dataset has no rows.</p>
            }
          </div>
        }
      </div>

      <p class="text-[11px] text-[color:var(--text-muted)] leading-snug">
        Click a cell to select it, then Enter or Ctrl/Cmd + C to copy it. Arrow keys move,
        Home and End walk a row. Column widths and hidden columns are yours alone and are not
        part of the data.
        @if (activeFilters().length || filterRowOpen()) {
          Ranges, lists of values and AND/OR groups need the filter builder in the Canvas — a
          header cell cannot ask for a range without leaving half of it unwritten.
        }
      </p>
    </div>
  `,
})
export class DataGrid {
  /** The dataset's columns, in the order every row's cells are in. */
  readonly columns = input.required<GridColumn[]>();
  /** ONE PAGE of rows. Never the dataset, and never re-ordered here. */
  readonly rows = input.required<(string | null)[][]>();
  /** The sort the server is applying. Null is a real state: object storage has no row order. */
  readonly sort = input<GridSort | null>(null);
  readonly search = input('');

  /**
   * The filters the CALLER believes are applied, and the reason this is an input at all.
   *
   * sort and search were inputs and filters was not, so filter state lived only in this
   * component's private drafts — and the grid sits inside an @if on the Data tab, so any tab
   * switch destroyed it. The parent kept sending the filter to the server, the count kept
   * reading as narrowed, and the chip saying WHAT it was narrowed by vanished along with the
   * Clear button that would have removed it. The only escapes were retyping the filter in order
   * to delete it, or reopening the file.
   *
   * It also unblocks the two things that narrow the grid from OUTSIDE it — Quality drilling into
   * the records it complains about, and the Canvas cross-filtering the table — because both work
   * by the parent setting a filter this component has never emitted.
   */
  readonly filters = input<FilterClause[]>([]);
  readonly loading = input(false);
  /** The count of rows the current search and filters MATCH -- not the size of the dataset. */
  readonly totalRows = input(0);
  /** Whether `totalRows` is narrowed. When true the count is never printed on its own. */
  readonly filtered = input(false);

  /**
   * The unfiltered size of the dataset, when the caller knows it.
   *
   * Not part of the response -- the endpoint returns the filtered total and a `filtered` flag,
   * and from those two alone "1,204 of 250,000" cannot be written at all. A caller that held the
   * total before the filter went on passes it here; one that did not leaves it null and the grid
   * says "filtered" in words instead of inventing the second number.
   */
  readonly datasetRows = input<number | null>(null);

  /**
   * Distinct per dataset; omit to opt out of remembering widths and hidden columns.
   *
   * The same shape as ViewToggle's `key`, and for the same reason: two datasets do not share a
   * column layout, and a reader who narrows `description` on one file has said nothing about the
   * next one.
   */
  readonly storageKey = input('');

  /** The sort to ask the server for. Null means "drop the sort", which is a real request. */
  readonly sortChange = output<GridSort | null>();
  /** Free text matched against every TEXT column, server-side, over the whole dataset. */
  readonly searchChange = output<string>();
  /**
   * The complete set of column filters, as clauses.
   *
   * Clauses rather than wire objects: `clauseToWire` in analytics.service is the one place that
   * knows how an operand travels, and a second serialiser here would be the second guess at a
   * shape the contract does not spell out.
   */
  readonly filtersChange = output<FilterClause[]>();
  /** The names of the columns now hidden, in dataset order. Empty means all are shown. */
  readonly visibilityChange = output<string[]>();
  /** One column's new width, emitted when a drag ends rather than on every mouse move. */
  readonly widthChange = output<GridWidth>();
  /** A cell was copied. The clipboard write has already happened -- see GridCopy. */
  readonly copyCell = output<GridCopy>();

  protected readonly operators = GRID_OPERATORS;
  protected readonly minWidth = MIN_COLUMN_WIDTH;
  protected readonly maxWidth = MAX_COLUMN_WIDTH;

  private readonly host = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  /** Per-reader overrides. A name present here beats whatever the input said for that column. */
  private readonly widthOverrides = signal<Record<string, number | null>>({});
  private readonly hiddenOverrides = signal<Record<string, boolean>>({});

  /** One draft per column; the filter row edits these and complete ones become clauses. */
  private readonly drafts = signal<Record<string, { operator: FilterOperator; value: string }>>({});

  protected readonly searchDraft = signal('');
  protected readonly filterRowOpen = signal(false);
  protected readonly columnsPanelOpen = signal(false);
  protected readonly resizing = signal('');
  protected readonly focusRow = signal(0);
  protected readonly focusCol = signal(0);
  /**
   * Whether the focus is inside the rows at all.
   *
   * Separate from the roving index, which always names a cell so there is always exactly one
   * cell Tab can reach. Without this the very first cell would wear a copy glyph on load, before
   * anybody had touched the grid, and it would read as a control rather than as a value.
   */
  protected readonly cellFocused = signal(false);
  private readonly copiedRow = signal(-1);
  private readonly copiedCol = signal(-1);
  private readonly pending = signal<Pending>('');

  /** What we last handed out, so the echo of it does not overwrite what is being typed. */
  private lastSearchEmitted = '';
  /** The last filter set that crossed this boundary, in either direction. */
  private lastFiltersEmitted = '[]';
  private restoredKey = '';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // The stored layout is read once per key. An input, not a constructor read, because the key
    // arrives with the dataset and changes when the reader opens a different file.
    effect(() => {
      const key = this.storageKey();
      untracked(() => {
        if (!key || key === this.restoredKey) return;
        this.restoredKey = key;
        const saved = readLayout(key);
        this.widthOverrides.set(saved.widths);
        this.hiddenOverrides.set(saved.hidden);
      });
    });

    // The search box is a draft while it is being typed in and the input is the truth otherwise.
    // Without the guard, the caller storing what we emitted and handing it straight back would
    // reset the box mid-word on every round trip.
    effect(() => {
      const incoming = this.search();
      untracked(() => {
        if (incoming === this.lastSearchEmitted) return;
        this.lastSearchEmitted = incoming;
        this.searchDraft.set(incoming);
      });
    });

    // Filters follow the same rule as the search box: a draft while it is being edited here, and
    // the input's truth otherwise. Compared against what was last emitted so a caller echoing our
    // own filters back does not wipe a half-typed cell on every round trip.
    effect(() => {
      const incoming = this.filters();
      untracked(() => {
        const shape = JSON.stringify(incoming ?? []);
        if (shape === this.lastFiltersEmitted) return;
        this.lastFiltersEmitted = shape;
        const rebuilt: Record<string, { operator: FilterOperator; value: string }> = {};
        for (const clause of incoming ?? []) {
          rebuilt[clause.field] = { operator: clause.operator, value: clause.value ?? '' };
        }
        this.drafts.set(rebuilt);
      });
    });

    // A request has landed; the busy line stops naming one.
    effect(() => {
      const busy = this.loading();
      untracked(() => { if (!busy) this.pending.set(''); });
    });

    this.destroyRef.onDestroy(() => {
      if (this.searchTimer) clearTimeout(this.searchTimer);
      if (this.copiedTimer) clearTimeout(this.copiedTimer);
    });
  }

  // -- the column model -------------------------------------------------------------------

  /** Every column with the reader's overrides folded in. The panel lists these. */
  protected readonly allColumns = computed<GridColumn[]>(() => {
    const widths = this.widthOverrides();
    const hidden = this.hiddenOverrides();
    return this.columns().map(column => ({
      ...column,
      hidden: column.name in hidden ? hidden[column.name] : !!column.hidden,
      width: column.name in widths ? (widths[column.name] ?? undefined) : column.width,
    }));
  });

  protected readonly visibleColumns = computed(() => this.allColumns().filter(c => !c.hidden));
  protected readonly hiddenCount = computed(() =>
    this.allColumns().length - this.visibleColumns().length);

  /**
   * The per-column facts, precomputed.
   *
   * Each of these is derived from three things -- the column, the sort and the draft filter --
   * and working them out inside a binding would redo that once per cell on every change
   * detection pass, on a table that can be 200 columns wide.
   */
  protected readonly viewColumns = computed<GridColumnView[]>(() => {
    const sort = this.sort();
    const drafts = this.drafts();
    const widths = this.widthOverrides();
    const hidden = this.hiddenOverrides();
    const views: GridColumnView[] = [];
    this.columns().forEach((column, index) => {
      const isHidden = column.name in hidden ? hidden[column.name] : !!column.hidden;
      if (isHidden) return;
      const width = column.name in widths ? widths[column.name] : (column.width ?? null);
      const sorted = sort?.column === column.name;
      const draft = drafts[column.name];
      const operator = draft?.operator ?? defaultOperator(column.type);
      const operands = OPERAND_COUNT[operator];
      const value = draft?.value ?? '';
      views.push({
        name: column.name,
        type: column.type,
        index,
        width: width ?? null,
        maxWidth: width ?? DEFAULT_CELL_MAX,
        ariaSort: sorted ? (sort!.direction === 'ASC' ? 'ascending' : 'descending') : 'none',
        sorted,
        sortIcon: !sorted ? 'sort' : sort!.direction === 'ASC' ? 'arrowUp' : 'arrowDown',
        sortAction: sortActionFor(column.name, sorted ? sort!.direction : null),
        operator,
        needsValue: operands !== 0,
        value,
        filtering: operands === 0 || !!value.trim(),
        numeric: isNumericType(column.type),
      });
    });
    return views;
  });

  // -- what the server is being asked for -------------------------------------------------

  /**
   * The filters that are actually going to be sent.
   *
   * Only complete clauses: an operator that takes a value and has none is a predicate the reader
   * has started and not finished, and sending it would apply something nobody wrote to rows they
   * will then read as the whole answer. The chips show exactly this list, so what is on screen
   * and what is on the wire are the same thing.
   */
  protected readonly activeFilters = computed<FilterClause[]>(() => {
    const drafts = this.drafts();
    const clauses: FilterClause[] = [];
    for (const column of this.columns()) {
      const draft = drafts[column.name];
      if (!draft) continue;
      const operands = OPERAND_COUNT[draft.operator];
      if (operands === 0) {
        clauses.push({ field: column.name, operator: draft.operator });
      } else if (draft.value.trim()) {
        clauses.push({ field: column.name, operator: draft.operator, value: draft.value.trim() });
      }
    }
    return clauses;
  });

  /**
   * Whether Clear has anything to clear. The SORT is not counted: clearing it is a click on the
   * header that is already showing it, and a Clear that silently dropped the sort as well would
   * be one control doing two things.
   */
  protected readonly anythingActive = computed(() =>
    !!this.searchDraft().trim() || this.activeFilters().length > 0);

  /**
   * The headline count.
   *
   * Three numbers exist and only two of them are ever known at once: the rows on this page, the
   * rows that match, and the rows in the file. The rule is that a matching count is never printed
   * as though it were the size of the file.
   */
  protected readonly countLabel = computed(() => {
    const total = this.totalRows();
    const dataset = this.datasetRows();
    if (!this.filtered()) return `${total.toLocaleString()} rows`;
    if (dataset !== null && dataset >= total) {
      return `${total.toLocaleString()} of ${dataset.toLocaleString()} rows`;
    }
    return `${total.toLocaleString()} matching rows`;
  });

  protected readonly pageLabel = computed(() => {
    const shown = this.rows().length;
    const page = `${shown.toLocaleString()} on this page`;
    // Said in words when the second number is unavailable, so "matching rows" is never mistaken
    // for the size of the file just because no total came with it.
    if (this.filtered() && this.datasetRows() === null) return `${page} · filtered`;
    return page;
  });

  protected readonly busyLabel = computed(() => {
    switch (this.pending()) {
      case 'sort': return 'Sorting on the server, over every row in the dataset…';
      case 'search': return 'Searching every text column on the server…';
      case 'filter': return 'Filtering on the server, over every row in the dataset…';
      default: return 'Loading rows from the server…';
    }
  });

  protected readonly caption = computed(() => {
    const columns = this.visibleColumns().length;
    const hidden = this.hiddenCount();
    const hiddenNote = hidden ? `, ${hidden} hidden` : '';
    return `One page of dataset rows: ${this.rows().length} rows of ${columns} columns` +
      `${hiddenNote}. ${this.countLabel()}. Sorting, searching and filtering run on the server.`;
  });

  // -- sorting ----------------------------------------------------------------------------

  /**
   * ASC, then DESC, then no sort at all.
   *
   * The third state is not padding. A file in object storage has no order of its own, so "no
   * sort" is a real and different answer from either direction, and a two-state toggle would make
   * it unreachable once a column had been clicked.
   */
  toggleSort(column: string): void {
    const current = this.sort();
    let next: GridSort | null;
    if (!current || current.column !== column) next = { column, direction: 'ASC' };
    else if (current.direction === 'ASC') next = { column, direction: 'DESC' };
    else next = null;
    this.pending.set('sort');
    this.sortChange.emit(next);
  }

  // -- search -----------------------------------------------------------------------------

  onSearchInput(value: string): void {
    this.searchDraft.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      this.emitSearch();
    }, SEARCH_DEBOUNCE_MS);
  }

  /** Enter, or the native clear button: the reader has finished, so do not wait out the timer. */
  flushSearch(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.emitSearch();
  }

  private emitSearch(): void {
    const value = this.searchDraft().trim();
    // A repeat of what the server already has is a full scan of the dataset for no new answer.
    if (value === this.lastSearchEmitted) return;
    this.lastSearchEmitted = value;
    this.pending.set('search');
    this.searchChange.emit(value);
  }

  // -- filters ----------------------------------------------------------------------------

  setOperator(column: string, operator: FilterOperator): void {
    const previous = this.drafts()[column];
    const value = OPERAND_COUNT[operator] === 0 ? '' : (previous?.value ?? '');
    this.drafts.update(drafts => ({ ...drafts, [column]: { operator, value } }));
    this.emitFilters();
  }

  setValue(column: string, value: string): void {
    const operator = this.drafts()[column]?.operator ?? this.defaultOperatorFor(column);
    this.drafts.update(drafts => ({ ...drafts, [column]: { operator, value } }));
    this.emitFilters();
  }

  clearFilter(column: string): void {
    this.drafts.update(drafts => {
      const next = { ...drafts };
      delete next[column];
      return next;
    });
    this.emitFilters();
  }

  /** Everything the reader has narrowed with, dropped in one go. The sort is left alone. */
  clearAll(): void {
    // Emitted unconditionally rather than only when this instance is holding filters. The parent
    // may be holding some it set itself, or some this component emitted before a tab switch
    // recreated it — and guarding on our own view of them made Clear a no-op in exactly the case
    // where the reader most needed it.
    this.drafts.set({});
    this.searchDraft.set('');
    this.emitFilters();
    this.flushSearch();
  }

  private emitFilters(): void {
    this.pending.set('filter');
    this.filtersChange.emit(this.activeFilters());
  }

  private defaultOperatorFor(column: string): FilterOperator {
    return defaultOperator(this.columns().find(c => c.name === column)?.type);
  }

  protected describe(clause: FilterClause): string {
    const label = GRID_OPERATORS.find(o => o.id === clause.operator)?.label ?? clause.operator;
    if (OPERAND_COUNT[clause.operator] === 0) return `${clause.field} ${label}`;
    return `${clause.field} ${label} "${clause.value ?? ''}"`;
  }

  // -- column visibility -------------------------------------------------------------------

  toggleColumn(name: string): void {
    const column = this.allColumns().find(c => c.name === name);
    if (!column) return;
    const nextHidden = !column.hidden;
    // A grid with no columns is a blank box that looks like a failure to load.
    if (nextHidden && this.visibleColumns().length <= 1) return;
    this.hiddenOverrides.update(map => ({ ...map, [name]: nextHidden }));
    this.afterVisibilityChange();
  }

  showAllColumns(): void {
    const cleared: Record<string, boolean> = {};
    for (const column of this.columns()) cleared[column.name] = false;
    this.hiddenOverrides.set(cleared);
    this.afterVisibilityChange();
  }

  private afterVisibilityChange(): void {
    this.persist();
    this.visibilityChange.emit(this.allColumns().filter(c => c.hidden).map(c => c.name));
    // A hidden column shifts every column to its right, so a stale focus column would land on a
    // different value than the one the reader was looking at.
    this.focusCol.set(Math.min(this.focusCol(), Math.max(0, this.visibleColumns().length - 1)));
  }

  // -- column width -------------------------------------------------------------------------

  /**
   * A drag. The width is applied live and emitted ONCE, when the mouse comes up.
   *
   * Emitting per mousemove would fire dozens of events across one gesture, and a caller that
   * persists them -- which is the only reason to listen -- would write the same preference forty
   * times to land on the value the reader stopped at.
   */
  startResize(event: MouseEvent, column: string): void {
    event.preventDefault();
    const startX = event.clientX;
    const header = (event.target as HTMLElement).closest('th');
    const current = this.effectiveWidth(column);
    const startWidth = current ?? Math.round(header?.getBoundingClientRect().width ?? 160);

    const move = (moved: MouseEvent) =>
      this.applyWidth(column, startWidth + (moved.clientX - startX));
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      this.resizing.set('');
      this.widthChange.emit({ column, width: this.effectiveWidth(column) });
      this.persist();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    this.resizing.set(column);
  }

  /** Arrow keys size the column; delete hands it back to automatic sizing. */
  onResizeKey(event: KeyboardEvent, column: string): void {
    const step = event.shiftKey ? RESIZE_STEP_LARGE : RESIZE_STEP;
    const current = this.effectiveWidth(column) ?? DEFAULT_CELL_MAX;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.commitWidth(column, current - step);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.commitWidth(column, current + step);
    } else if (event.key === 'Delete' || event.key === 'Backspace' || event.key === 'Home') {
      event.preventDefault();
      this.resetWidth(column);
    }
  }

  resetWidth(column: string): void {
    this.widthOverrides.update(map => ({ ...map, [column]: null }));
    this.persist();
    this.widthChange.emit({ column, width: null });
  }

  private commitWidth(column: string, width: number): void {
    this.applyWidth(column, width);
    this.widthChange.emit({ column, width: this.effectiveWidth(column) });
    this.persist();
  }

  private applyWidth(column: string, width: number): void {
    const clamped = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(width)));
    this.widthOverrides.update(map => ({ ...map, [column]: clamped }));
  }

  private effectiveWidth(column: string): number | null {
    const overrides = this.widthOverrides();
    if (column in overrides) return overrides[column];
    return this.columns().find(c => c.name === column)?.width ?? null;
  }

  // -- cells: focus and copy ------------------------------------------------------------------

  protected isFocused(row: number, col: number): boolean {
    return this.focusRow() === row && this.focusCol() === col;
  }

  protected isCopied(row: number, col: number): boolean {
    return this.copiedRow() === row && this.copiedCol() === col;
  }

  /**
   * Focus left the rows -- unless it landed on another one of them.
   *
   * Arrowing from cell to cell fires focusout before focusin, so without the relatedTarget check
   * the copy glyph would blink out and back on every keystroke.
   */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && (this.host.nativeElement as HTMLElement).contains(next)) return;
    this.cellFocused.set(false);
  }

  /**
   * Arrow-key movement over the cells, with copy on the focused one.
   *
   * The element is focused directly rather than waiting for the tabindex binding to be rewritten
   * by change detection: the cell already exists in the DOM, and `.focus()` works on a
   * tabindex="-1" element, so the move happens in the same tick as the keystroke.
   */
  onCellKey(event: KeyboardEvent, row: number, col: number): void {
    const lastRow = this.rows().length - 1;
    const lastCol = this.viewColumns().length - 1;
    const key = event.key;
    const jump = event.ctrlKey || event.metaKey;

    if (key === 'c' || key === 'C') {
      if (!jump) return;
      event.preventDefault();
      void this.copyAt(row, col);
      return;
    }
    if (key === 'Enter') {
      event.preventDefault();
      void this.copyAt(row, col);
      return;
    }

    let nextRow = row;
    let nextCol = col;
    switch (key) {
      case 'ArrowRight': nextCol = Math.min(lastCol, col + 1); break;
      case 'ArrowLeft':  nextCol = Math.max(0, col - 1); break;
      case 'ArrowDown':  nextRow = Math.min(lastRow, row + 1); break;
      case 'ArrowUp':    nextRow = Math.max(0, row - 1); break;
      case 'PageDown':   nextRow = Math.min(lastRow, row + 10); break;
      case 'PageUp':     nextRow = Math.max(0, row - 10); break;
      case 'Home':
        nextCol = 0;
        if (jump) nextRow = 0;
        break;
      case 'End':
        nextCol = lastCol;
        if (jump) nextRow = lastRow;
        break;
      default: return;
    }
    event.preventDefault();
    this.moveFocus(nextRow, nextCol);
  }

  private moveFocus(row: number, col: number): void {
    this.focusRow.set(row);
    this.focusCol.set(col);
    const element = (this.host.nativeElement as HTMLElement)
      .querySelector<HTMLElement>(`[data-cell="${row}-${col}"]`);
    element?.focus();
  }

  /**
   * Copies a cell, and reports whether the clipboard actually took it.
   *
   * The grid does the write itself, which is the opposite of CopyButton's rule that the caller
   * owns it. The reason is the count: a screen has one address to copy and a grid has rows times
   * columns of them, so "which cell is showing a tick" is grid-local state that a parent would
   * only be storing on the grid's behalf.
   *
   * A null cell copies the empty string. There is no text in it, and putting the word "null" on
   * the clipboard would paste a value the file does not contain.
   */
  async copyAt(row: number, col: number): Promise<void> {
    const column = this.viewColumns()[col];
    if (!column) return;
    const value = this.rows()[row]?.[column.index] ?? null;
    const copied = await copyText(value ?? '');
    if (copied) {
      this.copiedRow.set(row);
      this.copiedCol.set(col);
      if (this.copiedTimer) clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => {
        this.copiedTimer = null;
        this.copiedRow.set(-1);
        this.copiedCol.set(-1);
      }, COPIED_MS);
    }
    this.copyCell.emit({ row, column: column.name, value, copied });
  }

  // -- persistence ----------------------------------------------------------------------------

  private persist(): void {
    const key = this.storageKey();
    if (!key) return;
    const widths: Record<string, number> = {};
    for (const [name, width] of Object.entries(this.widthOverrides())) {
      if (typeof width === 'number') widths[name] = width;
    }
    const hidden: Record<string, boolean> = {};
    for (const [name, isHidden] of Object.entries(this.hiddenOverrides())) {
      if (isHidden) hidden[name] = true;
    }
    writeLayout(key, { widths, hidden });
  }
}

/**
 * The operator a column starts on.
 *
 * CONTAINS for text because a reader typing into a text column is looking for a substring, and
 * EQ for numbers and dates because a reader typing into one of those has a value in mind. Neither
 * is a claim about the data: both are changeable in the same control they appear in.
 */
function defaultOperator(type: string | undefined): FilterOperator {
  if (isNumericType(type) || isDateType(type)) return 'EQ';
  return 'CONTAINS';
}

/** The accessible name of a sort button: what pressing it will do, not what it already did. */
function sortActionFor(column: string, direction: 'ASC' | 'DESC' | null): string {
  if (direction === null) return `Sort by ${column}, ascending, on the server`;
  if (direction === 'ASC') return `Sorted by ${column} ascending — sort descending instead`;
  return `Sorted by ${column} descending — remove the sort`;
}

interface StoredLayout {
  widths: Record<string, number | null>;
  hidden: Record<string, boolean>;
}

/**
 * Storage throws outright in a private window and when the quota is gone -- the accessor itself,
 * not the read -- so every touch is wrapped. A column layout is not worth a blank screen, and a
 * first visit legitimately has nothing stored, so "nothing came back" is the normal path rather
 * than the error one.
 */
function readLayout(key: string): StoredLayout {
  const empty: StoredLayout = { widths: {}, hidden: {} };
  try {
    const raw = localStorage.getItem(STORE_PREFIX + key);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<StoredLayout>;
    return {
      widths: isRecord(parsed.widths) ? parsed.widths as Record<string, number> : {},
      hidden: isRecord(parsed.hidden) ? parsed.hidden as Record<string, boolean> : {},
    };
  } catch {
    // Unreadable or written by an older shape. Starting from the dataset's own layout is right.
    return empty;
  }
}

function writeLayout(key: string, layout: StoredLayout): void {
  try {
    localStorage.setItem(STORE_PREFIX + key, JSON.stringify(layout));
  } catch {
    /* the layout simply is not remembered */
  }
}

function isRecord(value: unknown): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
