import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { FlowGraph } from '../../../shared/flow-graph/flow-graph';
import { FlowEdge, FlowNode } from '../../../shared/flow-graph/flow-graph.model';
import { MapBasis, countText, durationText, runGraph } from '../../../shared/flow-graph/flow-adapters';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { StepExecution, StepTimeline } from './run-steps.model';
import { createTableSort } from '../../../shared/ui/sort';
import { SortHeader } from '../../../shared/ui/sort-header';

export type { MapBasis } from '../../../shared/flow-graph/flow-adapters';
export { durationText, stepKind } from '../../../shared/flow-graph/flow-adapters';

/**
 * A run's steps as a plan map: the shared run adapter (shared/flow-graph) over the timeline -- each step's time and rows,
 * the failed or slowest step highlighted. Pure, for the spec.
 */
export function runMap(t: StepTimeline, basis: MapBasis): { nodes: FlowNode[]; edges: FlowEdge[]; hot: StepExecution | null } {
  return runGraph(t.steps, basis);
}

/** One task in the Overview: how many steps ran it and what they cost together. */
export interface TaskCost { task: string; count: number; value: number; share: number }

/** The tasks ranked by what they cost the run (the reference's "Overview": node type, count, total). */
export function byTask(t: StepTimeline, basis: MapBasis): TaskCost[] {
  const totals = new Map<string, { count: number; value: number }>();
  for (const s of t.steps) {
    const v = basis === 'time' ? s.durationMs ?? 0 : s.recordsOut ?? 0;
    const row = totals.get(s.task) ?? { count: 0, value: 0 };
    totals.set(s.task, { count: row.count + 1, value: row.value + v });
  }
  const max = Math.max(1, ...Array.from(totals.values()).map(r => r.value));
  return Array.from(totals.entries()).map(([task, r]) => ({ task, ...r, share: r.value / max })).sort((a, b) => b.value - a.value);
}

/**
 * Run logs › Steps › Map: the run's steps on the flow-graph canvas with their time and rows, the failed or slowest step
 * highlighted, switchable between time and rows (what each node's bar and the overview rank by), and an overview of
 * the tasks by cost. Core's step timeline records time and rows; it has no memory or spill figures yet.
 */
@Component({
  selector: 'app-run-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FlowGraph, Segmented, SortHeader],
  styles: [`
    .rm-grid { display: grid; gap: 0.75rem; }
    @media (min-width: 1280px) { .rm-grid { grid-template-columns: minmax(0, 1fr) 17rem; } }
    .rm-canvas { height: 30rem; }
    .rm-bar { height: 0.375rem; border-radius: 9999px; background: var(--surface-sunken); overflow: hidden; }
    .rm-fill { height: 100%; border-radius: 9999px; background: var(--accent-mark); }
    .rm-task { max-width: 0; width: 50%; }
  `],
  template: `
    @let m = map();
    <div class="flex flex-col gap-3 px-4 py-3" data-test="run-map">
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="text-[color:var(--text-secondary)]">Showing by</span>
        <app-segmented [(value)]="basis" [options]="bases" ariaLabel="Map basis" />
        @if (m.hot; as h) {
          <span class="text-xs ml-auto" [class]="h.status === 'Failed' ? 'text-crit-500' : 'text-[color:var(--text-secondary)]'" data-test="run-map-hot">
            {{ h.status === 'Failed' ? 'Failed at' : 'Slowest:' }} <span class="mono">{{ h.key }}</span> · {{ time(h.durationMs) }}
          </span>
        }
      </div>
      <div class="rm-grid">
        <div class="rm-canvas rounded-lg border border-subtle overflow-hidden">
          <app-flow-graph [nodes]="m.nodes" [edges]="m.edges" [selected]="selected()" direction="LR" [minFit]="0.75" ariaLabel="Run plan map"
                          (select)="selected.set($event)" />
        </div>
        <section class="rounded-lg border border-subtle px-3 py-2.5 flex flex-col gap-2 min-w-0" aria-label="Overview">
          <h3 class="text-sm font-semibold">Overview</h3>
          <table class="w-full text-xs">
            <thead><tr class="text-left text-[color:var(--text-muted)]"><th class="font-medium py-1" appSort="task" [sortBy]="sort">Task</th>
              <th class="font-medium" appSort="count" [sortBy]="sort">Steps</th>
              <th class="font-medium text-right" appSort="value" [sortBy]="sort">{{ basis() === 'time' ? 'Time' : 'Rows out' }}</th></tr></thead>
            <tbody>
              @for (r of sortedOverview(); track r.task) {
                <tr class="border-t border-subtle" [attr.data-task]="r.task">
                  <td class="rm-task mono py-1.5 pr-2 truncate" [title]="r.task">{{ r.task }}</td>
                  <td class="tabular-nums">{{ r.count }}</td>
                  <td class="text-right tabular-nums">
                    {{ basis() === 'time' ? time(r.value) : rows(r.value) }}
                    <div class="rm-bar mt-1"><div class="rm-fill" [style.width.%]="r.share * 100"></div></div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <p class="text-[11px] text-[color:var(--text-muted)]">Core's step timeline records time and rows; memory and spill are not measured yet.</p>
        </section>
      </div>
    </div>
  `,
})
export class RunMap {
  readonly timeline = input.required<StepTimeline>();
  readonly basis = signal<MapBasis>('time');
  readonly bases: SegmentOption<MapBasis>[] = [{ id: 'time', label: 'Time', icon: 'clock' }, { id: 'rows', label: 'Rows', icon: 'table' }];
  readonly selected = signal<string | null>(null);

  readonly map = computed(() => runMap(this.timeline(), this.basis()));
  readonly overview = computed(() => byTask(this.timeline(), this.basis()));
  /**
   * Owner 2026-10-27: the Overview's columns sort; it starts ranked by cost (time or rows out, by the basis), as it
   * always was.
   */
  readonly sort = createTableSort<TaskCost>({
    id: 'run-map-overview',
    columns: {
      task: r => r.task,
      count: { value: r => r.count, kind: 'number' },
      value: { value: r => r.value, kind: 'number' },
    },
    initial: { key: 'value', direction: 'desc' },
  });
  readonly sortedOverview = computed(() => this.sort.apply(this.overview()));

  time(ms: number | null | undefined): string { return durationText(ms); }
  rows(n: number): string { return countText(n); }
}
