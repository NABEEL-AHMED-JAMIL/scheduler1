import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { TableShell } from '../../../shared/ui/data-table';
import { StatusPill } from '../../../shared/ui/status-pill';
import { Dialog } from '@angular/cdk/dialog';
import { UserDialog } from './user-dialog';
import { AuthService } from '../../../core/auth/auth.service';

interface AppUser {
  appUserId: number;
  username: string;
  fullName?: string;
  email?: string;
  userRole: string;
  status: string;
  tenantId?: number;
  tenantName?: string;
}

@Component({
  selector: 'app-users',
  imports: [TableShell, StatusPill],
  templateUrl: './users.html',
})
export class Users implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly auth = inject(AuthService);
  readonly tenants = signal<any[]>([]);

  readonly users = signal<AppUser[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly roleFilter = signal('');

  readonly roles = computed(() =>
    [...new Set(this.users().map(u => u.userRole).filter(Boolean))].sort());

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const role = this.roleFilter();
    return this.users().filter(user => {
      if (role && user.userRole !== role) return false;
      if (!term) return true;
      return (user.username ?? '').toLowerCase().includes(term)
        || (user.fullName ?? '').toLowerCase().includes(term)
        || (user.email ?? '').toLowerCase().includes(term);
    });
  });

  ngOnInit(): void { this.load(); this.loadTenants(); }

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

  /** Only a platform admin can place a user in an arbitrary tenant. */
  readonly canPickTenant = computed(() => this.auth.role() === 'PLATFORM_ADMIN');

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

  roleLabel(role: string): string {
    return (role || '').replace(/_/g, ' ').toLowerCase();
  }

  clearFilters(): void {
    this.search.set('');
    this.roleFilter.set('');
  }
}
