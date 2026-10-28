import { RunReviewCard } from './run-review-card';
import { PipelineApprovalCard } from './pipeline-approval-card';
import { ReportReviewCard, STUDIO_SUBJECT_TYPES, studioSubject } from './report-review-card';
import { Avatar } from '../../shared/ui/avatar';
import { Component, ElementRef, Injector, OnInit, afterRenderEffect, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../core/api/api.config';
import { TeamsApi } from '../../core/teams/teams.api';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';
import { StatusPill } from '../../shared/ui/status-pill';
import { Combobox, ComboboxOption } from '../../shared/ui/combobox';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { Dialog } from '@angular/cdk/dialog';
import { Observable } from 'rxjs';
import { Colleague, Decision, HistoryEvent, InboxPage, InboxTask, RequestDetail, RequestRow, StartableWorkflow, TaskDetail, WorkflowsApi, CANNOT_ACT } from './workflows.api';
import { HistoryLine, compactTime, dropOwnStep, exactTime, historyLines, relativeTime, shortTime, stepLabel } from './history';
import { TaskCountService } from './task-count.service';
import { ListItem, RowTone, appendPage, choicesOf, commonOf, dueGroup, groupRows, matchesSearch, mergeHead, nextAfter, pastGroup, splitRef, stepFrom } from './inbox-list';
import { RequestDataView } from './request-data-view';
import { PersonalDataBar } from './personal-data-bar';
import { RequestDataContext, RequestEntry, entryText, requestContext, requestData, stepNamesOf } from './request-data';
import { PageHeader } from '../../shared/ui/page-header';
import { RefreshButton } from '../../shared/ui/refresh-button';
import { BulkBar } from '../../shared/ui/bulk/bulk-bar';
import { BulkReviewApi } from '../../shared/ui/bulk/bulk-review.api';
import { BULK_CAP, BulkAnswer, BulkMatch, BulkSelection } from '../../shared/ui/bulk/bulk.model';

export type InboxTab = 'mine' | 'teams' | 'done' | 'requests';

/** A page of a tab's list: the workflow service's Inbox.DEFAULT_LIMIT (it pages by cursor, at most 200 at a time). */
export const INBOX_PAGE_SIZE = 100;

const TABS: InboxTab[] = ['mine', 'teams', 'done', 'requests'];
type PerTab<T> = Record<InboxTab, T>;
const perTab = <T>(value: T): PerTab<T> => ({ mine: value, teams: value, done: value, requests: value });

/**
 * The Task inbox (MIG-276), laid out as a mail client (owner, 2026-10-06): tabs over two panes that fill the screen and
 * scroll on their own -- the list, searchable and filtered, under day headers; the task with its decisions straight
 * under its title, the request's details and its history -- and My requests, where a requester follows (and may cancel)
 * what they started. Below 1024 px the list takes the width and a task opens over it, with a way back. Every decision
 * carries an Idempotency-Key; whether the reader may make it is the server's, per task.
 */
@Component({
  selector: 'app-task-inbox',
  imports: [RunReviewCard, PipelineApprovalCard, ReportReviewCard, RequestDataView, PersonalDataBar, RefreshButton, PageHeader, FormsModule, NgTemplateOutlet, RouterLink, Icon, StatusPill, Combobox, Avatar, BulkBar],
  templateUrl: './task-inbox.html',
  host: { '(document:keydown)': 'onKey($event)' },
  styles: `
    /* Bulk review: an approval task's row with its checkbox before it; the row's own button keeps the click. */
    .inbox-pick-row { display: flex; align-items: stretch; border-bottom: 1px solid var(--border-subtle); }
    .inbox-pick-row > .inbox-row { flex: 1 1 auto; min-width: 0; border-bottom: 0; padding-left: 0.5rem; }
    .inbox-pick-row.is-picked { background: var(--surface-sunken); }
    .inbox-pick-cell { flex: none; display: flex; align-items: flex-start; padding: 0.75rem 0 0 0.85rem; width: 2.15rem; }
    .inbox-pick-all { display: inline-flex; align-items: center; gap: 0.4rem; white-space: nowrap; }
  `,
})
export class TaskInbox implements OnInit {
  private readonly api = inject(WorkflowsApi);
  readonly auth = inject(AuthService);
  private readonly teamsApi = inject(TeamsApi);
  /** F4: the workspace's team names by id, for "With Wound care" on a team's task. */
  readonly teamNames = signal<Map<string, string>>(new Map());
  /**
   * F3 (MIG-400): My requests is a tab of its own (task-inbox:requests); a person granted the inbox's other tabs only is
   * never shown it, and its list -- refused to them -- is not read.
   */
  readonly showsRequests = computed(() => { this.auth.pageKeys?.(); return this.auth.canOpenTab?.('task-inbox', 'task-inbox:requests') ?? true; });
  private tabs(): InboxTab[] {
    return this.showsRequests() ? TABS : TABS.filter(t => t !== 'requests');
  }
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly badge = inject(TaskCountService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly tab = signal<InboxTab>('mine');
  readonly mine = signal<InboxTask[]>([]);
  readonly teams = signal<InboxTask[]>([]);
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

  // ---- bulk review (2026-10-12) -----------------------------------------------------------------------------------

  /** Waiting for me and My teams pick approval tasks for a bulk decision; Done and My requests have nothing to decide. */
  readonly canPick = computed(() => this.tab() === 'mine' || this.tab() === 'teams');
  readonly taskById = computed(() => new Map(this.rows().map(t => [t.id, t])));
  /** The approval tasks shown that the reader may decide: the page Select all picks. */
  readonly pagePicks = computed<InboxTask[]>(() => {
    if (!this.canPick()) return [];
    const byId = this.taskById();
    return this.shown().map(i => byId.get(i.id)).filter((t): t is InboxTask => !!t && this.pickable(t));
  });
  readonly bulk = new BulkSelection<InboxTask>({
    idOf: t => t.id,
    noun: ['task', 'tasks'],
    groupNoun: 'workflow',
    matching: () => this.matchingTasks(),
    // Looked up when sent: the screen's tests stand in their own WorkflowsApi and no HTTP client.
    send: (rows, request) => this.injector.get(BulkReviewApi).tasks({ taskIds: rows.map(t => t.id) }, request),
  });
  readonly pageState = computed(() => this.bulk.pageState(this.pagePicks()));

  readonly rows = computed<InboxTask[]>(() => {
    switch (this.tab()) {
      case 'teams': return this.teams();
      case 'done': return this.done();
      default: return this.mine();
    }
  });

  /** Whom a task may be passed to: listed all, and someone who cannot open the inbox (a read-only viewer) marked and never picked. */
  readonly colleagueOptions = computed<ComboboxOption[]>(() => this.colleagues()
    .filter(c => c.userId !== this.me())
    .map(c => c.canAct === false ? { value: String(c.userId), label: c.fullName || c.username, hint: CANNOT_ACT, disabled: true }
      : { value: String(c.userId), label: c.fullName || c.username, hint: c.username }));

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
    return d ? dropOwnStep(historyLines(d.history, id => this.historyName(id), key => this.stepName(key, d.tasks, d.history)),
      stepLabel(d.name, d.stepKey)) : [];
  });

  readonly requestHistory = computed<HistoryLine[]>(() => {
    const r = this.request();
    return r ? historyLines(r.history, id => this.historyName(id), key => this.stepName(key, r.tasks, r.history)) : [];
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
      case 'teams': return this.badge.teams();
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

  /** The request's data as a person reads it (request-data.ts): a run's outcome, a decision, each value by its shape. */
  readonly taskFields = computed<RequestEntry[]>(() => requestData(this.detail()?.subject,
    { ...this.dataContext(this.detail()?.history), fields: this.detail()?.subjectFields }));
  readonly requestFields = computed<RequestEntry[]>(() => requestData(this.request()?.subject,
    { ...this.dataContext(this.request()?.history), fields: this.request()?.subjectFields }));
  /** ZT-I34: a Show of personal data in flight. */
  readonly showing = signal(false);

  constructor() {
    // A selection belongs to the list it was made from: another tab, search or filter starts it again.
    effect(() => {
      this.tab(); this.query(); this.statusFilter(); this.workflowFilter();
      untracked(() => this.bulk.clear());
    });
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

  /** A sign-in with no workspace of its own (a platform administrator's): tasks are a workspace's, so nothing is read. */
  readonly noWorkspace = computed(() => !this.auth.user()?.tenantId);

  ngOnInit(): void {
    if (this.noWorkspace()) { this.loading.set(false); return; }
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
    this.teamsApi.list().subscribe({
      next: r => { if (r.status === API_SUCCESS) this.teamNames.set(new Map((r.data ?? []).map(t => [String(t.teamId), t.name]))); },
      error: () => {},
    });
    this.load();
  }

  /**
   * Every tab's first page, read afresh (Refresh, and the first load); each keeps its Search all. After a decision the
   * lists keep their loaded pages instead (refreshKeeping).
   */
  load(): void {
    if (this.noWorkspace()) return;
    this.now.set(Date.now());
    this.loading.set(true);
    this.error.set('');
    const tabs = this.tabs();
    let pending = tabs.length;
    for (const tab of tabs) {
      this.readPage(tab, null, rows => {
        this.setRows(tab, rows);
        // The inbox opens on the first task, My requests on the newest.
        if (tab === 'mine' && this.selectedTask() === null && this.tab() === 'mine' && rows.length) this.openTask(rows[0].id);
        if (tab === 'requests' && this.selectedRequest() === null && this.tab() === 'requests' && rows.length) this.openRequest(rows[0].id);
      }, () => {
        if (--pending > 0) return;
        this.loading.set(false);
        if (this.followLinkedTask) { this.followLinkedTask = false; this.showLinkedTab(); }
        else if (this.firstLoad) this.openWhereTheWorkIs();
        this.firstLoad = false;
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
    const tabs = this.tabs().filter(t => searched[t]);
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
    for (const tab of this.tabs()) {
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
      case 'teams': return this.teams();
      case 'done': return this.done();
      case 'requests': return this.requests();
      default: return this.mine();
    }
  }

  private setRows(tab: InboxTab, rows: (InboxTask | RequestRow)[]): void {
    switch (tab) {
      case 'teams': this.teams.set(rows as InboxTask[]); break;
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

  /** The first load only: a Refresh or a decision never moves the reader off the tab they chose. */
  private firstLoad = true;

  /**
   * UX review 2026-10-12 (W1): the inbox opens on the tab with work. A reviewer whose tasks all wait in their team's pool
   * opened on an empty "Waiting for me" saying "Nothing is waiting for you" while My teams held five. When Mine is empty
   * and My teams is not, it opens My teams on its first task; a link to a task or to My requests decides for itself.
   */
  private openWhereTheWorkIs(): void {
    if (this.tab() !== 'mine' || this.mine().length || !this.teams().length) return;
    this.pick('teams');
  }

  private showLinkedTab(): void {
    const id = this.selectedTask();
    if (this.tab() !== 'mine' || id == null || this.mine().some(t => t.id === id)) return;
    if (this.teams().some(t => t.id === id)) this.tab.set('teams');
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

  /**
   * ZT-S2: My requests > New request. A person who makes requests starts one of the workflows they may start (published,
   * active, the workspace's own, started by a person) with a title and what it is about -- the subject's fields, as names and
   * values. Through the task inbox, so the workflow designer's page is not needed; editing a workflow stays the designer's.
   */
  readonly newOpen = signal(false);
  readonly startableWorkflows = signal<StartableWorkflow[] | null>(null);
  readonly newKey = signal('');
  readonly newTitle = signal('');
  readonly newFields = signal<{ name: string; value: string }[]>([{ name: '', value: '' }]);
  readonly newBusy = signal(false);
  readonly newError = signal('');
  private newIdempotency = '';

  openNew(): void {
    this.newOpen.set(true);
    this.newError.set('');
    this.newIdempotency = `new-request-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    this.api.startable().subscribe({
      next: r => {
        const list = r.status === API_SUCCESS ? r.data ?? [] : [];
        this.startableWorkflows.set(list);
        if (!list.some(w => w.key === this.newKey())) this.newKey.set(list[0]?.key ?? '');
        if (r.status !== API_SUCCESS) this.newError.set(r.message || 'The workflows you may start could not be read.');
      },
      error: () => { this.startableWorkflows.set([]); this.newError.set('The workflows you may start could not be read. Try again.'); },
    });
  }

  closeNew(): void {
    this.newOpen.set(false);
  }

  setNewField(index: number, part: 'name' | 'value', value: string): void {
    this.newFields.update(fields => fields.map((f, i) => i === index ? { ...f, [part]: value } : f));
  }

  addNewField(): void {
    this.newFields.update(fields => [...fields, { name: '', value: '' }]);
  }

  removeNewField(index: number): void {
    this.newFields.update(fields => fields.length > 1 ? fields.filter((_, i) => i !== index) : [{ name: '', value: '' }]);
  }

  /** The subject's fields: each named one, a number where its value reads as one. */
  newSubject(): Record<string, unknown> {
    const subject: Record<string, unknown> = {};
    for (const f of this.newFields()) {
      const name = f.name.trim();
      if (!name) continue;
      const value = f.value.trim();
      subject[name] = value !== '' && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
    }
    return subject;
  }

  submitNew(): void {
    const key = this.newKey();
    if (!key) { this.newError.set('Pick the workflow to start.'); return; }
    this.newBusy.set(true);
    this.newError.set('');
    this.api.newRequest({ definitionKey: key, title: this.newTitle().trim() || undefined, subject: this.newSubject() }, this.newIdempotency).subscribe({
      next: r => {
        this.newBusy.set(false);
        if (r.status !== API_SUCCESS) { this.newError.set(r.message || 'The request could not be started.'); return; }
        this.toast.success(r.message || 'Request started.');
        this.newOpen.set(false);
        this.newTitle.set('');
        this.newFields.set([{ name: '', value: '' }]);
        this.load();
        if (r.data?.id) this.openRequest(r.data.id, true);
      },
      error: (e: { error?: { message?: string } }) => {
        this.newBusy.set(false);
        this.newError.set(e?.error?.message || 'The request could not be started.');
      },
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

  /**
   * ZT-I34: reads the open task (or request) again with its personal data shown -- for someone holding See personal data;
   * workflow-service writes the showing in its history -- or, with show false, hidden again.
   */
  showPersonal(show: boolean): void {
    const onRequests = this.tab() === 'requests';
    const id = onRequests ? this.selectedRequest() : this.selectedTask();
    if (id == null || this.showing()) return;
    this.showing.set(true);
    const done = () => this.showing.set(false);
    const failed = (message?: string) => { done(); this.toast.error(message || 'Personal data could not be shown.'); };
    if (onRequests) {
      this.api.request(id, show).subscribe({
        next: r => { done(); if (r.status === API_SUCCESS && r.data && this.selectedRequest() === id) this.request.set(r.data); else if (r.status !== API_SUCCESS) failed(r.message); },
        error: e => failed(e?.error?.message),
      });
    } else {
      this.api.task(id, show).subscribe({
        next: r => { done(); if (r.status === API_SUCCESS && r.data && this.selectedTask() === id) this.detail.set(r.data); else if (r.status !== API_SUCCESS) failed(r.message); },
        error: e => failed(e?.error?.message),
      });
    }
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
  readonly teamsCount = computed(() => this.tabCount(this.teams().length, this.badge.teams(), this.complete('teams')));
  /** Whether anything waits for the reader's teams: the empty "Waiting for me" tab then points there (G10, W1). */
  readonly teamsWaiting = computed(() => this.teams().length > 0 || this.badge.teams() > 0);
  readonly doneCount = computed(() => this.tabCount(this.done().length, this.badge.done(), this.complete('done')));
  readonly requestsCount = computed(() => this.tabCount(this.requests().length, this.badge.requests(), this.complete('requests')));
  readonly mineOverdue = computed(() => this.mine().some(t => t.overdue));

  /** An approval task, open, not the reader's own request: theirs to decide, so theirs to pick. */
  pickable(t: InboxTask): boolean {
    return t.stepType === 'approval' && t.state === 'Open' && t.requestState !== 'Approved' && !(t.requestedBy != null && t.requestedBy === this.me())
      && !this.decidedInStudio(t);
  }

  /**
   * Report Studio phase 7: a report waiting for approval, a template's publish request, a signature waiting for approval --
   * decided in its review card through Report Studio (it signs what is approved), never by the inbox's own buttons or bulk.
   */
  decidedInStudio(t: { subjectType?: string | null; subjectId?: string | null }): boolean {
    return STUDIO_SUBJECT_TYPES.includes(t.subjectType ?? '') || studioSubject(t.subjectId) !== null;
  }

  /** The review card told us the decision is made: say so, and move on as after any decision. */
  onStudioDecided(taskId: number, message: string): void {
    this.toast.success(message);
    this.afterChange(taskId, nextAfter(this.shownIds(), taskId));
  }

  /** Why an approval task's checkbox is off. */
  pickTitle(t: InboxTask | undefined): string {
    if (!t || this.pickable(t)) return '';
    if (t.requestedBy != null && t.requestedBy === this.me()) return 'Your own request: someone else decides it.';
    if (this.decidedInStudio(t)) return 'Decided in its review card: Report Studio signs what is approved.';
    return 'No longer waiting for a decision.';
  }

  pickTask(id: number, box: HTMLInputElement): void {
    const t = this.taskById().get(id);
    if (!t) return;
    if (!this.bulk.toggle(t, box.checked)) {
      box.checked = false;
      this.toast.error(`At most ${BULK_CAP} at a time.`);
    }
  }

  /**
   * Select all matching: the open tab read again by the service with the same search, a hundred at a time, its approval
   * tasks the reader may decide under the same status and workflow filters, until there are more than the cap or none is
   * left (twenty pages at most). The total is known only when the list ran out.
   */
  private matchingTasks(): Observable<BulkMatch<InboxTask>> {
    const tab = this.tab() === 'teams' ? 'teams' : 'mine';
    const q = this.query().trim() || null;
    const status = this.statusFilter();
    const workflow = this.workflowFilter();
    const keep = (t: InboxTask) => this.pickable(t) && (!status || this.stateLabel(t) === status) && (!workflow || (t.workflowName ?? '') === workflow);
    return new Observable<BulkMatch<InboxTask>>(out => {
      const found = new Map<number, InboxTask>();
      let pages = 0;
      let reading: { unsubscribe(): void } | undefined;
      const read = (cursor: string | null) => {
        reading = this.api[tab]({ cursor, limit: INBOX_PAGE_SIZE, q }).subscribe({
          next: r => {
            if (r.status !== API_SUCCESS) { out.error({ error: { message: r.message || 'The matching tasks could not be read.' } }); return; }
            for (const t of r.data ?? []) if (keep(t)) found.set(t.id, t);
            const next = r.paging?.nextCursor ?? null;
            pages++;
            if (found.size > BULK_CAP || !next || pages >= 20) {
              out.next({ rows: [...found.values()].slice(0, BULK_CAP), total: next ? null : found.size });
              out.complete();
            } else {
              read(next);
            }
          },
          error: err => out.error(err),
        });
      };
      read(null);
      return () => reading?.unsubscribe();
    });
  }

  /** A bulk decision made: the decided tasks leave the lists, the rest is read again, and a decided open task moves on. */
  bulkDecided(answer: BulkAnswer): void {
    const done = new Set(answer.done.map(i => Number(i.id)));
    if (!done.size) { this.refreshKeeping(null); return; }
    const open = this.selectedTask();
    const next = open != null && done.has(open) ? this.shownIds().find(id => !done.has(id)) ?? null : open;
    this.mine.update(list => list.filter(t => !done.has(t.id)));
    this.teams.update(list => list.filter(t => !done.has(t.id)));
    this.refreshKeeping(null);
    if (open != null && done.has(open)) {
      if (next != null) this.openTask(next);
      else { this.selectedTask.set(null); this.detail.set(null); }
    }
  }

  // ---- words ------------------------------------------------------------------------------------------------------

  name(id: number | null | undefined): string {
    if (id == null) return 'the workflow';
    if (id === this.me()) return 'you';
    const c = this.colleagues().find(x => x.userId === id);
    return c ? (c.fullName || c.username) : `user ${id}`;
  }

  /** Owner 2026-10-21: in a history, the signed-in person by name with "(you)", so a screenshot or an export says who it was. */
  historyName(id: number | null | undefined): string {
    if (id != null && id === this.me()) {
      // ZT-I34 polish: the directory's name first -- a session may hold only the username as its "full name".
      const mine = this.colleagues().find(x => x.userId === id)?.fullName || this.auth.user()?.fullName;
      if (mine) return `${mine} (you)`;
    }
    return this.name(id);
  }

  /** A step by its name: its task's, else the one the engine entered it with (a run, a condition), else its key. */
  stepName(key: string | null | undefined, tasks: { stepKey: string; name: string }[], history?: HistoryEvent[] | null): string {
    if (!key) return 'The request';
    const base = key.endsWith('#changes') ? key.slice(0, -'#changes'.length) : key;
    const t = tasks.find(x => x.stepKey === key) ?? tasks.find(x => x.stepKey === base);
    // Task 2769: a step named only by its key ("manager") reads as words ("Manager").
    return stepLabel(t ? t.name : stepNamesOf(history).get(base), base);
  }

  holder(t: InboxTask): string {
    if (t.assigneeUserId != null) return this.name(t.assigneeUserId);
    if (t.assigneeKind === 'role') return t.assigneeValue === 'TENANT_ADMIN' ? 'Administrators' : 'Any member';
    // ZT-R16 / F4: a task in My teams is for one of the reader's own teams, named ("With Wound care"), never a bare "Team".
    if (t.assigneeKind === 'team') return this.teamNames().get(String(t.assigneeValue)) ?? 'a team';
    return 'someone';
  }

  dueLabel(t: InboxTask): string {
    if (t.state !== 'Open') return t.actedAt ? 'Acted ' + shortTime(t.actedAt) : '';
    if (!t.dueAt) return 'No due time';
    return (t.overdue ? 'Overdue · was due ' : 'Due ') + shortTime(t.dueAt);
  }

  /** A task's step as people read it: its name, or its key in words (task 2769: "manager" reads "Manager"). */
  stepOf(t: { name?: string | null; stepKey?: string | null }): string {
    return stepLabel(t.name, t.stepKey);
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
    const sub = [common.step ? '' : stepLabel(t.name, t.stepKey), common.workflow ? '' : t.workflowName, t.standingInFor ? `for ${this.name(t.standingInFor)}` : '']
      .filter(Boolean).join(' · ');
    const title = t.requestTitle || stepLabel(t.name, t.stepKey);
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

  /** A pipeline step's approval (the "approval" step pausing a run): its subject is the step's, "pipeline-approval:<run>". */
  stepApproval(d: { subjectId?: string | null; subject?: Record<string, unknown> | null }): boolean {
    return /^pipeline-approval:\d+$/.test(d.subjectId ?? '') || (d.subject?.['approvalId'] != null && d.subject?.['stepKey'] != null);
  }

  /** The run a "Pipeline run review" task is about, from its subject ("pipeline-run:8517" and the run's own fields). */
  runOf(d: { subjectId?: string | null; subject?: Record<string, unknown> | null }): { jobQueueId: number; attempt: number; link: string | null } | null {
    const fromId = /^pipeline-run:(\d+)$/.exec(d.subjectId ?? '');
    const subject = d.subject ?? {};
    const id = Number(subject['jobQueueId'] ?? (fromId ? fromId[1] : NaN));
    if (!Number.isFinite(id) || id <= 0) return null;
    const attempt = Number(subject['attempt'] ?? 1) || 1;
    const link = typeof subject['link'] === 'string' && (subject['link'] as string).startsWith('/') ? subject['link'] as string : null;
    return { jobQueueId: id, attempt, link };
  }

  stateLabel(t: InboxTask): string {
    if (t.state === 'Open') return t.overdue ? 'Overdue' : 'Pending';
    return t.state === 'ChangesRequested' ? 'Changes asked' : t.state;
  }

  /**
   * The subject's fields as label and value, the way a person reads them (UI review U10, U14): a yes/no answer says
   * Yes or No rather than true or false, a person's username (Submitted by) reads as their name, a run's outcome and a
   * decision as their line (request-data.ts). A step's assignee ({kind, value}) is the workflow's routing, already shown as
   * the "With ..." chip (QA 2026-10-20), and never a field.
   */
  fields(subject: Record<string, unknown> | undefined | null): { label: string; value: string }[] {
    return requestData(subject, this.dataContext()).map(e => ({ label: e.label, value: entryText(e) }));
  }

  /** What the request's data is read with: the colleague directory for names, the history for a run's step. */
  private dataContext(history?: HistoryEvent[] | null): RequestDataContext {
    return requestContext(this.colleagues(), this.auth, history);
  }
}
