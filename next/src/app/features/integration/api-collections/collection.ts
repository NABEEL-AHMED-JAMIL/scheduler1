import { Component, OnChanges, computed, inject, input, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
import { isMissingRecord, isRecordId } from '../../../core/api/missing-record';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { TableShell } from '../../../shared/ui/data-table';
import { StatusPill } from '../../../shared/ui/status-pill';
import { StatStrip, StatStripItem } from '../../../shared/ui/stat-strip';
import { ViewToggle, ListView } from '../../../shared/ui/view-toggle';
import { DataText } from '../../../shared/ui/data-text';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { confirmWith } from '../../../shared/ui/confirm';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import {
  CollectionDetail, EnvironmentRow, RequestRow, UsageRow, VersionRow, authLabel, effectiveAuthMode, sourceLabel,
} from './api-collections.model';
import { ApiCollectionsApi, usersOf } from './api-collections.service';
import { CollectionDialog, CollectionDialogData } from './collection-dialog';
import { EnvironmentDialog, EnvironmentDialogData } from './environment-dialog';
import { InUseDialog, InUseData } from './in-use-dialog';
import { RequestPanel, RequestPanelData } from './request-panel';
import { folderOptions } from './folders';
import { LastTests } from './last-tests';
import { SensitivityTag } from '../../../shared/ui/sensitivity';
import { ManagedBanner } from '../../../shared/ui/managed-banner';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { WorkspaceSelect } from '../../../shared/ui/workspace-select';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { formatDuration } from '../../../shared/ui/time-format';
import { createTableSort } from '../../../shared/ui/sort';
import { SortHeader } from '../../../shared/ui/sort-header';
import { createLoadState, loadErrorText } from '../../../shared/ui/loading';

const USER_KINDS: Record<string, string> = { PIPELINE: 'Pipeline', SOURCE: 'Source', AI_TOOL: 'AI tool' };

/**
 * One API collection (MIG-247): its APIs, edited and tested in the wide side panel; its environments, where a
 * secret is "••• configured" and can only be replaced; its versions; and who uses its APIs. Reading is for every
 * member who holds the api-collections page; Add API, Edit, Enable/Disable, Delete and the environments' writes
 * are a workspace administrator's.
 *
 * A platform administrator reads it in the workspace he picked (the shared selector in the header, opening on this
 * session's last pick); until he picks one the page asks for it. Another workspace's collection is not found there.
 */
@Component({
  selector: 'app-api-collection',
  imports: [RefreshButton, PageHeader, Icon, SensitivityTag, TableShell, StatusPill, StatStrip, ViewToggle, DataText, ServerTimePipe, CdkMenu, CdkMenuItem, CdkMenuTrigger, RouterLink, ManagedBanner, WorkspaceSelect, SortHeader],
  templateUrl: './collection.html',
})
export class Collection implements OnChanges {
  /** Milliseconds in the console's duration words (formatDuration): "420 ms", "1.4 sec", "15 sec". */
  took(ms: number): string { return formatDuration(ms / 1000); }

  private readonly api = inject(ApiCollectionsApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly lastTests = inject(LastTests);
  private readonly directory = inject(WorkspaceDirectory);

  /** The workspace a platform administrator picked (this session's last choice to start with); null for anyone else. */
  readonly tenantId = signal<number | null>(this.directory.remembered());
  /** A platform administrator who has not picked a workspace yet: the page asks for one and reads nothing. */
  readonly needsWorkspace = computed(() => this.directory.picks() && this.tenantId() === null);

  /** From the route, :collectionId. */
  readonly collectionId = input<string>();
  /** From the address, ?tab= (UX final I3): History, or the overview. */
  readonly tab = input<string>();
  readonly activeTab = computed<'overview' | 'history'>(() => this.tab() === 'history' ? 'history' : 'overview');

  readonly detail = signal<CollectionDetail | null>(null);
  readonly defaultAuth = signal<unknown>(null);
  readonly usage = signal<UsageRow[]>([]);
  /**
   * Owner 2026-10-27: "Used by" is its own read. It showed "No pipeline ... uses these APIs yet" while it was still on
   * the way, and the same words when it failed -- now loading until it answers and the reason with Try again.
   */
  readonly usageState = createLoadState();
  readonly loading = signal(true);
  readonly error = signal('');
  readonly missing = signal(false);
  readonly view = signal<ListView>('table');
  readonly search = signal('');
  readonly folderFilter = signal('');
  readonly stateFilter = signal('');
  readonly canManage = computed(() => this.auth.canBuild());

  readonly collection = computed(() => this.detail()?.collection ?? null);
  readonly folders = computed(() => folderOptions(this.detail()?.folders ?? []));
  readonly environments = computed(() => this.detail()?.environments ?? []);
  readonly versions = computed(() => this.detail()?.versions ?? []);
  private readonly folderNames = computed(() => new Map(this.folders().map(f => [f.id, f.label])));

  readonly visibleRequests = computed(() => {
    const q = this.search().trim().toLowerCase();
    const folder = this.folderFilter();
    const state = this.stateFilter();
    return (this.detail()?.requests ?? []).filter(r =>
      (!folder || (folder === 'top' ? r.folderId == null : String(r.folderId) === folder))
      && (!state || (state === 'enabled') === r.enabled)
      && (!q || `${r.name} ${r.method} ${r.urlTemplate}`.toLowerCase().includes(q)));
  });
  readonly hasFilters = computed(() => !!this.search().trim() || !!this.folderFilter() || !!this.stateFilter());

  /**
   * Owner 2026-10-27: every table on the page sorts by its columns. Each keeps the order the service sends (the APIs in
   * their saved order, the versions newest first) until a heading is picked.
   */
  readonly requestSort = createTableSort<RequestRow>({
    id: 'api-collection-requests',
    columns: {
      name: r => r.name,
      endpoint: r => r.urlTemplate,
      auth: r => this.authText(r),
      folder: r => this.folderName(r.folderId),
      timeout: { value: r => r.timeoutMs, kind: 'number' },
      lastTest: { value: r => this.lastTest(r)?.statusCode, kind: 'number' },
      state: { value: r => (r.enabled ? 'Active' : 'Inactive'), kind: 'status' },
    },
  });
  /** The APIs on screen in the chosen order; the cards follow it too. */
  readonly sortedRequests = computed(() => this.requestSort.apply(this.visibleRequests()));
  readonly environmentSort = createTableSort<EnvironmentRow>({
    id: 'api-collection-environments',
    columns: { name: e => e.name },
  });
  readonly sortedEnvironments = computed(() => this.environmentSort.apply(this.environments()));
  readonly usageSort = createTableSort<UsageRow>({
    id: 'api-collection-usage',
    columns: {
      kind: u => this.userKind(u.userType),
      name: u => u.userName || u.userRef,
      api: u => u.requestName,
      // "Latest" (no pin) is not a number: it sorts after the pinned versions both ways.
      pinned: { value: u => u.pinnedVersion, kind: 'number' },
    },
  });
  readonly sortedUsage = computed(() => this.usageSort.apply(this.usage()));
  readonly versionSort = createTableSort<VersionRow>({
    id: 'api-collection-versions',
    columns: {
      version: { value: v => v.version, kind: 'number' },
      saved: { value: v => v.dateCreated, kind: 'date' },
    },
  });
  readonly sortedVersions = computed(() => this.versionSort.apply(this.versions()));

  readonly kpis = computed((): StatStripItem[] => {
    const d = this.detail();
    const requests = d?.requests ?? [];
    const enabled = requests.filter(r => r.enabled).length;
    return [
      { label: 'APIs', value: requests.length, icon: 'plug', tone: 'info' },
      { label: 'Enabled', value: enabled, icon: 'checkCircle', tone: enabled === requests.length ? 'ok' : 'warn', foot: requests.length - enabled ? `${requests.length - enabled} disabled` : 'all of them' },
      { label: 'Folders', value: d?.folders.length ?? 0, icon: 'folder', tone: 'muted' },
      { label: 'Environments', value: d?.environments.length ?? 0, icon: 'server', tone: 'muted',
        foot: d?.environments.find(e => e.isDefault)?.name ? `default ${d.environments.find(e => e.isDefault)!.name}` : 'none is the default' },
      { label: 'Version', value: `v${d?.collection.currentVersion ?? 0}`, icon: 'history', tone: 'muted', foot: 'every save is a version' },
    ];
  });

  readonly sourceLabel = sourceLabel;

  ngOnChanges(): void { this.load(); }

  /** A platform administrator's pick: the collection is read again in that workspace. */
  pickWorkspace(id: number | null): void {
    this.tenantId.set(id);
    this.detail.set(null);
    this.usage.set([]);
    this.load();
  }

  /** Who uses the collection's APIs; a reply for another workspace or collection than the one shown is dropped. */
  loadUsage(): void {
    const id = this.id();
    if (id === null || this.needsWorkspace()) return;
    const asked = this.tenantId();
    this.usageState.start();
    this.api.usage(id, asked).subscribe({
      next: r => {
        if (asked !== this.tenantId() || id !== this.id()) return;
        if (r.status !== API_SUCCESS) { this.usageState.fail(r, 'Who uses these APIs could not be read.'); return; }
        this.usage.set(r.data ?? []);
        this.usageState.done();
      },
      error: err => {
        if (asked !== this.tenantId() || id !== this.id()) return;
        this.usageState.fail(err, 'Who uses these APIs could not be read.');
      },
    });
  }

  private id(): number | null {
    const raw = this.collectionId();
    return isRecordId(raw) ? Number(raw) : null;
  }

  load(): void {
    const id = this.id();
    this.error.set('');
    this.missing.set(false);
    if (id === null) { this.loading.set(false); this.missing.set(true); this.error.set('There is no API collection at this address.'); return; }
    if (this.needsWorkspace()) { this.loading.set(false); return; }
    this.loading.set(true);
    const asked = this.tenantId();
    this.api.get(id, asked).subscribe({
      next: r => {
        if (asked !== this.tenantId()) return;
        this.loading.set(false);
        if (r.status !== API_SUCCESS || !r.data) {
          this.missing.set(isMissingRecord(r));
          this.error.set(r.message);
          return;
        }
        this.detail.set(r.data);
        // The APIs' Auth column and the editor need it; /get says it (MIG-310).
        this.defaultAuth.set(r.data.collection.defaultAuth ?? null);
      },
      error: err => {
        if (asked !== this.tenantId()) return;
        this.loading.set(false);
        this.missing.set(isMissingRecord({ status: err?.status }));
        this.error.set(loadErrorText(err, 'The collection could not be read.'));
      },
    });
    this.loadUsage();
  }

  folderName(id: number | null): string { return id == null ? '' : this.folderNames().get(id) ?? `Folder ${id}`; }
  userKind(type: string): string { return USER_KINDS[type] ?? type; }

  /** "From the collection · Bearer token": what an API signs in with, as its row shows it. */
  authText(r: RequestRow): string {
    if (r.authMode !== 'INHERIT') return authLabel(r.authMode);
    const mode = effectiveAuthMode('INHERIT', this.defaultAuth());
    return mode === 'NONE' ? 'None (from the collection)' : `${authLabel(mode)} (from the collection)`;
  }

  lastTest(r: RequestRow) { return this.lastTests.all().get(r.requestId) ?? null; }

  clearFilters(): void { this.search.set(''); this.folderFilter.set(''); this.stateFilter.set(''); }

  editDetails(): void {
    const c = this.collection();
    if (!c) return;
    const data: CollectionDialogData = { collection: c, tenantId: this.tenantId() };
    this.dialog.open<number | null>(CollectionDialog, { data }).closed.subscribe(id => { if (id) this.load(); });
  }

  private panel(requestId: number | null, folderId: number | null): void {
    const d = this.detail();
    if (!d) return;
    const data: RequestPanelData = {
      collection: d.collection, requestId, folderId, folders: d.folders, environments: d.environments,
      defaultAuth: this.defaultAuth(), canManage: this.canManage(), tenantId: this.tenantId(),
    };
    // Reloaded whatever the panel says on closing: the X and the backdrop close it without an answer.
    this.dialog.open<boolean>(RequestPanel, sidePanelConfig(data, 'wide', 'right')).closed.subscribe(() => this.load());
  }

  openRequest(r: RequestRow): void { this.panel(r.requestId, r.folderId); }

  addRequest(): void {
    const folder = this.folderFilter();
    this.panel(null, folder && folder !== 'top' ? Number(folder) : null);
  }

  toggleEnabled(r: RequestRow): void {
    this.api.setEnabled(r.requestId, !r.enabled, this.tenantId()).subscribe({
      next: res => { if (res.status === API_SUCCESS) { this.toast.success(res.message); this.load(); } else this.toast.error(res.message); },
      error: err => this.toast.error(err?.error?.message || 'The API could not be changed.'),
    });
  }

  async removeRequest(r: RequestRow): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${r.name}?`,
      body: 'The collection keeps its earlier versions. The service refuses while a pipeline, source or AI tool still uses it.',
      confirmLabel: 'Delete API', danger: true,
    });
    if (!ok) return;
    this.api.deleteRequest(r.requestId, this.tenantId()).subscribe({
      next: res => {
        if (res.status === API_SUCCESS) { this.toast.success(res.message); this.load(); return; }
        const users = usersOf(res);
        if (users.length) {
          const data: InUseData = { heading: `${r.name} is still in use`, message: res.message, users };
          this.dialog.open(InUseDialog, { data });
        } else this.toast.error(res.message);
      },
      error: err => this.toast.error(err?.error?.message || 'The API could not be deleted.'),
    });
  }

  newEnvironment(): void {
    const d = this.detail();
    if (!d) return;
    const data: EnvironmentDialogData = { collectionId: d.collection.collectionId, first: !d.environments.length, tenantId: this.tenantId() };
    this.dialog.open<boolean>(EnvironmentDialog, { data }).closed.subscribe(saved => { if (saved) this.load(); });
  }

  editEnvironment(env: EnvironmentRow): void {
    const d = this.detail();
    if (!d) return;
    const data: EnvironmentDialogData = { collectionId: d.collection.collectionId, environment: env, tenantId: this.tenantId() };
    this.dialog.open<boolean>(EnvironmentDialog, { data }).closed.subscribe(saved => { if (saved) this.load(); });
  }

  async removeEnvironment(env: EnvironmentRow): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Delete the ${env.name} environment?`,
      body: 'Its variables go with it, secrets included. A pipeline step that names it would have to name another.',
      confirmLabel: 'Delete environment', danger: true,
    });
    if (!ok) return;
    this.api.deleteEnvironment(env.environmentId, this.tenantId()).subscribe({
      next: r => { if (r.status === API_SUCCESS) { this.toast.success(r.message); this.load(); } else this.toast.error(r.message); },
      error: err => this.toast.error(err?.error?.message || 'The environment could not be deleted.'),
    });
  }
}
