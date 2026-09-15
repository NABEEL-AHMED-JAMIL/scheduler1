import { Component, computed, inject, input, signal } from '@angular/core';
import { Icon } from '../../shared/ui/icon';
import { Donut } from '../../shared/charts/donut';
import { LineChart } from '../../shared/charts/line-chart';
import { compactNumber } from '../../shared/charts/number-format';
import { API_SUCCESS } from '../../core/api/api.config';
import { AnalyticsService, ColumnDistribution } from './analytics.service';
import type { ColumnView, QualityFinding } from './analytics';

/** How a measured column may be drawn. */
export type DistributionKind = 'bars' | 'share' | 'curve' | 'area' | 'table';

/**
 * Above this many slices a ring stops being readable and the bars say it better.
 *
 * Eight rather than the twelve a distribution can hold: a ring has to carry its legend beside it,
 * and past eight rows that legend is taller than the ring it explains.
 */
const SHARE_SLICE_CEILING = 8;

/**
 * One column's card: what the scan measured, and what its values actually look like.
 *
 * Lifted out of the Columns tab so that the SAME card can be opened from a Compact row, which is
 * what let those two tabs become one. Nothing about the drawing changed in the move.
 *
 * <b>Each card owns its own distribution.</b> That is the part worth stating, because the obvious
 * shape was to keep the measurements on the parent, keyed by column name, and pass the slice
 * down. Owning it here means no per-column map to keep in step, no name to look a value up by,
 * and a card that can be dropped into any screen with a connection and a path -- which is
 * precisely what hosting it in two places required. The cost is one service injection per card,
 * against a component that is created once per column either way.
 *
 * The measurement is NOT fetched on creation. It is two statements against the file, and a
 * two-hundred-column file would open by firing two hundred of them at a four-permit ceiling.
 * Cost follows the click.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-column-card',
  imports: [Icon, Donut, LineChart],
  templateUrl: './column-card.html',
})
export class ColumnCard {
  readonly column = input.required<ColumnView>();
  readonly findings = input<QualityFinding[]>([]);
  /** Where to measure from. The card asks the server itself rather than being handed an answer. */
  readonly connection = input.required<string>();
  readonly path = input.required<string>();

  private readonly analytics = inject(AnalyticsService);

  /*
   * The two formatters this card's figures are printed through, kept identical to the parent's.
   *
   * Duplicated deliberately rather than passed in: they are pure, two lines between them, and a
   * card that needs a formatter handed to it is a card that cannot be dropped into a second
   * screen -- which was the whole point of lifting it out. The rule they encode is the same one
   * the Compact table uses, so the two views of a column read alike.
   */
  readonly compact = compactNumber;

  /** A percentage with its trailing zeros trimmed: 42.00 reads as measured-to-two-places. */
  percent(value: number): string {
    return value.toFixed(2).replace(/\.?0+$/, '');
  }

  readonly distribution = signal<ColumnDistribution | null>(null);
  readonly measuring = signal(false);
  readonly error = signal('');
  /** Null until a reader picks one, so the default can follow the data rather than a stored choice. */
  private readonly chosen = signal<DistributionKind | null>(null);

  measure(): void {
    if (this.measuring() || this.distribution()) return;
    this.measuring.set(true);
    this.error.set('');
    this.analytics.distribution(this.connection(), this.path(), this.column().name).subscribe({
      next: response => {
        this.measuring.set(false);
        if (response.status === API_SUCCESS && response.data) {
          this.distribution.set(response.data);
        } else {
          this.error.set(response.message);
        }
      },
      error: err => {
        this.measuring.set(false);
        this.error.set(err?.error?.message || 'That column could not be measured.');
      },
    });
  }

  /**
   * One bar per value or per bin, scaled to the tallest.
   *
   * The label is the value for a value-by-value drawing and the LOWER BOUND for a binned one: the
   * bins are contiguous, so printing both edges on every bar repeats each number twice down the
   * column. Both are in the tooltip.
   */
  readonly bars = computed(() => {
    const measured = this.distribution();
    if (!measured || !measured.bins?.length) return [];
    const tallest = Math.max(...measured.bins.map(bin => bin.rows), 0);
    return measured.bins.map(bin => ({
      label: measured.exactValues ? (bin.value ?? '(none)') : (bin.from ?? ''),
      rows: bin.rows,
      // An empty bin keeps NO width: a gap in a distribution is where there are no values, and a
      // sliver would draw a continuous shape over a hole.
      percent: tallest > 0 ? (bin.rows / tallest) * 100 : 0,
      title: measured.exactValues
        ? `${bin.value ?? '(none)'}: ${bin.rows} row(s)`
        : `${bin.from} to ${bin.to}: ${bin.rows} row(s)`,
    }));
  });

  readonly slices = computed(() => this.bars().map(bar => ({ name: bar.label, value: bar.rows })));
  readonly points = computed(() => this.bars().map(bar => ({ label: bar.label, value: bar.rows })));

  /**
   * Which drawings these values can honestly carry, and why the others cannot.
   *
   * A refused kind is offered DISABLED with the sentence explaining it rather than hidden -- the
   * same rule the dashboard's widget picker follows, and for the same reason: a reader wondering
   * why there is no pie here deserves the answer on the control instead of its absence.
   */
  readonly kinds = computed<{ id: DistributionKind; label: string; reason: string }[]>(() => {
    const measured = this.distribution();
    const bins = measured?.bins ?? [];
    const categories = !!measured?.exactValues;
    const negatives = bins.some(bin => bin.rows < 0);
    const nothing = bins.length ? '' : 'Nothing was counted.';

    return [
      { id: 'bars', label: 'Bars', reason: nothing },
      {
        id: 'share', label: 'Share of rows',
        // A ring divides a whole into parts, which is what a set of CATEGORIES is. Equal-width
        // bins of a range are not: they are positions on an axis, and a ring discards the axis.
        reason: nothing
          || (!categories ? 'These are positions on a numeric range, not parts of a whole — a ring '
              + 'would throw the axis away.'
            : bins.length > SHARE_SLICE_CEILING
              ? `A ring of ${bins.length} slices is harder to read than the bars.` : ''),
      },
      {
        id: 'curve', label: 'Curve',
        // A line claims the points are ordered and that values exist between them. True of bins
        // across a range; false of categories, whose only order is the sort by count.
        reason: nothing
          || (categories ? 'These are categories, so a line between them would draw the sort order '
              + 'rather than a shape in the data.'
            : bins.length < 2 ? 'A curve needs at least two bins.' : ''),
      },
      {
        id: 'area', label: 'Filled curve',
        reason: nothing
          || (categories ? 'These are categories, so a filled shape between them would measure the '
              + 'sort order rather than the data.'
            : bins.length < 2 ? 'A curve needs at least two bins.'
            : negatives ? 'A filled area measures up from a baseline.' : ''),
      },
      { id: 'table', label: 'Counts', reason: nothing },
    ];
  });

  /** What was picked, else the first kind these values can carry. */
  readonly kind = computed<DistributionKind>(() => {
    const picked = this.chosen();
    if (picked) return picked;
    const offered = this.kinds().find(option => !option.reason);
    return offered ? offered.id : 'bars';
  });

  chooseKind(kind: DistributionKind): void {
    this.chosen.set(kind);
  }
}
