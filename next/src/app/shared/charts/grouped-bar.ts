import { Component, computed, input } from '@angular/core';
import { CHART_SLOTS, chartColor } from './status-color';
import { compactNumber } from './number-format';

export interface GroupedSeries {
  /** The value of the SECOND dimension this series stands for. */
  name: string;
  /** One figure per group, index-aligned with `groups`. Null where that pair has no rows. */
  values: (number | null)[];
}

/**
 * Clustered bars: one group per value of the first dimension, one bar per value of the second.
 *
 * This exists for the case the board had no chart for at all. A two-dimension result can be
 * stacked only when its measure ADDS UP -- `stacked` and `shareStacked` both refuse an average,
 * a minimum or a distinct count, and they are right to: stacking claims the parts compose the
 * whole, and an average of averages is not one. So a question like "average order value by
 * region and category" could be drawn as nothing. It fell through to the cross-tab, which is a
 * grid of numbers and answers "what is each figure" rather than "how do they compare".
 *
 * Clustered bars make no claim about a total. Every bar is measured from the same zero against a
 * shared scale, so the comparison the reader wants -- this category against that one, inside
 * this region and then across regions -- is the thing the geometry actually shows. That is why
 * this is offered for non-additive measures where the stack is refused.
 *
 * Bars sit on a SHARED maximum rather than per-group. Normalising each group to its own widest
 * bar would make every group look alike and hide the thing most worth seeing, which is that one
 * group is bigger than another.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-grouped-bar',
  template: `
    <div class="flex flex-col gap-2">
      @if (series().length > 1) {
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          @for (entry of legend(); track entry.name) {
            <span class="inline-flex items-center gap-1.5 text-[11px]
                         text-[color:var(--text-secondary)]">
              <span class="w-2.5 h-2.5 rounded-sm shrink-0"
                    [style.background]="entry.color"></span>{{ entry.name }}
            </span>
          }
        </div>
      }

      <div class="flex flex-col gap-2">
        @for (group of groups(); track group.name; let g = $index) {
          <div class="flex flex-col gap-0.5">
            <div class="flex items-baseline justify-between gap-2">
              <span class="text-xs truncate text-[color:var(--text-secondary)]"
                    [title]="group.name">{{ group.name }}</span>
            </div>
            <div class="flex flex-col gap-0.5">
              @for (bar of group.bars; track bar.name) {
                <div class="flex items-center gap-1.5">
                  <!-- The bar rail. A null pair draws no bar at all rather than a zero-width
                       one, because "no rows" and "zero" are different answers. -->
                  <div class="flex-1 h-3.5 rounded-sm bg-[color:var(--surface-sunken)] relative">
                    @if (bar.value !== null) {
                      <!-- minWidth 2px is what makes a ZERO visible. Without it a measured zero
                           and a pair with no rows draw the same nothing, and the only thing
                           telling them apart is the number at the end of the row -- which is
                           precisely the distinction this chart is supposed to make in its
                           geometry. The Profile tab's spread bar does the same for a
                           zero-wide quarter, for the same reason. -->
                      <div class="h-full rounded-sm transition-[width]"
                           [style.width.%]="bar.percent"
                           [style.minWidth.px]="2"
                           [style.background]="bar.color"
                           [attr.title]="bar.name + ': ' + bar.display"></div>
                    }
                  </div>
                  <span class="text-[11px] tabular shrink-0 w-16 text-right
                               text-[color:var(--text-muted)]">
                    {{ bar.value === null ? '—' : bar.display }}
                  </span>
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class GroupedBar {
  /** One label per cluster: the values of the first dimension. */
  readonly groupNames = input.required<string[]>();
  readonly series = input.required<GroupedSeries[]>();

  readonly legend = computed(() =>
    this.series().map((entry, index) => ({
      name: entry.name,
      color: chartColor(index % CHART_SLOTS),
    })));

  /**
   * The widest bar on the chart, shared by every group.
   *
   * Negatives are not drawn: this chart measures length from zero, and a bar running the other
   * way needs an axis it does not have. The caller gates on that -- see the `groupedBar` reason
   * in dashboard.ts -- so reaching here with one would be a bug rather than a state to render.
   */
  private readonly ceiling = computed(() => {
    let highest = 0;
    for (const entry of this.series()) {
      for (const value of entry.values) {
        if (value !== null && value > highest) highest = value;
      }
    }
    return highest;
  });

  readonly groups = computed(() => {
    const names = this.groupNames();
    const all = this.series();
    const top = this.ceiling();
    return names.map((name, groupIndex) => ({
      name,
      bars: all.map((entry, seriesIndex) => {
        const value = entry.values[groupIndex] ?? null;
        return {
          name: entry.name,
          value,
          // A zero stays 0% here and is made visible by the 2px floor on the element instead --
          // a percentage floor would scale with the rail and read as a small VALUE, while a
          // fixed hairline reads as a mark. The distinction that matters is zero against
          // no-rows, and a missing pair draws no element at all.
          percent: value === null || top <= 0 ? 0 : (value / top) * 100,
          display: value === null ? '—' : compactNumber(value),
          color: chartColor(seriesIndex % CHART_SLOTS),
        };
      }),
    }));
  });
}
