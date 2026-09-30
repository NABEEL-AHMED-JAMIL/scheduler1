import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';

/** One party's recorded decision (sourceJob.json/review). */
export interface ReviewDecision {
  runReviewDecisionId: number;
  party: 'internal' | 'customer';
  decision: 'APPROVED' | 'REJECTED';
  comment?: string | null;
  reason?: string | null;
  reviewer?: string | null;
  decidedAt?: string | null;
}

/** A run's review as Core answers it (MIG-237). */
export interface RunReviewView {
  jobQueueId: number;
  jobId: number;
  reviewStatus: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  required: ('internal' | 'customer')[];
  decisions: ReviewDecision[];
  rerunJobQueueId?: number | null;
  you?: { party?: string | null; canDecide?: boolean; refusal?: string | null };
}

const PARTY: Record<string, string> = { internal: 'Our team', customer: 'The customer' };
const STATUS: Record<string, { label: string; tone: string; icon: string }> = {
  PENDING: { label: 'Waiting for review', tone: 'pill-warn', icon: 'clock' },
  APPROVED: { label: 'Approved', tone: 'pill-ok', icon: 'checkCircle' },
  REJECTED: { label: 'Rejected', tone: 'pill-crit', icon: 'xCircle' },
};

/**
 * MIG-237, the console half: the result review of a run whose pipeline requires one (settings.review.required). It says
 * who must review and what each party decided; a reviewer who may decide approves, or rejects with a reason and may run
 * the job again. A run that needs no review draws nothing. Results start PENDING and are never approved by themselves.
 */
@Component({
  selector: 'app-run-review',
  imports: [Icon, ServerTimePipe],
  // No box of its own: its card is one of the run's stacked cards, and nothing at all when no review is required.
  host: { class: 'contents' },
  template: `
    @if (review(); as r) {
      @if (r.reviewStatus !== 'NOT_REQUIRED') {
        <section class="card p-4 space-y-3" data-review aria-labelledby="run-review-heading">
          <div class="flex flex-wrap items-center gap-2">
            <h2 id="run-review-heading" class="text-sm font-semibold">Result review</h2>
            <span class="pill {{ status().tone }}"><app-icon [name]="status().icon" size="0.85em" />{{ status().label }}</span>
            <span class="text-xs text-[color:var(--text-muted)]">Needs: {{ parties() }}</span>
          </div>
          @if (r.decisions.length) {
            <ul class="space-y-1.5 text-sm">
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
            <p class="text-sm">Run again as <a class="link" [href]="'/pipelines/schedules/' + r.jobId + '/runs/' + r.rerunJobQueueId + '/logs'">run #{{ r.rerunJobQueueId }}</a>.</p>
          }
          @if (r.reviewStatus === 'PENDING') {
            @if (r.you?.canDecide) {
              @if (!rejecting()) {
                <div class="flex flex-wrap items-end gap-2">
                  <label class="flex-1 min-w-48">
                    <span class="label">Comment (optional)</span>
                    <input id="reviewComment" class="input" [value]="comment()" (input)="comment.set($any($event.target).value)"
                           placeholder="What you checked" maxlength="2000" />
                  </label>
                  <button type="button" class="btn btn-primary btn-sm" [disabled]="busy()" (click)="decide('APPROVED')">Approve</button>
                  <button type="button" class="btn btn-default btn-sm" [disabled]="busy()" (click)="rejecting.set(true)">Reject</button>
                </div>
              } @else {
                <div class="space-y-2">
                  <label class="block">
                    <span class="label">Why are these results rejected? <span class="text-[color:var(--crit-text)]">*</span></span>
                    <textarea id="reviewReason" class="input" rows="2" maxlength="2000" [value]="reason()"
                              (input)="reason.set($any($event.target).value)"></textarea>
                  </label>
                  <label class="flex items-center gap-2 text-sm">
                    <input id="reviewRerun" type="checkbox" class="checkbox" [checked]="rerun()" (change)="rerun.set($any($event.target).checked)" />
                    Run the job again
                  </label>
                  <div class="flex gap-2">
                    <button type="button" class="btn btn-danger btn-sm" [disabled]="busy() || !reason().trim()" (click)="decide('REJECTED')">Reject results</button>
                    <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="rejecting.set(false)">Cancel</button>
                  </div>
                </div>
              }
            } @else if (r.you?.refusal) {
              <p class="text-sm text-[color:var(--text-muted)]">{{ r.you?.refusal }}</p>
            }
          }
        </section>
      }
    }
  `,
})
export class RunReview implements OnInit {
  readonly jobQueueId = input.required<string>();

  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly review = signal<RunReviewView | null>(null);
  readonly busy = signal(false);
  readonly rejecting = signal(false);
  readonly comment = signal('');
  readonly reason = signal('');
  readonly rerun = signal(false);

  readonly status = computed(() => STATUS[this.review()?.reviewStatus ?? 'PENDING'] ?? STATUS['PENDING']);
  readonly parties = computed(() => (this.review()?.required ?? []).map(p => PARTY[p] ?? p).join(' and '));

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
        next: r => this.review.set(r.status === API_SUCCESS ? r.data ?? null : null),
        // A run whose review cannot be read shows no panel: the run page is about the run.
        error: () => this.review.set(null),
      });
  }

  decide(decision: 'APPROVED' | 'REJECTED'): void {
    const review = this.review();
    if (!review || this.busy()) return;
    const body: Record<string, unknown> = { jobQueueId: review.jobQueueId, decision, comment: this.comment().trim() };
    if (decision === 'REJECTED') {
      body['reason'] = this.reason().trim();
      body['rerun'] = this.rerun();
    }
    body['party'] = review.you?.party ?? 'internal';
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${API_BASE}/sourceJob.json/review/decide`, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: r => {
          this.busy.set(false);
          if (r.status === API_SUCCESS) {
            this.toast.success(r.message || 'The review is recorded.');
            this.rejecting.set(false);
            this.load();
          } else {
            this.toast.error(r.message || 'The review could not be recorded.');
          }
        },
        error: err => {
          this.busy.set(false);
          this.toast.error(err?.error?.message || 'The review could not be recorded.');
        },
      });
  }
}
