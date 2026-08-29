import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { MineFilter, isMine } from '../../../shared/ui/mine-filter';
import { AuthService } from '../../../core/auth/auth.service';
import { StatusPill } from '../../../shared/ui/status-pill';
import { StatTile } from '../../../shared/ui/stat-tile';
import { TableShell } from '../../../shared/ui/data-table';
import { Icon } from '../../../shared/ui/icon';
import { ViewToggle } from '../../../shared/ui/view-toggle';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { createSort } from '../../../shared/ui/sort';
import { TenantDialog } from './tenant-dialog';

export interface Tenant {
  /** Filled in by the server on the way out; null on rows with no recorded author. */
  createdByName?: string | null;
  updatedByName?: string | null;
  /** The author's id, so "Only mine" matches on identity rather than display text. */
  createdBy?: number | null;

  tenantId: number;
  uuid?: string;
  tenantName: string;
  tenantCode: string;
  status: string;
  dateCreated?: string;
  userCount: number;
  kafkaProfileCount: number;
  bucketCount: number;
  sourceTaskTypeCount: number;
  sourceTaskCount: number;
  sourceJobCount: number;
}

interface ResourceCount {
  key: keyof Tenant;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-tenants',
  imports: [MineFilter, CdkMenu, CdkMenuItem, CdkMenuTrigger, ViewToggle, StatTile, Icon, DatePipe, StatusPill, TableShell],
  templateUrl: './tenants.html',
})
export class Tenants implements OnInit {
  /** Tenants started as cards; the table is the addition, so cards stay the default. */
  readonly view = signal<'table' | 'cards'>('cards');
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly tenants = signal<Tenant[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly statusFilter = signal('');
  readonly sort = createSort<Tenant>('tenantName');

  readonly resources: ResourceCount[] = [
    { key: 'userCount', label: 'Users', icon: 'users' },
    { key: 'sourceJobCount', label: 'Jobs', icon: 'briefcase' },
    { key: 'sourceTaskCount', label: 'Tasks', icon: 'list' },
    { key: 'sourceTaskTypeCount', label: 'Task types', icon: 'layers' },
    { key: 'bucketCount', label: 'Buckets', icon: 'cloud' },
    { key: 'kafkaProfileCount', label: 'Kafka', icon: 'server' },
  ];

  /**
   * The three worth a tile of their own.
   *
   * Six equal tiles meant six mostly-empty boxes: across the current tenants, task types and
   * Kafka profiles are zero for every single one, and jobs and tasks for all but one. A grid of
   * zeros says nothing and crowds out the two numbers that do vary.
   */
  readonly headlineResources: ResourceCount[] = this.resources.slice(0, 3);

  /** The rest, said in a sentence underneath rather than as more empty boxes. */
  readonly minorResources: ResourceCount[] = this.resources.slice(3);

  /**
   * A stable hue per metric, so the eye learns a position rather than re-reading the label.
   *
   * Previously every icon was brand-blue when non-zero and grey when zero, which on this data
   * meant almost every card was entirely grey. Colour now says which metric it is; weight says
   * whether there is any.
   */
  resourceTone(key: string): string {
    switch (key) {
      case 'userCount':      return 'icon-info';
      case 'sourceJobCount': return 'icon-ok';
      case 'sourceTaskCount':return 'icon-warn';
      default:               return 'icon-muted';
    }
  }

  /**
   * This tenant's share of the busiest one, for the bar under the headline figures.
   *
   * "4 users" on its own carries no scale. Against the largest workspace it does. Returns 0 when
   * nothing has any, so the bar renders empty rather than dividing by zero.
   */
  shareOf(tenant: Tenant, key: string): number {
    const largest = Math.max(...this.tenants().map(t => Number((t as any)[key]) || 0), 0);
    if (!largest) {
      return 0;
    }
    return Math.round(((Number((tenant as any)[key]) || 0) / largest) * 100);
  }

  /** The zero-valued minor metrics, phrased for the summary line. */
  quietSummary(tenant: Tenant): string {
    const has = this.minorResources.filter(r => Number((tenant as any)[r.key]) > 0);
    const missing = this.minorResources.filter(r => !Number((tenant as any)[r.key]));
    // "1 buckets" reads as a bug in the sentence. Every one of these labels is already plural,
    // so a count of one needs the trailing s taken off rather than added.
    const parts = has.map(r => {
      const count = Number((tenant as any)[r.key]);
      const label = r.label.toLowerCase();
      return `${count} ${count === 1 ? label.replace(/s$/, '') : label}`;
    });
    if (missing.length === this.minorResources.length) {
      return 'No task types, buckets or Kafka profiles yet';
    }
    return parts.join(' · ') + (missing.length ? ` · no ${missing.map(m => m.label.toLowerCase()).join(', ')}` : '');
  }

  private readonly auth = inject(AuthService);

  /** Narrows the list to rows this person created. Not persisted -- see MineFilter. */

  readonly onlyMine = signal(false);


  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    const rows = this.tenants().filter(tenant => {
      if (status && tenant.status !== status) return false;
      if (!term) return true;
      return `${tenant.tenantName} ${tenant.tenantCode}`.toLowerCase().includes(term);
    });
    return this.sort.apply(this.mine(rows), (row, key) => (row as any)[key]);
  });

  // Only mine narrows the list too, so Clear has to see it and reset it.
  readonly hasFilters = computed(() =>
    !!this.search().trim() || !!this.statusFilter() || this.onlyMine());

  readonly stats = computed(() => {
    const rows = this.tenants();
    const total = (key: keyof Tenant) =>
      rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
    return {
      tenants: rows.length,
      active: rows.filter(row => row.status === 'Active').length,
      suspended: rows.filter(row => row.status === 'Suspended' || row.status === 'Inactive').length,
      users: total('userCount'),
      jobs: total('sourceJobCount'),
      tasks: total('sourceTaskCount'),
      empty: rows.filter(row => this.resourceTotal(row) === 0).length,
    };
  });

  ngOnInit(): void {
    this.listTenants();
  }

  resourceTotal(tenant: Tenant): number {
    return this.resources.reduce((sum, res) => sum + (Number(tenant[res.key]) || 0), 0);
  }

  listTenants(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<Tenant[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status === API_SUCCESS) {
          this.tenants.set(response.data ?? []);
        } else {
          this.error.set(response.message || 'Tenants could not be loaded.');
        }
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Tenants could not be loaded.');
      },
    });
  }

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('');
    this.onlyMine.set(false);
  }

  addTenant(): void {
    this.dialog.open<boolean>(TenantDialog, { data: {} }).closed.subscribe(saved => {
      if (saved) this.listTenants();
    });
  }

  editTenant(tenant: Tenant): void {
    this.dialog.open<boolean>(TenantDialog, { data: { tenant } }).closed.subscribe(saved => {
      if (saved) this.listTenants();
    });
  }

  viewUsers(tenant: Tenant): void {
    this.router.navigate(['/admin/users'], { queryParams: { tenantId: tenant.tenantId } });
  }

  async toggleSuspend(tenant: Tenant): Promise<void> {
    const suspending = tenant.status === 'Active';
    const next = suspending ? 'Suspended' : 'Active';
    const ok = await confirmWith(this.dialog, {
      title: suspending ? `Suspend ${tenant.tenantName}?` : `Reactivate ${tenant.tenantName}?`,
      body: suspending
        ? `Users in ${tenant.tenantName} will not be able to sign in.`
          + (this.resourceTotal(tenant)
            ? ` Its ${this.resourceSummary(tenant)} are kept, and scheduled jobs keep their definitions.`
            : '')
        : `Users in ${tenant.tenantName} will be able to sign in again.`,
      confirmLabel: suspending ? 'Suspend' : 'Reactivate',
      danger: suspending,
    });
    if (!ok) return;
    this.changeStatus(tenant, next);
  }

  async deleteTenant(tenant: Tenant): Promise<void> {
    const total = this.resourceTotal(tenant);
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${tenant.tenantName}?`,
      body: total > 0
        ? `${tenant.tenantName} still owns ${total} resources (${this.resourceSummary(tenant)}). Deleting removes the tenant from this list; its data stays in the database but becomes unreachable. Suspend it instead if you only want to block sign-in.`
        : `${tenant.tenantName} owns no resources. It will be removed from this list.`,
      confirmLabel: 'Delete tenant',
      danger: true,
    });
    if (!ok) return;
    this.changeStatus(tenant, 'Delete');
  }

  resourceSummary(tenant: Tenant): string {
    return this.resources
      .filter(res => Number(tenant[res.key]) > 0)
      .map(res => {
        const count = Number(tenant[res.key]);
        const label = res.label.toLowerCase();
        return `${count} ${count === 1 ? label.replace(/s$/, '') : label}`;
      })
      .join(', ');
  }

  private changeStatus(tenant: Tenant, status: string): void {
    this.http.put<ApiResponse>(`${API_BASE}/tenant.json/changeTenantStatus`,
      { tenantId: tenant.tenantId, status }).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) {
          this.toast.success(response.message);
          this.listTenants();
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => this.toast.error(err?.error?.message || 'The tenant status could not be changed.'),
    });
  }

  /**
   * Applies the "Only mine" toggle.
   *
   * Pure -- it runs inside a computed, where writing a signal is not allowed. The surviving
   * count is already on the table header, so nothing needs recording.
   */
  private mine<T extends { createdBy?: number | null }>(rows: T[]): T[] {
    if (!this.onlyMine()) {
      return rows;
    }
    const myId = this.auth.user()?.appUserId ?? null;
    return rows.filter(row => isMine(row, myId));
  }
}
