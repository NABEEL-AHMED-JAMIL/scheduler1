import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import { PageCatalogueEntry, PageKey, TabKey } from '../../../core/auth/page-keys';

/** An access profile as /pageAccess.json serves it. */
export interface AccessProfile {
  pageAccessProfileId: number;
  tenantId?: number;
  profileName: string;
  description?: string | null;
  defaultProfile: boolean;
  pageKeys: PageKey[];
  userCount: number;
  userNames?: string[];
  /** Default profile only: the people who land on it with no profile of their own. */
  defaultUserCount?: number | null;
  defaultUserNames?: string[] | null;
  /** MIG-424: its people must sign in with two-factor (enrolment at their next sign-in). */
  requireMfa?: boolean;
  /** MIG-424: of its people (and, for the default, everyone with no profile), how many have two-factor on, and who has not. */
  mfaEnrolledCount?: number | null;
  mfaNotEnrolledCount?: number | null;
  mfaNotEnrolledNames?: string[] | null;
  dateCreated?: string;
  dateUpdated?: string;
  createdByName?: string | null;
  updatedByName?: string | null;
}

/** A tenant user as the grid shows them: who they are, what they hold, what that opens. */
export interface AccessPerson {
  appUserId: number;
  fullName: string;
  username: string;
  position?: string | null;
  status: string;
  /** The version of their profile picture; null or absent when they have none. */
  avatarVersion?: string | null;
  pageAccessProfileId: number | null;
  pageAccessProfileName: string | null;
  pageKeys: PageKey[];
  /** Pages opened for this person beyond their profile, and withheld despite it. */
  allowedExceptions?: PageKey[];
  withheldExceptions?: PageKey[];
  /** MIG-424: two-factor on for them, and whether -- and by what -- it is required of them. */
  twoFactorEnabled?: boolean;
  twoFactorRequired?: boolean;
  twoFactorRequiredBy?: 'workspace' | 'profile' | null;
}

/** What the dialog sends: the id only on an edit. */
/** F3: one page of a person's effective access, with its tabs. */
export interface EffectivePage {
  key: string; label: string; open: boolean;
  tabs: { key: string; label: string; open: boolean; apiGated: boolean }[];
}
export interface EffectiveAccess { appUserId: number; keys: string[]; pages: EffectivePage[]; }

/** F3: a member delegated to grant access (owner A-Q2: profiles and exceptions; A-Q4: 90 days by default). */
export interface Delegation {
  delegateId: number; tenantId: number; delegateUserId: number; delegateName?: string | null;
  scopePeople: 'ALL_MEMBERS' | 'LISTED'; people: number[]; scopeKeys: string[] | null; canAssignProfiles: boolean;
  expiresAt: string; reason?: string | null; status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  grantedBy: number; grantedByName?: string | null; grantedAt: string; revokedBy?: number | null; revokedAt?: string | null;
}
export interface DelegationDraft {
  tenantId?: number | null; delegateUserId: number; scopePeople: 'ALL_MEMBERS' | 'LISTED'; people: number[];
  scopeKeys: string[] | null; canAssignProfiles: boolean; days: number; reason: string;
}
/** F3: one row of the insert-only access change log. */
export interface AccessChange {
  changeId: number; actorUserId: number | null; actorName?: string | null; delegateId: number | null; targetUserId: number | null;
  targetName?: string | null; action: string; key: string | null; before: string | null; after: string | null; reason: string | null;
  expiresAt: string | null; at: string;
}

export interface AccessProfileDraft {
  pageAccessProfileId?: number;
  /** Only a platform administrator sends one; a tenant administrator's is its own and the server ignores this. */
  tenantId?: number | null;
  profileName: string;
  description: string | null;
  defaultProfile: boolean;
  pageKeys: (PageKey | TabKey)[];
  /** MIG-424: its people must sign in with two-factor. */
  requireMfa?: boolean;
}

/**
 * Access profiles: which console pages a tenant user may open, kept as named bundles.
 *
 * One service rather than HttpClient calls spread over the screen and the user dialog, because
 * both need the same list and the same catalogue, and the user dialog's picker must never
 * quietly drift from what the profiles screen shows.
 */
@Injectable({ providedIn: 'root' })
export class AccessProfilesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/pageAccess.json`;

  /** The fixed page catalogue, from the server so the editor offers exactly what it accepts. */
  pages(): Observable<ApiResponse<PageCatalogueEntry[]>> {
    return this.http.get<ApiResponse<PageCatalogueEntry[]>>(`${this.base}/pages`);
  }

  /** A tenant administrator lists its own workspace; a platform administrator names one. */
  list(tenantId?: number | null): Observable<ApiResponse<AccessProfile[]>> {
    return this.http.get<ApiResponse<AccessProfile[]>>(`${this.base}/listProfiles`,
      { params: tenantId ? { tenantId } : {} });
  }

  save(draft: AccessProfileDraft): Observable<ApiResponse<AccessProfile>> {
    return draft.pageAccessProfileId
      ? this.http.put<ApiResponse<AccessProfile>>(`${this.base}/updateProfile`, draft)
      : this.http.post<ApiResponse<AccessProfile>>(`${this.base}/addProfile`, draft);
  }

  delete(pageAccessProfileId: number): Observable<ApiResponse> {
    return this.http.delete<ApiResponse>(`${this.base}/deleteProfile`, { params: { pageAccessProfileId } });
  }

  /** The workspace's tenant users with their effective pages -- the grid's rows. */
  people(tenantId?: number | null): Observable<ApiResponse<AccessPerson[]>> {
    return this.http.get<ApiResponse<AccessPerson[]>>(`${this.base}/listPeople`,
      { params: tenantId ? { tenantId } : {} });
  }

  /** One person onto one profile; null puts them back on the workspace default. */
  assign(appUserId: number, pageAccessProfileId: number | null): Observable<ApiResponse<AccessPerson>> {
    return this.http.put<ApiResponse<AccessPerson>>(`${this.base}/assignProfile`, null,
      { params: pageAccessProfileId ? { appUserId, pageAccessProfileId } : { appUserId } });
  }

  /** One page for one person: an exception to their profile, or back to it. */
  setPageAccess(appUserId: number, pageKey: PageKey, allowed: boolean): Observable<ApiResponse<AccessPerson>> {
    return this.http.put<ApiResponse<AccessPerson>>(`${this.base}/setPageAccess`, null,
      { params: { appUserId, pageKey, allowed } });
  }

  /** Every exception the person carries, gone. */
  clearPageAccess(appUserId: number): Observable<ApiResponse<AccessPerson>> {
    return this.http.delete<ApiResponse<AccessPerson>>(`${this.base}/clearPageAccess`, { params: { appUserId } });
  }

  /**
   * F3 (MIG-400): a page or a tab ("sources:contracts") for one person, optionally for a number of days and with a reason
   * (the change log keeps it). An administrator, or a member within their delegation.
   */
  grant(appUserId: number, key: string, allowed: boolean, expiresInDays: number | null, reason: string): Observable<ApiResponse<AccessPerson>> {
    const params: Record<string, string | number | boolean> = { appUserId, pageKey: key, allowed };
    if (expiresInDays) params['expiresInDays'] = expiresInDays;
    if (reason.trim()) params['reason'] = reason.trim();
    return this.http.put<ApiResponse<AccessPerson>>(`${this.base}/setPageAccess`, null, { params });
  }

  /** F3: what a person opens -- every page and, per page, its tabs -- as identity works it out. */
  effective(appUserId: number): Observable<ApiResponse<EffectiveAccess>> {
    return this.http.get<ApiResponse<EffectiveAccess>>(`${this.base}/effective`, { params: { appUserId } });
  }

  /** F3: the workspace's delegations (administrator). */
  delegates(tenantId?: number | null): Observable<ApiResponse<Delegation[]>> {
    return this.http.get<ApiResponse<Delegation[]>>(`${this.base}/delegates`, { params: tenantId ? { tenantId } : {} });
  }

  grantDelegation(body: DelegationDraft): Observable<ApiResponse<Delegation>> {
    return this.http.post<ApiResponse<Delegation>>(`${this.base}/delegates/grant`, body);
  }

  revokeDelegation(delegateId: number, reason: string, tenantId?: number | null): Observable<ApiResponse<Delegation>> {
    return this.http.post<ApiResponse<Delegation>>(`${this.base}/delegates/revoke`, { delegateId, reason, tenantId: tenantId ?? undefined });
  }

  /** F3: the access change log -- an administrator's workspace, a delegate's own changes. */
  changes(query: { tenantId?: number | null; appUserId?: number | null; delegateId?: number | null; limit?: number }): Observable<ApiResponse<AccessChange[]>> {
    const params: Record<string, number> = {};
    if (query.tenantId) params['tenantId'] = query.tenantId;
    if (query.appUserId) params['appUserId'] = query.appUserId;
    if (query.delegateId) params['delegateId'] = query.delegateId;
    params['limit'] = query.limit ?? 100;
    return this.http.get<ApiResponse<AccessChange[]>>(`${this.base}/changes`, { params });
  }

  setDefault(pageAccessProfileId: number): Observable<ApiResponse<AccessProfile>> {
    return this.http.put<ApiResponse<AccessProfile>>(`${this.base}/setDefaultProfile`, null, { params: { pageAccessProfileId } });
  }
}
