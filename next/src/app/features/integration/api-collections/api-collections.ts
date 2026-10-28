import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Router, RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
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
import { confirmWith } from '../../../shared/ui/confirm';
import { CollectionRow, sourceLabel } from './api-collections.model';
import { ApiCollectionsApi, usersOf } from './api-collections.service';
import { CollectionDialog, CollectionDialogData } from './collection-dialog';
import { ImportDialog, ImportDialogData } from './import-dialog';
import { InUseDialog, InUseData } from './in-use-dialog';
import { saveCollectionKeepingAuth } from './collection-save';
import { SensitivityTag } from '../../../shared/ui/sensitivity';
import { ManagedBanner } from '../../../shared/ui/managed-banner';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { WorkspaceSelect } from '../../../shared/ui/workspace-select';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { createTableSort } from '../../../shared/ui/sort';
import { SortHeader } from '../../../shared/ui/sort-header';

/**
 * API Collections (MIG-247, Integration menu, page key api-collections): the workspace's reusable APIs.
 * Pipelines and sources name an API here and never copy its configuration.
 *
 * Every member who holds the page reads the list; New collection, Import and each row's Edit, Activate and
 * Delete are a workspace administrator's (integration-service answers those only for TENANT_ADMIN), so a
 * tenant user never sees a control the service would refuse. The service pages and searches the list.
 *
 * A platform administrator has no workspace of his own: he picks one in the header (the shared workspace selector, opening
 * on this session's last pick) and, until he does, the page asks for one and reads nothing. Every call then names that
 * workspace (integration-service answers his calls that name none with a 400), and New collection and Import make it
 * there. A workspace's people see no selector.
 */
@Component({
  selector: 'app-api-collections',
  imports: [RefreshButton, PageHeader, Icon, SensitivityTag, TableShell, StatusPill, StatStrip, ViewToggle, Pagination, DataText, ServerTimePipe, CdkMenu, CdkMenuItem,
    CdkMenuTrigger, RouterLink, ManagedBanner, WorkspaceSelect, SortHeader],
  templateUrl: './api-collections.html',
})
export class ApiCollections implements OnInit {
  private readonly api = inject(ApiCollectionsApi);
  private readonly directory = inject(WorkspaceDirectory);
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
  readonly canManage = computed(() => this.auth.canBuild());
  /** The workspace a platform administrator picked (this session's last choice to start with); null for anyone else. */
  readonly tenantId = signal<number | null>(this.directory.remembered());
  /** A platform administrator who has not picked a workspace yet: the page asks for one and reads nothing. */
  readonly needsWorkspace = computed(() => this.directory.picks() && this.tenantId() === null);

  readonly sourceLabel = sourceLabel;

  /**
   * The page's rows. Owner 2026-10-27: the state filter is the server's now (apiCollection.json/list status) -- it used to
   * narrow only the page read, so page 1 could look empty while later pages held matches, and the count was everyone's.
   */
  readonly filtered = computed(() => this.rows());
  /**
   * Owner 2026-10-27 ("add a sort on each table"): the collections are paged, so they sort on the server and a new order
   * goes back to the first page; the table and the cards show that order. No order picked: newest first, as before, and
   * no sort is sent.
   */
  readonly sort = createTableSort<CollectionRow>({
    id: 'api-collections',
    server: true,
    columns: {
      name: { value: c => c.name, param: 'name' },
      source: { value: c => sourceLabel(c.sourceFormat), param: 'source' },
      sensitivity: { value: c => c.sensitivity, param: 'sensitivity' },
      apis: { value: c => c.requestCount, kind: 'number', param: 'apis' },
      folders: { value: c => c.folderCount, kind: 'number', param: 'folders' },
      version: { value: c => c.currentVersion, kind: 'number', param: 'version' },
      updated: { value: c => c.dateUpdated || c.dateCreated, kind: 'date', param: 'updated' },
      state: { value: c => c.status, kind: 'status', param: 'state' },
    },
    onChange: () => { this.page.set(1); this.load(); },
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
    if (!this.needsWorkspace()) this.load();
  }

  /** A platform administrator's pick: nothing of the last workspace stays on screen while the new one is read. */
  pickWorkspace(id: number | null): void {
    this.tenantId.set(id);
    this.rows.set([]);
    this.total.set(0);
    this.page.set(1);
    if (id !== null) this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    const asked = this.tenantId();
    this.api.list(this.search(), this.page(), this.size(), asked, { status: this.statusFilter() || null, ...(this.sort.param() ?? {}) }).subscribe({
      next: r => {
        if (asked !== this.tenantId()) return;
        this.loading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message); return; }
        const rows = r.data ?? [];
        this.rows.set(rows);
        this.total.set(r.paging?.totalRecord ?? rows.length);
      },
      error: err => {
        if (asked !== this.tenantId()) return;
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load the API collections.');
      },
    });
  }

  /** The service searches: wait for the typing to stop, then ask again from the first page. */
  onSearch(value: string): void {
    this.search.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.searchTimer = null; this.page.set(1); this.load(); }, 300);
  }

  /** A state picked: the server narrows to it, from the first page (owner 2026-10-27). */
  setStatusFilter(value: string): void {
    this.statusFilter.set(value);
    this.page.set(1);
    this.load();
  }

  clearFilters(): void {
    const reread = !!this.search() || !!this.statusFilter();
    this.statusFilter.set('');
    this.search.set('');
    if (reread) { this.page.set(1); this.load(); }
  }

  goTo(page: number): void { this.page.set(page); this.load(); }
  setSize(size: number): void { this.size.set(size); this.page.set(1); this.load(); }

  create(): void {
    const data: CollectionDialogData = { tenantId: this.tenantId() };
    this.dialog.open<number | null>(CollectionDialog, { data }).closed.subscribe(id => {
      if (id) this.router.navigate(['/connections/api-collections', id]);
    });
  }

  edit(row: CollectionRow): void {
    const data: CollectionDialogData = { collection: row, tenantId: this.tenantId() };
    this.dialog.open<number | null>(CollectionDialog, { data }).closed.subscribe(id => { if (id) this.load(); });
  }

  importFiles(): void {
    const data: ImportDialogData = { tenantId: this.tenantId() };
    this.dialog.open<{ collectionId: number; open: boolean } | null>(ImportDialog, { data }).closed.subscribe(done => {
      if (!done) return;
      if (done.open) this.router.navigate(['/connections/api-collections', done.collectionId]);
      else this.load();
    });
  }

  /** Active ↔ Inactive. The save replaces the default auth, so it is read back from the current version first. */
  setStatus(row: CollectionRow): void {
    const status = row.status === 'Active' ? 'Inactive' : 'Active';
    saveCollectionKeepingAuth(this.api, row, { status }, this.tenantId()).subscribe({
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
    this.api.deleteCollection(row.collectionId, this.tenantId()).subscribe({
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
