import { Component, DestroyRef, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';
import { TaskCountService } from '../workflows/task-count.service';

/**
 * UX review 2026-10-12 (D1, W1): Home says what waits for the reader's review, with the way there. A reviewer saw six job
 * tiles at 0 and nothing about the five approvals waiting for their group; an administrator saw no "waiting for review"
 * either while Executions held fifty.
 *
 * For whoever holds the Task inbox (reviewers) and for administrators: the tasks waiting for them or their groups (the
 * inbox's own count, as the menu badge reads it), and for an administrator also the runs whose results wait for review
 * (Core's review/waiting), which lead to Executions' Waiting for review.
 */
@Component({
  selector: 'app-waiting-for-review',
  imports: [Icon, RouterLink],
  template: `
    @if (shown()) {
      <section class="card p-4 flex flex-wrap items-center gap-x-6 gap-y-2" data-test="waiting-for-review" aria-label="Waiting for review">
        <span class="stat-glyph"><app-icon name="inbox" /></span>
        <div class="flex flex-col min-w-0 mr-auto">
          <!-- Owner 2026-10-12: lead with what is waiting. An administrator's runs come first; what waits for them
               personally is the small line under it, never a "nothing" beside a count. -->
          @if (leadsWithRuns()) {
            <a class="text-base font-semibold link-inline" routerLink="/pipelines/executions" data-test="waiting-runs">{{ runsLabel() }}</a>
            @if (tasks() > 0) {
              <a class="text-xs link-inline" routerLink="/workflows/inbox" data-test="waiting-tasks">{{ tasksLabel() }} for you or your groups</a>
            } @else {
              <span class="text-xs text-[color:var(--text-muted)]" data-test="waiting-none">Nothing waits for you personally.</span>
            }
          } @else if (tasks() > 0) {
            <a class="text-base font-semibold link-inline" routerLink="/workflows/inbox" data-test="waiting-tasks">
              {{ tasks() }} waiting for your review</a>
            <span class="text-xs text-[color:var(--text-muted)]">Approvals and run reviews for you and your groups, in the Review inbox.</span>
          } @else {
            <span class="text-base font-semibold" data-test="waiting-none">Nothing is waiting for your review</span>
            <span class="text-xs text-[color:var(--text-muted)]">Approvals and run reviews for you and your groups arrive in the Review inbox.</span>
          }
          @if (overdue() > 0) { <span class="text-xs text-crit-500">{{ overdue() }} overdue</span> }
        </div>
        <a class="btn btn-primary btn-sm" routerLink="/workflows/inbox">Open the Review inbox</a>
      </section>
    }
  `,
})
export class WaitingForReview implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  /** Only asked for when the card is shown: the inbox's count service reads Identity's person for its own badge. */
  private readonly count = signal<TaskCountService | null>(null);
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly admin = computed(() => typeof this.auth.isTenantAdmin === 'function' && this.auth.isTenantAdmin());
  /** Reviewers (they hold the Task inbox) and administrators, in a workspace. */
  readonly shown = computed(() => {
    const user = typeof this.auth.user === 'function' ? this.auth.user() : null;
    return !!user?.tenantId && (this.admin() || (typeof this.auth.canOpen === 'function' && this.auth.canOpen('task-inbox')));
  });
  readonly tasks = computed(() => (this.count()?.mine() ?? 0) + (this.count()?.groups() ?? 0));
  readonly overdue = computed(() => this.count()?.overdue() ?? 0);
  /** Runs waiting for review (administrators); null until read, or when they cannot be. */
  readonly runs = signal<{ count: number; more: boolean } | null>(null);
  readonly runsLabel = computed(() => {
    const r = this.runs();
    if (!r) return '';
    const n = `${r.count}${r.more ? '+' : ''}`;
    return r.count === 1 && !r.more ? '1 run is waiting for review' : `${n} runs are waiting for review`;
  });
  /** An administrator with runs waiting: they lead the card. */
  readonly leadsWithRuns = computed(() => this.admin() && (this.runs()?.count ?? 0) > 0);
  readonly tasksLabel = computed(() => `${this.tasks()} ${this.tasks() === 1 ? 'approval waits' : 'approvals wait'}`);

  ngOnInit(): void {
    if (!this.shown()) return;
    const count = this.injector.get(TaskCountService);
    this.count.set(count);
    count.refresh();
    if (!this.admin()) return;
    this.http.get<ApiResponse<{ runs?: unknown[]; more?: boolean }>>(`${API_BASE}/sourceJob.json/review/waiting`)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: r => this.runs.set(r.status === API_SUCCESS ? { count: r.data?.runs?.length ?? 0, more: !!r.data?.more } : null),
        error: () => this.runs.set(null),
      });
  }
}
