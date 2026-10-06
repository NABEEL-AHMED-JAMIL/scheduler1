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

/**
 * MIG-332: the customer API's API clients (identity-service, apiClient.json) and event routes (Core, eventRoute.json),
 * a workspace administrator's.
 */
@Injectable({ providedIn: 'root' })
export class ApiClientsApi {
  private readonly http = inject(HttpClient);
  private readonly clients = `${API_BASE}/apiClient.json`;
  private readonly routes = `${API_BASE}/eventRoute.json`;

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
}
