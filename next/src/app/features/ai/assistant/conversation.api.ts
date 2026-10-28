import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import { ConversationPage, ConversationRow, ListFilter, viewerZone } from './conversation.model';

const BASE = () => `${API_BASE}/aiPrompt.json/assistant`;

/**
 * ai-service's conversation list (2026-10-12): a page of the person's conversations with search, filters and facet
 * counts; pin; and the pipeline Create pipeline saved from a conversation. Rename and delete stay AssistantApi's.
 */
@Injectable({ providedIn: 'root' })
export class ConversationApi {
  private readonly http = inject(HttpClient);

  list(filter: ListFilter): Observable<ApiResponse<ConversationPage>> {
    const params: Record<string, string | number | boolean> = { zone: viewerZone() };
    if (filter.q?.trim()) params['q'] = filter.q.trim();
    if (filter.kind?.length) params['kind'] = filter.kind.join(',');
    if (filter.outcome?.length) params['outcome'] = filter.outcome.join(',');
    if (filter.updated) params['updated'] = filter.updated;
    if (filter.pinned) params['pinned'] = true;
    if (filter.offset) params['offset'] = filter.offset;
    params['limit'] = filter.limit ?? 50;
    if (filter.sort) { params['sort'] = filter.sort; params['dir'] = filter.dir ?? 'asc'; }
    return this.http.get<ApiResponse<ConversationPage>>(`${BASE()}/conversationList`, { params });
  }

  pin(conversationId: number, pinned: boolean): Observable<ApiResponse<ConversationRow>> {
    return this.http.post<ApiResponse<ConversationRow>>(`${BASE()}/pin`, { conversationId, pinned });
  }

  /** Create pipeline saved the conversation's design in Core (as the person): the list then links to it. */
  pipelineCreated(conversationId: number, created: { pipelineKey: number; pipelineId?: string; taskDetailId?: number; jobId?: number; name?: string;
    version?: number | null; messageId?: number | null })
    : Observable<ApiResponse<ConversationRow>> {
    return this.http.post<ApiResponse<ConversationRow>>(`${BASE()}/outcome`, { conversationId, ...created });
  }
}
