import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { TableShell } from '../../shared/ui/data-table';
import { StatTile } from '../../shared/ui/stat-tile';
import { StatusPill } from '../../shared/ui/status-pill';
import { Icon } from '../../shared/ui/icon';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';

interface TenantRequest {
  tenantRequestId: number;
  organisationName: string;
  contactName: string;
  contactEmail: string;
  purpose?: string | null;
  status: string;
  dateCreated?: string;
  decidedAt?: string;
  decisionNote?: string | null;
  createdTenantId?: number | null;
}

/**
 * Requests for a workspace, waiting on a decision.
 *
 * Approving one creates a tenant and its first administrator, and emails that person a
 * password that works once. The password is generated on the server and never comes back in
 * the response, so it is not shown here -- an administrator granting a request has no reason
 * to hold somebody else's credential.
 */
@Component({
  selector: 'app-tenant-requests',
  imports: [TableShell, StatTile, StatusPill, Icon, DatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">Workspace Requests</h1>
          <p class="page-subtitle">
            Asks from outside for a workspace. Approving one creates the tenant, its first
            administrator, and emails them how to sign in.
          </p>
        </div>
        <button type="button" class="btn btn-default btn-sm" (click)="load()" [disabled]="loading()">
          <app-icon name="refresh" [class.spin]="loading()" />Refresh
        </button>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        @for (tile of [
          { label: 'Waiting',  value: summary().pending,  foot: 'need a decision', icon: 'inbox', tone: 'warn' },
          { label: 'Approved', value: summary().approved, foot: 'became tenants', icon: 'checkCircle', tone: 'ok' },
          { label: 'Rejected', value: summary().rejected, foot: 'declined', icon: 'xCircle', tone: 'info' },
          { label: 'Total',    value: summary().total,    foot: 'all time', icon: 'users', tone: 'info' }
        ]; track tile.label) {
          <app-stat-tile [label]="tile.label" [value]="tile.value" [icon]="tile.icon"
                         [tone]="$any(tile.tone)" [foot]="tile.foot" />
        }
      </div>

      <app-table-shell heading="Requests" [loading]="loading()" [error]="error()"
                       [isEmpty]="!requests().length" [shown]="requests().length"
                       [total]="requests().length"
                       emptyMessage="No requests yet. The form at /request-workspace feeds this list."
                       emptyIcon="inbox" (retry)="load()">
        <table class="table-modern">
          <thead>
            <tr>
              <th>Organisation</th><th>Contact</th><th>Asked for</th>
              <th>Received</th><th>Status</th><th class="w-12"></th>
            </tr>
          </thead>
          <tbody>
            @for (r of requests(); track r.tenantRequestId) {
              <tr>
                <td class="font-medium">{{ r.organisationName }}</td>
                <td>
                  <div class="text-sm">{{ r.contactName }}</div>
                  <div class="mono text-xs text-[color:var(--text-muted)]">{{ r.contactEmail }}</div>
                </td>
                <td class="text-sm max-w-72">
                  <span class="line-clamp-2" [title]="r.purpose || ''">{{ r.purpose || '—' }}</span>
                </td>
                <td class="text-xs text-[color:var(--text-secondary)] whitespace-nowrap">
                  {{ r.dateCreated ? (r.dateCreated | date:'d MMM y') : '—' }}
                </td>
                <td>
                  <app-status [label]="r.status" [quiet]="true" />
                  @if (r.status === 'Rejected' && r.decisionNote) {
                    <div class="text-xs text-[color:var(--text-muted)] mt-0.5 line-clamp-1"
                         [title]="r.decisionNote">{{ r.decisionNote }}</div>
                  }
                </td>
                <td>
                  @if (r.status === 'Pending') {
                    <div class="flex items-center gap-1">
                      <button type="button" class="btn btn-primary btn-sm"
                              [disabled]="busy() === r.tenantRequestId" (click)="approve(r)">
                        Approve
                      </button>
                      <button type="button" class="btn btn-ghost btn-sm"
                              [disabled]="busy() === r.tenantRequestId" (click)="reject(r)">
                        Reject
                      </button>
                    </div>
                  } @else {
                    <span class="text-xs text-[color:var(--text-muted)] whitespace-nowrap">
                      {{ r.decidedAt ? (r.decidedAt | date:'d MMM') : '' }}
                    </span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </app-table-shell>
    </div>
  `,
})
export class TenantRequests implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  readonly requests = signal<TenantRequest[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busy = signal<number | null>(null);

  readonly summary = computed(() => {
    const list = this.requests();
    return {
      total: list.length,
      pending: list.filter(r => r.status === 'Pending').length,
      approved: list.filter(r => r.status === 'Approved').length,
      rejected: list.filter(r => r.status === 'Rejected').length,
    };
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<TenantRequest[]>>(
      `${API_BASE}/tenantRequest.json/listRequests`).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS) { this.error.set(response.message); return; }
        this.requests.set(response.data ?? []);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load the requests.');
      },
    });
  }

  async approve(request: TenantRequest): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Create a workspace for ${request.organisationName}?`,
      body: `This creates the tenant and makes ${request.contactEmail} its first administrator. `
          + 'They are emailed a password that works once, and the console asks them to choose '
          + 'their own the first time they sign in.',
      confirmLabel: 'Approve and create',
    });
    if (!ok) return;
    this.busy.set(request.tenantRequestId);
    this.http.post<ApiResponse>(`${API_BASE}/tenantRequest.json/approve`, null,
      { params: new HttpParams().set('tenantRequestId', String(request.tenantRequestId)) }).subscribe({
      next: response => {
        this.busy.set(null);
        // A partial success is reported by the server in its message -- the tenant may exist
        // while the email did not send -- so the message is shown rather than a fixed line.
        if (response.status === API_SUCCESS) { this.toast.success(response.message); this.load(); }
        else this.toast.error(response.message);
      },
      error: err => {
        this.busy.set(null);
        this.toast.error(err?.error?.message || 'The workspace could not be created.');
      },
    });
  }

  async reject(request: TenantRequest): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Reject the request from ${request.organisationName}?`,
      body: 'No tenant or account is created. The request is kept, marked rejected.',
      confirmLabel: 'Reject request',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(request.tenantRequestId);
    this.http.post<ApiResponse>(`${API_BASE}/tenantRequest.json/reject`, null,
      { params: new HttpParams().set('tenantRequestId', String(request.tenantRequestId)) }).subscribe({
      next: response => {
        this.busy.set(null);
        if (response.status === API_SUCCESS) { this.toast.success(response.message); this.load(); }
        else this.toast.error(response.message);
      },
      error: err => {
        this.busy.set(null);
        this.toast.error(err?.error?.message || 'The request could not be rejected.');
      },
    });
  }
}
