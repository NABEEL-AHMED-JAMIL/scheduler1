import { Component, ChangeDetectionStrategy, inject, input, signal } from '@angular/core';
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
  `,
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
  protected readonly wrappedLines = WRAPPED_LINES;

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
      <app-widget-table [columns]="data.columns" [rows]="data.rows"
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
