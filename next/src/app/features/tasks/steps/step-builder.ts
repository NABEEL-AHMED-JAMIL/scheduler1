import { Component, computed, effect, inject, input, linkedSignal, output, signal, untracked } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
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
import { RunDrawer, RunDrawerData } from './run-drawer';
import { SampleDialog, SampleDialogData } from './sample-dialog';
import { TaskStatePill, TaskSwitch } from './task-switch';
import {
  Definition, DefinitionView, LIMITS, LinkedJob, ON_ERRORS, Problem, SOURCE_TYPES, Settings, Step, StepProblem, StepTaskEntry, ValidateResult,
  addStep, canonical, definitionJson, inputColumns, isLegacyDefinition, refusalOf, moveStep, onErrorLabel, problemsByStep, removeStep, replaceStep,
  sameDefinition, sampleRowsOf, sourceLabel, stateOf, taskEntry, taskLabel, taskOptions, toYaml, updateSettings, updateSource, withSample,
  withSwitchedLine,
} from './steps.model';

export type BuilderTab = 'steps' | 'settings' | 'yaml' | 'json';

type Tone = 'ok' | 'warn' | 'crit';

/**
 * The step builder (MIG-249): a pipeline's definition as ordered steps (MIG-230), edited on the pipeline's page.
 *
 * Four views of one draft, the tab the page's `?tab=` names: Steps (the ordered cards -- drag by the handle, move up
 * and down, delete, open one in the side panel -- and Add step from the Task Registry), Settings (the source and the
 * defaults every step inherits, and the saved versions), YAML and JSON. The builder and Settings edit the draft
 * directly; the YAML and JSON tabs are text, applied to the draft when the person leaves the tab (JSON parsed here,
 * YAML read by the server -- the console has no YAML parser) and saved as typed while the tab is open. The server
 * stores canonical JSON either way, so a YAML edit and a builder edit of the same thing save the same definition.
 *
 * Validate, Test with sample (rows put in front of the steps), Run now (the task's schedule; unsaved changes are
 * saved first, as the runner runs what is saved) with its result in a drawer, Schedule and Save. The server's
 * problems come back at paths (`steps[2].retry.maxAttempts`) and are shown on the step they name.
 */
@Component({
  selector: 'app-step-builder',
  imports: [Icon, Field, Combobox, ServerTimePipe, TaskSwitch, TaskStatePill],
  templateUrl: './step-builder.html',
})
export class StepBuilder {
  /** What the page read: pipeline.json/steps/definition. */
  readonly view = input.required<DefinitionView>();
  readonly tab = input<BuilderTab>('steps');
  /** The task the page edits: whose schedules Run now runs and Schedule adds to. */
  readonly taskDetailId = input<number | null>(null);
  readonly canManage = input(true);
  /** A workspace administrator: may add a task that needs one, and switches the workspace's tasks. */
  readonly isAdmin = input(true);
  /** A save made a new version (or found none to make): the page's copy is stale. */
  readonly saved = output<DefinitionView>();

  private readonly api = inject(StepsApi);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly limits = LIMITS;
  readonly onErrors = ON_ERRORS;
  readonly sourceTypes = SOURCE_TYPES;
  readonly onErrorText = onErrorLabel;
  readonly sourceText = sourceLabel;

  /** The pipeline as last read: the saved definition, its versions. A save reads it again. */
  readonly meta = linkedSignal(() => this.view());
  readonly draft = linkedSignal<Definition>(() => structuredClone(this.meta().definition));
  readonly tasks = signal<StepTaskEntry[]>([]);
  readonly jobs = signal<LinkedJob[]>([]);
  readonly jobId = signal<number | null>(null);
  readonly problems = signal<Problem[]>([]);
  readonly result = signal<{ tone: Tone; text: string } | null>(null);
  readonly busy = signal<'' | 'validate' | 'save' | 'run' | 'yaml'>('');
  /** The step last opened, by key: it stays marked wherever it moves. */
  readonly selected = signal<string | null>(null);

  readonly yamlText = signal('');
  readonly yamlTyped = signal(false);
  readonly jsonText = signal('');
  readonly jsonTyped = signal(false);

  readonly dragFrom = signal<number | null>(null);
  readonly dropAt = signal<number | null>(null);
  /** Add step's box: flipped between '' and null to clear it after a pick. */
  readonly addPick = signal<string | null>('');

  readonly grouped = computed(() => problemsByStep(this.problems()));
  readonly legacy = computed(() => isLegacyDefinition(this.draft()));
  /** The saved pipeline still runs as its legacy step: the first save moves every task on it to the steps. */
  readonly savedLegacy = computed(() => !this.meta().stored || this.meta().legacy);
  readonly dirty = computed(() => this.yamlTyped() || this.jsonTyped() || !sameDefinition(this.draft(), this.meta().definition));
  readonly taskOptions = computed(() => taskOptions(this.tasks(), this.isAdmin()));
  /** The tasks a workspace administrator can switch: every task but the legacy lines (never switchable). */
  readonly switchable = computed(() => this.tasks().filter(t => t.code !== 'legacy' && t.kind !== 'Legacy').map(task => ({ task, ...stateOf(task) })));
  readonly switching = signal<string | null>(null);
  readonly jobOptions = computed(() => this.jobs().map(j => ({ value: String(j.jobId), label: `${j.jobName} (#${j.jobId})` })));
  readonly runLabel = computed(() => (this.dirty() ? 'Save & run now' : 'Run now'));
  readonly runHint = computed(() => {
    if (!this.taskDetailId()) return 'Save the task first: Run now runs its schedule.';
    if (!this.jobs().length) return 'No schedule runs this pipeline yet. Schedule one, then Run now runs it.';
    return this.dirty() ? 'Unsaved changes are saved first: a run runs the saved steps.' : '';
  });
  readonly versionText = computed(() => {
    const m = this.meta();
    return m.stored && !m.legacy ? `Version ${m.version}` : 'Runs as its legacy step: no steps saved';
  });
  readonly latestVersion = computed(() => this.meta().versions?.[0] ?? null);

  private shownTab: BuilderTab = 'steps';

  constructor() {
    this.reloadTasks();
    effect(() => {
      const task = this.taskDetailId();
      untracked(() => this.loadJobs(task));
    });
    // Leaving a text tab applies what was typed to the draft; entering one shows the draft as that text.
    effect(() => {
      const next = this.tab();
      untracked(() => this.switchTab(next));
    });
  }

  private loadJobs(task: number | null): void {
    if (!task) { this.jobs.set([]); return; }
    this.api.jobsOf(task).subscribe({
      next: r => {
        const jobs = r.status === API_SUCCESS ? r.data ?? [] : [];
        this.jobs.set(jobs);
        if (!jobs.some(j => j.jobId === this.jobId())) this.jobId.set(jobs[0]?.jobId ?? null);
      },
      error: () => this.jobs.set([]),
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
    if (step.timeoutSeconds) parts.push(`${step.timeoutSeconds} s timeout`);
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

  move(index: number, delta: number): void {
    this.draft.update(d => moveStep(d, index, delta));
    this.shiftProblems();
  }

  remove(index: number): void {
    if (this.selected() === this.draft().steps[index]?.key) this.selected.set(null);
    this.draft.update(d => removeStep(d, index));
    this.shiftProblems();
  }

  open(index: number): void {
    const step = this.draft().steps[index];
    if (!step) return;
    this.selected.set(step.key);
    const data: StepPanelData = {
      step, index, task: this.taskOf(step), earlierKeys: this.earlierKeys(index),
      columns: inputColumns(this.draft(), index, this.tasks()),
      problems: this.stepProblems(index), defaultOnError: this.draft().settings?.defaultOnError,
      canManage: this.canManage() && step.task !== 'legacy',
    };
    // Focus goes back to the step's own card, not to whatever opened the panel: from Add step that was the box, whose
    // list then opened over the cards.
    const config = { ...sidePanelConfig(data, 'wide'), restoreFocus: `.step-list > li:nth-child(${index + 1}) .step-open` };
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

  setSetting(field: keyof Settings, raw: string): void {
    let value: string | number | null = raw;
    if (field !== 'defaultOnError') {
      const n = Number(raw);
      value = raw.trim() === '' || !Number.isFinite(n) ? null : Math.trunc(n);
    }
    this.draft.update(d => updateSettings(d, { [field]: value }));
  }

  settingProblem(path: string): string {
    return this.grouped().other.filter(p => p.path === path).map(p => p.message).join(' · ');
  }

  /**
   * Switches a task on or off in this workspace, or (null) back to its default. The answer is the task's line as the
   * workspace now sees it; a task Add step then offers or not.
   */
  switchTask(task: StepTaskEntry, enabled: boolean | null): void {
    if (!this.isAdmin() || this.switching()) return;
    this.switching.set(task.code);
    this.api.switchTask(task.code, enabled).subscribe({
      next: r => {
        this.switching.set(null);
        if (r.status !== API_SUCCESS) { this.toast.error(r.message || 'The task could not be switched.'); this.reloadTasks(); return; }
        this.toast.success(r.message || 'Switched.');
        const line = r.data;
        if (line?.code) this.tasks.update(list => withSwitchedLine(list, line));
        else this.reloadTasks();
      },
      error: err => { this.switching.set(null); this.toast.error(err?.error?.message || 'The task could not be switched.'); this.reloadTasks(); },
    });
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
      this.say('ok', `${rows.length} sample row${rows.length === 1 ? '' : 's'} put first. Save & run now runs the steps on them.`);
      this.validate();
    });
  }

  runNow(): void {
    const jobId = this.jobId();
    if (!jobId || !this.canManage()) return;
    if (this.dirty()) {
      this.persist(ok => { if (ok) this.start(jobId); });
      return;
    }
    this.start(jobId);
  }

  private start(jobId: number): void {
    const job = this.jobs().find(j => j.jobId === jobId);
    this.busy.set('run');
    this.api.run(jobId).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.busy.set(''); this.toast.error(r.message || 'The run could not be started.'); return; }
        // Run now's answer does not name the run it queued: the newest of the job's runs is it.
        this.api.runs(jobId).subscribe({
          next: q => {
            this.busy.set('');
            const newest = (q.data?.jobQueues ?? []).reduce<number | null>((max, row) => (max === null || row.jobQueueId > max ? row.jobQueueId : max), null);
            if (newest === null) { this.toast.success(`${job?.jobName ?? 'The job'} queued to run.`); return; }
            const data: RunDrawerData = { jobQueueId: newest, jobId, jobName: job?.jobName ?? `Job #${jobId}` };
            this.dialog.open(RunDrawer, sidePanelConfig(data, 'wide'));
          },
          error: () => { this.busy.set(''); this.toast.success(`${job?.jobName ?? 'The job'} queued to run.`); },
        });
      },
      error: err => { this.busy.set(''); this.toast.error(err?.error?.message || 'The run could not be started.'); },
    });
  }

  schedule(): void {
    this.router.navigate(['/pipelines/schedules/new'], { queryParams: { taskDetailId: this.taskDetailId() } });
  }

  pickJob(value: string): void { this.jobId.set(value ? Number(value) : null); }

  private say(tone: Tone, text: string): void { this.result.set({ tone, text }); }
}
