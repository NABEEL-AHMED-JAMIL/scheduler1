import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ActivatedRoute, Router } from '@angular/router';
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

export type SourcesTab = 'sources' | 'connections' | 'contracts';
const TABS: SourcesTab[] = ['sources', 'connections', 'contracts'];

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
  imports: [SensitivityTag, Icon, TableShell, StatusPill, StatStrip, ViewToggle, Pagination, DataText, ServerTimePipe, CdkMenu, CdkMenuItem, CdkMenuTrigger, ManagedBanner],
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
  readonly tab = signal<SourcesTab>(this.tabOf(this.route.snapshot?.queryParamMap?.get('tab')));
  readonly canManage = computed(() => this.auth.canBuild());
  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());
  private readonly tenants = signal<ComboboxOption[]>([]);
  private readonly names = computed(() => new Map(this.tenants().map(t => [t.value, t.label])));

  // -------------------------------------------------------------------------------------------- sources

  readonly view = signal<ListView>('table');
  readonly rows = signal<SourceRow[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly kindFilter = signal('');
  readonly page = signal(1);
  readonly size = signal(PAGE_SIZES[0]);

  readonly filtered = computed(() => this.rows()
    .filter(r => !this.kindFilter() || r.kind === this.kindFilter())
    .map(r => this.named(r)));
  readonly hasFilters = computed(() => !!this.search().trim() || !!this.kindFilter());
  readonly emptyMessage = computed(() => this.hasFilters() ? 'No source matches the current filters.'
    : this.canManage() ? 'No sources yet. Add one: an API from API Collections, a file or folder in your storage, or a database query.'
      : 'No sources yet. A workspace administrator adds them.');

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

  private sourcesRead = false;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => { if (this.searchTimer) clearTimeout(this.searchTimer); });
  }

  ngOnInit(): void {
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
    this.tab.set(tab);
    this.readTab(tab);
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab: tab === 'sources' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** A tab's list is read the first time it is opened, and again on Refresh. */
  private readTab(tab: SourcesTab): void {
    if (tab === 'sources' && !this.sourcesRead) this.load();
    if (tab === 'connections' && !this.connectionsRead) this.loadConnections();
    if (tab === 'contracts' && !this.contractsRead) this.loadContracts();
  }

  refresh(): void {
    if (this.tab() === 'connections') this.loadConnections();
    else if (this.tab() === 'contracts') this.loadContracts();
    else this.load();
  }

  load(): void {
    this.sourcesRead = true;
    this.loading.set(true);
    this.error.set('');
    this.api.list(this.search(), this.page(), this.size()).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message); return; }
        const rows = r.data ?? [];
        this.rows.set(rows);
        this.total.set(r.paging?.totalRecord ?? rows.length);
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'Could not load the sources.'); },
    });
  }

  loadConnections(): void {
    this.connectionsRead = true;
    this.connectionsLoading.set(true);
    this.connectionsError.set('');
    this.api.connections().subscribe({
      next: r => {
        this.connectionsLoading.set(false);
        if (r.status !== API_SUCCESS) { this.connectionsError.set(r.message); return; }
        this.connections.set(r.data ?? []);
      },
      error: err => { this.connectionsLoading.set(false); this.connectionsError.set(err?.error?.message || 'Could not load the database connections.'); },
    });
  }

  loadContracts(): void {
    this.contractsRead = true;
    this.contractsLoading.set(true);
    this.contractsError.set('');
    this.api.contracts().subscribe({
      next: r => {
        this.contractsLoading.set(false);
        if (r.status !== API_SUCCESS) { this.contractsError.set(r.message); return; }
        this.contracts.set(r.data ?? []);
      },
      error: err => { this.contractsLoading.set(false); this.contractsError.set(err?.error?.message || 'Could not load the data contracts.'); },
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
    };
    this.dialog.open<boolean>(SourcePanel, sidePanelConfig(data, 'wide')).closed.subscribe(changed => {
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
    const data: ConnectionDialogData = { connection, tenants: this.isPlatformAdmin() ? this.tenants() : undefined };
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
    this.dialog.open<boolean>(ContractPanel, sidePanelConfig(data, 'wide')).closed.subscribe(changed => { if (changed) this.loadContracts(); });
  }

  installTemplate(): void {
    const data: TemplateDialogData = {
      // A platform administrator's list spans workspaces, so it cannot say what one workspace has installed.
      installed: this.isPlatformAdmin() ? [] : this.contracts().filter(c => !c.system).map(c => c.name),
      tenants: this.isPlatformAdmin() ? this.tenants() : undefined,
    };
    this.dialog.open<boolean>(TemplateDialog, { data }).closed.subscribe(done => { if (done) this.loadContracts(); });
  }

  newContract(): void {
    const data: ContractSampleData = { tenants: this.isPlatformAdmin() ? this.tenants() : undefined };
    this.dialog.open<boolean>(ContractSampleDialog, { data }).closed.subscribe(done => { if (done) this.loadContracts(); });
  }
}
