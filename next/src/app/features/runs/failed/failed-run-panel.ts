import { Component, OnInit, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { SidePanel } from '../../../shared/ui/side-panel';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ToastService } from '../../../shared/ui/toast.service';
import { reasonText, refusal } from '../../../shared/ui/bulk/bulk.model';
import { FailedRun, FailedRunsApi, RetryPlan } from './failed-runs.api';
import { backfillLink, backfillRetryNote } from '../../jobs/retry/run-retry';

export interface FailedRunPanelData {
  run: FailedRun;
  /** The reader may retry it (the workspace's, with Schedules, and the run Failed rather than Interrupted). */
  canRetry: boolean;
  /** A workspace administrator may also run it again from the start. */
  canRestart: boolean;
}

/**
 * MIG-355: one failed run, over the right of Runs › Failed: where it failed (the step, its task), the whole error, its
 * pattern and kind, a link to the run, and Retry from failed step -- MIG-345's plan first (the step it resumes from, the
 * steps it reuses, or why it cannot), then the retry itself. Closes with true when the run was queued again.
 */
@Component({
  selector: 'app-failed-run-panel',
  imports: [SidePanel, Icon, RouterLink, ServerTimePipe],
  styles: `
    .failed-error { border: 1px solid var(--border-subtle); background: var(--surface-inset); border-radius: var(--radius-lg);
      padding: 0.75rem; font-family: var(--font-mono, ui-monospace, monospace); }
  `,
  template: `
    <app-side-panel [heading]="'Run #' + run.runId + ' failed'" [subtitle]="(run.pipeline || run.schedule || '') + (run.workspace ? ' · ' + run.workspace : '')"
                    data-test="failed-run-panel">
      <dl class="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm m-0">
        <dt class="text-[color:var(--text-muted)]">Failing step</dt>
        <dd class="m-0" data-test="failed-step">{{ step() }}@if (run.task) { <span class="mono text-xs text-[color:var(--text-muted)]"> {{ run.task }}</span> }</dd>
        <dt class="text-[color:var(--text-muted)]">Kind</dt>
        <dd class="m-0">{{ run.kindLabel }}@if (run.timedOut) { <span> (timed out)</span> }</dd>
        <dt class="text-[color:var(--text-muted)]">Schedule</dt>
        <dd class="m-0">{{ run.schedule || '—' }}</dd>
        <dt class="text-[color:var(--text-muted)]">Attempt</dt>
        <dd class="m-0">{{ run.attempt }}</dd>
        <dt class="text-[color:var(--text-muted)]">Started</dt>
        <dd class="m-0">{{ run.startedAt ? (run.startedAt | serverTime:'recentSec') : '—' }}</dd>
        <dt class="text-[color:var(--text-muted)]">Ended</dt>
        <dd class="m-0">{{ run.endedAt | serverTime:'recentSec' }}</dd>
      </dl>

      <h3 class="text-sm font-semibold mt-5 mb-1">Error</h3>
      <pre class="failed-error text-xs whitespace-pre-wrap break-words m-0 max-h-72 overflow-auto" data-test="failed-error">{{ run.error || 'No message was recorded.' }}</pre>
      <p class="text-xs text-[color:var(--text-muted)] mt-2 mb-0">Pattern: <span class="mono">{{ run.pattern }}</span></p>

      <div class="flex flex-wrap gap-2 mt-4">
        <a class="btn btn-default btn-sm" [routerLink]="run.link" (click)="ref.close(false)" data-test="failed-open-run">
          <app-icon name="external" />Open the run</a>
      </div>

      @if (run.backfillId; as backfill) {
        <!-- UX review 2026-10-13: a backfill's run is retried by its backfill, not from here (Core refuses it). -->
        <section class="mt-6" data-test="failed-backfill-note">
          <h3 class="text-sm font-semibold mb-1">Retry</h3>
          <p class="text-sm m-0 text-[color:var(--text-secondary)]">{{ backfillNote(backfill) }}
            <a class="link-inline" [routerLink]="backfillAt(backfill).link" [queryParams]="backfillAt(backfill).query"
               (click)="ref.close(false)">Open backfill #{{ backfill }}</a></p>
        </section>
      }
      @if (data.canRetry) {
        <section class="mt-6" data-test="failed-retry">
          <h3 class="text-sm font-semibold mb-1">Retry from the failed step</h3>
          @if (planLoading()) {
            <p class="text-sm text-[color:var(--text-secondary)] flex items-center gap-2"><span class="spinner"></span>Checking what a retry would do…</p>
          } @else if (plan(); as p) {
            @if (p.resumable) {
              <p class="text-sm m-0">Attempt {{ p.nextAttempt }} resumes from step {{ (p.fromIndex ?? 0) + 1 }} &lt;{{ p.fromKey }}&gt;,
                reusing {{ p.reused.length }} completed {{ p.reused.length === 1 ? 'step' : 'steps' }} and their kept outputs.</p>
            } @else {
              <p class="text-sm m-0 text-[color:var(--text-secondary)]" data-test="failed-retry-refusal">{{ reason(p) }}</p>
            }
          } @else if (planError()) {
            <p class="text-sm text-crit-500 m-0">{{ planError() }}</p>
          }
          @if (done()) { <p class="text-sm text-ok-500 mt-2 mb-0" role="status" data-test="failed-retried">{{ done() }}</p> }
          @if (sendError()) { <p class="text-sm text-crit-500 mt-2 mb-0" role="alert">{{ sendError() }}</p> }
        </section>
      }
      @if (!data.canRetry && run.status === 'Interrupt') {
        <p class="text-xs text-[color:var(--text-muted)] mt-6">A run that stopped responding was closed, not failed: run its pipeline again rather than retrying it.</p>
      }

      <div foot class="flex items-center gap-2 w-full">
        <button type="button" class="btn btn-ghost btn-sm" (click)="ref.close(!!done())">Close</button>
        @if (data.canRetry && data.canRestart && plan()?.restartable) {
          <button type="button" class="btn btn-default btn-sm ml-auto" [disabled]="sending() || !!done()" (click)="retry('start')" data-test="failed-restart">
            <app-icon name="play" />Run again from the start</button>
        }
        @if (data.canRetry) {
          <button type="button" class="btn btn-primary btn-sm" [class.ml-auto]="!(data.canRestart && plan()?.restartable)"
                  [disabled]="!plan()?.resumable || sending() || !!done()" (click)="retry('failed_step')" data-test="failed-retry-button">
            <app-icon name="refresh" [busy]="sending()" />Retry from failed step</button>
        }
      </div>
    </app-side-panel>
  `,
})
export class FailedRunPanel implements OnInit {
  readonly ref = inject<DialogRef<boolean, FailedRunPanel>>(DialogRef);
  readonly data = inject<FailedRunPanelData>(DIALOG_DATA);
  private readonly api = inject(FailedRunsApi);
  private readonly toast = inject(ToastService);

  readonly run = this.data.run;
  readonly backfillNote = backfillRetryNote;
  readonly backfillAt = backfillLink;
  readonly plan = signal<RetryPlan | null>(null);
  readonly planLoading = signal(false);
  readonly planError = signal('');
  readonly sending = signal(false);
  readonly done = signal('');
  readonly sendError = signal('');

  ngOnInit(): void {
    if (!this.data.canRetry) return;
    this.planLoading.set(true);
    this.api.retryPlan(this.run.runId).subscribe({
      next: r => {
        this.planLoading.set(false);
        if (r?.data) this.plan.set(r.data);
        else this.planError.set(r?.message || 'What a retry would do could not be read.');
      },
      error: err => {
        this.planLoading.set(false);
        this.planError.set(refusal(err, 'What a retry would do could not be read.'));
      },
    });
  }

  step(): string {
    const r = this.run;
    if (r.stepIndex == null) return r.status === 'Interrupt' ? 'The run stopped responding' : 'The run, before any step';
    return `Step ${r.stepIndex + 1}${r.stepKey ? ' <' + r.stepKey + '>' : ''}`;
  }

  reason(p: RetryPlan): string {
    return p.refusal || reasonText(p.refusalKind);
  }

  retry(from: 'failed_step' | 'start'): void {
    this.sending.set(true);
    this.sendError.set('');
    this.api.retry(this.run.runId, from).subscribe({
      next: r => {
        this.sending.set(false);
        if (r?.status === API_SUCCESS) {
          this.done.set(r.message || 'Queued again.');
          this.toast.success(r.message || `Run ${this.run.runId} queued again.`);
        } else {
          this.sendError.set(r?.message || 'The run could not be retried.');
        }
      },
      error: err => {
        this.sending.set(false);
        this.sendError.set(refusal(err, 'The run could not be retried.'));
      },
    });
  }
}
