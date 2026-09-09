import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
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
import { Pagination } from '../../shared/ui/pagination';

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

const STATUSES = ['Queue', 'Start', 'Running', 'Completed', 'Failed', 'Skip', 'Interrupt', 'Missed'];

/**
 * The outcomes that mean a run did not deliver, taken from the JobStatus enum's eight
 * constants. Skip and Missed are deliberate or scheduler-side and are not counted as failures
 * here, matching the Reports screen so the same runs cannot yield two failure rates.
 */
const FAILED = new Set(['Failed', 'Interrupt']);

@Component({
  selector: 'app-queue',
  imports: [Icon, DatePipe, CdkMenu, CdkMenuItem, CdkMenuTrigger, TableShell, StatusPill, StatusFilterChip, Donut, RankedBar, BarChart, SplitBar, Pagination],
  templateUrl: './queue.html',
})
export class Queue implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);

  readonly statuses = STATUSES;
  readonly rows = signal<QueueRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly selectedStatuses = signal<string[]>([]);
  // fetchLogs requires a date range, so the page opens on the last seven days rather than
  // erroring with "FromDate missing" before the user has touched anything.
  readonly fromDate = signal(Queue.isoDaysAgo(6));
  readonly toDate = signal(Queue.isoDaysAgo(0));

  private static isoDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().slice(0, 10);
  }

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
    if (!term) return this.rows();
    return this.rows().filter(row =>
      String(row.jobId).includes(term)
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
    // Statuses are applied by the server, so dropping one has to refetch rather than widen
    // a predicate the browser holds.
    this.toggleStatus(filter.value);
  }

  readonly showInsights = signal(false);
  /**
   * fetchLogs' second result set, `jobStatusStatistic`.
   *
   * Read QueryService.fetchJobQLog before trusting it: the isState branch carries no date
   * clause, no job clause, no status clause and no `jq.status <> 'DELETE'`. It is every
   * message this workspace has ever recorded for every ACTIVE or INACTIVE job, deleted runs
   * included -- not the total for the selected range, which is what the donut used to plot it
   * as. Pick the Failed chip and the table showed 4 rows while the ring above drew 48
   * Completed and the caption called the screen 8% failed. It is kept only as an explicitly
   * labelled all-time footnote and feeds no chart.
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
    return [...map.entries()].map(([name, value]) => ({ name: `Job ${name}`, value }));
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
      const day = (row.dateCreated ?? '').slice(0, 10);
      if (!day) continue;
      map.set(day, (map.get(day) ?? 0) + 1);
    }
    const days = [...map.keys()].sort();
    if (!days.length) return [];
    const from = this.fromDate() && this.fromDate() <= days[0] ? this.fromDate() : days[0];
    const last = days[days.length - 1];
    const to = this.toDate() && this.toDate() >= last ? this.toDate() : last;
    return daySeries(map, from, to).bars;
  });

  /**
   * What the server's range-blind statistic adds up to. Shown as an all-time footnote and
   * never as this screen's total.
   *
   * The figure it replaces subtracted the row count from this same sum and the tooltip blamed
   * a server row cap -- fetchJobQLog has no LIMIT, so nothing was ever capped. The gap is the
   * date range and the filters, so that is what the label now says.
   */
  readonly allTimeTotal = computed(() =>
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

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    const body: any = {
      fromDate: this.fromDate() || Queue.isoDaysAgo(6),
      toDate: this.toDate() || Queue.isoDaysAgo(0),
    };
    if (this.selectedStatuses().length) body.jobStatuses = this.selectedStatuses();

    this.http.post<ApiResponse<QueueRow[] | { jobQueues?: QueueRow[] }>>(
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
    this.load();
  }

  clearFilters(): void {
    this.search.set('');
    this.selectedStatuses.set([]);
    this.fromDate.set(Queue.isoDaysAgo(6));
    this.toDate.set(Queue.isoDaysAgo(0));
    this.load();
  }

  /** Force a stuck run to a terminal state so it stops occupying the queue. */
  async forceStatus(row: QueueRow, status: 'Failed' | 'Interrupt'): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Mark run as ${status}`,
      body: `Run #${row.jobQueueId} of job ${row.jobId} will be recorded as ${status}. Use this when a run is stuck and the worker will not report back.`,
      confirmLabel: `Mark ${status}`,
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
          this.toast.success(`Run #${row.jobQueueId} marked ${status}.`);
          this.load();
        } else { this.toast.error(response.message); }
      },
      error: err => this.toast.error(err?.error?.message || 'That could not be changed.'),
    });
  }

  duration(row: QueueRow): string | null {
    if (!row.startTime || !row.endTime) return null;
    const ms = new Date(row.endTime).getTime() - new Date(row.startTime).getTime();
    if (!isFinite(ms) || ms < 0) return null;
    if (ms < 1000) return `${ms} ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
    return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  }

  /** A run with no end time is still occupying the queue. */
  inFlight(row: QueueRow): boolean {
    return !row.endTime && ['Queue', 'Start', 'Running'].includes(row.jobStatus);
  }
}
