import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { TableShell } from '../../../shared/ui/data-table';
import { StatusPill } from '../../../shared/ui/status-pill';
import { Icon } from '../../../shared/ui/icon';
import { createSort } from '../../../shared/ui/sort';
import { UserDialog } from './user-dialog';
import { PromptDialog } from '../../objects/dialogs/prompt-dialog';

export interface AppUser {
  appUserId: number;
  uuid?: string;
  username: string;
  fullName?: string;
  userRole: string;
  status: string;
  tenantId?: number;
  tenantName?: string;
  tenantActive?: boolean;
  dateCreated?: string;
  lastLoginAt?: string;
}

@Component({
  selector: 'app-users',
  imports: [DatePipe, CdkMenu, CdkMenuItem, CdkMenuTrigger, TableShell, StatusPill, Icon],
  templateUrl: './users.html',
})
export class Users implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  readonly users = signal<AppUser[]>([]);
  readonly tenants = signal<any[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly roleFilter = signal('');
  readonly statusFilter = signal('');
  readonly busy = signal<number | null>(null);

  readonly sort = createSort<AppUser>('fullName');

  readonly canPickTenant = computed(() => this.auth.role() === 'PLATFORM_ADMIN');
  readonly currentUserId = computed(() => this.auth.user()?.appUserId ?? null);

  readonly roles = computed(() =>
    [...new Set(this.users().map(u => u.userRole).filter(Boolean))].sort());

  readonly hasFilters = computed(() =>
    !!(this.search() || this.roleFilter() || this.statusFilter()));

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const role = this.roleFilter();
    const status = this.statusFilter();
    const rows = this.users().filter(user => {
      if (role && user.userRole !== role) return false;
      if (status && user.status !== status) return false;
      if (!term) return true;
      return (user.username ?? '').toLowerCase().includes(term)
        || (user.fullName ?? '').toLowerCase().includes(term)
        || (user.tenantName ?? '').toLowerCase().includes(term);
    });
    return this.sort.apply(rows, (row, key) => (row as any)[key]);
  });

  readonly summary = computed(() => {
    const list = this.users();
    return {
      total: list.length,
      active: list.filter(u => u.status === 'Active').length,
      admins: list.filter(u => u.userRole !== 'TENANT_USER').length,
      neverSignedIn: list.filter(u => !u.lastLoginAt).length,
    };
  });

  ngOnInit(): void {
    this.load();
    this.loadTenants();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<AppUser[]>>(`${API_BASE}/appUser.json/listUsers`).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status === API_SUCCESS) this.users.set(response.data ?? []);
        else this.error.set(response.message);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load users.');
      },
    });
  }

  private loadTenants(): void {
    if (!this.canPickTenant()) return;
    this.http.get<ApiResponse<any[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) this.tenants.set(response.data ?? []);
      },
    });
  }

  create(): void {
    this.dialog.open<boolean>(UserDialog, {
      data: { tenants: this.tenants(), canPickTenant: this.canPickTenant() }, hasBackdrop: true,
    }).closed.subscribe(saved => { if (saved) this.load(); });
  }

  edit(user: AppUser): void {
    this.dialog.open<boolean>(UserDialog, {
      data: { user, tenants: this.tenants(), canPickTenant: this.canPickTenant() }, hasBackdrop: true,
    }).closed.subscribe(saved => { if (saved) this.load(); });
  }

  /** Signing yourself out of the application is not a mistake worth allowing by accident. */
  isSelf(user: AppUser): boolean {
    return this.currentUserId() !== null && user.appUserId === this.currentUserId();
  }

  async toggleStatus(user: AppUser): Promise<void> {
    const activating = user.status !== 'Active';
    const ok = await confirmWith(this.dialog, {
      title: activating ? 'Activate user' : 'Deactivate user',
      body: activating
        ? `${user.fullName || user.username} will be able to sign in again.`
        : `${user.fullName || user.username} will be signed out and unable to sign in. Their work and history are kept.`,
      confirmLabel: activating ? 'Activate' : 'Deactivate',
      danger: !activating,
    });
    if (!ok) return;

    this.busy.set(user.appUserId);
    this.http.put<ApiResponse>(`${API_BASE}/appUser.json/changeUserStatus`,
      { appUserId: user.appUserId, status: activating ? 'Active' : 'Inactive' }).subscribe({
      next: response => {
        this.busy.set(null);
        if (response.status === API_SUCCESS) {
          this.toast.success(response.message);
          this.load();
        } else { this.toast.error(response.message); }
      },
      error: err => {
        this.busy.set(null);
        this.toast.error(err?.error?.message || 'Could not change the status.');
      },
    });
  }

  resetPassword(user: AppUser): void {
    this.dialog.open<string>(PromptDialog, {
      hasBackdrop: true,
      data: {
        title: `Reset password for ${user.fullName || user.username}`,
        label: 'New password',
        placeholder: 'At least 8 characters',
        confirmLabel: 'Reset password',
        hint: 'They will need this to sign in. It is stored hashed and cannot be read back.',
      },
    }).closed.subscribe(password => {
      if (!password) return;
      if (password.length < 8) {
        this.toast.error('Use at least 8 characters.');
        return;
      }
      this.http.put<ApiResponse>(`${API_BASE}/appUser.json/resetPassword`,
        { appUserId: user.appUserId, password }).subscribe({
        next: response => {
          response.status === API_SUCCESS
            ? this.toast.success(response.message)
            : this.toast.error(response.message);
        },
        error: err => this.toast.error(err?.error?.message || 'Could not reset the password.'),
      });
    });
  }

  roleLabel(role: string): string {
    return (role || '').replace(/_/g, ' ').toLowerCase();
  }

  rolePill(role: string): string {
    switch (role) {
      case 'PLATFORM_ADMIN': return 'pill pill-crit';
      case 'TENANT_ADMIN':   return 'pill pill-brand';
      default:               return 'pill pill-neutral';
    }
  }

  clearFilters(): void {
    this.search.set('');
    this.roleFilter.set('');
    this.statusFilter.set('');
  }
}
