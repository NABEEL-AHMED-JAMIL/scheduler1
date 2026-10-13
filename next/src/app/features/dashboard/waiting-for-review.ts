import { Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';
import { TaskCountService } from '../workflows/task-count.service';

/**
 * UX review 2026-10-12 (D1, W1) and DR2 (2026-10-13): Home says what waits for the reader's review, with the way there --
 * one count over the Review home's list (approvals and run reviews in the Task inbox, runs waiting for an administrator's
 * review, documents in review), the same number as the menu's Review badge, and what it is made of under it.
 *
 * For whoever holds the Task inbox or Document review (reviewers) and for administrators, in a workspace.
 */
@Component({
  selector: 'app-waiting-for-review',
  imports: [Icon, RouterLink],
  template: `
    @if (shown()) {
      <section class="card p-4 flex flex-wrap items-center gap-x-6 gap-y-2" data-test="waiting-for-review" aria-label="Waiting for review">
        <span class="stat-glyph"><app-icon name="inbox" /></span>
        <div class="flex flex-col min-w-0 mr-auto">
          @if (total() > 0) {
            <a class="text-base font-semibold link-inline" routerLink="/review" data-test="waiting-total">
              {{ total() }}{{ more() ? '+' : '' }} waiting for your review</a>
            <span class="text-xs text-[color:var(--text-secondary)]" data-test="waiting-kinds">{{ kindsLine() }}</span>
          } @else {
            <span class="text-base font-semibold" data-test="waiting-none">Nothing is waiting for your review</span>
            <span class="text-xs text-[color:var(--text-muted)]">Approvals, run results and documents for you and your groups arrive in Review.</span>
          }
          @if (overdue() > 0) { <span class="text-xs text-crit-500" data-test="waiting-overdue">{{ overdue() }} overdue</span> }
        </div>
        <a class="btn btn-primary btn-sm" routerLink="/review">Open Review</a>
      </section>
    }
  `,
})
export class WaitingForReview implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  /** Only asked for when the card is shown. */
  private readonly count = signal<TaskCountService | null>(null);

  readonly admin = computed(() => typeof this.auth.isTenantAdmin === 'function' && this.auth.isTenantAdmin());
  private readonly canOpen = (page: 'task-inbox' | 'document-review') => typeof this.auth.canOpen === 'function' && this.auth.canOpen(page);
  /** Reviewers (they hold the Task inbox or Document review) and administrators, in a workspace. */
  readonly shown = computed(() => {
    const user = typeof this.auth.user === 'function' ? this.auth.user() : null;
    return !!user?.tenantId && (this.admin() || this.canOpen('task-inbox') || this.canOpen('document-review'));
  });
  private readonly review = computed(() => this.count()?.review() ?? null);
  readonly total = computed(() => this.review()?.total ?? 0);
  readonly more = computed(() => this.review()?.more ?? false);
  readonly overdue = computed(() => this.review()?.overdue ?? 0);
  /** "2 approvals · 1 run · 8 documents": what the count is made of, the kinds with none left out. */
  readonly kindsLine = computed(() => {
    const k = this.review()?.kinds ?? { approval: 0, run: 0, document: 0 };
    const part = (n: number, one: string, many: string) => n ? `${n} ${n === 1 ? one : many}` : '';
    const runs = k.run ? (this.more() ? `${k.run}+ runs` : part(k.run, 'run', 'runs')) : '';
    return [part(k.approval, 'approval', 'approvals'), runs, part(k.document, 'document', 'documents')].filter(Boolean).join(' · ');
  });

  ngOnInit(): void {
    if (!this.shown()) return;
    const count = this.injector.get(TaskCountService);
    this.count.set(count);
    count.refresh();
  }
}
