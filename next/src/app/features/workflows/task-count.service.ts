import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { API_SUCCESS } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { UnreadCountService } from '../../core/notifications/unread-count.service';
import { WorkflowsApi } from './workflows.api';

/**
 * The Task inbox's badge in the menu (MIG-275/276): the open tasks in Mine and My groups. Read again whenever the bell's
 * unread count moves -- a new task, a reminder and an escalation all arrive as a bell -- and every two minutes as a
 * backstop, but only for someone who holds the task-inbox page.
 */
@Injectable({ providedIn: 'root' })
export class TaskCountService {
  private readonly api = inject(WorkflowsApi);
  private readonly auth = inject(AuthService);
  private readonly unread = inject(UnreadCountService);

  readonly count = signal(0);
  readonly overdue = signal(0);

  constructor() {
    effect(() => {
      this.unread.count();
      this.auth.user();
      untracked(() => this.refresh());
    });
    setInterval(() => this.refresh(), 120_000);
  }

  refresh(): void {
    if (!this.auth.user() || !this.auth.canOpen('task-inbox')) {
      this.count.set(0);
      return;
    }
    this.api.count().subscribe({
      next: r => {
        if (r.status === API_SUCCESS && r.data) {
          this.count.set(r.data.total);
          this.overdue.set(r.data.overdue);
        }
      },
      error: () => {},
    });
  }
}
