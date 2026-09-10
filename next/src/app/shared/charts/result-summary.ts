import { Component, ChangeDetectionStrategy, computed, input } from '@angular/core';
import { readableCell } from './number-format';

export interface SummaryMark { name: string; value: number; }
export type SummaryMode = 'dimension' | 'trend' | 'distribution';

/** One stated fact: what it is, and the figure. */
interface Fact { label: string; value: string; note?: string; }

/**
 * The same result, described in sentences instead of drawn.
 *
 * <b>Three widget kinds, one component, because they differ only in which questions they ask.</b>
 * A dimension summary asks how the groups are shaped; a trend summary asks where the series went;
 * a distribution summary asks how the figures spread. Splitting them into three components would
 * triple the code that formats a figure and puts a caveat under it, and the caveats are the part
 * that has to stay identical.
 *
 * <b>Why a summary is worth a tile at all.</b> A chart shows a reader the shape and leaves them to
 * work out the number; on a board that is skimmed, that work does not get done. "The top group is
 * 67% of the total" is the finding, and a ring makes it available rather than stating it.
 *
 * <b>Every figure here is computed from the marks the tile already has, never re-queried.</b> Two
 * tiles of the same analysis that disagreed because one of them asked again would be worse than
 * either being absent, and the concentration figure below is exactly the kind of number a reader
 * would carry into a meeting.
 *
 * <b>What it refuses to say.</b> Concentration is a share of a total, so it is only shown when the
 * measure has a total to divide -- the same rule the ring keeps. The trend's direction compares
 * first and last only, and says so, because a series that ends where it started may have gone
 * anywhere in between and this widget is not entitled to imply otherwise.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-result-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!facts().length) {
      <p class="field-note text-[color:var(--text-muted)]">{{ emptyMessage() }}</p>
    } @else {
      <dl class="grid grid-cols-2 gap-x-4 gap-y-3 py-3 min-w-0">
        @for (fact of facts(); track fact.label) {
          <div class="flex flex-col min-w-0">
            <dt class="text-[11px] uppercase tracking-wider text-[color:var(--text-muted)] truncate">
              {{ fact.label }}
            </dt>
            <dd class="text-base font-semibold tabular truncate" [title]="fact.value">
              {{ fact.value }}
            </dd>
            @if (fact.note) {
              <dd class="text-[11px] text-[color:var(--text-muted)] truncate" [title]="fact.note">
                {{ fact.note }}
              </dd>
            }
          </div>
        }
      </dl>
    }
  `,
})
export class ResultSummary {

  readonly data = input.required<SummaryMark[]>();
  readonly mode = input.required<SummaryMode>();

  /** Whether the measure has a total worth dividing. Concentration is withheld when it has not. */
  readonly additive = input(true);

  readonly dimensionLabel = input('group');
  readonly emptyMessage = input('Nothing to summarise.');

  private readonly sorted = computed(() =>
    [...this.data()].sort((left, right) => right.value - left.value));

  protected readonly facts = computed<Fact[]>(() => {
    const marks = this.data();
    if (!marks.length) return [];
    switch (this.mode()) {
      case 'dimension': return this.dimensionFacts();
      case 'trend': return this.trendFacts();
      default: return this.distributionFacts();
    }
  });

  private dimensionFacts(): Fact[] {
    const ranked = this.sorted();
    const total = ranked.reduce((sum, mark) => sum + mark.value, 0);
    const top = ranked[0];
    const bottom = ranked[ranked.length - 1];

    const facts: Fact[] = [
      // "Groups", with the dimension named underneath, rather than pluralising the column name.
      // The naive version printed "CATEGORYS", and pluralising an arbitrary column -- status,
      // customer_id, order_month -- correctly is a problem nobody needs this widget to solve.
      {
        label: 'Groups',
        value: ranked.length.toLocaleString(),
        note: this.dimensionLabel() ? `by ${this.dimensionLabel()}` : '',
      },
      { label: 'Largest', value: readableCell(String(top.value)), note: top.name },
      { label: 'Smallest', value: readableCell(String(bottom.value)), note: bottom.name },
    ];
    // A share of a total, so only where there is one to divide -- the ring's rule.
    if (this.additive() && total > 0) {
      facts.push({
        label: 'Top share',
        value: ((top.value / total) * 100).toFixed(1) + '%',
        note: `of ${readableCell(String(total))}`,
      });
    }
    return facts;
  }

  private trendFacts(): Fact[] {
    // In the dimension's own order, which is what makes first and last mean anything. The kind is
    // only offered for dimension-ordered results; see issuesFor.
    const marks = this.data();
    const first = marks[0];
    const last = marks[marks.length - 1];
    const change = last.value - first.value;
    const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'level';

    let biggest = { from: '', to: '', move: 0 };
    for (let at = 1; at < marks.length; at++) {
      const move = marks[at].value - marks[at - 1].value;
      if (Math.abs(move) > Math.abs(biggest.move)) {
        biggest = { from: marks[at - 1].name, to: marks[at].name, move };
      }
    }

    return [
      { label: 'First', value: readableCell(String(first.value)), note: first.name },
      { label: 'Last', value: readableCell(String(last.value)), note: last.name },
      {
        label: 'Change',
        value: first.value === 0
          // No percentage from a base of nothing; the absolute change is still true.
          ? (change >= 0 ? '+' : '−') + readableCell(String(Math.abs(change)))
          : (change >= 0 ? '+' : '−') + Math.abs((change / first.value) * 100).toFixed(1) + '%',
        note: `${direction}, first against last only`,
      },
      {
        label: 'Biggest move',
        value: (biggest.move >= 0 ? '+' : '−') + readableCell(String(Math.abs(biggest.move))),
        note: biggest.from ? `${biggest.from} to ${biggest.to}` : '',
      },
    ];
  }

  private distributionFacts(): Fact[] {
    const values = this.data().map(mark => mark.value).sort((left, right) => left - right);
    const middle = Math.floor(values.length / 2);
    const median = values.length % 2
      ? values[middle]
      : (values[middle - 1] + values[middle]) / 2;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

    return [
      { label: 'Lowest', value: readableCell(String(values[0])) },
      { label: 'Highest', value: readableCell(String(values[values.length - 1])) },
      { label: 'Median', value: readableCell(String(median)) },
      {
        label: 'Mean',
        value: readableCell(String(Math.round(mean * 100) / 100)),
        // Which side the mean falls tells a reader the shape without a chart.
        note: mean > median ? 'above the median — a long upper tail'
          : mean < median ? 'below the median — a long lower tail'
          : 'level with the median',
      },
    ];
  }
}
