import { Component, DestroyRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
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
  imports: [Icon, ServerTimePipe, RouterLink],
  host: { class: 'contents' },
  template: `
    @if (review(); as r) {
      @if (r.reviewStatus !== 'NOT_REQUIRED') {
        <section class="card p-4 flex flex-col gap-3 run-next" data-test="next-steps" aria-labelledby="next-steps-heading">
          <div class="flex flex-wrap items-center gap-2">
            <h2 id="next-steps-heading" class="text-sm font-semibold mr-auto">{{ r.reviewStatus === 'PENDING' ? 'Next steps' : 'Review' }}</h2>
            <span class="pill {{ status().tone }}" data-test="review-status"><app-icon [name]="status().icon" size="0.85em" />{{ status().label }}</span>
          </div>
          <p class="text-xs text-[color:var(--text-muted)]">Results need review by {{ parties() }}.</p>
          @if (r.decisions.length) {
            <ul class="flex flex-col gap-1.5 text-sm" data-test="decisions-made">
              @for (d of r.decisions; track d.runReviewDecisionId) {
                <li class="flex flex-wrap items-baseline gap-x-2">
                  <span class="font-medium">{{ partyOf(d.party) }}</span>
                  <span [class]="d.decision === 'APPROVED' ? 'text-[color:var(--ok-text)]' : 'text-[color:var(--crit-text)]'">
                    {{ d.decision === 'APPROVED' ? 'approved' : 'rejected' }}</span>
                  @if (d.reviewer) { <span class="text-[color:var(--text-muted)]">by {{ d.reviewer }}</span> }
                  @if (d.decidedAt) { <span class="text-xs text-[color:var(--text-muted)]">{{ d.decidedAt | serverTime:'recent' }}</span> }
                  @if (d.reason) { <span class="w-full text-[color:var(--text-secondary)]">Reason: {{ d.reason }}</span> }
                  @if (d.comment) { <span class="w-full text-[color:var(--text-secondary)]">{{ d.comment }}</span> }
                </li>
              }
            </ul>
          }
          @if (r.rerunJobQueueId) {
            <p class="text-sm">Run again as <a class="link" [routerLink]="['/pipelines/schedules', r.jobId, 'runs', r.rerunJobQueueId, 'logs']">run #{{ r.rerunJobQueueId }}</a>.</p>
          }
          @if (r.reviewStatus === 'PENDING') {
            @switch (route().by) {
              @case ('none') {
                <p class="text-sm text-[color:var(--text-secondary)]" data-test="who-decides">{{ noneWhy() }}</p>
                @if (canOpenInbox()) { <a class="link-inline text-sm self-start" routerLink="/workflows/inbox">Open the Task inbox</a> }
              }
              @default {
                <label class="flex flex-col gap-1">
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
                    Run the job again
                  </label>
                }
                <!-- Reject, then Approve: the primary is rightmost (review G3). -->
                <div class="flex flex-wrap items-center justify-end gap-2" data-test="decision-buttons">
                  @if (route().by === 'task') {
                    <span class="text-xs text-[color:var(--text-muted)] mr-auto">Recorded as your Task inbox decision.</span>
                  }
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
export class RunDecision implements OnInit {
  readonly jobQueueId = input.required<string>();
  /** The review changed (decided here): the page re-reads the run. */
  readonly decided = output<void>();

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

  ngOnInit(): void {
    this.load();
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
          if (review?.reviewStatus === 'PENDING' && !review.you?.canDecide) this.findTask();
          else this.task.set(null);
        },
        // A run whose review cannot be read shows no box: the run page is about the run.
        error: () => this.review.set(null),
      });
  }

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
