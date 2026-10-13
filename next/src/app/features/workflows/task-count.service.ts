import { Injector, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { API_SUCCESS } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { UnreadCountService } from '../../core/notifications/unread-count.service';
import { WorkflowsApi } from './workflows.api';
import type { ReviewCount } from '../review/review-sources';

/**
 * The Review badge in the menu and Home's "N waiting for your review" (UX review DR2, 2026-10-13): everything waiting for
 * the reader -- approvals and run reviews in the Task inbox, runs waiting for an administrator's review, documents in
 * review -- counted from the same list the Review home shows (features/review/review-sources.ts, loaded on first use so
 * the menu's bundle does not carry it). The Task inbox's own counts (Mine, My groups, Done, My requests) are kept beside
 * it for its tabs. Read again whenever the bell's unread count moves -- a new task, a reminder and an escalation all
 * arrive as a bell -- and every two minutes as a backstop, only in a workspace, and only while the tab is visible.
 */
@Injectable({ providedIn: 'root' })
export class TaskCountService {
  private readonly api = inject(WorkflowsApi);
  private readonly auth = inject(AuthService);
  private readonly unread = inject(UnreadCountService);
  readonly injector = inject(Injector);

  /** Open tasks in Mine and My groups (the Task inbox's own total). */
  readonly count = signal(0);
  readonly overdue = signal(0);
  /** Everything waiting for the reader's review, across the three services: the menu badge and Home (null: none). */
  readonly review = signal<ReviewCount | null>(null);
  /** Each tab's total, counted by the service (P2 #31): the lists come a page at a time. */
  readonly mine = signal(0);
  readonly groups = signal(0);
  readonly done = signal(0);
  readonly requests = signal(0);

  constructor() {
    effect(() => {
      this.unread.count();
      this.auth.user();
      untracked(() => this.refresh());
    });
    setInterval(() => this.refresh(), 120_000);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refresh(); });
  }

  refresh(): void {
    // A platform administrator outside any workspace has no inbox: the count would only answer 400, on every page.
    const user = this.auth.user();
    if (!user || !user.tenantId) { this.count.set(0); this.review.set(null); return; }
    // A tab in the background re-reads when it is looked at again (the bell moves then), not every two minutes.
    if (typeof document !== 'undefined' && document.hidden) return;
    import('../review/review-sources').then(m => m.countReview(this), () => {});
    if (!this.auth.canOpen('task-inbox')) { this.count.set(0); return; }
    this.api.count().subscribe({
      next: r => {
        if (r.status === API_SUCCESS && r.data) {
          this.count.set(r.data.total);
          this.overdue.set(r.data.overdue);
          this.mine.set(r.data.mine);
          this.groups.set(r.data.groups);
          this.done.set(r.data.done ?? 0);
          this.requests.set(r.data.requests ?? 0);
        }
      },
      error: () => {},
    });
  }
}
