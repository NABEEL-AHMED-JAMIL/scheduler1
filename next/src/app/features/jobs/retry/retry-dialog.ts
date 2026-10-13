import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { RouterLink } from '@angular/router';
import { RetryFrom, RetryPlan, backfillLink, backfillRetryNote, planOf, resumeLabel, stepLabel } from './run-retry';

export interface RetryDialogData {
  jobQueueId: number;
  /** The choice the button that opened it named; the dialog falls back to the other when that one is refused. */
  from?: RetryFrom;
}

/**
 * MIG-345: retry a failed run -- "Retry from <step>" (the steps before it are reused, not run or billed again) or "Run
 * again from the start". Reads Core's plan first (sourceJob.json/retryPlan), so each choice says what it would do or why
 * it cannot; Core checks everything again when asked (the input files' sha256 only then), and a refusal is said here with
 * the dialog left open. Closes with true once the run is queued again.
 */
@Component({
  selector: 'app-retry-dialog',
  imports: [FormDialog, Icon, ServerTimePipe, RouterLink],
  template: `
    <app-form-dialog
        heading="Retry this run"
        [subtitle]="'Run #' + data.jobQueueId + (plan() ? ' failed on attempt ' + plan()!.attempt + '. The retry is attempt ' + plan()!.nextAttempt + ' of the same run.' : '')"
        [confirmLabel]="confirmLabel()" busyLabel="Queuing…"
        [cancelLabel]="canConfirm() ? 'Cancel' : 'Close'"
        [showConfirm]="!!plan() && !plan()!.backfillId"
        [confirmDisabled]="!canConfirm()"
        [saving]="running()"
        size="wide"
        (cancelled)="ref.close(false)" (confirmed)="retry()">
      @if (loading()) {
        <p class="flex items-center gap-2 text-sm text-[color:var(--text-muted)]" role="status">
          <app-icon name="refresh" class="spin" />Reading what a retry would do…
        </p>
      } @else if (problem() && !plan()) {
        <p class="flex items-start gap-2 text-sm text-crit-500" role="alert">
          <app-icon name="alert" class="mt-0.5 shrink-0" />{{ problem() }}
        </p>
      } @else if (plan()?.backfillId) {
        <!-- UX review 2026-10-13: a backfill's run is retried by its backfill, which Core says before either choice. -->
        <p class="flex items-start gap-2 text-sm" data-test="retry-backfill">
          <app-icon name="layers" class="mt-0.5 shrink-0 icon-muted" />
          <span>{{ backfillNote(plan()!.backfillId!) }}
            <a class="link-inline" [routerLink]="backfill(plan()!.backfillId!).link" [queryParams]="backfill(plan()!.backfillId!).query"
               (click)="ref.close(false)">Open backfill #{{ plan()!.backfillId }}</a></span>
        </p>
      } @else if (plan(); as p) {
        <div role="radiogroup" aria-label="Where the retry starts" class="space-y-3 text-sm">
          <label class="flex items-start gap-2.5 rounded border border-subtle p-3" data-test="retry-resume"
                 [class.opacity-60]="!p.resumable">
            <input type="radio" name="retry-from" class="mt-1" [checked]="from() === 'failed_step'" [disabled]="!p.resumable"
                   (change)="from.set('failed_step')" />
            <span class="min-w-0 flex-1">
              <span class="font-medium">{{ resumeLabel(p) }}</span>
              @if (p.resumable) {
                <span class="block mt-1 text-[color:var(--text-secondary)]">
                  @if (p.reused.length) {
                    {{ p.reused.length }} step{{ p.reused.length === 1 ? '' : 's' }} before it {{ p.reused.length === 1 ? 'is' : 'are' }}
                    not run again: {{ p.reused.length === 1 ? 'its' : 'their' }} kept output{{ p.reused.length === 1 ? ' is' : 's are' }}
                    reused, and not billed twice.
                  } @else {
                    The failed step is the first, so every step runs again.
                  }
                  The failed step and the steps after it run on the pipeline as it is now@if (p.definitionVersion && p.ranVersion && p.definitionVersion !== p.ranVersion) {<span> (version {{ p.definitionVersion }}; the run ran version {{ p.ranVersion }})</span>}.
                </span>
                @if (p.reused.length) {
                  <ul class="mt-2 space-y-1 text-xs" aria-label="Steps reused">
                    @for (r of p.reused; track r.index) {
                      <li class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <app-icon name="checkCircle" size="0.9em" class="text-ok-500 shrink-0" />
                        <span class="mono">{{ label(r.index, r.key, r.name) }}</span>
                        @if (r.rowsOut !== null && r.rowsOut !== undefined) {
                          <span class="text-[color:var(--text-muted)]">· {{ r.rowsOut.toLocaleString('en-GB') }} rows</span>
                        }
                        @if (r.expiresAt) {
                          <span class="text-[color:var(--text-muted)]">· kept until {{ r.expiresAt | serverTime:'recent' }}</span>
                        }
                      </li>
                    }
                  </ul>
                }
                @if (p.inputFiles > 0) {
                  <span class="block mt-2 text-xs text-[color:var(--text-muted)]">
                    The {{ p.inputFiles }} file{{ p.inputFiles === 1 ? '' : 's' }} those steps read
                    {{ p.inputFiles === 1 ? 'is' : 'are' }} checked first: a file that changed since refuses the resume.
                  </span>
                }
              } @else {
                <span class="block mt-1 text-xs text-[color:var(--text-secondary)]" data-test="retry-resume-refusal">{{ p.refusal }}</span>
              }
            </span>
          </label>

          <label class="flex items-start gap-2.5 rounded border border-subtle p-3" data-test="retry-restart"
                 [class.opacity-60]="!p.restartable">
            <input type="radio" name="retry-from" class="mt-1" [checked]="from() === 'start'" [disabled]="!p.restartable"
                   (change)="from.set('start')" />
            <span class="min-w-0 flex-1">
              <span class="font-medium">Run again from the start</span>
              @if (p.restartable) {
                <span class="block mt-1 text-[color:var(--text-secondary)]">
                  Every step runs again on the pipeline as it is now, and its work is billed again.
                </span>
              } @else {
                <span class="block mt-1 text-xs text-[color:var(--text-secondary)]">{{ p.restartRefusal }}</span>
              }
            </span>
          </label>
        </div>
        @if (problem()) {
          <p class="flex items-start gap-2 mt-3 text-sm text-crit-500" role="alert" data-test="retry-refused">
            <app-icon name="alert" class="mt-0.5 shrink-0" />{{ problem() }}
          </p>
        }
      }
    </app-form-dialog>
  `,
})
export class RetryDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<RetryDialogData>(DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly problem = signal('');
  readonly plan = signal<RetryPlan | null>(null);
  readonly from = signal<RetryFrom | null>(null);
  readonly running = signal(false);

  readonly resumeLabel = resumeLabel;
  readonly backfillNote = backfillRetryNote;
  readonly backfill = backfillLink;
  label(index: number, key: string, name?: string | null): string { return stepLabel(index, key, name); }

  readonly canConfirm = computed(() => {
    const plan = this.plan();
    const from = this.from();
    if (!plan || !from || plan.backfillId) return false;
    return from === 'start' ? plan.restartable : plan.resumable;
  });

  readonly confirmLabel = computed(() => (this.from() === 'start' ? 'Run again from the start' : resumeLabel(this.plan())));

  constructor() {
    this.http.get<ApiResponse<unknown>>(`${API_BASE}/sourceJob.json/retryPlan`, { params: { jobQueueId: String(this.data.jobQueueId) } })
      .subscribe({
        next: response => {
          this.loading.set(false);
          const plan = planOf(response.data);
          if (!plan) {
            this.problem.set(response.message || 'What a retry would do could not be read.');
            return;
          }
          this.plan.set(plan);
          this.from.set(this.firstChoice(plan));
        },
        error: err => {
          this.loading.set(false);
          this.problem.set(err?.error?.message || 'What a retry would do could not be read.');
        },
      });
  }

  /** The choice the opening button named when it can be done, else the one that can; none when neither can. */
  private firstChoice(plan: RetryPlan): RetryFrom | null {
    const wanted = this.data.from ?? 'failed_step';
    const can = (from: RetryFrom) => (from === 'start' ? plan.restartable : plan.resumable);
    if (can(wanted)) return wanted;
    const other: RetryFrom = wanted === 'start' ? 'failed_step' : 'start';
    return can(other) ? other : null;
  }

  retry(): void {
    const from = this.from();
    if (this.running() || !from || !this.canConfirm()) return;
    this.running.set(true);
    this.problem.set('');
    this.http.post<ApiResponse<unknown>>(`${API_BASE}/sourceJob.json/retryRun`, { jobQueueId: this.data.jobQueueId, from }).subscribe({
      next: response => {
        this.running.set(false);
        if (response.status === API_SUCCESS) {
          this.toast.success(response.message || `Run #${this.data.jobQueueId} queued again.`);
          this.ref.close(true);
          return;
        }
        // Refused (an input file changed, an output expired meanwhile, another retry got there first): say why, and
        // show the plan as it is now.
        this.problem.set(response.message || 'The run could not be retried.');
        const plan = planOf(response.data);
        if (plan) {
          this.plan.set(plan);
          if (!this.canConfirm()) this.from.set(this.firstChoice(plan));
        }
      },
      error: err => {
        this.running.set(false);
        this.problem.set(err?.error?.message || 'The run could not be retried.');
      },
    });
  }
}
