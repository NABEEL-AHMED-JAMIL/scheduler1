import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { FlowGraph } from '../../../shared/flow-graph/flow-graph';
import { Icon } from '../../../shared/ui/icon';
import { ToastService } from '../../../shared/ui/toast.service';
import { copyText } from '../../../shared/ui/clipboard.util';
import { SchemaForm } from '../../tasks/steps/schema-form';
import { StepsApi } from '../../tasks/steps/steps.service';
import { BucketChoice, JsonSchema, PromptChoice, StepTaskEntry } from '../../tasks/steps/steps.model';
import { CreatePipeline, CreatePipelineData, CreatedPipeline } from './create-pipeline';
import { FlowDefinition, PipelineFlowArtifact, flowVerdict, graphOf, withStepConfig } from './flow.model';
import { RunFollow } from './run-follow';

/**
 * The flow the assistant drew (AI workflow review), on the investigation-graph canvas: every step a node with its kind's
 * icon, edges labelled with what passes along them, zoom, fit, full screen and a minimap. A step's node opens what it
 * does and its settings, as the step builder's own form (the task's config schema); what the person fills there goes
 * into the definition Create pipeline saves -- through Core's endpoints, as them. Chat edits redraw it live: each new
 * design in the conversation replaces the one shown, and settings filled for a step the edit kept stay filled.
 */
@Component({
  selector: 'app-flow-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FlowGraph, Icon, SchemaForm, RouterLink, RunFollow],
  styles: [`
    .fp-canvas { min-height: 18rem; }
    .fp-inspector { max-height: 22rem; }
  `],
  template: `
    @if (flow(); as f) {
      <div class="flex flex-col gap-3 min-h-0 h-full" [attr.data-flow]="f.name">
        <div class="flex flex-wrap items-center gap-2 min-w-0">
          <app-icon name="layers" class="text-[color:var(--text-muted)] shrink-0" />
          <h3 class="font-semibold truncate min-w-0" [title]="f.name">{{ f.name }}</h3>
          <span class="pill" [class]="'pill pill-' + verdict().tone" data-verdict>{{ verdict().label }}</span>
          <span class="pill pill-neutral">{{ f.definition.steps.length }} steps</span>
          <span class="pill" [class]="created() ? 'pill pill-ok' : 'pill pill-neutral'">{{ created() ? 'Created' : 'Not saved' }}</span>
          <span class="flex-1"></span>
          <div class="seg" role="group" aria-label="Layout">
            <button type="button" class="seg-btn" [class.seg-on]="direction() === 'TB'" [attr.aria-pressed]="direction() === 'TB'" (click)="direction.set('TB')"
                    title="Top to bottom" aria-label="Top to bottom"><app-icon name="arrowDown" size="0.9em" /></button>
            <button type="button" class="seg-btn" [class.seg-on]="direction() === 'LR'" [attr.aria-pressed]="direction() === 'LR'" (click)="direction.set('LR')"
                    title="Left to right" aria-label="Left to right"><app-icon name="arrowRight" size="0.9em" /></button>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" (click)="copy()" title="Copy Core's definition as JSON"><app-icon name="copy" />JSON</button>
          @if (canCreate() && !created()) {
            <button type="button" class="btn btn-primary btn-sm" data-create (click)="create()"><app-icon name="save" />Create pipeline</button>
          }
          @if (builderTask(); as taskId) {
            <a class="btn btn-default btn-sm" [routerLink]="['/pipelines', taskId, 'edit']" [queryParams]="{ tab: 'steps' }"><app-icon name="external" />Open in step builder</a>
          }
        </div>
        @if (f.changes?.length) {
          <p class="text-xs text-[color:var(--text-secondary)] flex items-center gap-1.5"><app-icon name="sparkle" size="0.9em" />Changed: {{ f.changes!.join('; ') }}</p>
        }
        <div class="fp-canvas relative flex-1 rounded-lg border border-subtle overflow-hidden">
          <app-flow-graph [nodes]="graph().nodes" [edges]="graph().edges" [selected]="selected()" [direction]="direction()" [minFit]="0.62" ariaLabel="Pipeline flow"
                          (select)="selected.set($event)">
            <p empty class="text-sm text-[color:var(--text-muted)]">No steps.</p>
          </app-flow-graph>
        </div>
        @if (created(); as c) {
          <div class="rounded-lg border border-subtle px-3 py-2.5 flex flex-col gap-2" data-created>
            <p class="text-sm flex flex-wrap items-center gap-2">
              <app-icon name="checkCircle" class="icon-ok" />Created <span class="font-medium">{{ c.jobName }}</span>
              <span class="pill pill-neutral mono">{{ c.pipelineId }}</span><span class="text-xs text-[color:var(--text-muted)]">schedule {{ c.jobId }}</span>
            </p>
            @if (runId() != null) {
              <app-run-follow [jobId]="c.jobId" [jobQueueId]="runId()" [jobName]="c.jobName" initialStatus="Queue" />
            } @else {
              <div class="flex flex-wrap gap-2">
                <button type="button" class="btn btn-primary btn-sm" [disabled]="starting()" (click)="runNow()"><app-icon name="play" [busy]="starting()" />Run now</button>
                <a class="btn btn-ghost btn-sm" [routerLink]="['/pipelines/schedules', c.jobId, 'edit']"><app-icon name="clock" />Schedule</a>
              </div>
            }
          </div>
        }
        @if (node(); as n) {
          <section class="fp-inspector rounded-lg border border-subtle px-3 py-2.5 flex flex-col gap-2 overflow-y-auto" aria-label="Selected step" data-inspector>
            <div class="flex flex-wrap items-center gap-2 min-w-0">
              <span class="font-medium truncate">{{ n.label }}</span>
              @if (n.task) { <span class="pill pill-neutral mono">{{ n.task }}</span> }
              @if (n.service) { <span class="text-xs text-[color:var(--text-muted)]">{{ n.service }}</span> }
              <button type="button" class="btn btn-ghost btn-icon btn-sm ml-auto" aria-label="Close the step" (click)="selected.set(null)"><app-icon name="close" /></button>
            </div>
            @if (n.does) { <p class="text-sm text-[color:var(--text-secondary)]">{{ n.does }}</p> }
            @if (n.problems?.length) {
              <ul class="text-xs flex flex-col gap-1 list-none m-0 p-0">
                @for (p of n.problems; track $index) {
                  <li class="flex items-start gap-1.5" [class]="p.kind === 'error' ? 'text-crit-500' : 'text-[color:var(--warn-text)]'">
                    <app-icon [name]="p.kind === 'error' ? 'alert' : 'info'" size="0.9em" class="mt-0.5 shrink-0" />{{ p.message }}
                  </li>
                }
              </ul>
            }
            @if (schemaOf(n.task); as schema) {
              <app-schema-form [schema]="schema" [value]="configOf(n.id)" [steps]="keysBefore(n.id)" [prompts]="prompts()" [buckets]="buckets()"
                               [idPrefix]="'flow-' + n.id" [disabled]="!!created()" (valueChange)="setConfig(n.id, $event)" />
            } @else if (n.settings) {
              <p class="mono text-xs text-[color:var(--text-secondary)] break-words">{{ n.settings }}</p>
            }
          </section>
        } @else {
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--text-muted)]" data-flow-hint>
            @for (p of stepsWithProblems(); track p.id) {
              <button type="button" class="flex items-center gap-1 hover:underline" [class]="p.error ? 'text-crit-500' : 'text-[color:var(--warn-text)]'"
                      (click)="selected.set(p.id)"><app-icon [name]="p.error ? 'alert' : 'info'" size="0.9em" />{{ p.label }}</button>
            }
            <span>Select a step to see what it does and fill its settings; ask in the chat to change the flow.</span>
          </div>
        }
      </div>
    } @else {
      <div class="h-full grid place-items-center text-center px-6">
        <div class="max-w-sm flex flex-col items-center gap-2">
          <span class="grid place-items-center rounded-full size-10 bg-accent-soft text-accent" aria-hidden="true"><app-icon name="layers" /></span>
          @if (question()) {
            <!-- A conversation that asked questions and designed nothing: say so, gently, rather than "No flow yet". -->
            <p class="text-sm font-medium" data-flow-empty="question">Nothing to draw for a question</p>
            <p class="text-sm text-[color:var(--text-muted)]">This conversation asked about the workspace; it did not design a pipeline. Describe one in
              plain words and it is drawn here, step by step. The answer's tool calls are in the Tool calls tab.</p>
          } @else {
            <p class="text-sm font-medium" data-flow-empty="none">No flow yet</p>
            <p class="text-sm text-[color:var(--text-muted)]">Describe a pipeline in plain words and it is drawn here, step by step, checked against this
              workspace's tasks. @if (canCreate()) { Nothing is saved until you press Create pipeline. } @else { Nothing is saved from here. }</p>
          }
        </div>
      </div>
    }
  `,
})
export class FlowPanel {
  private readonly steps = inject(StepsApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  readonly flow = input<PipelineFlowArtifact | null>(null);
  readonly canCreate = input(false);
  /** The open conversation has answers but no flow: a question, which the empty state says plainly. */
  readonly question = input(false);

  /** The step shown below the canvas, once the person picks one (the canvas keeps the room until then). */
  readonly selected = linkedSignal<PipelineFlowArtifact | null, string | null>({
    source: this.flow,
    computation: (f, previous) => {
      if (!f) return null;
      if (previous?.value && f.flow.nodes.some(n => n.id === previous.value)) return previous.value;
      return null;
    },
  });

  /**
   * How the flow is laid out: a long chain reads top to bottom in the panel (left to right it would be drawn too small
   * to read); a short one left to right. The person may switch.
   */
  readonly direction = linkedSignal<PipelineFlowArtifact | null, 'LR' | 'TB'>({
    source: this.flow,
    computation: (f, previous) => previous?.value ?? ((f?.flow.nodes.length ?? 0) > 4 ? 'TB' : 'LR'),
  });

  /** Settings the person filled, by step key; kept across a redraw for the steps the edit kept. */
  private readonly filled = signal<Record<string, Record<string, unknown>>>({});
  readonly created = signal<CreatedPipeline | null>(null);
  readonly runId = signal<number | null>(null);
  readonly starting = signal(false);

  readonly tasks = signal<StepTaskEntry[]>([]);
  readonly prompts = signal<PromptChoice[]>([]);
  readonly buckets = signal<BucketChoice[]>([]);
  private loaded = false;

  readonly graph = computed(() => {
    const f = this.flow();
    return f ? graphOf(f, this.tasks()) : { nodes: [], edges: [] };
  });
  readonly verdict = computed(() => {
    const f = this.flow();
    return f ? flowVerdict(f) : { label: '', tone: 'ok' as const };
  });
  readonly node = computed(() => this.flow()?.flow.nodes.find(n => n.id === this.selected()) ?? null);
  /** The steps the person must look at, as one-click links under the canvas. */
  readonly stepsWithProblems = computed(() => (this.flow()?.flow.nodes ?? []).filter(n => n.problems?.length)
    .map(n => ({ id: n.id, label: n.label, error: n.problems!.some(p => p.kind === 'error') })));
  readonly builderTask = computed(() => this.created()?.taskDetailId ?? this.flow()?.taskDetailId ?? null);

  /** The definition Create saves: the design's, with what the person filled. */
  readonly definition = computed<FlowDefinition | null>(() => {
    const f = this.flow();
    if (!f) return null;
    let d = f.definition;
    for (const [key, config] of Object.entries(this.filled())) {
      if (d.steps.some(s => s.key === key)) d = withStepConfig(d, key, config);
    }
    return d;
  });

  constructor() {
    // A new design is a new flow: whatever was created from the last one is no longer what is shown.
    effect(() => {
      const f = this.flow();
      if (f) this.loadChoices();
    });
  }

  private flowName = '';

  private loadChoices(): void {
    const name = this.flow()?.name ?? '';
    if (this.created() && name !== this.flowName) { this.created.set(null); this.runId.set(null); }
    this.flowName = name;
    if (this.loaded) return;
    this.loaded = true;
    this.steps.tasks().subscribe({ next: r => this.tasks.set(r.status === API_SUCCESS ? r.data ?? [] : []), error: () => this.tasks.set([]) });
    this.steps.prompts().subscribe({ next: p => this.prompts.set(p), error: () => this.prompts.set([]) });
    this.steps.buckets().subscribe({ next: b => this.buckets.set(b), error: () => this.buckets.set([]) });
  }

  schemaOf(task: string | null | undefined): JsonSchema | null {
    if (!task) return null;
    const schema = this.tasks().find(t => t.code === task)?.configSchema;
    return schema && schema.properties && Object.keys(schema.properties).length ? schema : null;
  }

  configOf(key: string): Record<string, unknown> {
    return this.filled()[key] ?? this.flow()?.definition.steps.find(s => s.key === key)?.config ?? {};
  }

  keysBefore(key: string): string[] {
    const steps = this.flow()?.definition.steps ?? [];
    const at = steps.findIndex(s => s.key === key);
    return steps.slice(0, Math.max(0, at)).map(s => s.key);
  }

  setConfig(key: string, config: Record<string, unknown>): void {
    this.filled.update(all => ({ ...all, [key]: config }));
  }

  async copy(): Promise<void> {
    const d = this.definition();
    if (d && await copyText(JSON.stringify(d, null, 2))) this.toast.success('Definition copied.');
  }

  create(): void {
    const f = this.flow();
    const definition = this.definition();
    if (!f || !definition) return;
    const data: CreatePipelineData = { flow: f, definition };
    this.dialog.open<CreatedPipeline | null>(CreatePipeline, { data, disableClose: true }).closed.subscribe(created => {
      if (created) {
        this.created.set(created);
        this.toast.success(`${created.jobName} created.`);
      }
    });
  }

  /** Run now on the job just created; the run card follows it to its end. */
  async runNow(): Promise<void> {
    const c = this.created();
    if (!c || this.starting()) return;
    this.starting.set(true);
    try {
      const started = await firstValueFrom(this.steps.run(c.jobId));
      if (started.status !== API_SUCCESS) { this.toast.error(started.message || 'The run was not started.'); return; }
      const runs = await firstValueFrom(this.steps.runs(c.jobId, 1));
      const newest = runs.data?.jobQueues?.[0]?.jobQueueId ?? null;
      if (newest == null) { this.toast.info('Started; the run shows under Executions.'); return; }
      this.runId.set(newest);
    } catch (err: unknown) {
      this.toast.error((err as { error?: { message?: string } })?.error?.message || 'The run was not started.');
    } finally {
      this.starting.set(false);
    }
  }
}
