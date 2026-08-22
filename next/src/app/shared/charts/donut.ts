import { Component, computed, input } from '@angular/core';

export interface Slice { name: string; value: number; }

@Component({
  selector: 'app-donut',
  template: `
    @if (total()) {
      <div class="flex items-center gap-5">
        <svg [attr.viewBox]="'0 0 42 42'" class="size-28 shrink-0 -rotate-90" role="img"
             [attr.aria-label]="ariaLabel()">
          <circle cx="21" cy="21" r="15.9" fill="none" stroke-width="5.5"
                  [attr.stroke]="'var(--surface-sunken)'" />
          @for (segment of segments(); track segment.name) {
            <circle cx="21" cy="21" r="15.9" fill="none" stroke-width="5.5"
                    stroke-linecap="butt"
                    [attr.stroke]="segment.color"
                    [attr.stroke-dasharray]="segment.dash"
                    [attr.stroke-dashoffset]="-segment.offset">
              <title>{{ segment.name }}: {{ segment.value }}</title>
            </circle>
          }
        </svg>

        <div class="min-w-0 flex-1">
          <div class="text-2xl font-semibold tabular leading-none">{{ total() }}</div>
          <div class="text-xs text-[color:var(--text-muted)] mt-0.5">{{ totalLabel() }}</div>
          <ul class="mt-3 space-y-1.5 text-sm">
            @for (segment of segments(); track segment.name) {
              <li class="flex items-center gap-2">
                <span class="size-2.5 rounded-full shrink-0" [style.background]="segment.color"></span>
                <span class="capitalize truncate">{{ segment.name.toLowerCase() }}</span>
                <span class="ml-auto tabular text-[color:var(--text-secondary)]">
                  {{ segment.percent }}%
                </span>
                <span class="tabular font-medium w-8 text-right">{{ segment.value }}</span>
              </li>
            }
          </ul>
        </div>
      </div>
    } @else {
      <p class="text-sm text-[color:var(--text-muted)] py-10 text-center">No data in this range.</p>
    }
  `,
})
export class Donut {
  readonly data = input.required<Slice[]>();
  readonly totalLabel = input('total');
  /** Optional fixed colours by name, so a status keeps its colour across charts. */
  readonly colorFor = input<((name: string, index: number) => string) | null>(null);

  readonly total = computed(() => this.data().reduce((sum, d) => sum + (d.value ?? 0), 0));

  readonly segments = computed(() => {
    const total = this.total();
    if (!total) return [];
    let offset = 0;
    return this.data().map((slice, index) => {
      const pct = (slice.value / total) * 100;
      const segment = {
        name: slice.name,
        value: slice.value,
        percent: pct < 1 && pct > 0 ? pct.toFixed(1) : Math.round(pct),
        color: this.colorFor()?.(slice.name, index) ?? `var(--chart-${index % 6})`,
        // A hair of separation reads as distinct slices rather than one continuous ring.
        dash: `${Math.max(pct - 0.6, 0.4)} ${100 - Math.max(pct - 0.6, 0.4)}`,
        offset,
      };
      offset += pct;
      return segment;
    });
  });

  readonly ariaLabel = computed(() =>
    this.data().map(d => `${d.name}: ${d.value}`).join(', '));
}
