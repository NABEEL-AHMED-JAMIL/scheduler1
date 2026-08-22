import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { TableShell } from '../../../shared/ui/data-table';
import { StatusPill } from '../../../shared/ui/status-pill';

interface JobQueue {
  jobQueueId: number;
  jobId: number;
  jobStatus: string;
  jobStatusMessage?: string;
  startTime?: string;
  endTime?: string;
  dateCreated?: string;
}

@Component({
  selector: 'app-job-history',
  imports: [DatePipe, RouterLink, TableShell, StatusPill],
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

  readonly filtered = computed(() => {
    const status = this.statusFilter();
    return status ? this.runs().filter(r => r.jobStatus === status) : this.runs();
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

  constructor() {
    // Reading the route inputs inside an effect means clearing the drill-down re-fetches,
    // rather than leaving the previous, narrower result on screen under a wider heading.
    effect(() => {
      this.jobId();
      this.jobStatus();
      this.targetDate();
      this.targetHr();
      this.load();
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
