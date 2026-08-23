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
        <ul class="space-y-1.5">
          @for (row of rows(); track row.label) {
            <li [title]="row.label + ': ' + row.positive + ' ' + positiveLabel()
                         + ', ' + row.negative + ' ' + negativeLabel()">
              <div class="flex items-center gap-2 text-[11px] leading-none">
                <span class="truncate text-[color:var(--text-secondary)]">{{ row.label }}</span>
                <span class="ml-auto tabular font-medium shrink-0">{{ row.positive }}</span>
                <span class="tabular text-[color:var(--text-muted)] shrink-0">/ {{ row.negative }}</span>
              </div>
              <div class="mt-1 flex h-1.5 rounded-full overflow-hidden"
                   style="background: var(--surface-sunken);">
                @if (row.positive) {
                  <span class="h-full" [style.width.%]="row.positiveWidth"
                        style="background: var(--color-ok-500);"></span>
                }
                @if (row.negative) {
                  <span class="h-full" [style.width.%]="row.negativeWidth"
                        style="background: var(--color-crit-500);"></span>
                }
              </div>
            </li>
          }
        </ul>

        <div class="mt-2 flex items-center gap-3 text-[10px] text-[color:var(--text-muted)]">
          <span class="flex items-center gap-1">
            <span class="size-2 rounded-full" style="background: var(--color-ok-500);"></span>
            {{ positiveLabel() }}
          </span>
          <span class="flex items-center gap-1">
            <span class="size-2 rounded-full" style="background: var(--color-crit-500);"></span>
            {{ negativeLabel() }}
          </span>
        </div>
      </div>
    } @else {
      <p class="text-xs text-[color:var(--text-muted)] py-5 text-center">Nothing to show yet.</p>
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
