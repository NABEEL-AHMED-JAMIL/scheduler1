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
  /** "2026-10": the bill's month, in UTC. */
  month: string | null;
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
}

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

/**
 * MIG-332: the customer API's API clients (identity-service, apiClient.json) and event routes (Core, eventRoute.json),
 * a workspace administrator's; MIG-333: its webhooks and their deliveries (integration-service, webhook.json).
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

  list(): Observable<ApiResponse<ApiClientRow[]>> {
    return this.http.get<ApiResponse<ApiClientRow[]>>(`${this.clients}/list`);
  }

  create(input: ApiClientInput): Observable<ApiResponse<ApiClientWithSecret>> {
    return this.http.post<ApiResponse<ApiClientWithSecret>>(`${this.clients}/create`, input);
  }

  update(input: ApiClientInput): Observable<ApiResponse<ApiClientRow>> {
    return this.http.post<ApiResponse<ApiClientRow>>(`${this.clients}/update`, input);
  }

  rotateSecret(clientId: string): Observable<ApiResponse<ApiClientWithSecret>> {
    return this.http.post<ApiResponse<ApiClientWithSecret>>(`${this.clients}/rotateSecret`, { clientId });
  }

  revoke(clientId: string): Observable<ApiResponse<ApiClientRow>> {
    return this.http.post<ApiResponse<ApiClientRow>>(`${this.clients}/revoke`, { clientId });
  }

  /** MIG-337: the workspace's API limits; a platform administrator names the workspace. */
  limits(tenantId?: number | null): Observable<ApiResponse<ApiLimitsRow>> {
    const params: Record<string, string> = tenantId ? { tenantId: String(tenantId) } : {};
    return this.http.get<ApiResponse<ApiLimitsRow>>(`${this.clients}/limits`, { params });
  }

  /** MIG-337: a workspace's bounds -- the platform administrator's. 0 or null: the default; monthlyCalls 0: no quota. */
  saveLimits(input: ApiLimitsInput): Observable<ApiResponse<ApiLimitsRow>> {
    return this.http.post<ApiResponse<ApiLimitsRow>>(`${this.clients}/limits`, input);
  }

  /** MIG-337: a workspace's clients, for a platform administrator naming it (an invoice's "by client" lines). */
  listOf(tenantId?: number | null): Observable<ApiResponse<ApiClientRow[]>> {
    const params: Record<string, string> = tenantId ? { tenantId: String(tenantId) } : {};
    return this.http.get<ApiResponse<ApiClientRow[]>>(`${this.clients}/list`, { params });
  }

  routesList(): Observable<ApiResponse<EventRouteRow[]>> {
    return this.http.get<ApiResponse<EventRouteRow[]>>(`${this.routes}/list`);
  }

  routeTargets(): Observable<ApiResponse<{ pipelines: RouteTarget[] }>> {
    return this.http.get<ApiResponse<{ pipelines: RouteTarget[] }>>(`${this.routes}/targets`);
  }

  saveRoute(input: EventRouteInput): Observable<ApiResponse<EventRouteRow>> {
    return this.http.post<ApiResponse<EventRouteRow>>(`${this.routes}/save`, input);
  }

  deleteRoute(routeId: number): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.routes}/delete`, { routeId });
  }

  eventTypes(): Observable<ApiResponse<EventTypeRow[]>> {
    return this.http.get<ApiResponse<EventTypeRow[]>>(`${this.webhooks}/eventTypes`);
  }

  webhookList(): Observable<ApiResponse<WebhookRow[]>> {
    return this.http.get<ApiResponse<WebhookRow[]>>(`${this.webhooks}/list`);
  }

  createWebhook(input: WebhookInput): Observable<ApiResponse<WebhookWithSecret>> {
    return this.http.post<ApiResponse<WebhookWithSecret>>(`${this.webhooks}/create`, input);
  }

  updateWebhook(input: WebhookInput): Observable<ApiResponse<WebhookRow>> {
    return this.http.post<ApiResponse<WebhookRow>>(`${this.webhooks}/update`, input);
  }

  deleteWebhook(webhookId: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.webhooks}/delete`, { webhookId });
  }

  rotateWebhookSecret(webhookId: string): Observable<ApiResponse<WebhookWithSecret>> {
    return this.http.post<ApiResponse<WebhookWithSecret>>(`${this.webhooks}/rotateSecret`, { webhookId });
  }

  /** Newest first; `before` is the last id of the page shown. */
  deliveries(webhookId: string, before?: string | null, limit = 50): Observable<ApiResponse<DeliveryRow[]>> {
    const params: Record<string, string> = { webhookId, limit: String(limit) };
    if (before) params['before'] = before;
    return this.http.get<ApiResponse<DeliveryRow[]>>(`${this.webhooks}/deliveries`, { params });
  }

  attempts(webhookId: string, deliveryId: string): Observable<ApiResponse<AttemptRow[]>> {
    return this.http.get<ApiResponse<AttemptRow[]>>(`${this.webhooks}/attempts`, { params: { webhookId, deliveryId } });
  }

  redeliver(webhookId: string, deliveryId: string): Observable<ApiResponse<DeliveryRow>> {
    return this.http.post<ApiResponse<DeliveryRow>>(`${this.webhooks}/redeliver`, { webhookId, deliveryId });
  }
}
