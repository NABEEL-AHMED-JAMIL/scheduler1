import { WorkspaceSelect } from '../../../shared/ui/workspace-select';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { Component, OnInit, WritableSignal, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { LIST_LIMIT, isProbablyTruncated } from '../../../core/api/list-limit';
import { AuthService } from '../../../core/auth/auth.service';
import { MineFilter } from '../../../shared/ui/mine-filter';
import { createPager } from '../../../shared/ui/pager';
import { Pagination } from '../../../shared/ui/pagination';
import { createTopicSearch } from '../../../shared/ui/topic-search';
import { TableShell } from '../../../shared/ui/data-table';
import { StatTile } from '../../../shared/ui/stat-tile';
import { Icon } from '../../../shared/ui/icon';
import { ManagedBanner } from '../../../shared/ui/managed-banner';
import { Combobox } from '../../../shared/ui/combobox';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { StepsApi } from '../../tasks/steps/steps.service';
import { StepTaskEntry, withSwitchedLine } from '../../tasks/steps/steps.model';
import { TaskStatePill, TaskSwitch } from '../../tasks/steps/task-switch';
import { Pipeline, PipelineField } from '../pipelines/pipeline.model';
import { askReason } from '../../../shared/ui/reason';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { setByWords } from '../../ai/assistant/assistant.model';
import { TaskChange, TaskControlState, TaskUsage, UsageCount, changeWords, usageById } from '../../tasks/steps/task-usage.model';
import { TaskUsagePanel, TaskUsagePanelData } from './task-usage-panel';
import { isOwnPlatformSignIn } from '../../../core/auth/workspace-data';
import { TaskPanel, TaskPanelData, TaskPanelResult } from './task-panel';
import { REGISTRY_KINDS, RegistryRow, TASK_STATES, filterRows, kindCounts, registryRows } from './task-registry.model';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';

/** The whole scope's pipeline numbers, from pipeline.json/list, whatever filter is on. */
interface PipelineSummary { total: number; active: number; fields: number; topics: number; untopped: number; }
const EMPTY_SUMMARY: PipelineSummary = { total: 0, active: 0, fields: 0, topics: 0, untopped: 0 };

/**
 * Configuration › Task Registry (MIG-250; was Configuration › Pipelines): every task a pipeline's steps can run, from
 * Core's registry (GET pipeline.json/steps/tasks, MIG-231), and every existing pipeline as a Legacy task. A row opens
 * its side panel (TaskPanel): the task's settings, input and output, retry, timeout, permission, AI tool name and
 * backing service, and a workspace administrator's switch.
 *
 * The Legacy rows ARE the old pipelines list: pipeline.json/list's rows, each carrying the registry's legacy line for
 * it. Owner #18 (2026-10-19): New, Edit and Duplicate open the registry task's own page (/settings/task-registry/new,
 * /<key>, new?copyOf=<key>), which saves the same request the dialog did (legacy-save.golden.ts). Topic, workspace and
 * "Only mine" narrow the pipelines on the server; kind, state and search narrow every row here.
 *
 * Owner #16: a platform administrator picks the workspace (the shared selector) and controls each step task for it --
 * Default, Enabled, Disabled or Blocked (steps/tasks/platformState); a workspace administrator sees a blocked task
 * locked, with who blocked it and why. Recent changes is the audit (steps/tasks/history).
 * Owner #17: each row says how many pipelines use it and how many runs they had this month (steps/tasks/usage, counted
 * by Core in the caller's workspace); a count opens the list behind it in a drawer (TaskUsagePanel).
 */
@Component({
  selector: 'app-task-registry',
  imports: [WorkspaceSelect, RefreshButton, PageHeader, MineFilter, StatTile, TableShell, TaskStatePill, TaskSwitch, Icon, CdkMenu, CdkMenuItem, CdkMenuTrigger, RouterLink, Combobox, Pagination, ManagedBanner, ServerTimePipe],
  templateUrl: './task-registry.html',
})
export class TaskRegistry implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = inject(StepsApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router, { optional: true });
  /** MIG-254 (owner 2026-09-29): a MANAGED workspace's registry is our team's -- shown, not changed. */
  readonly locked = computed(() => this.auth.builderLocked());

  readonly kinds = REGISTRY_KINDS;
  readonly states = TASK_STATES;

  /** The registry as Core sent it: step tasks, and legacy lines. */
  readonly tasks = signal<StepTaskEntry[]>([]);
  readonly tasksLoading = signal(true);
  readonly tasksError = signal('');

  /** The pipelines, whole (up to LIST_LIMIT): the Legacy rows. */
  readonly forms = signal<Pipeline[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly summary = signal<PipelineSummary>(EMPTY_SUMMARY);
  readonly truncated = computed(() => isProbablyTruncated(this.forms().length));

  // ---- filters ------------------------------------------------------------------------------------------------
  readonly kindFilter = signal('');
  readonly stateFilter = signal('');
  readonly search = signal('');
  /** The topic, workspace and "Only mine" filters are the pipelines' own: they ask the server again. */
  readonly topicFilter = signal('');
  readonly tenantFilter = signal(String(inject(WorkspaceDirectory).remembered() ?? ''));
  readonly onlyMine = signal(false);
  readonly tenants = signal<{ tenantId: number; tenantName: string; tenantCode?: string }[]>([]);
  readonly topicSearch = createTopicSearch(this.http);
  readonly topicFilterOptions = computed(() => {
    const rows = this.topicSearch.options();
    return this.summary().untopped ? [...rows, { value: 'none', label: 'No topic', hint: 'pipelines still to be assigned' }] : rows;
  });
  readonly topicSelectedLabel = computed(() => this.topicFilter() === 'none' ? 'No topic' : this.topicSearch.selectedLabel());
  /**
   * A pipeline-only filter is on: the step tasks have no topic or author, so they step aside. Owner #16: the workspace is
   * not one of them any more -- for a platform administrator it is whose registry, switches and counts the page shows.
   */
  readonly pipelinesOnly = computed(() => !!this.topicFilter() || this.onlyMine());

  setFilter(which: WritableSignal<string> | WritableSignal<boolean>, value: string | boolean): void {
    (which as WritableSignal<string | boolean>).set(value);
    this.pager.reset();
  }

  readonly hasFilters = computed(() => !!this.kindFilter() || !!this.stateFilter() || !!this.search().trim() || this.pipelinesOnly());
  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());
  /**
   * ZT-A12 follow-up (owner 2026-10-21, "Managed session only"): the platform administrator's own sign-in sees the
   * registry, its switches and its counts, and not a workspace's pipelines -- the Legacy rows (pipeline.json/list) and
   * the lists behind a count are a workspace's data, shown in "Work in this workspace".
   */
  readonly ownSignIn = computed(() => isOwnPlatformSignIn(this.auth));
  /** Switches the workspace's tasks, as on the step builder's Settings tab (Core refuses anyone else). */
  readonly isWorkspaceAdmin = computed(() => this.auth.isTenantAdmin());
  /**
   * UX review 2026-10-12 (B2, P7, P8): the workspace's task switches live here, on each step task's row -- not on one
   * pipeline's Settings tab. A legacy row is a pipeline, never switched.
   */
  readonly canSwitch = computed(() => this.isWorkspaceAdmin() && !this.isPlatformAdmin() && !this.locked());
  /** Owner #16: a platform administrator controls a task for the workspace chosen in the shared selector. */
  readonly chosenTenant = computed(() => (this.isPlatformAdmin() && this.tenantFilter() ? Number(this.tenantFilter()) : null));
  readonly canControl = computed(() => this.chosenTenant() != null);
  readonly controlling = signal<string | null>(null);

  // ---- owner #17: usage counts ------------------------------------------------------------------------------------
  readonly usage = signal<TaskUsage | null>(null);
  readonly usageError = signal('');
  readonly usageOf = computed(() => usageById(this.usage()));
  /** The month the runs are counted for, as the column says it ("Runs in Oct"). */
  readonly monthLabel = computed(() => {
    const m = this.usage()?.month;
    if (!m) return '';
    const [y, mm] = m.split('-').map(Number);
    return new Date(Date.UTC(y, mm - 1, 15)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  });
  readonly runsHeading = computed(() => (this.monthLabel() ? `Runs in ${this.monthLabel()}` : 'Runs this month'));
  /** Whether Core answered the counts: until then (or when it could not) a count is not known, not zero. */
  readonly countsKnown = computed(() => this.usage() !== null);
  countOf(row: RegistryRow): UsageCount {
    return this.usageOf().get(row.id) ?? { pipelines: 0, runs: 0 };
  }

  // ---- owner #16: the audit -----------------------------------------------------------------------------------------
  readonly changes = signal<TaskChange[]>([]);
  readonly switching = signal<string | null>(null);

  /** Switches a task on or off in this workspace, or (null) back to its default; the row shows Core's answer. */
  switchTask(task: StepTaskEntry, enabled: boolean | null): void {
    if (!this.canSwitch() || this.switching()) return;
    this.switching.set(task.code);
    this.api.switchTask(task.code, enabled).subscribe({
      next: r => {
        this.switching.set(null);
        if (r.status !== API_SUCCESS) { this.toast.error(r.message || 'The task could not be switched.'); this.tasks.update(list => [...list]); return; }
        this.toast.success(r.message || 'Switched.');
        const line = r.data;
        if (line?.code) this.tasks.update(list => withSwitchedLine(list, line));
        else this.loadTasks();
        this.loadChanges();
      },
      error: err => { this.switching.set(null); this.toast.error(err?.error?.message || 'The task could not be switched.'); this.tasks.update(list => [...list]); },
    });
  }

  // ---- rows -----------------------------------------------------------------------------------------------------
  readonly rows = computed(() => registryRows(this.pipelinesOnly() ? this.tasks().filter(t => t.kind === 'Legacy' || t.code === 'legacy') : this.tasks(), this.forms()));
  readonly counts = computed(() => kindCounts(this.rows()));
  readonly filtered = computed(() => filterRows(this.rows(), { kind: this.kindFilter(), state: this.stateFilter(), search: this.search() }));
  readonly pager = createPager<RegistryRow>();
  readonly shown = computed(() => this.pager.slice(this.filtered()));

  readonly taskTiles = computed(() => {
    const steps = this.rows().filter(r => !r.legacy);
    return {
      total: steps.length, on: steps.filter(r => r.state === 'On').length, unavailable: steps.filter(r => r.state === 'Unavailable').length,
      blocked: steps.filter(r => r.state === 'Blocked').length,
      inUse: steps.filter(r => this.countOf(r).pipelines > 0).length,
    };
  });

  constructor() {
    // Any server-side filter asks for the pipelines again.
    effect(() => {
      this.topicFilter(); this.tenantFilter(); this.onlyMine();
      untracked(() => this.loadPipelines());
    });
    // Owner #16, #17: the registry, its counts and its changes are the chosen workspace's for a platform administrator.
    let first = true;
    effect(() => {
      this.tenantFilter();
      if (first) { first = false; return; }
      untracked(() => { this.loadTasks(); this.loadUsage(); this.loadChanges(); });
    });
  }

  ngOnInit(): void {
    const topic = this.route.snapshot.queryParamMap.get('topic');
    if (topic) { this.topicFilter.set(topic); this.topicSearch.resolve(topic); }
    if (this.isPlatformAdmin()) {
      this.http.get<ApiResponse<any[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({
        next: r => { if (r.status === API_SUCCESS) this.tenants.set(r.data ?? []); },
        error: () => {},
      });
    }
    this.loadTasks();
    this.loadUsage();
    this.loadChanges();
  }

  load(): void {
    this.loadTasks();
    this.loadPipelines();
    this.loadUsage();
    this.loadChanges();
  }

  /** The tenantId a platform administrator's calls name (null: theirs, or every workspace for the counts). */
  private tenantParam(): number | null {
    return this.isPlatformAdmin() && this.tenantFilter() ? Number(this.tenantFilter()) : null;
  }

  loadUsage(): void {
    this.usageError.set('');
    this.api.taskUsage(this.tenantParam()).subscribe({
      next: r => { if (r.status === API_SUCCESS) this.usage.set(r.data ?? null); else { this.usage.set(null); this.usageError.set(r.message || 'The counts could not be read.'); } },
      error: err => { this.usage.set(null); this.usageError.set(err?.error?.message || 'The counts could not be read.'); },
    });
  }

  /** The workspace's switch and block changes, newest first (a platform administrator's: the chosen workspace's). */
  loadChanges(): void {
    if (this.isPlatformAdmin() && !this.tenantFilter()) { this.changes.set([]); return; }
    this.api.taskHistory(null, this.tenantParam()).subscribe({
      next: r => this.changes.set(r.status === API_SUCCESS ? (r.data ?? []).slice(0, 12) : []),
      error: () => this.changes.set([]),
    });
  }

  /** A count's list, in the drawer: the pipelines that use the row's task, or their runs this month. */
  openUsage(row: RegistryRow, list: 'pipelines' | 'runs'): void {
    const count = this.countOf(row);
    const data: TaskUsagePanelData = {
      list, name: row.name, count: list === 'runs' ? count.runs : count.pipelines, tenantId: this.tenantParam(), countsOnly: this.ownSignIn(),
      of: row.legacy && row.pipeline?.pipelineKey != null ? { pipelineKey: row.pipeline.pipelineKey } : { code: row.code },
    };
    this.dialog.open<void>(TaskUsagePanel, sidePanelConfig(data, 'wide', 'right'));
  }

  // ---- owner #16: the platform's control -------------------------------------------------------------------------

  /** The control's value for a task in the chosen workspace. */
  platformValue(t: StepTaskEntry): TaskControlState {
    if (t.blocked) return 'blocked';
    if (t.overridden && t.switchedByRole === 'PLATFORM_ADMIN') return t.enabled ? 'enabled' : 'disabled';
    return 'default';
  }

  /** Default, Enabled, Disabled or Blocked for the chosen workspace; a block asks why (shown to the workspace). */
  async setPlatform(t: StepTaskEntry, select: HTMLSelectElement): Promise<void> {
    const state = select.value as TaskControlState;
    const tenant = this.chosenTenant();
    if (!tenant || this.controlling()) return;
    let reason: string | null = null;
    if (state === 'blocked') {
      reason = await askReason(this.dialog, {
        title: `Block ${t.name || t.code} for this workspace?`,
        subtitle: 'Its pipelines cannot add it, a run that uses it is declined naming the task, and the workspace\'s administrator cannot '
          + 'switch it on until a platform administrator unblocks it.',
        label: 'Why (shown to the workspace)', placeholder: 'e.g. Under review for this customer', confirmLabel: 'Block task', danger: true,
      });
      if (reason === null) { select.value = this.platformValue(t); return; }
    }
    this.controlling.set(t.code);
    this.api.setPlatformState(t.code, state, tenant, reason).subscribe({
      next: r => {
        this.controlling.set(null);
        if (r.status !== API_SUCCESS) { select.value = this.platformValue(t); this.toast.error(r.message || 'The task could not be changed.'); return; }
        this.toast.success(r.message);
        if (r.data?.code) this.tasks.update(list => withSwitchedLine(list, r.data!)); else this.loadTasks();
        this.loadChanges();
      },
      error: err => { this.controlling.set(null); select.value = this.platformValue(t); this.toast.error(err?.error?.message || 'The task could not be changed.'); },
    });
  }

  /** Who set the task's state here, and when -- the block's, else the switch's; null for the default. */
  setBy(t: StepTaskEntry): { who: string; at: string | null } | null {
    if (t.blocked) return { who: setByWords(t.blockedByName ?? null, t.blockedBy ?? null, 'PLATFORM_ADMIN'), at: t.blockedAt ?? null };
    // A switch Core names nobody for (written before owner #16) says nothing rather than "someone".
    if (t.overridden && (t.switchedBy != null || t.switchedByName)) {
      return { who: setByWords(t.switchedByName ?? null, t.switchedBy ?? null, t.switchedByRole ?? null), at: t.switchedAt ?? null };
    }
    return null;
  }

  changeWords(c: TaskChange): string { return `${c.code} ${changeWords(c)}`; }
  changeBy(c: TaskChange): string { return setByWords(c.byName ?? null, c.by ?? null, c.byRole ?? null); }

  loadTasks(): void {
    this.tasksLoading.set(true);
    this.tasksError.set('');
    this.api.tasks(this.tenantParam()).subscribe({
      next: r => {
        this.tasksLoading.set(false);
        if (r.status !== API_SUCCESS) { this.tasksError.set(r.message || 'The Task Registry could not be read.'); return; }
        this.tasks.set(r.data ?? []);
      },
      error: err => { this.tasksLoading.set(false); this.tasksError.set(err?.error?.message || 'The Task Registry could not be read.'); },
    });
  }

  private loadTicket = 0;
  loadPipelines(): void {
    const ticket = ++this.loadTicket;
    if (this.ownSignIn()) { this.loading.set(false); this.error.set(''); this.forms.set([]); this.summary.set(EMPTY_SUMMARY); return; }
    this.loading.set(true);
    this.error.set('');
    const params: Record<string, string> = { page: '1', limit: String(LIST_LIMIT) };
    if (this.topicFilter()) params['topic'] = this.topicFilter();
    if (this.tenantFilter()) params['tenantId'] = this.tenantFilter();
    if (this.onlyMine()) params['onlyMine'] = 'true';
    this.http.get<ApiResponse<{ rows: Pipeline[]; summary: PipelineSummary }>>(`${API_BASE}/pipeline.json/list`, { params }).subscribe({
      next: response => {
        // A slower answer to an earlier filter must not overwrite the newest one.
        if (ticket !== this.loadTicket) return;
        this.loading.set(false);
        if (response.status !== API_SUCCESS) { this.error.set(response.message); return; }
        this.forms.set(response.data?.rows ?? []);
        this.summary.set(response.data?.summary ?? EMPTY_SUMMARY);
      },
      error: err => {
        if (ticket !== this.loadTicket) return;
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load pipelines.');
      },
    });
  }

  goToPage(page: number): void { this.pager.goTo(page, this.filtered().length); }
  setPageSize(size: number): void { this.pager.setSize(size); }

  clearFilters(): void {
    this.kindFilter.set(''); this.stateFilter.set(''); this.search.set('');
    // The workspace stays: it is whose registry this is, not a filter of it (owner #16).
    this.topicFilter.set(''); this.onlyMine.set(false);
    this.pager.reset();
  }

  // ---- the panel --------------------------------------------------------------------------------------------------

  /** A row's panel. A Legacy row's fields are fetched first (as Edit does), so the panel lists them. */
  async open(row: RegistryRow): Promise<void> {
    let target = row;
    if (row.pipeline) {
      const form = await this.withFields(row.pipeline);
      if (form) target = { ...row, pipeline: form };
    }
    const data: TaskPanelData = {
      row: target,
      isAdmin: this.canSwitch(),
      onSwitched: line => this.tasks.update(list => withSwitchedLine(list, line)),
    };
    this.dialog.open<TaskPanelResult>(TaskPanel, sidePanelConfig(data, 'wide', 'right')).closed.subscribe(result => {
      if (result === 'edit' && target.pipeline && !this.locked()) this.edit(target.pipeline);
    });
  }

  // ---- a Legacy row's pipeline: the old list's actions, unchanged -------------------------------------------------

  /** Rows whose fields are on their way; the name shows a spinner meanwhile. */
  private readonly fieldsLoading = signal<Set<number>>(new Set());
  isFetchingFields(form: Pipeline | undefined): boolean { return !!form && this.fieldsLoading().has(form.pipelineKey ?? -1); }

  /**
   * The row with its fields, fetching them the first time and keeping them on the row so the
   * next open, edit or copy is instant. Resolves null when they could not be fetched.
   */
  private async withFields(form: Pipeline): Promise<Pipeline | null> {
    if (form.fields || !form.pipelineKey) return form;
    const key = form.pipelineKey;
    this.fieldsLoading.update(set => new Set(set).add(key));
    try {
      const response = await firstValueFrom(this.http.get<ApiResponse<PipelineField[]>>(
        `${API_BASE}/pipeline.json/fields`, { params: { pipelineKey: key } }));
      if (response.status !== API_SUCCESS) { this.toast.error(response.message); return null; }
      const fields = response.data ?? [];
      this.forms.update(list => list.map(f => (f.pipelineKey === key ? { ...f, fields } : f)));
      return { ...form, fields };
    } catch (err: any) {
      this.toast.error(err?.error?.message || 'The fields could not be loaded.');
      return null;
    } finally {
      this.fieldsLoading.update(set => { const n = new Set(set); n.delete(key); return n; });
    }
  }

  /** Owner #18: New, Edit and Duplicate open the registry task's own page. */
  create(): void {
    this.router?.navigate(['/settings/task-registry/new']);
  }

  edit(row: Pipeline): void {
    if (row.pipelineKey != null) this.router?.navigate(['/settings/task-registry', row.pipelineKey]);
  }

  duplicate(row: Pipeline): void {
    if (row.pipelineKey != null) this.router?.navigate(['/settings/task-registry/new'], { queryParams: { copyOf: row.pipelineKey } });
  }

  async remove(form: Pipeline): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${form.pipelineName}?`,
      body: 'Tasks on this pipeline keep working — a form only describes their payload, it does '
        + 'not store it. They go back to being edited as raw tags.',
      confirmLabel: 'Delete pipeline',
      danger: true,
    });
    if (!ok) return;
    this.http.delete<ApiResponse>(`${API_BASE}/pipeline.json/delete`,
      { params: new HttpParams().set('pipelineKey', String(form.pipelineKey)) }).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) { this.toast.success(response.message); this.loadPipelines(); }
        else this.toast.error(response.message);
      },
      error: err => this.toast.error(err?.error?.message || 'The pipeline could not be deleted.'),
    });
  }
}
