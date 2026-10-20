import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output } from '@angular/core';
import { FlowGraph } from '../../../shared/flow-graph/flow-graph';
import { FLOW_REVIEW, FLOW_START, StepChange, pipelineGraph } from '../../../shared/flow-graph/flow-adapters';
import { Icon } from '../../../shared/ui/icon';
import { Definition, Step, StepProblem, StepTaskEntry, canonicalStep } from './steps.model';
import { StepNames } from './step-names';

/**
 * Whether a draft step is saved as it is shown: not saved at all (no saved step has its key), or changed since. Every
 * step is new while the pipeline still runs as its legacy step (nothing saved).
 */
export function stepChange(step: Step, saved: readonly Step[] | null): StepChange {
  const was = saved?.find(s => s.key === step.key);
  if (!was) return 'new';
  return JSON.stringify(canonicalStep(was)) === JSON.stringify(canonicalStep(step)) ? null : 'changed';
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
      <div class="seg" role="group" aria-label="Layout">
        <button type="button" class="seg-btn" [class.seg-on]="direction() === 'TB'" [attr.aria-pressed]="direction() === 'TB'" (click)="direction.set('TB')"
                title="Top to bottom" aria-label="Top to bottom" data-test="flow-tb"><app-icon name="arrowDown" size="0.9em" /></button>
        <button type="button" class="seg-btn" [class.seg-on]="direction() === 'LR'" [attr.aria-pressed]="direction() === 'LR'" (click)="direction.set('LR')"
                title="Left to right" aria-label="Left to right" data-test="flow-lr"><app-icon name="arrowRight" size="0.9em" /></button>
      </div>
    </div>
    <div class="sf-canvas rounded-lg border border-subtle overflow-hidden">
      <app-flow-graph [nodes]="graph().nodes" [edges]="graph().edges" [selected]="selected()" [direction]="direction()" [minFit]="0.8"
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

  readonly problemCount = computed(() => Object.values(this.problems()).filter(p => p?.length).length);
  readonly unsavedCount = computed(() => this.graph().nodes.filter(n => n.pending).length);

  pick(id: string | null): void {
    if (!id || id === FLOW_START || id === FLOW_REVIEW) return;
    const index = this.definition().steps.findIndex(s => s.key === id);
    if (index >= 0) this.open.emit(index);
  }
}
