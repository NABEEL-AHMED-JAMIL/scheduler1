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
  ApiClientRow, ApiClientWithSecret, ApiClientsApi, ApiLimitsRow, EventRouteRow, EventTypeRow, RESULT_FORMATS, RouteTarget, ScopeRow,
  WebhookRow, WebhookWithSecret,
} from './api-clients.api';
import { ClientDialog, ClientDialogData, ClientDialogResult } from './client-dialog';
import { DeliveriesDialog, DeliveriesDialogData } from './deliveries-dialog';
import { RouteDialog, RouteDialogData } from './route-dialog';
import { SecretDialog, SecretDialogData } from './secret-dialog';
import { WebhookDialog, WebhookDialogData, WebhookDialogResult } from './webhook-dialog';
import { WebhookSecretDialog, WebhookSecretDialogData } from './webhook-secret-dialog';
import { SandboxPanel } from './sandbox-panel';
import { ClientHistoryData, ClientHistoryPanel } from './client-history-panel';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { WorkspaceSelect } from '../../../shared/ui/workspace-select';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { ApiLimitsDialog, ApiLimitsDialogData } from '../../admin/tenants/api-limits-dialog';
import { createTableSort } from '../../../shared/ui/sort';
import { SortHeader } from '../../../shared/ui/sort-header';
import { InlineStatus, createLoadState } from '../../../shared/ui/loading';

/**
 * MIG-332: Integration › API Clients (workspace administrators). The workspace's API clients for the customer API --
 * the machine identities its own systems (a portal, a partner's sync) use -- each with its scopes, IP allowlist and last
 * day; New, Change, Rotate secret and Revoke. The secret is shown once. Below, the event routes: which pipeline or
 * workflow each of the organisation's event types starts (POST /v1/events); in a MANAGED workspace our team sets them.
 * MIG-333: then the webhooks -- where the platform tells the organisation's systems what happened (the event catalogue's
 * types), each signed with a secret shown once -- with New, Change, Pause/Resume, New secret and Remove (our team's in a
 * MANAGED workspace), and each webhook's deliveries, their attempts and Send again (the customer's in either mode).
 * MIG-337: each client's limit and calls this month, and the workspace's limits and monthly quota above the list; a client's
 * own limit is set in Change (our team's in a MANAGED workspace), the workspace's bounds in Administration › Tenants.
 * MIG-336: below the clients, the workspace's sandbox and its test keys (SandboxPanel).
 *
 * A platform administrator has no workspace of his own: he picks one in the header (the shared workspace selector, opening
 * on the one picked last this session), and until he does the page asks for one instead of reading anything. Every read
 * and write then names that workspace (tenantId), and he may change its API limits here. A workspace administrator sees
 * no selector and works in their own workspace, as before.
 */
@Component({
  selector: 'app-api-clients',
  imports: [RefreshButton, PageHeader, TableShell, Icon, ServerTimePipe, ManagedBanner, CdkMenu, CdkMenuItem, CdkMenuTrigger, SandboxPanel,
    WorkspaceSelect, SortHeader, InlineStatus],
  templateUrl: './api-clients.html',
})
export class ApiClients implements OnInit {
  private readonly api = inject(ApiClientsApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  readonly auth = inject(AuthService);
  readonly directory = inject(WorkspaceDirectory);

  /** The workspace a platform administrator picked (this session's last choice to start with); null for anyone else. */
  readonly tenantId = signal<number | null>(this.directory.remembered());
  /** A platform administrator who has not picked a workspace yet: the page asks for one and reads nothing. */
  readonly needsWorkspace = computed(() => this.directory.picks() && this.tenantId() === null);

  readonly clients = signal<ApiClientRow[]>([]);
  readonly scopes = signal<ScopeRow[]>([]);
  /**
   * Owner 2026-10-27: the scopes feed New API client; a failed read used to leave the button disabled with no word, so
   * the page now says why and offers Try again.
   */
  readonly scopesState = createLoadState();
  /** The clients' read: loading until the first answer, so the table never says "No API clients yet" before it. */
  readonly state = createLoadState();
  readonly loading = this.state.loading;
  readonly error = this.state.error;
  readonly showRevoked = signal(false);
  /** The client a rotate or revoke is in flight for. */
  readonly busy = signal<string | null>(null);
  readonly shown = computed(() => this.clients().filter(c => this.showRevoked() || c.status !== 'Revoked'));
  readonly revokedCount = computed(() => this.clients().filter(c => c.status === 'Revoked').length);
  /** Owner 2026-10-27: every column that holds one value sorts; the list keeps the API's order until one is picked. */
  readonly clientSort = createTableSort<ApiClientRow>({
    id: 'api-clients',
    columns: {
      name: c => c.name,
      allowed: c => c.ipAllowlist.join(', '),
      limit: { value: c => c.limit?.ratePerMinute, kind: 'number' },
      calls: { value: c => c.callsThisMonth, kind: 'number' },
      lastUsed: { value: c => c.lastUsedAt, kind: 'date' },
      expires: { value: c => c.expiresAt, kind: 'date' },
      state: { value: c => c.status, kind: 'status' },
    },
  });
  readonly sortedClients = computed(() => this.clientSort.apply(this.shown()));

  readonly routes = signal<EventRouteRow[]>([]);
  readonly pipelines = signal<RouteTarget[]>([]);
  readonly routesState = createLoadState();
  readonly routesLoading = this.routesState.loading;
  readonly routesError = this.routesState.error;
  readonly routeSort = createTableSort<EventRouteRow>({
    id: 'api-client-routes',
    columns: {
      eventType: r => r.eventType,
      target: r => this.targetOf(r),
      contract: r => r.contractName || (r.contractId ? 'Contract ' + r.contractId : ''),
      state: { value: r => (r.active ? 'Active' : 'Inactive'), kind: 'status' },
    },
  });
  readonly sortedRoutes = computed(() => this.routeSort.apply(this.routes()));
  readonly routeBusy = signal<number | null>(null);

  readonly webhooks = signal<WebhookRow[]>([]);
  readonly eventTypes = signal<EventTypeRow[]>([]);
  readonly webhooksState = createLoadState();
  readonly webhooksLoading = this.webhooksState.loading;
  readonly webhooksError = this.webhooksState.error;
  readonly webhookSort = createTableSort<WebhookRow>({
    id: 'api-client-webhooks',
    columns: {
      url: w => w.url,
      lastDelivered: { value: w => w.lastSuccessAt, kind: 'date' },
      // What wants a look first: a failing webhook, then a paused one.
      state: { value: w => this.webhookState(w), kind: 'status', order: ['Failing', 'Paused', 'Active'] },
    },
  });
  readonly sortedWebhooks = computed(() => this.webhookSort.apply(this.webhooks()));
  readonly webhookBusy = signal<string | null>(null);

  /** MIG-337: the workspace's API limits and this month's calls; null until read (or when they cannot be). */
  readonly limits = signal<ApiLimitsRow | null>(null);
  /**
   * Owner 2026-10-27: the limits card was simply absent when its read failed, so the quota looked unset; it now says
   * the limits could not be read, with Try again.
   */
  readonly limitsState = createLoadState();

  ngOnInit(): void {
    if (!this.needsWorkspace()) this.loadAll();
    this.loadScopes();
  }

  loadScopes(): void {
    this.scopesState.start();
    this.api.scopes().subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.scopes.set([]); this.scopesState.fail(r, 'The API scopes could not be read, so no client can be made yet.'); return; }
        this.scopes.set(r.data ?? []);
        this.scopesState.done();
      },
      error: err => { this.scopes.set([]); this.scopesState.fail(err, 'The API scopes could not be read, so no client can be made yet.'); },
    });
  }

  /** Why New API client is disabled, as its tooltip. */
  readonly newClientBlocked = computed(() => this.scopesState.loading() ? 'Reading the API scopes…'
    : this.scopesState.error() ? this.scopesState.error() : !this.scopes().length ? 'No API scope is available.' : '');

  /** Every section of the page, for the workspace shown. */
  loadAll(): void {
    this.load();
    this.loadRoutes();
    this.loadWebhooks();
  }

  /** A platform administrator's pick: nothing of the last workspace stays on screen while the new one is read. */
  pickWorkspace(id: number | null): void {
    this.tenantId.set(id);
    this.clients.set([]);
    this.limits.set(null);
    this.routes.set([]);
    this.pipelines.set([]);
    this.webhooks.set([]);
    this.showRevoked.set(false);
    if (id !== null) this.loadAll();
  }

  load(): void {
    this.state.start();
    const asked = this.tenantId();
    this.loadLimits();
    this.api.list(asked).subscribe({
      next: r => {
        if (asked !== this.tenantId()) return;
        if (r.status !== API_SUCCESS) { this.state.fail(r, 'The API clients could not be read.'); return; }
        this.clients.set(r.data ?? []);
        this.state.done();
      },
      error: err => {
        if (asked !== this.tenantId()) return;
        this.state.fail(err, 'The API clients could not be read.');
      },
    });
  }

  loadLimits(): void {
    this.limitsState.start();
    const asked = this.tenantId();
    this.api.limits(asked).subscribe({
      next: r => {
        if (asked !== this.tenantId()) return;
        if (r.status !== API_SUCCESS) { this.limits.set(null); this.limitsState.fail(r, 'The API limits could not be read.'); return; }
        this.limits.set(r.data ?? null);
        this.limitsState.done();
      },
      error: err => {
        if (asked !== this.tenantId()) return;
        this.limits.set(null);
        this.limitsState.fail(err, 'The API limits could not be read.');
      },
    });
  }

  loadRoutes(): void {
    this.routesState.start();
    const asked = this.tenantId();
    this.api.routesList(asked).subscribe({
      next: r => {
        if (asked !== this.tenantId()) return;
        if (r.status !== API_SUCCESS) { this.routesState.fail(r, 'The event routes could not be read.'); return; }
        this.routes.set(r.data ?? []);
        this.routesState.done();
      },
      error: err => {
        if (asked !== this.tenantId()) return;
        this.routesState.fail(err, 'The event routes could not be read.');
      },
    });
    this.api.routeTargets(asked).subscribe({
      next: r => { if (asked === this.tenantId()) this.pipelines.set(r.status === API_SUCCESS ? r.data?.pipelines ?? [] : []); },
      error: () => { if (asked === this.tenantId()) this.pipelines.set([]); },
    });
  }

  /** MIG-337: a platform administrator changes the picked workspace's bounds here, as in Administration › Tenants. */
  changeLimits(): void {
    const tenantId = this.tenantId();
    if (tenantId === null) return;
    const data: ApiLimitsDialogData = { tenantId, tenantName: this.directory.nameOf(tenantId) };
    this.dialog.open<boolean>(ApiLimitsDialog, { data, hasBackdrop: true }).closed.subscribe(saved => {
      if (saved) this.load();
    });
  }

  /** "600 a minute · burst 100", with "(the workspace's most)" when the client has no limit of its own. */
  limitOf(client: ApiClientRow): string {
    if (!client.limit) return '—';
    return `${client.limit.ratePerMinute.toLocaleString()} a minute · burst ${client.limit.burst.toLocaleString()}`;
  }

  /** The quota line: "812 of 10,000 calls (8%)", or "812 calls" with no quota. */
  quotaLine(limits: ApiLimitsRow): string {
    const used = limits.callsThisMonth == null ? '—' : limits.callsThisMonth.toLocaleString();
    if (limits.bounds.monthlyCalls == null) return `${used} calls, no monthly quota`;
    const pct = limits.quotaUsedPercent == null ? '' : ` (${limits.quotaUsedPercent}%)`;
    return `${used} of ${limits.bounds.monthlyCalls.toLocaleString()} calls${pct}`;
  }

  statusPill(client: ApiClientRow): string {
    return client.status === 'Active' ? 'pill pill-ok' : client.status === 'Expired' ? 'pill pill-warn' : 'pill pill-neutral';
  }

  openNew(): void {
    this.openClient(null);
  }

  openClient(client: ApiClientRow | null): void {
    const data: ClientDialogData = { scopes: this.scopes(), client, bounds: this.limits()?.bounds ?? null, canSetLimits: this.auth.canBuild(),
      tenantId: this.tenantId() };
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
    this.api.rotateSecret(client.clientId, false, this.tenantId()).subscribe({
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
    this.api.revoke(client.clientId, false, this.tenantId()).subscribe({
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
    const data: RouteDialogData = { pipelines: this.pipelines(), route, tenantId: this.tenantId() };
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
    this.api.deleteRoute(route.routeId, this.tenantId()).subscribe({
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
    this.webhooksState.start();
    const asked = this.tenantId();
    this.api.webhookList(asked).subscribe({
      next: r => {
        if (asked !== this.tenantId()) return;
        if (r.status !== API_SUCCESS) { this.webhooksState.fail(r, 'The webhooks could not be read.'); return; }
        this.webhooks.set(r.data ?? []);
        this.webhooksState.done();
      },
      error: err => {
        if (asked !== this.tenantId()) return;
        this.webhooksState.fail(err, 'The webhooks could not be read.');
      },
    });
    this.api.eventTypes().subscribe({
      next: r => this.eventTypes.set(r.status === API_SUCCESS ? r.data ?? [] : []),
      error: () => this.eventTypes.set([]),
    });
  }

  /** MIG-426: "JSON, PDF": a webhook's result formats as the dialog names them. */
  formatLabels(formats: string[]): string {
    return RESULT_FORMATS.filter(f => formats.includes(f.format)).map(f => f.label).join(', ');
  }

  webhookState(w: WebhookRow): string {
    return w.active ? (w.failingSince ? 'Failing' : 'Active') : 'Paused';
  }

  webhookPill(w: WebhookRow): string {
    return !w.active ? 'pill pill-neutral' : w.failingSince ? 'pill pill-warn' : 'pill pill-ok';
  }

  openWebhook(webhook: WebhookRow | null): void {
    const data: WebhookDialogData = { eventTypes: this.eventTypes(), webhook, tenantId: this.tenantId() };
    this.dialog.open<WebhookDialogResult>(WebhookDialog, { data, hasBackdrop: true }).closed.subscribe(result => {
      if (!result) return;
      this.loadWebhooks();
      if ('made' in result) this.showWebhookSecret(result.made, false);
    });
  }

  /** Owner #25: every change to the client since it was made, sliding over the right. */
  openHistory(client: ApiClientRow): void {
    const me = this.auth.user()?.appUserId;
    const data: ClientHistoryData = { client, sandbox: false, names: me ? { [me]: 'you' } : {}, tenantId: this.tenantId() };
    this.dialog.open(ClientHistoryPanel, sidePanelConfig(data, 'narrow', 'right'));
  }

  openDeliveries(webhook: WebhookRow): void {
    const data: DeliveriesDialogData = { webhook, tenantId: this.tenantId() };
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
    this.api.updateWebhook({ webhookId: webhook.id, active }, this.tenantId()).subscribe({
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
    this.api.rotateWebhookSecret(webhook.id, this.tenantId()).subscribe({
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
    this.api.deleteWebhook(webhook.id, this.tenantId()).subscribe({
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
