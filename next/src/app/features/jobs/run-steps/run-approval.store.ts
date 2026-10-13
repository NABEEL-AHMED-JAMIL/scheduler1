import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { InboxTask, WorkflowsApi } from '../../workflows/workflows.api';
import { LogNames } from '../logs/log-segments';
import { RunTimelineStore } from './run-timeline.store';
import { approvalGroups, waitingApproval } from './run-approval.model';

/** workflow-service's subject for an Approval step's request (RunReviewTasks.APPROVAL_PREFIX there). */
export const APPROVAL_SUBJECT = 'pipeline-approval:';

/**
 * The run's Approval steps as the reader may act on them (run page polish 2026-10-12): the request it waits at, the reader's
 * own Task inbox task about it (taskInbox.json/forSubject), and the names of the groups its steps go to -- so the Next steps
 * box, the steps table and the log say "the Reviewer group", never "group 1063". Provided by the run page, beside the
 * timeline it reads.
 *
 * A group's name is an access profile's: a workspace administrator reads them all (pageAccess.json/listProfiles); a
 * reviewer whose task names the group is in it, so its name is their own profile's. Anyone else is told "the pipeline's
 * reviewer group".
 */
@Injectable()
export class RunApprovalStore {
  private readonly http = inject(HttpClient);
  private readonly inbox = inject(WorkflowsApi);
  private readonly auth = inject(AuthService);
  private readonly timelines = inject(RunTimelineStore);
  private readonly destroyRef = inject(DestroyRef);

  /** The step the run waits at and its request; null when it waits at none. */
  readonly waiting = computed(() => waitingApproval(this.timelines.timeline()));
  /** The reader's open task about the request, when they may decide it; null otherwise. */
  readonly task = signal<InboxTask | null>(null);
  readonly canOpenInbox = computed(() => this.auth.canOpen('task-inbox'));

  private readonly profiles = signal<ReadonlyMap<string, string>>(new Map());
  /** Each group id the run's approvals name, with the name the reader may read. */
  readonly groupNames = computed<ReadonlyMap<string, string>>(() => {
    const names = new Map(this.profiles());
    const task = this.task();
    const own = this.auth.user?.()?.pageAccessProfileName;
    if (task?.assigneeKind === 'group' && task.assigneeValue && own && !names.has(String(task.assigneeValue))) names.set(String(task.assigneeValue), own);
    return names;
  });

  /** What the log puts to the ids its lines name: groups by name, the waiting request as a link to the reader's task. */
  readonly logNames = computed<LogNames>(() => {
    const requests = new Map<string, { taskId: number }>();
    const waiting = this.waiting();
    const task = this.task();
    if (waiting && task) requests.set(String(waiting.approval.approvalId), { taskId: task.id });
    return { groups: this.groupNames(), requests };
  });

  private taskFor: number | null = null;
  private profilesRead = false;

  constructor() {
    effect(() => {
      const waiting = this.waiting();
      const groups = approvalGroups(this.timelines.timeline());
      untracked(() => {
        this.findTask(waiting?.approval.approvalId ?? null);
        if (groups.length) this.readProfiles();
      });
    });
  }

  /** Read the task again (after a decision: it is gone, and the run moves on). */
  forget(): void {
    this.taskFor = null;
    this.task.set(null);
  }

  private findTask(approvalId: number | null): void {
    if (approvalId === this.taskFor) return;
    this.taskFor = approvalId;
    this.task.set(null);
    if (approvalId === null || !this.canOpenInbox()) return;
    this.inbox.forSubject(APPROVAL_SUBJECT + approvalId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => {
        if (this.taskFor !== approvalId) return;
        this.task.set(r.status === API_SUCCESS ? (r.data ?? []).find(t => t.stepType === 'approval' && t.state === 'Open') ?? null : null);
      },
      error: () => this.task.set(null),
    });
  }

  private readProfiles(): void {
    if (this.profilesRead || !this.auth.isTenantAdmin?.()) return;
    this.profilesRead = true;
    this.http.get<ApiResponse<{ pageAccessProfileId: number; profileName: string }[]>>(`${API_BASE}/pageAccess.json/listProfiles`)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: r => {
          if (r.status !== API_SUCCESS) return;
          this.profiles.set(new Map((r.data ?? []).map(p => [String(p.pageAccessProfileId), p.profileName])));
        },
        error: () => {},
      });
  }
}
