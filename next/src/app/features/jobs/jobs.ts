import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { MineFilter, isMine } from '../../shared/ui/mine-filter';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { TableShell } from '../../shared/ui/data-table';
import { StatusPill } from '../../shared/ui/status-pill';
import { Icon } from '../../shared/ui/icon';
import { NotifyDialog } from './notify-dialog';
import { JobAction, jobActionRequest } from './job-actions';
import { parseTopicPartition } from '../../shared/ui/topic';
import { JobEvent, JobEventsService } from '../../core/socket/job-events.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BarChart, Bar } from '../../shared/charts/bar-chart';
import { statusColor } from '../../shared/charts/status-color';
import { Router } from '@angular/router';
import { createPager } from '../../shared/ui/pager';
import { Pagination } from '../../shared/ui/pagination';
import { copyText } from '../../shared/ui/clipboard.util';
import { isInFlight, isStalled, stalledFor } from './stalled';
import { notifyChips, notifyCount, notifySentence } from './notify-summary';
import { JobAssistant } from './assistant/job-assistant';

export interface Scheduler {
  schedulerId: number;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  frequency?: string;
  intervalValue?: string;
  daysOfWeek?: string;
  dayOfMonth?: number;
  nextRunAt?: string;
  expired?: boolean;
  lastFlight?: boolean;
}

export interface SourceJob {
  /** Filled in by the server on the way out; null on rows with no recorded author. */
  createdByName?: string | null;
  updatedByName?: string | null;
  /** The author's id, so "Only mine" matches on identity rather than display text. */
  createdBy?: number | null;

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

/**
 * How long a run may sit in a non-terminal state before it is treated as stranded.
 *
 * A run that never reports back leaves the job showing Queue, Start or Running for ever, and
 * nothing on screen says anything is wrong -- which is exactly what happened when a worker
 * held a stale callback token: it did the work, wrote every file, and every status callback
 * came back 401, so the job sat in Start looking busy. Half an hour is far longer than any
 * run here takes, so passing it means something has gone quiet rather than slow.
 */
/** How many runs the in-panel strip shows before it stops being readable. */
const RECENT_RUN_BARS = 24;

const STALLED_AFTER_MS = 30 * 60 * 1000;

@Component({
  selector: 'app-jobs',
  imports: [MineFilter, JobAssistant, Icon, DatePipe, RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger, TableShell, StatusPill, Pagination, BarChart],
  templateUrl: './jobs.html',
})
export class Jobs implements OnInit {
  /**
   * Live counts across every job, not just the page in view.
   *
   * The socket already patches each row's status in place, so these recompute themselves as
   * runs move -- which is the point: with work in flight the question is "what is happening
   * right now", and that was only answerable by reading down the Run status column.
   */
  readonly statusColour = statusColor;

  readonly liveCounts = computed(() => {
    const all = this.jobs();
    const of = (test: (job: SourceJob) => boolean) => all.filter(test).length;
    const status = (job: SourceJob) => (job.jobRunningStatus ?? '').toLowerCase();
    return {
      running:   of(job => status(job) === 'running'),
      starting:  of(job => status(job) === 'start' || status(job) === 'queue'),
      completed: of(job => status(job) === 'completed'),
      failed:    of(job => status(job) === 'failed' || status(job) === 'interrupt'),
      idle:      of(job => !status(job)),
      total:     all.length,
    };
  });

  /** Only worth showing while something is actually moving. */
  readonly anyInFlight = computed(() => {
    const counts = this.liveCounts();
    return counts.running + counts.starting > 0;
  });

  /** The assistant as a panel over the list, rather than a page that replaces it. */
  readonly assistantJob = signal<SourceJob | null>(null);
  readonly assistantMinimised = signal(false);
  readonly String = String;

  openAssistant(job: SourceJob): void {
    this.assistantMinimised.set(false);
    this.assistantJob.set(job);
  }

  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly jobEvents = inject(JobEventsService);

  /** Shown in the toolbar so it is clear whether the table is live or stale. */
  readonly live = this.jobEvents.connected;

  /** Whether the socket has ever been up, and whether it has since dropped. */
  private everConnected = false;
  private missedEvents = false;

  readonly jobs = signal<SourceJob[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly statusFilter = signal('');
  readonly executionFilter = signal('');
  readonly busyJob = signal<number | null>(null);
  readonly expanded = signal<Set<number>>(new Set());
  readonly selected = signal<Set<number>>(new Set());

  /**
   * A task's payload, fetched when a job panel opens and cached by task rather than by job --
   * many jobs share one task, so keying by job would refetch the same XML for each of them.
   * The job list deliberately does not carry it: at roughly 600 bytes a row it was a third
   * of that response for something only an opened panel shows.
   */
  readonly payloadByTask = signal<Record<number, string>>({});
  readonly bulkBusy = signal(false);

  readonly pager = createPager<SourceJob>();

  private readonly router = inject(Router);

  /** Run history per job, kept so re-opening a row does not refetch. */
  readonly runsByJob = signal<Record<number, Bar[]>>({});
  readonly runsLoading = signal<number | null>(null);

  readonly statuses = computed(() =>
    [...new Set(this.jobs().map(j => j.jobRunningStatus).filter(Boolean))].sort());

  readonly executions = computed(() =>
    [...new Set(this.jobs().map(j => j.execution).filter(Boolean))].sort() as string[]);

  private readonly auth = inject(AuthService);

  /** Narrows the list to rows this person created. Not persisted -- see MineFilter. */

  readonly onlyMine = signal(false);


  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    const execution = this.executionFilter();
    return this.mine(this.jobs()).filter(job => {
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

  constructor() {
    // The pipeline reports every status change, so a running job updates in place. Reloading
    // the whole table for one row's status was what made the list flicker and lose scroll
    // position while anything was running.
    this.jobEvents.events.pipe(takeUntilDestroyed()).subscribe(event => this.applyEvent(event));

    /*
     * Re-read the list after a gap in the connection.
     *
     * Patching rows in place is only sound while every event arrives. A dropped socket loses
     * them with no replay, so a job that finishes during the gap keeps whatever it said when
     * the connection went down -- Running, for ever, with a timestamp that only gets older.
     * The stalled banner then reports that row in good faith, which is how it came to warn
     * about a run the database had long since completed.
     *
     * Only after an actual gap: the first connection follows the initial load, and reloading
     * there would fetch the same rows twice on every visit.
     */
    effect(() => {
      const live = this.jobEvents.connected();
      if (!live) {
        if (this.everConnected) this.missedEvents = true;
        return;
      }
      this.everConnected = true;
      if (this.missedEvents) {
        this.missedEvents = false;
        this.load();
      }
    });
  }

  private applyEvent(event: JobEvent): void {
    if (event.type === 'job.deleted') {
      this.jobs.update(list => list.filter(job => job.jobId !== event.jobId));
      this.selected.update(set => { const next = new Set(set); next.delete(event.jobId); return next; });
      return;
    }
    if (event.type === 'job.status' && event.jobRunningStatus) {
      const patch: Partial<SourceJob> = { jobRunningStatus: event.jobRunningStatus };
      // A status push carries the new status but not a new lastJobRun, so the row kept the
      // previous run's timestamp. The stall check measures from that field, so a run that had
      // only just started over the socket was flagged as stalled the instant it began.
      // The event's own `at` is when this run reached this state, which is precisely the
      // "last update" the warning talks about.
      if (isInFlight({ jobRunningStatus: event.jobRunningStatus })) {
        patch.lastJobRun = event.at ?? new Date().toISOString();
      }
      this.patchJob(event.jobId, patch);
      return;
    }
    // A toggle or an edit changes fields this event does not carry, so that one row is
    // re-read rather than guessed at -- still one job instead of the whole list.
    if (event.type === 'job.toggled' || event.type === 'job.updated') {
      this.refreshOne(event.jobId);
    }
  }

  private patchJob(jobId: number, patch: Partial<SourceJob>): void {
    this.jobs.update(list =>
      list.map(job => (job.jobId === jobId ? { ...job, ...patch } : job)));
  }

  /** Re-reads a single job. Used when a push says "changed" without saying how. */
  private refreshOne(jobId: number): void {
    this.http.get<ApiResponse<any>>(
      `${API_BASE}/sourceJob.json/fetchSourceJobDetailWithSourceJobId`,
      { params: { jobId: String(jobId) } }).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS || !response.data) return;
        const fresh = response.data as SourceJob;
        // A job the list has not seen before (created elsewhere) joins it.
        this.jobs.update(list => list.some(job => job.jobId === jobId)
          ? list.map(job => (job.jobId === jobId ? { ...job, ...fresh } : job))
          : [...list, fresh]);
      },
      error: () => { /* the row simply keeps what it had */ },
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
    const opening = !this.expanded().has(job.jobId);
    this.expanded.update(set => {
      const next = new Set(set);
      next.has(job.jobId) ? next.delete(job.jobId) : next.add(job.jobId);
      return next;
    });
    if (opening && !this.runsByJob()[job.jobId]) this.loadRuns(job.jobId);
    const taskId = job.taskDetail?.taskDetailId;
    if (opening && taskId && this.payloadByTask()[taskId] === undefined) this.loadPayload(taskId);
  }

  private loadPayload(taskDetailId: number): void {
    this.http.get<ApiResponse<any>>(`${API_BASE}/sourceTask.json/fetchSourceTaskWithSourceTaskId`,
      { params: { sourceTaskId: String(taskDetailId) } }).subscribe({
      next: response => {
        const payload = response.status === API_SUCCESS ? (response.data?.taskPayload ?? '') : '';
        this.payloadByTask.update(map => ({ ...map, [taskDetailId]: payload }));
      },
      // An empty string marks it as fetched-and-absent, so it is not requested again.
      error: () => this.payloadByTask.update(map => ({ ...map, [taskDetailId]: '' })),
    });
  }

  payloadFor(job: SourceJob): string | undefined {
    const taskId = job.taskDetail?.taskDetailId;
    return taskId ? this.payloadByTask()[taskId] : undefined;
  }

  async copyPayload(job: SourceJob): Promise<void> {
    const payload = this.payloadFor(job);
    if (!payload) return;
    if (await copyText(payload)) this.toast.success('Task payload copied.');
    else this.toast.error('Could not copy the payload.');
  }

  /**
   * How long each of this job's recent runs took, oldest first, coloured by outcome. The
   * legacy row carried the same chart and it is the quickest read of whether a job has been
   * getting slower or failing intermittently; a bar goes straight to that run's logs.
   */
  private loadRuns(jobId: number): void {
    this.runsLoading.set(jobId);
    this.http.get<ApiResponse<{ jobQueues?: any[] }>>(
      `${API_BASE}/sourceJob.json/fetchSourceJobQueueListWithJobId`,
      { params: { jobId: String(jobId) } }).subscribe({
      next: response => {
        this.runsLoading.set(null);
        const queues = response.status === API_SUCCESS ? (response.data?.jobQueues ?? []) : [];
        const bars: Bar[] = queues
          .filter(q => q.startTime && q.endTime)
          // "Recent runs" means recent: the panel is a strip a few hundred pixels wide, and a
          // job with hundreds of runs drew every one of them into it. Newest first from the
          // API, so take the window before reversing to oldest-first. Full history has the rest.
          .slice(0, RECENT_RUN_BARS)
          .reverse()
          .map(q => ({
            name: `#${q.jobQueueId}`,
            // Minutes, to one decimal -- a run under six seconds still shows a bar because of
            // the chart's floor rather than rounding away to zero.
            value: Math.max(0, Math.round(
              ((new Date(q.endTime).getTime() - new Date(q.startTime).getTime()) / 60000) * 10) / 10),
            color: statusColor(q.jobStatus),
            meta: q.jobQueueId,
          }));
        this.runsByJob.update(map => ({ ...map, [jobId]: bars }));
      },
      error: () => {
        this.runsLoading.set(null);
        this.runsByJob.update(map => ({ ...map, [jobId]: [] }));
      },
    });
  }

  openRunLogs(job: SourceJob, bar: Bar): void {
    this.router.navigate(['/jobs', job.jobId, 'runs', bar.meta, 'logs']);
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
              // The new id is in the message; the list picks it up without a full re-read.
              const newId = Number(/jobId (\d+)/.exec(created.message ?? '')?.[1]);
              if (Number.isFinite(newId)) this.refreshOne(newId);
              else this.load();
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
  readonly isInFlight = isInFlight;

  /** In flight far too long -- the run is not slow, it has stopped reporting. */
  readonly isStalled = (job: SourceJob) => isStalled(job);
  readonly stalledFor = (job: SourceJob) => stalledFor(job);

  readonly recentRunBars = RECENT_RUN_BARS;

  readonly stalledCount = computed(() => this.jobs().filter(job => this.isStalled(job)).length);

  /** Human summary of a schedule: "Daily every 2 at 00:01" and what is next. */
  scheduleSummary(job: SourceJob): string {
    const schedule = job.scheduler;
    if (!schedule) return job.execution === 'Manual' ? 'On demand' : '—';
    const parts: string[] = [schedule.frequency ?? ''];
    if (schedule.intervalValue && schedule.intervalValue !== '1') parts.push(`every ${schedule.intervalValue}`);
    // A weekly schedule pinned to weekdays, and a monthly one pinned to a date, run on
    // different days from their plain counterparts. Leaving that out made three unlike
    // monthly schedules read identically.
    const days = this.weekdayLabel(schedule.daysOfWeek);
    if (days) parts.push(`on ${days}`);
    const monthDay = this.monthDayLabel(schedule.dayOfMonth);
    if (monthDay) parts.push(`on the ${monthDay}`);
    if (schedule.startTime) parts.push(`at ${schedule.startTime.slice(0, 5)}`);
    return parts.filter(Boolean).join(' ');
  }

  private weekdayLabel(daysOfWeek?: string): string {
    if (!daysOfWeek) return '';
    const names: Record<string, string> = {
      MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun',
    };
    return daysOfWeek.split(',')
      .map(code => names[code.trim().toUpperCase()])
      .filter(Boolean)
      .join(', ');
  }

  /** The backend reads a day of 0 (or less) as "the last day of the month". */
  private monthDayLabel(dayOfMonth?: number): string {
    if (dayOfMonth === undefined || dayOfMonth === null) return '';
    if (dayOfMonth <= 0) return 'last day';
    const tens = dayOfMonth % 100;
    if (tens >= 11 && tens <= 13) return `${dayOfMonth}th`;
    const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[dayOfMonth % 10] ?? 'th';
    return `${dayOfMonth}${suffix}`;
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
          // The pipeline pushes the real status moments later; this stops the row looking
          // untouched in the meantime.
          if (action === 'run') this.patchJob(job.jobId, { jobRunningStatus: 'Queue' });
          else this.refreshOne(job.jobId);
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
          this.patchJob(job.jobId, { jobStatus: activating ? 'Active' : 'Inactive' });
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
          this.jobs.update(list => list.filter(row => row.jobId !== job.jobId));
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => this.toast.error(err?.error?.message || 'Delete failed.'),
    });
  }

  /** The three switches as chips, so the row reads at a glance rather than as a sentence. */
  readonly notifyChips = notifyChips;
  readonly notifyCount = notifyCount;
  readonly notifySentence = notifySentence;

  editNotifications(job: SourceJob): void {
    this.dialog.open<boolean>(NotifyDialog, {
      data: {
        jobId: job.jobId, jobName: job.jobName,
        completeJob: job.completeJob, failJob: job.failJob, skipJob: job.skipJob,
      },
    }).closed.subscribe(saved => { if (saved) this.refreshOne(job.jobId); });
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
      // Only the rows acted on changed, and a delete removes them outright.
      const touched = new Set(jobs.map(job => job.jobId));
      if (verb === 'deleted') {
        this.jobs.update(list => list.filter(job => !touched.has(job.jobId)));
      } else {
        this.jobs.update(list => list.map(job =>
          touched.has(job.jobId) ? { ...job, jobRunningStatus: 'Queue' } : job));
      }
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

  /** The legacy job row linked out to its task, its topic and its bucket; those three were
      the only way to get from a job to the thing it actually reads and writes. */
  topicOf(job: SourceJob): string {
    const parsed = parseTopicPartition(job.taskDetail?.sourceTaskType?.queueTopicPartition);
    return parsed.topic ? `${parsed.topic} (partitions ${parsed.partitions})` : '';
  }

  bucketLink(job: SourceJob): { bucket: string; prefix: string } | null {
    const task = job.taskDetail;
    if (!task?.bucket) return null;
    return { bucket: task.bucket, prefix: task.outputFolder || '' };
  }

  clearSelection(): void { this.selected.set(new Set()); }

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('');
    this.executionFilter.set('');
  }

  /**
   * Applies the "Only mine" toggle.
   *
   * Pure -- it runs inside a computed, where writing a signal is not allowed. The surviving
   * count is already on the table header, so nothing needs recording.
   */
  private mine<T extends { createdBy?: number | null }>(rows: T[]): T[] {
    if (!this.onlyMine()) {
      return rows;
    }
    const myId = this.auth.user()?.appUserId ?? null;
    return rows.filter(row => isMine(row, myId));
  }
}
