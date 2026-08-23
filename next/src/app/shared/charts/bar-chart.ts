import { Component, computed, input, output } from '@angular/core';

export interface Bar { name: string; value: number; meta?: unknown; color?: string; }

@Component({
  selector: 'app-bar-chart',
  template: `
    @if (bars().length) {
      <div class="flex items-end gap-1" [style.height.px]="height()"
           [class.justify-start]="bars().length < 6">
        @for (bar of bars(); track $index) {
          <button type="button"
                  class="flex-1 min-w-0 max-w-16 h-full flex flex-col justify-end items-center gap-1
                         rounded transition-colors hover:bg-[color:var(--surface-sunken)]
                         focus:outline-none focus:ring-2 focus:ring-brand-500"
                  [disabled]="!clickable()"
                  [title]="bar.name + ': ' + bar.value"
                  (click)="barClicked.emit(bar)">
            <span class="text-[10px] tabular leading-none text-[color:var(--text-muted)]">{{ bar.value }}</span>
            <span class="w-full rounded-t transition-[height]"
                  [class.bg-brand-500]="!bar.color"
                  [style.background]="bar.color || null"
                  [style.height.px]="bar.px"></span>
            <span class="text-[10px] text-[color:var(--text-muted)] w-full text-center h-3.5 leading-[0.875rem]"
                  [class.truncate]="!bar.newGroup">
              @if (bar.newGroup) {
                <span class="whitespace-nowrap">{{ bar.name }}</span>
              }
            </span>
          </button>
        }
      </div>
      @if (usesSqrtScale()) {
        <p class="text-[10px] text-[color:var(--text-muted)] mt-1.5 leading-snug">
          Bar heights use a square-root scale so smaller {{ unit() }} stay visible next to
          {{ maxValue() }}.
        </p>
      }
    } @else {
      <p class="text-xs text-[color:var(--text-muted)] py-6 text-center">{{ emptyMessage() }}</p>
    }
  `,
})
export class BarChart {
  readonly data = input.required<Bar[]>();
  readonly height = input(96);
  /** Named so the scale note reads correctly wherever the chart is used, not just on the dashboard. */
  readonly unit = input('values');
  readonly emptyMessage = input('Nothing to show in this range.');
  readonly clickable = input(false);
  readonly barClicked = output<Bar>();

  readonly maxValue = computed(() => Math.max(0, ...this.data().map(d => d.value ?? 0)));

  /**
   * Twenty-four bars from one day all read "Aug 19", and at ~20px each the label truncates to
   * "A...". A repeated label carries nothing, so only the first of each run is drawn, and it
   * is free to overflow its own cell because its neighbours are now empty.
   */
  /**
   * A single busy day can be two orders of magnitude above the rest, and on a linear scale
   * every other bar collapses to a hairline. Above a 20x spread the scale switches to
   * square-root so the small days remain readable, and the chart says so.
   */
  readonly usesSqrtScale = computed(() => {
    const values = this.data().map(d => d.value ?? 0).filter(v => v > 0);
    if (values.length < 2) return false;
    return this.maxValue() / Math.min(...values) > 20;
  });

  readonly bars = computed(() => {
    const max = this.maxValue();
    if (!max) return [];
    // Reserve room for the value and label lines above and below the bar itself.
    const track = Math.max(this.height() - 32, 18);
    const sqrt = this.usesSqrtScale();
    const data = this.data();
    return data.map((bar, index) => {
      const ratio = sqrt ? Math.sqrt(bar.value) / Math.sqrt(max) : bar.value / max;
      return {
        ...bar,
        newGroup: index === 0 || bar.name !== data[index - 1].name,
        // A non-zero value never renders as nothing.
        px: bar.value > 0 ? Math.max(Math.round(ratio * track), 3) : 0,
      };
    });
  });
}
