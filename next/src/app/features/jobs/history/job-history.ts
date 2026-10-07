import { localIsoDaysAgo } from '../../../shared/ui/local-day';
import { Component, LOCALE_ID, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, auditTime, filter } from 'rxjs';

import { Router, RouterLink } from '@angular/router';
import { ReviewWaiting } from './review-waiting';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { JobEventsService } from '../../../core/socket/job-events.service';
import { isMissingRecord } from '../../../core/api/missing-record';
import { TableShell } from '../../../shared/ui/data-table';
import { StatusPill } from '../../../shared/ui/status-pill';
import { StatusFilterChip } from '../../../shared/ui/status-filter-chip';
import { Icon } from '../../../shared/ui/icon';
import { Donut } from '../../../shared/charts/donut';
import { BarChart } from '../../../shared/charts/bar-chart';
import { statusColor } from '../../../shared/charts/status-color';
import { notifyChips, notifySentence } from '../notify-summary';
import { AssistantDock } from '../assistant/assistant-dock';
import { copyText } from '../../../shared/ui/clipboard.util';
import { ToastService } from '../../../shared/ui/toast.service';
import { SplitBar } from '../../../shared/charts/split-bar';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { dayLabel, formatDuration, hourRange } from '../../../shared/ui/time-format';
import { clockTime } from '../schedule-labels';
import { createPager } from '../../../shared/ui/pager';
import { Pagination } from '../../../shared/ui/pagination';
import { StatStrip, StatStripItem, StatStripSummary } from '../../../shared/ui/stat-strip';
import { InboxArrival, InboxTrigger, arrivalsOf, runsStartedByFile, triggerOf, triggerSentence, waitingSentence } from '../inbox/inbox-trigger';

/**
 * How many runs one read brings: the newest window first, and older ones a window at a time on request.
 * A job that runs every minute makes half a million runs a year, and this screen read every one of them
 * again on each status push.
 */
const HISTORY_WINDOW = 500;
/** Runs Executions shows when it is opened without a job: the newest of the last day. */
export const RECENT_WINDOW = 200;

interface JobQueue {
  jobQueueId: number;
  jobId: number;
  jobStatus: string;
  jobStatusMessage?: string;
  startTime?: string;
  endTime?: string;
  dateCreated?: string;
  jobSend?: boolean;
  runManual?: boolean | null;
  skipManual?: boolean | null;
  skipTime?: string;
}

@Component({
  selector: 'app-job-history',
  imports: [AssistantDock, Icon, ServerTimePipe, RouterLink, TableShell, StatusPill, StatusFilterChip, Donut, BarChart, SplitBar, Pagination, StatStrip,
    ReviewWaiting],
  templateUrl: './job-history.html',
})
export class JobHistory {
  /** Runs whose full message is open. Short ones never need it. */
  private readonly openMessages = signal<Set<number>>(new Set());
  /** Beyond roughly this, the cell truncates and the text is worth opening. */
  private static readonly LONG_MESSAGE = 60;

  isLongMessage(message?: string | null): boolean {
    return (message ?? '').length > JobHistory.LONG_MESSAGE;
  }
  isMessageOpen(runId: number): boolean {
    return this.openMessages().has(runId);
  }
  toggleMessage(runId: number): void {
    this.openMessages.update(open => {
      const next = new Set(open);
      next.has(runId) ? next.delete(runId) : next.add(runId);
      return next;
    });
  }
  copyMessage(message?: string | null): void {
    copyText(message ?? '').then(
      () => this.toast.success('Message copied.'),
      () => this.toast.error('Could not copy the message.'));
  }

  /** The assistant as a panel beside the history, rather than a page that replaces it. */
  readonly assistantOpen = signal(false);
  readonly assistantMinimised = signal(false);

  readonly notifyChips = notifyChips;
  readonly notifySentence = notifySentence;
  /** Bound from the route so the page can be linked to directly. */
  /**
   * Empty when the screen was opened from the dashboard's TOTAL row, which covers every job
   * that ran in one hour rather than a single one.
   */
  readonly jobId = input<string>('');

  /**
   * Set when arriving from a dashboard count: the drill-down narrows to one status in one
   * hour, and the server does that filtering via the dimension-detail endpoint.
   */
  readonly jobStatus = input<string>('');
  readonly targetDate = input<string>('');
  readonly targetHr = input<string>('');

  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  /** The task editor is admin-only: others see a task's name, not a link to a refusal. */
  protected readonly canManageTasks = computed(() => this.auth.canManageTasks());
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly jobEvents = inject(JobEventsService);

  /** Shown as "Live" beside Refresh: while the feed is up, new runs arrive without a click. */
  readonly live = this.jobEvents.connected;
  private request?: Subscription;
  private everConnected = false;
  private missedEvents = false;

  readonly runs = signal<JobQueue[]>([]);
  /** The server has runs older than the ones loaded; Load older reads the next window. */
  readonly hasMore = signal(false);
  /** Executions without a job: more ran in the last day than RECENT_WINDOW shows. */
  readonly recentCut = signal(false);
  readonly loadingOlder = signal(false);
  readonly historyWindow = HISTORY_WINDOW;
  readonly loading = signal(true);
  readonly error = signal('');
  /** The job is not there, so Try again cannot help: the page offers Back to jobs instead. */
  readonly missing = signal(false);
  readonly statusFilter = signal('');
  readonly jobName = signal('');
  /** Every job's name by id, for the all-jobs drill-down's Job column. */
  readonly jobNames = signal(new Map<number, string>());

  readonly statuses = computed(() =>
    [...new Set(this.runs().map(r => r.jobStatus).filter(Boolean))].sort());

  /**
   * The three flags the queue records per run. A flag is only charted when the runs in view
   * actually carry it: skipManual is null on every row in this database, and a bar that is
   * always empty is a worse answer than leaving the question out.
   */
  readonly flagSplit = computed(() => {
    const rows = this.filtered();
    const split = (key: 'jobSend' | 'runManual' | 'skipManual', label: string) => {
      const known = rows.filter(r => r[key] === true || r[key] === false);
      if (!known.length) return null;
      return {
        label,
        positive: known.filter(r => r[key] === true).length,
        negative: known.filter(r => r[key] === false).length,
      };
    };
    return [
      split('jobSend', 'Reached the queue'),
      split('runManual', 'Started by hand'),
      split('skipManual', 'Skipped by hand'),
    ].filter((row): row is { label: string; positive: number; negative: number } => row !== null);
  });

  readonly filtered = computed(() => {
    const status = this.statusFilter();
    const term = this.search().trim().toLowerCase();
    return this.runs().filter(run => {
      if (status && run.jobStatus !== status) return false;
      if (!term) return true;
      return `${run.jobQueueId} ${run.jobStatusMessage ?? ''}`.toLowerCase().includes(term);
    });
  });

  /**
   * A long-lived job's history is every run it ever made, so the table pages like Jobs, Tasks
   * and Queue instead of rendering thousands of rows in one piece.
   */
  readonly pager = createPager<JobQueue>();
  readonly paged = computed(() => this.pager.slice(this.filtered()));
  goToPage(next: number): void { this.pager.goTo(next, this.filtered().length); }
  setPageSize(size: number): void { this.pager.setSize(size); }

  /** Filters change what "page 2" holds, so each goes back to the first page. */
  setStatusFilter(status: string): void { this.statusFilter.set(status); this.pager.reset(); }
  setSearch(term: string): void { this.search.set(term); this.pager.reset(); }
  clearFilters(): void { this.setStatusFilter(''); this.setSearch(''); }

  /** Why the table is empty -- a filter, an empty hour, or a job that has never run. */
  readonly emptyMessage = computed(() =>
    this.statusFilter() || this.search().trim() ? 'No runs match the current filters.'
      : this.isDrillDown() ? 'No runs in this hour.'
      : !this.jobId() ? 'No job ran in the last day. Open a schedule to see its whole history.'
      : 'This job has never run.');

  /** Counts per status, so the shape of a job's history reads at a glance. */
  readonly summary = computed(() => {
    const counts = new Map<string, number>();
    for (const run of this.runs()) {
      counts.set(run.jobStatus, (counts.get(run.jobStatus) ?? 0) + 1);
    }
    return [...counts.entries()].map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  });

  readonly showInsights = signal(false);
  /** The job and its task, so the run list has the context the old screen showed beside it. */
  readonly detail = signal<any | null>(null);
  readonly showDetail = signal(true);
  readonly payloadCopied = signal(false);
  readonly search = signal('');

  readonly runStats = computed(() => {
    const counts = new Map<string, number>();
    for (const run of this.runs()) counts.set(run.jobStatus, (counts.get(run.jobStatus) ?? 0) + 1);
    const order = ['Queue', 'Start', 'Running', 'Completed', 'Failed', 'Skip', 'Interrupt', 'Missed'];
    return order.map(name => ({ name, value: counts.get(name) ?? 0 }))
      .concat([{ name: 'Total', value: this.runs().length }]);
  });

  /** The eight statuses as strip tiles; a status with no runs keeps its tile, its 0 muted. */
  readonly runTiles = computed<StatStripItem[]>(() => this.runStats()
    .filter(stat => stat.name !== 'Total')
    .map(stat => ({ label: stat.name, value: stat.value, quiet: !stat.value })));

  /** "Total" only when it is: with older runs still on the server, the figure is the newest ones loaded. */
  readonly runTotal = computed<StatStripSummary>(() =>
    ({ label: this.hasMore() ? 'Loaded' : 'Total', value: this.runs().length }));

  copyPayload(): void {
    copyText(this.detail()?.taskDetail?.taskPayload ?? '').then(() => {
      this.payloadCopied.set(true);
      setTimeout(() => this.payloadCopied.set(false), 1500);
    });
  }

  notifyLabel(on?: boolean): string { return on ? 'On' : 'Off'; }

  /** The topic is stored inside "topic=x&partitions=[*]". */
  topicOf(raw?: string): string {
    if (!raw) return '—';
    const match = /topic=([^&]+)/.exec(raw);
    return match ? match[1] : raw;
  }

  /**
   * MIG-251 on MIG-239: the job's inbox trigger -- the "Event" start -- and what the inbox's files did to it. Only for
   * one job: the all-jobs hour has no job to ask about.
   */
  readonly trigger = signal<InboxTrigger | null>(null);
  readonly arrivals = signal<InboxArrival[]>([]);
  /** Each run a file started, by run id: its Started cell names the file. */
  readonly startedBy = computed(() => runsStartedByFile(this.arrivals()));
  /** The last few files, newest first, for the detail card; the rest are one click away in the runs they started. */
  readonly recentArrivals = computed(() => this.arrivals().slice(0, 5));
  readonly showInbox = computed(() => !!this.trigger()?.configured || this.arrivals().length > 0);
  readonly triggerSentence = triggerSentence;
  readonly waitingSentence = waitingSentence;

  private loadTrigger(): void {
    if (!this.jobId()) { this.trigger.set(null); return; }
    this.http.get<ApiResponse<unknown>>(`${API_BASE}/sourceJob.json/inboxTrigger`, { params: { jobId: this.jobId() } }).subscribe({
      next: response => this.trigger.set(response.status === API_SUCCESS ? triggerOf(response.data) : null),
      error: () => this.trigger.set(null),
    });
  }

  /** Re-read with the runs: a file that starts a run is how a new row arrives on this screen. */
  private loadArrivals(): void {
    if (!this.jobId()) { this.arrivals.set([]); return; }
    this.http.get<ApiResponse<unknown>>(`${API_BASE}/sourceJob.json/inboxArrivals`, { params: { jobId: this.jobId() } }).subscribe({
      next: response => { if (response.status === API_SUCCESS) this.arrivals.set(arrivalsOf(response.data)); },
      // The runs are the point of the screen; losing the file names must not break it.
      error: () => {},
    });
  }

  private loadDetail(): void {
    if (!this.jobId()) { this.detail.set(null); return; }
    this.http.get<ApiResponse<any>>(`${API_BASE}/sourceJob.json/fetchSourceJobDetailWithSourceJobId`,
      { params: { jobId: this.jobId() } }).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) this.detail.set(response.data ?? null);
      },
      // The run list is the point of the screen; losing the context panel should not break it.
      error: () => this.detail.set(null),
    });
  }

  readonly outcomeMix = computed(() =>
    this.summary().map(s => ({ name: s.status, value: s.count })));

  readonly outcomeColor = statusColor;

  private durationSeconds(run: JobQueue): number | null {
    if (!run.startTime || !run.endTime) return null;
    const seconds = (new Date(run.endTime).getTime() - new Date(run.startTime).getTime()) / 1000;
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }

  /** Runs over time, newest last, so a lengthening trend is visible as a slope. */
  readonly durationTrend = computed(() => {
    const points = this.runs()
      .map(run => ({ run, seconds: this.durationSeconds(run) }))
      .filter((p): p is { run: JobQueue; seconds: number } => p.seconds !== null)
      .sort((a, b) => (a.run.startTime ?? '').localeCompare(b.run.startTime ?? ''));
    // Named by the run's day on the server's clock, as the table dates it. toLocaleDateString
    // wrote the browser's "Sep 24" beside the table's "24 Sep", and read the stamp in the
    // viewer's own zone. Seconds to one decimal: rounding to whole ones drew a 0.4s run as 0.
    return points.slice(-24).map(p => ({
      name: this.clock.transform(p.run.startTime, 'day') ?? '',
      value: Math.round(p.seconds * 10) / 10,
    }));
  });

  private readonly clock = new ServerTimePipe(inject(LOCALE_ID));

  readonly durationStats = computed(() => {
    const values = this.runs()
      .map(run => this.durationSeconds(run))
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    if (!values.length) return null;
    const median = values[Math.floor(values.length / 2)];
    return {
      fastest: values[0],
      median,
      slowest: values[values.length - 1],
      count: values.length,
    };
  });

  /** Fastest, median and slowest as strip tiles; empty when no run has both a start and an end. */
  readonly durationTiles = computed<StatStripItem[]>(() => {
    const stats = this.durationStats();
    if (!stats) return [];
    return [
      { label: 'Fastest', value: formatDuration(stats.fastest) },
      { label: 'Median',  value: formatDuration(stats.median) },
      { label: 'Slowest', value: formatDuration(stats.slowest) },
    ];
  });

  readonly hasInsights = computed(() => this.runs().length > 1);

  constructor() {
    // Reading the route inputs inside an effect means clearing the drill-down re-fetches,
    // rather than leaving the previous, narrower result on screen under a wider heading.
    effect(() => {
      this.jobId();
      this.jobStatus();
      this.targetDate();
      this.targetHr();
      this.load();
      this.loadDetail();
      untracked(() => this.loadTrigger());
    });

    /*
     * The screen people watch while a job runs, so it follows the job-status feed the way Queue
     * does. A push is re-read rather than patched in: Queue, Start and Running pushes carry no
     * run id, and a new run is not in the list at all. Debounced, because one run sends four
     * pushes a few seconds apart and that burst should cost one read. An hour drill-down across
     * every job follows every job; otherwise only this job's pushes matter.
     */
    this.jobEvents.events.pipe(
      filter(event => event.type === 'job.status'
        && (this.isAllJobs() || String(event.jobId) === this.jobId())),
      // auditTime, not debounceTime: under a steady stream of pushes a debounce never fires, and an
      // hour across every job is exactly such a stream. At most one read per three seconds.
      auditTime(3000),
      takeUntilDestroyed(),
    ).subscribe(() => this.load({ silent: true }));

    // Pushes lost while the socket was down are not replayed, so a gap costs one re-read.
    effect(() => {
      if (!this.jobEvents.connected()) {
        if (this.everConnected) this.missedEvents = true;
        return;
      }
      this.everConnected = true;
      if (this.missedEvents) {
        this.missedEvents = false;
        this.load({ silent: true });
      }
    });

    // The list endpoint is the only place the job's name is available. Every name is kept, not
    // only this job's: an hour across every job lists runs of many jobs, and bare numbers there
    // said nothing about which job each run belonged to.
    this.http.get<ApiResponse<any[]>>(`${API_BASE}/sourceJob.json/listSourceJob`).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) return;
        const jobs = Array.isArray(response.data) ? response.data : [];
        this.jobNames.set(new Map(jobs.filter(j => j.jobName)
          .map(j => [Number(j.jobId), String(j.jobName)] as [number, string])));
        if (!this.jobId()) return;
        const job = jobs.find(j => String(j.jobId) === this.jobId());
        if (job) this.jobName.set(job.jobName);
      },
    });
  }

  /**
   * A date and an hour are what narrow this screen. Status is optional -- the TOTAL column
   * sends none on purpose, because no run is ever in a state called "Total", and requiring
   * one here made that click quietly show the job's entire history instead of the hour.
   */
  readonly isDrillDown = computed(() =>
    !!(this.targetDate() && this.targetHr() !== ''));

  /** True when drilling into an hour across every job rather than into one job. */
  readonly isAllJobs = computed(() => !this.jobId());

  /**
   * @param silent a re-read the reader did not ask for (a status push): the rows on screen stay
   *               put rather than blanking under the table's loading state, and a failed re-read
   *               keeps them instead of swapping them for an error.
   */
  load(options: { silent?: boolean } = {}): void {
    // Untracked: the route effect calls this, and reading the rows there would make every
    // answer that lands re-run the effect and read again.
    const silent = !!options.silent && untracked(() => this.runs().length > 0);
    if (!silent) {
      this.loading.set(true);
      this.error.set('');
      this.missing.set(false);
    }
    if (!this.isDrillDown() && !this.jobId()) {
      // Executions from the menu names no job: the last day's runs of every job, newest first, so the page is a
      // place to start rather than an empty table (UI review U8). The Queue's own read, bounded by date and count.
      this.loadRecent(silent);
      return;
    }

    // Every parameter on the detail endpoint is optional, so each is sent only when set:
    // no jobId means every job in the hour, and no status means every status.
    const drillParams: Record<string, string> = {
      targetDate: this.targetDate(),
      targetHr: this.targetHr(),
    };
    if (this.jobStatus()) drillParams['jobStatus'] = this.jobStatus();
    if (this.jobId()) drillParams['jobId'] = this.jobId();

    this.loadArrivals();

    const request = this.isDrillDown()
      ? this.http.get<ApiResponse<any>>(
          `${API_BASE}/dashboard.json/weeklyHrRunningStatisticsDimensionDetail`,
          { params: drillParams })
      : this.http.get<ApiResponse<any>>(
          `${API_BASE}/sourceJob.json/fetchSourceJobQueueListWithJobId`,
          { params: { jobId: this.jobId(), limit: HISTORY_WINDOW } });

    // Only the latest read may land: a push arriving mid-read must not let an older answer
    // overwrite a newer one.
    this.request?.unsubscribe();
    this.request = request.subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS) {
          // Another person's job reads exactly like a missing one for a tenant user (JobOwnership).
          if (!this.isDrillDown() && isMissingRecord(response)) {
            this.missing.set(true);
            this.runs.set([]);
            this.error.set(`Job #${String(this.jobId()).trim()} does not exist or was deleted.`);
          } else if (!silent) {
            this.error.set(response.message);
          }
          return;
        }
        const data = response.data ?? {};
        // The two endpoints name the same list differently.
        const fresh: JobQueue[] = data.sourceJobQueues ?? data.jobQueues ?? [];
        if (this.isDrillDown()) {
          this.runs.set(fresh);
          this.hasMore.set(false);
        } else {
          // A re-read brings the newest window again; older windows the reader already loaded stay below it.
          const oldestFresh = Math.min(...fresh.map(run => run.jobQueueId));
          const older = silent && fresh.length ? this.runs().filter(run => run.jobQueueId < oldestFresh) : [];
          this.runs.set([...fresh, ...older]);
          if (!older.length) this.hasMore.set(!!data.hasMore);
        }
        if (data.sourceJob?.jobName) this.jobName.set(data.sourceJob.jobName);
      },
      error: err => {
        this.loading.set(false);
        if (!silent) this.error.set(err?.error?.message || 'Could not load the run history.');
      },
    });
  }

  /** The newest runs of every job in the last day (at most RECENT_WINDOW), for Executions opened without a job. */
  private loadRecent(silent: boolean): void {
    this.request?.unsubscribe();
    const body = { fromDate: localIsoDaysAgo(1), toDate: localIsoDaysAgo(0), limit: RECENT_WINDOW };
    this.request = this.http.post<ApiResponse<any>>(`${API_BASE}/message.json/fetchLogs`, body).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS) { if (!silent) this.error.set(response.message); return; }
        const payload = response.data;
        this.runs.set(Array.isArray(payload) ? payload : (payload?.sourceJobQueues ?? []));
        this.hasMore.set(false);
        this.recentCut.set(!Array.isArray(payload) && !!payload?.hasMore);
      },
      error: err => {
        this.loading.set(false);
        if (!silent) this.error.set(err?.error?.message || 'Could not load the latest runs.');
      },
    });
  }

  /** The next window of older runs, below the ones on screen. */
  loadOlder(): void {
    const loaded = this.runs();
    if (!this.jobId() || !loaded.length || this.loadingOlder()) return;
    const beforeId = Math.min(...loaded.map(run => run.jobQueueId));
    this.loadingOlder.set(true);
    this.http.get<ApiResponse<any>>(`${API_BASE}/sourceJob.json/fetchSourceJobQueueListWithJobId`,
      { params: { jobId: this.jobId(), limit: HISTORY_WINDOW, beforeId } }).subscribe({
      next: response => {
        this.loadingOlder.set(false);
        if (response.status !== API_SUCCESS) { this.toast.error(response.message || 'Could not read older runs.'); return; }
        const older: JobQueue[] = response.data?.jobQueues ?? [];
        const known = new Set(this.runs().map(run => run.jobQueueId));
        this.runs.update(list => [...list, ...older.filter(run => !known.has(run.jobQueueId))]);
        this.hasMore.set(!!response.data?.hasMore);
      },
      error: err => {
        this.loadingOlder.set(false);
        this.toast.error(err?.error?.message || 'Could not read older runs.');
      },
    });
  }

  /** Drops the hour/status narrowing and shows the job's whole history. */
  clearDrillDown(): void {
    // Without a job there is no wider history to widen to -- '/pipelines/schedules//executions' would 404 --
    // so an all-jobs drill-down goes back to the dashboard it came from.
    if (!this.jobId()) { this.router.navigate(['/dashboard']); return; }
    this.router.navigate(['/pipelines/schedules', this.jobId(), 'executions']);
  }

  /**
   * The drill-down's hour and day, "22:00–23:00" on "24 Sep 2026". The heading read "at 10p" on
   * "2026-09-24", a 12-hour shorthand and a raw date beside a table on the 24-hour clock.
   */
  readonly hourRange = hourRange;
  readonly dayLabel = dayLabel;

  /** A schedule's time of day, "09:30" rather than the API's "09:30:00". */
  readonly clockTime = clockTime;

  /**
   * How long a run took, written as the tiles and the bars write it -- the table had its own
   * "25.3 s" and "2m 0s" while the tiles said "25s". Null while the run is still going.
   */
  duration(run: JobQueue): string | null {
    const seconds = this.durationSeconds(run);
    return seconds === null ? null : formatDuration(seconds);
  }
}
