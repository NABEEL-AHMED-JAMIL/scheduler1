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
  styles: [`
    :host { display: block; }
    .panel      { background: #1d1c16; border: 1px solid rgb(255 255 255 / 0.09);
                  box-shadow: 0 24px 60px -20px rgb(0 0 0 / 0.55); }
    .panel-head { background: rgb(255 255 255 / 0.035); border-bottom: 1px solid rgb(255 255 255 / 0.07); }
    .panel-row  { border-bottom: 1px solid rgb(255 255 255 / 0.05); }
    .dim        { color: rgb(251 249 239 / 0.55); }
    .key        { color: rgb(251 249 239 / 0.92); }

    .tab        { color: rgb(251 249 239 / 0.6); border-bottom: 2px solid transparent; }
    .tab:hover  { color: rgb(251 249 239 / 0.85); }
    .tab.on     { color: #efe3a9; border-bottom-color: #d9b812; }

    .chip-ok    { background: rgb(34 197 94 / 0.16);   color: #86efac; }
    .chip-run   { background: rgb(114 96 6 / 0.30);    color: #efe3a9; }
    .chip-wait  { background: rgb(255 255 255 / 0.09); color: rgb(251 249 239 / 0.72); }
    .chip-fail  { background: rgb(244 63 94 / 0.18);   color: #fda4af; }

    .bar        { background: rgb(233 212 103 / 0.85); border-radius: 2px; }
    .bar-idle   { background: rgb(255 255 255 / 0.14); border-radius: 2px; }
    .bar-ok     { background: rgb(52 211 153 / 0.8);   border-radius: 2px; }
    .bar-fail   { background: rgb(244 63 94 / 0.55);   border-radius: 2px; }

    /* Swapping views should feel like the screen changed, not like the page reloaded. */
    .view { animation: fade .28s ease both; }
    @keyframes fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .view { animation: none; } }
  `],
  template: `
    <div class="panel rounded-xl overflow-hidden">
      <div class="panel-head px-4 pt-3 flex items-center gap-2">
        <span class="size-2 rounded-full" style="background: #34d399;"></span>
        <span class="text-xs key font-medium">ETL Console</span>
        <span class="text-[11px] dim ml-auto mono">preview</span>
      </div>

      <div class="px-4 flex items-center gap-4 panel-head" style="border-bottom-width: 1px;">
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
                  <div class="text-[10px] dim uppercase tracking-wider">{{ tile.label }}</div>
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
                <span class="size-2 rounded-sm" style="background: rgb(52 211 153 / .8);"></span>
                Completed 96%
              </span>
              <span class="flex items-center gap-1.5">
                <span class="size-2 rounded-sm" style="background: rgb(244 63 94 / .55);"></span>
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
            <div class="overflow-hidden rounded" style="border: 1px solid rgb(255 255 255 / .08);">
              <div class="px-3 py-2 flex items-center gap-3 text-[10px] dim uppercase tracking-wider"
                   style="background: rgb(255 255 255 / .03);">
                <span class="flex-1">Task</span>
                <span class="w-16 text-right">Completed</span>
                <span class="w-12 text-right">Failed</span>
                <span class="w-12 text-right">Total</span>
              </div>
              @for (row of reportRows; track row.task) {
                <div class="px-3 py-2 flex items-center gap-3 text-[12px] panel-row">
                  <span class="flex-1 key truncate">{{ row.task }}</span>
                  <span class="w-16 text-right mono" style="color:#86efac;">{{ row.done }}</span>
                  <span class="w-12 text-right mono" style="color:#fda4af;">{{ row.failed }}</span>
                  <span class="w-12 text-right mono key">{{ row.done + row.failed }}</span>
                </div>
              }
            </div>
            <!-- Scaled against the largest column rather than by a fixed divisor: at done/2 a
                 96 became 48px inside a 40px box, so every bar overflowed and they all looked
                 the same height. -->
            <div class="mt-3 flex items-end gap-1.5" style="height: 44px;">
              @for (row of reportRows; track row.task) {
                <div class="flex-1 flex flex-col justify-end gap-px">
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
    const tallest = Math.max(...this.reportRows.map(r => r.done + r.failed));
    return Math.round((value / tallest) * 42);
  }

  readonly reportRows = [
    { task: 'Port disruption history', done: 96, failed: 2 },
    { task: 'Catastrophe claims', done: 74, failed: 5 },
    { task: 'Cat bond loss history', done: 61, failed: 0 },
    { task: 'Crop origin weather', done: 48, failed: 3 },
  ];
}
