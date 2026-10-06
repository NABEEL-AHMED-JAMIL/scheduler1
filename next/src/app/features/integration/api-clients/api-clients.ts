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
import {
  ApiClientRow, ApiClientWithSecret, ApiClientsApi, EventRouteRow, EventTypeRow, RouteTarget, ScopeRow, WebhookRow, WebhookWithSecret,
} from './api-clients.api';
import { ClientDialog, ClientDialogData, ClientDialogResult } from './client-dialog';
import { DeliveriesDialog, DeliveriesDialogData } from './deliveries-dialog';
import { RouteDialog, RouteDialogData } from './route-dialog';
import { SecretDialog, SecretDialogData } from './secret-dialog';
import { WebhookDialog, WebhookDialogData, WebhookDialogResult } from './webhook-dialog';
import { WebhookSecretDialog, WebhookSecretDialogData } from './webhook-secret-dialog';

/**
 * MIG-332: Integration › API Clients (workspace administrators). The workspace's API clients for the customer API --
 * the machine identities its own systems (a portal, a partner's sync) use -- each with its scopes, IP allowlist and last
 * day; New, Change, Rotate secret and Revoke. The secret is shown once. Below, the event routes: which pipeline or
 * workflow each of the organisation's event types starts (POST /v1/events); in a MANAGED workspace our team sets them.
 * MIG-333: then the webhooks -- where the platform tells the organisation's systems what happened (the event catalogue's
 * types), each signed with a secret shown once -- with New, Change, Pause/Resume, New secret and Remove (our team's in a
 * MANAGED workspace), and each webhook's deliveries, their attempts and Send again (the customer's in either mode).
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

  readonly webhooks = signal<WebhookRow[]>([]);
  readonly eventTypes = signal<EventTypeRow[]>([]);
  readonly webhooksLoading = signal(true);
  readonly webhooksError = signal('');
  readonly webhookBusy = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
    this.loadRoutes();
    this.loadWebhooks();
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

  // ------------------------------------------------------------------------------------------------ webhooks (MIG-333)

  loadWebhooks(): void {
    this.webhooksLoading.set(true);
    this.webhooksError.set('');
    this.api.webhookList().subscribe({
      next: r => {
        this.webhooksLoading.set(false);
        if (r.status === API_SUCCESS) this.webhooks.set(r.data ?? []);
        else this.webhooksError.set(r.message || 'The webhooks could not be read.');
      },
      error: err => {
        this.webhooksLoading.set(false);
        this.webhooksError.set(err?.error?.message || 'The webhooks could not be read.');
      },
    });
    this.api.eventTypes().subscribe({
      next: r => this.eventTypes.set(r.status === API_SUCCESS ? r.data ?? [] : []),
      error: () => this.eventTypes.set([]),
    });
  }

  webhookState(w: WebhookRow): string {
    return w.active ? (w.failingSince ? 'Failing' : 'Active') : 'Paused';
  }

  webhookPill(w: WebhookRow): string {
    return !w.active ? 'pill pill-neutral' : w.failingSince ? 'pill pill-warn' : 'pill pill-ok';
  }

  openWebhook(webhook: WebhookRow | null): void {
    const data: WebhookDialogData = { eventTypes: this.eventTypes(), webhook };
    this.dialog.open<WebhookDialogResult>(WebhookDialog, { data, hasBackdrop: true }).closed.subscribe(result => {
      if (!result) return;
      this.loadWebhooks();
      if ('made' in result) this.showWebhookSecret(result.made, false);
    });
  }

  openDeliveries(webhook: WebhookRow): void {
    const data: DeliveriesDialogData = { webhook };
    this.dialog.open<boolean>(DeliveriesDialog, { data, hasBackdrop: true }).closed.subscribe(sent => {
      if (sent) this.loadWebhooks();
    });
  }

  private showWebhookSecret(webhook: WebhookWithSecret, rotated: boolean): void {
    const data: WebhookSecretDialogData = { url: webhook.url, secret: webhook.secret, rotated };
    this.dialog.open(WebhookSecretDialog, { data, hasBackdrop: true, disableClose: true });
  }

  async setWebhookActive(webhook: WebhookRow, active: boolean): Promise<void> {
    if (!active) {
      const ok = await confirmWith(this.dialog, {
        title: 'Pause this webhook?',
        body: `Nothing more is sent to ${webhook.url} until it is resumed, and what is still waiting to be sent is dropped.`,
        confirmLabel: 'Pause',
        danger: true,
      });
      if (!ok) return;
    }
    this.webhookBusy.set(webhook.id);
    this.api.updateWebhook({ webhookId: webhook.id, active }).subscribe({
      next: r => {
        this.webhookBusy.set(null);
        if (r.status === API_SUCCESS) {
          this.toast.success(active ? 'Webhook resumed: new events are sent to it.' : 'Webhook paused.');
          this.loadWebhooks();
        } else {
          this.toast.error(r.message || 'The webhook could not be changed.');
        }
      },
      error: err => { this.webhookBusy.set(null); this.toast.error(err?.error?.message || 'The webhook could not be changed.'); },
    });
  }

  async rotateWebhook(webhook: WebhookRow): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: 'New signing secret?',
      body: 'Requests are signed with the new secret from now on, and with the old one too for 24 hours, so your receiver can '
        + 'switch over.',
      confirmLabel: 'Make a new secret',
    });
    if (!ok) return;
    this.webhookBusy.set(webhook.id);
    this.api.rotateWebhookSecret(webhook.id).subscribe({
      next: r => {
        this.webhookBusy.set(null);
        if (r.status === API_SUCCESS && r.data) {
          this.loadWebhooks();
          this.showWebhookSecret(r.data, true);
        } else {
          this.toast.error(r.message || 'The secret could not be changed.');
        }
      },
      error: err => { this.webhookBusy.set(null); this.toast.error(err?.error?.message || 'The secret could not be changed.'); },
    });
  }

  async removeWebhook(webhook: WebhookRow): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: 'Remove this webhook?',
      body: `Nothing more is sent to ${webhook.url}. Its delivery log goes with it.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    this.webhookBusy.set(webhook.id);
    this.api.deleteWebhook(webhook.id).subscribe({
      next: r => {
        this.webhookBusy.set(null);
        if (r.status === API_SUCCESS) {
          this.toast.success(r.message || 'Webhook removed.');
          this.loadWebhooks();
        } else {
          this.toast.error(r.message || 'The webhook could not be removed.');
        }
      },
      error: err => { this.webhookBusy.set(null); this.toast.error(err?.error?.message || 'The webhook could not be removed.'); },
    });
  }
}
