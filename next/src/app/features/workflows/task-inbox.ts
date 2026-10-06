import { Component, ElementRef, Injector, OnInit, afterRenderEffect, computed, inject, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';
import { StatusPill } from '../../shared/ui/status-pill';
import { Combobox, ComboboxOption } from '../../shared/ui/combobox';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { Dialog } from '@angular/cdk/dialog';
import { Observable } from 'rxjs';
import { Colleague, Decision, InboxPage, InboxTask, RequestDetail, RequestRow, TaskDetail, WorkflowsApi } from './workflows.api';
import { HistoryLine, compactTime, dropOwnStep, exactTime, historyLines, relativeTime, shortTime } from './history';
import { TaskCountService } from './task-count.service';
import { ListItem, RowTone, appendPage, choicesOf, commonOf, dueGroup, groupRows, matchesSearch, mergeHead, nextAfter, pastGroup, splitRef, stepFrom } from './inbox-list';
import { ValueView, labelOf, valueKind } from './value-kind';

export type InboxTab = 'mine' | 'groups' | 'done' | 'requests';

/** A page of a tab's list: the workflow service's Inbox.DEFAULT_LIMIT (it pages by cursor, at most 200 at a time). */
export const INBOX_PAGE_SIZE = 100;

const TABS: InboxTab[] = ['mine', 'groups', 'done', 'requests'];
type PerTab<T> = Record<InboxTab, T>;
const perTab = <T>(value: T): PerTab<T> => ({ mine: value, groups: value, done: value, requests: value });

/** A request's field with how its value reads (value-kind.ts). */
export interface FieldView { label: string; value: string; view: ValueView; }

/**
 * The Task inbox (MIG-276), laid out as a mail client (owner, 2026-10-06): tabs over two panes that fill the screen and
 * scroll on their own -- the list, searchable and filtered, under day headers; the task with its decisions straight
 * under its title, the request's details and its history -- and My requests, where a requester follows (and may cancel)
 * what they started. Below 1024 px the list takes the width and a task opens over it, with a way back. Every decision
 * carries an Idempotency-Key; whether the reader may make it is the server's, per task.
 */
@Component({
  selector: 'app-task-inbox',
  imports: [FormsModule, NgTemplateOutlet, RouterLink, Icon, StatusPill, Combobox],
  templateUrl: './task-inbox.html',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class TaskInbox implements OnInit {
  private readonly api = inject(WorkflowsApi);
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly badge = inject(TaskCountService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly tab = signal<InboxTab>('mine');
  readonly mine = signal<InboxTask[]>([]);
  readonly groups = signal<InboxTask[]>([]);
  readonly done = signal<InboxTask[]>([]);
  readonly requests = signal<RequestRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  /** Where each tab's next page starts; null once the whole list is in. */
  readonly next = signal<PerTab<string | null>>(perTab(null));
  /** The search each tab's rows were read with on the service ("Search all"); '' for the whole list. */
  readonly searched = signal<PerTab<string>>(perTab(''));
  readonly loadingMore = signal(false);
  /** A page's size: the service's default. */
  pageSize = INBOX_PAGE_SIZE;

  readonly selectedTask = signal<number | null>(null);
  readonly detail = signal<TaskDetail | null>(null);
  readonly selectedRequest = signal<number | null>(null);
  readonly request = signal<RequestDetail | null>(null);
  readonly detailError = signal('');

  readonly colleagues = signal<Colleague[]>([]);
  private readonly colleaguesLoaded = signal(false);
  readonly comment = signal('');
  readonly passTo = signal<number | null>(null);
  readonly passing = signal(false);
  readonly busy = signal(false);

  /** The list's search and filters, over the rows already loaded. */
  readonly query = signal('');
  readonly statusFilter = signal('');
  readonly workflowFilter = signal('');
  /** Below 1024 px one pane shows at a time: the list, or the task opened from it. */
  readonly pane = signal<'list' | 'detail'>('list');
  /** "Now" for the day headers and relative times; moves on with every load. */
  readonly now = signal(Date.now());
  private readonly searchBox = viewChild<ElementRef<HTMLInputElement>>('search');
  /** The selection moved by keyboard: the row takes the focus as well as the scroll. */
  private focusRow = false;
  /** A ?task= link: once the lists are in, show the tab that task is on (a done task's link opens Done). */
  private followLinkedTask = false;

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

  /** The task's history, its own lines without its name: the heading already says it. */
  readonly taskHistory = computed<HistoryLine[]>(() => {
    const d = this.detail();
    return d ? dropOwnStep(historyLines(d.history, id => this.name(id), key => this.stepName(key, d.tasks)), d.name) : [];
  });

  readonly requestHistory = computed<HistoryLine[]>(() => {
    const r = this.request();
    return r ? historyLines(r.history, id => this.name(id), key => this.stepName(key, r.tasks)) : [];
  });

  // ---- the list ---------------------------------------------------------------------------------------------------

  /** The open tab's rows as the list draws them: title first, step and workflow under it, status and time beside. */
  readonly items = computed<ListItem[]>(() => {
    const now = this.now();
    if (this.tab() === 'requests') return this.requests().map(r => this.requestItem(r, now));
    return this.rows().map(t => this.taskItem(t, now));
  });

  /**
   * What every loaded row shares -- its workflow, and for tasks its step -- said once over the list instead of on each
   * row's second line, where it is only noise ("Alex approves the visit · MIG-279 visit approval" forty times). A
   * workflow filter makes the workflow common too.
   */
  readonly common = computed(() => {
    const filtered = this.workflowFilter();
    const tasks = this.tab() !== 'requests';
    const all = tasks ? this.rows() : this.requests();
    const workflow = filtered || commonOf(all.map(r => r.workflowName ?? ''));
    const step = tasks ? commonOf(this.rows().map(t => t.name)) : '';
    return { workflow, step };
  });

  /** The common part as the list's label: "Alex approves the visit · MIG-279 visit approval". */
  readonly commonLine = computed(() => [this.common().step, this.common().workflow].filter(Boolean).join(' · '));

  readonly hasFilters = computed(() => !!(this.query().trim() || this.statusFilter() || this.workflowFilter()));

  readonly shown = computed<ListItem[]>(() => {
    const query = this.query().trim();
    const status = this.statusFilter();
    const workflow = this.workflowFilter();
    return this.items().filter(i => (!status || i.status === status) && (!workflow || i.workflow === workflow)
      && (!query || matchesSearch(i.haystack, query)));
  });

  readonly groupsShown = computed(() => groupRows(this.shown()));
  readonly statusChoices = computed(() => choicesOf(this.items().map(i => i.status)));
  readonly workflowChoices = computed(() => choicesOf(this.items().map(i => i.workflow)).sort((a, b) => a.value.localeCompare(b.value)));
  private readonly shownIds = computed(() => this.shown().map(i => i.id));
  readonly selectedId = computed(() => this.tab() === 'requests' ? this.selectedRequest() : this.selectedTask());

  /** The open tab has more rows than are loaded. */
  readonly hasMore = computed(() => !!this.next()[this.tab()]);

  /** The open tab's total, as the service counts it (0 until the count is in). */
  private readonly total = computed(() => {
    switch (this.tab()) {
      case 'groups': return this.badge.groups();
      case 'done': return this.badge.done();
      case 'requests': return this.badge.requests();
      default: return this.badge.mine();
    }
  });

  /** "12 of 100 shown" while a filter is on; "100 of 240 tasks" while more are to load; the count otherwise. */
  readonly shownLine = computed(() => {
    const all = this.items().length;
    const tasks = this.tab() !== 'requests';
    const noun = (n: number) => tasks ? (n === 1 ? 'task' : 'tasks') : (n === 1 ? 'request' : 'requests');
    if (this.hasFilters()) return `${this.shown().length} of ${all} shown`;
    if (!this.hasMore()) return `${all} ${noun(all)}`;
    const total = this.total();
    return total > all ? `${all} of ${total.toLocaleString('en-US')} ${noun(total)}` : `${all} ${noun(all)} loaded`;
  });

  /**
   * While more rows are to load, a search or filter looks only at those loaded, and says so -- or, after Search all, at
   * the service's matches loaded so far.
   */
  readonly partialNote = computed(() => {
    if (!this.hasFilters() || !this.hasMore()) return '';
    const loaded = this.items().length;
    const q = this.query().trim();
    if (q && this.searched()[this.tab()] === q) return `Searching ${loaded} matches loaded; Load more for the rest.`;
    return `Searching ${loaded} loaded; Load more to search further.`;
  });

  /** Search all: the search is not yet the one the service answered for this tab. */
  readonly canSearchAll = computed(() => {
    const q = this.query().trim();
    return !!q && this.hasMore() && this.searched()[this.tab()] !== q;
  });

  /** The request's details, each with how its value reads. */
  readonly taskFields = computed<FieldView[]>(() => this.fieldViews(this.detail()?.subject));
  readonly requestFields = computed<FieldView[]>(() => this.fieldViews(this.request()?.subject));

  constructor() {
    // Keep the open row in view: after a click, a key, a decision or a reload re-draws the list.
    afterRenderEffect({ read: () => {
      const id = this.selectedId();
      this.shown();
      if (id == null) return;
      const row = this.host.nativeElement.querySelector<HTMLElement>(`.inbox-row.is-on`);
      if (!row) return;
      row.scrollIntoView?.({ block: 'nearest' });
      if (this.focusRow) { this.focusRow = false; row.focus({ preventScroll: true }); }
    } }, { injector: this.injector });
    // A task or request opened from the list starts at its top, where its title and decisions are.
    let top: string | null = null;
    afterRenderEffect({ write: () => {
      const open = this.tab() === 'requests' ? `r${this.request()?.id ?? ''}` : `t${this.detail()?.id ?? ''}`;
      if (open === top) return;
      top = open;
      const pane = this.host.nativeElement.querySelector<HTMLElement>('.inbox-detail');
      if (pane) pane.scrollTop = 0;
    } }, { injector: this.injector });
  }

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const path = this.route.snapshot.routeConfig?.path ?? '';
    if (path.endsWith('requests')) {
      this.tab.set('requests');
      const id = Number(params.get('id'));
      if (id) this.openRequest(id);
    }
    const task = Number(params.get('task'));
    if (task) { this.followLinkedTask = true; this.openTask(task, true); }
    this.api.colleagues().subscribe({ next: r => { if (r.status === API_SUCCESS) { this.colleagues.set(r.data ?? []); this.colleaguesLoaded.set(true); } }, error: () => {} });
    this.load();
  }

  /**
   * Every tab's first page, read afresh (Refresh, and the first load); each keeps its Search all. After a decision the
   * lists keep their loaded pages instead (refreshKeeping).
   */
  load(): void {
    this.now.set(Date.now());
    this.loading.set(true);
    this.error.set('');
    let pending = TABS.length;
    for (const tab of TABS) {
      this.readPage(tab, null, rows => {
        this.setRows(tab, rows);
        // The inbox opens on the first task, My requests on the newest.
        if (tab === 'mine' && this.selectedTask() === null && this.tab() === 'mine' && rows.length) this.openTask(rows[0].id);
        if (tab === 'requests' && this.selectedRequest() === null && this.tab() === 'requests' && rows.length) this.openRequest(rows[0].id);
      }, () => {
        if (--pending > 0) return;
        this.loading.set(false);
        if (this.followLinkedTask) { this.followLinkedTask = false; this.showLinkedTab(); }
      });
    }
    this.badge.refresh();
  }

  /** The open tab's next page, under the rows already loaded. */
  loadMore(): void {
    const tab = this.tab();
    const cursor = this.next()[tab];
    if (!cursor || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.readPage(tab, cursor, rows => this.setRows(tab, appendPage(this.rowsOf(tab), rows)), () => this.loadingMore.set(false));
  }

  /** Search all: the open tab read again by the service, its rows those matching the search (step, title, workflow). */
  searchAll(): void {
    const tab = this.tab();
    const q = this.query().trim();
    if (!q) return;
    this.searched.update(s => ({ ...s, [tab]: q }));
    this.loadingMore.set(true);
    this.readPage(tab, null, rows => this.setRows(tab, rows), () => this.loadingMore.set(false));
  }

  /** The search box: emptied, a tab read by Search all goes back to its whole list. */
  setQuery(value: string): void {
    this.query.set(value);
    if (!value.trim()) this.dropSearchAll();
  }

  private dropSearchAll(): void {
    const searched = this.searched();
    const tabs = TABS.filter(t => searched[t]);
    if (!tabs.length) return;
    this.searched.set(perTab(''));
    for (const tab of tabs) this.readPage(tab, null, rows => this.setRows(tab, rows), () => {});
  }

  /**
   * After a decision: every tab's first page read again and laid over what is loaded, so the pages a person loaded stay
   * and the task acted on leaves the open lists wherever it was (a task further down is not on the fresh first page).
   */
  private refreshKeeping(left: number | null): void {
    this.now.set(Date.now());
    const before = this.next();
    for (const tab of TABS) {
      const keep = this.rowsOf(tab);
      this.readPage(tab, null, rows => {
        const gone = tab === 'done' || tab === 'requests' ? null : left;
        const headIsAll = !this.next()[tab];
        this.setRows(tab, mergeHead(rows, keep, gone, headIsAll));
        // The old tail's cursor still starts after the last row loaded (rows that slid onto the next page are kept, and
        // Load more never draws one twice); a list that was all loaded stays so, and so does a fresh page that is all of it.
        if (!headIsAll) this.next.update(n => ({ ...n, [tab]: before[tab] }));
      }, () => {});
    }
    this.badge.refresh();
  }

  private rowsOf(tab: InboxTab): (InboxTask | RequestRow)[] {
    switch (tab) {
      case 'groups': return this.groups();
      case 'done': return this.done();
      case 'requests': return this.requests();
      default: return this.mine();
    }
  }

  private setRows(tab: InboxTab, rows: (InboxTask | RequestRow)[]): void {
    switch (tab) {
      case 'groups': this.groups.set(rows as InboxTask[]); break;
      case 'done': this.done.set(rows as InboxTask[]); break;
      case 'requests': this.requests.set(rows as RequestRow[]); break;
      default: this.mine.set(rows as InboxTask[]);
    }
  }

  /** One page of a tab (its Search all with it): the rows to take, and its next cursor recorded. */
  private readPage(tab: InboxTab, cursor: string | null, take: (rows: (InboxTask | RequestRow)[]) => void, settle: () => void): void {
    const page = { cursor, limit: this.pageSize, q: this.searched()[tab] || null };
    const read: Observable<InboxPage<InboxTask | RequestRow>> = tab === 'requests' ? this.api.requests(page) : this.api[tab](page);
    read.subscribe({
      next: r => {
        if (r.status === API_SUCCESS) {
          this.next.update(n => ({ ...n, [tab]: r.paging?.nextCursor ?? null }));
          take(r.data ?? []);
        } else {
          this.error.set(r.message || 'Your tasks could not be read.');
        }
        settle();
      },
      error: () => { this.error.set('Your tasks could not be read.'); settle(); },
    });
  }

  pick(tab: InboxTab): void {
    this.tab.set(tab);
    this.passing.set(false);
    this.pane.set('list');
    // The choices are the tab's own; a search stays, as a mail client's does across folders.
    this.statusFilter.set('');
    this.workflowFilter.set('');
    if (tab === 'requests') {
      const first = this.shownIds()[0];
      if (first && this.selectedRequest() === null) this.openRequest(first);
      return;
    }
    const first = this.shownIds()[0];
    if (first) this.openTask(first);
    else { this.selectedTask.set(null); this.detail.set(null); }
  }

  private showLinkedTab(): void {
    const id = this.selectedTask();
    if (this.tab() !== 'mine' || id == null || this.mine().some(t => t.id === id)) return;
    if (this.groups().some(t => t.id === id)) this.tab.set('groups');
    else if (this.done().some(t => t.id === id)) this.tab.set('done');
  }

  /** A row clicked: open it, and below 1024 px show it in place of the list. */
  openItem(item: ListItem): void {
    if (item.kind === 'request') this.openRequest(item.id, true);
    else this.openTask(item.id, true);
  }

  /** Back to the list, below 1024 px. */
  backToList(): void {
    this.pane.set('list');
    this.focusRow = true;
    if (this.tab() !== 'requests') {
      this.router.navigate([], { relativeTo: this.route, queryParams: { task: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
  }

  clearFilters(): void {
    this.setQuery('');
    this.statusFilter.set('');
    this.workflowFilter.set('');
  }

  /** Up and Down (or j and k) move to the next row and open it; the row keeps the focus and stays in view. */
  move(delta: number): void {
    const id = stepFrom(this.shownIds(), this.selectedId(), delta);
    if (id == null || id === this.selectedId()) return;
    this.focusRow = true;
    if (this.tab() === 'requests') this.openRequest(id);
    else this.openTask(id);
  }

  /**
   * The list's keys: / goes to the search, j and k move anywhere outside a field, the arrows move while the focus is in
   * the list, Escape leaves the search. Nothing while a dialog is open or a field has the keyboard.
   */
  onKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target?.closest('.cdk-overlay-container')) return;
    const search = this.searchBox()?.nativeElement;
    if (e.key === 'Escape' && search && target === search) { search.blur(); return; }
    if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
    if (e.key === '/') { e.preventDefault(); search?.focus(); return; }
    const inList = !!target?.closest('[data-test="inbox-list"]');
    const down = e.key === 'j' || (e.key === 'ArrowDown' && inList);
    const up = e.key === 'k' || (e.key === 'ArrowUp' && inList);
    if (!down && !up) return;
    e.preventDefault();
    this.move(down ? 1 : -1);
  }

  openTask(id: number, show = false): void {
    if (show) this.pane.set('detail');
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

  openRequest(id: number, show = false): void {
    if (show) this.pane.set('detail');
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
    const next = nextAfter(this.shownIds(), d.id);
    this.api.act(d.id, action, comment, `${d.id}:${action}:${crypto.randomUUID()}`).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status === API_SUCCESS) {
          this.toast.success(r.message);
          this.afterChange(d.id, next);
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
    const next = nextAfter(this.shownIds(), d.id);
    this.api.reassign(d.id, to, this.comment().trim() || null, `${d.id}:pass:${crypto.randomUUID()}`).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status === API_SUCCESS) {
          this.toast.success(`Passed to ${this.name(to)}.`);
          this.passing.set(false);
          this.afterChange(d.id, next);
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
        if (res.status === API_SUCCESS) { this.toast.success('Cancelled.'); this.openRequest(r.id); this.refreshKeeping(null); }
        else this.toast.error(res.message);
      },
      error: () => this.toast.error('That could not be done. Try again.'),
    });
  }

  /**
   * A decision made: on to the next task in the list, as a mail client moves on (the same one when it was the last), the
   * pages already loaded kept.
   */
  private afterChange(taskId: number, next: number | null): void {
    this.comment.set('');
    this.refreshKeeping(taskId);
    this.openTask(next ?? taskId);
  }

  /**
   * A tab's count (P2 #31): its whole list once every row is loaded (and not narrowed by Search all), else the service's
   * total, or "100+" until that count is in -- never a page size passed off as the total.
   */
  tabCount(listed: number, counted: number, complete: boolean): string {
    if (complete) return String(listed);
    return counted >= listed && counted > 0 ? counted.toLocaleString('en-US') : `${listed}+`;
  }

  private complete(tab: InboxTab): boolean {
    return !this.next()[tab] && !this.searched()[tab];
  }

  /** P2 #36: nobody else in the workspace, so a request of one's own has no one to approve it. */
  readonly aloneInWorkspace = computed(() => this.colleaguesLoaded() && !this.colleagues().some(c => c.userId !== this.me()));
  readonly mineCount = computed(() => this.tabCount(this.mine().length, this.badge.mine(), this.complete('mine')));
  readonly groupsCount = computed(() => this.tabCount(this.groups().length, this.badge.groups(), this.complete('groups')));
  readonly doneCount = computed(() => this.tabCount(this.done().length, this.badge.done(), this.complete('done')));
  readonly requestsCount = computed(() => this.tabCount(this.requests().length, this.badge.requests(), this.complete('requests')));
  readonly mineOverdue = computed(() => this.mine().some(t => t.overdue));

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
    if (t.state !== 'Open') return t.actedAt ? 'Acted ' + shortTime(t.actedAt) : '';
    if (!t.dueAt) return 'No due time';
    return (t.overdue ? 'Overdue · was due ' : 'Due ') + shortTime(t.dueAt);
  }

  /** A title's name and trailing reference (#1016), for a heading that wraps the name but never the reference. */
  refOf(title: string | null | undefined): { name: string; ref: string } {
    return splitRef(title ?? '');
  }

  when(iso: string | null | undefined): string {
    return shortTime(iso);
  }

  /** "5 min ago", "Yesterday, 14:05": a history line's time; the exact one is its tooltip. */
  ago(iso: string | null | undefined): string {
    return relativeTime(iso, this.now());
  }

  exact(iso: string | null | undefined): string {
    return exactTime(iso);
  }

  /** A status's dot, in the status pill's families. */
  toneOf(status: string): RowTone {
    switch (status) {
      case 'Overdue': case 'Rejected': case 'Failed': return 'crit';
      case 'Pending': case 'Changes asked': case 'Waiting': return 'warn';
      case 'Approved': case 'Done': case 'Completed': return 'ok';
      case 'Running': return 'brand';
      default: return 'neutral';
    }
  }

  private taskItem(t: InboxTask, now: number): ListItem {
    const status = this.stateLabel(t);
    const open = t.state === 'Open';
    const at = open ? t.dueAt : t.actedAt;
    const people = [this.holder(t), this.name(t.requestedBy), this.name(t.actedBy), t.standingInFor ? this.name(t.standingInFor) : '']
      .filter(p => p && p !== 'the workflow');
    const common = this.common();
    const sub = [common.step ? '' : t.name, common.workflow ? '' : t.workflowName, t.standingInFor ? `for ${this.name(t.standingInFor)}` : '']
      .filter(Boolean).join(' · ');
    const title = t.requestTitle || t.name;
    return {
      id: t.id, kind: 'task', title, ...splitRef(title), sub, status, tone: this.toneOf(status),
      time: at ? (open ? 'Due ' : '') + compactTime(at, now, undefined, true) : '',
      timeTitle: at ? (open ? 'Due ' : 'Acted ') + exactTime(at) : '',
      crit: open && !!t.overdue, workflow: t.workflowName ?? '',
      group: open ? dueGroup(t.dueAt, t.overdue, now) : pastGroup(t.actedAt, now),
      haystack: [t.requestTitle, t.name, t.workflowName, ...people].join(' ').toLowerCase(),
    };
  }

  private requestItem(r: RequestRow, now: number): ListItem {
    const at = r.startedAt ?? r.endedAt;
    const sub = this.common().workflow ? '' : r.workflowName;
    return {
      id: r.id, kind: 'request', title: r.title, ...splitRef(r.title), sub, status: r.state, tone: this.toneOf(r.state),
      time: compactTime(at, now, undefined, true), timeTitle: at ? 'Started ' + exactTime(at) : '', crit: false, workflow: r.workflowName,
      group: pastGroup(at, now), haystack: [r.title, r.workflowName, r.currentStep, this.name(r.requestedBy)].join(' ').toLowerCase(),
    };
  }

  private fieldViews(subject: Record<string, unknown> | undefined | null): FieldView[] {
    return this.fields(subject).map(f => ({ ...f, view: valueKind(f.value) }));
  }

  stateLabel(t: InboxTask): string {
    if (t.state === 'Open') return t.overdue ? 'Overdue' : 'Pending';
    return t.state === 'ChangesRequested' ? 'Changes asked' : t.state;
  }

  /**
   * The subject's fields as label and value, the way a person reads them (UI review U10, U14): a yes/no answer says
   * Yes or No rather than true or false, and a person's username (Submitted by) reads as their name.
   */
  fields(subject: Record<string, unknown> | undefined | null): { label: string; value: string }[] {
    if (!subject) return [];
    return Object.entries(subject)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => ({ label: labelOf(k), value: this.valueText(v) }));
  }

  private valueText(v: unknown): string {
    if (typeof v === 'boolean' || v === 'true' || v === 'false') return v === true || v === 'true' ? 'Yes' : 'No';
    if (typeof v === 'object') return JSON.stringify(v);
    const text = String(v);
    // The colleague list first: it carries the directory's full name, where the session may hold only the username.
    const person = this.colleagues().find(c => c.username === text);
    if (person?.fullName) return person.fullName;
    const me = this.auth.user();
    return me?.username && text === me.username && me.fullName ? me.fullName : text;
  }
}
