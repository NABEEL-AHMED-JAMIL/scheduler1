import { Component, signal } from '@angular/core';
import { Icon } from '../../shared/ui/icon';

type View = 'dashboard' | 'jobs' | 'reports';

/**
 * A working stand-in for the console, shown on the landing page.
 *
 * Built rather than screenshotted on purpose: it is drawn with the same tokens as the real
 * screens, so it follows the viewer's theme and cannot drift out of date the way an image
 * would, and it carries invented rows rather than a real tenant's jobs on a public page.
 *
 * Its own palette is fixed, though. It sits on the hero, which is one deep surface in both
 * themes, so its colours are stated here rather than taken from the page.
 */
@Component({
  selector: 'app-console-preview',
  imports: [Icon],
  styleUrls: ['./landing.tokens.css'],
  styles: [`
    :host { display: block; }
    /* Every colour is a token from landing.tokens.css; the alphas are the old rgb() ones. */
    .panel      { background: var(--preview-panel);
                  border: 1px solid color-mix(in srgb, var(--preview-line) 9%, transparent);
                  box-shadow: 0 24px 60px -20px color-mix(in srgb, var(--preview-shadow) 55%, transparent); }
    .panel-head { background: color-mix(in srgb, var(--preview-line) 3.5%, transparent);
                  border-bottom: 1px solid color-mix(in srgb, var(--preview-line) 7%, transparent); }
    .panel-row  { border-bottom: 1px solid color-mix(in srgb, var(--preview-line) 5%, transparent); }
    .frame      { border: 1px solid color-mix(in srgb, var(--preview-line) 8%, transparent); }
    .frame-head { background: color-mix(in srgb, var(--preview-line) 3%, transparent); }
    .dim        { color: color-mix(in srgb, var(--preview-ink) 55%, transparent); }
    .key        { color: color-mix(in srgb, var(--preview-ink) 92%, transparent); }
    .live       { background: var(--preview-ok-bar); }
    .is-ok      { color: var(--preview-ok); }
    .is-crit    { color: var(--preview-fail); }
    .is-warn    { color: var(--preview-warn); }

    .tab        { color: color-mix(in srgb, var(--preview-ink) 60%, transparent); border-bottom: 2px solid transparent; }
    .tab:hover  { color: color-mix(in srgb, var(--preview-ink) 85%, transparent); }
    .tab.on     { color: var(--preview-accent); border-bottom-color: var(--preview-edge); }

    .chip-ok    { background: color-mix(in srgb, var(--preview-ok-fill) 16%, transparent);   color: var(--preview-ok); }
    .chip-run   { background: color-mix(in srgb, var(--preview-run) 30%, transparent);       color: var(--preview-accent); }
    .chip-wait  { background: color-mix(in srgb, var(--preview-line) 9%, transparent);
                  color: color-mix(in srgb, var(--preview-ink) 72%, transparent); }
    .chip-fail  { background: color-mix(in srgb, var(--preview-fail-fill) 18%, transparent); color: var(--preview-fail); }

    .bar, .bar-idle, .bar-ok, .bar-fail, .bar-stop, .bar-skip { border-radius: var(--radius-sm); }
    .bar        { background: color-mix(in srgb, var(--preview-bar) 85%, transparent); }
    .bar-idle   { background: color-mix(in srgb, var(--preview-line) 14%, transparent); }
    .bar-ok     { background: color-mix(in srgb, var(--preview-ok-bar) 80%, transparent); }
    .bar-fail   { background: color-mix(in srgb, var(--preview-fail-fill) 55%, transparent); }
    .bar-stop   { background: color-mix(in srgb, var(--preview-stop) 35%, transparent); }
    .bar-skip   { background: color-mix(in srgb, var(--preview-warn-fill) 55%, transparent); }
    .bars       { height: 44px; }

    /* Swapping views should feel like the screen changed, not like the page reloaded. */
    .view { animation: fade .28s ease both; }
    @keyframes fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .view { animation: none; } }
  `],
  template: `
    <div class="panel rounded-card overflow-hidden">
      <div class="panel-head px-4 pt-3 flex items-center gap-2">
        <span class="size-2 rounded-full live"></span>
        <span class="text-xs key font-medium">ETL Console</span>
        <span class="text-[11px] dim ml-auto mono">preview</span>
      </div>

      <div class="px-4 flex items-center gap-4 panel-head">
        @for (t of tabs; track t.id) {
          <button type="button" class="tab text-xs py-2.5 transition-colors"
                  [class.on]="view() === t.id" (click)="view.set(t.id)">{{ t.label }}</button>
        }
      </div>

      @switch (view()) {
        @case ('dashboard') {
          <div class="view p-4">
            <!-- Two by two on a narrow screen: four across leaves 66px a tile, which is
                 not enough for a word like COMPLETED above a four-figure number. -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-3">
              @for (tile of tiles; track tile.label) {
                <div>
                  <div class="text-[11px] dim uppercase tracking-wider">{{ tile.label }}</div>
                  <div class="text-xl font-semibold key mt-0.5">{{ tile.value }}</div>
                </div>
              }
            </div>
            <div class="mt-4">
              <div class="text-[11px] dim uppercase tracking-wider mb-2">Runs this week</div>
              <div class="flex items-end gap-1 h-14">
                @for (bar of weekBars; track $index) {
                  <div class="flex-1" [class]="bar > 0 ? 'bar' : 'bar-idle'"
                       [style.height.%]="bar > 0 ? bar : 6"></div>
                }
              </div>
            </div>
            <div class="mt-4 flex items-center gap-4 text-[11px] dim">
              <span class="flex items-center gap-1.5">
                <span class="size-2 rounded-sm bar-ok"></span>
                Completed 96%
              </span>
              <span class="flex items-center gap-1.5">
                <span class="size-2 rounded-sm bar-fail"></span>
                Failed 4%
              </span>
            </div>
          </div>
        }

        @case ('jobs') {
          <div class="view">
            <div class="px-4 py-2.5 flex items-center gap-3 text-[11px] dim uppercase tracking-wider">
              <span class="flex-1">Job</span>
              <span class="w-24 hidden sm:block">Schedule</span>
              <span class="w-20 text-right">Status</span>
            </div>
            @for (row of jobRows; track row.name) {
              <div class="panel-row px-4 py-3 flex items-center gap-3">
                <div class="flex-1 min-w-0">
                  <div class="text-[13px] key truncate">{{ row.name }}</div>
                  <div class="text-[11px] dim mono truncate">{{ row.task }}</div>
                </div>
                <div class="w-24 hidden sm:block text-[11px] dim mono">{{ row.schedule }}</div>
                <div class="w-20 flex justify-end">
                  <span class="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap"
                        [class]="row.chip">{{ row.status }}</span>
                </div>
              </div>
            }
          </div>
        }

        @case ('reports') {
          <div class="view p-4">
            <div class="flex items-center gap-2 text-[11px] dim mb-3">
              <app-icon name="filter" size="0.85em" />
              <span class="mono">rows: task</span>
              <span class="mono">columns: outcome</span>
              <span class="mono ml-auto">measure: count</span>
            </div>
            <div class="overflow-hidden rounded-sm frame">
              <div class="px-3 py-2 flex items-center gap-3 text-[11px] dim uppercase tracking-wider frame-head">
                <span class="flex-1">Task</span>
                <!-- The same five outcome columns the real report has -- one per JobStatus that
                     ends a run -- so the preview does not promise a simpler table than the one
                     behind the sign-in. Abbreviated to fit a 500px panel; the full words are
                     in the title. -->
                <span class="w-12 text-right" title="Completed">Done</span>
                <span class="w-10 text-right" title="Failed">Failed</span>
                <span class="w-10 text-right" title="Interrupted">Intr.</span>
                <span class="w-10 text-right" title="Skipped">Skip</span>
                <span class="w-10 text-right" title="Missed">Miss</span>
                <span class="w-10 text-right">Total</span>
              </div>
              @for (row of reportRows; track row.task) {
                <div class="px-3 py-2 flex items-center gap-3 text-[12px] panel-row">
                  <span class="flex-1 key truncate">{{ row.task }}</span>
                  <span class="w-12 text-right mono is-ok">{{ row.done }}</span>
                  <span class="w-10 text-right mono" [class.is-crit]="!!row.failed" [class.dim]="!row.failed">{{ row.failed }}</span>
                  <span class="w-10 text-right mono" [class.is-crit]="!!row.stopped" [class.dim]="!row.stopped">{{ row.stopped }}</span>
                  <span class="w-10 text-right mono" [class.is-warn]="!!row.skipped" [class.dim]="!row.skipped">{{ row.skipped }}</span>
                  <span class="w-10 text-right mono" [class.is-warn]="!!row.missed" [class.dim]="!row.missed">{{ row.missed }}</span>
                  <span class="w-10 text-right mono key">{{ total(row) }}</span>
                </div>
              }
            </div>
            <!-- Scaled against the largest column rather than by a fixed divisor: at done/2 a
                 96 became 48px inside a 40px box, so every bar overflowed and they all looked
                 the same height. -->
            <div class="mt-3 flex items-end gap-1.5 bars">
              @for (row of reportRows; track row.task) {
                <div class="flex-1 flex flex-col justify-end gap-px">
                  <div class="bar-skip" [style.height.px]="barPx(row.skipped + row.missed)"></div>
                  <div class="bar-stop" [style.height.px]="barPx(row.stopped)"></div>
                  <div class="bar-fail" [style.height.px]="barPx(row.failed)"></div>
                  <div class="bar-ok" [style.height.px]="barPx(row.done)"></div>
                </div>
              }
            </div>
            <div class="mt-3 flex items-center gap-2 text-[11px] dim">
              <app-icon name="download" size="0.85em" />
              <span>Export as CSV or XLSX, to your machine or a bucket</span>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class ConsolePreview {
  readonly view = signal<View>('dashboard');

  readonly tabs: { id: View; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'jobs', label: 'Jobs' },
    { id: 'reports', label: 'Reports' },
  ];

  readonly tiles = [
    { label: 'Total jobs', value: 40 },
    { label: 'Active', value: 30 },
    { label: 'Running', value: 2 },
    { label: 'Completed', value: 914 },
  ];

  /** Relative heights; a zero is a quiet day rather than a missing one. */
  readonly weekBars = [38, 62, 45, 88, 54, 0, 0, 71, 96, 60, 42, 78];

  readonly jobRows = [
    { name: 'Port disruption — nightly load', task: 'Hurricane Data Task',
      schedule: 'Daily 03:00', status: 'Completed', chip: 'chip-ok' },
    { name: 'Claims baseline — hourly refresh', task: 'Catastrophe Claims',
      schedule: 'Hourly', status: 'Running', chip: 'chip-run' },
    { name: 'Cat bond loss — Mon and Thu', task: 'Loss History',
      schedule: 'Mon, Thu', status: 'Queued', chip: 'chip-wait' },
    { name: 'Story archive — fortnightly', task: 'Weather Story Archive',
      schedule: 'Every 2 wks', status: 'Failed', chip: 'chip-fail' },
    { name: 'Crop origin risk — month end', task: 'Weather Risk',
      schedule: 'Last day', status: 'Completed', chip: 'chip-ok' },
  ];

  /** Tallest column fills the box; everything else is drawn in proportion to it. */
  barPx(value: number): number {
    const tallest = Math.max(...this.reportRows.map(r => this.total(r)));
    return Math.round((value / tallest) * 42);
  }

  total(row: { done: number; failed: number; stopped: number; skipped: number; missed: number }): number {
    return row.done + row.failed + row.stopped + row.skipped + row.missed;
  }

  /** Every way a run can end, so the mock shows the same columns as the real table. */
  readonly reportRows = [
    { task: 'Port disruption history', done: 96, failed: 2, stopped: 1, skipped: 3, missed: 0 },
    { task: 'Catastrophe claims', done: 74, failed: 5, stopped: 0, skipped: 1, missed: 2 },
    { task: 'Cat bond loss history', done: 61, failed: 0, stopped: 0, skipped: 0, missed: 0 },
    { task: 'Crop origin weather', done: 48, failed: 3, stopped: 2, skipped: 4, missed: 1 },
  ];
}
