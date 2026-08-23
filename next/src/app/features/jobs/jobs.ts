import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { TableShell } from '../../shared/ui/data-table';
import { StatusPill } from '../../shared/ui/status-pill';
import { Icon } from '../../shared/ui/icon';
import { NotifyDialog } from './notify-dialog';

export interface Scheduler {
  schedulerId: number;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  frequency?: string;
  intervalValue?: string;
  dayOfMonth?: number;
  nextRunAt?: string;
  expired?: boolean;
  lastFlight?: boolean;
}

export interface SourceJob {
  jobId: number;
  jobName: string;
  jobStatus: string;
  jobRunningStatus: string;
  execution?: string;
  priority?: number;
  lastJobRun?: string;
  dateCreated?: string;
  assignedUsername?: string;
  completeJob?: boolean;
  failJob?: boolean;
  skipJob?: boolean;
  scheduler?: Scheduler | null;
  taskDetail?: {
    taskDetailId?: number; taskName?: string; taskStatus?: string;
    bucket?: string; outputFolder?: string; pipelineId?: string; homePageId?: string;
    sourceTaskType?: { serviceName?: string; queueTopicPartition?: string };
  };
}

/** Statuses where an in-flight run means a manual action would collide. */
const IN_FLIGHT = ['queue', 'start', 'running'];

@Component({
  selector: 'app-jobs',
  imports: [Icon, DatePipe, RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger, TableShell, StatusPill],
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
  readonly executionFilter = signal('');
  readonly busyJob = signal<number | null>(null);
  readonly expanded = signal<Set<number>>(new Set());

  readonly statuses = computed(() =>
    [...new Set(this.jobs().map(j => j.jobRunningStatus).filter(Boolean))].sort());

  readonly executions = computed(() =>
    [...new Set(this.jobs().map(j => j.execution).filter(Boolean))].sort() as string[]);

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    const execution = this.executionFilter();
    return this.jobs().filter(job => {
      if (status && job.jobRunningStatus !== status) return false;
      if (execution && job.execution !== execution) return false;
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

  toggleRow(job: SourceJob): void {
    this.expanded.update(set => {
      const next = new Set(set);
      next.has(job.jobId) ? next.delete(job.jobId) : next.add(job.jobId);
      return next;
    });
  }

  /**
   * There is no clone endpoint: the old screen read the job back in full and posted it as a
   * new one. Same here, with a distinct name so the copy is identifiable in the list.
   */
  clone(job: SourceJob): void {
    this.busyJob.set(job.jobId);
    this.http.get<ApiResponse<any>>(`${API_BASE}/sourceJob.json/fetchSourceJobDetailWithSourceJobId`,
      { params: { jobId: job.jobId } }).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS || !response.data) {
          this.busyJob.set(null);
          this.toast.error(response.message || 'That job could not be read.');
          return;
        }
        const source = response.data;
        const payload: any = {
          jobName: `${source.jobName} (copy)`,
          taskDetail: { taskDetailId: source.taskDetail?.taskDetailId },
          execution: source.execution,
          priority: source.priority,
          // A copy starts inactive: cloning a live schedule should not silently double the runs.
          jobStatus: 'Inactive',
          completeJob: source.completeJob,
          failJob: source.failJob,
          skipJob: source.skipJob,
        };
        if (source.scheduler) {
          payload.schedulers = [{
            startDate: source.scheduler.startDate,
            endDate: source.scheduler.endDate,
            startTime: source.scheduler.startTime,
            frequency: source.scheduler.frequency,
            intervalValue: source.scheduler.intervalValue,
            daysOfWeek: source.scheduler.daysOfWeek,
            dayOfMonth: source.scheduler.dayOfMonth,
          }];
        }
        this.http.post<ApiResponse>(`${API_BASE}/sourceJob.json/addSourceJob`, payload).subscribe({
          next: created => {
            this.busyJob.set(null);
            if (created.status === API_SUCCESS) {
              this.toast.success(`Copied as "${payload.jobName}" — it starts inactive.`);
              this.load();
            } else { this.toast.error(created.message); }
          },
          error: err => {
            this.busyJob.set(null);
            this.toast.error(err?.error?.message || 'The copy could not be created.');
          },
        });
      },
      error: err => {
        this.busyJob.set(null);
        this.toast.error(err?.error?.message || 'That job could not be read.');
      },
    });
  }

  /** A run already in flight would collide with a manual run or skip. */
  isInFlight(job: SourceJob): boolean {
    return IN_FLIGHT.includes((job.jobRunningStatus ?? '').toLowerCase());
  }

  /** Human summary of a schedule: "Daily every 2 at 00:01" and what is next. */
  scheduleSummary(job: SourceJob): string {
    const schedule = job.scheduler;
    if (!schedule) return job.execution === 'Manual' ? 'On demand' : '—';
    const parts: string[] = [schedule.frequency ?? ''];
    if (schedule.intervalValue && schedule.intervalValue !== '1') parts.push(`every ${schedule.intervalValue}`);
    if (schedule.startTime) parts.push(`at ${schedule.startTime.slice(0, 5)}`);
    return parts.filter(Boolean).join(' ');
  }

  scheduleNote(job: SourceJob): { text: string; tone: 'warn' | 'muted' } | null {
    const schedule = job.scheduler;
    if (!schedule) return null;
    if (schedule.expired) return { text: 'Expired — no further runs', tone: 'warn' };
    if (schedule.lastFlight) return { text: 'Final run scheduled', tone: 'warn' };
    if (schedule.endDate) return { text: `Ends ${schedule.endDate}`, tone: 'muted' };
    return null;
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
        : `"${job.jobName}" will stop running. Slots that pass while it is off are recorded as Missed rather than replayed when you turn it back on.`,
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

  async remove(job: SourceJob): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: 'Delete job',
      body: `"${job.jobName}" will be deleted and will stop running. Its run history is kept.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;

    this.http.put<ApiResponse>(`${API_BASE}/sourceJob.json/deleteSourceJob`, null, {
      params: { jobId: String(job.jobId) },
    }).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) {
          this.toast.success(`${job.jobName} deleted.`);
          this.load();
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => this.toast.error(err?.error?.message || 'Delete failed.'),
    });
  }

  /** The three switches as chips, so the row reads at a glance rather than as a sentence. */
  notifyChips(job: SourceJob) {
    return [
      { label: 'complete', on: !!job.completeJob, icon: 'checkCircle', intent: 'icon-ok' },
      { label: 'fail',     on: !!job.failJob,     icon: 'xCircle',     intent: 'icon-crit' },
      { label: 'skip',     on: !!job.skipJob,     icon: 'alert',       intent: 'icon-warn' },
    ];
  }

  notifyCount(job: SourceJob): number {
    return [job.completeJob, job.failJob, job.skipJob].filter(Boolean).length;
  }

  editNotifications(job: SourceJob): void {
    this.dialog.open<boolean>(NotifyDialog, {
      data: {
        jobId: job.jobId, jobName: job.jobName,
        completeJob: job.completeJob, failJob: job.failJob, skipJob: job.skipJob,
      },
    }).closed.subscribe(saved => { if (saved) this.load(); });
  }

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('');
    this.executionFilter.set('');
  }
}
