import { Component, computed, input, output } from '@angular/core';

export interface RankedItem {
  name: string;
  value: number;
  /** Shown instead of the raw number when the value is a size, duration, etc. */
  display?: string;
  color?: string;
  key?: string;
}

/**
 * Horizontal bars, longest first.
 *
 * The old screens drew this data as pie charts. A pie can carry three or four slices; past
 * that the wedges stop being comparable and the legend does the real work. Ranked bars stay
 * readable at a dozen rows, keep a deliberate order when one exists (age buckets run oldest
 * to newest, not largest to smallest), and leave room for the value to be written out.
 */
@Component({
  selector: 'app-ranked-bar',
  template: `
    @if (rows().length) {
      <ul class="space-y-2">
        @for (row of rows(); track row.name) {
          <li>
            <button type="button" class="w-full text-left group"
                    [class.cursor-default]="!clickable()"
                    [disabled]="!clickable()"
                    (click)="picked.emit(row)">
              <span class="flex items-baseline gap-2 text-xs">
                <span class="truncate" [title]="row.name">{{ row.name }}</span>
                <span class="ml-auto tabular font-medium shrink-0">{{ row.display || row.value }}</span>
                @if (showPercent()) {
                  <span class="tabular text-[color:var(--text-muted)] w-9 text-right shrink-0">
                    {{ row.percent }}%
                  </span>
                }
              </span>
              <span class="mt-1 block h-2 rounded-full overflow-hidden"
                    style="background: var(--surface-sunken);">
                <span class="block h-full rounded-full transition-[width] duration-300"
                      [style.width.%]="row.width"
                      [style.background]="row.color"
                      [class.group-hover:brightness-110]="clickable()"></span>
              </span>
            </button>
          </li>
        }
      </ul>
    } @else {
      <p class="text-sm text-[color:var(--text-muted)] py-8 text-center">Nothing to show yet.</p>
    }
  `,
})
export class RankedBar {
  readonly data = input.required<RankedItem[]>();
  /** Off when the order carries meaning of its own, such as age buckets. */
  readonly sorted = input(true);
  readonly max = input(8);
  readonly showPercent = input(true);
  readonly clickable = input(false);
  /**
   * Formats the rolled-up "Other" row. Without it that row falls back to the raw number
   * while every row above it is formatted -- a byte count next to a list of "8.8 MB".
   */
  readonly formatValue = input<((value: number) => string) | null>(null);
  readonly picked = output<RankedItem>();

  private readonly palette = ['var(--chart-0)', 'var(--chart-1)', 'var(--chart-2)',
                              'var(--chart-3)', 'var(--chart-5)', 'var(--chart-4)'];

  readonly rows = computed(() => {
    const source = this.data().filter(d => (d.value ?? 0) > 0);
    if (!source.length) return [];

    const ordered = this.sorted() ? [...source].sort((a, b) => b.value - a.value) : source;
    const limit = this.max();
    const head = ordered.slice(0, limit);
    const tail = ordered.slice(limit);

    const shown = [...head];
    if (tail.length) {
      const rolled = tail.reduce((sum, d) => sum + d.value, 0);
      const format = this.formatValue();
      shown.push({
        name: `Other (${tail.length})`,
        value: rolled,
        display: format ? format(rolled) : undefined,
        color: 'var(--text-muted)',
      });
    }

    const total = source.reduce((sum, d) => sum + d.value, 0);
    // Bars are scaled against the largest row, not the total: against the total a long tail
    // of small values collapses into invisible slivers.
    const largest = Math.max(...shown.map(d => d.value), 1);

    return shown.map((row, index) => ({
      ...row,
      percent: Math.round((row.value / total) * 100),
      width: Math.max(2, (row.value / largest) * 100),
      color: row.color ?? this.palette[index % this.palette.length],
    }));
  });
}
