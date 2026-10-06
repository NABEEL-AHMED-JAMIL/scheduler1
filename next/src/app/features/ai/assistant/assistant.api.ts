import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, of, throwError, timeout } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import { AssistantAnswer, AssistantMessage, Conversation, ToolDef, ToolRun, ToolTrace } from './assistant.model';

/**
 * How long send and decide are waited for. Both are synchronous and a local model can take well
 * over a minute to plan, call tools and answer; the page shows a working state and a way to stop
 * waiting, so a generous cap only catches a request that will never come back.
 */
export const ASSISTANT_TIMEOUT_MS = 5 * 60_000;

const BASE = () => `${API_BASE}/aiPrompt.json`;

/**
 * ai-service's assistant (MIG-241) and tool registry, as the AI Assistant and Tool Registry pages
 * call them. send and decide answer their envelope with data even when refused (status ERROR,
 * the refusal recorded as an assistant message), and a 4xx with a body is read the same way, so
 * the page can always show what the server said.
 */
@Injectable({ providedIn: 'root' })
export class AssistantApi {
  private readonly http = inject(HttpClient);

  conversations(limit = 30): Observable<ApiResponse<Conversation[]>> {
    return this.http.get<ApiResponse<Conversation[]>>(`${BASE()}/assistant/conversations`, { params: { limit } });
  }

  conversation(conversationId: number): Observable<ApiResponse<{ conversation: Conversation; messages: AssistantMessage[] }>> {
    return this.http.get<ApiResponse<{ conversation: Conversation; messages: AssistantMessage[] }>>(
      `${BASE()}/assistant/conversation`, { params: { conversationId } });
  }

  send(message: string, conversationId: number | null, connectionId: number | null): Observable<ApiResponse<AssistantAnswer>> {
    const body: Record<string, unknown> = { message };
    if (conversationId != null) body['conversationId'] = conversationId;
    if (connectionId != null) body['connectionId'] = connectionId;
    return this.answered(this.http.post<ApiResponse<AssistantAnswer>>(`${BASE()}/assistant/send`, body));
  }

  decide(actionId: string, approve: boolean): Observable<ApiResponse<AssistantAnswer>> {
    return this.answered(this.http.post<ApiResponse<AssistantAnswer>>(`${BASE()}/assistant/decide`, { actionId, approve }));
  }

  rename(conversationId: number, title: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${BASE()}/assistant/rename`, { conversationId, title });
  }

  remove(conversationId: number): Observable<ApiResponse> {
    return this.http.delete<ApiResponse>(`${BASE()}/assistant/delete`, { params: { conversationId } });
  }

  /** `tenantId`: the workspace a platform administrator is looking at (it has none of its own); others leave it out. */
  tools(tenantId?: number | null): Observable<ApiResponse<ToolDef[]>> {
    return this.http.get<ApiResponse<ToolDef[]>>(`${BASE()}/tools/list`, { params: withTenant({}, tenantId) });
  }

  /** enabled null takes the workspace's switch away: the tool is back to its default (MIG-317). */
  setEnabled(toolName: string, enabled: boolean | null, tenantId?: number | null): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${BASE()}/tools/setEnabled`, { toolName, enabled }, { params: withTenant({}, tenantId) });
  }

  trace(toolRunId: number, tenantId?: number | null): Observable<ApiResponse<ToolTrace>> {
    return this.http.get<ApiResponse<ToolTrace>>(`${BASE()}/tools/trace`, { params: withTenant({ toolRunId }, tenantId) });
  }

  runs(limit = 20, tenantId?: number | null): Observable<ApiResponse<ToolRun[]>> {
    return this.http.get<ApiResponse<ToolRun[]>>(`${BASE()}/tools/runs`, { params: withTenant({ limit }, tenantId) });
  }

  /** The workspaces a platform administrator may pick from (Identity's tenant.json/listTenants). */
  workspaces(): Observable<ApiResponse<{ tenantId: number; tenantName: string }[]>> {
    return this.http.get<ApiResponse<{ tenantId: number; tenantName: string }[]>>(`${API_BASE}/tenant.json/listTenants`);
  }

  dataset(datasetRef: string, offset = 0, limit = 50): Observable<ApiResponse<{ rows: Record<string, unknown>[]; offset: number; rowsKept: number }>> {
    return this.http.get<ApiResponse<{ rows: Record<string, unknown>[]; offset: number; rowsKept: number }>>(
      `${BASE()}/tools/dataset`, { params: { datasetRef, offset, limit } });
  }

  /** A refusal's body is still the answer: 4xx with an envelope comes back as a value, not an error. */
  private answered(call: Observable<ApiResponse<AssistantAnswer>>): Observable<ApiResponse<AssistantAnswer>> {
    return call.pipe(
      timeout(ASSISTANT_TIMEOUT_MS),
      catchError((err: unknown) => {
        const body = err instanceof HttpErrorResponse ? err.error : null;
        return body && typeof body === 'object' && 'status' in body ? of(body as ApiResponse<AssistantAnswer>) : throwError(() => err);
      }),
    );
  }
}

/** The query parameters, plus tenantId when one is given. */
function withTenant(params: Record<string, string | number>, tenantId?: number | null): Record<string, string | number> {
  return tenantId ? { ...params, tenantId } : params;
}
