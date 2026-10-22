import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ToastService } from '../../../shared/ui/toast.service';
import { WorkflowsApi } from '../../workflows/workflows.api';
import { exactTime } from '../../workflows/history';
import { RunApprovalStore } from './run-approval.store';
import { approvalRoute, fromNow, reviewersWords } from './run-approval.model';

/**
 * A run waiting at an Approval step, as the run page's Next steps (run page polish 2026-10-12). It used to be the run's
 * status message in red under the summary, with a warning icon, as though the run had failed; and its log named the group
 * by id. Now it is an amber box beside the summary, as the run review's is: the step and what it asks, who it waits on by
 * the group's name, since when and until when.
 *
 * A reader in the group (their Task inbox task about the request, taskInbox.json/forSubject) decides here -- Reject, which
 * says why, then Approve, the primary rightmost -- and the decision is their inbox task's. Anyone else who has the Review
 * inbox is pointed to it; a reader without it (a viewer) reads who decides, and gets no buttons.
 */
@Component({
  selector: 'app-run-approval',
  imports: [Icon, RouterLink, ServerTimePipe],
  host: { class: 'contents' },
  styles: `
    .run-approval { box-shadow: inset 3px 0 0 var(--warn-text); }
    .approval-facts { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 0.75rem; row-gap: 0.25rem; }
    .approval-facts dt { color: var(--text-muted); font-size: 0.75rem; line-height: 1.25rem; }
    .approval-facts dd { min-width: 0; font-variant-numeric: tabular-nums; }
  `,
  template: `
    @if (approvals.waiting(); as w) {
      <section class="card p-4 flex flex-col gap-3 h-full run-approval" data-test="approval-next" aria-labelledby="approval-next-heading">
        <div class="flex flex-wrap items-center gap-2">
          <h2 id="approval-next-heading" class="text-sm font-semibold mr-auto">Next steps</h2>
          <span class="pill pill-warn" data-test="approval-status"><app-icon name="clock" size="0.85em" />Waiting for approval</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <p class="text-sm font-medium" data-test="approval-where">Waiting for approval at step {{ w.step.index + 1 }} · {{ w.step.name || w.step.key }}</p>
          @if (w.approval.title) { <p class="text-sm text-[color:var(--text-secondary)] break-words" data-test="approval-title">{{ w.approval.title }}</p> }
        </div>
        <dl class="approval-facts text-sm">
          <dt>Waiting on</dt>
          <dd class="font-medium" data-test="approval-who">{{ who() }}</dd>
          @if (w.approval.requestedAt) {
            <dt>Since</dt>
            <dd data-test="approval-since" [title]="exact(w.approval.requestedAt)">{{ w.approval.requestedAt | serverTime:'recent' }} · {{ ago(w.approval.requestedAt) }}</dd>
          }
          @if (w.approval.expiresAt) {
            <dt>Expires</dt>
            <dd data-test="approval-expires" [title]="exact(w.approval.expiresAt)">{{ w.approval.expiresAt | serverTime:'recent' }} · {{ ago(w.approval.expiresAt) }}</dd>
          }
        </dl>
        @switch (route()) {
          @case ('decide') {
            <label class="flex flex-col gap-1 mt-auto">
              <span class="label">{{ rejecting() ? 'Why is this rejected?' : 'Comment' }}
                @if (rejecting()) { <span class="text-[color:var(--crit-text)]">*</span> } @else { <span class="font-normal normal-case text-[color:var(--text-muted)]">(optional)</span> }</span>
              <textarea id="runApprovalComment" class="input" rows="2" maxlength="2000" [value]="comment()" data-test="approval-comment"
                        [attr.aria-invalid]="needsReason() ? 'true' : null" placeholder="What you checked"
                        (input)="comment.set($any($event.target).value)"></textarea>
              @if (needsReason()) { <span class="field-note text-[color:var(--crit-text)]" role="alert">Say why, then press Reject again.</span> }
            </label>
            <p class="text-xs text-[color:var(--text-muted)]">Recorded as your decision in Review › Approvals. Rejected, the run fails.</p>
            <!-- Reject, then Approve: the primary is rightmost, as the run review's decision is. -->
            <div class="flex flex-wrap items-center justify-end gap-2" data-test="approval-buttons">
              <button type="button" class="btn btn-default btn-sm" data-test="approval-reject" [disabled]="busy()" (click)="reject()">
                <app-icon name="xCircle" />Reject</button>
              <button type="button" class="btn btn-primary btn-sm" data-test="approval-approve" [disabled]="busy()" (click)="approve()">
                <app-icon name="checkCircle" />Approve</button>
            </div>
          }
          @case ('inbox') {
            <a class="link-inline inline-flex items-center gap-1 text-sm self-start mt-auto" routerLink="/review/approvals" data-test="approval-inbox">
              <app-icon name="inbox" size="0.95em" />Open Review › Approvals</a>
          }
        }
      </section>
    }
  `,
})
export class RunApproval {
  /** Now, from the page's clock, so "7 h ago" moves on its own. */
  readonly now = input(Date.now());
  /** Decided here: the page reads the run again. */
  readonly decided = output<void>();

  readonly approvals = inject(RunApprovalStore);
  private readonly inbox = inject(WorkflowsApi);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly comment = signal('');
  readonly rejecting = signal(false);
  readonly needsReason = signal(false);
  readonly busy = signal(false);

  readonly route = computed(() => approvalRoute(!!this.approvals.task(), this.approvals.canOpenInbox()));
  /** Who decides, by name; the reader first when they may. */
  readonly who = computed(() => {
    const words = reviewersWords(this.approvals.waiting()?.approval.reviewers, this.approvals.teamNames());
    if (this.route() === 'decide') return `You (${words})`;
    return words.charAt(0).toUpperCase() + words.slice(1);
  });

  ago(at: string | null | undefined): string { return fromNow(at, this.now()); }
  exact(at: string | null | undefined): string { return exactTime(at); }

  approve(): void {
    this.rejecting.set(false);
    this.needsReason.set(false);
    this.send('approve');
  }

  reject(): void {
    // A rejection always says why: the run fails on it, and whoever reads the run next needs the reason.
    if (!this.comment().trim()) {
      this.rejecting.set(true);
      this.needsReason.set(true);
      return;
    }
    this.needsReason.set(false);
    this.send('reject');
  }

  private send(action: 'approve' | 'reject'): void {
    const task = this.approvals.task();
    if (!task || this.busy()) return;
    this.busy.set(true);
    const said = this.comment().trim() || null;
    this.inbox.act(task.id, action, said, `${task.id}:${action}:run-page`).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status !== API_SUCCESS) { this.toast.error(r.message || 'The decision could not be recorded.'); return; }
        this.toast.success(action === 'approve' ? 'Approved. The run continues in a moment.' : 'Rejected. The run fails in a moment.');
        this.comment.set('');
        this.rejecting.set(false);
        this.approvals.forget();
        this.decided.emit();
      },
      error: err => {
        this.busy.set(false);
        this.toast.error(err?.error?.message || 'The decision could not be recorded.');
      },
    });
  }
}
