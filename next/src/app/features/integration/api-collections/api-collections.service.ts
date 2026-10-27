import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import {
  CollectionDetail, CollectionRow, ImportResult, RequestDetail, RequestSample, RunResult, Saved, UsageRow, VersionDetail, VersionRow,
} from './api-collections.model';

/** The list's paging, as the service answers it beside the rows. */
export interface Paging { totalRecord: number; pageSize: number; currentPage: number; }
export type PagedResponse<T> = ApiResponse<T> & { paging?: Paging };

/** One Postman import: the collection's JSON, and any environment files beside it. */
export interface PostmanImport { format: 'POSTMAN'; collection: unknown; environments: unknown[]; name?: string; tenantId?: number; }
/** One Bruno import: the folder's files, each by its path inside the folder. */
export interface BrunoImport { format: 'BRUNO'; files: { path: string; content: string }[]; name?: string; tenantId?: number; }

const BASE = `${API_BASE}/apiCollection.json`;

type Params = Record<string, string | number | boolean>;

/** A platform administrator's workspace as ?tenantId=; nothing for anyone else (they work in their own). */
function scoped(params: Params, tenantId?: number | null): Params {
  if (tenantId) params['tenantId'] = tenantId;
  return params;
}

/**
 * integration-service's /apiCollection.json (MIG-227/228), as the console calls it. Reads are any member's who
 * holds the api-collections page; writes and /request/test are a workspace administrator's. Every answer is the
 * {status, message, data} envelope, and a refusal is status ERROR with HTTP 200 -- callers read `status`.
 *
 * Every call takes an optional tenantId: the workspace a platform administrator picked. He has no workspace of his own,
 * and integration-service answers his call that names none with a 400 (ActingWorkspace); it is sent as ?tenantId= on
 * reads and writes alike. A workspace's people leave it out: their calls are always their own workspace's.
 */
@Injectable({ providedIn: 'root' })
export class ApiCollectionsApi {
  private readonly http = inject(HttpClient);

  list(search: string, page: number, limit: number, tenantId?: number | null): Observable<PagedResponse<CollectionRow[]>> {
    const params: Params = { page, limit };
    if (search.trim()) params['search'] = search.trim();
    return this.http.get<PagedResponse<CollectionRow[]>>(`${BASE}/list`, { params: scoped(params, tenantId) });
  }

  get(collectionId: number, tenantId?: number | null): Observable<ApiResponse<CollectionDetail>> {
    return this.http.get<ApiResponse<CollectionDetail>>(`${BASE}/get`, { params: scoped({ collectionId }, tenantId) });
  }

  /** A version with its snapshot: where the collection's default auth is read back (only {{variables}}, never a secret). */
  version(collectionId: number, version: number, tenantId?: number | null): Observable<ApiResponse<VersionDetail>> {
    return this.http.get<ApiResponse<VersionDetail>>(`${BASE}/version`, { params: scoped({ collectionId, version }, tenantId) });
  }

  versions(collectionId: number, tenantId?: number | null): Observable<ApiResponse<VersionRow[]>> {
    return this.http.get<ApiResponse<VersionRow[]>>(`${BASE}/versions`, { params: scoped({ collectionId }, tenantId) });
  }

  usage(collectionId: number, tenantId?: number | null): Observable<ApiResponse<UsageRow[]>> {
    return this.http.get<ApiResponse<UsageRow[]>>(`${BASE}/usage`, { params: scoped({ collectionId }, tenantId) });
  }

  saveCollection(body: Record<string, unknown>, tenantId?: number | null): Observable<ApiResponse<Saved>> {
    return this.http.post<ApiResponse<Saved>>(`${BASE}/save`, body, { params: scoped({}, tenantId) });
  }

  /** Refused while in use: ERROR, with the users in data. */
  deleteCollection(collectionId: number, tenantId?: number | null): Observable<ApiResponse<Saved | UsageRow[]>> {
    return this.http.delete<ApiResponse<Saved | UsageRow[]>>(`${BASE}/delete`, { params: scoped({ collectionId }, tenantId) });
  }

  /** Owner #28: the request's newest answered call as the runner kept it (masked, cut), or null when none was kept. */
  sample(requestId: number, tenantId?: number | null): Observable<ApiResponse<RequestSample | null>> {
    return this.http.get<ApiResponse<RequestSample | null>>(`${BASE}/request/sample`, { params: scoped({ requestId }, tenantId) });
  }

  getRequest(requestId: number, tenantId?: number | null): Observable<ApiResponse<RequestDetail>> {
    return this.http.get<ApiResponse<RequestDetail>>(`${BASE}/request/get`, { params: scoped({ requestId }, tenantId) });
  }

  requestUsage(requestId: number, tenantId?: number | null): Observable<ApiResponse<UsageRow[]>> {
    return this.http.get<ApiResponse<UsageRow[]>>(`${BASE}/request/usage`, { params: scoped({ requestId }, tenantId) });
  }

  saveRequest(body: Record<string, unknown>, tenantId?: number | null): Observable<ApiResponse<Saved>> {
    return this.http.post<ApiResponse<Saved>>(`${BASE}/request/save`, body, { params: scoped({}, tenantId) });
  }

  setEnabled(requestId: number, enabled: boolean, tenantId?: number | null): Observable<ApiResponse<Saved>> {
    return this.http.put<ApiResponse<Saved>>(`${BASE}/request/setEnabled`, null, { params: scoped({ requestId, enabled }, tenantId) });
  }

  deleteRequest(requestId: number, tenantId?: number | null): Observable<ApiResponse<Saved | UsageRow[]>> {
    return this.http.delete<ApiResponse<Saved | UsageRow[]>>(`${BASE}/request/delete`, { params: scoped({ requestId }, tenantId) });
  }

  /** Runs the saved request through the runner; the answer is masked. */
  test(body: { requestId: number; environmentId?: number | null; variables?: Record<string, string> },
    tenantId?: number | null): Observable<ApiResponse<RunResult>> {
    return this.http.post<ApiResponse<RunResult>>(`${BASE}/request/test`, body, { params: scoped({}, tenantId) });
  }

  saveFolder(body: { folderId?: number | null; collectionId: number; parentFolderId?: number | null; name: string; sortOrder?: number },
    tenantId?: number | null): Observable<ApiResponse<Saved>> {
    return this.http.post<ApiResponse<Saved>>(`${BASE}/folder/save`, body, { params: scoped({}, tenantId) });
  }

  deleteFolder(folderId: number, tenantId?: number | null): Observable<ApiResponse<Saved | UsageRow[]>> {
    return this.http.delete<ApiResponse<Saved | UsageRow[]>>(`${BASE}/folder/delete`, { params: scoped({ folderId }, tenantId) });
  }

  /** A secret variable is sent without a value to keep the sealed one, or with a new value to replace it. */
  saveEnvironment(body: { environmentId?: number | null; collectionId: number; name: string; isDefault: boolean;
    variables: { key: string; secret: boolean; value?: string }[] }, tenantId?: number | null): Observable<ApiResponse<Saved>> {
    return this.http.post<ApiResponse<Saved>>(`${BASE}/environment/save`, body, { params: scoped({}, tenantId) });
  }

  deleteEnvironment(environmentId: number, tenantId?: number | null): Observable<ApiResponse<Saved>> {
    return this.http.delete<ApiResponse<Saved>>(`${BASE}/environment/delete`, { params: scoped({ environmentId }, tenantId) });
  }

  import(body: PostmanImport | BrunoImport, tenantId?: number | null): Observable<ApiResponse<ImportResult>> {
    return this.http.post<ApiResponse<ImportResult>>(`${BASE}/import`, body, { params: scoped({}, tenantId) });
  }

  getImport(importId: number, tenantId?: number | null): Observable<ApiResponse<ImportResult>> {
    return this.http.get<ApiResponse<ImportResult>>(`${BASE}/import/get`, { params: scoped({ importId }, tenantId) });
  }
}

/** The users a refused delete names, or none. */
export function usersOf(r: ApiResponse<unknown>): UsageRow[] {
  return r.status === 'ERROR' && Array.isArray(r.data) ? (r.data as UsageRow[]) : [];
}
