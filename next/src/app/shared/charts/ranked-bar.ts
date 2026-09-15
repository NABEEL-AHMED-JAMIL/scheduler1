import { Component, computed, input, output } from '@angular/core';
import { CHART_SLOTS, chartColor } from './status-color';

export interface RankedItem {
  name: string;
  value: number;
  /** Shown instead of the raw number when the value is a size, duration, etc. */
  display?: string;
  color?: string;
  key?: string;
  /**
   * This row alone does not respond to a click, on a chart where the others do.
   *
   * For the row that is not a category: a rolled-up "Other", a bucket two rows were merged into.
   * Making the WHOLE chart inert because one row is would take the feature away from every Top-N
   * result, which is most of them; letting that row through would act on a value the data does
   * not contain. The caller says which rows those are and why, on the tile.
   */
  inert?: boolean;
}

/**
 * Horizontal bars, longest first.
 *
 * Kept deliberately dense: label, value and bar share one 22px row, so eight categories fit
 * in the height a table gives four. A chart beside a table should not be taller than the
 * data it summarises.
 */
@Component({
  selector: 'app-ranked-bar',
  template: `
    @if (rows().length) {
      <ul class="space-y-1.5">
        @for (row of rows(); track row.name) {
          <li>
            <button type="button" class="w-full text-left group block"
                    [class.cursor-default]="!clickable() || row.inert"
                    [disabled]="!clickable() || !!row.inert"
                    [title]="row.name + ': ' + (row.display || row.value)"
                    (click)="picked.emit(row)">
              <span class="flex items-center gap-2 text-[11px] leading-none">
                <span class="truncate text-[color:var(--text-secondary)]">{{ row.name }}</span>
                <span class="ml-auto tabular font-medium shrink-0">{{ row.display || row.value }}</span>
                @if (showPercent()) {
                  <span class="tabular text-[color:var(--text-muted)] w-8 text-right shrink-0">
                    {{ row.percent }}%
                  </span>
                }
              </span>
              <span class="mt-1 block h-1.5 rounded-full overflow-hidden bg-sunken"
                   >
                <span class="block h-full rounded-full transition-[width] duration-300"
                      [style.width.%]="row.width"
                      [style.background]="row.color"
                      [class.group-hover:brightness-110]="clickable() && !row.inert"></span>
              </span>
            </button>
          </li>
        }
      </ul>
    } @else {
      <p class="text-xs text-[color:var(--text-muted)] py-5 text-center">Nothing to show yet.</p>
    }
  `,
})
export class RankedBar {
  readonly data = input.required<RankedItem[]>();
  /** Off when the order carries meaning of its own, such as age buckets. */
  readonly sorted = input(true);
  readonly max = input(6);
  readonly showPercent = input(true);
  readonly clickable = input(false);
  /** Formats the rolled-up "Other" row so it matches the rows it summarises. */
  readonly formatValue = input<((value: number) => string) | null>(null);
  readonly picked = output<RankedItem>();

  /* Built from the palette rather than hand-listed, so a colour added to styles.css is drawn
     here without anyone remembering to extend an array. The old list also skipped a slot --
     it ran 0,1,2,3,5,4 -- so two neighbouring bars were the two closest hues in the ramp. */
  private readonly palette = Array.from({ length: CHART_SLOTS }, (_, slot) => chartColor(slot));

  readonly rows = computed(() => {
    const source = this.data().filter(d => (d.value ?? 0) > 0);
    if (!source.length) return [];

    const ordered = this.sorted() ? [...source].sort((a, b) => b.value - a.value) : source;
    const limit = this.max();
    const head = ordered.slice(0, limit);
    const tail = ordered.slice(limit);

    /*
     * formatValue applies to EVERY row, not only to the rolled-up one.
     *
     * It used to reach the Other row alone, so a caller that passed a formatter and no per-item
     * `display` got its raw numbers back on every real row -- an analytics tile was reading
     * "1267.19353428047" beside its bar while the Other row underneath read properly. An input
     * called formatValue that formats one row in eight is worse than no input, because the call
     * site looks correct.
     *
     * An explicit `display` still wins, which is what keeps the object browser's file sizes as
     * they are: that caller sets display per item AND passes a formatter for the roll-up.
     */
    const format = this.formatValue();
    const shown = head.map(item => format && item.display === undefined
      ? { ...item, display: format(item.value) }
      : item);
    if (tail.length) {
      const rolled = tail.reduce((sum, d) => sum + d.value, 0);
      shown.push({
        name: `Other (${tail.length})`,
        value: rolled,
        display: format ? format(rolled) : undefined,
        color: 'var(--text-muted)',
      });
    }

    const total = source.reduce((sum, d) => sum + d.value, 0);
    // Bars scale against the largest row, not the total: against the total a long tail of
    // small values collapses into invisible slivers.
    const largest = Math.max(...shown.map(d => d.value), 1);

    return shown.map((row, index) => ({
      ...row,
      percent: Math.round((row.value / total) * 100),
      width: Math.max(2, (row.value / largest) * 100),
      color: row.color ?? this.palette[index % this.palette.length],
    }));
  });
}
