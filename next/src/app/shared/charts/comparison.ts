import { Component, ChangeDetectionStrategy, computed, input } from '@angular/core';
import { readableCell } from './number-format';
import { capTitle } from '../ui/long-text';

export interface ComparisonSide {
  label: string;
  value: number;
}

/**
 * Two figures, and the difference between them worked out.
 *
 * <b>Written because "2024 against 2025" was two bar charts and a reader's arithmetic.</b> A
 * comparison report whose whole purpose is a difference should not make the reader compute it,
 * and eyeballing two separately-scaled charts is how people conclude the wrong thing about a
 * change of a few per cent.
 *
 * <b>The percentage is omitted when the baseline is zero, rather than shown as infinity.</b>
 * Going from nothing to something is a real event and has no percentage; printing one would be
 * arithmetic dressed as insight. The absolute change is still shown, because that part is true.
 *
 * Direction is stated in words as well as colour: "up" and "down" are the fact, and green and red
 * are a convention that carries no meaning to a reader who cannot separate them.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-comparison',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-stretch gap-3 py-3 min-w-0">
      <!-- Each figure is the answer, as a single figure is: it grows with its column on the
           .kpi-figure scale (16 to 30px), and is cut with its whole value in the tooltip. -->
      <div class="@container flex flex-col gap-1 min-w-0 flex-1">
        <span class="text-[11px] uppercase tracking-wider text-[color:var(--text-muted)] truncate"
              [title]="cap(first().label)">{{ first().label }}</span>
        <span class="kpi-figure truncate" [title]="shownFirst()">{{ shownFirst() }}</span>
      </div>
      <div class="@container flex flex-col gap-1 min-w-0 flex-1 border-s border-subtle ps-3">
        <span class="text-[11px] uppercase tracking-wider text-[color:var(--text-muted)] truncate"
              [title]="cap(second().label)">{{ second().label }}</span>
        <span class="kpi-figure truncate" [title]="shownSecond()">{{ shownSecond() }}</span>
      </div>
      <div class="@container flex flex-col gap-1 min-w-0 flex-1 border-s border-subtle ps-3">
        <span class="text-[11px] uppercase tracking-wider text-[color:var(--text-muted)]">
          Change
        </span>
        <span class="kpi-figure truncate" [title]="delta().shown"
              [class.text-[color:var(--ok-text)]]="delta().direction === 'up'"
              [class.text-[color:var(--crit-text)]]="delta().direction === 'down'">
          {{ delta().shown }}
        </span>
        <span class="text-xs text-[color:var(--text-muted)] truncate">{{ delta().words }}</span>
      </div>
    </div>
  `,
})
export class Comparison {

  /** A side's name can be a value of the data, and a 20,000-character one makes a screen-high tooltip. */
  protected readonly cap = capTitle;
  readonly first = input.required<ComparisonSide>();
  readonly second = input.required<ComparisonSide>();

  protected readonly shownFirst = computed(() => readableCell(String(this.first().value)));
  protected readonly shownSecond = computed(() => readableCell(String(this.second().value)));

  protected readonly delta = computed(() => {
    const from = this.first().value;
    const to = this.second().value;
    const change = to - from;
    const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'level';
    const absolute = readableCell(String(Math.abs(change)));

    if (from === 0) {
      // No percentage from a base of nothing. See the class comment.
      return {
        direction,
        shown: (change >= 0 ? '+' : '−') + absolute,
        words: 'no percentage from a base of zero',
      };
    }
    const percent = Math.abs(change / from) * 100;
    return {
      direction,
      shown: (change >= 0 ? '+' : '−') + percent.toFixed(1) + '%',
      words: direction === 'level'
        ? 'unchanged'
        : `${direction} by ${absolute}`,
    };
  });
}
