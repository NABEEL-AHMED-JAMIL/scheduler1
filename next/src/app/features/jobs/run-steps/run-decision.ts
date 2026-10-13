import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Avatar } from '../../../shared/ui/avatar';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { InboxTask, WorkflowsApi } from '../../workflows/workflows.api';
import { RunReviewView } from './run-review';

const PARTY: Record<string, string> = { internal: 'Our team', customer: 'The customer' };
const STATUS: Record<string, { label: string; tone: string; icon: string }> = {
  PENDING: { label: 'Waiting for review', tone: 'pill-warn', icon: 'clock' },
  APPROVED: { label: 'Approved', tone: 'pill-ok', icon: 'checkCircle' },
  REJECTED: { label: 'Rejected', tone: 'pill-crit', icon: 'xCircle' },
};

/** How the reader decides this run's review, if they do: here as an administrator, or through their Task inbox task. */
export type DecisionRoute =
  | { by: 'admin' }
  | { by: 'task'; task: InboxTask }
  | { by: 'none'; why: string | null };

/**
 * UX review 2026-10-12 (R1, R2): the run page's Next steps -- the run's review, at the top of the page, with Reject then
 * Approve (the primary rightmost) beside a comment. Before, the review sat under thirty raw AI answers, below the fold
 * at 1920, with Approve left of Reject, and a reviewer could not open the page at all.
 *
 * Who decides here: a workspace administrator records the internal review (Core's review/decide, as before); a reviewer
 * the pipeline names decides their Task inbox task about this run (taskInbox.json/forSubject, then act) -- the same
 * decision the inbox records, which Core then takes as the internal review. Anyone else reads the review and is told who
 * decides it. A run that needs no review draws nothing.
 */
@Component({
  selector: 'app-run-decision',
  imports: [Icon, ServerTimePipe, RouterLink, Avatar],
  host: { class: 'contents' },
  template: `
    @if (review(); as r) {
      @if (r.reviewStatus !== 'NOT_REQUIRED') {
        <section class="card p-4 flex flex-col gap-3 h-full run-next" data-test="next-steps" aria-labelledby="next-steps-heading">
          <div class="flex flex-wrap items-center gap-2">
            <h2 id="next-steps-heading" class="text-sm font-semibold mr-auto">{{ r.reviewStatus === 'PENDING' ? 'Next steps' : 'Review' }}</h2>
            <span class="pill {{ status().tone }}" data-test="review-status"><app-icon [name]="status().icon" size="0.85em" />{{ status().label }}</span>
          </div>
          @if (r.reviewStatus === 'PENDING') {
            <p class="flex items-center gap-1.5 text-sm text-[color:var(--text-secondary)]" data-test="waiting-on">
              <app-icon name="users" size="0.95em" class="icon-muted shrink-0" />
              <span>Waiting on <span class="font-medium text-[color:var(--text-primary)]">{{ waitingOn() }}</span></span>
            </p>
          }
          @if (r.decisions?.length) {
            <ul class="flex flex-col gap-2 text-sm" data-test="decisions-made">
              @for (d of r.decisions; track d.runReviewDecisionId) {
                <li class="flex items-start gap-2">
                  <app-avatar [appUserId]="d.reviewerUserId" [name]="d.reviewer" [size]="1.75" [decorative]="true" />
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-baseline gap-x-1.5">
                      <span [class]="d.decision === 'APPROVED' ? 'text-[color:var(--ok-text)] font-medium' : 'text-[color:var(--crit-text)] font-medium'">
                        {{ d.decision === 'APPROVED' ? 'Approved' : 'Rejected' }}</span>
                      <span>by {{ d.reviewer || 'a reviewer' }}</span>
                      @if (r.required.length > 1) { <span class="text-[color:var(--text-muted)]">({{ partyOf(d.party).toLowerCase() }})</span> }
                    </div>
                    @if (d.decidedAt) { <div class="text-xs text-[color:var(--text-muted)] tabular" data-test="decided-at">{{ d.decidedAt | serverTime:'dateTime' }}</div> }
                    @if (d.reason) { <div class="text-[color:var(--text-secondary)]">Reason: {{ d.reason }}</div> }
                    @if (d.comment && d.comment !== d.reason) { <div class="text-[color:var(--text-secondary)] break-words">“{{ d.comment }}”</div> }
                  </div>
                </li>
              }
            </ul>
          }
          @if (r.rerunJobQueueId) {
            <p class="text-sm">Run again as <a class="link" [routerLink]="['/pipelines/schedules', r.jobId, 'runs', r.rerunJobQueueId]">run #{{ r.rerunJobQueueId }}</a>.</p>
          }
          @if (r.reviewStatus === 'PENDING') {
            @switch (route().by) {
              @case ('none') {
                <p class="text-sm text-[color:var(--text-secondary)]" data-test="who-decides">{{ noneWhy() }}</p>
                @if (canOpenInbox()) { <a class="link-inline text-sm self-start" routerLink="/workflows/inbox">Open the Task inbox</a> }
              }
              @default {
                <label class="flex flex-col gap-1 mt-auto">
                  <span class="label">{{ rejecting() ? 'Why are these results rejected?' : 'Comment' }}
                    @if (rejecting()) { <span class="text-[color:var(--crit-text)]">*</span> } @else { <span class="font-normal normal-case text-[color:var(--text-muted)]">(optional)</span> }</span>
                  <textarea id="runDecisionComment" class="input" rows="2" maxlength="2000" [value]="comment()" data-test="decision-comment"
                            [attr.aria-invalid]="needsReason() ? 'true' : null" placeholder="What you checked"
                            (input)="comment.set($any($event.target).value)"></textarea>
                  @if (needsReason()) { <span class="field-note text-[color:var(--crit-text)]" role="alert">Say why, then press Reject again.</span> }
                </label>
                @if (route().by === 'admin' && rejecting()) {
                  <label class="flex items-center gap-2 text-sm">
                    <input id="runDecisionRerun" type="checkbox" class="checkbox" [checked]="rerun()" (change)="rerun.set($any($event.target).checked)" />
                    Run the schedule again
                  </label>
                }
                <!-- Reject, then Approve: the primary is rightmost (review G3). -->
                @if (route().by === 'task') {
                  <p class="text-xs text-[color:var(--text-muted)]">Recorded as your Task inbox decision.</p>
                }
                <div class="flex flex-wrap items-center justify-end gap-2" data-test="decision-buttons">
                  <button type="button" class="btn btn-default btn-sm" data-test="reject" [disabled]="busy()" (click)="reject()">
                    <app-icon name="xCircle" />Reject</button>
                  <button type="button" class="btn btn-primary btn-sm" data-test="approve" [disabled]="busy()" (click)="approve()">
                    <app-icon name="checkCircle" />Approve</button>
                </div>
              }
            }
          }
        </section>
      }
    }
  `,
})
export class RunDecision {
  readonly jobQueueId = input.required<string>();
  /** The review changed (decided here): the page re-reads the run. */
  readonly decided = output<void>();
  /** The review as read, for the page's header pill ("Completed · waiting for review"); null for none. */
  readonly reviewChange = output<RunReviewView | null>();

  private readonly http = inject(HttpClient);
  private readonly inbox = inject(WorkflowsApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly review = signal<RunReviewView | null>(null);
  readonly task = signal<InboxTask | null>(null);
  readonly busy = signal(false);
  readonly rejecting = signal(false);
  readonly comment = signal('');
  readonly rerun = signal(false);
  /** Reject was pressed with no reason yet. */
  readonly needsReason = signal(false);

  readonly status = computed(() => STATUS[this.review()?.reviewStatus ?? 'PENDING'] ?? STATUS['PENDING']);
  readonly parties = computed(() => (this.review()?.required ?? []).map(p => PARTY[p] ?? p).join(' and ').toLowerCase());
  readonly canOpenInbox = computed(() => this.auth.canOpen('task-inbox'));

  readonly route = computed<DecisionRoute>(() => {
    const r = this.review();
    if (r?.you?.canDecide) return { by: 'admin' };
    const task = this.task();
    if (task) return { by: 'task', task };
    return { by: 'none', why: r?.you?.refusal ?? null };
  });

  readonly noneWhy = computed(() => {
    const route = this.route();
    const why = route.by === 'none' ? route.why : null;
    // Core's sentence is for a person who may decide somewhere; one with no task about this run is told plainly.
    return why && /Task inbox/.test(why) && !this.canOpenInbox()
      ? 'The pipeline\'s reviewers decide this in their Task inbox.' : why || 'The pipeline\'s reviewers decide this in their Task inbox.';
  });

  constructor() {
    // Read again for another run (a link from this page to its re-run lands on this same page).
    effect(() => { this.jobQueueId(); untracked(() => this.load()); });
  }

  partyOf(party: string): string {
    return PARTY[party] ?? party;
  }

  load(): void {
    this.http.get<ApiResponse<RunReviewView>>(`${API_BASE}/sourceJob.json/review`, { params: { jobQueueId: this.jobQueueId() } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: r => {
          const review = r.status === API_SUCCESS ? r.data ?? null : null;
          this.review.set(review);
          this.reviewChange.emit(review);
          if (review?.reviewStatus === 'PENDING' && review.reviewers?.kind === 'group') this.nameGroup(review.reviewers.value ?? null);
          if (review?.reviewStatus === 'PENDING' && !review.you?.canDecide) this.findTask();
          else this.task.set(null);
        },
        // A run whose review cannot be read shows no box: the run page is about the run.
        error: () => { this.review.set(null); this.reviewChange.emit(null); },
      });
  }

  /** A reviewer group's name (an access profile), which a workspace administrator may read; others see "the reviewer group". */
  readonly groupName = signal<string | null>(null);
  private nameGroup(id: string | null): void {
    if (!id || !this.auth.isTenantAdmin?.()) return;
    this.http.get<ApiResponse<{ pageAccessProfileId: number; profileName: string }[]>>(`${API_BASE}/pageAccess.json/listProfiles`)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: r => this.groupName.set((r.data ?? []).find(p => String(p.pageAccessProfileId) === id)?.profileName ?? null),
        error: () => {},
      });
  }

  /** Who the review waits on: the reader when they may decide it, else the pipeline's reviewers in words. */
  readonly waitingOn = computed(() => {
    const r = this.review();
    const route = this.route();
    const who = r?.reviewers;
    // A reviewer reads their own group's name from their session; an administrator from the access profiles.
    const group = this.groupName() ?? (this.route().by === 'task' ? this.auth.user?.()?.pageAccessProfileName ?? null : null);
    const named = !who?.kind || (who.kind === 'role' && who.value !== 'TENANT_USER') ? 'the workspace administrators'
      : who.kind === 'role' ? 'the workspace users'
      : group ? `the ${group} group` : 'the pipeline\'s reviewer group';
    const decided = new Set((r?.decisions ?? []).map(d => d.party));
    const open = (r?.required ?? []).filter(p => !decided.has(p));
    if (open.length && !open.includes('internal')) return 'the customer';
    const internal = route.by === 'task' ? `you (${named})`
      : route.by === 'admin' ? `${named} (you can decide here)` : named;
    return open.includes('customer') ? `${internal} and the customer` : internal;
  });

  /** The reader's open Task inbox task about this run, if they have one (a reviewer the pipeline names). */
  private findTask(): void {
    if (!this.canOpenInbox()) { this.task.set(null); return; }
    this.inbox.forSubject(`pipeline-run:${this.jobQueueId()}`).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => this.task.set(r.status === API_SUCCESS ? (r.data ?? []).find(t => t.stepType === 'approval') ?? null : null),
      error: () => this.task.set(null),
    });
  }

  approve(): void {
    this.rejecting.set(false);
    this.needsReason.set(false);
    this.send('APPROVED');
  }

  reject(): void {
    // A rejection always says why (Core requires a reason; the run-review workflow asks for a comment).
    if (!this.comment().trim()) {
      this.rejecting.set(true);
      this.needsReason.set(true);
      return;
    }
    this.needsReason.set(false);
    this.send('REJECTED');
  }

  private send(decision: 'APPROVED' | 'REJECTED'): void {
    const review = this.review();
    const route = this.route();
    if (!review || this.busy() || route.by === 'none') return;
    this.busy.set(true);
    const said = this.comment().trim();
    const done = (ok: boolean, message: string) => {
      this.busy.set(false);
      if (!ok) { this.toast.error(message); return; }
      this.toast.success(message);
      this.comment.set('');
      this.rejecting.set(false);
      this.decided.emit();
      this.load();
      // A Task inbox decision reaches the run's review through Core's listener, a moment later.
      if (route.by === 'task') setTimeout(() => this.load(), 2500);
    };
    if (route.by === 'admin') {
      const body: Record<string, unknown> = { jobQueueId: review.jobQueueId, decision, comment: said, party: review.you?.party ?? 'internal' };
      if (decision === 'REJECTED') { body['reason'] = said; body['rerun'] = this.rerun(); }
      this.http.post<ApiResponse<unknown>>(`${API_BASE}/sourceJob.json/review/decide`, body).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: r => done(r.status === API_SUCCESS, r.message || (r.status === API_SUCCESS ? 'The review is recorded.' : 'The review could not be recorded.')),
        error: err => done(false, err?.error?.message || 'The review could not be recorded.'),
      });
      return;
    }
    const task = route.task;
    const action = decision === 'APPROVED' ? 'approve' : 'reject';
    this.inbox.act(task.id, action, said || null, `${task.id}:${action}:run-page`).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => done(r.status === API_SUCCESS, r.status === API_SUCCESS
        ? (decision === 'APPROVED' ? 'Approved. The run\'s results follow in a moment.' : 'Rejected. The run\'s results follow in a moment.')
        : r.message || 'The decision could not be recorded.'),
      error: err => done(false, err?.error?.message || 'The decision could not be recorded.'),
    });
  }
}
