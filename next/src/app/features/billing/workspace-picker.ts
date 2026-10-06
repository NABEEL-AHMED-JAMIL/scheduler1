import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { workspaceLabels } from './billing-format';

interface TenantOption { tenantId: number; tenantName: string; }

/**
 * Which workspace the billing screens are looking at. A workspace admin has no choice and the
 * value stays empty, which the server reads as "your own". A platform administrator's choice is shared
 * across the screens so it follows the person -- and until they choose, it is EMPTY, which
 * Invoices and Documents read as every workspace (their select says so) and Cost & usage, which
 * needs one, reads as the first (`effective`). The picker used to fill in the first workspace
 * for everyone, so a platform administrator opened Invoices scoped to the newest workspace under a
 * select that said "Every workspace", and a deep link to another workspace's invoice was
 * replaced by that workspace's first.
 */
@Injectable({ providedIn: 'root' })
export class WorkspacePicker {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly tenants = signal<TenantOption[]>([]);
  readonly tenantId = signal<string | null>(null);
  /** How each workspace is named in the pickers: two that share a name carry their ids, or they read as one. */
  readonly labels = computed(() => workspaceLabels(this.tenants()));
  readonly options = computed(() => this.tenants().map(t => ({ value: String(t.tenantId), label: this.labels().get(t.tenantId) ?? t.tenantName })));
  readonly isPlatformAdmin = this.auth.isPlatformAdmin;
  readonly name = computed(() => this.options().find(o => o.value === this.tenantId())?.label ?? '');
  /** The choice, or the first workspace when none was made: for the screens that must look at one. */
  readonly effective = computed(() => this.tenantId() ?? (this.tenants().length ? String(this.tenants()[0].tenantId) : null));
  private loaded = false;

  /** Runs `then` once a workspace is known: at once for a tenant administrator, after the list for a platform administrator. */
  ready(then: () => void): void {
    if (!this.isPlatformAdmin()) { then(); return; }
    if (this.loaded) { then(); return; }
    this.http.get<ApiResponse<TenantOption[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({
      next: r => {
        this.loaded = true;
        if (r.status === API_SUCCESS) this.tenants.set(r.data ?? []);
        then();
      },
      error: () => then(),
    });
  }
}
