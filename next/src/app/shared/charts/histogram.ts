import { Component, computed, input, output } from '@angular/core';

export interface HistogramBin {
  /** Inclusive lower edge of the bin, in the value's own unit. */
  from: number;
  /** Exclusive upper edge, except on the last bin where it is inclusive. */
  to: number;
  count: number;
  /** Bar height as a percentage of the tallest bin. */
  height: number;
  label: string;
}

/**
 * How a set of measurements is distributed, rather than what they average to.
 *
 * The reason this exists as its own component: a mean and a median describe a single hump, and
 * the run durations in this system are not one hump. On the live data they land in two clumps
 * -- one near 33s and one near 60s with nothing in between -- and every single-number summary
 * hides that. A histogram is the only view here that shows it, which is why it earns a place on
 * the page where a second donut would not.
 *
 * The binning is lifted from the private columnHistogram that used to sit inside the reports
 * page (12 bins, values below zero dropped, a per-bin hint). It is a component now because the
 * same arithmetic was inaccessible to anything but that one table header.
 *
 * `format` is a function input, which the app already does elsewhere -- app-donut takes
 * `colorFor` and app-ranked-bar takes `formatValue` the same way.
 *
 * TWO THINGS ABOUT RUNS USED TO BE WELDED INTO IT, and both were sentences on screen rather than
 * settings. Every bin said "412 runs between 0 and 100" and every value below zero was thrown
 * away. Both were right for the one caller it had -- an unfinished run carries -1 instead of a
 * duration, and there is no honest place for that on a duration axis -- and both are false for
 * the second caller: Analytics Studio bins a column a person picked out of their own query
 * result, where the rows are rows rather than runs and where a negative number is a refund, a
 * temperature or a loss and belongs on the chart. So `noun` names what is being counted and
 * `dropBelow` decides what is off the scale, each defaulting to what the reports page already
 * relied on. Nothing about durations is assumed here any more; the caller that has durations
 * says so.
 */
@Component({
  selector: 'app-histogram',
  template: `
    @if (total()) {
      <div class="flex items-end gap-px" [style.height.px]="height()" role="img"
           [attr.aria-label]="summary()">
        @for (bin of bins(); track $index) {
          <button type="button"
                  class="flex-1 min-w-0 rounded-t transition-opacity hover:opacity-70
                         focus-visible:opacity-70"
                  [class.cursor-default]="!clickable()"
                  [style.height.%]="bin.height || 1"
                  [style.background]="bin.count ? barColor() : 'var(--border-subtle)'"
                  [attr.tabindex]="clickable() ? 0 : -1"
                  [attr.aria-hidden]="clickable() ? null : 'true'"
                  [title]="bin.label"
                  (click)="clickable() && binClicked.emit(bin)"></button>
        }
      </div>
      <!-- Only the two edges and the peak are labelled. Twelve labels under twelve narrow bars
           is unreadable at this width, and the per-bar detail is already in the tooltip. -->
      <div class="flex justify-between mt-1.5 text-[11px] text-[color:var(--text-muted)] mono">
        <span>{{ format()(low()) }}</span>
        <span class="font-semibold text-[color:var(--text-secondary)]">{{ peakLabel() }}</span>
        <span>{{ format()(high()) }}</span>
      </div>
    } @else {
      <div class="flex items-center justify-center text-xs text-[color:var(--text-muted)]"
           [style.height.px]="height()">{{ emptyMessage() }}</div>
    }
  `,
})
export class Histogram {
  /** Raw measurements. Values under `dropBelow` are dropped -- see `dropped`. */
  readonly values = input.required<number[]>();

  readonly height = input(120);
  readonly binCount = input(12);
  readonly emptyMessage = input('No measurements in this range.');
  readonly clickable = input(false);
  readonly barColor = input('var(--chart-0)');
  /** How an axis value is written. Defaults to the raw number. */
  readonly format = input<(value: number) => string>((v: number) => String(Math.round(v)));
  /**
   * What one measurement IS, so a bin can be read as a sentence: "412 runs between 0 and 100".
   *
   * Two inputs rather than one and a rule, because there is no rule: adding an "s" is right for
   * runs and rows and wrong for the next caller along.
   */
  readonly noun = input('run');
  readonly nounPlural = input('runs');
  /**
   * The lowest value that belongs on this axis, or null to keep every one.
   *
   * Zero by default, which is the sentinel guard the reports page needs and NOT a fact about
   * measurement: a run that has not finished carries -1 rather than a duration, and there is no
   * honest way to place that on a duration axis. A caller whose negative numbers are real values
   * passes null and gets all of them.
   */
  readonly dropBelow = input<number | null>(0);
  readonly binClicked = output<HistogramBin>();

  /**
   * The values that can be placed on the axis, counted against the ones that cannot so the
   * caller can say so out loud instead of quietly narrowing the population.
   *
   * A non-finite value is dropped whatever `dropBelow` says, because it has nowhere to be: one
   * NaN makes min, max and every bin edge NaN, and the whole chart disappears without a word.
   * The old `v >= 0` excluded them as a side effect, so this keeps a guarantee rather than
   * adding one.
   */
  readonly usable = computed(() => {
    const floor = this.dropBelow();
    return this.values().filter(v => Number.isFinite(v) && (floor === null || v >= floor));
  });
  readonly dropped = computed(() => this.values().length - this.usable().length);
  readonly total = computed(() => this.usable().length);

  readonly low = computed(() => (this.total() ? Math.min(...this.usable()) : 0));
  readonly high = computed(() => (this.total() ? Math.max(...this.usable()) : 0));

  readonly bins = computed<HistogramBin[]>(() => {
    const values = this.usable();
    if (!values.length) return [];
    const count = Math.max(2, this.binCount());
    const min = this.low();
    const max = this.high();
    // Every value identical: one full bar rather than a divide-by-zero spread over `count`.
    const span = max - min || 1;
    const counts = new Array(count).fill(0);
    for (const value of values) {
      counts[Math.min(count - 1, Math.floor(((value - min) / span) * count))]++;
    }
    const peak = Math.max(...counts, 1);
    return counts.map((n, i) => {
      const from = min + (span * i) / count;
      const to = min + (span * (i + 1)) / count;
      return {
        from, to, count: n,
        height: Math.round((n / peak) * 100),
        label: n
          ? `${n} ${n === 1 ? this.noun() : this.nounPlural()} `
            + `between ${this.format()(from)} and ${this.format()(to)}`
          : `none between ${this.format()(from)} and ${this.format()(to)}`,
      };
    });
  });

  /** The busiest bin, named -- the one number worth printing under the chart. */
  readonly peakLabel = computed(() => {
    const bins = this.bins();
    if (!bins.length) return '';
    const peak = bins.reduce((a, b) => (b.count > a.count ? b : a), bins[0]);
    const mid = (peak.from + peak.to) / 2;
    return `most near ${this.format()(mid)}`;
  });

  readonly summary = computed(() => {
    if (!this.total()) return this.emptyMessage();
    return `Distribution of ${this.total()} ${this.nounPlural()} from ${this.format()(this.low())} `
      + `to ${this.format()(this.high())}; ${this.peakLabel()}.`;
  });
}
