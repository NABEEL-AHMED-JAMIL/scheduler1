import { Component, computed, input, output, signal } from '@angular/core';

export interface HeatCell { day: string; hour: number; value: number; key?: string; }
export interface HeatSelection { day: string; hour: number; key?: string; value: number; }

const DAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

@Component({
  selector: 'app-heatmap',
  template: `
    @if (rows().length) {
      <div class="w-full">
        <!-- Grid rather than a table: the columns then share the full width evenly
             instead of collapsing to content and leaving the card half empty. -->
        <div class="grid gap-1 w-full"
             [style.grid-template-columns]="'3.25rem repeat(24, minmax(0, 1fr))'">
          <span></span>
          @for (hour of hours; track hour) {
            <span class="text-[10px] text-center text-[color:var(--text-muted)] tabular">
              @if (hour % 2 === 0) { {{ hourLabel(hour) }} }
            </span>
          }

          @for (row of rows(); track row.day) {
            <span class="text-xs text-[color:var(--text-secondary)] pr-1 self-center whitespace-nowrap">
              {{ row.day.slice(0, 3) }}
            </span>
            @for (cell of row.cells; track cell.hour) {
              <button type="button"
                      class="aspect-square w-full rounded-[3px] relative
                             ring-offset-1 ring-offset-[color:var(--surface)]
                             transition-[box-shadow,opacity]
                             hover:ring-2 hover:ring-brand-400
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
                             disabled:cursor-default"
                      [style.background]="background(cell.value)"
                      [class.ring-2]="isSelected(row.day, cell.hour)"
                      [class.ring-brand-600]="isSelected(row.day, cell.hour)"
                      [disabled]="!cell.value"
                      (mouseenter)="hovered.set({ day: row.day, cell })"
                      (mouseleave)="hovered.set(null)"
                      (focus)="hovered.set({ day: row.day, cell })"
                      (blur)="hovered.set(null)"
                      (click)="cellClicked.emit({ day: row.day, hour: cell.hour, key: cell.key, value: cell.value })">
                <span class="sr-only">{{ tooltip(row.day, cell) }}</span>
              </button>
            }
          }
        </div>

        <!-- Reserving the row keeps the legend from jumping as the pointer moves. -->
        <div class="h-6 mt-2 flex items-center">
          @if (hovered(); as hover) {
            <span class="text-xs px-2 py-1 rounded-md tabular"
                  style="background: var(--surface-sunken); color: var(--text-primary);">
              <span class="font-medium">{{ hover.day }} {{ hourLabel(hover.cell.hour) }}</span>
              <span class="text-[color:var(--text-secondary)]">
                &middot; {{ hover.cell.value }} run{{ hover.cell.value === 1 ? '' : 's' }}
                @if (hover.cell.key) { &middot; {{ hover.cell.key }} }
              </span>
            </span>
          }
        </div>

        <div class="flex items-center gap-2 text-[11px] text-[color:var(--text-muted)]">
          <span>Less</span>
          @for (step of legend; track step) {
            <span class="size-3 rounded-[3px]" [style.background]="background(step * max())"></span>
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

  readonly max = computed(() => Math.max(1, ...this.data().map(c => c.value ?? 0)));

  readonly rows = computed(() => {
    const byDay = new Map<string, Map<number, HeatCell>>();
    for (const cell of this.data()) {
      if (!byDay.has(cell.day)) byDay.set(cell.day, new Map());
      byDay.get(cell.day)!.set(cell.hour, cell);
    }
    return DAY_ORDER.filter(day => byDay.has(day)).map(day => ({
      day,
      cells: HOURS.map(hour => byDay.get(day)!.get(hour)
        ?? { day, hour, value: 0, key: undefined }),
    }));
  });

  background(value: number): string {
    if (!value) return 'var(--surface-sunken)';
    // Square-root keeps quiet hours distinguishable from empty ones when one hour dominates.
    const intensity = Math.sqrt(value / this.max());
    return `color-mix(in srgb, var(--color-brand-500) ${Math.round(15 + intensity * 85)}%, transparent)`;
  }

  isSelected(day: string, hour: number): boolean {
    const selection = this.selected();
    return !!selection && selection.day === day && selection.hour === hour;
  }

  tooltip(day: string, cell: HeatCell): string {
    return cell.value
      ? `${day} ${this.hourLabel(cell.hour)} — ${cell.value} run${cell.value === 1 ? '' : 's'}`
      : `${day} ${this.hourLabel(cell.hour)} — no runs`;
  }

  hourLabel(hour: number): string {
    if (hour === 0) return '12a';
    if (hour === 12) return '12p';
    return hour < 12 ? `${hour}a` : `${hour - 12}p`;
  }
}
