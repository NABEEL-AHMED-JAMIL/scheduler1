import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import { LIST_LIMIT } from '../../../core/api/list-limit';
import { jobActionRequest } from '../../jobs/job-actions';
import { DocumentsApi } from '../../documents/documents.service';
import { TaskChange, TaskControlState, TaskUsage, UsageOf, UsagePipeline, UsageRuns, usageParams } from './task-usage.model';
import { DefinitionView, LinkedJob, BucketChoice, DocumentTypeChoice, PromptChoice, RunRow, StepLog, StepTaskEntry, Timeline, ValidateResult, STEP_WEBHOOK_EVENT, WebhookChoice } from './steps.model';

export type DefinitionFormat = 'json' | 'yaml';

/**
 * Core's step definition endpoints (MIG-230) and the run reads the builder's Run now follows, as the step builder
 * (MIG-249) calls them. The definition reads and validate are any member's who holds the pipelines page; save is a
 * workspace administrator's. Every answer is the {status, message, data} envelope and a refusal is status ERROR with
 * HTTP 200 -- callers read `status`. A validate or save that finds problems answers ERROR with them in data.problems.
 */
@Injectable({ providedIn: 'root' })
export class StepsApi {
  private readonly http = inject(HttpClient);
  private readonly documents = inject(DocumentsApi);

  definition(pipelineKey: number): Observable<ApiResponse<DefinitionView>> {
    return this.http.get<ApiResponse<DefinitionView>>(`${API_BASE}/pipeline.json/steps/definition`, { params: { pipelineKey } });
  }

  /** The draft's problems, each at its path; and -- when it reads -- the definition, its JSON and its YAML. */
  validate(format: DefinitionFormat, text: string): Observable<ApiResponse<ValidateResult>> {
    return this.http.post<ApiResponse<ValidateResult>>(`${API_BASE}/pipeline.json/steps/validate`, { format, text });
  }

  /** Saves the draft as the pipeline's next version (unchanged text is no new version). */
  save(pipelineKey: number, format: DefinitionFormat, text: string): Observable<ApiResponse<ValidateResult>> {
    return this.http.post<ApiResponse<ValidateResult>>(`${API_BASE}/pipeline.json/steps/save`, { pipelineKey, format, text });
  }

  /**
   * The Task Registry as this workspace sees it (MIG-231): every task, and one legacy line per pipeline. Owner #16: a
   * platform administrator names the workspace (the shared selector); anyone else's tenantId is ignored by Core.
   */
  tasks(tenantId?: number | null): Observable<ApiResponse<StepTaskEntry[]>> {
    const params: Record<string, number> = {};
    if (tenantId) params['tenantId'] = tenantId;
    return this.http.get<ApiResponse<StepTaskEntry[]>>(`${API_BASE}/pipeline.json/steps/tasks`, { params });
  }

  /** Owner #16: a platform administrator sets a task to default, enabled, disabled or blocked for one workspace. */
  setPlatformState(code: string, state: TaskControlState, tenantId: number, reason: string | null): Observable<ApiResponse<StepTaskEntry>> {
    return this.http.post<ApiResponse<StepTaskEntry>>(`${API_BASE}/pipeline.json/steps/tasks/platformState`, { code, state, reason },
      { params: { tenantId } });
  }

  /** Owner #16: who switched, blocked or reset a task (or every task, code null) in the workspace, newest first. */
  taskHistory(code: string | null, tenantId?: number | null): Observable<ApiResponse<TaskChange[]>> {
    const params: Record<string, string | number> = {};
    if (code) params['code'] = code;
    if (tenantId) params['tenantId'] = tenantId;
    return this.http.get<ApiResponse<TaskChange[]>>(`${API_BASE}/pipeline.json/steps/tasks/history`, { params });
  }

  /** Owner #17: per task and per Legacy row, the pipelines using it and their runs this month (server-counted). */
  taskUsage(tenantId?: number | null): Observable<ApiResponse<TaskUsage>> {
    const params: Record<string, number> = {};
    if (tenantId) params['tenantId'] = tenantId;
    return this.http.get<ApiResponse<TaskUsage>>(`${API_BASE}/pipeline.json/steps/tasks/usage`, { params });
  }

  /** Owner #17: the pipelines behind a count -- a task's (code) or a Legacy row's (pipelineKey). */
  taskPipelines(of: UsageOf, tenantId?: number | null): Observable<ApiResponse<UsagePipeline[]>> {
    return this.http.get<ApiResponse<UsagePipeline[]>>(`${API_BASE}/pipeline.json/steps/tasks/pipelines`, { params: usageParams(of, tenantId) });
  }

  /** Owner #17: those pipelines' runs this month, newest first. */
  taskRuns(of: UsageOf, tenantId?: number | null, limit = 100): Observable<ApiResponse<UsageRuns>> {
    return this.http.get<ApiResponse<UsageRuns>>(`${API_BASE}/pipeline.json/steps/tasks/runs`,
      { params: { ...usageParams(of, tenantId), limit } });
  }

  /** A workspace administrator switches a task on or off here, or back to its default (null). Legacy is refused. */
  switchTask(code: string, enabled: boolean | null): Observable<ApiResponse<StepTaskEntry>> {
    return this.http.post<ApiResponse<StepTaskEntry>>(`${API_BASE}/pipeline.json/steps/tasks/enabled`, { code, enabled });
  }

  /** The schedules that run this task: what Run now runs. */
  jobsOf(taskDetailId: number): Observable<ApiResponse<LinkedJob[]>> {
    return this.http.post<ApiResponse<LinkedJob[]>>(`${API_BASE}/sourceTask.json/fetchAllLinkJobsWithSourceTaskId`, {},
      { params: { sourceTaskId: String(taskDetailId), limit: String(LIST_LIMIT) } });
  }

  run(jobId: number): Observable<ApiResponse> {
    const request = jobActionRequest('run', jobId);
    return this.http.request<ApiResponse>(request.method, request.url, { body: request.body });
  }

  /**
   * A job's newest runs; Run now's answer does not name the run it queued, so the newest is read from here.
   * `limit` keeps it to the window asked for: the history of a minute job is half a million rows a year.
   */
  runs(jobId: number, limit = 1): Observable<ApiResponse<{ jobQueues?: RunRow[] }>> {
    return this.http.get<ApiResponse<{ jobQueues?: RunRow[] }>>(`${API_BASE}/sourceJob.json/fetchSourceJobQueueListWithJobId`,
      { params: { jobId, limit } });
  }

  timeline(jobQueueId: number, attempt?: number): Observable<ApiResponse<Timeline>> {
    const params: Record<string, number> = { jobQueueId };
    if (attempt) params['attempt'] = attempt;
    return this.http.get<ApiResponse<Timeline>>(`${API_BASE}/sourceJob.json/stepExecutions`, { params });
  }

  stepLog(stepExecutionId: number): Observable<ApiResponse<StepLog>> {
    return this.http.get<ApiResponse<StepLog>>(`${API_BASE}/sourceJob.json/stepLogs`, { params: { stepExecutionId } });
  }

  /** MIG-245: the workspace's active prompts, by name, for a step that names one (the AI prompt step). */
  /** MIG-321: the workspace's buckets, by alias, for a step's bucket setting. */
  buckets(): Observable<BucketChoice[]> {
    return this.http.get<ApiResponse<{ bucket: string; label?: string }[]>>(`${API_BASE}/storage.json/buckets`).pipe(
      map(r => (r.data ?? []).filter(b => !!b.bucket).map(b => ({ alias: b.bucket, label: b.label || b.bucket }))));
  }

  /** MIG-346: the workspace's webhooks (integration-service), for a Send webhook step: ready ones take run.step.sent and are active. */
  webhooks(): Observable<WebhookChoice[]> {
    return this.http.get<ApiResponse<{ id: string; url: string; eventTypes?: string[]; active?: boolean }[]>>(`${API_BASE}/webhook.json/list`).pipe(
      map(r => (r.data ?? []).filter(w => /^\d+$/.test(String(w.id))).map(w => {
        const takes = (w.eventTypes ?? []).includes(STEP_WEBHOOK_EVENT);
        const ready = !!w.active && takes;
        const why = !w.active ? ' (paused)' : !takes ? ` (does not take ${STEP_WEBHOOK_EVENT})` : '';
        return { id: Number(w.id), label: `#${w.id} ${w.url}${why}`, ready };
      })));
  }

  /** MIG-364: the workspace's document types (Document Intelligence's own list), by name, for a step that names one. */
  documentTypes(): Observable<DocumentTypeChoice[]> {
    return this.documents.types().pipe(
      map(r => (Array.isArray(r.data) ? r.data : []).filter(t => t.documentTypeId != null).map(t => ({
        id: Number(t.documentTypeId),
        label: t.status && t.status !== 'Active' ? `${t.name} (inactive)` : t.name,
      }))));
  }

  prompts(): Observable<PromptChoice[]> {
    return this.http.get<ApiResponse<{ promptId?: number; name: string; status?: string }[]>>(`${API_BASE}/aiPrompt.json/list`).pipe(
      map(r => (r.data ?? []).filter(p => p.promptId != null && p.status === 'Active').map(p => ({ id: p.promptId!, label: p.name }))));
  }
}
