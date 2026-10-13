import { Component, DestroyRef, OnDestroy, OnInit, LOCALE_ID, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Location } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { RankedBar } from '../../../shared/charts/ranked-bar';
import { isMissingRecord } from '../../../core/api/missing-record';
import { JobEventsService } from '../../../core/socket/job-events.service';
import { Subscription } from 'rxjs';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { formatDuration } from '../../../shared/ui/time-format';
import { RunDecision } from '../run-steps/run-decision';
import { RunReviewView } from '../run-steps/run-review';
import { RunAiAnswers } from './run-ai-answers';
import { AuthService } from '../../../core/auth/auth.service';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { Crumb } from '../../../core/nav/nav-tree';
import { RunTimelineStore } from '../run-steps/run-timeline.store';
import { formatMoney } from '../../billing/billing-format';
import { RunStepsTable } from '../run-steps/run-steps-table';
import { RunMap } from '../run-steps/run-map';
import { RunOutputs } from '../run-steps/run-outputs';
import { RunAiTrace } from '../run-steps/run-ai-trace';
import { RunLog } from './run-log';
import { RUN_TABS, RunTab, runFacts, runStatusLook, runTabFromUrl, runTabUrl, startedBy } from '../run-steps/run-page.model';

export type { RunTab } from '../run-steps/run-page.model';
/** The tab a `?tab=` value names on the bare run address (kept for the callers that read it). */
export function runTabOf(value: string | null): RunTab {
  return runTabFromUrl(null, value);
}

interface AuditLog {
  jobAuditLogId?: number;
  jobQueueId?: number;
  jobId?: number;
  logsDetail?: string;
  dateCreated?: string;
}

/** What the strip says for a run that has not ended. */
function stillRunningWord(status: string | null | undefined): string {
  return status && !['Completed', 'Failed', 'Interrupt', 'Skip', 'Missed', 'Stop'].includes(status) ? 'Still running' : '—';
}

@Component({
  selector: 'app-job-logs',
  imports: [PageHeader, RefreshButton, Icon, RouterLink, RankedBar, RunDecision, RunAiAnswers, RunStepsTable, RunMap,
    RunOutputs, RunAiTrace, RunLog],
  templateUrl: './job-logs.html',
  // One read of the run's steps and outputs for the whole page: the summary, every tab, the step log panel.
  providers: [RunTimelineStore],
  styles: `
    .run-top { display: grid; gap: 1rem; align-items: stretch; }
    @media (min-width: 1024px) { .run-top.has-next { grid-template-columns: minmax(0, 1fr) minmax(22rem, 26rem); } }
    /* Six facts: one row on their own, three by two beside the Next steps, so the strip fills the box's height evenly. */
    .run-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); height: 100%; }
    @media (min-width: 1024px) { .has-next .run-facts { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    .run-fact { padding: 0.75rem 1rem; box-shadow: inset -1px 0 0 var(--border-subtle); min-width: 0;
      display: flex; flex-direction: column; justify-content: center; }
    .run-fact:last-child { box-shadow: none; }
    @media (min-width: 1024px) {
      .has-next .run-facts.is-wide { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .has-next .run-facts:not(.is-wide) .run-fact:nth-child(3n),
      .has-next .run-facts.is-wide .run-fact:nth-child(4n) { box-shadow: none; }
      .has-next .run-facts:not(.is-wide) .run-fact:nth-child(n+4),
      .has-next .run-facts.is-wide .run-fact:nth-child(n+5) { border-top: 1px solid var(--border-subtle); }
    }
    .run-fact dt { font-size: 11px; color: var(--text-muted); margin-bottom: 0.125rem; white-space: nowrap; }
    .run-fact dd { font-size: 0.875rem; font-weight: 500; color: var(--text-primary); font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .run-related a { color: var(--text-secondary); }
    .run-related a:hover { color: var(--text-primary); }
    .run-status-pill { font-size: 0.75rem; }
  `,
})
export class JobLogs implements OnInit, OnDestroy {
  readonly jobId = input.required<string>();
  readonly jobQueueId = input.required<string>();

  /** Both ids come from the URL, so both are text until proven to be numbers. */
  private validIds(): boolean {
    const isId = (value: string) => /^\d+$/.test((value ?? '').trim());
    return isId(this.jobId()) && isId(this.jobQueueId());
  }

  private readonly http = inject(HttpClient);
  private readonly jobEvents = inject(JobEventsService);
  private socket: Subscription | null = null;

  /** True when the run's own lines are arriving over the socket rather than by polling. */
  readonly socketLive = this.jobEvents.connected;

  readonly logs = signal<AuditLog[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly showInsights = signal(false);
  /** The run's own start time anchors the first gap, so time spent before the first log shows. */
  readonly runStartedAt = signal<string | null>(null);
  /** The job and the specific run, so a log line has the context the old screen showed. */
  readonly job = signal<any | null>(null);
  readonly run = signal<any | null>(null);
  /** UX review 2026-10-12 (A2, R1): the run's number and its schedule as the title, not "Run logs". */
  readonly heading = computed(() => {
    const name = this.job()?.jobName;
    return `Run #${this.jobQueueId()}` + (name ? ` · ${name}` : '');
  });
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly activated = inject(ActivatedRoute);
  /** A reviewer holds the Queue, not Schedules: the schedule's pages are not theirs to open (UX review 2026-10-12, R2). */
  readonly canOpenSchedule = computed(() => this.auth.canOpen('jobs'));
  /**
   * Run & review › Schedules & triggers › <the schedule's runs> › Run #8214; for a reviewer, Run & review › Review inbox ›
   * Run #8214 -- the way they came.
   */
  readonly trail = computed<Crumb[]>(() => this.canOpenSchedule() ? [
    { label: 'Run & review' },
    { label: 'Schedules & triggers', link: '/pipelines/schedules' },
    { label: this.job()?.jobName ? `${this.job().jobName} · runs` : 'Schedule runs', link: `/pipelines/schedules/${this.jobId()}/executions` },
  ] : [
    { label: 'Run & review' },
    ...(this.auth.canOpen('task-inbox') ? [{ label: 'Review inbox', link: '/workflows/inbox' }] : []),
  ]);

  /**
   * UX review 2026-10-12 (R3, run page fix): the header's link row -- the run's schedule, its pipeline, the dashboards
   * its results feed and what it cost -- each where the reader may open it. The title names the run and its schedule;
   * these say where to go from it, and nothing on the page says the schedule or the pipeline a second time.
   */
  readonly related = computed<{ label: string; icon: string; link: string; query?: Record<string, string>; test: string }[]>(() => {
    const job = this.job();
    const out: { label: string; icon: string; link: string; query?: Record<string, string>; test: string }[] = [];
    if (this.canOpenSchedule()) out.push({ label: 'All runs of this schedule', icon: 'history', link: `/pipelines/schedules/${this.jobId()}/executions`, test: 'schedule' });
    const taskDetailId = job?.taskDetail?.taskDetailId;
    const pipeline = job?.taskDetail?.taskName;
    if (taskDetailId && this.auth.isTenantAdmin?.() && this.auth.canOpen('tasks')) {
      out.push({ label: pipeline ? `Pipeline: ${pipeline}` : 'Pipeline', icon: 'layers', link: `/pipelines/${taskDetailId}/edit`, query: { tab: 'steps' }, test: 'pipeline' });
    }
    if (this.auth.canOpen('analytics-dashboards')) out.push({ label: 'Dashboards', icon: 'chart', link: '/data/analytics/dashboards', test: 'dashboards' });
    // UX review B9: the run's own cost, shared out of the month's priced lines.
    if (this.auth.isTenantAdmin?.()) out.push({ label: 'What this run cost', icon: 'database', link: '/billing/usage', query: { run: String(this.jobQueueId()) }, test: 'cost' });
    return out;
  });
  /** The pipeline's name when its page is not the reader's to open: said once, in the link row, as text. */
  readonly pipelineText = computed(() => this.related().some(r => r.test === 'pipeline') ? null : this.job()?.taskDetail?.taskName ?? null);

  /** The run's steps and outputs, read once for the page (summary, tabs, step log panel). */
  readonly store = inject(RunTimelineStore);
  /** The run's review as Next steps read it, for the header's one pill. */
  readonly review = signal<RunReviewView | null>(null);
  /** The Next steps box is drawn (the run's results need a review): the strip shares the row with it. */
  readonly hasNext = computed(() => !!this.review() && this.review()!.reviewStatus !== 'NOT_REQUIRED');
  /** UX review 2026-10-12 (run page fix): the header's one status -- "Completed · waiting for review". */
  readonly statusLook = computed(() => runStatusLook(this.run()?.jobStatus, this.review()?.reviewStatus, !!this.store.timeline()?.waitingForApproval));
  /** The summary strip: only what the header does not say (no status, schedule or pipeline). */
  readonly facts = computed(() => {
    const run = this.run();
    return runFacts({
      start: run?.startTime ? this.clock.transform(run.startTime, 'recentSec') ?? '—' : '—',
      end: run?.endTime ? this.clock.transform(run.endTime, 'recentSec') ?? '—' : stillRunningWord(run?.jobStatus),
      startHint: run?.startTime ? this.clock.transform(run.startTime, 'dateTimeSec') ?? undefined : undefined,
      endHint: run?.endTime ? this.clock.transform(run.endTime, 'dateTimeSec') ?? undefined : undefined,
      duration: this.duration(),
      startedBy: startedBy(run, this.job()),
      timeline: this.store.timeline(),
      cost: this.cost(),
    });
  });
  /** UX review B9: what the run cost, for an administrator (Billing's runCost); null when unknown or not theirs to read. */
  readonly cost = signal<string | null>(null);
  private costFor: string | null = null;
  private loadCost(): void {
    const id = this.jobQueueId().trim();
    if (this.costFor === id || !this.auth.isTenantAdmin?.()) return;
    this.costFor = id;
    this.http.get<ApiResponse<{ cost?: number | null; currency?: string | null }>>(`${API_BASE}/billing.json/runCost`, { params: { jobQueueId: id } })
      .subscribe({
        next: r => {
          const cost = r.status === API_SUCCESS ? r.data?.cost : null;
          this.cost.set(typeof cost === 'number' ? formatMoney(cost, r.data?.currency || 'USD', cost > 0 && cost < 1 ? 4 : 2) : null);
        },
        error: () => this.cost.set(null),
      });
  }

  /** The run's closing message, when it says something the strip and the steps do not (a failure, a skip). */
  readonly closingMessage = computed(() => {
    const run = this.run();
    if (!run?.jobStatusMessage || run.jobStatus === 'Completed') return null;
    // A step that failed says it on its own row; the run's message would only say it again.
    const steps = this.store.timeline()?.steps ?? [];
    if (steps.some(s => s.status === 'Failed' || s.status === 'Interrupt')) return null;
    return run.jobStatusMessage as string;
  });

  /** UX review 2026-10-12 (R1, run page fix): Steps · Map · AI answers · Outputs · Log, kept in the address. */
  private readonly location = inject(Location);
  readonly tab = signal<RunTab>(this.tabOfAddress());
  /** The tab the address names: the child's path ('' or 'logs') and ?tab=. */
  private tabOfAddress(): RunTab {
    const snapshot = this.activated.snapshot;
    return runTabFromUrl(snapshot?.firstChild?.url?.at(-1)?.path ?? snapshot?.url?.at(-1)?.path, snapshot?.queryParamMap?.get('tab'));
  }
  readonly tabs = computed(() => [
    { id: 'steps' as RunTab, label: 'Steps', icon: 'list' },
    { id: 'map' as RunTab, label: 'Map', icon: 'layers' },
    { id: 'ai' as RunTab, label: this.aiSteps().length ? `AI answers (${this.aiSteps().length})` : 'AI answers', icon: 'sparkle' },
    { id: 'outputs' as RunTab, label: this.store.outputList().length ? `Outputs (${this.store.outputList().length})` : 'Outputs', icon: 'file' },
    { id: 'log' as RunTab, label: this.logs().length ? `Log (${this.logs().length.toLocaleString('en-GB')})` : 'Log', icon: 'terminal' },
  ]);
  /** The step the Log shows (the panel's "Open in Log"); null for the whole run. */
  readonly logStep = signal<string | null>(null);

  /**
   * A tab is an address: the Log at /runs/8134/logs, the Steps at /runs/8134, any other at /runs/8134?tab=outputs -- so
   * a link and a refresh keep it. The address is replaced, not navigated, so the run is not read again for a tab.
   */
  setTab(tab: RunTab): void {
    if (!RUN_TABS.includes(tab)) return;
    this.tab.set(tab);
    const { commands, queryParams } = runTabUrl(this.jobId(), this.jobQueueId(), tab);
    const url = this.router.serializeUrl(this.router.createUrlTree(commands, { queryParams }));
    this.location.replaceState(url);
  }

  showStepInLog(stepKey: string): void {
    this.logStep.set(stepKey);
    this.setTab('log');
  }

  /** The pipeline's AI steps for this run, with what each answered; empty when it has none. */
  readonly aiSteps = signal<{ run: any; promptName?: string }[]>([]);

  /** The bucket the run's task reads and writes, which a path in a log line is relative to. */
  readonly bucket = computed<string | null>(() => this.job()?.taskDetail?.bucket ?? null);

  readonly refreshing = signal(false);
  /** How many times the run has been read: the steps card (MIG-251) re-reads its steps with the run's own poll. */
  readonly loads = signal(0);
  readonly live = signal(true);
  /** The run is not there, so neither Try again nor the live poll can help (the page offers Back to jobs). */
  readonly missing = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** A run that has finished will not gain entries, so polling it is pure waste. */
  readonly stillRunning = computed(() => {
    const status = (this.run()?.jobStatus ?? '').toLowerCase();
    if (!status) return false;
    return !['completed', 'failed', 'interrupt', 'skip', 'missed', 'stop'].includes(status);
  });

  readonly autoRefreshing = computed(() => this.live() && this.stillRunning());

  constructor() {
    // A link to this page's other address (/logs, ?tab=) or to another run lands on this same page: it follows the address.
    const navigations = this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) this.tab.set(this.tabOfAddress());
    });
    inject(DestroyRef).onDestroy(() => navigations.unsubscribe());
    let shown: string | null = null;
    effect(() => {
      const key = `${this.jobId()}/${this.jobQueueId()}`;
      if (shown !== null && shown !== key) untracked(() => {
        this.logs.set([]); this.job.set(null); this.run.set(null); this.review.set(null); this.aiSteps.set([]);
        this.aiStepsLoadedFor = null; this.costFor = null; this.cost.set(null); this.missing.set(false);
        this.load();
      });
      shown = key;
    });
    // The run's steps are read with each read of the run, so a running run's steps move with its entries.
    effect(() => {
      if (this.loads() > 0 && !this.missing()) untracked(() => this.store.load(this.jobQueueId().trim()));
    });
    // Starts and stops the poll when the reader toggles Live, or when the run reaches a terminal
    // status. It does NOT re-arm the timer between polls -- see arm().
    effect(() => {
      const on = this.autoRefreshing();
      this.clearTimer();
      if (on) this.arm();
    });

    /*
     * While the socket is up the lines arrive on it and the poll stands down (see arm()), so the two
     * moments it cannot cover are read once each: the run ending -- its last lines and its final
     * status are the server's -- and the socket coming back after a gap it did not replay.
     */
    effect(() => {
      const running = this.stillRunning();
      if (this.wasRunning && !running && this.run()) untracked(() => this.load(true));
      this.wasRunning = running;
    });
    effect(() => {
      const connected = this.socketLive();
      if (connected && this.socketDropped && untracked(() => this.autoRefreshing())) untracked(() => this.load(true));
      this.socketDropped = !connected && this.socketEverUp;
      if (connected) this.socketEverUp = true;
    });
  }

  private wasRunning = false;
  private socketEverUp = false;
  private socketDropped = false;

  /**
   * Schedules the next poll.
   *
   * This used to live in the effect above, whose comment claimed it "re-arms after every load".
   * It did not. An effect re-runs when a signal it read reports a NEW VALUE, and the only signal
   * it reads is autoRefreshing() -- live() && stillRunning() -- which stays true for the whole of
   * a running job. Every load replaced run() with a fresh object, stillRunning() recomputed to
   * the same true, the computed therefore notified nobody, and the effect never ran again. So the
   * screen polled exactly once, five seconds after it opened, and then sat still under a badge
   * saying Live -- which is the behaviour being reported.
   *
   * Re-arming from the completion of each load is what the comment always described: the next
   * poll is scheduled when the previous one has come back, so the timer cannot stack up behind a
   * slow response either.
   */
  private arm(): void {
    this.clearTimer();
    // MIG-214: an answer that lands after the page is gone must not start the next poll.
    if (this.destroyed || !this.autoRefreshing()) return;
    // The full log is re-read only while nothing else delivers it (scale review P1 #22): with the socket
    // up, each line arrives as it is written, and re-reading the whole log every five seconds besides was
    // the cost of a long run. The timer keeps ticking, so a dropped socket is polled again within 5s.
    this.timer = setTimeout(() => (this.socketLive() ? this.arm() : this.refresh()), 5000);
  }

  private aiStepsLoadedFor: string | null = null;
  private loadAiSteps(): void {
    // Once per run: the steps ran before dispatch and do not change while the logs poll.
    if (this.aiStepsLoadedFor === this.jobQueueId()) return;
    this.aiStepsLoadedFor = this.jobQueueId();
    this.http.get<ApiResponse<{ run: any; promptName?: string }[]>>(`${API_BASE}/aiPrompt.json/runsForJob`,
      { params: { jobQueueId: this.jobQueueId() } }).subscribe({
      next: r => { if (r.status === API_SUCCESS) this.aiSteps.set(r.data ?? []); },
      error: () => {},
    });
  }

  private destroyed = false;

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearTimer();
    this.socket?.unsubscribe();
    this.socket = null;
  }

  private clearTimer(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  /** Manual reload; leaves the spinner-free path alone so the list does not blank out. */
  refresh(): void {
    this.refreshing.set(true);
    this.load(true);
  }

  toggleLive(): void { this.live.update(v => !v); }

  /**
   * How long the run took, written as the history table and the Jobs list write it. This had its
   * own formatter, which said "60m 0s" for an hour-long run where the history said "1h".
   */
  duration(): string {
    const run = this.run();
    if (!run?.startTime || !run?.endTime) return '—';
    return formatDuration((new Date(run.endTime).getTime() - new Date(run.startTime).getTime()) / 1000);
  }

  /** An AI step's latency, which the API gives in milliseconds. */
  latency(ms: number): string {
    return formatDuration(ms / 1000);
  }

  /** How many bars stay readable at once; beyond this the chart shows a window. */

  /**
   * A gap is called a stall when it is both more than twice the average and over five
   * seconds -- the second test stops a run whose entries are milliseconds apart from
   * flagging half its bars. This colouring is the diagnostic value of the chart: it is how
   * you find where a run actually sat waiting.
   */
  readonly coloured = computed(() => {
    const all = this.gaps();
    if (!all.length) return [];
    const avg = all.reduce((sum, g) => sum + g.value, 0) / all.length;
    return all.map(g => ({
      ...g,
      color: g.value > avg * 2 && g.value > 5
        ? 'var(--color-warn-500)'
        // --accent-mark, not brand-500: that step is the dark card's own colour, so every
        // ordinary gap vanished in dark and only the stalls showed.
        : 'var(--accent-mark)',
      stalled: g.value > avg * 2 && g.value > 5,
    }));
  });

  readonly stallCount = computed(() => this.coloured().filter(g => g.stalled).length);

  /**
   * The longest waits, not every interval. A bar per entry meant 368 bars whose labels
   * overlapped into a smear, and because one 22.5s stall set the scale the other 367 sat at
   * zero height -- the chart answered nothing while taking a screen to do it. The question
   * this is here for is "where did the run sit waiting", so it shows exactly that, ranked,
   * and stays readable whether the run has ten entries or ten thousand.
   */
  readonly topGaps = computed(() => {
    const stalls = this.coloured().filter(g => g.value > 0);
    return [...stalls]
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
      .map(g => ({
        name: `Before ${g.name}`,
        value: g.value,
        display: formatDuration(g.value),
        color: g.color,
      }));
  });

  /**
   * The denominator is the span from the first entry to the last, which is not the same as
   * the run's own duration: a worker can write a line against a finished run's id, and this
   * database has 30 such rows -- one of them a day after its run ended, which turned a 1m58s
   * run into a 25-hour "gap". Calling that share "of the run's elapsed time" was wrong, so
   * it says what it actually measures and the late entries are called out separately.
   */
  readonly gapSummary = computed(() => {
    const all = this.gaps();
    if (!all.length) return null;
    const total = all.reduce((sum, g) => sum + g.value, 0);
    const shown = this.topGaps().reduce((sum, g) => sum + g.value, 0);
    return {
      total: Math.round(total * 10) / 10,
      totalLabel: formatDuration(total),
      shownShare: total > 0 ? Math.round((shown / total) * 100) : 0,
      entries: all.length,
    };
  });

  /** Entries stamped after the run finished -- they inflate every gap that follows them. */
  readonly lateEntries = computed(() => {
    const ended = this.run()?.endTime;
    if (!ended) return 0;
    const cutoff = new Date(ended).getTime();
    if (!Number.isFinite(cutoff)) return 0;
    return this.logs().filter(row => {
      const at = row.dateCreated ? new Date(row.dateCreated).getTime() : NaN;
      return Number.isFinite(at) && at > cutoff + 1000;
    }).length;
  });

  /** The entries in time order: what the chart's gaps and every entry's number are counted from. */
  private readonly timeOrdered = computed(() => [...this.logs()]
    .filter(row => !!row.dateCreated)
    .sort((a, b) => new Date(a.dateCreated!).getTime() - new Date(b.dateCreated!).getTime()));

  /** The same clock the views print entry times with: API times are Chicago wall-clock. */
  private readonly clock = new ServerTimePipe(inject(LOCALE_ID));

  /**
   * Seconds between one log line and the next. A job that looks "slow" is usually waiting in
   * one specific step, and the tall bar is that step -- far quicker to spot than reading
   * timestamps down a column.
   */
  readonly gaps = computed(() => {
    const rows = this.timeOrdered();
    if (!rows.length) return [];

    const started = this.runStartedAt();
    const anchors: { at: number; label: string }[] = [];
    if (started) {
      const t = new Date(started).getTime();
      if (Number.isFinite(t)) anchors.push({ at: t, label: 'Start' });
    }
    // Named by the entry's time, which the Timeline, Table and Console all show, with its number
    // kept: two entries in the same second would otherwise share a name, and the chart keys its
    // bars by name.
    rows.forEach((row, index) =>
      anchors.push({ at: new Date(row.dateCreated!).getTime(),
        label: `${this.clock.transform(row.dateCreated, 'timeSec')} (#${index + 1})` }));

    if (anchors.length < 2) return [];
    const out: { name: string; value: number }[] = [];
    for (let i = 1; i < anchors.length; i++) {
      const seconds = (anchors[i].at - anchors[i - 1].at) / 1000;
      if (!Number.isFinite(seconds)) continue;
      out.push({ name: anchors[i].label, value: Math.max(0, Math.round(seconds * 10) / 10) });
    }
    return out;
  });

  readonly slowestGap = computed(() => {
    const list = this.gaps();
    if (!list.length) return null;
    return list.reduce((worst, g) => (g.value > worst.value ? g : worst), list[0]);
  });

  readonly hasInsights = computed(() => this.gaps().length > 1);

  ngOnInit(): void {
    this.load();
    this.listen();
  }

  /**
   * The server has always published every log line as it was written -- JobEventPublisher.publishLog,
   * called from all three NotifyService write paths -- and nothing on this side ever subscribed.
   * The screen said "live" while polling on a five-second timer, so a line could sit unseen for
   * five seconds and a finished run kept being re-fetched until a poll happened to notice.
   *
   * Lines are appended as they arrive. The next poll calls logs.set with the server's own list,
   * which replaces whatever was appended, so a line that arrives twice cannot persist as a
   * duplicate -- the socket is an early view of the same rows, not a second source of truth.
   */
  private listen(): void {
    this.socket = this.jobEvents.events.subscribe(event => {
      if (Number(event.jobId) !== Number(this.jobId())) return;

      if (event.type === 'job.log' && Number(event.jobQueueId) === Number(this.jobQueueId())) {
        this.logs.update(list => [...list, {
          jobId: Number(this.jobId()),
          jobQueueId: Number(this.jobQueueId()),
          logsDetail: event.message ?? '',
          dateCreated: event.at ?? new Date().toISOString(),
        }]);
        return;
      }

      // A status push is also what tells this screen the run has ended. stillRunning() reads
      // the run's status, so without this the poll kept re-arming against a finished run.
      if (event.type === 'job.status' && event.jobRunningStatus) {
        this.run.update(run => (run ? { ...run, jobStatus: event.jobRunningStatus } : run));
      }
    });
  }

  /** `quiet` keeps the list on screen during an auto-refresh instead of blanking it. */
  load(quiet = false): void {
    // A link built from a missing id arrives here as the literal text "undefined", and the
    // server answers with a Java type-conversion error that means nothing to whoever clicked.
    // Refuse it here and say what actually went wrong.
    if (!this.validIds()) {
      this.loading.set(false);
      this.missing.set(true);
      this.error.set('That link is missing the run it refers to. Open the run from the job\'s '
        + 'history instead.');
      return;
    }

    if (!quiet) this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<AuditLog[]>>(`${API_BASE}/sourceJob.json/findSourceJobAuditLog`, {
      params: { jobId: this.jobId(), jobQueueId: this.jobQueueId() },
    }).subscribe({
      next: response => {
        this.loading.set(false);
        this.refreshing.set(false);
        if (response.status === API_SUCCESS) {
          const data = response.data as any;
          // The payload is { auditLogs, sourceJob, sourceJobQueue }. This read "jobAuditLogs",
          // which never matched, so the screen reported no logs for every run.
          this.logs.set(Array.isArray(data) ? data : (data?.auditLogs ?? []));
          this.runStartedAt.set(data?.sourceJobQueue?.startTime ?? null);
          // The same call already carries both -- there is no reason to fetch them again.
          this.job.set(data?.sourceJob ?? null);
          this.run.set(data?.sourceJobQueue ?? null);
          this.loads.update(n => n + 1);
          this.loadAiSteps();
          this.loadCost();
        } else if (isMissingRecord(response)) {
          this.goneMissing();
          return;
        } else {
          this.error.set(response.message);
        }
        // The next poll is scheduled from here, when this one has actually come back.
        this.arm();
      },
      error: err => {
        this.loading.set(false);
        this.refreshing.set(false);
        if (isMissingRecord(err)) {
          this.goneMissing();
          return;
        }
        this.error.set(err?.error?.message || 'Could not load the logs.');
        // A failed poll still re-arms: a run does not stop producing lines because one request
        // was refused, and giving up here is how a screen goes quiet without saying so.
        this.arm();
      },
    });
  }

  /**
   * The run (or its job) is not there: a stale link, a deleted job, or another person's job for a
   * tenant user, which the server answers the same way. Said plainly, and the poll stops: the run
   * is cleared, so the live effect sees nothing still running.
   */
  private goneMissing(): void {
    this.clearTimer();
    this.run.set(null);
    this.logs.set([]);
    this.missing.set(true);
    this.error.set(`Run #${this.jobQueueId().trim()} of job #${this.jobId().trim()} does not exist or was deleted.`);
  }

}
