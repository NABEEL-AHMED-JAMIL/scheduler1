import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, timeout } from 'rxjs';
import { API_BASE, ApiResponse } from '../../core/api/api.config';
import { AskAnswer, AskSuggestions } from './ask-data.model';

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
}
