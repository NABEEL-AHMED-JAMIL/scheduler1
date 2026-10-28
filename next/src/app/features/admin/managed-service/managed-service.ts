import { WorkspaceSelect } from '../../../shared/ui/workspace-select';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ManagementMode } from '../../../core/auth/auth.models';
import { TableShell } from '../../../shared/ui/data-table';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { GrantDialog, GrantDialogData, GrantWorkspace } from './grant-dialog';
import { ManagedGrant, ManagedServiceApi, StaffCandidate, personName, staffOf } from './managed-service.api';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { createTableSort } from '../../../shared/ui/sort';
import { SortHeader } from '../../../shared/ui/sort-header';
import { InlineStatus, createLoadState, loadErrorText } from '../../../shared/ui/loading';

interface TenantRow { tenantId: number; tenantName: string; status?: string; managementMode?: ManagementMode | null }

/**
 * MIG-254: Administration › Managed service (platform administrators). Which of our staff may work in which
 * customer's workspace: the grants, filtered on the server by workspace, staff member and whether revoked ones
 * show; Grant, and Revoke (which signs the staff member out everywhere).
 */
@Component({
  selector: 'app-managed-service',
  imports: [WorkspaceSelect, RefreshButton, PageHeader, TableShell, Icon, ServerTimePipe, RouterLink, SortHeader, InlineStatus],
  templateUrl: './managed-service.html',
})
export class ManagedService implements OnInit {
  private readonly api = inject(ManagedServiceApi);
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  readonly grants = signal<ManagedGrant[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly tenants = signal<GrantWorkspace[]>([]);
  readonly staff = signal<StaffCandidate[]>([]);
  readonly tenantFilter = signal<number | null>(inject(WorkspaceDirectory).remembered());
  readonly staffFilter = signal<number | null>(null);
  readonly includeRevoked = signal(false);
  /** The grant a revoke is in flight for. */
  readonly busy = signal<number | null>(null);
  readonly hasFilters = computed(() => !!this.tenantFilter() || !!this.staffFilter() || this.includeRevoked());
  readonly liveCount = computed(() => this.grants().filter(g => this.isLive(g)).length);
  readonly name = personName;
  /**
   * Owner 2026-10-27: the staff and workspace lists feed the filter and the Grant dialog; their state is said (the filter
   * reads "Loading staff…", a failure shows with Try again, and Grant waits for both) instead of empty lists that look
   * like "no staff member to grant".
   */
  readonly staffState = createLoadState();
  readonly tenantsState = createLoadState();
  readonly listsLoading = computed(() => this.staffState.loading() || this.tenantsState.loading());
  private seq = 0;

  /** Owner 2026-10-27: every column sorts; the grants keep the server's order until a heading is picked. */
  readonly sort = createTableSort<ManagedGrant>({
    id: 'managed-grants',
    columns: {
      staff: g => personName(g),
      workspace: g => this.workspaceName(g),
      granted: { value: g => g.grantedAt, kind: 'date' },
      revoked: { value: g => g.revokedAt, kind: 'date' },
      state: { value: g => (this.isLive(g) ? 'Live' : 'Revoked'), kind: 'status', order: ['Live', 'Revoked'] },
    },
  });
  readonly sorted = computed(() => this.sort.apply(this.grants()));

  ngOnInit(): void {
    this.load();
    this.loadTenants();
    this.loadStaff();
  }

  loadTenants(): void {
    this.tenantsState.start();
    this.http.get<ApiResponse<TenantRow[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.tenantsState.fail(r, 'The workspaces could not be read.'); return; }
        this.tenants.set((r.data ?? [])
          .filter(t => t.status !== 'Delete')
          .map(t => ({ tenantId: t.tenantId, tenantName: t.tenantName, managementMode: t.managementMode ?? null }))
          .sort((a, b) => a.tenantName.localeCompare(b.tenantName)));
        this.tenantsState.done();
      },
      error: err => this.tenantsState.fail(err, 'The workspaces could not be read.'),
    });
  }

  loadStaff(): void {
    this.staffState.start();
    this.api.users().subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.staffState.fail(r, 'The staff could not be read.'); return; }
        this.staff.set(staffOf(r.data ?? []));
        this.staffState.done();
      },
      error: err => this.staffState.fail(err, 'The staff could not be read.'),
    });
  }

  load(): void {
    const seq = ++this.seq;
    this.loading.set(true);
    this.error.set('');
    this.api.listGrants({ tenantId: this.tenantFilter(), appUserId: this.staffFilter(), includeRevoked: this.includeRevoked() })
      .subscribe({
        next: r => {
          // A filter changed meanwhile: the newer read answers for it.
          if (seq !== this.seq) return;
          this.loading.set(false);
          if (r.status === API_SUCCESS) this.grants.set(r.data ?? []);
          else this.error.set(loadErrorText(r, 'The grants could not be read.'));
        },
        error: err => {
          if (seq !== this.seq) return;
          this.loading.set(false);
          this.error.set(loadErrorText(err, 'The grants could not be read.'));
        },
      });
  }

  setTenant(value: string): void { this.tenantFilter.set(value ? Number(value) : null); this.load(); }
  setStaff(value: string): void { this.staffFilter.set(value ? Number(value) : null); this.load(); }
  setIncludeRevoked(value: boolean): void { this.includeRevoked.set(value); this.load(); }

  clearFilters(): void {
    this.tenantFilter.set(null);
    this.staffFilter.set(null);
    this.includeRevoked.set(false);
    this.load();
  }

  isLive(grant: ManagedGrant): boolean {
    return !grant.revokedAt;
  }

  workspaceName(grant: ManagedGrant): string {
    return grant.tenantName?.trim() || `Workspace ${grant.tenantId}`;
  }

  openGrant(): void {
    const data: GrantDialogData = { staff: this.staff(), tenants: this.tenants(), tenantId: this.tenantFilter(),
      appUserId: this.staffFilter(), staffError: this.staffState.error(), tenantsError: this.tenantsState.error() };
    this.dialog.open<boolean>(GrantDialog, { data, hasBackdrop: true }).closed.subscribe(granted => {
      if (granted) this.load();
    });
  }

  async revoke(grant: ManagedGrant): Promise<void> {
    const who = personName(grant);
    const where = this.workspaceName(grant);
    const ok = await confirmWith(this.dialog, {
      title: `Revoke ${who} in ${where}?`,
      body: `${who} is signed out everywhere now — their own platform session and any managed session — and can no `
        + `longer open a session in ${where}. What they changed there stays, and so does the record of it.`,
      confirmLabel: 'Revoke and sign out',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(grant.grantId);
    this.api.revoke(grant.tenantId, grant.appUserId).subscribe({
      next: r => {
        this.busy.set(null);
        if (r.status === API_SUCCESS) {
          this.toast.success(r.message || 'Revoked.');
          this.load();
        } else {
          this.toast.error(r.message || 'The grant could not be revoked.');
        }
      },
      error: err => {
        this.busy.set(null);
        this.toast.error(err?.error?.message || 'The grant could not be revoked.');
      },
    });
  }
}
