import { Component, computed, input } from '@angular/core';
import { chartColor } from './status-color';

export interface Slice { name: string; value: number; }

/**
 * A small ring with its legend beside it.
 *
 * The ring is 72px rather than 112px and the legend rows are single-line, so the whole thing
 * sits in about 120px -- roughly three table rows, which is the right weight for a summary
 * that accompanies a table rather than replacing it.
 */
@Component({
  selector: 'app-donut',
  template: `
    @if (total()) {
      <div class="flex items-center gap-4">
        <div class="relative shrink-0">
          <svg viewBox="0 0 42 42" class="size-[104px] -rotate-90" role="img"
               [attr.aria-label]="ariaLabel()">
            <circle cx="21" cy="21" r="15.9" fill="none" stroke-width="5"
                    [attr.stroke]="'var(--surface-sunken)'" />
            @for (segment of segments(); track segment.name) {
              <circle cx="21" cy="21" r="15.9" fill="none" stroke-width="5"
                      stroke-linecap="butt"
                      [attr.stroke]="segment.color"
                      [attr.stroke-dasharray]="segment.dash"
                      [attr.stroke-dashoffset]="-segment.offset">
                <title>{{ segment.name }}: {{ segment.display }}</title>
              </circle>
            }
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-3 text-center">
            <span class="text-xl font-semibold tabular leading-none">{{ compactTotal() }}</span>
            @if (totalLabel()) {
              <span class="text-[10px] leading-tight mt-0.5 max-w-[70px] truncate
                           text-[color:var(--text-muted)]" [title]="totalLabel()">
                {{ totalLabel() }}
              </span>
            }
          </div>
        </div>

        <ul class="min-w-0 flex-1 space-y-1">
          @for (segment of segments(); track segment.name) {
            <li class="flex items-center gap-2 text-[11px] leading-none">
              <span class="size-2 rounded-full shrink-0" [style.background]="segment.color"></span>
              <span class="capitalize truncate text-[color:var(--text-secondary)]">
                {{ segment.name.toLowerCase() }}
              </span>
              <span class="ml-auto tabular font-medium shrink-0">{{ segment.display }}</span>
              <span class="tabular text-[color:var(--text-muted)] w-8 text-right shrink-0">
                {{ segment.percent }}%
              </span>
            </li>
          }
        </ul>
      </div>
    } @else {
      <p class="text-xs text-[color:var(--text-muted)] py-6 text-center">No data in this range.</p>
    }
  `,
})
export class Donut {
  readonly data = input.required<Slice[]>();
  readonly totalLabel = input('total');
  /** Optional fixed colours by name, so a status keeps its colour across charts. */
  readonly colorFor = input<((name: string, index: number) => string) | null>(null);
  /**
   * How a slice's value is written in the legend and the tooltip.
   *
   * Null renders the number as it arrives, which is what every caller got before this existed --
   * and over money read out of a CSV that meant a legend row reading 103909527.57999787, the
   * trailing digits an artefact of the reader typing the column as DOUBLE. RankedBar's own source
   * records the identical symptom as a bug it had already fixed; the ring beside it had no input
   * to fix it with.
   *
   * This used to add "The ring's CENTRE was always fine, because compactTotal formats it", which
   * was true of three of compactTotal's four branches. Below a thousand it formatted nothing and
   * printed the sum as it arrived, so a ring over a small money column showed the float artefact
   * in the middle while the legend rows beside it read properly. compactTotal now rounds that
   * branch too -- to its own precision rather than to this formatter's, because the centre is
   * sized for about five characters and a grouped, unabbreviated total does not fit in it.
   */
  readonly format = input<((value: number) => string) | null>(null);

  readonly total = computed(() => this.data().reduce((sum, d) => sum + (d.value ?? 0), 0));

  /** The centre of a 72px ring cannot hold six digits. */
  readonly compactTotal = computed(() => {
    const total = this.total();
    /*
     * Two decimal places below a thousand, where this used to be a bare `${total}`.
     *
     * That was the one branch of the four that formatted nothing, so the artefact the legend rows
     * were given a formatter to cure was still alive in the middle of the same ring: a set of
     * slices summing to 103.90000000000002 -- the trailing digits an artefact of the reader
     * typing the column as DOUBLE -- printed all eighteen characters inside a 104px circle.
     *
     * Rounded here rather than handed to the caller's `format`, because the constraint in the
     * centre is the RING and not the caller. readableCell renders 103909527.58 as
     * "103,909,527.58", which is exactly right in a legend row and does not fit in a space that
     * holds about five characters -- which is why the branches below compact at all. Two places
     * keep money and rates whole and drop the float noise, which is the whole of the defect.
     */
    if (total < 1000) return `${Math.round(total * 100) / 100}`;
    if (total < 1_000_000) return `${(total / 1000).toFixed(total < 10_000 ? 1 : 0)}k`;
    return `${(total / 1_000_000).toFixed(1)}M`;
  });

  readonly ariaLabel = computed(() => {
    // Formatted too. A screen reader hearing "one hundred three million nine hundred nine
    // thousand five hundred twenty seven point five seven nine nine nine..." is being read the
    // float's rounding error, digit by digit.
    const format = this.format();
    return this.data()
      .map(d => `${d.name}: ${format ? format(d.value) : d.value}`)
      .join(', ');
  });

  readonly segments = computed(() => {
    const total = this.total();
    if (!total) return [];
    const custom = this.colorFor();
    const format = this.format();
    let offset = 0;
    return this.data().map((slice, index) => {
      const pct = (slice.value / total) * 100;
      const dash = `${pct} ${100 - pct}`;
      const segment = {
        name: slice.name,
        value: slice.value,
        // What the legend and the tooltip actually print. The raw value stays on the object
        // because the percentage and the ring geometry are computed from it.
        display: format ? format(slice.value) : `${slice.value}`,
        percent: Math.round(pct),
        dash,
        offset,
        color: custom ? custom(slice.name, index) : chartColor(index),
      };
      offset += pct;
      return segment;
    });
  });
}
