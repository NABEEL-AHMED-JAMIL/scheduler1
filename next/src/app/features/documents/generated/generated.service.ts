import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, from, map, mergeMap, of, shareReplay, tap, toArray } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { RunOutput, outputsOf } from '../../jobs/run-steps/run-steps.model';
import { RunRow } from '../../tasks/steps/steps.model';
import {
  GeneratedReport, RenderFormats, RenderResult, ReportTemplateSummary, recentJobs, reportsFromRun,
} from './generated.model';

/**
 * How far the Reports list looks for run outputs: the schedules that ran most recently, and each
 * one's newest runs. There is no endpoint listing generated files (a backend gap), so this is a
 * fan-out of a few dozen reads at most, and the page says so.
 */
export const FAN_OUT = { jobs: 10, runsPerJob: 3, concurrency: 4 } as const;
const CACHE_MS = 60_000;

/** A schedule as listSourceJob sends it -- the fields the list needs. */
interface JobRow {
  jobId: number;
  jobName?: string | null;
  lastJobRun?: string | null;
  createdByName?: string | null;
  taskDetail?: { taskName?: string | null }[] | null;
}

/** The outputs of recent runs, and how far the read got. */
export interface RecentOutputs { reports: GeneratedReport[]; runsRead: number; jobsRead: number; failed: number; }

/**
 * MIG-253: media-service's render (MIG-232) and its templates, and Core's run outputs, for
 * Documents' converter and Reports.
 *
 * @author Nabeel Ahmed
 */
@Injectable({ providedIn: 'root' })
export class GeneratedService {
  private readonly http = inject(HttpClient);
  private readonly converter = `${API_BASE}/documentConverter.json`;
  private readonly jobs = `${API_BASE}/sourceJob.json`;
  private cached: { at: number; outputs: Observable<RecentOutputs> } | null = null;

  formats(): Observable<ApiResponse<RenderFormats>> {
    return this.http.get<ApiResponse<RenderFormats>>(`${this.converter}/renderFormats`);
  }

  templates(): Observable<ApiResponse<ReportTemplateSummary[]>> {
    return this.http.get<ApiResponse<ReportTemplateSummary[]>>(`${this.converter}/fetchAllTemplates`);
  }

  saveTemplate(template: Partial<ReportTemplateSummary>): Observable<ApiResponse<ReportTemplateSummary>> {
    return this.http.post<ApiResponse<ReportTemplateSummary>>(`${this.converter}/saveTemplate`, template);
  }

  deleteTemplate(reportTemplateId: number): Observable<ApiResponse> {
    return this.http.delete<ApiResponse>(`${this.converter}/deleteTemplate`, { params: { reportTemplateId } });
  }

  render(body: Record<string, unknown>): Observable<ApiResponse<RenderResult>> {
    return this.http.post<ApiResponse<RenderResult>>(`${this.converter}/render`, body);
  }

  /** A schedule's runs, newest first. */
  runs(jobId: number): Observable<RunRow[]> {
    return this.http.get<ApiResponse<{ jobQueues?: RunRow[] }>>(`${this.jobs}/fetchSourceJobQueueListWithJobId`, { params: { jobId } })
      .pipe(map(r => r.status === API_SUCCESS ? (r.data?.jobQueues ?? []) : []));
  }

  schedules(): Observable<JobRow[]> {
    return this.http.get<ApiResponse<JobRow[]>>(`${this.jobs}/listSourceJob`).pipe(
      map(r => { if (r.status !== API_SUCCESS) throw new Error(r.message || 'Could not read the schedules.'); return r.data ?? []; }));
  }

  /** What one run put out; null when the answer is not an output list. */
  runOutputs(jobQueueId: number): Observable<RunOutput[] | null> {
    return this.http.get<ApiResponse<unknown>>(`${this.jobs}/runOutputs`, { params: { jobQueueId } })
      .pipe(map(r => r.status === API_SUCCESS ? outputsOf(r.data) : null));
  }

  /**
   * The outputs of recent runs (see FAN_OUT), read once a minute at most: Reports and Storage's file
   * panel both ask, and neither should cost the other a second fan-out. `fresh` reads again.
   */
  recentOutputs(fresh = false): Observable<RecentOutputs> {
    if (!fresh && this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.outputs;
    const outputs = this.schedules().pipe(
      mergeMap(all => {
        const jobs = recentJobs(all, FAN_OUT.jobs);
        if (!jobs.length) return of({ reports: [], runsRead: 0, jobsRead: 0, failed: 0 });
        return from(jobs).pipe(
          mergeMap(job => this.runs(job.jobId).pipe(
            catchError(() => of([] as RunRow[])),
            map(runs => runs.slice(0, FAN_OUT.runsPerJob).map(run => ({ job, run })))), FAN_OUT.concurrency),
          mergeMap(pairs => from(pairs)),
          mergeMap(({ job, run }) => this.runOutputs(run.jobQueueId).pipe(
            catchError(() => of(null)),
            map(list => list === null ? null : reportsFromRun({
              jobQueueId: run.jobQueueId, jobId: job.jobId, jobName: job.jobName ?? null,
              pipelineName: job.taskDetail?.[0]?.taskName ?? null, owner: job.createdByName ?? null,
            }, list))), FAN_OUT.concurrency),
          toArray(),
          map(lists => ({
            reports: lists.flatMap(l => l ?? []), runsRead: lists.length, jobsRead: jobs.length,
            failed: lists.filter(l => l === null).length,
          })));
      }),
      tap({ error: () => this.cached = null }),
      shareReplay(1));
    this.cached = { at: Date.now(), outputs };
    return outputs;
  }

  /** A dataset a run kept, as a file to save (csv, json or jsonl). */
  runDatasetFile(runDatasetId: number, format: 'csv' | 'json' | 'jsonl'): Observable<Blob> {
    return this.http.get(`${this.jobs}/runDataset`, { params: { runDatasetId, format }, responseType: 'blob' });
  }

  /** A dataset a run kept, as JSON rows. */
  runDataset(runDatasetId: number): Observable<unknown> {
    return this.http.get(`${this.jobs}/runDataset`, { params: { runDatasetId, format: 'json' }, responseType: 'text' })
      .pipe(map(text => JSON.parse(text)));
  }
}
