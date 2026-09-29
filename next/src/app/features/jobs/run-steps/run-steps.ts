import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { StatusPill } from '../../../shared/ui/status-pill';
import { SegmentOption, Segmented } from '../../../shared/ui/segmented';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { formatDuration } from '../../../shared/ui/time-format';
import {
  RunAiStep, StepExecution, StepLogLine, StepTimeline, engineTimeline, errorText, focusStep, recordsLabel, stepStillGoing,
} from './run-steps.model';

type StepView = 'timeline' | 'console';

/** Run statuses after which nothing about the run's steps changes again. */
const TERMINAL = ['Completed', 'Failed', 'Interrupt', 'Skip', 'Missed', 'Stop'];

/**
 * MIG-251: the steps of one run, on the run's page (Run logs), for a run the step engine (MIG-230) took.
 *
 * Two views of the same steps, as the run's own entries have: a Timeline of every step -- when it started, how long it
 * took, records in and out, tries, its error, the datasets it wrote -- and a Console of one step's own lines
 * (sourceJob.json/stepLogs). A retried run offers each attempt. The run's AI trace (what each AI step ran on, and who
 * chose the model) closes the card when the run has one.
 *
 * A legacy run -- one the engine did not take -- answers with a single "run" step whose lines are the run's audit log,
 * which the page already shows. For those this draws nothing at all, so the page is exactly today's.
 */
@Component({
  selector: 'app-run-steps',
  imports: [Icon, StatusPill, Segmented, ServerTimePipe],
  templateUrl: './run-steps.html',
})
export class RunSteps {
  readonly jobQueueId = input.required<string>();
  /**
   * Bumped by the page each time it re-reads the run (its poll and its socket), so a running run's steps move with its
   * entries. A run whose steps have all settled is not read again.
   */
  readonly revision = input(0);

  private readonly http = inject(HttpClient);

  readonly timeline = signal<StepTimeline | null>(null);
  readonly view = signal<StepView>('timeline');
  readonly views: SegmentOption<StepView>[] = [
    { id: 'timeline', label: 'Timeline', icon: 'clock' },
    { id: 'console', label: 'Console', icon: 'terminal' },
  ];

  /** The step the Console shows; the failed one, else the running one, else the first, until someone picks. */
  readonly selectedKey = signal<string | null>(null);
  readonly selectedStep = computed<StepExecution | null>(() => {
    const steps = this.timeline()?.steps ?? [];
    return steps.find(step => step.key === this.selectedKey()) ?? focusStep(steps);
  });

  /** Each step's lines by its step execution, read once; 'error' when they could not be read. */
  readonly logs = signal<Map<number, StepLogLine[] | 'error'>>(new Map());
  readonly selectedLines = computed(() => {
    const id = this.selectedStep()?.stepExecutionId;
    return id === null || id === undefined ? undefined : this.logs().get(id);
  });
  private readonly pendingLogs = new Set<number>();

  readonly attemptOptions = computed<SegmentOption<string>[]>(() =>
    (this.timeline()?.attempts ?? []).map(n => ({ id: String(n), label: `Attempt ${n}` })));
  readonly shownAttempt = computed(() => String(this.timeline()?.attempt ?? ''));

  readonly completedCount = computed(() => (this.timeline()?.steps ?? []).filter(s => s.status === 'Completed').length);
  readonly aiSteps = computed<RunAiStep[]>(() => this.timeline()?.aiSteps ?? []);

  /** The attempt someone chose; null follows the run's latest. */
  private readonly requestedAttempt = signal<number | null>(null);
  /** Nothing more can change: a legacy run, or an engine run whose every step has settled. */
  private settled = false;
  private loadedFor: string | null = null;
  private request?: Subscription;
  private requestFor: number | null = null;

  readonly recordsLabel = recordsLabel;
  readonly errorText = errorText;

  constructor() {
    effect(() => {
      this.jobQueueId();
      this.revision();
      const attempt = this.requestedAttempt();
      untracked(() => this.load(attempt));
    });

    // The Console reads the chosen step's lines when it is shown, and only once per step.
    effect(() => {
      if (this.view() !== 'console') return;
      const step = this.selectedStep();
      const id = step?.stepExecutionId;
      if (id === null || id === undefined || step?.log !== 'step') return;
      if (this.logs().has(id) || this.pendingLogs.has(id)) return;
      untracked(() => this.loadLog(id));
    });
  }

  private load(attempt: number | null): void {
    // A re-read the page asked for (its poll) is skipped once there is nothing left to change. Choosing an attempt, or
    // another run, starts over.
    if (this.loadedFor !== this.jobQueueId()) {
      this.loadedFor = this.jobQueueId();
      this.settled = false;
      this.request?.unsubscribe();
    }
    if (this.settled) return;
    // The page's first read lands while this one is still out: one question at a time is enough.
    if (this.request && !this.request.closed && this.requestFor === attempt) return;
    const params: Record<string, string> = { jobQueueId: this.jobQueueId() };
    if (attempt !== null) params['attempt'] = String(attempt);
    this.request?.unsubscribe();
    this.requestFor = attempt;
    this.request = this.http.get<ApiResponse<unknown>>(`${API_BASE}/sourceJob.json/stepExecutions`, { params }).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) return;
        const data = response.data as StepTimeline | null;
        if (data && typeof data === 'object' && (data as StepTimeline).legacy === true) {
          this.settled = true;
          return;
        }
        const timeline = engineTimeline(data);
        if (!timeline) return;
        const going = timeline.steps.some(step => stepStillGoing(step.status));
        this.settled = !going && TERMINAL.includes(timeline.runStatus ?? '');
        // A step that is still going gains lines: its cached ones are dropped, so the Console reads them again.
        const stale = timeline.steps.filter(step => stepStillGoing(step.status) && step.stepExecutionId !== null)
          .map(step => step.stepExecutionId!);
        if (stale.length) {
          this.logs.update(map => {
            const next = new Map(map);
            stale.forEach(id => next.delete(id));
            return next;
          });
        }
        this.timeline.set(timeline);
      },
      // The run's entries are the point of the page; losing the steps must not break it.
      error: () => {},
    });
  }

  private loadLog(stepExecutionId: number): void {
    this.pendingLogs.add(stepExecutionId);
    this.http.get<ApiResponse<{ lines?: StepLogLine[] }>>(`${API_BASE}/sourceJob.json/stepLogs`,
      { params: { stepExecutionId: String(stepExecutionId) } }).subscribe({
      next: response => {
        this.pendingLogs.delete(stepExecutionId);
        const lines = response.status === API_SUCCESS ? (response.data?.lines ?? []) : 'error';
        this.logs.update(map => new Map(map).set(stepExecutionId, lines));
      },
      error: () => {
        this.pendingLogs.delete(stepExecutionId);
        this.logs.update(map => new Map(map).set(stepExecutionId, 'error'));
      },
    });
  }

  chooseAttempt(value: string): void {
    const attempt = Number(value);
    if (!Number.isInteger(attempt) || String(attempt) === this.shownAttempt()) return;
    this.settled = false;
    this.logs.set(new Map());
    this.selectedKey.set(null);
    this.requestedAttempt.set(attempt);
  }

  /** From a step's row: its lines in the Console. */
  openLog(step: StepExecution): void {
    this.selectedKey.set(step.key);
    this.view.set('console');
  }

  chooseStep(key: string): void { this.selectedKey.set(key); }

  duration(step: StepExecution): string {
    return step.durationMs === null || step.durationMs === undefined ? '—' : formatDuration(step.durationMs / 1000);
  }

  /** The rail's dot, in the colours the status chips use. */
  tone(status: string | null): string {
    switch (status) {
      case 'Completed': return 'var(--color-ok-500)';
      case 'Failed':
      case 'Interrupt': return 'var(--color-crit-500)';
      case 'Skip':
      case 'Missed': return 'var(--color-warn-500)';
      case 'Start':
      case 'Running': return 'var(--accent-mark)';
      default: return 'var(--border-strong)';
    }
  }

  /** A step's closing message is worth printing when it says more than its status and records already do. */
  showMessage(step: StepExecution): boolean {
    return !!step.statusMessage && step.status !== 'Completed' && !errorText(step);
  }

  rowsLabel(rows: number | null | undefined): string {
    if (rows === null || rows === undefined) return '';
    return `${rows.toLocaleString('en-GB')} ${rows === 1 ? 'row' : 'rows'}`;
  }

  columnsTitle(columns: string[] | null | undefined): string {
    return columns?.length ? `Columns: ${columns.join(', ')}` : '';
  }

  /** ai-service's outcome words, as the run's AI steps say them elsewhere. */
  outcomeLabel(outcome: string | null | undefined): string {
    switch (outcome) {
      case 'answered': return 'Answered';
      case 'failed': return 'Failed';
      case 'refused': return 'Refused';
      case 'handed': return 'Handed to the worker';
      default: return outcome ? outcome.charAt(0).toUpperCase() + outcome.slice(1) : 'Asked';
    }
  }

  outcomePill(outcome: string | null | undefined): string {
    if (outcome === 'answered') return 'pill pill-ok';
    if (outcome === 'failed' || outcome === 'refused') return 'pill pill-crit';
    return 'pill pill-neutral';
  }

  /** Who picked the model: the run (Run with…), the schedule's setting, or nobody (the step's default). */
  choiceLabel(step: RunAiStep): string {
    switch (step.profileSource) {
      case 'run': return 'chosen for this run';
      case 'schedule': return 'the schedule\'s setting';
      default: return 'the step\'s default';
    }
  }

  /** A line's level on the Console's dark ground: the console's own grey for INFO, the status colours for the rest. */
  levelColor(level: string | null | undefined): string {
    const l = (level ?? '').toUpperCase();
    if (l === 'ERROR') return 'var(--color-crit-500)';
    if (l === 'WARN' || l === 'WARNING') return 'var(--color-warn-500)';
    return 'var(--color-ink-400)';
  }
}
