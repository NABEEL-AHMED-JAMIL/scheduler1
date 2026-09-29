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
  CollectionDetail, EnvironmentRow, RequestRow, UsageRow, authLabel, effectiveAuthMode, sourceLabel,
} from './api-collections.model';
import { ApiCollectionsApi, usersOf } from './api-collections.service';
import { currentDefaultAuth } from './collection-save';
import { CollectionDialog, CollectionDialogData } from './collection-dialog';
import { EnvironmentDialog, EnvironmentDialogData } from './environment-dialog';
import { InUseDialog, InUseData } from './in-use-dialog';
import { RequestPanel, RequestPanelData } from './request-panel';
import { folderOptions } from './folders';
import { LastTests } from './last-tests';
import { SensitivityTag } from '../../../shared/ui/sensitivity';

const USER_KINDS: Record<string, string> = { PIPELINE: 'Pipeline', SOURCE: 'Source', AI_TOOL: 'AI tool' };

/**
 * One API collection (MIG-247): its APIs, edited and tested in the wide side panel; its environments, where a
 * secret is "••• configured" and can only be replaced; its versions; and who uses its APIs. Reading is for every
 * member who holds the api-collections page; Add API, Edit, Enable/Disable, Delete and the environments' writes
 * are a workspace administrator's.
 */
@Component({
  selector: 'app-api-collection',
  imports: [Icon, SensitivityTag, TableShell, StatusPill, StatStrip, ViewToggle, DataText, ServerTimePipe, CdkMenu, CdkMenuItem, CdkMenuTrigger, RouterLink],
  templateUrl: './collection.html',
})
export class Collection implements OnChanges {
  private readonly api = inject(ApiCollectionsApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly lastTests = inject(LastTests);

  /** From the route, :collectionId. */
  readonly collectionId = input<string>();

  readonly detail = signal<CollectionDetail | null>(null);
  readonly defaultAuth = signal<unknown>(null);
  readonly usage = signal<UsageRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly missing = signal(false);
  readonly view = signal<ListView>('table');
  readonly search = signal('');
  readonly folderFilter = signal('');
  readonly stateFilter = signal('');
  readonly canManage = computed(() => this.auth.isTenantAdmin());

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

  private id(): number | null {
    const raw = this.collectionId();
    return isRecordId(raw) ? Number(raw) : null;
  }

  load(): void {
    const id = this.id();
    this.error.set('');
    this.missing.set(false);
    if (id === null) { this.loading.set(false); this.missing.set(true); this.error.set('There is no API collection at this address.'); return; }
    this.loading.set(true);
    this.api.get(id).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS || !r.data) {
          this.missing.set(isMissingRecord(r) || /\bnot found\.$/i.test(r.message));
          this.error.set(r.message);
          return;
        }
        this.detail.set(r.data);
        this.readAuth(r.data);
      },
      error: err => {
        this.loading.set(false);
        this.missing.set(isMissingRecord({ status: err?.status }));
        this.error.set(err?.error?.message || 'Could not load the collection.');
      },
    });
    this.api.usage(id).subscribe({
      next: r => this.usage.set(r.status === API_SUCCESS ? r.data ?? [] : []),
      error: () => this.usage.set([]),
    });
  }

  /** The default auth is only in a version's snapshot; the APIs' Auth column and the editor need it. */
  private readAuth(d: CollectionDetail): void {
    currentDefaultAuth(this.api, d.collection).subscribe({
      next: read => this.defaultAuth.set('error' in read ? null : read.auth),
      error: () => this.defaultAuth.set(null),
    });
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
    const data: CollectionDialogData = { collection: c };
    this.dialog.open<number | null>(CollectionDialog, { data }).closed.subscribe(id => { if (id) this.load(); });
  }

  private panel(requestId: number | null, folderId: number | null): void {
    const d = this.detail();
    if (!d) return;
    const data: RequestPanelData = {
      collection: d.collection, requestId, folderId, folders: d.folders, environments: d.environments,
      defaultAuth: this.defaultAuth(), canManage: this.canManage(),
    };
    // Reloaded whatever the panel says on closing: the X and the backdrop close it without an answer.
    this.dialog.open<boolean>(RequestPanel, sidePanelConfig(data, 'wide')).closed.subscribe(() => this.load());
  }

  openRequest(r: RequestRow): void { this.panel(r.requestId, r.folderId); }

  addRequest(): void {
    const folder = this.folderFilter();
    this.panel(null, folder && folder !== 'top' ? Number(folder) : null);
  }

  toggleEnabled(r: RequestRow): void {
    this.api.setEnabled(r.requestId, !r.enabled).subscribe({
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
    this.api.deleteRequest(r.requestId).subscribe({
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
    const data: EnvironmentDialogData = { collectionId: d.collection.collectionId, first: !d.environments.length };
    this.dialog.open<boolean>(EnvironmentDialog, { data }).closed.subscribe(saved => { if (saved) this.load(); });
  }

  editEnvironment(env: EnvironmentRow): void {
    const d = this.detail();
    if (!d) return;
    const data: EnvironmentDialogData = { collectionId: d.collection.collectionId, environment: env };
    this.dialog.open<boolean>(EnvironmentDialog, { data }).closed.subscribe(saved => { if (saved) this.load(); });
  }

  async removeEnvironment(env: EnvironmentRow): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Delete the ${env.name} environment?`,
      body: 'Its variables go with it, secrets included. A pipeline step that names it would have to name another.',
      confirmLabel: 'Delete environment', danger: true,
    });
    if (!ok) return;
    this.api.deleteEnvironment(env.environmentId).subscribe({
      next: r => { if (r.status === API_SUCCESS) { this.toast.success(r.message); this.load(); } else this.toast.error(r.message); },
      error: err => this.toast.error(err?.error?.message || 'The environment could not be deleted.'),
    });
  }
}
