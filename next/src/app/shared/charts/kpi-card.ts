import { Component, ChangeDetectionStrategy, computed, input } from '@angular/core';
import { readableCell } from './number-format';

/**
 * One figure, at the size a headline figure should be.
 *
 * <b>Why this exists.</b> A single-figure analysis -- total revenue, order count, distinct
 * customers -- had only one way to draw: a table with one column and one row, complete with a
 * column header reading `amount_sum` and a footer reading "1 row". Six of those on an executive
 * board is a page that makes a reader work to find the six numbers it exists to show.
 *
 * <b>It does not shorten the number.</b> compactNumber would render 103,909,527.58 as "103.9M",
 * which is the right call on a chart axis and the wrong one here: this IS the answer, and a
 * reader reconciling it against another system needs the figure rather than its magnitude. The
 * grouping comes from readableCell, so the tile agrees to the digit with the table beside it.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-kpi-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'kpi-card' },
  template: `
    <div class="flex flex-col justify-center gap-1 px-1 min-w-0"
         [class.py-4]="size() === 'md'" [class.py-8]="size() === 'lg'"
         [class.items-center]="align() === 'center'" [class.text-center]="align() === 'center'">
      <span class="text-[11px] uppercase tracking-wider text-[color:var(--text-muted)] truncate max-w-full"
            [title]="label()">{{ label() }}</span>
      <!-- title carries the raw value: the displayed figure is grouped and may be rounded to two
           places, and the unrounded one has to stay reachable for anybody checking a total. -->
      <!-- Sized to the card and never truncated: in a board cell "103,909,527.58" was cut to
           "103,90…", which is exactly the shortening this card exists not to do. -->
      <span class="kpi-figure max-w-full" [class.is-lg]="size() === 'lg'"
            [title]="value()">{{ shown() }}</span>
      @if (caption()) {
        <span class="text-xs text-[color:var(--text-muted)] truncate">{{ caption() }}</span>
      }
    </div>
  `,
})
export class KpiCard {

  /** The figure, as the engine returned it. */
  readonly value = input.required<string>();

  /** What the figure is -- usually the measure's own column name, humanised by the caller. */
  readonly label = input('');

  /** An optional line underneath: what it was counted over, or a caveat. */
  readonly caption = input('');

  /** Where the figure sits: at the start of a small tile, or in the middle of a full-width row. */
  readonly align = input<'start' | 'center'>('start');

  /** How big: md in a grid cell, lg when the figure has a whole row to itself. */
  readonly size = input<'md' | 'lg'>('md');

  protected readonly shown = computed(() => readableCell(this.value()));
}
