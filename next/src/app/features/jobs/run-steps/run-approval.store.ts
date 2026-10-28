import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { API_SUCCESS } from '../../../core/api/api.config';
import { TeamsApi } from '../../../core/teams/teams.api';
import { AuthService } from '../../../core/auth/auth.service';
import { InboxTask, WorkflowsApi } from '../../workflows/workflows.api';
import { LogNames } from '../logs/log-segments';
import { RunTimelineStore } from './run-timeline.store';
import { approvalTeams, waitingApproval } from './run-approval.model';
import { loadErrorText } from '../../../shared/ui/loading';

/** workflow-service's subject for an Approval step's request (RunReviewTasks.APPROVAL_PREFIX there). */
export const APPROVAL_SUBJECT = 'pipeline-approval:';

/**
 * The run's Approval steps as the reader may act on them (run page polish 2026-10-12): the request it waits at, the reader's
 * own Task inbox task about it (taskInbox.json/forSubject), and the names of the teams its steps go to -- so the Next steps
 * box, the steps table and the log say "the Wound care team", never "team 6". Provided by the run page, beside the
 * timeline it reads. Every member reads the workspace's teams (F4: appUser.json/teams/list).
 */
@Injectable()
export class RunApprovalStore {
  private readonly teamsApi = inject(TeamsApi);
  private readonly inbox = inject(WorkflowsApi);
  private readonly auth = inject(AuthService);
  private readonly timelines = inject(RunTimelineStore);
  private readonly destroyRef = inject(DestroyRef);

  /** The step the run waits at and its request; null when it waits at none. */
  readonly waiting = computed(() => waitingApproval(this.timelines.timeline()));
  /** The reader's open task about the request, when they may decide it; null otherwise. */
  readonly task = signal<InboxTask | null>(null);
  /**
   * Owner 2026-10-27: the reader's task is being looked up. Until it lands the box said "Open Review › Approvals" (or
   * nothing) and then grew the decide buttons; it now says it is checking.
   */
  readonly taskLoading = signal(false);
  /** Why the reader's task could not be looked up (a reader who may decide would otherwise only see the inbox link). */
  readonly taskError = signal('');
  readonly canOpenInbox = computed(() => this.auth.canOpen('task-inbox'));

  /** Each team id the run's approvals name, with its name. */
  readonly teamNames = signal<ReadonlyMap<string, string>>(new Map());

  /** What the log puts to the ids its lines name: teams by name, the waiting request as a link to the reader's task. */
  readonly logNames = computed<LogNames>(() => {
    const requests = new Map<string, { taskId: number }>();
    const waiting = this.waiting();
    const task = this.task();
    if (waiting && task) requests.set(String(waiting.approval.approvalId), { taskId: task.id });
    return { teams: this.teamNames(), requests };
  });

  private taskFor: number | null = null;
  private teamsRead = false;

  constructor() {
    effect(() => {
      const waiting = this.waiting();
      const teams = approvalTeams(this.timelines.timeline());
      untracked(() => {
        this.findTask(waiting?.approval.approvalId ?? null);
        if (teams.length) this.readTeams();
      });
    });
  }

  /** Read the task again (after a decision: it is gone, and the run moves on). */
  forget(): void {
    this.taskFor = null;
    this.task.set(null);
    this.taskError.set('');
  }

  /** Try again on the task lookup that failed. */
  retryTask(): void {
    const approvalId = this.waiting()?.approval.approvalId ?? null;
    this.taskFor = null;
    this.findTask(approvalId);
  }

  private findTask(approvalId: number | null): void {
    if (approvalId === this.taskFor) return;
    this.taskFor = approvalId;
    this.task.set(null);
    this.taskError.set('');
    this.taskLoading.set(false);
    if (approvalId === null || !this.canOpenInbox()) return;
    this.taskLoading.set(true);
    const fallback = 'Whether you decide this could not be checked.';
    this.inbox.forSubject(APPROVAL_SUBJECT + approvalId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => {
        if (this.taskFor !== approvalId) return;
        this.taskLoading.set(false);
        if (r.status !== API_SUCCESS) { this.taskError.set(loadErrorText(r, fallback)); return; }
        this.task.set((r.data ?? []).find(t => t.stepType === 'approval' && t.state === 'Open') ?? null);
      },
      error: err => {
        if (this.taskFor !== approvalId) return;
        this.taskLoading.set(false);
        this.task.set(null);
        this.taskError.set(loadErrorText(err, fallback));
      },
    });
  }

  private readTeams(): void {
    if (this.teamsRead) return;
    this.teamsRead = true;
    this.teamsApi.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) return;
        this.teamNames.set(new Map((r.data ?? []).map(t => [String(t.teamId), t.name])));
      },
      // Cosmetic: without the names, the teams are said by their number.
      error: () => {},
    });
  }
}
