import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';

/** One API client of the customer API (MIG-332), as Identity lists it: never its secret. */
export interface ApiClientRow {
  clientId: string;
  name: string;
  scopes: string[];
  ipAllowlist: string[];
  expiresAt: string | null;
  status: 'Active' | 'Revoked' | 'Expired';
  createdBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  secretRotatedAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  /** MIG-337: the client's own limit (null: the workspace's bound), the limit in force, and this month's calls (UTC month). */
  ratePerMinute?: number | null;
  burst?: number | null;
  limit?: { ratePerMinute: number; burst: number; capped: boolean } | null;
  /** Null when the count cannot be read just now. */
  callsThisMonth?: number | null;
  /** MIG-335: the origins that may frame the client's run views (CSP frame-ancestors); empty: none. */
  frameAncestors?: string[];
}

/** MIG-337: a workspace's API bounds (the platform administrator's) and this month's calls against its quota. */
export interface ApiLimitBounds {
  clientRateMax: number;
  clientBurstMax: number;
  workspaceRate: number;
  workspaceBurst: number;
  monthlyCalls: number | null;
}

export interface ApiLimitsRow {
  tenantId: number;
  bounds: ApiLimitBounds;
  defaults: ApiLimitBounds;
  /** Whether the platform administrator set any bound (otherwise the defaults hold). */
  custom: boolean;
  /** "2026-10": the bill's month, in the workspace's billing time zone (H9). */
  month: string | null;
  /** H9: the zone that month is counted in -- the workspace's billing time zone (America/Chicago unless set). */
  monthTimeZone?: string | null;
  monthEndsAt: string | null;
  callsThisMonth: number | null;
  quotaUsedPercent: number | null;
  quotaWarning: boolean;
  updatedAt: string | null;
  updatedBy: number | null;
}

export interface ApiLimitsInput {
  tenantId: number;
  clientRateMax?: number | null;
  clientBurstMax?: number | null;
  workspaceRate?: number | null;
  workspaceBurst?: number | null;
  monthlyCalls?: number | null;
}

/** A client as created or rotated: the secret, once. */
export interface ApiClientWithSecret extends ApiClientRow { clientSecret: string }

export interface ScopeRow { scope: string; description: string }

/** Owner #25: one change to an API client (Identity's api_client_change): never a secret. */
export interface ClientChangeRow {
  id: number;
  action: 'CREATED' | 'UPDATED' | 'SECRET_ROTATED' | 'REVOKED';
  /** Field to {from, to}; empty for a rotation or a revoke. */
  changes: Record<string, { from: unknown; to: unknown }>;
  changedBy: number | null;
  changedAt: string | null;
}

export interface ApiClientInput {
  clientId?: string;
  name?: string;
  scopes?: string[];
  ipAllowlist?: string;
  expiresAt?: string;
  /** MIG-337: 0 is the workspace's bound; left out keeps it. */
  ratePerMinute?: number;
  burst?: number;
  /** MIG-335: the origins that may frame its run views, one per line; empty: none; left out keeps them. */
  frameAncestors?: string;
  /** MIG-336: a test key of the workspace's sandbox (cl_test_...), not of the workspace itself. */
  sandbox?: boolean;
}

/**
 * MIG-336: the workspace's sandbox -- a separate, unbilled workspace our team makes on request, with sample pipelines and
 * data, whose test keys (cl_test_...) work only there. Null when there is none.
 */
export interface SandboxInfo {
  tenantId: number;
  name: string;
  code: string;
  status: string;
  createdAt: string | null;
}

/** One event route (MIG-332): an event type of the organisation's and what it starts. */
export interface EventRouteRow {
  routeId: number;
  eventType: string;
  targetKind: 'PIPELINE' | 'WORKFLOW';
  jobId: number | null;
  pipelineName: string | null;
  workflowKey: string | null;
  contractId: number | null;
  contractName: string | null;
  contractVersion: number | null;
  active: boolean;
  dateCreated: string | null;
  dateUpdated: string | null;
}

export interface EventRouteInput {
  routeId?: number | null;
  eventType: string;
  targetKind: 'PIPELINE' | 'WORKFLOW';
  jobId?: number | null;
  workflowKey?: string | null;
  contractName?: string | null;
  contractVersion?: number | null;
  active: boolean;
}

export interface RouteTarget { jobId: number; name: string }

/** MIG-333: an event type of the catalogue a webhook may subscribe to. */
export interface EventTypeRow { type: string; description: string }

/** MIG-333: a webhook subscription, as integration-service lists it: never its secret. Times are UTC instants. */
export interface WebhookRow {
  id: string;
  url: string;
  eventTypes: string[];
  active: boolean;
  pausedReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  failingSince: string | null;
  lastSuccessAt: string | null;
  secretRotatedAt: string | null;
  previousSecretValidUntil: string | null;
  /** MIG-426: the formats run.completed carries the run's result in (json, pdf, html, md); [] for none (the run alone). */
  resultFormats?: string[];
  tenantId: number;
  createdBy: string | null;
}

/** A webhook as made or rotated: its secret, once. */
export interface WebhookWithSecret extends WebhookRow { secret: string }

export interface WebhookInput {
  webhookId?: string | null;
  url?: string;
  eventTypes?: string[];
  active?: boolean;
  /** MIG-426: [] for none. */
  resultFormats?: string[];
}

/** MIG-426: the formats a webhook may carry a run's result in with run.completed, in the API's order, and what each is. */
export const RESULT_FORMATS: { format: string; label: string; detail: string }[] = [
  { format: 'json', label: 'JSON', detail: 'the result rows, masked as the API gives them' },
  { format: 'pdf', label: 'PDF', detail: "the run's report: the signed PDF once it is approved and signed" },
  { format: 'html', label: 'HTML', detail: "the report's page, or with no report the rows as a table" },
  { format: 'md', label: 'Markdown', detail: "made from the report's HTML (never signed), or with no report the rows as a table" },
];

/** One event sent (or being sent) to one webhook. */
export interface DeliveryRow {
  id: string;
  eventId: string;
  eventType: string;
  attempt: number;
  status: 'pending' | 'retrying' | 'delivered' | 'failed';
  responseStatus: number | null;
  durationMs: number | null;
  nextAttemptAt: string | null;
  createdAt: string | null;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  error: string | null;
  redeliveryOf: string | null;
}

export interface AttemptRow {
  attempt: number;
  at: string | null;
  outcome: 'delivered' | 'failed' | 'blocked';
  responseStatus: number | null;
  durationMs: number | null;
  error: string | null;
}

/** A platform administrator's workspace as a query parameter; nothing for anyone else (they work in their own). */
function scoped(params: Record<string, string>, tenantId?: number | null): Record<string, string> {
  if (tenantId) params['tenantId'] = String(tenantId);
  return params;
}

/** A platform administrator's workspace in a request body; the body as it is for anyone else. */
function scopedBody<T extends object>(body: T, tenantId?: number | null): T & { tenantId?: number } {
  return tenantId ? { ...body, tenantId } : body;
}

/**
 * MIG-332: the customer API's API clients (identity-service, apiClient.json) and event routes (Core, eventRoute.json),
 * a workspace administrator's; MIG-333: its webhooks and their deliveries (integration-service, webhook.json).
 *
 * Every workspace call takes an optional tenantId: the workspace a platform administrator picked (he has none of his own).
 * It is left out for a workspace administrator, whose calls are always their own workspace's (each service ignores
 * anyone else's tenantId). The scopes and the webhook event catalogue are the platform's, the same for every workspace.
 */
@Injectable({ providedIn: 'root' })
export class ApiClientsApi {
  private readonly http = inject(HttpClient);
  private readonly clients = `${API_BASE}/apiClient.json`;
  private readonly routes = `${API_BASE}/eventRoute.json`;
  private readonly webhooks = `${API_BASE}/webhook.json`;

  scopes(): Observable<ApiResponse<ScopeRow[]>> {
    return this.http.get<ApiResponse<ScopeRow[]>>(`${this.clients}/scopes`);
  }

  /** Owner #25: every change to the client, newest first. */
  history(clientId: string, sandbox = false, tenantId?: number | null): Observable<ApiResponse<ClientChangeRow[]>> {
    const params: Record<string, string> = { clientId };
    if (sandbox) params['sandbox'] = 'true';
    return this.http.get<ApiResponse<ClientChangeRow[]>>(`${this.clients}/history`, { params: scoped(params, tenantId) });
  }

  list(tenantId?: number | null): Observable<ApiResponse<ApiClientRow[]>> {
    return this.http.get<ApiResponse<ApiClientRow[]>>(`${this.clients}/list`, { params: scoped({}, tenantId) });
  }

  create(input: ApiClientInput, tenantId?: number | null): Observable<ApiResponse<ApiClientWithSecret>> {
    return this.http.post<ApiResponse<ApiClientWithSecret>>(`${this.clients}/create`, scopedBody(input, tenantId));
  }

  update(input: ApiClientInput, tenantId?: number | null): Observable<ApiResponse<ApiClientRow>> {
    return this.http.post<ApiResponse<ApiClientRow>>(`${this.clients}/update`, scopedBody(input, tenantId));
  }

  /** `sandbox`: a test key of the workspace's sandbox (MIG-336). */
  rotateSecret(clientId: string, sandbox = false, tenantId?: number | null): Observable<ApiResponse<ApiClientWithSecret>> {
    return this.http.post<ApiResponse<ApiClientWithSecret>>(`${this.clients}/rotateSecret`,
      scopedBody(sandbox ? { clientId, sandbox } : { clientId }, tenantId));
  }

  revoke(clientId: string, sandbox = false, tenantId?: number | null): Observable<ApiResponse<ApiClientRow>> {
    return this.http.post<ApiResponse<ApiClientRow>>(`${this.clients}/revoke`,
      scopedBody(sandbox ? { clientId, sandbox } : { clientId }, tenantId));
  }

  /** MIG-336: the workspace's sandbox, or null when our team has not made one. */
  sandbox(tenantId?: number | null): Observable<ApiResponse<SandboxInfo | null>> {
    return this.http.get<ApiResponse<SandboxInfo | null>>(`${this.clients}/sandbox`, { params: scoped({}, tenantId) });
  }

  /** MIG-336: the sandbox's test keys (client ids start cl_test_). */
  sandboxList(tenantId?: number | null): Observable<ApiResponse<ApiClientRow[]>> {
    return this.http.get<ApiResponse<ApiClientRow[]>>(`${this.clients}/list`, { params: scoped({ sandbox: 'true' }, tenantId) });
  }

  /** MIG-337: the workspace's API limits; a platform administrator names the workspace. */
  limits(tenantId?: number | null): Observable<ApiResponse<ApiLimitsRow>> {
    return this.http.get<ApiResponse<ApiLimitsRow>>(`${this.clients}/limits`, { params: scoped({}, tenantId) });
  }

  /** MIG-337: a workspace's bounds -- the platform administrator's. 0 or null: the default; monthlyCalls 0: no quota. */
  saveLimits(input: ApiLimitsInput): Observable<ApiResponse<ApiLimitsRow>> {
    return this.http.post<ApiResponse<ApiLimitsRow>>(`${this.clients}/limits`, input);
  }

  /** MIG-337: a workspace's clients, for a platform administrator naming it (an invoice's "by client" lines). */
  listOf(tenantId?: number | null): Observable<ApiResponse<ApiClientRow[]>> {
    return this.list(tenantId);
  }

  routesList(tenantId?: number | null): Observable<ApiResponse<EventRouteRow[]>> {
    return this.http.get<ApiResponse<EventRouteRow[]>>(`${this.routes}/list`, { params: scoped({}, tenantId) });
  }

  routeTargets(tenantId?: number | null): Observable<ApiResponse<{ pipelines: RouteTarget[] }>> {
    return this.http.get<ApiResponse<{ pipelines: RouteTarget[] }>>(`${this.routes}/targets`, { params: scoped({}, tenantId) });
  }

  saveRoute(input: EventRouteInput, tenantId?: number | null): Observable<ApiResponse<EventRouteRow>> {
    return this.http.post<ApiResponse<EventRouteRow>>(`${this.routes}/save`, scopedBody(input, tenantId));
  }

  deleteRoute(routeId: number, tenantId?: number | null): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.routes}/delete`, scopedBody({ routeId }, tenantId));
  }

  eventTypes(): Observable<ApiResponse<EventTypeRow[]>> {
    return this.http.get<ApiResponse<EventTypeRow[]>>(`${this.webhooks}/eventTypes`);
  }

  /** Without a tenantId a platform administrator would be answered every workspace's webhooks: the page always names one. */
  webhookList(tenantId?: number | null): Observable<ApiResponse<WebhookRow[]>> {
    return this.http.get<ApiResponse<WebhookRow[]>>(`${this.webhooks}/list`, { params: scoped({}, tenantId) });
  }

  createWebhook(input: WebhookInput, tenantId?: number | null): Observable<ApiResponse<WebhookWithSecret>> {
    return this.http.post<ApiResponse<WebhookWithSecret>>(`${this.webhooks}/create`, scopedBody(input, tenantId));
  }

  /**
   * The calls below name one webhook by its id. integration-service lets a platform administrator reach any webhook by id
   * and reads no tenantId on them today; it is sent anyway so each call says which workspace the page is showing.
   */
  updateWebhook(input: WebhookInput, tenantId?: number | null): Observable<ApiResponse<WebhookRow>> {
    return this.http.post<ApiResponse<WebhookRow>>(`${this.webhooks}/update`, scopedBody(input, tenantId));
  }

  deleteWebhook(webhookId: string, tenantId?: number | null): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.webhooks}/delete`, scopedBody({ webhookId }, tenantId));
  }

  rotateWebhookSecret(webhookId: string, tenantId?: number | null): Observable<ApiResponse<WebhookWithSecret>> {
    return this.http.post<ApiResponse<WebhookWithSecret>>(`${this.webhooks}/rotateSecret`, scopedBody({ webhookId }, tenantId));
  }

  /** Newest first; `before` is the last id of the page shown. */
  deliveries(webhookId: string, before?: string | null, limit = 50, tenantId?: number | null): Observable<ApiResponse<DeliveryRow[]>> {
    const params: Record<string, string> = { webhookId, limit: String(limit) };
    if (before) params['before'] = before;
    return this.http.get<ApiResponse<DeliveryRow[]>>(`${this.webhooks}/deliveries`, { params: scoped(params, tenantId) });
  }

  attempts(webhookId: string, deliveryId: string, tenantId?: number | null): Observable<ApiResponse<AttemptRow[]>> {
    return this.http.get<ApiResponse<AttemptRow[]>>(`${this.webhooks}/attempts`, { params: scoped({ webhookId, deliveryId }, tenantId) });
  }

  redeliver(webhookId: string, deliveryId: string, tenantId?: number | null): Observable<ApiResponse<DeliveryRow>> {
    return this.http.post<ApiResponse<DeliveryRow>>(`${this.webhooks}/redeliver`, scopedBody({ webhookId, deliveryId }, tenantId));
  }
}
