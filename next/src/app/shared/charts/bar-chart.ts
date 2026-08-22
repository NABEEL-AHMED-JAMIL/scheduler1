import { Component, computed, input, output } from '@angular/core';

export interface Bar { name: string; value: number; meta?: unknown; }

@Component({
  selector: 'app-bar-chart',
  template: `
    @if (bars().length) {
      <div class="flex items-end gap-1.5" [style.height.px]="height()">
        @for (bar of bars(); track bar.name) {
          <button type="button"
                  class="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1.5
                         rounded-md px-0.5 transition-colors hover:bg-[color:var(--surface-sunken)]
                         focus:outline-none focus:ring-2 focus:ring-brand-500"
                  [disabled]="!clickable()"
                  [title]="bar.name + ': ' + bar.value"
                  (click)="barClicked.emit(bar)">
            <span class="text-[11px] tabular text-[color:var(--text-secondary)]">{{ bar.value }}</span>
            <span class="w-full rounded-t bg-brand-500 transition-[height]"
                  [style.height.px]="bar.px"></span>
            <span class="text-[11px] text-[color:var(--text-muted)] truncate w-full text-center">
              {{ bar.name }}
            </span>
          </button>
        }
      </div>
      @if (usesSqrtScale()) {
        <p class="text-[11px] text-[color:var(--text-muted)] mt-2">
          Bar heights use a square-root scale so smaller days stay visible next to
          {{ maxValue() }}.
        </p>
      }
    } @else {
      <p class="text-sm text-[color:var(--text-muted)] py-10 text-center">No runs in this range.</p>
    }
  `,
})
export class BarChart {
  readonly data = input.required<Bar[]>();
  readonly height = input(140);
  readonly clickable = input(false);
  readonly barClicked = output<Bar>();

  readonly maxValue = computed(() => Math.max(0, ...this.data().map(d => d.value ?? 0)));

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
    const track = Math.max(this.height() - 42, 20);
    const sqrt = this.usesSqrtScale();
    return this.data().map(bar => {
      const ratio = sqrt ? Math.sqrt(bar.value) / Math.sqrt(max) : bar.value / max;
      return {
        ...bar,
        // A non-zero value never renders as nothing.
        px: bar.value > 0 ? Math.max(Math.round(ratio * track), 3) : 0,
      };
    });
  });
}
