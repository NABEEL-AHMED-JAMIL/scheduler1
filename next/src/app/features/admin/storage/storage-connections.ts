import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { TableShell } from '../../../shared/ui/data-table';
import { StatusPill } from '../../../shared/ui/status-pill';
import { ConnectionDialog } from './connection-dialog';
import { Icon } from '../../../shared/ui/icon';

interface StorageConnection {
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
  imports: [Icon, DatePipe, CdkMenu, CdkMenuItem, CdkMenuTrigger, TableShell, StatusPill],
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
  readonly testing = signal<number | null>(null);

  readonly providers = computed(() =>
    [...new Set(this.connections().map(c => c.provider).filter(Boolean))].sort());

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const provider = this.providerFilter();
    return this.connections().filter(c => {
      if (provider && c.provider !== provider) return false;
      if (!term) return true;
      return (c.connectionName ?? '').toLowerCase().includes(term)
        || (c.alias ?? '').toLowerCase().includes(term)
        || (c.bucketName ?? '').toLowerCase().includes(term)
        || (c.host ?? '').toLowerCase().includes(term);
    });
  });

  readonly summary = computed(() => {
    const list = this.connections();
    return {
      total: list.length,
      active: list.filter(c => c.status === 'Active').length,
      ok: list.filter(c => c.connectionStatus === 'SUCCESS').length,
    };
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<StorageConnection[]>>(`${API_BASE}/storageConnection.json/fetchAllConnections`)
      .subscribe({
        next: response => {
          this.loading.set(false);
          if (response.status === API_SUCCESS) this.connections.set(response.data ?? []);
          else this.error.set(response.message);
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
    const ok = await confirmWith(this.dialog, {
      title: 'Delete connection',
      body: `"${connection.connectionName}" will be removed. Jobs and tasks pointing at "${connection.alias}" will stop resolving.`,
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

  clearFilters(): void {
    this.search.set('');
    this.providerFilter.set('');
  }
}
