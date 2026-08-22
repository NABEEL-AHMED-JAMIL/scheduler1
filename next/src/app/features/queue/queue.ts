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
import { Icon } from '../../shared/ui/icon';
import { Donut } from '../../shared/charts/donut';
import { RankedBar } from '../../shared/charts/ranked-bar';
import { BarChart } from '../../shared/charts/bar-chart';
import { statusColor } from '../../shared/charts/status-color';
import { SplitBar } from '../../shared/charts/split-bar';

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

const STATUSES = ['Queue', 'Start', 'Running', 'Completed', 'Failed', 'Skip', 'Interrupt', 'Missed'];

@Component({
  selector: 'app-queue',
  imports: [Icon, DatePipe, CdkMenu, CdkMenuItem, CdkMenuTrigger, TableShell, StatusPill, Donut, RankedBar, BarChart, SplitBar],
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

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.rows();
    return this.rows().filter(row =>
      String(row.jobId).includes(term)
      || String(row.jobQueueId).includes(term)
      || (row.jobStatusMessage ?? '').toLowerCase().includes(term));
  });

  readonly counts = computed(() => {
    const map = new Map<string, number>();
    for (const row of this.rows()) map.set(row.jobStatus, (map.get(row.jobStatus) ?? 0) + 1);
    return [...map.entries()].map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  });

  readonly showInsights = signal(false);
  /** The server's own breakdown for the range, which counts rows the table has filtered out. */
  readonly statusStats = signal<StatusStat[]>([]);

  readonly statusMix = computed(() => {
    const server = this.statusStats();
    if (server.length) {
      return server.map(s => ({
        name: s.name.charAt(0) + s.name.slice(1).toLowerCase(),
        value: s.value,
      }));
    }
    return this.counts().map(c => ({ name: c.status, value: c.count }));
  });

  /** Two flags the queue records per message, as the old screen charted them. */
  readonly flagSplit = computed(() => {
    const rows = this.rows();
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
    for (const row of this.rows()) {
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
    for (const row of this.rows()) {
      const key = String(row.jobId ?? '—');
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].map(([name, value]) => ({ name: `Job ${name}`, value }));
  });

  /** Volume per day, oldest first, so the bars read left to right like a calendar. */
  readonly byDay = computed(() => {
    const map = new Map<string, number>();
    for (const row of this.rows()) {
      const day = (row.dateCreated ?? '').slice(0, 10);
      if (!day) continue;
      map.set(day, (map.get(day) ?? 0) + 1);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, value]) => ({
        name: new Date(day + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        value,
      }));
  });

  readonly statisticTotal = computed(() =>
    this.statusMix().reduce((sum, s) => sum + s.value, 0));

  /**
   * The server counts the whole range but returns a capped slice of rows, so the donut and
   * the table legitimately disagree. Saying so beats showing two totals and no explanation.
   */
  readonly notListed = computed(() =>
    Math.max(0, this.statisticTotal() - this.rows().length));

  readonly failureRate = computed(() => {
    const mix = this.statusMix();
    const total = mix.reduce((sum, s) => sum + s.value, 0);
    if (!total) return 0;
    const failed = mix.filter(s => /fail|interrupt/i.test(s.name)).reduce((sum, s) => sum + s.value, 0);
    return Math.round((failed / total) * 100);
  });

  readonly hasInsights = computed(() => this.rows().length > 0);

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
        const data = response.data as any;
        // The payload is { jobStatusStatistic, sourceJobQueues }. This read "jobQueues",
        // which never matched, so the screen showed an empty table over hundreds of rows.
        this.rows.set(Array.isArray(data) ? data : (data?.sourceJobQueues ?? []));
        this.statusStats.set(Array.isArray(data) ? [] : (data?.jobStatusStatistic ?? []));
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

    this.http.delete<ApiResponse>(url, { params: { jobQueueId: String(row.jobQueueId) } }).subscribe({
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
