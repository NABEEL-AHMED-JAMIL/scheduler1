import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import { AuthUser, ManagementMode } from '../../../core/auth/auth.models';

/** A managed-service grant (identity-service managed_service_grant): staff member X may manage workspace Y. */
export interface ManagedGrant {
  grantId: number;
  tenantId: number;
  tenantName?: string | null;
  managementMode?: ManagementMode | null;
  appUserId: number;
  username?: string | null;
  fullName?: string | null;
  grantedBy?: number | null;
  grantedAt?: string | null;
  revokedBy?: number | null;
  revokedAt?: string | null;
}

/** One write our staff made in a customer's workspace (managed_action_log), newest first. */
export interface ManagedAction {
  id: number;
  tenantId: number;
  tenantName?: string | null;
  appUserId: number;
  username?: string | null;
  fullName?: string | null;
  service: string;
  method: string;
  path: string;
  target?: string | null;
  action?: string | null;
  builderAction?: boolean;
  correlationId?: string | null;
  createdAt?: string | null;
  /**
   * ZT-A12 follow-up (owner 2026-10-21): a data read in a managed session -- what was opened, exported or downloaded
   * ("board", "run output", ...) and which one ("41", "8913:csv"). Both null on a change.
   */
  readKind?: string | null;
  readId?: string | number | null;
}

export interface ActionsPage extends ApiResponse<ManagedAction[]> {
  /** nextBeforeId pages the newest-first audit; a sorted one pages by offset (nextOffset, owner 2026-10-27). */
  paging?: { limit?: number; nextBeforeId?: number | null; offset?: number; nextOffset?: number | null; sort?: string; dir?: 'asc' | 'desc' };
}

export interface ActionsQuery {
  tenantId?: number | null;
  appUserId?: number | null;
  beforeId?: number | null;
  limit?: number;
  /** Only the data reads, or only the changes; both when left out (Identity's `kind`). */
  kind?: ActivityKind | null;
  /** Owner 2026-10-27: the column Identity sorts by (createdAt, staff, workspace, service) and which way; none is newest first. */
  sort?: string | null;
  dir?: 'asc' | 'desc' | null;
  /** A sorted audit's page: how many rows in (paging.nextOffset). */
  offset?: number | null;
}

/** Identity's `?kind=` on the managed-service activity: `reads` or `changes` (both by default). */
export type ActivityKind = 'reads' | 'changes';

/** A person as appUser.json/listUsers returns them: enough to pick a staff member. */
export interface StaffCandidate {
  appUserId: number;
  username: string;
  fullName?: string | null;
  userRole: string;
  status: string;
  tenantId?: number | null;
}

/**
 * identity-service's /managedService.json (MIG-244) and the management-mode switch on /tenant.json. Every call is
 * a platform administrator's but `actions`, which a workspace administrator may read for their own workspace.
 */
@Injectable({ providedIn: 'root' })
export class ManagedServiceApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/managedService.json`;

  listGrants(filter: { tenantId?: number | null; appUserId?: number | null; includeRevoked?: boolean }): Observable<ApiResponse<ManagedGrant[]>> {
    let params = new HttpParams();
    if (filter.tenantId) params = params.set('tenantId', filter.tenantId);
    if (filter.appUserId) params = params.set('appUserId', filter.appUserId);
    if (filter.includeRevoked) params = params.set('includeRevoked', true);
    return this.http.get<ApiResponse<ManagedGrant[]>>(`${this.base}/listGrants`, { params });
  }

  grant(tenantId: number, appUserId: number): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.base}/grant`, { tenantId, appUserId });
  }

  revoke(tenantId: number, appUserId: number): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.base}/revoke`, { tenantId, appUserId });
  }

  myWorkspaces(): Observable<ApiResponse<ManagedGrant[]>> {
    return this.http.get<ApiResponse<ManagedGrant[]>>(`${this.base}/myWorkspaces`);
  }

  /** Answers like a sign-in: tokens for that workspace, as TENANT_ADMIN, marked msvc. */
  openSession(tenantId: number): Observable<ApiResponse<AuthUser>> {
    return this.http.post<ApiResponse<AuthUser>>(`${this.base}/openSession`, { tenantId });
  }

  actions(query: ActionsQuery): Observable<ActionsPage> {
    let params = new HttpParams();
    if (query.tenantId) params = params.set('tenantId', query.tenantId);
    if (query.appUserId) params = params.set('appUserId', query.appUserId);
    if (query.beforeId) params = params.set('beforeId', query.beforeId);
    if (query.limit) params = params.set('limit', query.limit);
    if (query.kind) params = params.set('kind', query.kind);
    if (query.sort) params = params.set('sort', query.sort);
    if (query.sort && query.dir) params = params.set('dir', query.dir);
    if (query.offset) params = params.set('offset', query.offset);
    return this.http.get<ActionsPage>(`${this.base}/actions`, { params });
  }

  /** The platform's people: staff are the active platform administrators with no workspace. */
  users(): Observable<ApiResponse<StaffCandidate[]>> {
    return this.http.get<ApiResponse<StaffCandidate[]>>(`${API_BASE}/appUser.json/listUsers`);
  }

  /** Signs the workspace's people out, so their next tokens carry the new mode. */
  changeManagementMode(tenantId: number, managementMode: ManagementMode): Observable<ApiResponse> {
    return this.http.put<ApiResponse>(`${API_BASE}/tenant.json/changeManagementMode`, { tenantId, managementMode });
  }
}

/** Staff members: active platform administrators who belong to no workspace (what `grant` accepts). */
export function staffOf(users: StaffCandidate[]): StaffCandidate[] {
  return users
    .filter(u => u.userRole === 'PLATFORM_ADMIN' && u.status === 'Active' && (u.tenantId === null || u.tenantId === undefined))
    .sort((a, b) => (a.fullName || a.username).localeCompare(b.fullName || b.username));
}

/** A person's name as the lists show it: full name, else the sign-in name, else their number. */
export function personName(row: { fullName?: string | null; username?: string | null; appUserId: number }): string {
  return row.fullName?.trim() || row.username?.trim() || `User ${row.appUserId}`;
}
