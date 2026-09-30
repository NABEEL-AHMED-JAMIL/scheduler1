import { Component, computed, input, output, signal } from '@angular/core';
import { axisHour, dayLabel, hourRange } from '../ui/time-format';

/**
 * `key` is what a click drills into (the dashboard's date). A range longer than a week brings the
 * same weekday and hour round again; those cells are added up, and `keys` lists every date with runs
 * in them, oldest first. `key` is then the latest of them.
 */
export interface HeatCell { day: string; hour: number; value: number; key?: string; keys?: string[]; }
export interface HeatSelection { day: string; hour: number; key?: string; keys?: string[]; value: number; }

const DAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

@Component({
  selector: 'app-heatmap',
  template: `
    @if (rows().length) {
      <div class="w-full">
        <!-- Grid rather than a table: the columns then share the full width evenly
             instead of collapsing to content and leaving the card half empty. Each hour keeps
             at least 24px (a usable tap target), so on a phone the grid scrolls sideways in its
             own box rather than shrinking every hour to a 7px dot. w-max lets the grid be wider
             than the box, which the sticky day names need; min-w-full still fills a wide card.
             Padding right and below only: the ring of an edge cell would be clipped, and on the
             left the cells would show past the pinned day names. -->
        <div class="overflow-x-auto overscroll-x-contain pr-1 pb-1">
          <div class="grid gap-1 w-max min-w-full grid-cols-[3.25rem_repeat(24,minmax(1.5rem,1fr))]">
            <span class="sticky left-0 z-10 bg-[color:var(--surface-raised)]"></span>
            <!-- Two digits on a 24-hour clock ("06", "22"): a column is about 12px wide on a phone,
                 which "22:00" would overrun. The pill and the drill-down say the full hour. -->
            @for (hour of hours; track hour) {
              <span class="text-[11px] text-center text-[color:var(--text-muted)] tabular">
                @if (hour % 2 === 0) { {{ axisHour(hour) }} }
              </span>
            }

            @for (row of rows(); track row.day) {
              <span class="sticky left-0 z-10 self-stretch flex items-center bg-[color:var(--surface-raised)]
                           text-xs text-[color:var(--text-secondary)] pr-1 whitespace-nowrap">
                {{ row.day.slice(0, 3) }}
              </span>
              @for (cell of row.cells; track cell.hour) {
                <!-- ring-offset asked for var(--surface): a token this app never defines (only
                     --surface-page/-raised/-sunken/-inset/-code/-inverse exist). An invalid
                     --tw-ring-offset-color invalidates the whole composed box-shadow, so hover,
                     focus AND selection drew NOTHING, in either theme -- the cell had no
                     selection affordance at all. The three states now share --focus-ring and
                     separate by weight: a 1px hint on hover, 2px for focus and for selection. -->
                <button type="button"
                        class="aspect-square w-full rounded-sm relative
                               ring-offset-1 ring-offset-[color:var(--surface-raised)]
                               ring-[color:var(--focus-ring)]
                               transition-[box-shadow,opacity]
                               hover:ring-1
                               focus-visible:outline-none focus-visible:ring-2
                               disabled:cursor-default"
                        [style.background]="background(cell.value)"
                        [class.ring-2]="isSelected(row.day, cell.hour)"
                        [disabled]="!cell.value"
                        (mouseenter)="hovered.set({ day: row.day, cell })"
                        (mouseleave)="hovered.set(null)"
                        (focus)="hovered.set({ day: row.day, cell })"
                        (blur)="hovered.set(null)"
                        (click)="cellClicked.emit({ day: row.day, hour: cell.hour, key: cell.key, keys: cell.keys, value: cell.value })">
                  <span class="sr-only">{{ tooltip(row.day, cell) }}</span>
                </button>
              }
            }
          </div>
        </div>

        <!-- Reserving the row keeps the legend from jumping as the pointer moves; my-2 keeps
             the pill off the legend below as well as the grid above. -->
        <div class="h-6 my-2 flex items-center">
          @if (hovered(); as hover) {
            <span class="text-xs px-2 py-1 rounded-md tabular bg-sunken text-primary">
              <span class="font-medium">{{ hover.day }} {{ hourRange(hover.cell.hour) }}</span>
              <span class="text-[color:var(--text-secondary)]">
                &middot; {{ hover.cell.value }} run{{ hover.cell.value === 1 ? '' : 's' }}
                @if ((hover.cell.keys?.length ?? 0) > 1) { &middot; across {{ hover.cell.keys!.length }} dates }
                @else if (hover.cell.key) { &middot; {{ dayLabel(hover.cell.key) }} }
              </span>
            </span>
          }
        </div>

        <div class="flex items-center gap-2 text-[11px] text-[color:var(--text-muted)]">
          <span>Less</span>
          @for (step of legend; track step) {
            <span class="size-3 rounded-sm" [style.background]="background(step * max())"></span>
          }
          <span>More</span>
          <span class="ml-auto">Busiest hour: {{ max() }} run{{ max() === 1 ? '' : 's' }}</span>
        </div>
      </div>
    } @else {
      <p class="text-sm text-[color:var(--text-muted)] py-10 text-center">No activity in this range.</p>
    }
  `,
})
export class Heatmap {
  readonly data = input.required<HeatCell[]>();
  readonly selected = input<{ day: string; hour: number } | null>(null);
  readonly cellClicked = output<HeatSelection>();

  readonly hours = HOURS;
  readonly hovered = signal<{ day: string; cell: HeatCell } | null>(null);
  readonly legend = [0, 0.25, 0.5, 0.75, 1];

  readonly rows = computed(() => {
    const byDay = new Map<string, Map<number, HeatCell>>();
    for (const cell of this.data()) {
      if (!byDay.has(cell.day)) byDay.set(cell.day, new Map());
      const hours = byDay.get(cell.day)!;
      const prev = hours.get(cell.hour);
      const value = (prev?.value ?? 0) + (cell.value ?? 0);
      const keys = [...(prev?.keys ?? [])];
      if (cell.key && cell.value && !keys.includes(cell.key)) keys.push(cell.key);
      keys.sort();
      hours.set(cell.hour, { day: cell.day, hour: cell.hour, value, keys, key: keys[keys.length - 1] ?? cell.key });
    }
    return DAY_ORDER.filter(day => byDay.has(day)).map(day => ({
      day,
      cells: HOURS.map(hour => byDay.get(day)!.get(hour)
        ?? { day, hour, value: 0, key: undefined, keys: [] }),
    }));
  });

  /** The busiest cell as drawn, so the legend never names a figure no cell shows. */
  readonly max = computed(() => Math.max(1, ...this.rows().flatMap(row => row.cells.map(c => c.value))));

  background(value: number): string {
    if (!value) return 'var(--surface-sunken)';
    // Square-root keeps quiet hours distinguishable from empty ones when one hour dominates.
    const intensity = Math.sqrt(value / this.max());
    // --heat, NOT --color-brand-500. That token is a near-black since the monochrome rebrand, so
    // mixing it with transparent over a near-black page gave the same black square at every
    // intensity: the whole grid, and the Less-to-More legend with it, was invisible in dark mode
    // while the caption underneath reported 83 runs in the busiest hour. --heat is defined per
    // theme and runs toward the light on a dark ground.
    return `color-mix(in srgb, var(--heat) ${Math.round(15 + intensity * 85)}%, transparent)`;
  }

  isSelected(day: string, hour: number): boolean {
    const selection = this.selected();
    return !!selection && selection.day === day && selection.hour === hour;
  }

  /**
   * What a screen reader hears for a cell, and what the pill says: the hour as the bucket it is
   * ("22:00–23:00", which is what the drill-down lists) and, for a single date, which one.
   */
  tooltip(day: string, cell: HeatCell): string {
    const at = `${day} ${hourRange(cell.hour)}`;
    if (!cell.value) return `${at} — no runs`;
    const dates = cell.keys?.length ?? 0;
    return `${at} — ${cell.value} run${cell.value === 1 ? '' : 's'}`
      + (dates > 1 ? ` across ${dates} dates` : cell.key ? ` on ${dayLabel(cell.key)}` : '');
  }

  /** The console's one way of writing an hour and a day (shared/ui/time-format.ts), for the template. */
  protected readonly axisHour = axisHour;
  protected readonly hourRange = hourRange;
  protected readonly dayLabel = dayLabel;
}
