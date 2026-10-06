import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../core/api/api.config';

/**
 * Workflows (Wave 5, MIG-273..276): workflow-service behind the gateway -- /workflow.json (designer page) for definitions
 * and requests, /taskInbox.json (task inbox page) for a person's tasks, decisions and out of office.
 */
export interface InboxTask {
  id: number;
  instanceId: number;
  stepKey: string;
  stepType: 'approval' | 'task';
  name: string;
  assigneeKind: string;
  assigneeValue?: string | null;
  assigneeUserId?: number | null;
  state: string;
  dueAt?: string | null;
  escalatedAt?: string | null;
  rejectNeedsComment?: boolean;
  actedBy?: number | null;
  actedFor?: number | null;
  actedAt?: string | null;
  comment?: string | null;
  createdAt?: string | null;
  requestTitle: string;
  subjectType?: string;
  subjectId?: string;
  requestedBy?: number | null;
  requestState?: string;
  workflowName?: string;
  workflow?: string;
  overdue?: boolean;
  /** Set on Mine when the task is someone else's and the reader stands in for them today. */
  standingInFor?: number | null;
}

export interface HistoryEvent {
  id: number;
  taskId?: number | null;
  stepKey?: string | null;
  type: string;
  actor?: number | null;
  onBehalfOf?: number | null;
  detail?: string | null;
  at: string;
}

export interface TaskDetail extends InboxTask {
  subject: Record<string, unknown>;
  history: HistoryEvent[];
  tasks: { id: number; stepKey: string; name: string; state: string; actedBy?: number | null; actedFor?: number | null; actedAt?: string | null;
    comment?: string | null }[];
}

export interface Colleague { userId: number; fullName?: string | null; username: string; }

/** The tabs' totals: open in Mine and My groups (total is the two, the menu's badge), overdue, Done and My requests. */
export interface TaskCount { mine: number; groups: number; total: number; overdue: number; done?: number; requests?: number; }

/** Which page of an inbox list to read: after a cursor, how many (1..200, the service's default 100), and a search. */
export interface InboxQuery { cursor?: string | null; limit?: number; q?: string | null; }

/** A page of an inbox list: the rows are the data, and paging says where the next page starts (null on the last). */
export type InboxPage<T> = ApiResponse<T[]> & { paging?: { nextCursor?: string | null; limit?: number } };

export interface WorkflowSummary {
  id: number;
  key: string;
  name: string;
  description?: string | null;
  subjectType: string;
  currentVersion: number;
  status: string;
  running?: number;
  dateUpdated?: string | null;
  dateCreated?: string | null;
}

export interface WorkflowVersion { version: number; steps: string; note?: string | null; createdBy?: number | null; dateCreated?: string | null; }

export interface WorkflowDetail extends WorkflowSummary { versions: WorkflowVersion[]; }

export interface RequestRow {
  id: number;
  workflow: string;
  workflowName: string;
  version: number;
  subjectType: string;
  subjectId: string;
  title: string;
  requestedBy?: number | null;
  state: string;
  currentStep?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
}

export interface RequestDetail extends RequestRow {
  subject: Record<string, unknown>;
  tasks: InboxTask[];
  history: HistoryEvent[];
}

export type Decision = 'approve' | 'reject' | 'changes' | 'done';

@Injectable({ providedIn: 'root' })
export class WorkflowsApi {
  private readonly http = inject(HttpClient);
  private readonly inbox = `${API_BASE}/taskInbox.json`;
  private readonly workflows = `${API_BASE}/workflow.json`;

  mine(page: InboxQuery = {}): Observable<InboxPage<InboxTask>> { return this.page<InboxTask>('mine', page); }
  groups(page: InboxQuery = {}): Observable<InboxPage<InboxTask>> { return this.page<InboxTask>('groups', page); }
  done(page: InboxQuery = {}): Observable<InboxPage<InboxTask>> { return this.page<InboxTask>('done', page); }
  count(): Observable<ApiResponse<TaskCount>> { return this.http.get<ApiResponse<TaskCount>>(`${this.inbox}/count`); }
  task(id: number): Observable<ApiResponse<TaskDetail>> { return this.http.get<ApiResponse<TaskDetail>>(`${this.inbox}/task`, { params: { id } }); }
  colleagues(): Observable<ApiResponse<Colleague[]>> { return this.http.get<ApiResponse<Colleague[]>>(`${this.inbox}/colleagues`); }

  /** A decision, keyed so a double click or a retry decides once. */
  act(taskId: number, action: Decision, comment: string | null, key: string): Observable<ApiResponse<RequestRow>> {
    return this.http.post<ApiResponse<RequestRow>>(`${this.inbox}/act`, { taskId, action, comment }, { headers: { 'Idempotency-Key': key } });
  }

  reassign(taskId: number, toUserId: number, comment: string | null, key: string): Observable<ApiResponse<RequestRow>> {
    return this.http.post<ApiResponse<RequestRow>>(`${this.inbox}/reassign`, { taskId, toUserId, comment }, { headers: { 'Idempotency-Key': key } });
  }

  list(): Observable<ApiResponse<WorkflowSummary[]>> { return this.http.get<ApiResponse<WorkflowSummary[]>>(`${this.workflows}/list`); }
  fetch(key: string): Observable<ApiResponse<WorkflowDetail>> { return this.http.get<ApiResponse<WorkflowDetail>>(`${this.workflows}/fetch`, { params: { key } }); }

  create(body: { key: string; name: string; description?: string | null; subjectType: string }): Observable<ApiResponse<WorkflowDetail>> {
    return this.http.post<ApiResponse<WorkflowDetail>>(`${this.workflows}/create`, body);
  }

  /** Publishes the steps as the next version; a refusal carries data.problems, each with where it is. */
  publish(key: string, steps: unknown, note: string | null): Observable<ApiResponse<WorkflowDetail & { problems?: string[] }>> {
    return this.http.post<ApiResponse<WorkflowDetail & { problems?: string[] }>>(`${this.workflows}/publish`, { key, steps, note });
  }

  setStatus(key: string, status: 'Active' | 'Inactive'): Observable<ApiResponse<WorkflowDetail>> {
    return this.http.post<ApiResponse<WorkflowDetail>>(`${this.workflows}/status`, null, { params: { key, status } });
  }

  start(body: { definitionKey: string; subjectId: string; title?: string; subject?: unknown }, key: string): Observable<ApiResponse<RequestRow>> {
    return this.http.post<ApiResponse<RequestRow>>(`${this.workflows}/start`, body, { headers: { 'Idempotency-Key': key } });
  }

  /** My requests: what the reader started. Under the task inbox, so a requester needs no other page to follow them. */
  requests(page: InboxQuery = {}): Observable<InboxPage<RequestRow>> { return this.page<RequestRow>('requests', page); }

  /** One page of an inbox list; only what is asked goes on the URL. */
  private page<T>(list: 'mine' | 'groups' | 'done' | 'requests', page: InboxQuery): Observable<InboxPage<T>> {
    const params: Record<string, string | number> = {};
    if (page.cursor) params['cursor'] = page.cursor;
    if (page.limit) params['limit'] = page.limit;
    if (page.q?.trim()) params['q'] = page.q.trim();
    return this.http.get<InboxPage<T>>(`${this.inbox}/${list}`, { params });
  }

  request(id: number): Observable<ApiResponse<RequestDetail>> {
    return this.http.get<ApiResponse<RequestDetail>>(`${this.inbox}/request`, { params: { id } });
  }

  cancel(id: number, reason: string | null, key: string): Observable<ApiResponse<RequestRow>> {
    const params: Record<string, string | number> = { id };
    if (reason) params['reason'] = reason;
    return this.http.post<ApiResponse<RequestRow>>(`${this.inbox}/cancel`, null, { params, headers: { 'Idempotency-Key': key } });
  }
}
