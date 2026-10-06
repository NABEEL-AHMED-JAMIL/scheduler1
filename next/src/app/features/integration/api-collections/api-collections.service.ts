import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import {
  CollectionDetail, CollectionRow, ImportResult, RequestDetail, RunResult, Saved, UsageRow, VersionDetail, VersionRow,
} from './api-collections.model';

/** The list's paging, as the service answers it beside the rows. */
export interface Paging { totalRecord: number; pageSize: number; currentPage: number; }
export type PagedResponse<T> = ApiResponse<T> & { paging?: Paging };

/** One Postman import: the collection's JSON, and any environment files beside it. */
export interface PostmanImport { format: 'POSTMAN'; collection: unknown; environments: unknown[]; name?: string; tenantId?: number; }
/** One Bruno import: the folder's files, each by its path inside the folder. */
export interface BrunoImport { format: 'BRUNO'; files: { path: string; content: string }[]; name?: string; tenantId?: number; }

const BASE = `${API_BASE}/apiCollection.json`;

/**
 * integration-service's /apiCollection.json (MIG-227/228), as the console calls it. Reads are any member's who
 * holds the api-collections page; writes and /request/test are a workspace administrator's. Every answer is the
 * {status, message, data} envelope, and a refusal is status ERROR with HTTP 200 -- callers read `status`.
 */
@Injectable({ providedIn: 'root' })
export class ApiCollectionsApi {
  private readonly http = inject(HttpClient);

  list(search: string, page: number, limit: number): Observable<PagedResponse<CollectionRow[]>> {
    const params: Record<string, string | number> = { page, limit };
    if (search.trim()) params['search'] = search.trim();
    return this.http.get<PagedResponse<CollectionRow[]>>(`${BASE}/list`, { params });
  }

  get(collectionId: number): Observable<ApiResponse<CollectionDetail>> {
    return this.http.get<ApiResponse<CollectionDetail>>(`${BASE}/get`, { params: { collectionId } });
  }

  /** A version with its snapshot: where the collection's default auth is read back (only {{variables}}, never a secret). */
  version(collectionId: number, version: number): Observable<ApiResponse<VersionDetail>> {
    return this.http.get<ApiResponse<VersionDetail>>(`${BASE}/version`, { params: { collectionId, version } });
  }

  versions(collectionId: number): Observable<ApiResponse<VersionRow[]>> {
    return this.http.get<ApiResponse<VersionRow[]>>(`${BASE}/versions`, { params: { collectionId } });
  }

  usage(collectionId: number): Observable<ApiResponse<UsageRow[]>> {
    return this.http.get<ApiResponse<UsageRow[]>>(`${BASE}/usage`, { params: { collectionId } });
  }

  saveCollection(body: Record<string, unknown>): Observable<ApiResponse<Saved>> {
    return this.http.post<ApiResponse<Saved>>(`${BASE}/save`, body);
  }

  /** Refused while in use: ERROR, with the users in data. */
  deleteCollection(collectionId: number): Observable<ApiResponse<Saved | UsageRow[]>> {
    return this.http.delete<ApiResponse<Saved | UsageRow[]>>(`${BASE}/delete`, { params: { collectionId } });
  }

  getRequest(requestId: number): Observable<ApiResponse<RequestDetail>> {
    return this.http.get<ApiResponse<RequestDetail>>(`${BASE}/request/get`, { params: { requestId } });
  }

  requestUsage(requestId: number): Observable<ApiResponse<UsageRow[]>> {
    return this.http.get<ApiResponse<UsageRow[]>>(`${BASE}/request/usage`, { params: { requestId } });
  }

  saveRequest(body: Record<string, unknown>): Observable<ApiResponse<Saved>> {
    return this.http.post<ApiResponse<Saved>>(`${BASE}/request/save`, body);
  }

  setEnabled(requestId: number, enabled: boolean): Observable<ApiResponse<Saved>> {
    return this.http.put<ApiResponse<Saved>>(`${BASE}/request/setEnabled`, null, { params: { requestId, enabled } });
  }

  deleteRequest(requestId: number): Observable<ApiResponse<Saved | UsageRow[]>> {
    return this.http.delete<ApiResponse<Saved | UsageRow[]>>(`${BASE}/request/delete`, { params: { requestId } });
  }

  /** Runs the saved request through the runner; the answer is masked. */
  test(body: { requestId: number; environmentId?: number | null; variables?: Record<string, string> }): Observable<ApiResponse<RunResult>> {
    return this.http.post<ApiResponse<RunResult>>(`${BASE}/request/test`, body);
  }

  saveFolder(body: { folderId?: number | null; collectionId: number; parentFolderId?: number | null; name: string; sortOrder?: number }): Observable<ApiResponse<Saved>> {
    return this.http.post<ApiResponse<Saved>>(`${BASE}/folder/save`, body);
  }

  deleteFolder(folderId: number): Observable<ApiResponse<Saved | UsageRow[]>> {
    return this.http.delete<ApiResponse<Saved | UsageRow[]>>(`${BASE}/folder/delete`, { params: { folderId } });
  }

  /** A secret variable is sent without a value to keep the sealed one, or with a new value to replace it. */
  saveEnvironment(body: { environmentId?: number | null; collectionId: number; name: string; isDefault: boolean;
    variables: { key: string; secret: boolean; value?: string }[] }): Observable<ApiResponse<Saved>> {
    return this.http.post<ApiResponse<Saved>>(`${BASE}/environment/save`, body);
  }

  deleteEnvironment(environmentId: number): Observable<ApiResponse<Saved>> {
    return this.http.delete<ApiResponse<Saved>>(`${BASE}/environment/delete`, { params: { environmentId } });
  }

  import(body: PostmanImport | BrunoImport): Observable<ApiResponse<ImportResult>> {
    return this.http.post<ApiResponse<ImportResult>>(`${BASE}/import`, body);
  }

  getImport(importId: number): Observable<ApiResponse<ImportResult>> {
    return this.http.get<ApiResponse<ImportResult>>(`${BASE}/import/get`, { params: { importId } });
  }
}

/** The users a refused delete names, or none. */
export function usersOf(r: ApiResponse<unknown>): UsageRow[] {
  return r.status === 'ERROR' && Array.isArray(r.data) ? (r.data as UsageRow[]) : [];
}
