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
import { JobAction, jobActionRequest } from './job-actions';
import { createPager } from '../../shared/ui/pager';
import { Pagination } from '../../shared/ui/pagination';

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
  imports: [Icon, DatePipe, RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger, TableShell, StatusPill, Pagination],
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
  readonly selected = signal<Set<number>>(new Set());
  readonly bulkBusy = signal(false);

  readonly pager = createPager<SourceJob>();

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

  readonly paged = computed(() => this.pager.slice(this.filtered()));
  readonly totalPages = computed(() => this.pager.totalPagesFor(this.filtered().length));

  /**
   * A run cannot be stacked on top of one already in flight, and a deleted job has nothing to
   * run -- the legacy screen refused both, so neither is offered here.
   */
  selectable(job: SourceJob): boolean {
    return job.jobStatus !== 'Delete' && !this.isInFlight(job);
  }

  readonly selectableOnPage = computed(() => this.paged().filter(job => this.selectable(job)));

  readonly allOnPageSelected = computed(() => {
    const rows = this.selectableOnPage();
    return rows.length > 0 && rows.every(job => this.selected().has(job.jobId));
  });

  readonly someOnPageSelected = computed(() =>
    this.selectableOnPage().some(job => this.selected().has(job.jobId)) && !this.allOnPageSelected());

  readonly selectedJobs = computed(() =>
    this.jobs().filter(job => this.selected().has(job.jobId)));

  toggleSelect(job: SourceJob): void {
    if (!this.selectable(job)) return;
    this.selected.update(set => {
      const next = new Set(set);
      next.has(job.jobId) ? next.delete(job.jobId) : next.add(job.jobId);
      return next;
    });
  }

  /** Select-all covers the page in view, not the whole filtered list, as the old screen did. */
  toggleSelectAllOnPage(): void {
    const rows = this.selectableOnPage();
    const selectAll = !this.allOnPageSelected();
    this.selected.update(set => {
      const next = new Set(set);
      for (const job of rows) selectAll ? next.add(job.jobId) : next.delete(job.jobId);
      return next;
    });
  }

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
    this.act(job, 'run', `${job.jobName} queued to run.`);
  }

  skipNext(job: SourceJob): void {
    this.act(job, 'skip', `Next run of ${job.jobName} skipped.`);
  }

  private act(job: SourceJob, action: JobAction, successMessage: string): void {
    const request = jobActionRequest(action, job.jobId);
    this.busyJob.set(job.jobId);
    this.http.request<ApiResponse>(request.method, request.url, { body: request.body }).subscribe({
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

    const toggle = jobActionRequest('toggle', job.jobId);
    this.http.request<ApiResponse>(toggle.method, toggle.url, { body: toggle.body }).subscribe({
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

    const remove = jobActionRequest('delete', job.jobId);
    this.http.request<ApiResponse>(remove.method, remove.url, { body: remove.body }).subscribe({
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

  onFilterChange(): void {
    this.pager.reset();
    this.selected.set(new Set());
  }

  goToPage(next: number): void { this.pager.goTo(next, this.filtered().length); }

  setPageSize(size: number): void {
    this.pager.setSize(size);
    this.selected.set(new Set());
  }

  /**
   * Runs the selection one call at a time and reports once, rather than firing a toast per
   * job: selecting fifty and getting fifty notifications is how the old screen behaved and it
   * buried any real failure among them.
   */
  runSelected(): void {
    const jobs = this.selectedJobs().filter(job => this.selectable(job));
    if (!jobs.length) {
      this.toast.error('Select at least one job that is not deleted or already running.');
      return;
    }
    this.confirmBulk({
      title: `Run ${jobs.length} job${jobs.length > 1 ? 's' : ''}?`,
      body: 'Each one is queued immediately, ignoring its schedule.',
      confirmLabel: 'Run them',
    }, jobs, 'run', 'queued');
  }

  /**
   * A queued, running or failed job cannot be deleted -- the legacy screen refused the whole
   * batch in that case rather than deleting part of it, so the selection stays intact and the
   * user can see which rows are the problem.
   */
  deleteSelected(): void {
    const jobs = this.selectedJobs();
    if (!jobs.length) {
      this.toast.error('Select at least one job to delete.');
      return;
    }
    const blocked = jobs.filter(job =>
      this.isInFlight(job) || (job.jobRunningStatus ?? '').toLowerCase() === 'failed');
    if (blocked.length) {
      const names = blocked.slice(0, 3).map(job => `#${job.jobId} (${job.jobRunningStatus})`).join(', ');
      this.toast.error(`Cannot delete while ${blocked.length > 3 ? `${blocked.length} jobs are` : names + ' is'} queued, running or failed.`);
      return;
    }
    this.confirmBulk({
      title: `Delete ${jobs.length} job${jobs.length > 1 ? 's' : ''}?`,
      body: 'They stop running and leave the list. Their run history is kept.',
      confirmLabel: 'Delete them',
      danger: true,
    }, jobs, 'delete', 'deleted');
  }

  private async confirmBulk(
    options: { title: string; body: string; confirmLabel: string; danger?: boolean },
    jobs: SourceJob[], action: JobAction, verb: string): Promise<void> {
    if (await confirmWith(this.dialog, options)) this.runEach(jobs, action, verb);
  }

  private runEach(jobs: SourceJob[], action: JobAction, verb: string): void {
    this.bulkBusy.set(true);
    const failures: string[] = [];
    let done = 0;
    const finish = () => {
      if (++done < jobs.length) return;
      this.bulkBusy.set(false);
      this.selected.set(new Set());
      const ok = jobs.length - failures.length;
      if (failures.length) {
        this.toast.error(`${ok} ${verb}, ${failures.length} failed: ${failures.slice(0, 2).join('; ')}`);
      } else {
        this.toast.success(`${ok} job${ok > 1 ? 's' : ''} ${verb}.`);
      }
      this.load();
    };
    for (const job of jobs) {
      const request = jobActionRequest(action, job.jobId);
      this.http.request<ApiResponse>(request.method, request.url, { body: request.body }).subscribe({
        next: response => {
          if (response.status !== API_SUCCESS) failures.push(`#${job.jobId} ${response.message}`);
          finish();
        },
        error: err => { failures.push(`#${job.jobId} ${err?.error?.message || 'request failed'}`); finish(); },
      });
    }
  }

  clearSelection(): void { this.selected.set(new Set()); }

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('');
    this.executionFilter.set('');
  }
}
