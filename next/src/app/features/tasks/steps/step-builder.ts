import { Component, ComponentRef, OnInit, ViewContainerRef, computed, effect, inject, input, linkedSignal, output, signal, untracked, viewChild } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { Field } from '../../../shared/ui/field';
import { Combobox } from '../../../shared/ui/combobox';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { confirmWith } from '../../../shared/ui/confirm';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { DefinitionFormat, StepsApi } from './steps.service';
import { StepPanel, StepPanelData } from './step-panel';
import { SampleDialog, SampleDialogData } from './sample-dialog';
import {
  Definition, DefinitionView, LIMITS, ON_ERRORS, Problem, SOURCE_TYPES, Settings, Step, StepProblem, StepTaskEntry, ValidateResult,
  addStep, canonical, definitionJson, inputColumns, isLegacyDefinition, refusalOf, moveStep, onErrorLabel, problemsByStep, removeStep, replaceStep,
  sameDefinition, sampleRowsOf, sourceLabel, taskEntry, taskLabel, taskOptions, toYaml, updateSettings, updateSource, usesBucket, usesPrompt,
  withSample, BucketChoice, PromptChoice, usesWebhook, WebhookChoice, usesApiRequest, ApiRequestChoice, DocumentTypeChoice, usesDocumentType, updateParameters,
} from './steps.model';
import { ParameterEditor } from './parameter-editor';
import type { RunParameter } from '../../jobs/run-parameters/run-parameters';
import { PipelineDraftHandoff } from './draft-handoff';
import { SENSITIVITY_LEVELS, sensitivityText } from '../../../shared/ui/sensitivity';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { Section } from '../../../shared/ui/section';
import type { StepFlow } from './step-flow';
import { stageGroups } from './overview';

export type BuilderTab = 'steps' | 'settings' | 'history' | 'yaml' | 'json';

/** The Steps tab as a list of cards, or as a flow (the shared flow-graph, loaded only when shown). */
export type StepsLayout = 'list' | 'flow';
const LAYOUT_KEY = 'etl.view.pipeline-steps';

/** The layout this viewer last chose (in this browser): the list until they pick the flow. */
export function savedStepsLayout(): StepsLayout {
  try { return localStorage.getItem(LAYOUT_KEY) === 'flow' ? 'flow' : 'list'; } catch { return 'list'; }
}

function saveStepsLayout(layout: StepsLayout): void {
  try { localStorage.setItem(LAYOUT_KEY, layout); } catch { /* the choice is simply not remembered */ }
}

type Tone = 'ok' | 'warn' | 'crit';

/**
 * The step builder (MIG-249): a pipeline's definition as ordered steps (MIG-230), edited on the pipeline's page.
 *
 * Views of one draft, the tab the page's `?tab=` names: Steps (the ordered cards, grouped by stage -- drag by the handle,
 * move up and down, delete, open one in the side panel -- and Add step from the Task Registry), Settings (the source,
 * the defaults every step inherits, the data's sensitivity and its review), History (the saved versions), YAML and JSON. The builder and Settings edit the draft
 * directly; the YAML and JSON tabs are text, applied to the draft when the person leaves the tab (JSON parsed here,
 * YAML read by the server -- the console has no YAML parser) and saved as typed while the tab is open. The server
 * stores canonical JSON either way, so a YAML edit and a builder edit of the same thing save the same definition.
 *
 * Test with sample (rows put in front of the steps) is the Steps tab's. Validate, Save and Discard are the page's one
 * save bar's (UX review 2026-10-12, B2: one save place), which calls them here; Run now and Schedule are the page
 * header's. The server's problems come back at paths (`steps[2].retry.maxAttempts`) and are shown on the step they name.
 */
@Component({
  selector: 'app-step-builder',
  imports: [Icon, Field, Combobox, ServerTimePipe, Segmented, RouterLink, Section, ParameterEditor],
  templateUrl: './step-builder.html',
  // UX review 2026-10-12 (B2/B3): this screen's own rules, in its lazy chunk rather than the console's first download.
  styles: `
/* UX review 2026-10-12 (B2, P5): the steps grouped by stage -- a run of one stage under its own small heading, a rule
   in the stage's tone at the left so read, check, AI, review and write are told apart at a glance. */
.step-stages { display: flex; flex-direction: column; gap: 0.875rem; }
.step-stage { --stage-tone: var(--border-strong); border-left: 3px solid var(--stage-tone); padding-left: 0.75rem; scroll-margin-top: 1rem; }
.step-stage[data-stage="read"] { --stage-tone: var(--color-info-500); }
.step-stage[data-stage="check"] { --stage-tone: var(--color-warn-500); }
.step-stage[data-stage="ai"] { --stage-tone: var(--color-brand-500); }
.step-stage[data-stage="review"] { --stage-tone: var(--color-crit-500); }
.step-stage[data-stage="write"] { --stage-tone: var(--color-ok-500); }
.step-stage-head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.375rem; margin-bottom: 0.5rem; font-size: 12px; line-height: 1rem; color: var(--text-secondary); }
.step-stage-head > app-icon { color: var(--stage-tone); }
.review-ways { margin: 1rem 0 0; padding: 0.75rem 0.875rem; list-style: none; display: flex; flex-direction: column; gap: 0.5rem; font-size: 13px; line-height: 1.45; color: var(--text-secondary); background: var(--surface-inset); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); }
  `,
})
export class StepBuilder implements OnInit {
  /** What the page read: pipeline.json/steps/definition. */
  readonly view = input.required<DefinitionView>();
  readonly tab = input<BuilderTab>('steps');
  readonly canManage = input(true);
  /** A workspace administrator: may add a task that needs one. The workspace's task switches are Task Registry's. */
  readonly isAdmin = input(true);
  /** Report Studio phase 5: the pipeline's name and its schedules, for a generate_report step's own design. */
  readonly pipelineName = input('');
  readonly jobIds = input<number[]>([]);
  /** The pipeline's workspace: a platform administrator's reads of its API requests name it. Null: the reader's own. */
  readonly tenantId = input<number | null>(null);
  /** A save made a new version (or found none to make): the page's copy is stale. */
  readonly saved = output<DefinitionView>();

  private readonly api = inject(StepsApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly handoff = inject(PipelineDraftHandoff);

  readonly limits = LIMITS;
  readonly onErrors = ON_ERRORS;
  readonly sensitivities = SENSITIVITY_LEVELS;
  sensitivityText(level: string): string { return sensitivityText(level); }
  readonly sourceTypes = SOURCE_TYPES;
  readonly onErrorText = onErrorLabel;
  readonly sourceText = sourceLabel;

  /** The pipeline as last read: the saved definition, its versions. A save reads it again. */
  readonly meta = linkedSignal(() => this.view());
  readonly draft = linkedSignal<Definition>(() => structuredClone(this.meta().definition));
  readonly tasks = signal<StepTaskEntry[]>([]);
  readonly problems = signal<Problem[]>([]);
  readonly result = signal<{ tone: Tone; text: string } | null>(null);
  readonly busy = signal<'' | 'validate' | 'save' | 'yaml'>('');
  /** The step last opened, by key: it stays marked wherever it moves. */
  readonly selected = signal<string | null>(null);

  readonly yamlText = signal('');
  readonly yamlTyped = signal(false);
  readonly jsonText = signal('');
  readonly jsonTyped = signal(false);

  readonly dragFrom = signal<number | null>(null);
  readonly dropAt = signal<number | null>(null);
  /** List or Flow, remembered per viewer. */
  readonly layout = signal<StepsLayout>(savedStepsLayout());
  readonly layouts: SegmentOption<StepsLayout>[] = [{ id: 'list', label: 'List', icon: 'list' }, { id: 'flow', label: 'Flow', icon: 'layers' }];
  /** The saved steps the Flow view marks unsaved ones against; none while the pipeline runs as its legacy step. */
  readonly savedSteps = computed(() => (this.meta().stored && !this.meta().legacy ? this.meta().definition.steps : null));
  /**
   * Where the Flow view goes, and the view once its code has loaded. It is imported when first shown (a dynamic import,
   * not @defer: the defer runtime would land in the console's first download), so the list never loads the graph.
   */
  private readonly flowHost = viewChild('flowHost', { read: ViewContainerRef });
  readonly flowView = signal<ComponentRef<StepFlow> | null>(null);

  /** Add step's box: flipped between '' and null to clear it after a pick. */
  readonly addPick = signal<string | null>('');

  readonly grouped = computed(() => problemsByStep(this.problems()));
  readonly legacy = computed(() => isLegacyDefinition(this.draft()));
  /** The saved pipeline still runs as its legacy step: the first save moves every task on it to the steps. */
  readonly savedLegacy = computed(() => !this.meta().stored || this.meta().legacy);
  readonly dirty = computed(() => this.yamlTyped() || this.jsonTyped() || !sameDefinition(this.draft(), this.meta().definition));
  readonly taskOptions = computed(() => taskOptions(this.tasks(), this.isAdmin()));
  /** UX review 2026-10-12 (B2, P5): the steps as runs of one stage -- read, check, transform, AI, review, write. */
  readonly groups = computed(() => stageGroups(this.draft().steps ?? [], this.tasks()));
  /** The pipeline's Approval steps: the Settings tab's review section names them (W2). */
  readonly approvalSteps = computed(() => (this.draft().steps ?? []).filter(s => s.task === 'approval'));
  readonly approvalNames = computed(() => this.approvalSteps().map(s => s.name?.trim() || s.key).join(', '));

  /** The first group of a stage keeps the plain anchor (#stage-read) the page's overview links to. */
  firstStart(stage: string): number {
    return this.groups().find(g => g.stage.id === stage)?.start ?? -1;
  }
  readonly versionText = computed(() => {
    const m = this.meta();
    return m.stored && !m.legacy ? `Version ${m.version}` : 'Runs as its legacy step: no steps saved';
  });
  readonly latestVersion = computed(() => this.meta().versions?.[0] ?? null);

  private shownTab: BuilderTab = 'steps';

  /**
   * Its inputs are set: the page reads the draft and the save state through it only then (B2). A signal query hands the
   * page this component as it is created, before its required `view` has a value.
   */
  readonly ready = signal(false);
  ngOnInit(): void { this.ready.set(true); }

  constructor() {
    this.reloadTasks();
    // A draft handed over for this pipeline (the AI Assistant's, MIG-252) shows on its text tab as typed text, unsaved.
    effect(() => {
      const key = this.meta().pipelineKey;
      untracked(() => {
        const handed = this.handoff.take(key);
        if (!handed) return;
        if (handed.format === 'json') { this.jsonText.set(handed.text); this.jsonTyped.set(true); }
        else { this.yamlText.set(handed.text); this.yamlTyped.set(true); }
      });
    });
    // The Flow view: loaded and placed when its slot appears, handed the draft as it changes.
    effect(() => {
      const host = this.flowHost();
      untracked(() => (host ? void this.mountFlow(host) : this.flowView.set(null)));
    });
    effect(() => {
      const view = this.flowView();
      if (!view) return;
      view.setInput('definition', this.draft());
      view.setInput('saved', this.savedSteps());
      view.setInput('tasks', this.tasks());
      view.setInput('problems', this.grouped().steps);
      view.setInput('selected', this.selected());
      view.setInput('tenantId', this.tenantId());
    });
    // Leaving a text tab applies what was typed to the draft; entering one shows the draft as that text.
    effect(() => {
      const next = this.tab();
      untracked(() => this.switchTab(next));
    });
  }

  // ------------------------------------------------------------------------------------------ tabs

  private switchTab(next: BuilderTab): void {
    const was = this.shownTab;
    this.shownTab = next;
    if (was === next) { this.enter(next); return; }
    if (was === 'json' && this.jsonTyped()) this.applyJson();
    if (was === 'yaml' && this.yamlTyped()) this.applyYaml();
    this.enter(next);
  }

  private enter(tab: BuilderTab): void {
    if (tab === 'yaml' && !this.yamlTyped()) this.yamlText.set(this.yamlOf(this.draft()));
    if (tab === 'json' && !this.jsonTyped()) this.jsonText.set(definitionJson(this.draft()));
  }

  /** The server's own YAML for the saved definition; the draft written the same way otherwise. */
  private yamlOf(definition: Definition): string {
    const m = this.meta();
    return m.yaml && sameDefinition(definition, m.definition) ? m.yaml : toYaml(definition);
  }

  typeYaml(text: string): void { this.yamlText.set(text); this.yamlTyped.set(true); }

  typeJson(text: string): void { this.jsonText.set(text); this.jsonTyped.set(true); }

  private applyJson(): boolean {
    try {
      const parsed = JSON.parse(this.jsonText());
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.steps)) {
        this.say('crit', 'The JSON tab is not a definition: it needs a "steps" list. The builder shows the steps from before it.');
        return false;
      }
      this.draft.set(parsed as Definition);
      this.jsonTyped.set(false);
      return true;
    } catch (e) {
      this.say('crit', `The JSON tab is not JSON (${e instanceof Error ? e.message : 'unreadable'}). The builder shows the steps from before it.`);
      return false;
    }
  }

  /** The server reads the YAML; a definition that reads (with or without problems) becomes the draft. */
  private applyYaml(): void {
    const text = this.yamlText();
    this.busy.set('yaml');
    this.api.validate('yaml', text).subscribe({
      next: r => {
        this.busy.set('');
        // Typed again while the server read it: the newer text wins, applied when the tab is left again.
        if (this.yamlText() !== text) return;
        this.took(r, true);
      },
      error: err => { this.busy.set(''); this.say('crit', err?.error?.message || 'The YAML could not be read.'); },
    });
  }

  // ------------------------------------------------------------------------------------------ the cards

  stepProblems(index: number): StepProblem[] { return this.grouped().steps[index] ?? []; }

  earlierKeys(index: number): string[] { return this.draft().steps.slice(0, index).map(s => s.key); }

  taskOf(step: Step): StepTaskEntry | undefined { return taskEntry(this.tasks(), step.task, step); }

  taskName(step: Step): string { return taskLabel(this.taskOf(step), step.task); }

  /** "reads read · 3 tries · 60 s · continue on failure": what the card says under the step's name. */
  summary(step: Step): string {
    const parts: string[] = [];
    if (step.input) parts.push(`reads ${step.input}`);
    if ((step.retry?.maxAttempts ?? 1) > 1) parts.push(`${step.retry!.maxAttempts} tries`);
    if (step.timeoutSeconds) parts.push(`${step.timeoutSeconds} sec timeout`);
    if (step.onError) parts.push(onErrorLabel(step.onError).toLowerCase() + ' on failure');
    return parts.join(' · ');
  }

  add(code: string): void {
    this.addPick.set(this.addPick() === '' ? null : '');
    const task = taskEntry(this.tasks(), code);
    if (!code || !this.canManage()) return;
    const refused = refusalOf(task, this.isAdmin());
    if (refused) { this.say('warn', refused); return; }
    if (!task) return;
    this.draft.update(d => addStep(d, task));
    this.open(this.draft().steps.length - 1);
  }

  setLayout(layout: StepsLayout): void {
    this.layout.set(layout);
    saveStepsLayout(layout);
  }

  private async mountFlow(host: ViewContainerRef): Promise<void> {
    const { StepFlow } = await import('./step-flow');
    // Back on the list (or the tab left) while it loaded: nothing to place.
    if (this.flowHost() !== host) return;
    host.clear();
    const view = host.createComponent(StepFlow);
    view.instance.open.subscribe(index => this.open(index));
    this.flowView.set(view);
  }

  move(index: number, delta: number): void {
    this.draft.update(d => moveStep(d, index, delta));
    this.shiftProblems();
  }

  remove(index: number): void {
    if (this.selected() === this.draft().steps[index]?.key) this.selected.set(null);
    this.draft.update(d => removeStep(d, index));
    this.shiftProblems();
  }

  /** MIG-245: the workspace's active prompts, read the first time a step that names one is opened. */
  private readonly promptChoices = signal<PromptChoice[] | null>(null);

  /** MIG-321: the workspace's buckets, read the first time a step that names one is opened. */
  private readonly bucketChoices = signal<BucketChoice[] | null>(null);

  /** MIG-346: the workspace's webhooks, read the first time a step that names one is opened. */
  private readonly webhookChoices = signal<WebhookChoice[] | null>(null);
  /** Owner #25: the workspace's saved API requests, read the first time a step that names one is opened. */
  private readonly apiRequestChoices = signal<ApiRequestChoice[] | null>(null);

  /** MIG-364: the workspace's document types, read the first time a step that names one is opened. */
  private readonly documentTypeChoices = signal<DocumentTypeChoice[] | null>(null);

  open(index: number): void {
    const step = this.draft().steps[index];
    if (!step) return;
    this.selected.set(step.key);
    const schema = this.taskOf(step)?.configSchema;
    if (this.promptChoices() === null && usesPrompt(schema)) {
      // A list that cannot be read leaves the choice empty: a saved prompt still shows by its id.
      this.api.prompts().subscribe({
        next: prompts => { this.promptChoices.set(prompts); this.open(index); },
        error: () => { this.promptChoices.set([]); this.open(index); },
      });
      return;
    }
    if (this.bucketChoices() === null && usesBucket(schema)) {
      // Likewise: without the list the box still takes an alias typed by hand.
      this.api.buckets().subscribe({
        next: buckets => { this.bucketChoices.set(buckets); this.open(index); },
        error: () => { this.bucketChoices.set([]); this.open(index); },
      });
      return;
    }
    if (this.webhookChoices() === null && usesWebhook(schema)) {
      // Likewise: without the list a saved webhook still shows by its id.
      this.api.webhooks().subscribe({
        next: webhooks => { this.webhookChoices.set(webhooks); this.open(index); },
        error: () => { this.webhookChoices.set([]); this.open(index); },
      });
      return;
    }
    if (this.apiRequestChoices() === null && usesApiRequest(schema)) {
      // Likewise: without the list a saved request still shows by its id.
      this.api.apiRequests(this.tenantId()).subscribe({
        next: requests => { this.apiRequestChoices.set(requests); this.open(index); },
        error: () => { this.apiRequestChoices.set([]); this.open(index); },
      });
      return;
    }
    if (this.documentTypeChoices() === null && usesDocumentType(schema)) {
      // Likewise: without the list a saved type still shows by its id.
      this.api.documentTypes().subscribe({
        next: types => { this.documentTypeChoices.set(types); this.open(index); },
        error: () => { this.documentTypeChoices.set([]); this.open(index); },
      });
      return;
    }
    this.openPanel(index);
  }

  private openPanel(index: number): void {
    const step = this.draft().steps[index];
    if (!step) return;
    const data: StepPanelData = {
      step, index, task: this.taskOf(step), earlierKeys: this.earlierKeys(index),
      columns: inputColumns(this.draft(), index, this.tasks()),
      problems: this.stepProblems(index), defaultOnError: this.draft().settings?.defaultOnError,
      canManage: this.canManage() && step.task !== 'legacy',
      prompts: this.promptChoices() ?? [],
      buckets: this.bucketChoices() ?? [],
      webhooks: this.webhookChoices() ?? [],
      documentTypes: this.documentTypeChoices() ?? [],
      apiRequests: this.apiRequestChoices() ?? [],
      pipeline: { key: this.view().stored ? this.view().pipelineKey : null, name: this.pipelineName(), jobIds: this.jobIds() },
    };
    // Focus goes back to the step's own card, not to whatever opened the panel: from Add step that was the box, whose
    // list then opened over the cards.
    const restoreFocus = this.layout() === 'flow' ? `[data-node][data-id="${step.key}"]` : `.step-card[data-step="${step.key}"] .step-open`;
    const config = { ...sidePanelConfig(data, 'wide', 'right'), restoreFocus };
    this.dialog.open<Step>(StepPanel, config).closed.subscribe(edited => {
      if (!edited) return;
      this.draft.update(d => replaceStep(d, index, edited));
      this.selected.set(edited.key);
    });
  }

  /** A problem's path names a step by its place; after a move they would point at the wrong card, so they go. */
  private shiftProblems(): void {
    if (Object.keys(this.grouped().steps).length) {
      this.problems.set(this.problems().filter(p => !p.path.startsWith('steps[')));
      this.say('warn', 'The steps moved: Validate again to see what is still wrong.');
    }
  }

  /** Drag by the handle; the whole card is what is seen moving, and any card is where it can land. */
  dragStart(index: number, event?: DragEvent): void {
    this.dragFrom.set(index);
    const transfer = event?.dataTransfer;
    if (!transfer) return;
    transfer.setData('text/plain', String(index));
    transfer.effectAllowed = 'move';
    const card = (event.target as HTMLElement | null)?.closest?.('.step-card');
    if (card) transfer.setDragImage(card, 16, 16);
  }

  dragOver(index: number, event: Event): void {
    if (this.dragFrom() === null) return;
    event.preventDefault();
    this.dropAt.set(index);
  }

  drop(index: number, event: Event): void {
    event.preventDefault();
    const from = this.dragFrom();
    this.dragEnd();
    if (from === null || from === index) return;
    this.move(from, index - from);
  }

  dragEnd(): void {
    this.dragFrom.set(null);
    this.dropAt.set(null);
  }

  /** The handle is also a keyboard control: the arrow keys move its step. */
  handleKey(index: number, event: KeyboardEvent): void {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.move(index, event.key === 'ArrowUp' ? -1 : 1);
    }
  }

  // ------------------------------------------------------------------------------------------ settings

  setSource(type: string): void { this.draft.update(d => updateSource(d, type)); }

  /** MIG-347: the pipeline's run parameters, as the editor leaves them. */
  setParameters(parameters: RunParameter[]): void { this.draft.update(d => updateParameters(d, parameters)); }

  /** The braces a step names a parameter with, said in the section's line (Angular would read them as its own). */
  readonly parameterHint = 'What a run is given (by Run with…, a backfill or the API); a scheduled run takes the defaults. A step reads one as {{param.name}}, and any run its day as {{run.date}}.';

  /** Owner #23: the pipeline's tags as the field shows them. */
  tagsText(): string { return (this.draft().settings?.tags ?? []).join(', '); }

  /** The tags typed, comma-separated: trimmed, blanks and repeats dropped; none left drops the setting. */
  setTags(raw: string): void {
    const tags = [...new Set(raw.split(',').map(t => t.trim()).filter(t => t.length > 0))];
    this.draft.update(d => updateSettings(d, { tags: tags.length ? tags : null }));
  }

  setSetting(field: keyof Settings, raw: string): void {
    let value: string | number | null = raw;
    if (field !== 'defaultOnError' && field !== 'sensitivity') {
      const n = Number(raw);
      value = raw.trim() === '' || !Number.isFinite(n) ? null : Math.trunc(n);
    }
    this.draft.update(d => updateSettings(d, { [field]: value }));
  }

  /** Whether the results wait for this party's review (settings.review.required). */
  reviewRequires(party: 'internal' | 'customer'): boolean {
    return !!this.draft().settings?.review?.required?.includes(party);
  }

  /**
   * MIG-237: tick or untick a party; nobody ticked drops `required`. The review's other keys -- its reviewers, individual
   * review -- stay as they are; nothing left drops the setting (no review).
   */
  setReviewRequired(party: 'internal' | 'customer', on: boolean): void {
    const now = (this.draft().settings?.review?.required ?? []).filter(p => p !== party);
    const required = on ? [...now, party].sort() as ('internal' | 'customer')[] : now;
    this.setReview({ required: required.length ? required : undefined });
  }

  /** Whether the pipeline requires individual review (settings.review.individual). */
  readonly reviewIndividual = computed(() => this.draft().settings?.review?.individual === true);

  /** Bulk review (2026-10-12): never approved or rejected in bulk -- written as true, dropped when false. */
  setReviewIndividual(on: boolean): void {
    this.setReview({ individual: on ? true : undefined });
  }

  /** Changes keys of settings.review and keeps the others; a key set to undefined goes, and an empty review goes with it. */
  private setReview(change: Partial<NonNullable<Settings['review']>>): void {
    const next: Record<string, unknown> = { ...(this.draft().settings?.review ?? {}), ...change };
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    this.draft.update(d => updateSettings(d, { review: Object.keys(next).length ? next as Settings['review'] : undefined }));
  }

  settingProblem(path: string): string {
    return this.grouped().other.filter(p => p.path === path).map(p => p.message).join(' · ');
  }

  /** Owner #23: the tags' problems -- the list's and each tag's (settings.tags[1]). */
  tagProblems(): string {
    return this.grouped().other.filter(p => p.path === 'settings.tags' || p.path.startsWith('settings.tags[')).map(p => p.message).join(' · ');
  }

  private reloadTasks(): void {
    this.api.tasks().subscribe({ next: r => { if (r.status === API_SUCCESS) this.tasks.set(r.data ?? []); }, error: () => {} });
  }

  // ------------------------------------------------------------------------------------------ actions

  /** What Validate and Save send: the typed text on a text tab that was typed in, else the draft as canonical JSON. */
  private outgoing(): { format: DefinitionFormat; text: string } {
    const tab = this.tab();
    if (tab === 'yaml' && this.yamlTyped()) return { format: 'yaml', text: this.yamlText() };
    if (tab === 'json' && this.jsonTyped()) return { format: 'json', text: this.jsonText() };
    return { format: 'json', text: JSON.stringify(canonical(this.draft())) };
  }

  validate(): void {
    const { format, text } = this.outgoing();
    const typed = this.yamlTyped() || this.jsonTyped();
    this.busy.set('validate');
    this.api.validate(format, text).subscribe({
      next: r => { this.busy.set(''); this.took(r, typed); },
      error: err => { this.busy.set(''); this.say('crit', err?.error?.message || 'The definition could not be checked.'); },
    });
  }

  /** A validate's answer: its problems, and -- for typed text that reads -- the draft it describes. */
  private took(r: ApiResponse<ValidateResult>, adopt: boolean): void {
    const data = r.data ?? {};
    this.problems.set(data.problems ?? []);
    if (adopt && data.definition) {
      this.draft.set(data.definition);
      this.yamlTyped.set(false);
      this.jsonTyped.set(false);
      this.enter(this.tab());
    }
    if (r.status === API_SUCCESS) this.say('ok', r.message || 'The definition is valid.');
    else {
      const count = data.problems?.length ?? 0;
      this.say('crit', count ? `${count} problem${count === 1 ? '' : 's'}: each is shown on its step.` : r.message || 'The definition is not valid.');
    }
  }

  save(): void {
    if (!this.canManage()) return;
    this.persist(() => {});
  }

  /** The page's save bar: saves the draft (asking first, as Save does) and says whether it saved. */
  saveNow(): Promise<boolean> {
    if (!this.canManage() || !this.dirty()) return Promise.resolve(!this.dirty());
    return new Promise(resolve => this.persist(resolve));
  }

  /** Saves, asking first when the pipeline still runs as its legacy step; `then` hears whether it saved. */
  private persist(then: (ok: boolean) => void): void {
    if (this.savedLegacy() && !this.legacy()) {
      confirmWith(this.dialog, {
        title: 'Run this pipeline as steps',
        body: `${this.meta().pipelineId} runs as its legacy step today: the task payload, sent to its worker. Once these steps are saved, every task on this pipeline runs them in the step engine from its next run.`,
        confirmLabel: 'Save steps',
      }).then(ok => (ok ? this.write(then) : then(false)));
      return;
    }
    this.write(then);
  }

  private write(then: (ok: boolean) => void): void {
    const { format, text } = this.outgoing();
    const pipelineKey = this.meta().pipelineKey;
    // The last message was about the draft before this save; what the save says replaces it.
    this.result.set(null);
    this.busy.set('save');
    this.api.save(pipelineKey, format, text).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) {
          this.busy.set('');
          this.took(r, false);
          this.toast.error(r.message || 'The steps could not be saved.');
          then(false);
          return;
        }
        this.toast.success(r.message || 'Saved.');
        this.api.definition(pipelineKey).subscribe({
          next: d => {
            this.busy.set('');
            if (d.status === API_SUCCESS && d.data) {
              this.meta.set(d.data);
              this.draft.set(structuredClone(d.data.definition));
              this.saved.emit(d.data);
            }
            this.problems.set([]);
            this.yamlTyped.set(false);
            this.jsonTyped.set(false);
            this.enter(this.tab());
            this.say('ok', r.message || 'Saved.');
            then(true);
          },
          error: () => { this.busy.set(''); this.say('warn', `${r.message || 'Saved.'} Reading it back failed: open the page again.`); then(true); },
        });
      },
      error: err => {
        this.busy.set('');
        this.toast.error(err?.error?.message || 'The steps could not be saved.');
        then(false);
      },
    });
  }

  discard(): void {
    this.draft.set(structuredClone(this.meta().definition));
    this.yamlTyped.set(false);
    this.jsonTyped.set(false);
    this.problems.set([]);
    this.result.set(null);
    this.enter(this.tab());
  }

  testWithSample(): void {
    const data: SampleDialogData = { rows: sampleRowsOf(this.draft()) };
    this.dialog.open<Record<string, unknown>[]>(SampleDialog, { data, hasBackdrop: true }).closed.subscribe(rows => {
      if (!rows) return;
      if (this.jsonTyped() && !this.applyJson()) return;
      this.draft.update(d => withSample(d, rows));
      this.yamlTyped.set(false);
      this.enter(this.tab());
      this.say('ok', `${rows.length} sample row${rows.length === 1 ? '' : 's'} put first. Save, then Run now runs the steps on them.`);
      this.validate();
    });
  }

  private say(tone: Tone, text: string): void { this.result.set({ tone, text }); }
}
