import { Component, ChangeDetectionStrategy, inject, input } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { readableCell } from '../../shared/charts/number-format';

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
  template: `
    <div class="overflow-x-auto">
      <table class="w-full text-xs">
        <thead>
          <tr class="text-left text-[color:var(--text-muted)]">
            @for (column of columns(); track column) {
              <th class="px-2 py-1 font-medium whitespace-nowrap">{{ column }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track $index) {
            <tr class="border-t border-subtle">
              @for (cell of row; track $index) {
                <td class="px-2 py-1 whitespace-nowrap tabular">
                  @if (cell === null) {
                    <!-- A real null, which is not an empty string and is certainly not a zero. -->
                    <span class="text-[color:var(--text-muted)]" title="null">—</span>
                  } @else {
                    <!-- Formatted for reading, with the raw value one hover away. A revenue tile
                         read "103909527.57999787" before this: seventeen significant figures, the
                         last eight of them an artefact of the CSV reader typing money as DOUBLE.
                         Rounding it in the title as well would hide that from anyone reconciling
                         against another system, which is the one job that needs the unrounded
                         number. -->
                    <span [title]="cell">{{ readable(cell, measureColumn()[$index]) }}</span>
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
  imports: [WidgetTable],
  template: `
    <div class="card shadow-2xl w-[60rem] max-w-[calc(100vw-2rem)] overflow-hidden flex flex-col">
      <div class="px-5 pt-4 pb-3 flex items-baseline gap-3">
        <h2 class="text-base font-semibold truncate">{{ data.title }}</h2>
        <span class="text-xs text-[color:var(--text-muted)] ml-auto whitespace-nowrap">
          {{ shown() }}
        </span>
      </div>

      @if (data.truncated) {
        <p class="text-xs text-crit-500 px-5 pb-2">
          Partial result — this stopped at the server's row ceiling.
        </p>
      }
      @for (note of data.notes; track note) {
        <p class="field-note text-[color:var(--text-muted)] px-5 pb-1">{{ note }}</p>
      }

      <!-- Scrolls inside the dialog, so the header and the caveats above stay put while a
           thousand rows go past under them. -->
      <div class="px-5 pb-2 overflow-auto max-h-[calc(100dvh-16rem)]">
        <app-widget-table [columns]="data.columns" [rows]="data.rows"
                          [measureColumn]="data.measureColumn" />
      </div>

      <div class="flex justify-end gap-2 px-5 py-3 border-t border-subtle">
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close()" cdkFocusInitial>
          Close
        </button>
      </div>
    </div>
  `,
})
export class WidgetTableDialog {
  readonly ref = inject<DialogRef<void>>(DialogRef);
  readonly data = inject<WidgetTableData>(DIALOG_DATA);

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
