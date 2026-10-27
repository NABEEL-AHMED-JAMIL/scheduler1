import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { Subscription, auditTime, filter } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { JobEventsService } from '../../../core/socket/job-events.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Icon } from '../../../shared/ui/icon';
import { StatusPill } from '../../../shared/ui/status-pill';
import { Timeline, runFinished } from '../../tasks/steps/steps.model';
import { RetryDialog, RetryDialogData } from '../../jobs/retry/retry-dialog';
import { formatDuration } from '../../../shared/ui/time-format';

/**
 * How long to wait before reading an unfinished run again when no push arrives: quick at first (a run's first steps take
 * seconds), then backing off to the cap. The job-status feed (the Executions page's own) cuts any wait short; this is
 * for a socket that is down, or a push that was lost.
 */
export const FOLLOW_BACKOFF_MS = [1500, 2500, 4000, 6000, 10000, 15000];

/** What the card says a run is: the run's own status, and -- once it completed -- its review, when the results need one. */
export function runState(t: Pick<Timeline, 'runStatus'> & { reviewStatus?: string | null; waitingForApproval?: boolean } | null,
  fallback?: string | null): { label: string; final: boolean } {
  const status = t?.runStatus ?? fallback ?? 'Queue';
  // MIG-346: a run paused at an Approval step goes on once someone decides: still followed, said as what it waits for.
  if (t?.waitingForApproval && !runFinished(status)) return { label: 'Waiting for approval', final: false };
  if (status === 'Completed' && t?.reviewStatus === 'PENDING') return { label: 'Waiting for review', final: true };
  if (status === 'Completed' && t?.reviewStatus === 'REJECTED') return { label: 'Rejected', final: true };
  return { label: status, final: runFinished(status) };
}

/**
 * A run the assistant started (run_pipeline), followed live to its end (owner bug 2026-10-12: the chat card said
 * "Running" forever, because it showed the status the run had the moment it was queued). It reads the run's step
 * timeline (sourceJob.json/stepExecutions) and reads it again on every job-status push for its job -- the feed the
 * Executions page follows -- and, between pushes, on a backing-off timer; it stops once the run is final: Completed (or
 * Waiting for review), Failed, Interrupt, Skip, Missed. A failed run offers Retry (the Executions page's dialog).
 */
@Component({
  selector: 'app-run-follow',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, StatusPill, RouterLink],
  styles: [`
    .rf-bar { height: 0.375rem; width: 7rem; border-radius: 9999px; background: var(--surface-sunken); overflow: hidden; }
    .rf-fill { height: 100%; border-radius: 9999px; background: var(--accent-mark); }
    .rf-fill.crit { background: var(--crit-text); }
  `],
  template: `
    <div class="flex flex-col gap-1.5 min-w-0" data-link="execution" [attr.data-run]="jobQueueId()" [attr.data-state]="state().label">
      <div class="flex flex-wrap items-center gap-2 min-w-0">
        <app-status [label]="state().label" />
        <span class="font-medium truncate min-w-0" [title]="jobName() || ''">{{ jobName() || 'Schedule ' + jobId() }}</span>
        @if (jobQueueId() != null) { <span class="pill pill-neutral mono">run #{{ jobQueueId() }}</span> }
        @if (following()) {
          <span class="text-xs text-[color:var(--text-muted)] flex items-center gap-1" role="status">
            <app-icon name="refresh" class="spin" size="0.85em" />live
          </span>
        }
      </div>
      @if (progress(); as p) {
        <div class="flex items-center gap-2 text-xs text-[color:var(--text-secondary)]" data-progress>
          <div class="rf-bar" aria-hidden="true">
            <div class="rf-fill" [class.crit]="p.failed" [style.width.%]="p.percent"></div>
          </div>
          <span>{{ p.done }} of {{ p.total }} steps{{ p.current ? ' · ' + p.current : '' }}{{ p.duration ? ' · ' + p.duration : '' }}</span>
        </div>
      }
      @if (failure(); as f) { <p class="text-xs text-crit-500 break-words">{{ f }}</p> }
      @if (error()) { <p class="text-xs text-[color:var(--text-muted)]">{{ error() }}</p> }
      <div class="flex flex-wrap gap-1.5">
        <!-- UX review B6 (AI2): a run that finished leads to what it made -- the dashboard its output feeds, else its
             Outputs -- and one waiting for review to the run page, where Approve and Reject are. -->
        @if (results(); as r) {
          <a class="btn btn-primary btn-sm" data-test="see-results" [routerLink]="r.link" [queryParams]="r.query"><app-icon name="chart" />{{ r.label }}</a>
        }
        @if (state().label === 'Waiting for review' && jobQueueId() != null) {
          <a class="btn btn-primary btn-sm" data-test="review-run" [routerLink]="['/pipelines/schedules', jobId(), 'runs', jobQueueId()]"><app-icon name="checkCircle" />Review it</a>
        }
        @if (jobQueueId() != null) {
          <a class="btn btn-default btn-sm" [routerLink]="['/pipelines/schedules', jobId(), 'runs', jobQueueId()]"><app-icon name="list" />Open the run</a>
        }
        <a class="btn btn-default btn-sm" [routerLink]="['/pipelines/schedules', jobId(), 'executions']"><app-icon name="history" />All runs</a>
        @if (state().label === 'Failed' && jobQueueId() != null) {
          <button type="button" class="btn btn-default btn-sm" (click)="retry()"><app-icon name="refresh" />Retry</button>
        }
      </div>
    </div>
  `,
})
export class RunFollow implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly events = inject(JobEventsService);
  private readonly dialog = inject(Dialog);
  private readonly destroy = inject(DestroyRef);
  private readonly auth = inject(AuthService, { optional: true });

  readonly jobId = input.required<number>();
  readonly jobQueueId = input<number | null | undefined>(null);
  readonly jobName = input<string | null | undefined>(null);
  /** The status the link was stored with: shown until the first read answers. */
  readonly initialStatus = input<string | null | undefined>(null);

  readonly timeline = signal<(Timeline & { reviewStatus?: string | null; waitingForApproval?: boolean }) | null>(null);
  readonly error = signal('');
  readonly following = signal(false);

  readonly state = computed(() => runState(this.timeline(), this.initialStatus()));
  /** A board fed by this run's schedule (analytics' dashboards name the pipelines that feed them), once it finished. */
  readonly board = signal<{ id: number; name: string } | null>(null);
  /** Where "See results" goes once the run completed: the board its output feeds, else the run's Outputs. */
  readonly results = computed(() => {
    if (this.state().label !== 'Completed' || this.jobQueueId() == null) return null;
    const board = this.board();
    return board
      ? { label: 'See results', link: ['/data/analytics/dashboards'], query: { board: board.id } as Record<string, unknown> }
      : { label: 'See results', link: ['/pipelines/schedules', this.jobId(), 'runs', this.jobQueueId()], query: { tab: 'outputs' } as Record<string, unknown> };
  });
  private boardAsked = false;

  readonly progress = computed(() => {
    const steps = this.timeline()?.steps ?? [];
    if (!steps.length) return null;
    const done = steps.filter(s => runFinished(s.status)).length;
    const running = steps.find(s => s.status === 'Running' || s.status === 'Start');
    const failed = steps.some(s => s.status === 'Failed');
    const started = steps.map(s => s.startedAt).filter(Boolean).sort()[0];
    const ended = steps.map(s => s.endedAt).filter(Boolean).sort().reverse()[0];
    const ms = started && ended && this.state().final ? Date.parse(ended) - Date.parse(started) : null;
    return { done, total: steps.length, percent: Math.round((done / steps.length) * 100), failed, current: running?.key ?? null,
      duration: ms != null && ms >= 0 ? formatDuration(ms / 1000) : null };
  });

  readonly failure = computed(() => {
    const failed = this.timeline()?.steps?.find(s => s.status === 'Failed');
    if (!failed) return null;
    const why = failed.statusMessage || (typeof failed.error === 'string' ? failed.error : '');
    return `Step ${failed.key} failed${why ? ': ' + why : '.'}`;
  });

  private timer: ReturnType<typeof setTimeout> | null = null;
  private tries = 0;
  private reading: Subscription | null = null;
  private pushes: Subscription | null = null;

  ngOnInit(): void {
    this.destroy.onDestroy(() => this.stop());
    if (this.jobQueueId() == null) return;
    if (runFinished(this.initialStatus()) && this.initialStatus() !== 'Completed') {
      // Stored final (Failed...): read once for the steps, no following.
      this.read();
      return;
    }
    this.start();
  }

  /** Follows the run: every push for its job re-reads it (at most once a second); between pushes the timer does. */
  private start(): void {
    this.following.set(true);
    this.tries = 0;
    this.pushes?.unsubscribe();
    this.pushes = this.events.events.pipe(
      filter(e => e.type === 'job.status' && Number(e.jobId) === Number(this.jobId())),
      auditTime(1000),
      takeUntilDestroyed(this.destroy),
    ).subscribe(() => this.read());
    this.read();
  }

  private read(): void {
    const id = this.jobQueueId();
    if (id == null) return;
    this.reading?.unsubscribe();
    this.reading = this.http.get<ApiResponse<Timeline & { reviewStatus?: string | null; waitingForApproval?: boolean }>>(`${API_BASE}/sourceJob.json/stepExecutions`,
      { params: { jobQueueId: id } }).subscribe({
      next: r => {
        if (r.status === API_SUCCESS && r.data) {
          const before = this.timeline()?.runStatus;
          this.timeline.set(r.data);
          if (this.state().label === 'Completed') this.findBoard();
          this.error.set('');
          if (before !== r.data.runStatus) this.tries = 0;
        } else {
          this.error.set(r.message || 'The run could not be read.');
        }
        this.next();
      },
      error: () => {
        this.error.set('The run could not be read just now; trying again.');
        this.next();
      },
    });
  }

  /** Once, for a completed run: the first dashboard its schedule's output feeds (a reader without dashboards gets none). */
  private findBoard(): void {
    if (this.boardAsked || (typeof this.auth?.canOpen === 'function' && !this.auth.canOpen('analytics-dashboards'))) return;
    // ZT-A12: a platform administrator's own sign-in (no workspace) reads no workspace's boards; Analytics answers it 403.
    if (typeof this.auth?.isPlatformAdmin === 'function' && this.auth.isPlatformAdmin() && !this.auth.user()?.tenantId) return;
    this.boardAsked = true;
    this.http.get<ApiResponse<{ analyticsDashboardId?: number; dashboardName: string; pipelines?: { jobId: number }[] }[]>>(
      `${API_BASE}/analyticsWorkspace.json/fetchAllDashboards`).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: r => {
        const fed = (r.status === API_SUCCESS ? r.data ?? [] : [])
          .find(d => d.analyticsDashboardId != null && (d.pipelines ?? []).some(p => Number(p.jobId) === Number(this.jobId())));
        if (fed) this.board.set({ id: fed.analyticsDashboardId!, name: fed.dashboardName });
      },
      error: () => {},
    });
  }

  /** The next read, or none once the run is final. */
  private next(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.following()) return;
    if (this.state().final && this.timeline() != null) {
      this.stop();
      return;
    }
    const wait = FOLLOW_BACKOFF_MS[Math.min(this.tries, FOLLOW_BACKOFF_MS.length - 1)];
    this.tries++;
    this.timer = setTimeout(() => this.read(), wait);
  }

  private stop(): void {
    this.following.set(false);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pushes?.unsubscribe();
    this.pushes = null;
  }

  /** A failed run's Retry: the Executions page's dialog (from a step, or from the start); once queued, followed again. */
  retry(): void {
    const id = this.jobQueueId();
    if (id == null) return;
    const data: RetryDialogData = { jobQueueId: id };
    this.dialog.open<boolean>(RetryDialog, { data }).closed.subscribe(queued => {
      if (queued) this.start();
    });
  }
}
