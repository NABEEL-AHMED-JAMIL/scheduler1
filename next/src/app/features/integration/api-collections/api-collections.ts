import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Router, RouterLink } from '@angular/router';
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
import { workspaceName } from '../../../shared/ui/workspace-name';
import { CollectionRow, sourceLabel } from './api-collections.model';
import { ApiCollectionsApi, usersOf } from './api-collections.service';
import { CollectionDialog, CollectionDialogData } from './collection-dialog';
import { ImportDialog, ImportDialogData } from './import-dialog';
import { InUseDialog, InUseData } from './in-use-dialog';
import { saveCollectionKeepingAuth } from './collection-save';
import { SensitivityTag } from '../../../shared/ui/sensitivity';

/**
 * API Collections (MIG-247, Integration menu, page key api-collections): the workspace's reusable APIs.
 * Pipelines and sources name an API here and never copy its configuration.
 *
 * Every member who holds the page reads the list; New collection, Import and each row's Edit, Activate and
 * Delete are a workspace administrator's (integration-service answers those only for TENANT_ADMIN), so a
 * tenant user never sees a control the service would refuse. The service pages and searches the list.
 */
@Component({
  selector: 'app-api-collections',
  imports: [Icon, SensitivityTag, TableShell, StatusPill, StatStrip, ViewToggle, Pagination, DataText, ServerTimePipe, CdkMenu, CdkMenuItem,
    CdkMenuTrigger, RouterLink],
  templateUrl: './api-collections.html',
})
export class ApiCollections implements OnInit {
  private readonly api = inject(ApiCollectionsApi);
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly view = signal<ListView>('table');
  readonly rows = signal<CollectionRow[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly statusFilter = signal('');
  readonly page = signal(1);
  readonly size = signal(PAGE_SIZES[0]);
  readonly canManage = computed(() => this.auth.isTenantAdmin());
  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());
  private readonly tenants = signal<ComboboxOption[]>([]);

  readonly sourceLabel = sourceLabel;

  /** The page's rows with the state filter applied, each named by its workspace for a platform administrator. */
  readonly filtered = computed(() => {
    const names = new Map(this.tenants().map(t => [t.value, t.label]));
    return this.rows()
      .filter(r => !this.statusFilter() || r.status === this.statusFilter())
      .map(r => this.isPlatformAdmin() ? { ...r, tenantName: r.tenantName ?? names.get(String(r.tenantId)) ?? null } : r);
  });
  readonly hasFilters = computed(() => !!this.search().trim() || !!this.statusFilter());
  readonly emptyMessage = computed(() => this.hasFilters() ? 'No collection matches the current filters.'
    : this.canManage() ? 'No API collections yet. Create one, or import a Postman or Bruno collection, then add and test its APIs.'
      : 'No API collections yet. A workspace administrator creates them.');

  readonly kpis = computed((): StatStripItem[] => {
    const rows = this.rows();
    const partial = this.total() > rows.length;
    const onPage = partial ? 'on this page' : undefined;
    const inactive = rows.filter(r => r.status === 'Inactive').length;
    return [
      { label: 'Collections', value: this.total(), icon: 'code', tone: 'info', foot: `${rows.filter(r => r.status === 'Active').length} active${partial ? ' on this page' : ''}` },
      { label: 'APIs', value: rows.reduce((n, r) => n + (r.requestCount ?? 0), 0), icon: 'plug', tone: 'info', foot: onPage ?? 'across every collection' },
      { label: 'Imported', value: rows.filter(r => r.sourceFormat && r.sourceFormat !== 'MANUAL').length, icon: 'upload', tone: 'info', foot: onPage ?? 'from Postman or Bruno' },
      { label: 'Inactive', value: inactive, icon: 'alert', tone: inactive ? 'warn' : 'muted', quiet: !inactive, foot: inactive ? 'not offered to pipelines' : 'all in use' },
    ];
  });

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => { if (this.searchTimer) clearTimeout(this.searchTimer); });
  }

  ngOnInit(): void {
    this.load();
    if (this.isPlatformAdmin()) {
      this.http.get<ApiResponse<{ tenantId: number; tenantName: string }[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({
        next: r => { if (r.status === API_SUCCESS) this.tenants.set((r.data ?? []).map(t => ({ value: String(t.tenantId), label: t.tenantName }))); },
        error: () => { /* the ids stand in for the names */ },
      });
    }
  }

  load(): void {
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
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'Could not load the API collections.'); },
    });
  }

  /** The service searches: wait for the typing to stop, then ask again from the first page. */
  onSearch(value: string): void {
    this.search.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.searchTimer = null; this.page.set(1); this.load(); }, 300);
  }

  clearFilters(): void {
    this.statusFilter.set('');
    if (this.search()) { this.search.set(''); this.page.set(1); this.load(); }
  }

  goTo(page: number): void { this.page.set(page); this.load(); }
  setSize(size: number): void { this.size.set(size); this.page.set(1); this.load(); }

  workspace(row: CollectionRow): string { return workspaceName(row); }

  create(): void {
    const data: CollectionDialogData = { tenants: this.isPlatformAdmin() ? this.tenants() : undefined };
    this.dialog.open<number | null>(CollectionDialog, { data }).closed.subscribe(id => {
      if (id) this.router.navigate(['/integration/api-collections', id]);
    });
  }

  edit(row: CollectionRow): void {
    const data: CollectionDialogData = { collection: row };
    this.dialog.open<number | null>(CollectionDialog, { data }).closed.subscribe(id => { if (id) this.load(); });
  }

  importFiles(): void {
    const data: ImportDialogData = { tenants: this.isPlatformAdmin() ? this.tenants() : undefined };
    this.dialog.open<{ collectionId: number; open: boolean } | null>(ImportDialog, { data }).closed.subscribe(done => {
      if (!done) return;
      if (done.open) this.router.navigate(['/integration/api-collections', done.collectionId]);
      else this.load();
    });
  }

  /** Active ↔ Inactive. The save replaces the default auth, so it is read back from the current version first. */
  setStatus(row: CollectionRow): void {
    const status = row.status === 'Active' ? 'Inactive' : 'Active';
    saveCollectionKeepingAuth(this.api, row, { status }).subscribe({
      next: r => { if (r.status === API_SUCCESS) { this.toast.success(status === 'Active' ? `${row.name} is active.` : `${row.name} is inactive.`); this.load(); } else this.toast.error(r.message); },
      error: err => this.toast.error(err?.error?.message || 'The collection could not be changed.'),
    });
  }

  async remove(row: CollectionRow): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${row.name}?`,
      body: 'Its APIs and environments go with it. The service refuses while a pipeline, source or AI tool still uses one of its APIs.',
      confirmLabel: 'Delete collection', danger: true,
    });
    if (!ok) return;
    this.api.deleteCollection(row.collectionId).subscribe({
      next: r => {
        if (r.status === API_SUCCESS) { this.toast.success(r.message); this.load(); return; }
        const users = usersOf(r);
        if (users.length) {
          const data: InUseData = { heading: `${row.name} is still in use`, message: r.message, users };
          this.dialog.open(InUseDialog, { data });
        } else this.toast.error(r.message);
      },
      error: err => this.toast.error(err?.error?.message || 'The collection could not be deleted.'),
    });
  }
}
