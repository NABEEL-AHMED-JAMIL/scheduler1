import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { TableShell } from '../../../shared/ui/data-table';
import { Icon } from '../../../shared/ui/icon';
import { ManagedBanner } from '../../../shared/ui/managed-banner';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { ApiClientRow, ApiClientWithSecret, ApiClientsApi, EventRouteRow, RouteTarget, ScopeRow } from './api-clients.api';
import { ClientDialog, ClientDialogData, ClientDialogResult } from './client-dialog';
import { RouteDialog, RouteDialogData } from './route-dialog';
import { SecretDialog, SecretDialogData } from './secret-dialog';

/**
 * MIG-332: Integration › API Clients (workspace administrators). The workspace's API clients for the customer API --
 * the machine identities its own systems (a portal, a partner's sync) use -- each with its scopes, IP allowlist and last
 * day; New, Change, Rotate secret and Revoke. The secret is shown once. Below, the event routes: which pipeline or
 * workflow each of the organisation's event types starts (POST /v1/events); in a MANAGED workspace our team sets them.
 */
@Component({
  selector: 'app-api-clients',
  imports: [TableShell, Icon, ServerTimePipe, ManagedBanner, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './api-clients.html',
})
export class ApiClients implements OnInit {
  private readonly api = inject(ApiClientsApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  readonly auth = inject(AuthService);

  readonly clients = signal<ApiClientRow[]>([]);
  readonly scopes = signal<ScopeRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly showRevoked = signal(false);
  /** The client a rotate or revoke is in flight for. */
  readonly busy = signal<string | null>(null);
  readonly shown = computed(() => this.clients().filter(c => this.showRevoked() || c.status !== 'Revoked'));
  readonly revokedCount = computed(() => this.clients().filter(c => c.status === 'Revoked').length);

  readonly routes = signal<EventRouteRow[]>([]);
  readonly pipelines = signal<RouteTarget[]>([]);
  readonly routesLoading = signal(true);
  readonly routesError = signal('');
  readonly routeBusy = signal<number | null>(null);

  ngOnInit(): void {
    this.load();
    this.loadRoutes();
    this.api.scopes().subscribe({
      next: r => this.scopes.set(r.status === API_SUCCESS ? r.data ?? [] : []),
      error: () => this.scopes.set([]),
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.list().subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status === API_SUCCESS) this.clients.set(r.data ?? []);
        else this.error.set(r.message || 'The API clients could not be read.');
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'The API clients could not be read.');
      },
    });
  }

  loadRoutes(): void {
    this.routesLoading.set(true);
    this.routesError.set('');
    this.api.routesList().subscribe({
      next: r => {
        this.routesLoading.set(false);
        if (r.status === API_SUCCESS) this.routes.set(r.data ?? []);
        else this.routesError.set(r.message || 'The event routes could not be read.');
      },
      error: err => {
        this.routesLoading.set(false);
        this.routesError.set(err?.error?.message || 'The event routes could not be read.');
      },
    });
    this.api.routeTargets().subscribe({
      next: r => this.pipelines.set(r.status === API_SUCCESS ? r.data?.pipelines ?? [] : []),
      error: () => this.pipelines.set([]),
    });
  }

  statusPill(client: ApiClientRow): string {
    return client.status === 'Active' ? 'pill pill-ok' : client.status === 'Expired' ? 'pill pill-warn' : 'pill pill-neutral';
  }

  openNew(): void {
    this.openClient(null);
  }

  openClient(client: ApiClientRow | null): void {
    const data: ClientDialogData = { scopes: this.scopes(), client };
    this.dialog.open<ClientDialogResult>(ClientDialog, { data, hasBackdrop: true }).closed.subscribe(result => {
      if (!result) return;
      this.load();
      if ('made' in result) this.showSecret(result.made, false);
    });
  }

  private showSecret(client: ApiClientWithSecret, rotated: boolean): void {
    const data: SecretDialogData = { name: client.name, clientId: client.clientId, clientSecret: client.clientSecret, rotated };
    this.dialog.open(SecretDialog, { data, hasBackdrop: true, disableClose: true });
  }

  async rotate(client: ApiClientRow): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `New secret for ${client.name}?`,
      body: 'The current secret stops working now, and so does every token the client holds. Your system needs the new '
        + 'secret before it can ask for another token.',
      confirmLabel: 'Make a new secret',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(client.clientId);
    this.api.rotateSecret(client.clientId).subscribe({
      next: r => {
        this.busy.set(null);
        if (r.status === API_SUCCESS && r.data) {
          this.load();
          this.showSecret(r.data, true);
        } else {
          this.toast.error(r.message || 'The secret could not be changed.');
        }
      },
      error: err => { this.busy.set(null); this.toast.error(err?.error?.message || 'The secret could not be changed.'); },
    });
  }

  async revoke(client: ApiClientRow): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Revoke ${client.name}?`,
      body: 'The client and every token it holds stop working now, for good. Make a new client to connect that system again.',
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(client.clientId);
    this.api.revoke(client.clientId).subscribe({
      next: r => {
        this.busy.set(null);
        if (r.status === API_SUCCESS) {
          this.toast.success(r.message || 'API client revoked.');
          this.load();
        } else {
          this.toast.error(r.message || 'The client could not be revoked.');
        }
      },
      error: err => { this.busy.set(null); this.toast.error(err?.error?.message || 'The client could not be revoked.'); },
    });
  }

  openRoute(route: EventRouteRow | null): void {
    const data: RouteDialogData = { pipelines: this.pipelines(), route };
    this.dialog.open<boolean>(RouteDialog, { data, hasBackdrop: true }).closed.subscribe(saved => {
      if (saved) this.loadRoutes();
    });
  }

  targetOf(route: EventRouteRow): string {
    return route.targetKind === 'PIPELINE' ? route.pipelineName || `Pipeline ${route.jobId}` : `Workflow ${route.workflowKey}`;
  }

  async removeRoute(route: EventRouteRow): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Remove the route for ${route.eventType}?`,
      body: `An event of type ${route.eventType} no longer starts ${this.targetOf(route)}.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    this.routeBusy.set(route.routeId);
    this.api.deleteRoute(route.routeId).subscribe({
      next: r => {
        this.routeBusy.set(null);
        if (r.status === API_SUCCESS) {
          this.toast.success(r.message || 'Event route removed.');
          this.loadRoutes();
        } else {
          this.toast.error(r.message || 'The route could not be removed.');
        }
      },
      error: err => { this.routeBusy.set(null); this.toast.error(err?.error?.message || 'The route could not be removed.'); },
    });
  }
}
