import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { MineFilter, isMine } from '../../../shared/ui/mine-filter';
import { AuthService } from '../../../core/auth/auth.service';
import { StatTile } from '../../../shared/ui/stat-tile';
import { confirmWith } from '../../../shared/ui/confirm';
import { TableShell } from '../../../shared/ui/data-table';
import { StatusPill } from '../../../shared/ui/status-pill';
import { ConnectionDialog } from './connection-dialog';
import { CloneDialog } from './clone-dialog';
import { Icon } from '../../../shared/ui/icon';
import { CopyButton } from '../../../shared/ui/copy-button';
import { copyText } from '../../../shared/ui/clipboard.util';
import type { TenantName } from '../../settings/kafka/kafka-connections';
import { ViewToggle } from '../../../shared/ui/view-toggle';
import { kafkaDependencyNote, kafkaProfilesUsing } from './kafka-dependents';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';

interface StorageConnection {
  /** Owning workspace; null for the two platform buckets. */
  tenantId?: number | null;
  /** The author's id, so "Only mine" matches on identity rather than display text. */
  createdBy?: number | null;

  /** Filled in by the server on the way out; null on rows with no recorded author. */
  createdByName?: string | null;
  updatedByName?: string | null;

  storageConnectionId: number;
  connectionName: string;
  alias: string;
  provider: string;
  bucketName?: string;
  region?: string;
  endpoint?: string;
  host?: string;
  port?: number;
  baseDirectory?: string;
  description?: string;
  status: string;
  connectionStatus?: string;
  lastTestedAt?: string;
  lastTestMessage?: string;
  secretKeyConfigured?: boolean;
  passwordConfigured?: boolean;
}

@Component({
  selector: 'app-storage-connections',
  imports: [MineFilter, ViewToggle, StatTile, Icon, ServerTimePipe, CdkMenu, CdkMenuItem, CdkMenuTrigger, TableShell, StatusPill, CopyButton],
  templateUrl: './storage-connections.html',
})
export class StorageConnections implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);

  readonly connections = signal<StorageConnection[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly providerFilter = signal('');
  readonly workspaceFilter = signal('');

  /**
   * Whose connection each row is. A platform administrator's list merges every workspace's, and
   * without a column a tenant bucket and a platform bucket looked the same; the Kafka screen
   * already carries this, so the two screens now answer the same question the same way.
   */
  private readonly tenants = signal<TenantName[]>([]);
  readonly canSeeWorkspace = computed(() => this.auth.isPlatformAdmin());
  readonly workspaces = computed(() => {
    const ids = new Set(this.connections().map(c => c.tenantId ?? 0));
    return [{ id: 0, name: 'Platform' }, ...this.tenants().map(t => ({ id: t.tenantId, name: t.tenantName }))]
      .filter(w => ids.has(w.id));
  });

  /** `<connectionId>:<alias|target>` of the thing just copied, so exactly one icon ticks. */
  readonly copiedKey = signal<string | null>(null);
  readonly testing = signal<number | null>(null);

  /** Ids ticked for a bulk action. Cleared after one runs, so a second click cannot repeat it. */
  readonly selected = signal<ReadonlySet<number>>(new Set());
  readonly bulkRunning = signal(false);
  readonly bulkProgress = signal('');
  /** Cards read better when a connection's target and test result matter more than a wide scan. */
  readonly view = signal<'table' | 'cards'>('table');

  readonly providers = computed(() =>
    [...new Set(this.connections().map(c => c.provider).filter(Boolean))].sort());

  /** Narrows the list to rows this person created. Not persisted -- see MineFilter. */

  private readonly auth = inject(AuthService);

  readonly onlyMine = signal(false);


  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const provider = this.providerFilter();
    const workspace = this.workspaceFilter();
    return this.mine(this.connections()).filter(c => {
      if (provider && c.provider !== provider) return false;
      if (workspace && String(c.tenantId ?? 0) !== workspace) return false;
      if (!term) return true;
      return (c.connectionName ?? '').toLowerCase().includes(term)
        || (c.alias ?? '').toLowerCase().includes(term)
        || (c.bucketName ?? '').toLowerCase().includes(term)
        || (c.host ?? '').toLowerCase().includes(term);
    });
  });

  /** True while anything narrows the table, which is when the tiles need saying out loud. */
  readonly isFiltered = computed(() =>
    !!this.search().trim() || !!this.providerFilter() || !!this.workspaceFilter() || this.onlyMine());

  /**
   * Counts the estate, not the filtered view -- the same choice Users and Tenants make, and the
   * one that is useful here: a failing connection matters whether or not it survives the search
   * box. Because the table header underneath counts the filtered view instead, the row says so
   * in a line beneath it while a filter is on.
   *
   * The tiles lead with `active` rather than `total`: the total is already on the card header
   * below and is the sum of the three test states, so it is the one figure on the row that says
   * nothing new, while an Inactive connection is resolved by no job, task or Kafka profile and
   * is reported nowhere else. It stays on the lead tile's foot as the denominator.
   */
  readonly summary = computed(() => {
    const list = this.connections();
    const withStatus = (value: string) => list.filter(c => c.connectionStatus === value).length;
    return {
      total: list.length,
      active: list.filter(c => c.status === 'Active').length,
      ok: withStatus('SUCCESS'),
      failing: withStatus('FAILED'),
      untested: list.filter(c => c.connectionStatus !== 'SUCCESS' && c.connectionStatus !== 'FAILED').length,
    };
  });

  ngOnInit(): void { this.load(); this.loadTenants(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<StorageConnection[]>>(`${API_BASE}/storageConnection.json/fetchAllConnections`)
      .subscribe({
        next: response => {
          this.loading.set(false);
          if (response.status === API_SUCCESS) {
            const rows = response.data ?? [];
            this.connections.set(rows);
            this.pruneSelection(rows);
          } else {
            this.error.set(response.message);
          }
        },
        error: err => {
          this.loading.set(false);
          this.error.set(err?.error?.message || 'Could not load connections.');
        },
      });
  }

  create(): void {
    this.dialog.open<boolean>(ConnectionDialog, { data: {}, hasBackdrop: true })
      .closed.subscribe(saved => { if (saved) this.load(); });
  }

  edit(connection: StorageConnection): void {
    this.dialog.open<boolean>(ConnectionDialog, { data: { connection }, hasBackdrop: true })
      .closed.subscribe(saved => { if (saved) this.load(); });
  }

  test(connection: StorageConnection): void {
    this.testing.set(connection.storageConnectionId);
    this.http.post<ApiResponse>(`${API_BASE}/storageConnection.json/testConnection`, null, {
      params: { storageConnectionId: String(connection.storageConnectionId) },
    }).subscribe({
      next: response => {
        this.testing.set(null);
        response.status === API_SUCCESS
          ? this.toast.success(response.message)
          : this.toast.error(response.message);
        this.load();
      },
      error: err => {
        this.testing.set(null);
        this.toast.error(err?.error?.message || 'The test could not be run.');
      },
    });
  }

  async remove(connection: StorageConnection): Promise<void> {
    // Kafka profiles bind to the alias and nothing warns about it anywhere else, so they are
    // named here, while the delete can still be called off.
    const kafka = kafkaDependencyNote(await kafkaProfilesUsing(this.http, connection.alias));
    const ok = await confirmWith(this.dialog, {
      title: 'Delete connection',
      body: `"${connection.connectionName}" will be removed. Jobs and tasks pointing at "${connection.alias}" will stop resolving.`
        + (kafka ? ` ${kafka}` : ''),
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;

    this.http.delete<ApiResponse>(`${API_BASE}/storageConnection.json/deleteConnection`, {
      params: { storageConnectionId: String(connection.storageConnectionId) },
    }).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) {
          this.toast.success(`${connection.connectionName} deleted.`);
          this.load();
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => this.toast.error(err?.error?.message || 'Delete failed.'),
    });
  }

  /** A glyph per provider, so a card is identifiable before its text is read. */
  providerGlyph(connection: StorageConnection): string {
    switch ((connection.provider ?? '').toUpperCase()) {
      case 'FTP':
      case 'FTPS':  return 'server';
      case 'AZURE': return 'database';
      default:      return 'cloud';
    }
  }

  /** What this connection actually points at, phrased per provider. */
  target(connection: StorageConnection): string {
    if (connection.provider === 'FTP' || connection.provider === 'FTPS') {
      const port = connection.port ? `:${connection.port}` : '';
      return `${connection.host ?? '—'}${port}${connection.baseDirectory ?? ''}`;
    }
    return connection.bucketName || connection.alias;
  }

  testPill(connection: StorageConnection): string {
    switch (connection.connectionStatus) {
      case 'SUCCESS': return 'pill pill-ok';
      case 'FAILED':  return 'pill pill-crit';
      default:        return 'pill pill-neutral';
    }
  }

  testGlyph(connection: StorageConnection): string {
    switch (connection.connectionStatus) {
      case 'SUCCESS': return 'checkCircle';
      case 'FAILED':  return 'xCircle';
      default:        return '';
    }
  }

  testLabel(connection: StorageConnection): string {
    switch (connection.connectionStatus) {
      case 'SUCCESS': return 'OK';
      case 'FAILED':  return 'Failed';
      default:        return 'Untested';
    }
  }

  /** Whether Clear is offered: anything that narrows the table, Only mine included. */
  readonly hasFilters = computed(() => this.isFiltered());

  clearFilters(): void {
    this.workspaceFilter.set('');
    this.search.set('');
    this.providerFilter.set('');
    this.onlyMine.set(false);
  }

  /**
   * Applies the "Only mine" toggle.
   *
   * Kept pure -- it runs inside a computed, and writing a signal from there is not allowed. The
   * count of what survives is already on the table header, so nothing needs to be recorded.
   */
  private mine<T extends { createdBy?: number | null }>(rows: T[]): T[] {
    if (!this.onlyMine()) {
      return rows;
    }
    const myId = this.auth.user()?.appUserId ?? null;
    return rows.filter(row => isMine(row, myId));
  }

  isSelected(id: number): boolean {
    return this.selected().has(id);
  }

  clearSelection(): void {
    this.selected.set(new Set());
  }

  /**
   * Drops ticks for rows that are no longer there. A deleted row left its id in the set, so the
   * bulk bar went on counting a connection that could not be tested -- and with every ticked row
   * deleted the bar stayed open over an empty selection.
   */
  private pruneSelection(rows: StorageConnection[]): void {
    const current = this.selected();
    if (!current.size) return;
    const present = new Set(rows.map(c => c.storageConnectionId));
    const kept = [...current].filter(id => present.has(id));
    if (kept.length !== current.size) this.selected.set(new Set(kept));
  }

  toggleSelected(id: number): void {
    const next = new Set(this.selected());
    if (!next.delete(id)) {
      next.add(id);
    }
    this.selected.set(next);
  }

  /** Ticks or clears everything currently on screen, not everything that exists. */
  toggleAll(): void {
    const shown = this.filtered().map(c => c.storageConnectionId);
    this.selected.set(shown.every(id => this.selected().has(id))
      ? new Set()
      : new Set(shown));
  }

  readonly allShownSelected = computed(() => {
    const shown = this.filtered();
    return shown.length > 0 && shown.every(c => this.selected().has(c.storageConnectionId));
  });

  clone(connection: StorageConnection): void {
    this.dialog.open<boolean>(CloneDialog, { data: { connection }, hasBackdrop: true })
      .closed.subscribe(saved => { if (saved) this.load(); });
  }

  /**
   * Tests every ticked connection, one after another.
   *
   * Sequential rather than parallel: each test opens a real connection to a storage server, and
   * firing twenty at once is a burst of load on something that may be shared. The count moves as
   * it goes so a long run does not look stuck.
   *
   * Everything ticked is tested, not only what the filter leaves on screen. Intersecting the two
   * meant that typing in the search box after ticking five rows silently tested two of them,
   * cleared all five ticks and reported "All 2 reached their bucket" -- with the bar above still
   * saying five were selected. A tick is a choice about a connection; a filter is a choice about
   * the view. Ids that no longer exist are already dropped by pruneSelection on every load.
   */
  async testSelected(): Promise<void> {
    const ids = [...this.selected()];
    if (!ids.length) {
      this.toast.error('Tick the connections you want to test.');
      return;
    }
    this.bulkRunning.set(true);
    let passed = 0;
    let failed = 0;
    for (let i = 0; i < ids.length; i++) {
      this.bulkProgress.set(`Testing ${i + 1} of ${ids.length}…`);
      try {
        const response = await firstValueFrom(this.http.post<ApiResponse>(
          `${API_BASE}/storageConnection.json/testConnection`, null,
          { params: { storageConnectionId: String(ids[i]) } }));
        response.status === API_SUCCESS ? passed++ : failed++;
      } catch {
        failed++;
      }
    }
    this.bulkRunning.set(false);
    this.bulkProgress.set('');
    this.selected.set(new Set());
    this.load();
    // Both numbers, always: "18 passed" alone hides that two did not.
    failed === 0
      ? this.toast.success(`All ${passed} reached their bucket.`)
      : this.toast.error(`${passed} reached their bucket, ${failed} did not — see Last test.`);
  }

  private loadTenants(): void {
    if (!this.canSeeWorkspace()) return;
    this.http.get<ApiResponse<TenantName[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({
      next: response => { if (response.status === API_SUCCESS) this.tenants.set(response.data ?? []); },
      error: () => {},
    });
  }

  workspaceName(c: StorageConnection): string {
    if (c.tenantId == null) return 'Platform';
    return this.tenants().find(t => t.tenantId === c.tenantId)?.tenantName ?? `Tenant ${c.tenantId}`;
  }

  workspaceHint(c: StorageConnection): string {
    return c.tenantId == null
      ? 'Platform-owned — one of the two buckets the console itself uses'
      : `Workspace: ${this.workspaceName(c)}`;
  }

  /**
   * The alias is what a task, a form and the Analytics Studio name a connection by, and the
   * target is the bucket an IAM policy names; both truncate or wrap in a column, and a
   * hand-selected cell copies the line breaks with it.
   */
  copyValue(id: number | undefined, field: 'alias' | 'target', value: string): void {
    copyText(value ?? '').then(ok => {
      if (!ok) { this.toast.error('Could not copy that. Select it and copy by hand.'); return; }
      const key = `${id}:${field}`;
      this.copiedKey.set(key);
      setTimeout(() => { if (this.copiedKey() === key) this.copiedKey.set(null); }, 1500);
    });
  }
}
