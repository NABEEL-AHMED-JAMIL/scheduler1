import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';

interface TenantOption { tenantId: number; tenantName: string; }

/**
 * Which workspace the billing screens are looking at. A platform admin picks one (the first,
 * until they do); a workspace admin has no choice and the value stays empty, which the server
 * reads as "your own". Shared across the four screens so the choice follows the person.
 */
@Injectable({ providedIn: 'root' })
export class WorkspacePicker {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly tenants = signal<TenantOption[]>([]);
  readonly tenantId = signal<string | null>(null);
  readonly options = computed(() => this.tenants().map(t => ({ value: String(t.tenantId), label: t.tenantName })));
  readonly isPlatformAdmin = this.auth.isPlatformAdmin;
  readonly name = computed(() => this.tenants().find(t => String(t.tenantId) === this.tenantId())?.tenantName ?? '');
  private loaded = false;

  /** Runs `then` once a workspace is known: at once for a tenant admin, after the list for a platform admin. */
  ready(then: () => void): void {
    if (!this.isPlatformAdmin()) { then(); return; }
    if (this.loaded && this.tenantId()) { then(); return; }
    this.http.get<ApiResponse<TenantOption[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({
      next: r => {
        this.loaded = true;
        if (r.status === API_SUCCESS) this.tenants.set(r.data ?? []);
        if (!this.tenantId() && this.tenants().length) this.tenantId.set(String(this.tenants()[0].tenantId));
        then();
      },
      error: () => then(),
    });
  }
}
