import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { FlowGraph } from '../../../shared/flow-graph/flow-graph';
import { FlowEdge, FlowNode, FlowNodeKind } from '../../../shared/flow-graph/flow-graph.model';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { StepExecution, StepTimeline } from './run-steps.model';

export type MapBasis = 'time' | 'rows';

/** A duration in the run's own words: ms under a second, then seconds, then minutes. */
export function durationText(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

function count(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('en-US');
}

/** A step's kind on the map, from its task: where rows come from, what is done to them, where they go. */
export function stepKind(task: string): FlowNodeKind {
  if (task === 'legacy') return 'legacy';
  if (task.startsWith('read_') || task === 'sample') return 'read';
  if (task === 'ai_prompt' || task === 'measure_image') return 'ai';
  if (['save_file', 'upload_bucket', 'render_pdf', 'send_notification', 'write_database', 'send_webhook'].includes(task)) return 'output';
  if (task === 'approval') return 'review';
  return 'process';
}

/**
 * A run's steps as a plan map (the "plan map" pattern from the design references): each step a node with its time and
 * rows in and out, a bar of its share of the run's time (or of the rows it wrote), the failed step marked and -- when
 * nothing failed -- the slowest one highlighted; edges carry the rows that passed. Pure, for the spec.
 */
export function runMap(t: StepTimeline, basis: MapBasis): { nodes: FlowNode[]; edges: FlowEdge[]; hot: StepExecution | null } {
  const steps = t.steps;
  const total = steps.reduce((sum, s) => sum + (basis === 'time' ? s.durationMs ?? 0 : s.recordsOut ?? 0), 0);
  const failed = steps.find(s => s.status === 'Failed') ?? null;
  const slowest = steps.filter(s => s.durationMs != null).sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))[0] ?? null;
  const hot = failed ?? (steps.length > 1 ? slowest : null);
  const nodes: FlowNode[] = steps.map(s => {
    const share = total ? (basis === 'time' ? s.durationMs ?? 0 : s.recordsOut ?? 0) / total : null;
    const badges: string[] = [];
    if (s.status && s.status !== 'Completed') badges.push(s.status);
    if (s === hot && !failed) badges.push('slowest');
    if (s.reusedFromAttempt != null) badges.push(`reused from attempt ${s.reusedFromAttempt}`);
    if ((s.tries ?? 1) > 1) badges.push(`${s.tries} tries`);
    return {
      id: s.key, label: s.key, sub: s.task, kind: stepKind(s.task),
      tone: s.status === 'Failed' ? 'crit' : s.status === 'Running' ? 'info' : s.status === 'Completed' ? null : 'neutral',
      badges,
      metrics: [
        { label: 'time', value: durationText(s.durationMs) },
        { label: 'share', value: share == null ? '—' : `${Math.round(share * 1000) / 10}%` },
        { label: 'rows in', value: count(s.recordsIn) },
        { label: 'rows out', value: count(s.recordsOut) },
      ],
      share, hot: s === hot,
    };
  });
  const edges: FlowEdge[] = steps.slice(1).map((s, i) => ({ from: steps[i].key, to: s.key,
    label: steps[i].recordsOut != null ? `${count(steps[i].recordsOut)} rows` : null, tone: steps[i].status === 'Failed' ? 'crit' : null }));
  return { nodes, edges, hot };
}

/** The tasks ranked by what they cost the run (the reference's "Overview": node type, count, total). */
export function byTask(t: StepTimeline, basis: MapBasis): { task: string; count: number; value: number; share: number }[] {
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
  imports: [FlowGraph, Segmented],
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
            <thead><tr class="text-left text-[color:var(--text-muted)]"><th class="font-medium py-1">Task</th><th class="font-medium">Steps</th>
              <th class="font-medium text-right">{{ basis() === 'time' ? 'Time' : 'Rows out' }}</th></tr></thead>
            <tbody>
              @for (r of overview(); track r.task) {
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

  time(ms: number | null | undefined): string { return durationText(ms); }
  rows(n: number): string { return count(n); }
}
