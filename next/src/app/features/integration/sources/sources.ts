import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { TableShell } from '../../../shared/ui/data-table';
import { StatusPill } from '../../../shared/ui/status-pill';
import { StatStrip, StatStripItem } from '../../../shared/ui/stat-strip';
import { ViewToggle, ListView } from '../../../shared/ui/view-toggle';
import { Pagination } from '../../../shared/ui/pagination';
import { PAGE_SIZES } from '../../../shared/ui/pager';
import { DataText } from '../../../shared/ui/data-text';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ComboboxOption } from '../../../shared/ui/combobox';
import { confirmWith } from '../../../shared/ui/confirm';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { workspaceName } from '../../../shared/ui/workspace-name';
import {
  ConnectionRow, ContractRow, SOURCE_KINDS, SourceRow, directionLabel, formatLabel, kindIcon, kindLabel, sslLabel,
} from './sources.model';
import { SourcesApi } from './sources.service';
import { SourcePanel, SourcePanelData } from './source-panel';
import { ConnectionDialog, ConnectionDialogData } from './connection-dialog';
import { ContractPanel, ContractPanelData } from './contract-panel';
import { TemplateDialog, TemplateDialogData } from './template-dialog';
import { ContractSampleDialog, ContractSampleData } from './contract-sample-dialog';
import { SensitivityTag } from '../../../shared/ui/sensitivity';
import { ManagedBanner } from '../../../shared/ui/managed-banner';
import { WorkspaceSelect } from '../../../shared/ui/workspace-select';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { PipelineRead, PipelineReads, readsSentence } from './pipeline-reads';
import { createTableSort } from '../../../shared/ui/sort';
import { SortHeader } from '../../../shared/ui/sort-header';
import { createLoadState, loadErrorText } from '../../../shared/ui/loading';

export type SourcesTab = 'sources' | 'connections' | 'contracts';
const TABS: SourcesTab[] = ['sources', 'connections', 'contracts'];
/** Tab hubs (2026-10-12): each view is a tab of Connections, at its own address. */
export const SOURCES_VIEW_PATHS: Record<SourcesTab, string> = {
  sources: '/connections/sources', connections: '/connections/databases', contracts: '/connections/contracts',
};

/**
 * Sources (MIG-248, Integration menu, page key sources): where a pipeline's data comes from -- an API from the
 * workspace's API Collections, a file or a folder in one of its own Storage Connections, or a query on a database
 * connection -- with its test, preview and inferred schema. The page's other two tabs are the database connections
 * those queries use, and the data contracts (MIG-233) that say what a payload must hold, which Identity gates with
 * the same page key.
 *
 * Every member who holds the page reads all three. New, edit, delete, test, preview, schema, install and activate
 * are a workspace administrator's (integration-service answers them only for TENANT_ADMIN), so a tenant user never
 * sees a control the service would refuse; checking a payload against a contract is everyone's.
 */
@Component({
  selector: 'app-sources',
  imports: [WorkspaceSelect, RouterLink, RefreshButton, PipelineReads, PageHeader, SensitivityTag, Icon, TableShell, StatusPill, StatStrip, ViewToggle, Pagination, DataText, ServerTimePipe, CdkMenu, CdkMenuItem, CdkMenuTrigger, ManagedBanner, SortHeader],
  templateUrl: './sources.html',
})
export class Sources implements OnInit {
  private readonly api = inject(SourcesApi);
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly kinds = SOURCE_KINDS;
  readonly tabs: { id: SourcesTab; label: string }[] = [
    { id: 'sources', label: 'Sources' }, { id: 'connections', label: 'Database connections' }, { id: 'contracts', label: 'Data contracts' },
  ];
  /**
   * Tab hubs (2026-10-12): the address names the view -- Connections › Sources, Databases or Data contracts -- and the
   * hub's strip is the way between them, so the page's own tab strip is not shown. Without a view in the route (a unit
   * test mounting the page alone) the page keeps its own tabs, read from ?tab=.
   */
  readonly hubView = (this.route.snapshot?.data?.['view'] as SourcesTab | undefined) ?? null;
  readonly tab = signal<SourcesTab>(this.hubView ?? this.tabOf(this.route.snapshot?.queryParamMap?.get('tab')));
  readonly heading = computed(() => ({ sources: 'Sources', connections: 'Database connections', contracts: 'Data contracts' })[this.tab()]);
  readonly canManage = computed(() => this.auth.canBuild());
  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());
  /**
   * Owner #5: THE workspace selector in the header -- a platform administrator's lists, KPIs and new rows follow the workspace
   * picked (remembered for the session), or span every workspace. The service honours tenantId for them only.
   */
  readonly workspaceFilter = signal<number | null>(inject(WorkspaceDirectory).remembered() ?? null);
  private readonly tenants = signal<ComboboxOption[]>([]);
  private readonly names = computed(() => new Map(this.tenants().map(t => [t.value, t.label])));

  // -------------------------------------------------------------------------------------------- sources

  readonly view = signal<ListView>('table');
  readonly rows = signal<SourceRow[]>([]);
  readonly total = signal(0);
  /**
   * The sources' read. Owner 2026-10-27: the KPI strip showed 0 / 0 / 0 / 0 as if real while it loaded and under a
   * failure; it now waits for the first answer (placeholders) and says "Not available right now" when it failed.
   */
  readonly sourcesState = createLoadState();
  readonly loading = this.sourcesState.loading;
  readonly error = this.sourcesState.error;
  readonly search = signal('');
  readonly kindFilter = signal('');
  readonly page = signal(1);
  readonly size = signal(PAGE_SIZES[0]);

  readonly filtered = computed(() => this.rows()
    .filter(r => !this.kindFilter() || r.kind === this.kindFilter())
    .map(r => this.named(r)));
  /**
   * Owner 2026-10-27 ("add a sort on each table"): the sources are paged, so they sort on the server (dataSource.json/list
   * sort/dir) and a new order goes back to the first page; the table and the cards show that order. No order picked: the
   * newest first, as before, and no sort is sent. Last test (a result and a time) does not sort. The kind filter still
   * narrows the page read, as before.
   */
  readonly sourceSort = createTableSort<SourceRow>({
    id: 'sources',
    server: true,
    columns: {
      name: { value: r => r.name, param: 'name' },
      kind: { value: r => kindLabel(r.kind), param: 'kind' },
      format: { value: r => r.format, param: 'format' },
      created: { value: r => r.dateCreated, kind: 'date', param: 'created' },
      state: { value: r => r.status, kind: 'status', param: 'state' },
    },
    onChange: () => { this.page.set(1); this.load(); },
  });
  readonly hasFilters = computed(() => !!this.search().trim() || !!this.kindFilter());
  readonly emptyMessage = computed(() => this.hasFilters() ? 'No source matches the current filters.'
    // UX review 2026-10-13 (I1): never "nothing" while the pipelines read data directly.
    : this.pipelineReads().length ? readsSentence(this.pipelineReads())
      : this.canManage() ? 'No sources yet. Add one: an API from API Collections, a file or folder in your storage, or a database query.'
        : 'No sources yet. A workspace administrator adds them.');
  readonly emptyHint = computed(() => this.hasFilters() || this.pipelineReads().length ? ''
    : 'Pipelines also read API Collections and storage directly, without a source; add one here to test and preview it.');

  // -------------------------------------------------------------------------------------------- what pipelines read

  /** UX review 2026-10-13 (I1): what the workspace's pipelines read (Core); a platform administrator has no workspace. */
  readonly showPipelineReads = computed(() => !this.isPlatformAdmin());
  readonly pipelineReads = signal<PipelineRead[]>([]);
  readonly pipelineReadsLoading = signal(false);
  readonly pipelineReadsError = signal('');

  readonly kpis = computed((): StatStripItem[] => {
    const rows = this.rows();
    const partial = this.total() > rows.length;
    const onPage = partial ? 'on this page' : undefined;
    const answered = rows.filter(r => r.lastTestOk === true).length;
    const failing = rows.filter(r => r.lastTestOk === false).length;
    const untested = rows.filter(r => r.lastTestOk == null).length;
    return [
      { label: 'Sources', value: this.total(), icon: 'database', tone: 'info', foot: `${rows.filter(r => r.status === 'Active').length} active${partial ? ' on this page' : ''}` },
      { label: 'Answered', value: answered, icon: 'checkCircle', tone: answered ? 'ok' : 'muted', quiet: !answered, foot: onPage ?? 'at their last test' },
      { label: 'Failing', value: failing, icon: 'alert', tone: failing ? 'crit' : 'muted', quiet: !failing, foot: failing ? 'did not answer their last test' : 'none' },
      { label: 'Not tested', value: untested, icon: 'clock', tone: untested ? 'warn' : 'muted', quiet: !untested, foot: onPage ?? 'since they were saved' },
    ];
  });

  // -------------------------------------------------------------------------------------------- connections, contracts

  readonly connections = signal<ConnectionRow[]>([]);
  readonly connectionsLoading = signal(false);
  readonly connectionsError = signal('');
  private connectionsRead = false;

  readonly contracts = signal<ContractRow[]>([]);
  readonly contractsLoading = signal(false);
  readonly contractsError = signal('');
  private contractsRead = false;

  /** Whether the open tab's list is on its way. */
  readonly tabLoading = computed(() => this.tab() === 'connections' ? this.connectionsLoading()
    : this.tab() === 'contracts' ? this.contractsLoading() : this.loading());
  readonly namedConnections = computed(() => this.connections().map(c => this.named(c)));
  readonly namedContracts = computed(() => this.contracts().map(c => c.system ? c : this.named(c)));

  /** Owner 2026-10-27: the database connections and the contracts sort by every column; the service's order until then. */
  readonly connectionSort = createTableSort<ConnectionRow>({
    id: 'source-connections',
    columns: {
      name: c => c.name,
      host: c => `${c.host}:${c.port} / ${c.database}`,
      user: c => c.username,
      password: { value: c => c.passwordSet, kind: 'bool' },
      tls: c => this.sslText(c.sslMode),
      workspace: c => this.workspace(c),
      state: { value: c => c.status || 'Active', kind: 'status' },
    },
  });
  readonly sortedConnections = computed(() => this.connectionSort.apply(this.namedConnections()));
  readonly contractSort = createTableSort<ContractRow>({
    id: 'source-contracts',
    columns: {
      name: c => c.name,
      direction: c => this.directionText(c.direction),
      active: { value: c => c.activeVersion, kind: 'number' },
      latest: { value: c => c.currentVersion ?? 0, kind: 'number' },
      // The most guarded first.
      sensitivity: { value: c => c.sensitivity, kind: 'status', order: ['sensitive', 'internal', 'public'] },
      created: { value: c => c.dateCreated, kind: 'date' },
      workspace: c => (c.system ? 'Every workspace' : this.workspace(c)),
    },
  });
  readonly sortedContracts = computed(() => this.contractSort.apply(this.namedContracts()));

  private sourcesRead = false;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => { if (this.searchTimer) clearTimeout(this.searchTimer); });
  }

  ngOnInit(): void {
    // An old link to a view by ?tab= (Sources' Database connections) opens that view's own tab.
    const asked = this.route.snapshot?.queryParamMap?.get('tab');
    if (this.hubView && asked && (TABS as string[]).includes(asked) && asked !== this.hubView) {
      void this.router.navigate([SOURCES_VIEW_PATHS[asked as SourcesTab]], { replaceUrl: true });
      return;
    }
    this.readTab(this.tab());
    if (this.isPlatformAdmin()) {
      this.http.get<ApiResponse<{ tenantId: number; tenantName: string }[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({
        next: r => { if (r.status === API_SUCCESS) this.tenants.set((r.data ?? []).map(t => ({ value: String(t.tenantId), label: t.tenantName }))); },
        error: () => { /* the ids stand in for the names */ },
      });
    }
  }

  private tabOf(value: string | null | undefined): SourcesTab {
    return (TABS as string[]).includes(value ?? '') ? value as SourcesTab : 'sources';
  }

  /** A row named by its workspace, for a platform administrator (the service sends ids only). */
  private named<T extends { tenantId?: number | null; tenantName?: string | null }>(row: T): T {
    return this.isPlatformAdmin() ? { ...row, tenantName: row.tenantName ?? this.names().get(String(row.tenantId)) ?? null } : row;
  }

  setTab(tab: SourcesTab): void {
    if (this.hubView) { void this.router.navigateByUrl(SOURCES_VIEW_PATHS[tab]); return; }
    this.tab.set(tab);
    this.readTab(tab);
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab: tab === 'sources' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** A tab's list is read the first time it is opened, and again on Refresh. */
  private readTab(tab: SourcesTab): void {
    if (tab === 'sources' && !this.sourcesRead) { this.load(); this.loadPipelineReads(); }
    if (tab === 'connections' && !this.connectionsRead) this.loadConnections();
    if (tab === 'contracts' && !this.contractsRead) this.loadContracts();
  }

  refresh(): void {
    if (this.tab() === 'connections') this.loadConnections();
    else if (this.tab() === 'contracts') this.loadContracts();
    else { this.load(); this.loadPipelineReads(); }
  }

  /** The workspace a platform administrator picked, for the service; null for every workspace (and for anyone else). */
  private pickedWorkspace(): number | null {
    return this.isPlatformAdmin() ? this.workspaceFilter() : null;
  }

  /** Owner #5: another workspace picked -- every tab read again for it, from the first page. */
  pickWorkspace(tenantId: number | null): void {
    this.workspaceFilter.set(tenantId);
    this.page.set(1);
    this.sourcesRead = false;
    this.connectionsRead = false;
    this.contractsRead = false;
    this.refresh();
  }

  /** What the pipelines read: once with the Sources tab, and again on Refresh. */
  loadPipelineReads(): void {
    if (!this.showPipelineReads()) return;
    this.pipelineReadsLoading.set(true);
    this.pipelineReadsError.set('');
    this.api.pipelineReads().subscribe({
      next: r => {
        this.pipelineReadsLoading.set(false);
        if (r.status !== API_SUCCESS) { this.pipelineReadsError.set(loadErrorText(r, 'What the pipelines read could not be read.')); return; }
        this.pipelineReads.set(r.data ?? []);
      },
      error: err => {
        this.pipelineReadsLoading.set(false);
        this.pipelineReadsError.set(loadErrorText(err, 'What the pipelines read could not be read.'));
      },
    });
  }

  load(): void {
    this.sourcesRead = true;
    this.sourcesState.start();
    this.api.list(this.search(), this.page(), this.size(), this.pickedWorkspace(), this.sourceSort.param()).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.sourcesState.fail(r, 'The sources could not be read.'); return; }
        const rows = r.data ?? [];
        this.rows.set(rows);
        this.total.set(r.paging?.totalRecord ?? rows.length);
        this.sourcesState.done();
      },
      error: err => this.sourcesState.fail(err, 'The sources could not be read.'),
    });
  }

  loadConnections(): void {
    this.connectionsRead = true;
    this.connectionsLoading.set(true);
    this.connectionsError.set('');
    this.api.connections(this.pickedWorkspace()).subscribe({
      next: r => {
        this.connectionsLoading.set(false);
        if (r.status !== API_SUCCESS) { this.connectionsError.set(loadErrorText(r, 'The database connections could not be read.')); return; }
        this.connections.set(r.data ?? []);
      },
      error: err => { this.connectionsLoading.set(false); this.connectionsError.set(loadErrorText(err, 'The database connections could not be read.')); },
    });
  }

  loadContracts(): void {
    this.contractsRead = true;
    this.contractsLoading.set(true);
    this.contractsError.set('');
    this.api.contracts('', this.pickedWorkspace()).subscribe({
      next: r => {
        this.contractsLoading.set(false);
        if (r.status !== API_SUCCESS) { this.contractsError.set(loadErrorText(r, 'The data contracts could not be read.')); return; }
        this.contracts.set(r.data ?? []);
      },
      error: err => { this.contractsLoading.set(false); this.contractsError.set(loadErrorText(err, 'The data contracts could not be read.')); },
    });
  }

  /** The service searches: wait for the typing to stop, then ask again from the first page. */
  onSearch(value: string): void {
    this.search.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.searchTimer = null; this.page.set(1); this.load(); }, 300);
  }

  clearFilters(): void {
    this.kindFilter.set('');
    if (this.search()) { this.search.set(''); this.page.set(1); this.load(); }
  }

  goTo(page: number): void { this.page.set(page); this.load(); }
  setSize(size: number): void { this.size.set(size); this.page.set(1); this.load(); }

  workspace(row: { tenantId?: number | null; tenantName?: string | null }): string { return workspaceName(row); }
  kindText(kind: string): string { return kindLabel(kind); }
  kindGlyph(kind: string): string { return kindIcon(kind); }
  formatText(format: string | null | undefined): string { return formatLabel(format); }
  sslText(mode: string): string { return sslLabel(mode); }
  directionText(direction: string): string { return directionLabel(direction); }

  // -------------------------------------------------------------------------------------------- sources: actions

  private panel(sourceId: number | null): void {
    const data: SourcePanelData = {
      sourceId, canManage: this.canManage(), tenants: this.isPlatformAdmin() ? this.tenants() : undefined,
      tenantId: this.pickedWorkspace(),
    };
    this.dialog.open<boolean>(SourcePanel, sidePanelConfig(data, 'wide', 'right')).closed.subscribe(changed => {
      if (changed) { this.load(); if (this.connectionsRead) this.loadConnections(); }
    });
  }

  open(row: SourceRow): void { this.panel(row.id); }
  create(): void { this.panel(null); }

  async remove(row: SourceRow): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${row.name}?`,
      body: 'The source is removed from this workspace; an API source stops using its API. The data it points at is not touched.',
      confirmLabel: 'Delete source', danger: true,
    });
    if (!ok) return;
    this.api.delete(row.id).subscribe({
      next: r => { if (r.status === API_SUCCESS) { this.toast.success(r.message); this.load(); } else this.toast.error(r.message); },
      error: err => this.toast.error(err?.error?.message || 'The source could not be deleted.'),
    });
  }

  // -------------------------------------------------------------------------------------------- connections: actions

  private connectionDialog(connection: ConnectionRow | null): void {
    const data: ConnectionDialogData = { connection, tenants: this.isPlatformAdmin() ? this.tenants() : undefined,
      tenantId: this.pickedWorkspace() };
    this.dialog.open<ConnectionRow | null>(ConnectionDialog, { data }).closed.subscribe(saved => { if (saved) this.loadConnections(); });
  }

  newConnection(): void { this.connectionDialog(null); }
  editConnection(c: ConnectionRow): void { this.connectionDialog(c); }

  testConnection(c: ConnectionRow): void {
    this.api.testConnection(c.id).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; }
        if (r.data?.ok) this.toast.success(`${c.name} connected.`);
        else this.toast.error(`${c.name} did not connect: ${r.data?.message || r.message}`);
      },
      error: err => this.toast.error(err?.error?.message || 'The connection could not be tested.'),
    });
  }

  /** The service refuses while a source queries it, naming them: the message says what to change first. */
  async removeConnection(c: ConnectionRow): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${c.name}?`,
      body: 'Its stored password goes with it. The service refuses while a source still queries this connection.',
      confirmLabel: 'Delete connection', danger: true,
    });
    if (!ok) return;
    this.api.deleteConnection(c.id).subscribe({
      next: r => { if (r.status === API_SUCCESS) { this.toast.success(r.message); this.loadConnections(); } else this.toast.error(r.message); },
      error: err => this.toast.error(err?.error?.message || 'The connection could not be deleted.'),
    });
  }

  // -------------------------------------------------------------------------------------------- contracts: actions

  openContract(c: ContractRow): void {
    const data: ContractPanelData = { contract: c, canManage: this.canManage() };
    this.dialog.open<boolean>(ContractPanel, sidePanelConfig(data, 'wide', 'right')).closed.subscribe(changed => { if (changed) this.loadContracts(); });
  }

  installTemplate(): void {
    const data: TemplateDialogData = {
      // A platform administrator's list spans workspaces unless one is picked: only then can it say what is installed.
      installed: this.isPlatformAdmin() && !this.pickedWorkspace() ? [] : this.contracts().filter(c => !c.system).map(c => c.name),
      tenants: this.isPlatformAdmin() ? this.tenants() : undefined,
      tenantId: this.pickedWorkspace(),
    };
    this.dialog.open<boolean>(TemplateDialog, { data }).closed.subscribe(done => { if (done) this.loadContracts(); });
  }

  newContract(): void {
    const data: ContractSampleData = { tenants: this.isPlatformAdmin() ? this.tenants() : undefined, tenantId: this.pickedWorkspace() };
    this.dialog.open<boolean>(ContractSampleDialog, { data }).closed.subscribe(done => { if (done) this.loadContracts(); });
  }
}
