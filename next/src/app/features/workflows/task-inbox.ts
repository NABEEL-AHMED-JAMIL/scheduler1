import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';
import { StatusPill } from '../../shared/ui/status-pill';
import { Combobox, ComboboxOption } from '../../shared/ui/combobox';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { Dialog } from '@angular/cdk/dialog';
import { Colleague, Decision, InboxTask, RequestDetail, RequestRow, TaskDetail, WorkflowsApi } from './workflows.api';
import { HistoryLine, historyLines, shortTime } from './history';
import { TaskCountService } from './task-count.service';

export type InboxTab = 'mine' | 'groups' | 'done' | 'requests';

/**
 * The Task inbox (MIG-276): the approvals and tasks waiting for the reader, as the design preview draws it -- the list on
 * the left (Mine, My groups, Done), the task on the right with the request's fields, its history, a comment and the
 * decisions -- and My requests, where a requester follows (and may cancel) what they started. Every decision carries an
 * Idempotency-Key; whether the reader may make it is the server's, per task.
 */
@Component({
  selector: 'app-task-inbox',
  imports: [FormsModule, RouterLink, Icon, StatusPill, Combobox],
  templateUrl: './task-inbox.html',
})
export class TaskInbox implements OnInit {
  private readonly api = inject(WorkflowsApi);
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly badge = inject(TaskCountService);

  readonly tab = signal<InboxTab>('mine');
  readonly mine = signal<InboxTask[]>([]);
  readonly groups = signal<InboxTask[]>([]);
  readonly done = signal<InboxTask[]>([]);
  readonly requests = signal<RequestRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly selectedTask = signal<number | null>(null);
  readonly detail = signal<TaskDetail | null>(null);
  readonly selectedRequest = signal<number | null>(null);
  readonly request = signal<RequestDetail | null>(null);
  readonly detailError = signal('');

  readonly colleagues = signal<Colleague[]>([]);
  readonly comment = signal('');
  readonly passTo = signal<number | null>(null);
  readonly passing = signal(false);
  readonly busy = signal(false);

  readonly me = computed(() => this.auth.user()?.appUserId ?? null);

  readonly rows = computed<InboxTask[]>(() => {
    switch (this.tab()) {
      case 'groups': return this.groups();
      case 'done': return this.done();
      default: return this.mine();
    }
  });

  readonly colleagueOptions = computed<ComboboxOption[]>(() => this.colleagues()
    .filter(c => c.userId !== this.me())
    .map(c => ({ value: String(c.userId), label: c.fullName || c.username, hint: c.username })));

  /** The open task is the reader's own request's approval: someone else decides it. */
  readonly ownRequest = computed(() => {
    const d = this.detail();
    return !!d && d.stepType === 'approval' && d.requestedBy != null && d.requestedBy === this.me();
  });

  readonly canDecide = computed(() => {
    const d = this.detail();
    return !!d && d.state === 'Open' && d.requestState !== 'Approved' && !this.ownRequest() && this.tab() !== 'done';
  });

  readonly taskHistory = computed<HistoryLine[]>(() => {
    const d = this.detail();
    return d ? historyLines(d.history, id => this.name(id), key => this.stepName(key, d.tasks)) : [];
  });

  readonly requestHistory = computed<HistoryLine[]>(() => {
    const r = this.request();
    return r ? historyLines(r.history, id => this.name(id), key => this.stepName(key, r.tasks)) : [];
  });

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const path = this.route.snapshot.routeConfig?.path ?? '';
    if (path.endsWith('requests')) {
      this.tab.set('requests');
      const id = Number(params.get('id'));
      if (id) this.openRequest(id);
    }
    const task = Number(params.get('task'));
    if (task) this.openTask(task);
    this.api.colleagues().subscribe({ next: r => { if (r.status === API_SUCCESS) this.colleagues.set(r.data ?? []); }, error: () => {} });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    let pending = 4;
    const settle = () => { if (--pending === 0) this.loading.set(false); };
    const take = <T>(target: (rows: T[]) => void) => ({
      next: (r: ApiResponse<T[]>) => {
        if (r.status === API_SUCCESS) target(r.data ?? []);
        else this.error.set(r.message || 'Your tasks could not be read.');
        settle();
      },
      error: () => { this.error.set('Your tasks could not be read.'); settle(); },
    });
    this.api.mine().subscribe(take<InboxTask>(rows => {
      this.mine.set(rows);
      if (this.selectedTask() === null && this.tab() === 'mine' && rows.length) this.openTask(rows[0].id);
    }));
    this.api.groups().subscribe(take<InboxTask>(rows => this.groups.set(rows)));
    this.api.done().subscribe(take<InboxTask>(rows => this.done.set(rows)));
    this.api.requests().subscribe(take<RequestRow>(rows => this.requests.set(rows)));
    this.badge.refresh();
  }

  pick(tab: InboxTab): void {
    this.tab.set(tab);
    this.passing.set(false);
    if (tab === 'requests') {
      const first = this.requests()[0];
      if (first && this.selectedRequest() === null) this.openRequest(first.id);
      return;
    }
    const first = this.rows()[0];
    if (first) this.openTask(first.id);
    else { this.selectedTask.set(null); this.detail.set(null); }
  }

  openTask(id: number): void {
    this.selectedTask.set(id);
    this.detailError.set('');
    this.comment.set('');
    this.passing.set(false);
    this.passTo.set(null);
    this.router.navigate([], { relativeTo: this.route, queryParams: { task: id }, queryParamsHandling: 'merge', replaceUrl: true });
    this.api.task(id).subscribe({
      next: r => {
        if (this.selectedTask() !== id) return;
        if (r.status === API_SUCCESS && r.data) this.detail.set(r.data);
        else { this.detail.set(null); this.detailError.set(r.message || 'This task could not be read.'); }
      },
      error: () => { this.detail.set(null); this.detailError.set('This task could not be read.'); },
    });
  }

  openRequest(id: number): void {
    this.selectedRequest.set(id);
    this.detailError.set('');
    this.api.request(id).subscribe({
      next: r => {
        if (this.selectedRequest() !== id) return;
        if (r.status === API_SUCCESS && r.data) this.request.set(r.data);
        else { this.request.set(null); this.detailError.set(r.message || 'This request could not be read.'); }
      },
      error: () => { this.request.set(null); this.detailError.set('This request could not be read.'); },
    });
  }

  decide(action: Decision): void {
    const d = this.detail();
    if (!d || this.busy()) return;
    const comment = this.comment().trim() || null;
    if (action === 'reject' && d.rejectNeedsComment && !comment) {
      this.toast.error('Say why you are rejecting this: a reason is required.');
      return;
    }
    if (action === 'changes' && !comment) {
      this.toast.error('Say what should change, in the comment.');
      return;
    }
    this.busy.set(true);
    this.api.act(d.id, action, comment, `${d.id}:${action}:${crypto.randomUUID()}`).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status === API_SUCCESS) {
          this.toast.success(r.message);
          this.afterChange(d.id);
        } else {
          this.toast.error(r.message);
        }
      },
      error: () => { this.busy.set(false); this.toast.error('That could not be done. Try again.'); },
    });
  }

  passOn(): void {
    const d = this.detail();
    const to = this.passTo();
    if (!d || to == null || this.busy()) return;
    this.busy.set(true);
    this.api.reassign(d.id, to, this.comment().trim() || null, `${d.id}:pass:${crypto.randomUUID()}`).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status === API_SUCCESS) {
          this.toast.success(`Passed to ${this.name(to)}.`);
          this.passing.set(false);
          this.afterChange(d.id);
        } else {
          this.toast.error(r.message);
        }
      },
      error: () => { this.busy.set(false); this.toast.error('That could not be done. Try again.'); },
    });
  }

  async cancelRequest(): Promise<void> {
    const r = this.request();
    if (!r) return;
    const ok = await confirmWith(this.dialog, { title: 'Cancel this request?', body: `"${r.title}" stops here: its open tasks are withdrawn.`,
      confirmLabel: 'Cancel request', danger: true });
    if (!ok) return;
    this.api.cancel(r.id, null, `${r.id}:cancel:${crypto.randomUUID()}`).subscribe({
      next: res => {
        if (res.status === API_SUCCESS) { this.toast.success('Cancelled.'); this.openRequest(r.id); this.load(); }
        else this.toast.error(res.message);
      },
      error: () => this.toast.error('That could not be done. Try again.'),
    });
  }

  private afterChange(taskId: number): void {
    this.comment.set('');
    this.load();
    this.openTask(taskId);
  }

  // ---- words ------------------------------------------------------------------------------------------------------

  name(id: number | null | undefined): string {
    if (id == null) return 'the workflow';
    if (id === this.me()) return 'you';
    const c = this.colleagues().find(x => x.userId === id);
    return c ? (c.fullName || c.username) : `user ${id}`;
  }

  stepName(key: string | null | undefined, tasks: { stepKey: string; name: string }[]): string {
    if (!key) return 'The request';
    const base = key.endsWith('#changes') ? key.slice(0, -'#changes'.length) : key;
    const t = tasks.find(x => x.stepKey === key) ?? tasks.find(x => x.stepKey === base);
    return t ? t.name : base;
  }

  holder(t: InboxTask): string {
    if (t.assigneeUserId != null) return this.name(t.assigneeUserId);
    if (t.assigneeKind === 'role') return t.assigneeValue === 'TENANT_ADMIN' ? 'Administrators' : 'Any member';
    return 'Group';
  }

  dueLabel(t: InboxTask): string {
    if (t.state !== 'Open') return t.actedAt ? shortTime(t.actedAt) : '';
    if (!t.dueAt) return 'No due time';
    return (t.overdue ? 'Overdue · was due ' : 'Due ') + shortTime(t.dueAt);
  }

  stateLabel(t: InboxTask): string {
    if (t.state === 'Open') return t.overdue ? 'Overdue' : 'Pending';
    return t.state === 'ChangesRequested' ? 'Changes asked' : t.state;
  }

  /** The subject's fields as label and value, the way a person reads them. */
  fields(subject: Record<string, unknown> | undefined | null): { label: string; value: string }[] {
    if (!subject) return [];
    return Object.entries(subject)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => ({ label: labelOf(k), value: typeof v === 'object' ? JSON.stringify(v) : String(v) }));
  }
}

function labelOf(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
