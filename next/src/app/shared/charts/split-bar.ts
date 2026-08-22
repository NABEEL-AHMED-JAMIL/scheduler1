import { Component, computed, input } from '@angular/core';

export interface SplitRow {
  label: string;
  /** Left-hand share: ran, succeeded, enabled. */
  positive: number;
  /** Right-hand share: skipped, failed, disabled. */
  negative: number;
}

/**
 * One bar per row, split between two opposed outcomes.
 *
 * Used where a set of flags each have a true and a false count -- ran/skipped, queued/not.
 * A stacked bar reads better than two pies side by side because the comparison is between
 * rows, and a shared baseline is what makes rows comparable.
 */
@Component({
  selector: 'app-split-bar',
  template: `
    @if (rows().length) {
      <div>
        <ul class="space-y-2.5">
          @for (row of rows(); track row.label) {
            <li>
              <div class="flex items-baseline gap-2 text-xs">
                <span class="truncate">{{ row.label }}</span>
                <span class="ml-auto tabular text-[color:var(--text-muted)]">
                  {{ row.total }} total
                </span>
              </div>
              <div class="mt-1 flex h-2.5 rounded-full overflow-hidden"
                   style="background: var(--surface-sunken);"
                   [title]="row.label + ': ' + row.positive + ' ' + positiveLabel()
                            + ', ' + row.negative + ' ' + negativeLabel()">
                @if (row.positive) {
                  <span class="h-full" [style.width.%]="row.positiveWidth"
                        style="background: var(--color-ok-500);"></span>
                }
                @if (row.negative) {
                  <span class="h-full" [style.width.%]="row.negativeWidth"
                        style="background: var(--color-crit-500);"></span>
                }
              </div>
              <div class="mt-1 flex gap-3 text-[11px] text-[color:var(--text-muted)]">
                <span class="tabular">{{ row.positive }} {{ positiveLabel() }}</span>
                <span class="tabular">{{ row.negative }} {{ negativeLabel() }}</span>
              </div>
            </li>
          }
        </ul>

        <div class="mt-3 flex items-center gap-4 text-[11px] text-[color:var(--text-muted)]">
          <span class="flex items-center gap-1.5">
            <span class="size-2.5 rounded-full" style="background: var(--color-ok-500);"></span>
            {{ positiveLabel() }}
          </span>
          <span class="flex items-center gap-1.5">
            <span class="size-2.5 rounded-full" style="background: var(--color-crit-500);"></span>
            {{ negativeLabel() }}
          </span>
        </div>
      </div>
    } @else {
      <p class="text-sm text-[color:var(--text-muted)] py-8 text-center">Nothing to show yet.</p>
    }
  `,
})
export class SplitBar {
  readonly data = input.required<SplitRow[]>();
  readonly positiveLabel = input('yes');
  readonly negativeLabel = input('no');

  readonly rows = computed(() =>
    this.data()
      .map(row => {
        const total = (row.positive ?? 0) + (row.negative ?? 0);
        return {
          ...row,
          total,
          positiveWidth: total ? (row.positive / total) * 100 : 0,
          negativeWidth: total ? (row.negative / total) * 100 : 0,
        };
      })
      .filter(row => row.total > 0));
}
