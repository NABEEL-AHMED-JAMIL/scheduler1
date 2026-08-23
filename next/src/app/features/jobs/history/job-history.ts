import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { TableShell } from '../../../shared/ui/data-table';
import { StatusPill } from '../../../shared/ui/status-pill';
import { Icon } from '../../../shared/ui/icon';
import { Donut } from '../../../shared/charts/donut';
import { BarChart } from '../../../shared/charts/bar-chart';
import { statusColor } from '../../../shared/charts/status-color';
import { copyText } from '../../../shared/ui/clipboard.util';
import { SplitBar } from '../../../shared/charts/split-bar';

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
  imports: [Icon, DatePipe, RouterLink, TableShell, StatusPill, Donut, BarChart, SplitBar],
  templateUrl: './job-history.html',
})
export class JobHistory {
  /** Bound from the route so the page can be linked to directly. */
  readonly jobId = input.required<string>();

  /**
   * Set when arriving from a dashboard count: the drill-down narrows to one status in one
   * hour, and the server does that filtering via the dimension-detail endpoint.
   */
  readonly jobStatus = input<string>('');
  readonly targetDate = input<string>('');
  readonly targetHr = input<string>('');

  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly runs = signal<JobQueue[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly statusFilter = signal('');
  readonly jobName = signal('');

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

  private loadDetail(): void {
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
    return points.slice(-24).map(p => ({
      name: new Date(p.run.startTime!).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      value: Math.round(p.seconds),
    }));
  });

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

  readonly hasInsights = computed(() => this.runs().length > 1);

  formatSeconds(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
  }

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
    });

    // The list endpoint is the only place the job's name is available.
    this.http.get<ApiResponse<any[]>>(`${API_BASE}/sourceJob.json/listSourceJob`).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) return;
        const job = (response.data ?? []).find(j => String(j.jobId) === this.jobId());
        if (job) this.jobName.set(job.jobName);
      },
    });
  }

  readonly isDrillDown = computed(() =>
    !!(this.targetDate() && this.targetHr() !== '' && this.jobStatus()));

  load(): void {
    this.loading.set(true);
    this.error.set('');
    const request = this.isDrillDown()
      ? this.http.get<ApiResponse<any>>(
          `${API_BASE}/dashboard.json/weeklyHrRunningStatisticsDimensionDetail`, {
            params: {
              targetDate: this.targetDate(),
              targetHr: this.targetHr(),
              jobStatus: this.jobStatus(),
              jobId: this.jobId(),
            },
          })
      : this.http.get<ApiResponse<any>>(
          `${API_BASE}/sourceJob.json/fetchSourceJobQueueListWithJobId`,
          { params: { jobId: this.jobId() } });

    request.subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS) { this.error.set(response.message); return; }
        const data = response.data ?? {};
        // The two endpoints name the same list differently.
        this.runs.set(data.sourceJobQueues ?? data.jobQueues ?? []);
        if (data.sourceJob?.jobName) this.jobName.set(data.sourceJob.jobName);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load the run history.');
      },
    });
  }

  /** Drops the hour/status narrowing and shows the job's whole history. */
  clearDrillDown(): void {
    this.router.navigate(['/jobs', this.jobId(), 'history']);
  }

  hourLabel(hour: string): string {
    const value = Number(hour);
    if (!isFinite(value)) return hour;
    if (value === 0) return '12a';
    if (value === 12) return '12p';
    return value < 12 ? `${value}a` : `${value - 12}p`;
  }

  /** Wall-clock duration of a run, or null while it is still going. */
  duration(run: JobQueue): string | null {
    if (!run.startTime || !run.endTime) return null;
    const ms = new Date(run.endTime).getTime() - new Date(run.startTime).getTime();
    if (!isFinite(ms) || ms < 0) return null;
    if (ms < 1000) return `${ms} ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.round((ms % 60_000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
}
