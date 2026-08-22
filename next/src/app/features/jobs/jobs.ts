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

interface SourceJob {
  jobId: number;
  jobName: string;
  jobStatus: string;
  jobRunningStatus: string;
  lastJobRun?: string;
  execution?: string;
  priority?: string;
  assignedUsername?: string;
  taskDetail?: { taskDetailId?: number; taskName?: string };
}

@Component({
  selector: 'app-jobs',
  imports: [DatePipe, CdkMenu, CdkMenuItem, CdkMenuTrigger, TableShell, StatusPill],
  templateUrl: './jobs.html',
})
export class Jobs implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);

  readonly jobs = signal<SourceJob[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly statusFilter = signal('');
  readonly busyJob = signal<number | null>(null);

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

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<SourceJob[]>>(`${API_BASE}/sourceJob.json/listSourceJob`).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status === API_SUCCESS) this.jobs.set(response.data ?? []);
        else this.error.set(response.message);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load jobs.');
      },
    });
  }

  runNow(job: SourceJob): void {
    this.act(job, `${API_BASE}/sourceJob.json/runSourceJob`, `${job.jobName} queued to run.`);
  }

  skipNext(job: SourceJob): void {
    this.act(job, `${API_BASE}/sourceJob.json/skipNextSourceJob`, `Next run of ${job.jobName} skipped.`);
  }

  private act(job: SourceJob, url: string, successMessage: string): void {
    this.busyJob.set(job.jobId);
    this.http.post<ApiResponse>(url, null, { params: { jobId: String(job.jobId) } }).subscribe({
      next: response => {
        this.busyJob.set(null);
        if (response.status === API_SUCCESS) {
          this.toast.success(successMessage);
          this.load();
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => {
        this.busyJob.set(null);
        this.toast.error(err?.error?.message || 'That action failed.');
      },
    });
  }

  async toggleStatus(job: SourceJob): Promise<void> {
    const activating = job.jobStatus !== 'Active';
    const ok = await confirmWith(this.dialog, {
      title: activating ? 'Activate job' : 'Deactivate job',
      body: activating
        ? `"${job.jobName}" will resume running on its schedule.`
        : `"${job.jobName}" will stop running. Slots that pass while it is off are recorded as Missed rather than replayed.`,
      confirmLabel: activating ? 'Activate' : 'Deactivate',
    });
    if (!ok) return;

    this.http.put<ApiResponse>(`${API_BASE}/sourceJob.json/toggleSourceJobStatus`, null, {
      params: { jobId: String(job.jobId) },
    }).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) {
          this.toast.success(`${job.jobName} ${activating ? 'activated' : 'deactivated'}.`);
          this.load();
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => this.toast.error(err?.error?.message || 'Could not change the status.'),
    });
  }

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('');
  }
}
