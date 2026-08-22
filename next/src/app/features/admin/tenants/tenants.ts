import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { TableShell } from '../../../shared/ui/data-table';
import { StatusPill } from '../../../shared/ui/status-pill';
import { Dialog } from '@angular/cdk/dialog';
import { TenantDialog } from './tenant-dialog';
import { Icon } from '../../../shared/ui/icon';

interface Tenant {
  tenantId: number;
  tenantName: string;
  description?: string;
  status: string;
  dateCreated?: string;
}

@Component({
  selector: 'app-tenants',
  imports: [Icon, DatePipe, TableShell, StatusPill],
  templateUrl: './tenants.html',
})
export class Tenants implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);

  readonly tenants = signal<Tenant[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.tenants();
    return this.tenants().filter(t =>
      (t.tenantName ?? '').toLowerCase().includes(term) || String(t.tenantId).includes(term));
  });

  create(): void {
    this.dialog.open<boolean>(TenantDialog, { data: {}, hasBackdrop: true })
      .closed.subscribe(saved => { if (saved) this.load(); });
  }

  edit(tenant: Tenant): void {
    this.dialog.open<boolean>(TenantDialog, { data: { tenant }, hasBackdrop: true })
      .closed.subscribe(saved => { if (saved) this.load(); });
  }

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<Tenant[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status === API_SUCCESS) this.tenants.set(response.data ?? []);
        else this.error.set(response.message);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load tenants.');
      },
    });
  }
}
