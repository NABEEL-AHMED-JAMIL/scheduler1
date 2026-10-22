import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output } from '@angular/core';
import { FlowEdge, FlowNode, FlowNodeKind } from '../../../shared/flow-graph/flow-graph.model';
import { FlowGraph } from '../../../shared/flow-graph/flow-graph';
import { FLOW_REVIEW, FLOW_START, FlowGraphData, StepChange, pipelineGraph } from '../../../shared/flow-graph/flow-adapters';
import { Icon } from '../../../shared/ui/icon';
import { Definition, Step, StepProblem, StepTaskEntry, canonicalStep } from './steps.model';
import { StepNames } from './step-names';
import { Stage, StageGroup, stageGroups } from './overview';

/**
 * Whether a draft step is saved as it is shown: not saved at all (no saved step has its key), or changed since. Every
 * step is new while the pipeline still runs as its legacy step (nothing saved).
 */
export function stepChange(step: Step, saved: readonly Step[] | null): StepChange {
  const was = saved?.find(s => s.key === step.key);
  if (!was) return 'new';
  return JSON.stringify(canonicalStep(was)) === JSON.stringify(canonicalStep(step)) ? null : 'changed';
}

/** A stage run's id on the canvas: its stage and its first step's key (stable while steps are added before it). */
export function stageNodeId(g: StageGroup): string { return `stage:${g.stage.id}:${g.steps[0].step.key}`; }

const STAGE_KIND: Record<Stage, FlowNodeKind> = { read: 'read', check: 'process', transform: 'process', ai: 'ai', review: 'review', write: 'output' };

/**
 * Owner 2026-10-20: a long pipeline's flow is a big tree -- a run of steps of one stage (the list's stage groups) can be
 * folded into one node, "Transform · 8 steps", the way the list groups them. Edges into or out of a folded step go to its
 * node; edges inside it go; the same edge twice is drawn once. A folded node carries its steps' problems and unsaved marks.
 */
export function collapseStages(graph: FlowGraphData, groups: readonly StageGroup[], folded: ReadonlySet<string>): FlowGraphData {
  const owner = new Map<string, string>();
  const nodes: FlowNode[] = [];
  const byId = new Map(graph.nodes.map(n => [n.id, n] as const));
  const foldedGroups = groups.filter(g => g.steps.length > 1 && folded.has(stageNodeId(g)));
  for (const g of foldedGroups) for (const { step } of g.steps) owner.set(step.key, stageNodeId(g));
  const emitted = new Set<string>();
  for (const n of graph.nodes) {
    const group = owner.get(n.id);
    if (!group) { nodes.push(n); continue; }
    if (emitted.has(group)) continue;
    emitted.add(group);
    const g = foldedGroups.find(x => stageNodeId(x) === group)!;
    const members = g.steps.map(({ step }) => byId.get(step.key)).filter((m): m is FlowNode => !!m);
    const problems = members.reduce((sum, m) => sum + (m.tone === 'crit' ? 1 : 0), 0);
    const unsaved = members.filter(m => m.pending).length;
    const badges: string[] = [];
    if (problems) badges.push(problems === 1 ? '1 step with problems' : `${problems} steps with problems`);
    if (unsaved) badges.push(`${unsaved} not saved`);
    const first = members[0]?.label ?? g.steps[0].step.key;
    const last = members[members.length - 1]?.label ?? '';
    nodes.push({
      id: group, label: `${g.stage.label} · ${g.steps.length} steps`, sub: `${first} … ${last}`, kind: STAGE_KIND[g.stage.id],
      tone: problems ? 'crit' : null, badges, pending: unsaved > 0,
      metrics: [{ label: 'Folded', value: 'click to open' }], metricsPerRow: 1,
    });
  }
  const seen = new Set<string>();
  const edges: FlowEdge[] = [];
  for (const e of graph.edges) {
    const from = owner.get(e.from) ?? e.from;
    const to = owner.get(e.to) ?? e.to;
    if (from === to) continue;
    const key = `${from}>${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ ...e, from, to, label: from !== e.from || to !== e.to ? null : e.label });
  }
  return { nodes, edges };
}

/**
 * The step builder's Flow view: the draft's steps on the shared flow-graph canvas -- the investigation-graph pattern the
 * AI Assistant draws its flows with -- each step a node with its task's icon, its name, its task and its first settings;
 * edges where its rows really come from (the step before, the step its input names, a join's other side, an append's
 * steps), the run's start before and the review gate after. A step with problems is marked crit, one not saved yet is
 * dashed. A node opens the same side panel the list does. Lazy: the step builder loads it only when the Flow view shows.
 */
@Component({
  selector: 'app-step-flow',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FlowGraph, Icon],
  styles: [`
    :host { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
    .sf-canvas { height: clamp(26rem, 68vh, 60rem); }
    .sf-dash { display: inline-block; width: 1rem; height: 0.625rem; border: 1.25px dashed var(--info-mark); border-radius: var(--radius-sm); }
  `],
  template: `
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--text-muted)]" data-test="flow-legend">
      <span>{{ definition().steps.length }} {{ definition().steps.length === 1 ? 'step' : 'steps' }}</span>
      @if (problemCount(); as n) { <span class="text-crit-500 flex items-center gap-1"><app-icon name="alert" size="0.9em" />{{ n }} with problems</span> }
      @if (unsavedCount(); as n) { <span class="flex items-center gap-1"><span class="sf-dash" aria-hidden="true"></span>{{ n }} not saved</span> }
      <span class="hidden md:inline">Dashed edges keep the run's order where a step reads no rows; a node opens its step.</span>
      <span class="flex-1"></span>
      @if (foldable().length) {
        <div class="flex flex-wrap items-center gap-1" role="group" aria-label="Fold the steps by stage" data-test="flow-stages">
          @for (g of foldable(); track g.id) {
            <button type="button" class="btn btn-ghost btn-xs" [attr.aria-pressed]="!isFolded(g.id)" [attr.data-stage]="g.id" (click)="toggle(g.id)"
                    [title]="(isFolded(g.id) ? 'Show ' : 'Fold ') + g.label + ' steps ' + g.range + ' (' + g.count + ')'">
              <app-icon [name]="isFolded(g.id) ? 'chevronRight' : 'chevronDown'" size="0.85em" />{{ g.label }} {{ g.range }}
            </button>
          }
          <button type="button" class="btn btn-ghost btn-xs" data-test="flow-fold-all" (click)="foldAll()" [disabled]="allFolded()">Collapse all</button>
          <button type="button" class="btn btn-ghost btn-xs" data-test="flow-open-all" (click)="openAll()" [disabled]="!folded().size">Expand all</button>
        </div>
      }
      <div class="seg" role="group" aria-label="Layout">
        <button type="button" class="seg-btn" [class.seg-on]="direction() === 'TB'" [attr.aria-pressed]="direction() === 'TB'" (click)="direction.set('TB')"
                title="Top to bottom" aria-label="Top to bottom" data-test="flow-tb"><app-icon name="arrowDown" size="0.9em" /></button>
        <button type="button" class="seg-btn" [class.seg-on]="direction() === 'LR'" [attr.aria-pressed]="direction() === 'LR'" (click)="direction.set('LR')"
                title="Left to right" aria-label="Left to right" data-test="flow-lr"><app-icon name="arrowRight" size="0.9em" /></button>
      </div>
    </div>
    <div class="sf-canvas rounded-lg border border-subtle overflow-hidden">
      <app-flow-graph [nodes]="shown().nodes" [edges]="shown().edges" [selected]="shownSelected()" [direction]="direction()" [minFit]="0.8"
                      ariaLabel="Pipeline steps as a flow" (select)="pick($event)">
        <p empty class="text-sm text-[color:var(--text-muted)]">No steps. Add one from the Task Registry: a pipeline has at least one.</p>
      </app-flow-graph>
    </div>
  `,
})
export class StepFlow {
  readonly definition = input.required<Definition>();
  /** The saved steps (null: nothing saved, the pipeline runs as its legacy step): what "not saved" compares with. */
  readonly saved = input<readonly Step[] | null>(null);
  readonly tasks = input<readonly StepTaskEntry[]>([]);
  readonly problems = input<Record<number, StepProblem[]>>({});
  readonly selected = input<string | null>(null);
  /** The pipeline's workspace: a platform administrator's name reads (an API request's) name it. Null: the reader's own. */
  readonly tenantId = input<number | null>(null);
  /** A step's node was picked: its index in the definition. */
  readonly open = output<number>();

  /** A short pipeline reads left to right; a long one top to bottom (left to right it is drawn too small). The viewer may switch. */
  readonly direction = linkedSignal<number, 'LR' | 'TB'>({
    source: () => this.definition().steps.length,
    computation: (count, previous) => previous?.value ?? (count > 6 ? 'TB' : 'LR'),
  });

  private readonly names = inject(StepNames);

  readonly graph = computed(() => {
    this.names.names();
    const d = this.definition();
    const saved = this.saved();
    const problems = this.problems();
    const review = d.settings?.review?.required ?? [];
    return pipelineGraph(d.steps, {
      tasks: this.tasks(),
      start: { label: 'Run starts', sub: d.source?.type === 'task' ? 'task payload' : 'no input' },
      startLabel: d.source?.type === 'task' ? 'payload' : 'starts',
      review,
      problems: i => problems[i]?.length ?? 0,
      change: s => stepChange(s as Step, saved),
      // UX review 2026-10-12: an id a step names is shown as the name of what it points at.
      names: this.names.lookupIn(this.tenantId()),
    });
  });

  /** The steps as the list's stage runs; only a run of two or more steps can fold. */
  readonly groups = computed(() => stageGroups(this.definition().steps as Step[], this.tasks() as StepTaskEntry[]));
  readonly foldable = computed(() => this.groups().filter(g => g.steps.length > 1)
    .map(g => ({ id: stageNodeId(g), label: g.stage.label, count: g.steps.length,
      range: `${g.start + 1}–${g.start + g.steps.length}` })));
  /** Folded stage runs. A long pipeline (more than 12 steps) opens folded; the viewer's choice holds while they stay. */
  readonly folded = linkedSignal<number, ReadonlySet<string>>({
    source: () => this.definition().steps.length,
    computation: (count, previous) => {
      const ids = new Set(this.foldable().map(f => f.id));
      if (previous) return new Set([...previous.value].filter(id => ids.has(id)));
      return count > 12 ? ids : new Set<string>();
    },
  });
  readonly allFolded = computed(() => this.foldable().every(f => this.folded().has(f.id)));
  readonly shown = computed(() => collapseStages(this.graph(), this.groups(), this.folded()));
  /** A selected step inside a folded run selects its run's node. */
  readonly shownSelected = computed(() => {
    const key = this.selected();
    if (!key) return null;
    const g = this.groups().find(x => x.steps.some(({ step }) => step.key === key));
    return g && this.folded().has(stageNodeId(g)) ? stageNodeId(g) : key;
  });

  isFolded(id: string): boolean { return this.folded().has(id); }
  toggle(id: string): void {
    const next = new Set(this.folded());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.folded.set(next);
  }
  foldAll(): void { this.folded.set(new Set(this.foldable().map(f => f.id))); }
  openAll(): void { this.folded.set(new Set()); }

  readonly problemCount = computed(() => Object.values(this.problems()).filter(p => p?.length).length);
  readonly unsavedCount = computed(() => this.graph().nodes.filter(n => n.pending).length);

  pick(id: string | null): void {
    if (!id || id === FLOW_START || id === FLOW_REVIEW) return;
    if (id.startsWith('stage:')) { if (this.folded().has(id)) this.toggle(id); return; }
    const index = this.definition().steps.findIndex(s => s.key === id);
    if (index >= 0) this.open.emit(index);
  }
}
