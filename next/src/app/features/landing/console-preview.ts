import { Component, signal } from '@angular/core';
import { Icon } from '../../shared/ui/icon';

type View = 'dashboard' | 'jobs' | 'review' | 'reports';

/**
 * A working stand-in for the console, shown on the landing page: Home, Runs, Review and Reports, as the menu names them.
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
    .dim        { color: color-mix(in srgb, var(--preview-ink) 55%, transparent); }
    .key        { color: color-mix(in srgb, var(--preview-ink) 92%, transparent); }
    .live       { background: var(--preview-ok-bar); }

    .tab        { color: color-mix(in srgb, var(--preview-ink) 60%, transparent); border-bottom: 2px solid transparent; }
    .tab:hover  { color: color-mix(in srgb, var(--preview-ink) 85%, transparent); }
    .tab.on     { color: var(--preview-accent); border-bottom-color: var(--preview-edge); }

    .chip-ok    { background: color-mix(in srgb, var(--preview-ok-fill) 16%, transparent);   color: var(--preview-ok); }
    .chip-run   { background: color-mix(in srgb, var(--preview-run) 30%, transparent);       color: var(--preview-accent); }
    .chip-wait  { background: color-mix(in srgb, var(--preview-line) 9%, transparent);
                  color: color-mix(in srgb, var(--preview-ink) 72%, transparent); }
    .chip-fail  { background: color-mix(in srgb, var(--preview-fail-fill) 18%, transparent); color: var(--preview-fail); }

    .bar, .bar-idle, .bar-ok, .bar-fail { border-radius: var(--radius-sm); }
    .bar        { background: color-mix(in srgb, var(--preview-bar) 85%, transparent); }
    .bar-idle   { background: color-mix(in srgb, var(--preview-line) 14%, transparent); }
    .bar-ok     { background: color-mix(in srgb, var(--preview-ok-bar) 80%, transparent); }
    .bar-fail   { background: color-mix(in srgb, var(--preview-fail-fill) 55%, transparent); }

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
              <span class="flex-1">Pipeline</span>
              <span class="w-24 hidden sm:block">When</span>
              <span class="w-20 text-right">Status</span>
            </div>
            @for (row of jobRows; track row.name) {
              <div class="panel-row px-4 py-3 flex items-center gap-3">
                <div class="flex-1 min-w-0">
                  <div class="text-[13px] key truncate">{{ row.name }}</div>
                  <div class="text-[11px] dim mono truncate">{{ row.trigger }}</div>
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

        @case ('review') {
          <div class="view">
            <div class="px-4 py-2.5 flex items-center gap-3 text-[11px] dim uppercase tracking-wider">
              <span class="flex-1">Waiting for review</span>
              <span class="w-20 hidden sm:block">Kind</span>
              <span class="w-16 text-right">Waiting</span>
            </div>
            @for (row of reviewRows; track row.name) {
              <div class="panel-row px-4 py-3 flex items-center gap-3">
                <div class="flex-1 min-w-0">
                  <div class="text-[13px] key truncate">{{ row.name }}</div>
                  <div class="text-[11px] dim truncate">{{ row.note }}</div>
                </div>
                <div class="w-20 hidden sm:block"><span class="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap" [class]="row.chip">{{ row.kind }}</span></div>
                <div class="w-16 text-right text-[11px] dim mono">{{ row.waiting }}</div>
              </div>
            }
            <div class="px-4 py-3 flex items-center gap-2 text-[11px] dim">
              <app-icon name="sparkle" size="0.85em" />
              <span>A model's answer is a draft until a person approves it</span>
            </div>
          </div>
        }

        @case ('reports') {
          <div class="view">
            <div class="px-4 py-2.5 flex items-center gap-3 text-[11px] dim uppercase tracking-wider">
              <span class="flex-1">Report</span>
              <span class="w-14 hidden sm:block">Version</span>
              <span class="w-24 text-right">Approval</span>
            </div>
            @for (row of reportRows; track row.name) {
              <div class="panel-row px-4 py-3 flex items-center gap-3">
                <div class="flex-1 min-w-0">
                  <div class="text-[13px] key truncate">{{ row.name }}</div>
                  <div class="text-[11px] dim truncate">{{ row.from }}</div>
                </div>
                <div class="w-14 hidden sm:block text-[11px] dim mono">v{{ row.version }}</div>
                <div class="w-24 flex justify-end">
                  <span class="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap" [class]="row.chip">{{ row.state }}</span>
                </div>
              </div>
            }
            <div class="px-4 py-3 flex items-center gap-2 text-[11px] dim">
              <app-icon name="shield" size="0.85em" />
              <span>Approved by someone other than who generated it, and digitally signed</span>
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
    { id: 'dashboard', label: 'Home' },
    { id: 'jobs', label: 'Runs' },
    { id: 'review', label: 'Review' },
    { id: 'reports', label: 'Reports' },
  ];

  readonly tiles = [
    { label: 'Schedules', value: 40 },
    { label: 'Running now', value: 2 },
    { label: 'To review', value: 7 },
    { label: 'Completed', value: 914 },
  ];

  /** Relative heights; a zero is a quiet day rather than a missing one. */
  readonly weekBars = [38, 62, 45, 88, 54, 0, 0, 71, 96, 60, 42, 78];

  /** Runs › Latest: each schedule's newest run, by its pipeline. Invented, domain-neutral rows (b97b1880). */
  readonly jobRows = [
    { name: 'Orders import', trigger: 'Nightly load', schedule: 'Daily 03:00', status: 'Completed', chip: 'chip-ok' },
    { name: 'Customer sync', trigger: 'Hourly refresh', schedule: 'Hourly', status: 'Running', chip: 'chip-run' },
    { name: 'Supplier invoices', trigger: 'Email-in', schedule: 'On arrival', status: 'To review', chip: 'chip-wait' },
    { name: 'Web log archive', trigger: 'Fortnightly', schedule: 'Every 2 wks', status: 'Failed', chip: 'chip-fail' },
    { name: 'Ledger export', trigger: 'Month end', schedule: 'Last day', status: 'Completed', chip: 'chip-ok' },
  ];

  /** Waiting for a person: an approval, a run's results, a document -- the three kinds Review lists. Invented rows. */
  readonly reviewRows = [
    { name: 'Orders import — run 1840', note: 'Results held for review: 3 rows flagged', kind: 'Run', chip: 'chip-run', waiting: '12 min' },
    { name: 'Supplier invoice INV-2207', note: '2 values to check, least sure: total', kind: 'Document', chip: 'chip-wait', waiting: '40 min' },
    { name: 'Ledger export — month end', note: 'Approval step: the finance lead signs off', kind: 'Approval', chip: 'chip-ok', waiting: '2 h' },
  ];

  /** The Reports library: every version kept, approved and signed by a person. Invented rows. */
  readonly reportRows = [
    { name: 'Monthly operations summary', from: 'From the pipeline Orders import', version: 3, state: 'Signed', chip: 'chip-ok' },
    { name: 'Weekly inventory report', from: 'Created by hand from a dataset', version: 12, state: 'Not approved yet', chip: 'chip-wait' },
    { name: 'Quarterly supplier review', from: 'From the pipeline Ledger export', version: 2, state: 'Void', chip: 'chip-fail' },
  ];
}
