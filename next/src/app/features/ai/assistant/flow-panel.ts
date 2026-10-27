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
import { CreatedFlow, FlowDefinition, PipelineFlowArtifact, flowVerdict, graphOf, withStepConfig } from './flow.model';
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
          <span class="pill" [class]="created() && !needsUpdate() ? 'pill pill-ok' : 'pill pill-neutral'" data-saved-state>{{ created() ? (needsUpdate()
            ? 'Changed since created' : 'Created') : 'Not saved' }}</span>
          <span class="flex-1"></span>
          <div class="seg" role="group" aria-label="Layout">
            <button type="button" class="seg-btn" [class.seg-on]="direction() === 'TB'" [attr.aria-pressed]="direction() === 'TB'" (click)="direction.set('TB')"
                    title="Top to bottom" aria-label="Top to bottom"><app-icon name="arrowDown" size="0.9em" /></button>
            <button type="button" class="seg-btn" [class.seg-on]="direction() === 'LR'" [attr.aria-pressed]="direction() === 'LR'" (click)="direction.set('LR')"
                    title="Left to right" aria-label="Left to right"><app-icon name="arrowRight" size="0.9em" /></button>
          </div>
          <button type="button" class="btn btn-default btn-sm" (click)="copy()" title="Copy Core's definition as JSON"><app-icon name="copy" />JSON</button>
          @if (canCreate() && !created()) {
            <button type="button" class="btn btn-primary btn-sm" data-create [disabled]="opening()" (click)="create()"><app-icon name="save" />Create pipeline</button>
          }
          @if (canCreate() && needsUpdate()) {
            <button type="button" class="btn btn-primary btn-sm" data-update [disabled]="opening()" (click)="create()"><app-icon name="save" />Update pipeline</button>
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
              <app-icon name="checkCircle" class="icon-ok" />Created as <span class="font-medium">{{ c.jobName }}</span>
              @if (c.pipelineId) { <span class="pill pill-neutral mono">{{ c.pipelineId }}</span> }
              @if (c.version) { <span class="text-xs text-[color:var(--text-muted)]">version {{ c.version }}</span> }
              @if (c.jobId) { <span class="text-xs text-[color:var(--text-muted)]">schedule {{ c.jobId }}</span> }
            </p>
            @if (needsUpdate()) {
              <p class="text-xs text-[color:var(--warn-text)]" data-needs-update>The flow changed after it was created: press Update pipeline to save the
                change as a new version. Create pipeline is not offered again, so it is never made twice.</p>
            }
            @if (runId() != null) {
              <app-run-follow [jobId]="c.jobId" [jobQueueId]="runId()" [jobName]="c.jobName" initialStatus="Queue" />
            } @else if (c.jobId) {
              <div class="flex flex-wrap gap-2">
                <button type="button" class="btn btn-primary btn-sm" [disabled]="starting()" (click)="runNow()"><app-icon name="play" [busy]="starting()" />Run now</button>
                <a class="btn btn-default btn-sm" [routerLink]="['/pipelines/schedules', c.jobId, 'edit']"><app-icon name="clock" />Schedule</a>
              </div>
            }
          </div>
        }
        @if (f.notes?.length) {
          <ul class="text-xs flex flex-col gap-1 list-none m-0 p-0 text-[color:var(--text-secondary)]" aria-label="Notes on the flow" data-flow-notes>
            @for (note of f.notes; track $index) {
              <li class="flex items-start gap-1.5"><app-icon name="info" size="0.9em" class="mt-0.5 shrink-0" />{{ note }}</li>
            }
          </ul>
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
                  <li class="flex items-start gap-1.5" [class]="p.kind === 'error' ? 'text-crit-500' : 'text-[color:var(--warn-text)]'" [attr.data-problem]="p.kind">
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
            @for (w of flowWarnings(); track $index) {
              <span class="basis-full flex items-start gap-1.5 text-[color:var(--warn-text)]" data-flow-warning><app-icon name="alert" size="0.9em"
                class="mt-0.5 shrink-0" />{{ w }}</span>
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
  /** The flow's message: recorded as the one created. */
  readonly messageId = input<number | null>(null);
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
  /**
   * The pipeline made from this conversation's flow: the flow's own record (ai-service keeps it, so a reload still knows),
   * or the one just created here, kept while the same flow is shown.
   */
  readonly created = linkedSignal<PipelineFlowArtifact | null, CreatedPipeline | null>({
    source: this.flow,
    computation: (f, previous) => {
      if (f?.created?.pipelineKey) return fromRecord(f.created, f.name);
      return previous?.value && previous.source?.name === f?.name ? previous.value : null;
    },
  });
  /** The flow saved from this panel (created, or updated): it needs no Update. */
  private readonly savedHere = signal<PipelineFlowArtifact | null>(null);
  /** A flow edited after its pipeline was created: Update pipeline saves it as the next version. */
  readonly needsUpdate = computed(() => {
    const f = this.flow();
    return !!f && !!f.created?.pipelineKey && !f.saved && this.savedHere() !== f;
  });
  /** The Create or Update dialog is open: a second press opens nothing. */
  readonly opening = signal(false);
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
  /** The flow's warnings in its own words: what it does that it does not read as (all rows in one; two reviews). */
  readonly flowWarnings = computed(() => (this.flow()?.problems ?? []).filter(p => p.kind === 'warning').map(p => p.message));
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
    if (name !== this.flowName) this.runId.set(null);
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

  /** Create pipeline -- or, for a flow whose pipeline exists, Update pipeline: one dialog at a time, never a second pipeline. */
  create(): void {
    const f = this.flow();
    const definition = this.definition();
    if (!f || !definition || this.opening()) return;
    const update = this.created() ? (f.created ?? toRecord(this.created()!)) : null;
    if (this.created() && !this.needsUpdate()) return;
    this.opening.set(true);
    const data: CreatePipelineData = { flow: f, definition, messageId: this.messageId(), update };
    this.dialog.open<CreatedPipeline | null>(CreatePipeline, { data, disableClose: true }).closed.subscribe(created => {
      this.opening.set(false);
      if (created) {
        this.created.set(created);
        this.savedHere.set(f);
        this.toast.success(update ? `${created.jobName} updated${created.version ? ' to version ' + created.version : ''}.` : `${created.jobName} created.`);
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

/** The flow's record of its pipeline, as the run card reads it. */
function fromRecord(c: CreatedFlow, flowName: string): CreatedPipeline {
  return { pipelineId: c.pipelineId ?? '', pipelineKey: c.pipelineKey, taskDetailId: c.taskDetailId ?? 0, jobId: c.jobId ?? 0,
    jobName: c.name || flowName, version: c.version ?? null };
}

function toRecord(c: CreatedPipeline): CreatedFlow {
  return { pipelineKey: c.pipelineKey, pipelineId: c.pipelineId, taskDetailId: c.taskDetailId, jobId: c.jobId, name: c.jobName, version: c.version };
}
