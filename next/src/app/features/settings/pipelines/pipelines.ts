import { Component, OnInit, WritableSignal, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { MineFilter } from '../../../shared/ui/mine-filter';
import { createPager } from '../../../shared/ui/pager';
import { Pagination } from '../../../shared/ui/pagination';
import { createTopicSearch } from '../../../shared/ui/topic-search';
import { AuthService } from '../../../core/auth/auth.service';
import { TableShell } from '../../../shared/ui/data-table';
import { StatTile } from '../../../shared/ui/stat-tile';
import { StatusPill } from '../../../shared/ui/status-pill';
import { Icon } from '../../../shared/ui/icon';
import { Combobox } from '../../../shared/ui/combobox';
import { ViewToggle } from '../../../shared/ui/view-toggle';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { Pipeline, PipelineDialog, PipelineField } from './pipeline-dialog';
import { ActivatedRoute, RouterLink } from '@angular/router';

/** The tiles above the list: the whole scope's numbers, whatever page or filter is on. */
interface PipelineSummary { total: number; active: number; fields: number; topics: number; untopped: number; }
const EMPTY_SUMMARY: PipelineSummary = { total: 0, active: 0, fields: 0, topics: 0, untopped: 0 };

@Component({
  selector: 'app-pipelines',
  imports: [MineFilter, ViewToggle, StatTile, TableShell, StatusPill, Icon, CdkMenu, CdkMenuItem, CdkMenuTrigger, RouterLink, Combobox, Pagination],
  templateUrl: './pipelines.html',
})
export class Pipelines implements OnInit {
  readonly view = signal<'table' | 'cards'>('table');
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  /** The current page of rows -- the server filters and pages; nothing is narrowed here. */
  readonly forms = signal<Pipeline[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  /** How many rows match the filters, across every page. */
  readonly total = signal(0);
  readonly pager = createPager<Pipeline>();

  // ---- filters: each one is a query parameter, and any change goes back to page 1 ---------
  readonly search = signal('');
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  /** The search box waits for a pause in typing before asking the server. */
  onSearch(text: string): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.searchTimer = null; this.setFilter(this.search, text); }, 300);
  }
  readonly topicFilter = signal('');
  readonly statusFilter = signal('');
  /** A platform administrator can narrow to one workspace; a tenant's list is its own already. */
  readonly tenantFilter = signal('');
  readonly tenants = signal<{ tenantId: number; tenantName: string; tenantCode?: string }[]>([]);
  readonly tenantOptions = computed(() => this.tenants().map(t => ({ value: String(t.tenantId), label: t.tenantName, hint: t.tenantCode ?? '' })));
  setFilter(which: WritableSignal<string> | WritableSignal<boolean>, value: string | boolean): void {
    (which as WritableSignal<string | boolean>).set(value);
    this.pager.reset();
  }

  /** The topic box asks the server as the person types; see createTopicSearch. */
  readonly topicSearch = createTopicSearch(this.http);
  /** The topic rows found, plus a "No topic" row while any pipeline still lacks one. */
  readonly topicFilterOptions = computed(() => {
    const rows = this.topicSearch.options();
    return this.summary().untopped ? [...rows, { value: 'none', label: 'No topic', hint: 'pipelines still to be assigned' }] : rows;
  });
  readonly topicSelectedLabel = computed(() => this.topicFilter() === 'none' ? 'No topic' : this.topicSearch.selectedLabel());

  /** Cards whose full field list is open; keyed by pipeline so one click opens one card. */
  private readonly openFields = signal<Set<number>>(new Set());
  /** Rows whose fields are on their way; the button shows a spinner meanwhile. */
  private readonly fieldsLoading = signal<Set<number>>(new Set());
  isOpen(form: Pipeline): boolean { return this.openFields().has(form.pipelineKey ?? -1); }
  isFetchingFields(form: Pipeline): boolean { return this.fieldsLoading().has(form.pipelineKey ?? -1); }
  async toggleFields(form: Pipeline): Promise<void> {
    const key = form.pipelineKey ?? -1;
    if (this.openFields().has(key)) {
      this.openFields.update(set => { const n = new Set(set); n.delete(key); return n; });
      return;
    }
    // Opening asks for the fields the first time; a list row carries only their count.
    if (!(await this.withFields(form))) return;
    this.openFields.update(set => new Set(set).add(key));
  }

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

  readonly hasFilters = computed(() => !!this.search().trim() || !!this.topicFilter() || !!this.statusFilter() || !!this.tenantFilter() || this.onlyMine());
  private readonly route = inject(ActivatedRoute);

  private readonly auth = inject(AuthService);

  /**
   * A new form always belongs to one tenant. A platform administrator has none, so
   * PipelineServiceImpl.saveForm files their new form under the seeded "default" tenant instead
   * of refusing it -- only that tenant's users can use it. Surfaced here so a platform administrator
   * knows where to find (or sign in as, to fully manage) what they are about to create.
   */
  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());

  /** Narrows the list to rows this person created. Not persisted -- see MineFilter. */

  readonly onlyMine = signal(false);


  /** The page as shown; the name survives from when this screen filtered client-side. */
  readonly filtered = computed(() => this.forms());

  /** The tiles: the whole scope's numbers, from the server, whatever page or filter is on. */
  readonly summary = signal<PipelineSummary>(EMPTY_SUMMARY);

  /** Any filter or page change asks the server again. */
  private readonly reload = effect(() => {
    this.search(); this.topicFilter(); this.statusFilter(); this.tenantFilter(); this.onlyMine();
    this.pager.page(); this.pager.size();
    untracked(() => this.load());
  });

  ngOnInit(): void {
    const topic = this.route.snapshot.queryParamMap.get('topic');
    if (topic) { this.topicFilter.set(topic); this.topicSearch.resolve(topic); }
    if (this.isPlatformAdmin()) {
      this.http.get<ApiResponse<any[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({
        next: r => { if (r.status === API_SUCCESS) this.tenants.set(r.data ?? []); },
        error: () => {},
      });
    }
  }

  private loadTicket = 0;
  load(): void {
    const ticket = ++this.loadTicket;
    this.loading.set(true);
    this.error.set('');
    const params: Record<string, string> = { page: String(this.pager.page()), limit: String(this.pager.size()) };
    if (this.search().trim()) params['q'] = this.search().trim();
    if (this.topicFilter()) params['topic'] = this.topicFilter();
    if (this.statusFilter()) params['status'] = this.statusFilter();
    if (this.tenantFilter()) params['tenantId'] = this.tenantFilter();
    if (this.onlyMine()) params['onlyMine'] = 'true';
    this.http.get<ApiResponse<{ rows: Pipeline[]; summary: PipelineSummary }>>(
      `${API_BASE}/pipeline.json/list`, { params }).subscribe({
      next: response => {
        // A slower answer to an earlier filter must not overwrite the newest one.
        if (ticket !== this.loadTicket) return;
        this.loading.set(false);
        if (response.status !== API_SUCCESS) { this.error.set(response.message); return; }
        this.forms.set(response.data?.rows ?? []);
        this.summary.set(response.data?.summary ?? EMPTY_SUMMARY);
        this.total.set(Number((response as any).paging?.totalRecord ?? 0));
      },
      error: err => {
        if (ticket !== this.loadTicket) return;
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load forms.');
      },
    });
  }

  goToPage(page: number): void { this.pager.goTo(page, this.total()); }
  setPageSize(size: number): void { this.pager.setSize(size); }

  /** From the row's count when it has one; from the fields once they have been fetched. */
  fieldCount(form: Pipeline): number { return form.fields?.length ?? form.fieldCount ?? 0; }

  requiredCount(form: Pipeline): number {
    return form.fields ? form.fields.filter(field => field.required).length : (form.requiredCount ?? 0);
  }

  create(): void {
    this.dialog.open<boolean>(PipelineDialog, { data: {} })
      .closed.subscribe(saved => { if (saved) this.load(); });
  }

  async edit(row: Pipeline): Promise<void> {
    const form = await this.withFields(row);
    if (!form) return;
    this.dialog.open<boolean>(PipelineDialog, { data: { form } })
      .closed.subscribe(saved => { if (saved) this.load(); });
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
      .closed.subscribe(saved => { if (saved) this.load(); });
  }

  async remove(form: Pipeline): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${form.pipelineName}?`,
      body: 'Tasks on this pipeline keep working — a form only describes their payload, it does '
        + 'not store it. They go back to being edited as raw tags.',
      confirmLabel: 'Delete form',
      danger: true,
    });
    if (!ok) return;
    this.http.delete<ApiResponse>(`${API_BASE}/pipeline.json/delete`,
      { params: new HttpParams().set('pipelineKey', String(form.pipelineKey)) }).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) { this.toast.success(response.message); this.load(); }
        else this.toast.error(response.message);
      },
      error: err => this.toast.error(err?.error?.message || 'The form could not be deleted.'),
    });
  }

  clearFilters(): void {
    this.search.set(''); this.topicFilter.set(''); this.statusFilter.set(''); this.tenantFilter.set('');
    this.onlyMine.set(false);
    this.pager.reset();
  }
}
