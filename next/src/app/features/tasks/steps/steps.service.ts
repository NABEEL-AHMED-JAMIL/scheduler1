import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import { LIST_LIMIT } from '../../../core/api/list-limit';
import { jobActionRequest } from '../../jobs/job-actions';
import { DefinitionView, LinkedJob, RunRow, StepLog, StepTaskEntry, Timeline, ValidateResult } from './steps.model';

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

  tasks(): Observable<ApiResponse<StepTaskEntry[]>> {
    return this.http.get<ApiResponse<StepTaskEntry[]>>(`${API_BASE}/pipeline.json/steps/tasks`);
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

  /** A job's runs; Run now's answer does not name the run it queued, so the newest is read from here. */
  runs(jobId: number): Observable<ApiResponse<{ jobQueues?: RunRow[] }>> {
    return this.http.get<ApiResponse<{ jobQueues?: RunRow[] }>>(`${API_BASE}/sourceJob.json/fetchSourceJobQueueListWithJobId`,
      { params: { jobId } });
  }

  timeline(jobQueueId: number, attempt?: number): Observable<ApiResponse<Timeline>> {
    const params: Record<string, number> = { jobQueueId };
    if (attempt) params['attempt'] = attempt;
    return this.http.get<ApiResponse<Timeline>>(`${API_BASE}/sourceJob.json/stepExecutions`, { params });
  }

  stepLog(stepExecutionId: number): Observable<ApiResponse<StepLog>> {
    return this.http.get<ApiResponse<StepLog>>(`${API_BASE}/sourceJob.json/stepLogs`, { params: { stepExecutionId } });
  }
}
