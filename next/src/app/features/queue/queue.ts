import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, auditTime, filter } from 'rxjs';

import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { localIsoDay, localIsoDaysAgo } from '../../shared/ui/local-day';
import { instantOf } from '../../core/instant';
import { formatDuration } from '../../shared/ui/time-format';
import { AuthService } from '../../core/auth/auth.service';
import { JobEventsService } from '../../core/socket/job-events.service';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { TableShell } from '../../shared/ui/data-table';
import { StatusPill } from '../../shared/ui/status-pill';
import { StatusFilterChip } from '../../shared/ui/status-filter-chip';
import { Icon } from '../../shared/ui/icon';
import { Donut } from '../../shared/charts/donut';
import { RankedBar } from '../../shared/charts/ranked-bar';
import { BarChart } from '../../shared/charts/bar-chart';
import { daySeries } from '../../shared/charts/day-series';
import { statusColor } from '../../shared/charts/status-color';
import { SplitBar } from '../../shared/charts/split-bar';
import { createPager } from '../../shared/ui/pager';
import { DateField } from '../../shared/ui/date-field';
import { Pagination } from '../../shared/ui/pagination';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { ManagedBanner } from '../../shared/ui/managed-banner';

interface QueueRow {
  jobQueueId: number;
  jobId: number;
  jobStatus: string;
  jobStatusMessage?: string;
  startTime?: string;
  endTime?: string;
  dateCreated?: string;
  runManual?: boolean;
  jobSend?: boolean;
}

interface StatusStat { name: string; value: number; }

/** One narrowing in force, named so it can be shown above the charts and removed from there. */
interface ActiveFilter { key: string; label: string; value: string; }

/**
 * How many runs one read brings, newest first (scale review P0 #3). The server keeps to it and says when the
 * range holds more; the range's counts by status come back beside the rows either way.
 */
const QUEUE_WINDOW = 2000;

const STATUSES = ['Queue', 'Start', 'Running', 'Completed', 'Failed', 'Skip', 'Interrupt', 'Missed'];

/**
 * The outcomes that mean a run did not deliver, taken from the JobStatus enum's eight
 * constants. Skip and Missed are deliberate or scheduler-side and are not counted as failures
 * here, matching the Reports screen so the same runs cannot yield two failure rates.
 */
const FAILED = new Set(['Failed', 'Interrupt']);

@Component({
  selector: 'app-queue',
  imports: [DateField, Icon, ServerTimePipe, RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger, TableShell, StatusPill, StatusFilterChip, Donut, RankedBar, BarChart, SplitBar, Pagination, ManagedBanner],
  templateUrl: './queue.html',
})
export class Queue implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly auth = inject(AuthService);
  /** MIG-254 (owner 2026-09-29): in a MANAGED workspace a run's status is our team's to force. */
  readonly locked = computed(() => this.auth.builderLocked());
  private readonly jobEvents = inject(JobEventsService);

  /** Shown beside Refresh, as on Jobs, so it is clear whether the list is following the runs. */
  readonly live = this.jobEvents.connected;

  /**
   * Whether a run and its job may link to the Jobs screens. Those routes are pageKey 'jobs' and
   * this one is 'queue', so a profile can hold Queue without Jobs; a link the page guard then
   * bounces is worse than plain text.
   */
  readonly canOpenJobs = computed(() => this.auth.canOpen('jobs'));

  /** Whether the socket has ever been up, and whether it has since dropped. See Jobs. */
  private everConnected = false;
  private missedEvents = false;
  private request?: Subscription;

  readonly statuses = STATUSES;
  readonly rows = signal<QueueRow[]>([]);
  /** The range holds more runs than the window brought: the newest QUEUE_WINDOW are on screen. */
  readonly hasMore = signal(false);
  readonly queueWindow = QUEUE_WINDOW;
  /** Job names by id: a run carries only its job's id, and a bare number told a reader nothing. */
  private readonly jobNames = signal<Map<number, string>>(new Map());
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly selectedStatuses = signal<string[]>([]);
  // fetchLogs requires a date range, so the page opens on the last seven days rather than
  // erroring with "FromDate missing" before the user has touched anything.
  readonly fromDate = signal(localIsoDaysAgo(6));
  readonly toDate = signal(localIsoDaysAgo(0));

  /**
   * Why the date boxes cannot be read, as on the dashboard. From after To was sent as it was and
   * came back empty, which read as a quiet week; a cleared box quietly fell back to the default
   * week while still showing empty. Nothing is read until the range makes sense.
   */
  readonly rangeError = computed(() => {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!iso.test(this.fromDate()) || !iso.test(this.toDate())) return 'Pick a date in both fields.';
    return this.fromDate() <= this.toDate() ? '' : 'From must be on or before To.';
  });

  /**
   * Whether anything is narrowed, for Clear. The dates are never empty, so testing them for a
   * value made Clear permanent; they count once they differ from the default week.
   */
  readonly hasFilters = computed(() =>
    !!this.search() || this.selectedStatuses().length > 0
    || this.fromDate() !== localIsoDaysAgo(6) || this.toDate() !== localIsoDaysAgo(0));

  /**
   * The messages every visualisation on this page describes. ONE computed, deliberately.
   *
   * The screen used to hold two populations at once. The table rendered this filtered list
   * while `byJob`, `byDay`, `durations` and `flagSplit` all read the raw `rows()` behind it,
   * and the donut read a server statistic that obeyed no filter at all -- so typing a job
   * number narrowed the table to three rows and left every chart above it describing all
   * fifty-two. Two answers about the same screen, side by side. Everything below reads
   * `data()`, so a filter cannot reach some of them and miss the others.
   *
   * Only the search box is applied here: the date range and the status chips go into the
   * fetchLogs body and reload, so `rows()` already obeys those two.
   */
  readonly data = computed(() => {
    const term = this.search().trim().toLowerCase();
    // Statuses are applied here, not by the server: a server-side filter narrowed the rows the
    // chips are counted over, so picking one status made every other chip vanish. The rows are
    // the range's newest QUEUE_WINDOW, and the note under the chips says when that is not all.
    const statuses = this.selectedStatuses();
    const shown = statuses.length ? this.rows().filter(row => statuses.includes(row.jobStatus as string)) : this.rows();
    if (!term) return shown;
    return shown.filter(row =>
      String(row.jobId).includes(term)
      || (this.jobNames().get(row.jobId) ?? '').toLowerCase().includes(term)
      || String(row.jobQueueId).includes(term)
      || (row.jobStatusMessage ?? '').toLowerCase().includes(term));
  });

  // Left as <any> on purpose: strictTemplates type-checks a typed row against the DOM, and
  // [title]="row.jobStatusMessage" is optional on QueueRow, so narrowing this widens the diff
  // into the table markup for no gain here.
  readonly pager = createPager<any>();
  readonly paged = computed(() => this.pager.slice(this.data()));

  goToPage(next: number): void { this.pager.goTo(next, this.data().length); }
  setPageSize(size: number): void { this.pager.setSize(size); }

  /** One definition of a status tally, so the chips and the ring cannot count differently. */
  private static tally(rows: QueueRow[]): { status: string; count: number }[] {
    const map = new Map<string, number>();
    for (const row of rows) map.set(row.jobStatus, (map.get(row.jobStatus) ?? 0) + 1);
    return [...map.entries()].map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * The status chips, which are a filter CONTROL and so are counted over the fetched rows
   * rather than over `data()`.
   *
   * Same reason the Reports pickers are built from its raw payload: a chip counted after the
   * search box had been applied would vanish the instant the search excluded its last row --
   * and a chip that vanishes while it is the SELECTED status takes with it the only control
   * that can switch that status back off. Describing the narrowed population is the charts'
   * job, and the strip above them says which narrowing is in force.
   */
  readonly counts = computed(() => Queue.tally(this.rows()));

  /**
   * The narrowing in force, stated above the charts rather than implied.
   *
   * The search box lives in the table toolbar BELOW the charts, so a reader looking at the
   * ring had no way to see that a term was holding rows out of it. Every figure here now
   * describes the narrowed set, which is only honest while the narrowing is visible.
   */
  readonly activeFilters = computed<ActiveFilter[]>(() => {
    const list: ActiveFilter[] = [];
    const term = this.search().trim();
    if (term) list.push({ key: 'search', label: 'Search', value: term });
    for (const status of this.selectedStatuses()) {
      list.push({ key: `status:${status}`, label: 'Status', value: status });
    }
    return list;
  });

  clearFilter(filter: ActiveFilter): void {
    if (filter.key === 'search') {
      this.search.set('');
      this.pager.reset();
      return;
    }
    this.toggleStatus(filter.value);
  }

  readonly showInsights = signal(false);
  /**
   * fetchLogs' second result set, `jobStatusStatistic`: the range's runs by status.
   *
   * Since scale review P0 #3 it carries the dates and the deleted-run clause the rows do (it
   * used to count every message ever recorded), but not the status chips -- so it is the whole
   * range while the rows are its newest QUEUE_WINDOW. It feeds no chart: the ring describes the
   * rows the table lists. It says how many runs the dates hold when the window is not all of them.
   */
  readonly statusStats = signal<StatusStat[]>([]);

  /** The outcome ring: the rows in view, and nothing the table is not also showing. */
  readonly statusMix = computed(() =>
    Queue.tally(this.data()).map(c => ({ name: c.status, value: c.count })));

  /** Two flags the queue records per message, as the old screen charted them. */
  readonly flagSplit = computed(() => {
    const rows = this.data();
    const split = (key: 'runManual' | 'jobSend', label: string) => ({
      label,
      positive: rows.filter(r => r[key] === true).length,
      negative: rows.filter(r => r[key] === false).length,
    });
    return [split('runManual', 'Started by hand'), split('jobSend', 'Sent to queue')];
  });

  readonly durations = computed(() => {
    const buckets = [
      { name: 'Under 5s', max: 5 },
      { name: '5-30s', max: 30 },
      { name: '30s-2m', max: 120 },
      { name: '2-10m', max: 600 },
      { name: 'Over 10m', max: Infinity },
    ];
    const counts = new Map<string, number>();
    for (const row of this.data()) {
      if (!row.startTime || !row.endTime) continue;
      const seconds = (new Date(row.endTime).getTime() - new Date(row.startTime).getTime()) / 1000;
      if (!Number.isFinite(seconds) || seconds < 0) continue;
      const bucket = buckets.find(b => seconds <= b.max)!;
      counts.set(bucket.name, (counts.get(bucket.name) ?? 0) + 1);
    }
    return buckets
      .map(b => ({ name: b.name, value: counts.get(b.name) ?? 0 }))
      .filter(b => b.value > 0);
  });

  readonly byJob = computed(() => {
    const map = new Map<string, number>();
    for (const row of this.data()) {
      const key = String(row.jobId ?? '—');
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    // Keyed by id so two jobs sharing a name stay two bars; labelled by name, as the table is.
    return [...map.entries()].map(([id, value]) => ({ name: this.jobName({ jobId: Number(id) }), value }));
  });

  /**
   * Volume per day, oldest first and gap-filled across the selected range.
   *
   * The gap-filling is the point. This used to emit only the days that had rows, so two bursts
   * six days apart rendered as two neighbouring bars -- a shape that reads as steady daily
   * traffic -- directly under a caption promising "oldest to newest across the selected range".
   * Shared with the Reports day chart so the two cannot drift apart again.
   */
  readonly byDay = computed(() => {
    const map = new Map<string, number>();
    for (const row of this.data()) {
      // The reader's own day, as the table's times and the range fields are. The stamp's first
      // ten characters were its UTC date whenever it carried an offset, so a Chicago evening run
      // landed on tomorrow -- a bar outside the range the reader had picked.
      const at = instantOf(row.dateCreated);
      if (!at) continue;
      const day = localIsoDay(at);
      map.set(day, (map.get(day) ?? 0) + 1);
    }
    const days = [...map.keys()].sort();
    if (!days.length) return [];
    const from = this.fromDate() && this.fromDate() <= days[0] ? this.fromDate() : days[0];
    const last = days[days.length - 1];
    const to = this.toDate() && this.toDate() >= last ? this.toDate() : last;
    return daySeries(map, from, to).bars;
  });

  /** How many runs the chosen dates hold, from the server's count; more than the rows when the window cut it. */
  readonly rangeTotal = computed(() =>
    this.statusStats().reduce((sum, s) => sum + s.value, 0));

  /** Of the messages in view. Reads from the same tally the ring draws. */
  readonly failureRate = computed(() => {
    const mix = this.statusMix();
    const total = mix.reduce((sum, s) => sum + s.value, 0);
    if (!total) return 0;
    const failed = mix.filter(s => FAILED.has(s.name)).reduce((sum, s) => sum + s.value, 0);
    return Math.round((failed / total) * 100);
  });

  /** Gated on the charted population, not the fetched one: a filter that empties the table
   *  leaves nothing to chart either, and empty rings under a live "Charts" button read as a
   *  broken screen rather than as an empty filter. */
  readonly hasInsights = computed(() => this.data().length > 0);

  readonly outcomeColor = statusColor;

  constructor() {
    /*
     * The screen says what is in flight right now, so it follows the runs. A status push is
     * re-read rather than patched in: Queue, Start and Running pushes carry no run id, and a new
     * run is not in the list at all. Debounced, so a burst of pushes costs one read; the search
     * and status chips are applied here and the range is in the body, so every filter holds.
     */
    this.jobEvents.events.pipe(
      filter(event => event.type === 'job.status'),
      // auditTime, not debounceTime: a busy workspace pushes without pause, and a debounce that
      // waits for a quiet second never fires. At most one read per five seconds, however busy.
      auditTime(5000),
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
  }

  ngOnInit(): void {
    this.load();
    this.loadJobNames();
  }

  /** The run's job by name, or its number when the list does not have it. */
  jobName(row: { jobId: number }): string {
    return this.jobNames().get(row.jobId) ?? `Job #${row.jobId}`;
  }

  private loadJobNames(): void {
    // The names come from the Schedules page's list (sourceJob.json, page jobs). A reader holding Queue alone -- the
    // Reviewer profile -- was refused it on every open, a 403 in the console (review 2026-10-07); their rows keep numbers.
    if (!this.auth.canOpen('jobs')) return;
    this.http.get<ApiResponse<{ jobId: number; jobName?: string }[]>>(`${API_BASE}/sourceJob.json/listSourceJob`).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) return;
        this.jobNames.set(new Map((response.data ?? [])
          .filter(job => job.jobName).map(job => [job.jobId, job.jobName!] as [number, string])));
      },
      error: () => { /* the numbers stay; names are a nicety */ },
    });
  }

  /**
   * @param silent a re-read the reader did not ask for: rows already on screen stay put rather
   *               than blurring under "Refreshing…" on every push.
   */
  load(options: { silent?: boolean } = {}): void {
    // A range that makes no sense is not sent; the reason shows under the toolbar, and the rows
    // of the last range read stay until the boxes are put right.
    if (this.rangeError()) return;
    if (!options.silent || !this.rows().length) this.loading.set(true);
    this.error.set('');
    // Only the latest read may land: a push arriving mid-read, or a date changed twice, must not
    // let an older answer overwrite a newer one.
    this.request?.unsubscribe();
    const body: any = { fromDate: this.fromDate(), toDate: this.toDate(), limit: QUEUE_WINDOW };

    this.request = this.http.post<ApiResponse<QueueRow[] | { jobQueues?: QueueRow[] }>>(
      `${API_BASE}/message.json/fetchLogs`, body).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS) { this.error.set(response.message); return; }
        // Named payload rather than data: `data()` is the filtered collection this screen
        // renders from, and the two are emphatically not the same population.
        const payload = response.data as any;
        // The payload is { jobStatusStatistic, sourceJobQueues }. This read "jobQueues",
        // which never matched, so the screen showed an empty table over hundreds of rows.
        this.rows.set(Array.isArray(payload) ? payload : (payload?.sourceJobQueues ?? []));
        this.statusStats.set(Array.isArray(payload) ? [] : (payload?.jobStatusStatistic ?? []));
        this.hasMore.set(!Array.isArray(payload) && !!payload?.hasMore);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load the queue.');
      },
    });
  }

  toggleStatus(status: string): void {
    this.selectedStatuses.update(list =>
      list.includes(status) ? list.filter(s => s !== status) : [...list, status]);
    this.pager.reset();
  }

  setFrom(value: string): void { this.fromDate.set(value); this.load(); }
  setTo(value: string): void { this.toDate.set(value); this.load(); }

  resetRange(): void {
    this.fromDate.set(localIsoDaysAgo(6));
    this.toDate.set(localIsoDaysAgo(0));
    this.load();
  }

  clearFilters(): void {
    this.search.set('');
    this.selectedStatuses.set([]);
    this.resetRange();
  }

  /** Force a stuck run to a terminal state so it stops occupying the queue. */
  async forceStatus(row: QueueRow, status: 'Failed' | 'Interrupt'): Promise<void> {
    // The words people read; the status names are the server's ("Mark Interrupt" read as a typo).
    const label = status === 'Failed' ? 'failed' : 'interrupted';
    const ok = await confirmWith(this.dialog, {
      title: `Mark run as ${label}`,
      body: `Run #${row.jobQueueId} of ${this.jobName(row)} will be recorded as ${label}. Use this when a run is stuck and the worker will not report back.`,
      confirmLabel: `Mark ${label}`,
      danger: true,
    });
    if (!ok) return;

    const url = status === 'Failed'
      ? `${API_BASE}/message.json/failJobLogs`
      : `${API_BASE}/message.json/interruptJobLogs`;

    // The endpoint's parameter is jobQId, not jobQueueId. Sending the wrong name meant Spring
    // rejected the call with 400 before the handler ran, so both of these actions had never
    // once worked -- the dialog confirmed, the toast never appeared, and nothing changed.
    this.http.delete<ApiResponse>(url, { params: { jobQId: String(row.jobQueueId) } }).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) {
          this.toast.success(`Run #${row.jobQueueId} marked ${label}.`);
          this.load();
        } else { this.toast.error(response.message); }
      },
      error: err => this.toast.error(err?.error?.message || 'That could not be changed.'),
    });
  }

  /**
   * How long a run took, written as the run history writes it ("25.3s", "2m"); this had a copy
   * of its own that said "25.3 s" and "1m 60s". Null while there is no end to measure to.
   */
  duration(row: QueueRow): string | null {
    if (!row.startTime || !row.endTime) return null;
    const ms = new Date(row.endTime).getTime() - new Date(row.startTime).getTime();
    if (!isFinite(ms) || ms < 0) return null;
    return formatDuration(ms / 1000);
  }

  /** A run with no end time is still occupying the queue. */
  inFlight(row: QueueRow): boolean {
    return !row.endTime && ['Queue', 'Start', 'Running'].includes(row.jobStatus);
  }
}
