import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import { BulkAnswer } from '../../../shared/ui/bulk/bulk.model';

/**
 * MIG-355: Runs › Failed, Core's answers.
 *
 * - POST message.json/failedRuns: the window's failed and timed-out runs, their facets (each leaves its own filter out)
 *   and their error patterns (counts, first and last seen). A tenant user needs the Queue page; a platform administrator
 *   sees every workspace's, with a workspace facet.
 * - GET sourceJob.json/retryPlan and POST sourceJob.json/retryRun: one run's retry (MIG-345), as on the run page.
 * - POST sourceJob.json/bulkRetry: a workspace administrator retries up to 50 failed runs, each by the single retry's rules.
 */
export interface FacetValue { key: string; name: string; count: number; }

export interface FailedFacets {
  workspaces?: FacetValue[];
  pipelines: FacetValue[];
  schedules: FacetValue[];
  steps: FacetValue[];
  kinds: FacetValue[];
  days: FacetValue[];
}

export interface ErrorGroup {
  signature: string;
  pattern: string;
  task: string | null;
  kind: string;
  kindLabel: string;
  count: number;
  firstSeen: string | null;
  lastSeen: string | null;
  sampleRunId: number;
  sampleJobId: number;
  sampleError: string | null;
  schedules: number;
}

export interface FailedRun {
  runId: number;
  tenantId: number;
  workspace: string | null;
  jobId: number;
  schedule: string | null;
  taskDetailId: number | null;
  pipeline: string | null;
  status: 'Failed' | 'Interrupt' | string;
  endReason: string | null;
  attempt: number;
  startedAt: string | null;
  endedAt: string | null;
  stepIndex: number | null;
  stepKey: string | null;
  task: string | null;
  error: string | null;
  timedOut: boolean | null;
  kind: string;
  kindLabel: string;
  signature: string;
  pattern: string;
  link: string;
  /** Failed (not interrupted) and not one of a backfill's runs, whose backfill retries it. */
  retryable: boolean;
  /** UX review 2026-10-13: the backfill this run is part of (Runs › Backfills, Retry failed), else null. */
  backfillId?: number | null;
}

/** Whether Runs › Failed may retry the run itself: a backfill's run is its backfill's to retry. */
export function retryableHere(run: Pick<FailedRun, 'retryable' | 'backfillId'>): boolean {
  return run.retryable && !run.backfillId;
}

export interface FailedRunsAnswer {
  from: string;
  to: string;
  total: number;
  scanned: number;
  truncated: boolean;
  page: number;
  pageSize: number;
  platform: boolean;
  facets: FailedFacets;
  groups: ErrorGroup[];
  items: FailedRun[];
}

export interface FailedQuery {
  from: string;
  to: string;
  tenantIds: number[];
  taskDetailIds: number[];
  jobIds: number[];
  tasks: string[];
  kinds: string[];
  days: string[];
  signature: string | null;
  page: number;
  /** Owner 2026-10-27 ("add a sort on each table"): Core's run, pipeline, kind, ended (+ workspace, platform); none is newest first. */
  sort?: string;
  dir?: 'asc' | 'desc';
}

export interface RetryPlan {
  jobQueueId: number;
  jobId: number;
  attempt: number;
  nextAttempt: number;
  resumable: boolean;
  refusalKind: string | null;
  refusal: string | null;
  fromIndex: number | null;
  fromKey: string | null;
  fromName: string | null;
  reused: { index: number; key: string; name: string | null; task: string; rowsOut: number | null }[];
  restartable: boolean;
  restartRefusal: string | null;
}

@Injectable({ providedIn: 'root' })
export class FailedRunsApi {
  private readonly http = inject(HttpClient);

  search(query: FailedQuery): Observable<ApiResponse<FailedRunsAnswer>> {
    return this.http.post<ApiResponse<FailedRunsAnswer>>(`${API_BASE}/message.json/failedRuns`, query);
  }

  retryPlan(jobQueueId: number): Observable<ApiResponse<RetryPlan>> {
    return this.http.get<ApiResponse<RetryPlan>>(`${API_BASE}/sourceJob.json/retryPlan`, { params: { jobQueueId } });
  }

  retry(jobQueueId: number, from: 'failed_step' | 'start'): Observable<ApiResponse<RetryPlan>> {
    return this.http.post<ApiResponse<RetryPlan>>(`${API_BASE}/sourceJob.json/retryRun`, { jobQueueId, from });
  }

  bulkRetry(jobQueueIds: number[], bulkId: string, dryRun: boolean): Observable<ApiResponse<BulkAnswer>> {
    return this.http.post<ApiResponse<BulkAnswer>>(`${API_BASE}/sourceJob.json/bulkRetry`, { jobQueueIds, from: 'failed_step', bulkId, dryRun });
  }
}

/** The error kinds in the order a reader sorts them, and the word for each (the server's labels, kept here for the empty states). */
export const KIND_ORDER = ['timed_out', 'too_large', 'data', 'service', 'settings', 'rejected', 'operator', 'other'];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A day "2026-10-13" as "Tue 13 Oct" (the day before the month, as every date in the console). */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** The local days [from, to] as instants: from's midnight to the midnight after to, in the viewer's zone. */
export function windowOf(from: string, to: string): { from: string; to: string } {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return { from: new Date(fy, fm - 1, fd).toISOString(), to: new Date(ty, tm - 1, td + 1).toISOString() };
}
