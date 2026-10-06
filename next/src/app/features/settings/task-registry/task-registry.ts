import { Component, OnInit, WritableSignal, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
import { TaskStatePill } from '../../tasks/steps/task-switch';
import { Pipeline, PipelineDialog, PipelineField } from '../pipelines/pipeline-dialog';
import { TaskPanel, TaskPanelData, TaskPanelResult } from './task-panel';
import { REGISTRY_KINDS, RegistryRow, TASK_STATES, filterRows, kindCounts, registryRows } from './task-registry.model';

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
 * it. New pipeline, Edit, Duplicate and Delete are the old list's, unchanged -- the same row (with its fields fetched
 * the same way) opens the same PipelineDialog, so a save is the same request as before (legacy-save.golden.ts holds
 * the old list's, and the spec compares). Topic, workspace and "Only mine" narrow the pipelines on the server; kind,
 * state and search narrow every row here, since the registry is one short list and a workspace's pipelines come whole.
 */
@Component({
  selector: 'app-task-registry',
  imports: [MineFilter, StatTile, TableShell, TaskStatePill, Icon, CdkMenu, CdkMenuItem, CdkMenuTrigger, RouterLink, Combobox, Pagination, ManagedBanner],
  templateUrl: './task-registry.html',
})
export class TaskRegistry implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = inject(StepsApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
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
  readonly tenantFilter = signal('');
  readonly onlyMine = signal(false);
  readonly tenants = signal<{ tenantId: number; tenantName: string; tenantCode?: string }[]>([]);
  readonly tenantOptions = computed(() => this.tenants().map(t => ({ value: String(t.tenantId), label: t.tenantName, hint: t.tenantCode ?? '' })));
  readonly topicSearch = createTopicSearch(this.http);
  readonly topicFilterOptions = computed(() => {
    const rows = this.topicSearch.options();
    return this.summary().untopped ? [...rows, { value: 'none', label: 'No topic', hint: 'pipelines still to be assigned' }] : rows;
  });
  readonly topicSelectedLabel = computed(() => this.topicFilter() === 'none' ? 'No topic' : this.topicSearch.selectedLabel());
  /** A pipeline-only filter is on: the step tasks have no topic, workspace or author, so they step aside. */
  readonly pipelinesOnly = computed(() => !!this.topicFilter() || !!this.tenantFilter() || this.onlyMine());

  setFilter(which: WritableSignal<string> | WritableSignal<boolean>, value: string | boolean): void {
    (which as WritableSignal<string | boolean>).set(value);
    this.pager.reset();
  }

  readonly hasFilters = computed(() => !!this.kindFilter() || !!this.stateFilter() || !!this.search().trim() || this.pipelinesOnly());
  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());
  /** Switches the workspace's tasks, as on the step builder's Settings tab (Core refuses anyone else). */
  readonly isWorkspaceAdmin = computed(() => this.auth.isTenantAdmin());

  // ---- rows -----------------------------------------------------------------------------------------------------
  readonly rows = computed(() => registryRows(this.pipelinesOnly() ? this.tasks().filter(t => t.kind === 'Legacy' || t.code === 'legacy') : this.tasks(), this.forms()));
  readonly counts = computed(() => kindCounts(this.rows()));
  readonly filtered = computed(() => filterRows(this.rows(), { kind: this.kindFilter(), state: this.stateFilter(), search: this.search() }));
  readonly pager = createPager<RegistryRow>();
  readonly shown = computed(() => this.pager.slice(this.filtered()));

  readonly taskTiles = computed(() => {
    const steps = this.rows().filter(r => !r.legacy);
    return { total: steps.length, on: steps.filter(r => r.state === 'On').length, unavailable: steps.filter(r => r.state === 'Unavailable').length };
  });

  constructor() {
    // Any server-side filter asks for the pipelines again.
    effect(() => {
      this.topicFilter(); this.tenantFilter(); this.onlyMine();
      untracked(() => this.loadPipelines());
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
  }

  load(): void {
    this.loadTasks();
    this.loadPipelines();
  }

  loadTasks(): void {
    this.tasksLoading.set(true);
    this.tasksError.set('');
    this.api.tasks().subscribe({
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
    this.topicFilter.set(''); this.tenantFilter.set(''); this.onlyMine.set(false);
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
      isAdmin: this.isWorkspaceAdmin() && !this.locked(),
      onSwitched: line => this.tasks.update(list => withSwitchedLine(list, line)),
    };
    this.dialog.open<TaskPanelResult>(TaskPanel, sidePanelConfig(data, 'wide')).closed.subscribe(result => {
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

  create(): void {
    this.dialog.open<boolean>(PipelineDialog, { data: {} })
      .closed.subscribe(saved => { if (saved) this.loadPipelines(); });
  }

  async edit(row: Pipeline): Promise<void> {
    const form = await this.withFields(row);
    if (!form) return;
    this.dialog.open<boolean>(PipelineDialog, { data: { form } })
      .closed.subscribe(saved => { if (saved) this.loadPipelines(); });
  }

  async duplicate(row: Pipeline): Promise<void> {
    const form = await this.withFields(row);
    if (!form) return;
    // A copy has to claim a different pipeline: one live form per pipeline is a unique index.
    const copy: Pipeline = {
      ...form,
      pipelineKey: undefined,
      pipelineId: '',
      pipelineName: `${form.pipelineName} (copy)`,
      fields: (form.fields ?? []).map(field => ({ ...field, pipelineFieldId: undefined })),
    };
    this.dialog.open<boolean>(PipelineDialog, { data: { form: copy } })
      .closed.subscribe(saved => { if (saved) this.loadPipelines(); });
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
