import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { forkJoin } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';

interface NameValue { name: string; value: number; }

interface SourceJob {
  jobId: number;
  jobName: string;
  jobStatus: string;
  jobRunningStatus: string;
  lastJobRun?: string;
  execution?: string;
  priority?: string;
  assignedUsername?: string;
  taskDetail?: { taskName?: string };
}

@Component({
  selector: 'app-dashboard',
  imports: [DecimalPipe, DatePipe],
  templateUrl: './dashboard.html',
})
export class Dashboard implements OnInit {
  private readonly http = inject(HttpClient);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly jobs = signal<SourceJob[]>([]);
  readonly runStats = signal<NameValue[]>([]);
  readonly search = signal('');
  readonly statusFilter = signal<string>('');

  readonly range = (() => {
    const end = new Date();
    const start = new Date(end.getTime() - 6 * 864e5);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return { start: iso(start), end: iso(end) };
  })();

  /** Run outcomes over the window, normalised so a missing status reads as zero. */
  readonly runCount = computed(() => {
    const byName = new Map(this.runStats().map(s => [s.name.toUpperCase(), s.value]));
    return {
      completed: byName.get('COMPLETED') ?? 0,
      failed: byName.get('FAILED') ?? 0,
      running: byName.get('RUNNING') ?? 0,
      missed: byName.get('MISSED') ?? 0,
    };
  });

  readonly jobCount = computed(() => {
    const jobs = this.jobs();
    return {
      total: jobs.length,
      active: jobs.filter(j => j.jobStatus === 'Active').length,
    };
  });

  readonly statuses = computed(() =>
    [...new Set(this.jobs().map(j => j.jobRunningStatus).filter(Boolean))].sort());

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    return this.jobs().filter(job => {
      if (status && job.jobRunningStatus !== status) return false;
      if (!term) return true;
      return String(job.jobId).includes(term)
        || (job.jobName ?? '').toLowerCase().includes(term)
        || (job.taskDetail?.taskName ?? '').toLowerCase().includes(term);
    });
  });

  ngOnInit(): void {
    const params = { startDate: this.range.start, endDate: this.range.end };
    forkJoin({
      jobs: this.http.get<ApiResponse<SourceJob[]>>(`${API_BASE}/sourceJob.json/listSourceJob`),
      runs: this.http.get<ApiResponse<NameValue[]>>(
        `${API_BASE}/dashboard.json/jobRunningStatistics`, { params }),
    }).subscribe({
      next: ({ jobs, runs }) => {
        this.loading.set(false);
        if (jobs.status === API_SUCCESS) this.jobs.set(jobs.data ?? []);
        if (runs.status === API_SUCCESS) this.runStats.set(runs.data ?? []);
        if (jobs.status !== API_SUCCESS) this.error.set(jobs.message);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load dashboard data.');
      },
    });
  }

  /** Maps a run status onto the semantic pill classes; unknown states stay neutral. */
  pillClass(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'completed': return 'pill pill-ok';
      case 'failed':
      case 'interrupt': return 'pill pill-crit';
      case 'missed':
      case 'skip': return 'pill pill-warn';
      case 'running':
      case 'start': return 'pill pill-brand';
      default: return 'pill pill-neutral';
    }
  }

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('');
  }
}
