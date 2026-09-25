import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { RouterLink } from '@angular/router';
import { EMPTY, catchError, from, mergeMap, tap } from 'rxjs';
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
import { instantOf } from '../../core/instant';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BarChart, Bar } from '../../shared/charts/bar-chart';
import { statusColor } from '../../shared/charts/status-color';
import { Router } from '@angular/router';
import { createPager } from '../../shared/ui/pager';
import { Pagination } from '../../shared/ui/pagination';
import { copyText } from '../../shared/ui/clipboard.util';
import { isInFlight, isStalled, stallHint } from './stalled';
import { notifyChips, notifyCount, notifySentence } from './notify-summary';
import { JobAssistant } from './assistant/job-assistant';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { clonePayload } from './job-clone';

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
  /** Total attempts a run may make, including the first; 1 (the default) means no retry. */
  maxAttempts?: number;
  /** Base seconds before a retry; the wait doubles per attempt. */
  retryBackoffSeconds?: number;
  lastJobRun?: string;
  /**
   * The server's stall verdict (MIG-63, process.util.RunStall): in flight and silent for more
   * than thirty minutes. The console shows it as-is and never works it out for itself.
   */
  stalled?: boolean;
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

/** How many runs the in-panel strip shows before it stops being readable. */
const RECENT_RUN_BARS = 24;

/**
 * How many of a bulk action's calls may be in flight at once.
 *
 * Selecting fifty jobs used to open fifty connections at the same instant; the browser then
 * serialises them in an order of its own and the whole batch is at the mercy of the slowest.
 * A handful at a time keeps the queue moving and is still far quicker than one after another.
 */
const BULK_CONCURRENCY = 4;

@Component({
  selector: 'app-jobs',
  imports: [MineFilter, JobAssistant, Icon, ServerTimePipe, RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger, TableShell, StatusPill, Pagination, BarChart],
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

  /**
   * A timestamp from the API as a real instant, for the date pipe.
   *
   * The pipe was given the raw string, which has no offset, so it was rendered as though the UTC
   * wall-clock time the container wrote were local -- "Last run" showed a time hours ahead of
   * now. See core/instant.ts.
   */
  when(text: string | null | undefined): Date | null {
    return instantOf(text);
  }

  private applyEvent(event: JobEvent): void {
    if (event.type === 'job.deleted') {
      this.jobs.update(list => list.filter(job => job.jobId !== event.jobId));
      this.selected.update(set => { const next = new Set(set); next.delete(event.jobId); return next; });
      return;
    }
    if (event.type === 'job.status' && event.jobRunningStatus) {
      // The row's `stalled` is the server's verdict as of the last read. A push is the run
      // reporting in, so whatever it now says -- a fresh in-flight state or a finish -- the
      // server's rule answers "not stalled", and a stale `true` must not outlive the report.
      const patch: Partial<SourceJob> = { jobRunningStatus: event.jobRunningStatus, stalled: false };
      // A status push carries the new status but not a new lastJobRun, so the row kept the
      // previous run's timestamp. The event's own `at` is when this run reached this state,
      // which is precisely the "last update" the Stalled tooltip measures from.
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
    this.router.navigate(['/operations/jobs', job.jobId, 'runs', bar.meta, 'logs']);
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
        const payload = clonePayload(response.data);
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

  /** In flight far too long -- the run is not slow, it has stopped reporting. The server decides. */
  readonly isStalled = (job: SourceJob) => isStalled(job);
  readonly stallHint = (job: SourceJob) => stallHint(job);

  readonly recentRunBars = RECENT_RUN_BARS;

  readonly stalledCount = computed(() => this.jobs().filter(job => this.isStalled(job)).length);

  /**
   * Whether this row's stored schedule is one the engine will actually act on.
   *
   * A job switched from Auto to Manual keeps its scheduler row: the editor sends no `schedulers`
   * block for a Manual job, so updateSourceJob leaves the row alone, and SchedulerRepository
   * .findDueSchedulers excludes it with `source_job.execution = 'Auto'` rather than expiring it --
   * deliberately, so switching back to Auto resumes the timetable instead of losing it. The row
   * therefore keeps a live-looking frequency and a next_run_at the dispatcher will never reach,
   * and both were rendered as plain fact.
   */
  private scheduleIsLive(job: SourceJob): boolean {
    return !!job.scheduler && job.execution !== 'Manual';
  }

  /**
   * The next run this row may assert, or null when there is none to assert.
   *
   * The template asked `job.scheduler?.nextRunAt && !expired` directly, so a Manual job went on
   * printing "Next 14 Sep, 02:00" from the schedule it no longer runs on -- a time that simply
   * never arrives, beside a Last run that never moves again.
   */
  nextRun(job: SourceJob): string | null {
    if (!this.scheduleIsLive(job)) return null;
    const schedule = job.scheduler!;
    return schedule.nextRunAt && !schedule.expired ? schedule.nextRunAt : null;
  }

  /**
   * Whether Skip next run can do anything for this job.
   *
   * It was enabled on the presence of a scheduler row alone, so a Manual job that kept one
   * offered the action and SourceJobServiceImpl.skipNextSourceJob answered "SourceJob skip only
   * work with 'auto' source job." -- an error for a menu item the list had just said was
   * available. There is nothing to skip when nothing is scheduled to run.
   */
  canSkipNext(job: SourceJob): boolean {
    return this.scheduleIsLive(job);
  }

  /** Human summary of a schedule: "Daily every 2 at 00:01" and what is next. */
  scheduleSummary(job: SourceJob): string {
    // Manual reads the same whether the row kept a schedule or never had one, because what it
    // does is the same either way: it runs when somebody presses Run now.
    if (job.execution === 'Manual') return 'On demand';
    const schedule = job.scheduler;
    if (!schedule) return '—';
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

  /**
   * Both vocabularies the column holds, because one of them was never meant to be there.
   *
   * The job editor shipped writing '1'..'7' where everything else writes MON..SUN, so those rows
   * matched nothing here and the list dropped the days from the schedule summary entirely -- a
   * "Weekly on Mon, Wed" job read simply as "Weekly", which is also what it had degraded into
   * running. The editor writes MON..SUN now; these rows outlive the fix, so they are still read.
   */
  private weekdayLabel(daysOfWeek?: string): string {
    if (!daysOfWeek) return '';
    const names: Record<string, string> = {
      MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun',
      1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun',
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
    // The schedule is still in the row and switching back to Auto resumes it, so say that it is
    // held rather than hiding it -- an operator who set one up needs to know it survived. Expired
    // and Ends-on notes are about a timetable that is running, which this one is not.
    if (job.execution === 'Manual') return { text: 'Schedule kept, paused while Manual', tone: 'muted' };
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
    // The row is locked while its request is out, as Run now, Skip and Duplicate already were;
    // without it a second click sent the change twice.
    if (this.busyJob() === job.jobId) return;
    const activating = job.jobStatus !== 'Active';
    const ok = await confirmWith(this.dialog, {
      title: activating ? 'Activate job' : 'Deactivate job',
      body: activating
        ? `"${job.jobName}" will resume running on its schedule.`
        : `"${job.jobName}" will stop running. Slots that pass while it is off are recorded as Missed rather than replayed when you turn it back on.`,
      confirmLabel: activating ? 'Activate' : 'Deactivate',
      // Turning a schedule off is confirmed as dangerous, like Delete here and the user and
      // workspace turn-offs elsewhere; turning it back on is not.
      danger: !activating,
    });
    if (!ok) return;

    const toggle = jobActionRequest('toggle', job.jobId);
    this.busyJob.set(job.jobId);
    this.http.request<ApiResponse>(toggle.method, toggle.url, { body: toggle.body }).subscribe({
      next: response => {
        this.busyJob.set(null);
        if (response.status === API_SUCCESS) {
          this.toast.success(`${job.jobName} ${activating ? 'activated' : 'deactivated'}.`);
          this.patchJob(job.jobId, { jobStatus: activating ? 'Active' : 'Inactive' });
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => { this.busyJob.set(null); this.toast.error(err?.error?.message || 'Could not change the status.'); },
    });
  }

  async remove(job: SourceJob): Promise<void> {
    if (this.busyJob() === job.jobId) return;
    const ok = await confirmWith(this.dialog, {
      title: 'Delete job',
      body: `"${job.jobName}" will be deleted and will stop running. Its run history is kept.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;

    const remove = jobActionRequest('delete', job.jobId);
    this.busyJob.set(job.jobId);
    this.http.request<ApiResponse>(remove.method, remove.url, { body: remove.body }).subscribe({
      next: response => {
        this.busyJob.set(null);
        if (response.status === API_SUCCESS) {
          this.toast.success(`${job.jobName} deleted.`);
          this.jobs.update(list => list.filter(row => row.jobId !== job.jobId));
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => { this.busyJob.set(null); this.toast.error(err?.error?.message || 'Delete failed.'); },
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
   * Runs the selection a few calls at a time and reports once, rather than firing a toast per
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
    const succeeded = new Set<number>();

    from(jobs).pipe(
      mergeMap(job => {
        const request = jobActionRequest(action, job.jobId);
        return this.http.request<ApiResponse>(request.method, request.url, { body: request.body })
          .pipe(
            tap(response => {
              if (response.status !== API_SUCCESS) {
                failures.push(`#${job.jobId} ${response.message}`);
                return;
              }
              succeeded.add(job.jobId);
              // Marked as its own call returns rather than all of them at the end, and only
              // while the row still says nothing is happening. A batch of fifty outlives the
              // first row's real status, so writing Queue over every touched row at the end
              // put a run the socket had already reported as Running back to Queue. The
              // pipeline is the authority on a row that has moved.
              const current = this.jobs().find(row => row.jobId === job.jobId);
              if (action === 'run' && current && !this.isInFlight(current)) {
                this.patchJob(job.jobId, { jobRunningStatus: 'Queue' });
              }
            }),
            // Swallowed on purpose: one job's failure is recorded and reported with the rest
            // at the end, and must not tear down the calls still queued behind it.
            catchError(err => {
              failures.push(`#${job.jobId} ${err?.error?.message || 'request failed'}`);
              return EMPTY;
            }),
          );
      }, BULK_CONCURRENCY),
    ).subscribe({
      complete: () => {
        this.bulkBusy.set(false);
        this.selected.set(new Set());
        const ok = jobs.length - failures.length;
        if (failures.length) {
          this.toast.error(`${ok} ${verb}, ${failures.length} failed: ${failures.slice(0, 2).join('; ')}`);
        } else {
          this.toast.success(`${ok} job${ok > 1 ? 's' : ''} ${verb}.`);
        }
        // A delete removes its rows outright, and only the ones the server actually deleted:
        // a row whose call failed is still there and hiding it would say otherwise.
        if (verb === 'deleted') {
          this.jobs.update(list => list.filter(job => !succeeded.has(job.jobId)));
        }
      },
    });
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

  /** Whether Clear is offered: anything that narrows the list, Only mine included. */
  readonly hasFilters = computed(() =>
    !!(this.search() || this.statusFilter() || this.executionFilter() || this.onlyMine()));

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('');
    this.executionFilter.set('');
    this.onlyMine.set(false);
    // As every other filter change does: back to page one, nothing selected that is now hidden.
    this.onFilterChange();
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
