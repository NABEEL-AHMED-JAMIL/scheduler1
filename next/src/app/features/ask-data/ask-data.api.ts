import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, timeout } from 'rxjs';
import { API_BASE, ApiResponse } from '../../core/api/api.config';
import { AskAnswer, AskIndexSave, AskIndexStatus, AskSuggestions } from './ask-data.model';

/** A local model can take a minute to answer; past this the page stops waiting and says so. */
export const ASK_TIMEOUT_MS = 3 * 60_000;

const BASE = () => `${API_BASE}/askData.json`;

/** ai-service's Ask your data (/askData.json, page ask-data). */
@Injectable({ providedIn: 'root' })
export class AskDataApi {
  private readonly http = inject(HttpClient);

  suggestions(): Observable<ApiResponse<AskSuggestions>> {
    return this.http.get<ApiResponse<AskSuggestions>>(`${BASE()}/suggestions`);
  }

  ask(question: string): Observable<ApiResponse<AskAnswer>> {
    return this.http.post<ApiResponse<AskAnswer>>(`${BASE()}/ask`, { question }).pipe(timeout(ASK_TIMEOUT_MS));
  }

  /**
   * MIG-357: a question answered with a chart -- over the dataset named (Visualise's "Ask AI for a chart") or the one the
   * question names: the query run as the person, its rows, and the kind and settings the model chose.
   */
  chart(body: { question: string; connection?: string; path?: string; name?: string; datasetId?: number | null }): Observable<ApiResponse<AskAnswer>> {
    return this.http.post<ApiResponse<AskAnswer>>(`${BASE()}/chart`, body).pipe(timeout(ASK_TIMEOUT_MS));
  }

  /** MIG-281: the workspace's search index (TENANT_ADMIN). */
  indexStatus(): Observable<ApiResponse<AskIndexStatus>> {
    return this.http.get<ApiResponse<AskIndexStatus>>(`${BASE()}/index`);
  }

  saveIndex(body: AskIndexSave): Observable<ApiResponse<AskIndexStatus>> {
    return this.http.post<ApiResponse<AskIndexStatus>>(`${BASE()}/index`, body);
  }

  /** The connections the administrator can open: the folders' choices (storage.json/buckets). */
  buckets(): Observable<ApiResponse<{ bucket: string; label?: string | null }[]>> {
    return this.http.get<ApiResponse<{ bucket: string; label?: string | null }[]>>(`${API_BASE}/storage.json/buckets`);
  }
}
