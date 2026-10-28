import { WorkspaceSelect } from '../../../shared/ui/workspace-select';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { TableShell } from '../../../shared/ui/data-table';
import { StatTile } from '../../../shared/ui/stat-tile';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { ConfigValueDialog, ConfigValueDialogData } from './config-value-dialog';
import { PipelineConfig, TenantOption, configReference, workspaceLabel } from './configuration.models';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { createTableSort } from '../../../shared/ui/sort';
import { SortHeader } from '../../../shared/ui/sort-header';
import { InlineStatus, createLoadState } from '../../../shared/ui/loading';

const ENDPOINT = () => `${API_BASE}/setting.json/pipelineConfig`;

/**
 * Configuration values: the per-workspace store a task's payload reads through ${config:KEY}
 * and ${secret:KEY}. Replaces the part of the old Lookups screen that held pipeline settings --
 * where a secret was one ticked box away from being written back readable.
 */
@Component({
  selector: 'app-config-values',
  imports: [WorkspaceSelect, RefreshButton, PageHeader, TableShell, StatTile, Icon, ServerTimePipe, SortHeader, InlineStatus],
  templateUrl: './config-values.html',
})
export class ConfigValues implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  /** How a task names an entry, for the explanation above the list. Not in the template: a bare "{" there opens an ICU block. */
  readonly configRef = configReference('VALUE', 'KEY');
  readonly secretRef = configReference('SECRET', 'KEY');

  readonly rows = signal<PipelineConfig[]>([]);
  /** Owner 2026-10-27: the list's read; the tiles wait for it instead of showing 0 as if real. */
  readonly state = createLoadState();
  readonly loading = this.state.loading;
  readonly error = this.state.error;
  /** The workspace names (platform administrators): the New value dialog's workspace choices come from here too. */
  readonly tenantsState = createLoadState(false);
  readonly search = signal('');

  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());
  readonly tenants = signal<TenantOption[]>([]);
  readonly tenantFilter = signal(String(inject(WorkspaceDirectory).remembered() ?? ''));
  /** A platform administrator looking at every workspace at once needs to be told whose each row is. */
  readonly showWorkspace = computed(() => this.isPlatformAdmin() && !this.tenantFilter());

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.rows();
    return this.rows().filter(r =>
      r.key.toLowerCase().includes(term)
      || (r.description ?? '').toLowerCase().includes(term)
      || (r.kind === 'VALUE' && (r.value ?? '').toLowerCase().includes(term)));
  });

  /** Owner 2026-10-27: every column that holds a value sorts; the API's order until one is picked. */
  readonly sort = createTableSort<PipelineConfig>({
    id: 'config-values',
    columns: {
      key: r => r.key,
      workspace: r => this.workspaceName(r.tenantId),
      kind: { value: r => (r.kind === 'SECRET' ? 'Secret' : 'Value'), kind: 'text' },
      value: { value: r => (r.kind === 'SECRET' ? null : r.value), kind: 'text' },
      usedBy: { value: r => r.usedByTasks, kind: 'number' },
    },
  });
  readonly sorted = computed(() => this.sort.apply(this.filtered()));

  readonly stats = computed(() => {
    const rows = this.rows();
    return {
      values: rows.filter(r => r.kind === 'VALUE').length,
      secrets: rows.filter(r => r.kind === 'SECRET').length,
      inUse: rows.filter(r => r.usedByTasks > 0).length,
    };
  });

  ngOnInit(): void {
    if (this.isPlatformAdmin()) this.loadTenants();
    this.load();
  }

  loadTenants(): void {
    this.tenantsState.start();
    this.http.get<ApiResponse<TenantOption[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.tenantsState.fail(r, 'The workspace names could not be read.'); return; }
        this.tenants.set(r.data ?? []);
        this.tenantsState.done();
      },
      error: err => this.tenantsState.fail(err, 'The workspace names could not be read.'),
    });
  }

  setTenant(value: string | null | undefined): void {
    this.tenantFilter.set(value ?? '');
    this.load();
  }

  private ticket = 0;
  load(): void {
    const ticket = ++this.ticket;
    this.state.start();
    const params: Record<string, string> = {};
    if (this.tenantFilter()) params['tenantId'] = this.tenantFilter();
    this.http.get<ApiResponse<PipelineConfig[]>>(ENDPOINT(), { params }).subscribe({
      next: response => {
        if (ticket !== this.ticket) return;
        if (response.status !== API_SUCCESS) { this.state.fail(response, 'The configuration values could not be read.'); return; }
        this.rows.set(withoutSecrets(response.data ?? []));
        this.state.done();
      },
      error: err => {
        if (ticket !== this.ticket) return;
        this.state.fail(err, 'The configuration values could not be read.');
      },
    });
  }

  workspaceName(tenantId: number | null | undefined): string { return workspaceLabel(this.tenants(), tenantId); }

  reference(row: PipelineConfig): string { return configReference(row.kind, row.key); }

  inUseSentence(row: PipelineConfig): string {
    const n = row.usedByTasks;
    return `${n} ${n === 1 ? 'task still uses' : 'tasks still use'} ${row.key}. Change ${n === 1 ? 'it' : 'them'} to stop referencing it before deleting it.`;
  }

  create(): void {
    const tenantId = this.tenantFilter() ? Number(this.tenantFilter()) : null;
    this.open({ mode: 'create', tenants: this.tenants(), tenantId });
  }

  edit(row: PipelineConfig): void { this.open({ mode: 'edit', row }); }

  replaceSecret(row: PipelineConfig): void { this.open({ mode: 'replace', row }); }

  private open(data: ConfigValueDialogData): void {
    this.dialog.open<boolean>(ConfigValueDialog, { data }).closed
      .subscribe(saved => { if (saved) this.load(); });
  }

  async remove(row: PipelineConfig): Promise<void> {
    // The button is off already; this is the same rule for a call that reaches here anyway.
    if (row.usedByTasks > 0) { this.toast.error(this.inUseSentence(row)); return; }
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${row.key}?`,
      body: row.kind === 'SECRET'
        ? 'The secret is destroyed; it cannot be recovered. A task that references it later cannot be saved.'
        : 'A task that references it later cannot be saved.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    this.http.delete<ApiResponse>(ENDPOINT(), { params: { id: String(row.id) } }).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) { this.toast.error(response.message); return; }
        this.toast.success(response.message || `${row.key} deleted.`);
        this.load();
      },
      error: err => this.toast.error(err?.error?.message || 'The entry could not be deleted.'),
    });
  }
}

/**
 * Drops anything a SECRET row carries in `value`. No answer should hold one; if a server bug
 * ever sends it, it still never reaches a signal, the page or a copy button.
 */
export function withoutSecrets(rows: PipelineConfig[]): PipelineConfig[] {
  return rows.map(row => {
    if (row.kind !== 'SECRET') return row;
    const { value: _dropped, ...rest } = row;
    return rest;
  });
}
