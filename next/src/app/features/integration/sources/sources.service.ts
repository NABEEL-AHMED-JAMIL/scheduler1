import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import {
  BucketRow, ConnectionRow, ContractDetail, ContractRow, ContractSaved, ContractVersionDetail, PreviewResult, Proposal, Saved,
  SourceDetail, SourceRow, TemplateRow, ValidationResult,
} from './sources.model';

/** The list's paging, as the service answers it beside the rows. */
export interface Paging { totalRecord: number; pageSize: number; currentPage: number; }
export type PagedResponse<T> = ApiResponse<T> & { paging?: Paging };

const SOURCES = `${API_BASE}/dataSource.json`;
const CONTRACTS = `${API_BASE}/dataContract.json`;

/**
 * integration-service's /dataSource.json (MIG-229) and /dataContract.json (MIG-233), as the Sources page calls them.
 * Both are gated by the sources page. Reads -- and checking a payload against a contract -- are any member's who
 * holds it; writes, and anything that reads the source itself (test, preview, schema), are a workspace
 * administrator's. Every answer is the {status, message, data} envelope, and a refusal is status ERROR with
 * HTTP 200 -- callers read `status`.
 */
@Injectable({ providedIn: 'root' })
export class SourcesApi {
  private readonly http = inject(HttpClient);

  // ------------------------------------------------------------------------------------------ sources

  list(search: string, page: number, limit: number): Observable<PagedResponse<SourceRow[]>> {
    const params: Record<string, string | number> = { page, limit };
    if (search.trim()) params['search'] = search.trim();
    return this.http.get<PagedResponse<SourceRow[]>>(`${SOURCES}/list`, { params });
  }

  get(sourceId: number): Observable<ApiResponse<SourceDetail>> {
    return this.http.get<ApiResponse<SourceDetail>>(`${SOURCES}/get`, { params: { sourceId } });
  }

  save(body: Record<string, unknown>): Observable<ApiResponse<Saved>> {
    return this.http.post<ApiResponse<Saved>>(`${SOURCES}/save`, body);
  }

  delete(sourceId: number): Observable<ApiResponse<Saved>> {
    return this.http.delete<ApiResponse<Saved>>(`${SOURCES}/delete`, { params: { sourceId } });
  }

  /** Reads one row. SUCCESS whenever the test happened: whether the source answered is data.ok. */
  test(sourceId: number): Observable<ApiResponse<PreviewResult>> {
    return this.http.post<ApiResponse<PreviewResult>>(`${SOURCES}/test`, null, { params: { sourceId } });
  }

  /** The first rows, masked, with the schema they suggest. A source that cannot be read is an ERROR saying why. */
  preview(sourceId: number, rows?: number): Observable<ApiResponse<PreviewResult>> {
    const params: Record<string, number> = { sourceId };
    if (rows) params['rows'] = rows;
    return this.http.post<ApiResponse<PreviewResult>>(`${SOURCES}/preview`, null, { params });
  }

  /** Infers the schema from a preview and keeps it on the source. */
  schema(sourceId: number): Observable<ApiResponse<PreviewResult>> {
    return this.http.post<ApiResponse<PreviewResult>>(`${SOURCES}/schema`, null, { params: { sourceId } });
  }

  // ------------------------------------------------------------------------------------------ connections

  connections(): Observable<ApiResponse<ConnectionRow[]>> {
    return this.http.get<ApiResponse<ConnectionRow[]>>(`${SOURCES}/connection/list`);
  }

  /** The password is write-only: sent only when typed; left out, the stored one stays. */
  saveConnection(body: Record<string, unknown>): Observable<ApiResponse<ConnectionRow>> {
    return this.http.post<ApiResponse<ConnectionRow>>(`${SOURCES}/connection/save`, body);
  }

  /** Refused, naming them, while a source still queries it. */
  deleteConnection(connectionId: number): Observable<ApiResponse<ConnectionRow>> {
    return this.http.delete<ApiResponse<ConnectionRow>>(`${SOURCES}/connection/delete`, { params: { connectionId } });
  }

  /** Connects (read-only) and reads nothing: data.ok says whether it connected. */
  testConnection(connectionId: number): Observable<ApiResponse<PreviewResult>> {
    return this.http.post<ApiResponse<PreviewResult>>(`${SOURCES}/connection/test`, null, { params: { connectionId } });
  }

  /** The workspace's own Storage Connections: a file or bucket source names one by its alias. */
  buckets(): Observable<ApiResponse<BucketRow[]>> {
    return this.http.get<ApiResponse<BucketRow[]>>(`${API_BASE}/storage.json/buckets`);
  }

  // ------------------------------------------------------------------------------------------ contracts

  contracts(search = ''): Observable<ApiResponse<ContractRow[]>> {
    const params: Record<string, string> = {};
    if (search.trim()) params['search'] = search.trim();
    return this.http.get<ApiResponse<ContractRow[]>>(`${CONTRACTS}/list`, { params });
  }

  contract(contractId: number): Observable<ApiResponse<ContractDetail>> {
    return this.http.get<ApiResponse<ContractDetail>>(`${CONTRACTS}/get`, { params: { contractId } });
  }

  contractVersion(contractId: number, version: number): Observable<ApiResponse<ContractVersionDetail>> {
    return this.http.get<ApiResponse<ContractVersionDetail>>(`${CONTRACTS}/version`, { params: { contractId, version } });
  }

  /** A schema proposed from a pasted sample or a source's preview; nothing is saved. */
  infer(body: { sample?: unknown; sourceId?: number }): Observable<ApiResponse<Proposal>> {
    return this.http.post<ApiResponse<Proposal>>(`${CONTRACTS}/infer`, body);
  }

  saveContract(body: Record<string, unknown>): Observable<ApiResponse<ContractSaved>> {
    return this.http.post<ApiResponse<ContractSaved>>(`${CONTRACTS}/save`, body);
  }

  activate(contractId: number, version: number): Observable<ApiResponse<ContractSaved>> {
    return this.http.post<ApiResponse<ContractSaved>>(`${CONTRACTS}/activate`, null, { params: { contractId, version } });
  }

  /** Checks a payload against a contract (a version, or the active one); nothing is recorded. */
  validate(body: { contractId: number; version?: number | null; payload: unknown }): Observable<ApiResponse<ValidationResult>> {
    return this.http.post<ApiResponse<ValidationResult>>(`${CONTRACTS}/validate`, body);
  }

  templates(): Observable<ApiResponse<TemplateRow[]>> {
    return this.http.get<ApiResponse<TemplateRow[]>>(`${CONTRACTS}/template/list`);
  }

  install(code: string, tenantId?: number | null): Observable<ApiResponse<ContractSaved>> {
    const params: Record<string, string | number> = { code };
    if (tenantId != null) params['tenantId'] = tenantId;
    return this.http.post<ApiResponse<ContractSaved>>(`${CONTRACTS}/template/install`, null, { params });
  }
}
