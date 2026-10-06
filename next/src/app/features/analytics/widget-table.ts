import { Component, ChangeDetectionStrategy, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { readableCell } from '../../shared/charts/number-format';
import { FormDialog } from '../../shared/ui/form-dialog';
import { DataText } from '../../shared/ui/data-text';
import { WrapToggle } from '../../shared/ui/wrap-toggle';
import { readWrap, writeWrap } from './data-grid';

/**
 * How many lines of a value a result table shows with "Wrap text" on. Not all of it, as the Data
 * grid does: a 20,000-character note wrapped whole is a row five hundred lines tall, and "Show all"
 * already opens the whole value beside the table.
 */
export const WRAPPED_LINES = 8;

/** Past this many rows the expanded view draws only the rows on screen (and a screen either side). */
export const VIRTUAL_FROM = 200;
/** A row's height before one has been measured: one line of 12px type and the table's padding. */
const ROW_PX = 37;
/** Rows drawn beyond the visible ones, above and below, so a fast scroll does not show blank. */
const OVERSCAN = 20;

/**
 * Each column's width, in ch, from its header and a sample of its cells: wide enough for a date-time
 * or an id to stand whole, never so wide one long note takes the table. Fixed widths are what keep a
 * windowed table steady -- with automatic layout every scroll re-measured the columns and they jumped.
 */
export function columnWidths(columns: string[], rows: (string | null)[][], wrap = false): number[] {
  const step = Math.max(1, Math.floor(rows.length / 2000));
  return columns.map((column, at) => {
    let longest = column.length;
    for (let i = 0; i < rows.length; i += step) longest = Math.max(longest, (rows[i][at] ?? '—').length);
    return Math.min(wrap ? 48 : 36, Math.max(8, longest + 1)) + 4;
  });
}

/** Where a result table's "Wrap text" is remembered; see readWrap in data-grid.ts. */
export const WIDGET_TABLE_WRAP_KEY = 'result:widget-table';

/**
 * The rows of a result, drawn the same way on a tile and in the expanded view.
 *
 * Extracted rather than copied. The tile shows the first few rows and the dialog shows all of
 * them, and those were the only two differences -- a second copy of this markup would have been
 * the place where a null started rendering as an empty cell in one of them and nobody noticed.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-widget-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataText],
  template: `
    @if (windowed()) {
      <!-- Every row of a long result, drawn a screen at a time: the header stays put, the columns keep
           their widths, and ten thousand rows open as fast as ten (owner review, 2026-10-06). -->
      <div #scroller class="vt-scroller" data-scroller (scroll)="scrolled()" tabindex="0" role="region"
           [attr.aria-label]="'Rows ' + (first() + 1) + ' to ' + last() + ' of ' + rows().length">
        <table class="table-modern vt-table" [style.width.rem]="totalWidth()" [attr.aria-rowcount]="rows().length + 1">
          <colgroup>@for (width of widths(); track $index) { <col [style.width.rem]="width" /> }</colgroup>
          <thead>
            <tr aria-rowindex="1">
              @for (column of columns(); track column) { <th class="vt-head" [title]="column">{{ column }}</th> }
            </tr>
          </thead>
          <tbody>
            @if (padTop()) { <tr aria-hidden="true" class="vt-pad"><td [attr.colspan]="columns().length" [style.height.px]="padTop()"></td></tr> }
            @for (row of shown(); track first() + $index; let i = $index) {
              <tr [attr.aria-rowindex]="first() + i + 2">
                @for (cell of row; track $index) {
                  <td class="tabular align-top">
                    @if (cell === null) { <span class="text-[color:var(--text-muted)]" title="null">—</span> } @else {
                      <app-data-text class="min-w-0" [value]="readable(cell, measureColumn()[$index])"
                                     [hint]="cell" [lines]="wrap() ? wrappedLines : 1" [label]="columns()[$index]" />
                    }
                  </td>
                }
              </tr>
            }
            @if (padBottom()) { <tr aria-hidden="true" class="vt-pad"><td [attr.colspan]="columns().length" [style.height.px]="padBottom()"></td></tr> }
          </tbody>
        </table>
      </div>
    } @else {
    <div class="overflow-x-auto">
      <table class="table-modern">
        <thead>
          <tr>
            @for (column of columns(); track column) {
              <th class="whitespace-nowrap">{{ column }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track $index) {
            <tr>
              @for (cell of row; track $index) {
                <td class="tabular align-top">
                  @if (cell === null) {
                    <!-- A real null, which is not an empty string and is certainly not a zero. -->
                    <span class="text-[color:var(--text-muted)]" title="null">—</span>
                  } @else {
                    <!-- Formatted for reading, with the raw value one hover away. A revenue tile
                         read "103909527.57999787" before this: seventeen significant figures, the
                         last eight of them an artefact of the CSV reader typing money as DOUBLE.
                         Rounding it in the title as well would hide that from anyone reconciling
                         against another system, which is the one job that needs the unrounded
                         number.
                         A value can also be a 20,000-character note (owner, 2026-09-28), so it is
                         data text: one line capped at 24rem, the whole of it behind "Show all". The
                         cap is what keeps one long column from taking every other column's width, and the
                         floor what keeps a squeezed column readable: a value that may wrap anywhere
                         could otherwise be narrowed to one letter when the table outgrows its box. -->
                    <app-data-text [class]="wrap() ? 'min-w-24 max-w-xl' : 'min-w-24 max-w-sm'" [value]="readable(cell, measureColumn()[$index])"
                                   [hint]="cell" [lines]="wrap() ? wrappedLines : 1"
                                   [label]="columns()[$index]" />
                  }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
    }
  `,
  styles: [`
    .vt-scroller { max-height: calc(100vh - 17rem); min-height: 12rem; overflow: auto; overscroll-behavior: contain; }
    .vt-table { table-layout: fixed; min-width: 100%; }
    .vt-table thead th { position: sticky; top: 0; z-index: 1; background: var(--surface-raised);
      overflow: hidden; text-overflow: ellipsis; }
    .vt-pad td { padding: 0; border: 0; }
  `],
})
export class WidgetTable {
  readonly columns = input<string[]>([]);
  readonly rows = input<(string | null)[][]>([]);
  /**
   * Which columns hold figures, index-aligned with columns().
   *
   * A dimension must not be formatted: readableCell turns the year 2024 into "2,024". An absent
   * entry is treated as a figure, which is what the saved-query path wants -- it has no column
   * roles to read and says so.
   */
  readonly measureColumn = input<boolean[]>([]);
  /** Several lines of each value rather than one: the "Wrap text" switch, where the host has one. */
  readonly wrap = input(false);
  /** Draw only the rows on screen once there are more than VIRTUAL_FROM: the expanded view sets it. */
  readonly virtual = input(false);
  protected readonly wrappedLines = WRAPPED_LINES;

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly top = signal(0);
  private readonly viewport = signal(600);
  /** The average drawn row height, measured as rows are drawn: a wrapped row is taller. */
  private readonly rowPx = signal(ROW_PX);

  protected readonly windowed = computed(() => this.virtual() && this.rows().length > VIRTUAL_FROM);
  /** In rem: a character of the table's 12px type is about half a rem wide. */
  protected readonly widths = computed(() => columnWidths(this.columns(), this.rows(), this.wrap()).map(ch => ch / 2));
  protected readonly totalWidth = computed(() => this.widths().reduce((sum, w) => sum + w, 0));
  protected readonly first = computed(() => Math.max(0, Math.floor(this.top() / this.rowPx()) - OVERSCAN));
  protected readonly last = computed(() =>
    Math.min(this.rows().length, Math.ceil((this.top() + this.viewport()) / this.rowPx()) + OVERSCAN));
  protected readonly shown = computed(() => this.rows().slice(this.first(), this.last()));
  protected readonly padTop = computed(() => this.first() * this.rowPx());
  protected readonly padBottom = computed(() => (this.rows().length - this.last()) * this.rowPx());

  protected scrolled(): void {
    const box = this.scroller()?.nativeElement;
    if (!box) return;
    this.viewport.set(box.clientHeight || 600);
    const drawn = box.querySelectorAll('tbody tr:not(.vt-pad)');
    if (drawn.length) {
      const height = Array.from(drawn).reduce((sum, row) => sum + (row as HTMLElement).offsetHeight, 0) / drawn.length;
      if (height > 8 && Math.abs(height - this.rowPx()) > 1) this.rowPx.set(height);
    }
    this.top.set(box.scrollTop);
  }

  protected readable(cell: string, isMeasure: boolean | undefined): string {
    return isMeasure === false ? cell : readableCell(cell);
  }
}

/** What the expanded view needs. All of it is already in hand; nothing here is re-queried. */
export interface WidgetTableData {
  title: string;
  columns: string[];
  rows: (string | null)[][];
  measureColumn: boolean[];
  /** The whole result's count, which is not rows.length when the server cut the result short. */
  rowCount: number;
  /** True when the server stopped at its row ceiling. */
  truncated: boolean;
  /** Everything the tile said under itself -- a Top-N trim, a roll-up, a pivot cut. */
  notes: string[];
}

/**
 * Every row of a result the tile could only show the first few of.
 *
 * READS WHAT IS ALREADY IN MEMORY. A widget holds a reference and never a result, and that rule
 * is not weakened here: the rows shown came back with the run that drew the tile, they live in
 * the open board's run state, and they die with it. No AnalysisRequest is issued, no permit is
 * taken from the four the whole application shares, and nothing is written to the widget row.
 *
 * The partial-result banner and the tile's notes are repeated rather than dropped. An expanded
 * table is the one place in the product where a truncated result would otherwise look complete,
 * because it presents itself as "all of it".
 */
@Component({
  selector: 'app-widget-table-dialog',
  imports: [WidgetTable, FormDialog, WrapToggle],
  template: `
    <!-- The shared shell: header, scrolling body, and a footer that is the dismissal alone. -->
    <app-form-dialog [heading]="data.title" [subtitle]="shown()" size="xwide"
                     [showConfirm]="false" cancelLabel="Close" (cancelled)="ref.close()">
      @if (data.truncated) {
        <!-- A warning, as the Studio says it: part of the answer, not a failure. -->
        <p class="pb-2"><span class="pill pill-warn">Partial result — stopped at the server's row ceiling</span></p>
      }
      @for (note of data.notes; track note) {
        <p class="field-note text-[color:var(--text-muted)] pb-1">{{ note }}</p>
      }
      <!-- The Data grid's switch, remembered the same way. Here rather than on the tile: a tile is
           a few rows at a glance, and this is where a table is read. -->
      <div class="flex justify-end pb-2">
        <app-wrap-toggle [on]="wrap()" (toggled)="setWrap($event)" />
      </div>
      <app-widget-table [virtual]="true" [columns]="data.columns" [rows]="data.rows"
                        [measureColumn]="data.measureColumn" [wrap]="wrap()" />
    </app-form-dialog>
  `,
})
export class WidgetTableDialog {
  readonly ref = inject<DialogRef<void>>(DialogRef);
  readonly data = inject<WidgetTableData>(DIALOG_DATA);
  protected readonly wrap = signal(readWrap(WIDGET_TABLE_WRAP_KEY));

  protected setWrap(on: boolean): void {
    this.wrap.set(on);
    writeWrap(WIDGET_TABLE_WRAP_KEY, on);
  }

  /**
   * How much of the result this is.
   *
   * Says "all N rows" only when it really is all of them: a result the server cut short is still
   * partial here however far the reader scrolls.
   */
  protected shown(): string {
    const here = this.data.rows.length;
    const total = this.data.rowCount;
    if (here < total) return `${here.toLocaleString()} of ${total.toLocaleString()} rows`;
    return `${total.toLocaleString()} ${total === 1 ? 'row' : 'rows'}`;
  }
}
