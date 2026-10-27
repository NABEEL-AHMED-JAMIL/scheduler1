import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { RunItemsApi, refusalText } from '../jobs/run-items/run-items.api';
import { AttentionRun, retriedSentence } from '../jobs/run-items/run-items.model';
import { plural } from '../jobs/run-steps/run-page.model';

/** "2 items failed at AI prompt": how many, and the steps they failed at. */
export function attentionLine(run: AttentionRun): string {
  const steps = (run.failedAt ?? []).filter(Boolean);
  return `${plural(run.failed, 'item')} failed${steps.length ? ` at ${steps.join(', ')}` : ''}`;
}

/** The Retry button's words: "Retry both" for two, "Retry 3" for more. */
export function retryWord(failed: number): string {
  return failed === 2 ? 'Retry both' : `Retry ${failed.toLocaleString('en-GB')}`;
}

/**
 * MIG-420: Home names the recent runs whose items failed -- which run, how many items and at which step, the first of
 * them by name -- with the way to the failed items and Retry. For whoever may open a run's page in a workspace; a
 * reader Core refuses (403) or a workspace with nothing failed sees no card at all.
 */
@Component({
  selector: 'app-needs-attention',
  imports: [Icon, RouterLink, ServerTimePipe],
  template: `
    @if (runs().length) {
      <section class="card p-4 flex flex-col gap-3" data-test="needs-attention" aria-labelledby="needs-attention-heading">
        <div class="flex items-center gap-2">
          <span class="stat-glyph icon-crit"><app-icon name="alert" /></span>
          <h2 id="needs-attention-heading" class="text-sm font-semibold">Needs attention</h2>
        </div>
        <ul class="divide-y divide-[color:var(--border-subtle)]">
          @for (run of runs(); track run.jobQueueId) {
            <li class="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 text-sm" [attr.data-run]="run.jobQueueId">
              <div class="flex flex-col min-w-0 mr-auto gap-0.5">
                <span class="flex flex-wrap items-baseline gap-x-2">
                  <span class="font-semibold truncate">{{ run.jobName || 'Schedule ' + run.jobId }}</span>
                  <span class="text-xs text-[color:var(--text-muted)]">run #{{ run.jobQueueId }}@if (run.endedAt) { · {{ run.endedAt | serverTime:'recent' }} }</span>
                </span>
                <span class="text-[color:var(--text-secondary)]" data-test="attention-line">{{ line(run) }}@if (run.labels?.length) {:
                  @for (l of run.labels!; track $index; let last = $last) { <span class="mono">{{ l }}</span>@if (!last) {<span>, </span>} }
                  @if (run.failed > run.labels!.length) { <span> and {{ run.failed - run.labels!.length }} more</span> }
                }</span>
              </div>
              <a class="btn btn-default btn-sm" [routerLink]="['/pipelines/schedules', run.jobId, 'runs', run.jobQueueId]"
                 [queryParams]="{ tab: 'items', status: 'failed' }" [attr.aria-label]="'See the failed items of run #' + run.jobQueueId">See failed items</a>
              @if (canRetry()) {
                <button type="button" class="btn btn-primary btn-sm" data-test="attention-retry" [disabled]="busy() === run.jobQueueId"
                        [attr.aria-label]="retryWord(run.failed) + ' failed items of run #' + run.jobQueueId" (click)="retry(run)">
                  <app-icon name="play" />{{ retryWord(run.failed) }}</button>
              }
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class NeedsAttention implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(RunItemsApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly runs = signal<AttentionRun[]>([]);
  readonly busy = signal<number | null>(null);
  readonly retryWord = retryWord;

  private can(page: 'jobs' | 'queue'): boolean { return typeof this.auth.canOpen === 'function' && this.auth.canOpen(page); }
  /** In a workspace, for whoever may open a run's page (Schedules or Runs by date). */
  readonly shown = computed(() => {
    const user = typeof this.auth.user === 'function' ? this.auth.user() : null;
    return !!user?.tenantId && (this.can('jobs') || this.can('queue'));
  });
  /** Retrying is Schedules' to do; a reviewer sees the way to the items only. */
  readonly canRetry = computed(() => this.can('jobs'));

  line(run: AttentionRun): string { return attentionLine(run); }

  ngOnInit(): void { this.load(); }

  load(): void {
    if (!this.shown()) return;
    this.api.attention(5).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: runs => this.runs.set(runs.filter(r => r.failed > 0)),
      // 403 (no run pages), an older Core, anything else: Home simply has no such card.
      error: () => this.runs.set([]),
    });
  }

  async retry(run: AttentionRun): Promise<void> {
    if (this.busy() !== null) return;
    const ok = await confirmWith(this.dialog, {
      title: `Retry ${plural(run.failed, 'failed item')}?`,
      body: `Run #${run.jobQueueId}'s failed items run again from the step each failed at. The steps before are reused, not run again.`,
      confirmLabel: retryWord(run.failed),
    });
    if (!ok) return;
    this.busy.set(run.jobQueueId);
    this.api.retry({ jobQueueId: run.jobQueueId, failed: true, from: 'failed_step' }).subscribe({
      next: answer => { this.busy.set(null); this.toast.success(retriedSentence(answer.data, answer.message)); this.load(); },
      error: err => { this.busy.set(null); this.toast.error(refusalText(err, 'The items could not be retried.')); },
    });
  }
}
