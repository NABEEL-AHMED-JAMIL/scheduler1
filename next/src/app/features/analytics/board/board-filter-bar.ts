import { Component, computed, input, output } from '@angular/core';
import { Icon } from '../../../shared/ui/icon';
import { DateRange, DateRangePicker, RangePreset } from '../../../shared/ui/date-range';
import { BoardFilterChip } from './board-filter-chip';
import { BoardFilterDef, BoardFilterState, activeCount, dateFilterOf, withValues } from './board-filters';

/** The presets a board's date range offers: dashboards read months and years, not today. */
export const BOARD_PRESETS: RangePreset[] = ['30d', '90d', '12m', 'ytd', 'all'];

/**
 * A board's filter bar: the date range, then one chip per dimension filter its editor defined, then Clear all.
 *
 *   [▾ Date  30 days | 90 days | 12 months | This year | All time | Custom]  [Department: All ▾] [Hospital: 3 ▾]  Clear all
 *
 * It owns nothing: the board holds the state, puts it in the URL and the viewer's storage, and re-runs its tiles when
 * it changes. A viewer gets the same bar as an editor -- filtering is reading -- and only the editor's "Edit filters"
 * changes what the bar offers.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-board-filter-bar',
  imports: [Icon, DateRangePicker, BoardFilterChip],
  host: { class: 'board-filter-bar' },
  styles: `
    :host { display: block; }
    .bfb { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.75rem; padding: 0.625rem 0.875rem; }
    .bfb-group { display: inline-flex; align-items: center; gap: 0.5rem; min-width: 0; }
    .bfb-label { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); }
    .bfb-sep { width: 1px; align-self: stretch; background: var(--border-subtle); margin: 0 0.125rem; }
    .bfb-end { margin-left: auto; display: inline-flex; align-items: center; gap: 0.25rem; }
  `,
  template: `
    <div class="card bfb" role="region" aria-label="Board filters" data-test="board-filter-bar">
      <app-icon name="filter" class="icon-muted" size="0.95em" />
      @if (dateDef(); as def) {
        <div class="bfb-group">
          <span class="bfb-label">{{ def.label }}</span>
          <app-date-range [value]="rangeValue()" [presets]="presets" [label]="def.label + ' range'" (rangeChange)="setRange($event)" />
        </div>
        @if (valueDefs().length) { <span class="bfb-sep" aria-hidden="true"></span> }
      }
      @for (def of valueDefs(); track def.key) {
        <app-board-filter-chip [def]="def" [values]="state().values[def.key] ?? []" [boardId]="boardId()" (changed)="setValues(def.key, $event)" />
      }
      <div class="bfb-end">
        @if (active()) {
          <button type="button" class="btn btn-ghost btn-xs" data-test="bf-clear-all" (click)="clearAll()"><app-icon name="close" size="0.85em" />Clear all</button>
        }
        @if (canEdit()) {
          <button type="button" class="btn btn-default btn-xs" data-test="bf-edit" (click)="edit.emit()"><app-icon name="settings" size="0.9em" />Edit filters</button>
        }
      </div>
    </div>
  `,
})
export class BoardFilterBar {
  readonly defs = input.required<BoardFilterDef[]>();
  readonly state = input.required<BoardFilterState>();
  readonly canEdit = input(false);
  /** ZT-A13: the board the bar is on, handed to each chip's values read. */
  readonly boardId = input<number | null>(null);
  readonly stateChange = output<BoardFilterState>();
  readonly edit = output<void>();

  readonly presets = BOARD_PRESETS;
  readonly dateDef = computed(() => dateFilterOf(this.defs()));
  readonly valueDefs = computed(() => this.defs().filter(def => def.kind === 'values'));
  /** The range the control shows: All time when the board holds none. */
  readonly rangeValue = computed<DateRange>(() => this.state().range ?? { from: '', to: '', preset: 'all' });
  readonly active = computed(() => activeCount(this.defs(), this.state()) > 0);

  setRange(range: DateRange): void {
    const next = range.preset === 'all' || (!range.from && !range.to) ? null : range;
    this.stateChange.emit({ ...this.state(), range: next });
  }

  setValues(key: string, values: string[]): void {
    this.stateChange.emit(withValues(this.state(), key, values));
  }

  clearAll(): void {
    this.stateChange.emit({ values: {}, range: null });
  }
}
