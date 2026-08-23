import { Component, computed, input } from '@angular/core';

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
          <svg viewBox="0 0 42 42" class="size-[72px] -rotate-90" role="img"
               [attr.aria-label]="ariaLabel()">
            <circle cx="21" cy="21" r="15.9" fill="none" stroke-width="4.5"
                    [attr.stroke]="'var(--surface-sunken)'" />
            @for (segment of segments(); track segment.name) {
              <circle cx="21" cy="21" r="15.9" fill="none" stroke-width="4.5"
                      stroke-linecap="butt"
                      [attr.stroke]="segment.color"
                      [attr.stroke-dasharray]="segment.dash"
                      [attr.stroke-dashoffset]="-segment.offset">
                <title>{{ segment.name }}: {{ segment.value }}</title>
              </circle>
            }
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span class="text-base font-semibold tabular leading-none">{{ compactTotal() }}</span>
          </div>
        </div>

        <ul class="min-w-0 flex-1 space-y-1">
          @for (segment of segments(); track segment.name) {
            <li class="flex items-center gap-2 text-[11px] leading-none">
              <span class="size-2 rounded-full shrink-0" [style.background]="segment.color"></span>
              <span class="capitalize truncate text-[color:var(--text-secondary)]">
                {{ segment.name.toLowerCase() }}
              </span>
              <span class="ml-auto tabular font-medium shrink-0">{{ segment.value }}</span>
              <span class="tabular text-[color:var(--text-muted)] w-8 text-right shrink-0">
                {{ segment.percent }}%
              </span>
            </li>
          }
        </ul>
      </div>
      @if (totalLabel()) {
        <p class="text-[11px] text-[color:var(--text-muted)] mt-2">{{ totalLabel() }}</p>
      }
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

  readonly total = computed(() => this.data().reduce((sum, d) => sum + (d.value ?? 0), 0));

  /** The centre of a 72px ring cannot hold six digits. */
  readonly compactTotal = computed(() => {
    const total = this.total();
    if (total < 1000) return `${total}`;
    if (total < 1_000_000) return `${(total / 1000).toFixed(total < 10_000 ? 1 : 0)}k`;
    return `${(total / 1_000_000).toFixed(1)}M`;
  });

  readonly ariaLabel = computed(() =>
    this.data().map(d => `${d.name}: ${d.value}`).join(', '));

  readonly segments = computed(() => {
    const total = this.total();
    if (!total) return [];
    const custom = this.colorFor();
    let offset = 0;
    return this.data().map((slice, index) => {
      const pct = (slice.value / total) * 100;
      const dash = `${pct} ${100 - pct}`;
      const segment = {
        name: slice.name,
        value: slice.value,
        percent: Math.round(pct),
        dash,
        offset,
        color: custom ? custom(slice.name, index) : `var(--chart-${index % 6})`,
      };
      offset += pct;
      return segment;
    });
  });
}
