import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import { PageCatalogueEntry, PageKey } from '../../../core/auth/page-keys';

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
  avatarKey?: string | null;
  pageAccessProfileId: number | null;
  pageAccessProfileName: string | null;
  pageKeys: PageKey[];
  /** Pages opened for this person beyond their profile, and withheld despite it. */
  allowedExceptions?: PageKey[];
  withheldExceptions?: PageKey[];
}

/** What the dialog sends: the id only on an edit. */
export interface AccessProfileDraft {
  pageAccessProfileId?: number;
  /** Only a platform administrator sends one; a tenant administrator's is its own and the server ignores this. */
  tenantId?: number | null;
  profileName: string;
  description: string | null;
  defaultProfile: boolean;
  pageKeys: PageKey[];
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

  setDefault(pageAccessProfileId: number): Observable<ApiResponse<AccessProfile>> {
    return this.http.put<ApiResponse<AccessProfile>>(`${this.base}/setDefaultProfile`, null, { params: { pageAccessProfileId } });
  }
}
