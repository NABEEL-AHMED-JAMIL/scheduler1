import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import { BulkAnswer, BulkRequest } from './bulk.model';

/** Core's review policy for runs: whether runs may be approved in bulk in this workspace. */
export interface RunReviewPolicy {
  bulkApproveRuns: boolean;
  saved?: boolean;
  updatedBy?: number | null;
  updatedAt?: string | null;
}

/** ai-service's review policy for documents: bulk approve, and whether it accepts documents whose rules fail. */
export interface DocumentReviewPolicy {
  bulkApprove: boolean;
  bulkApproveRuleFailures: boolean;
  saved?: boolean;
  updatedBy?: number | null;
  updatedAt?: string | null;
}

/**
 * The bulk review endpoints (CONTRACT.md, 2026-10-12): workflow-service's Task inbox (tasks, or the reader's tasks about
 * runs), Core's run review (a workspace administrator's), ai-service's document review, and the two review policies.
 * Each answers the same per-item shape (BulkAnswer).
 */
@Injectable({ providedIn: 'root' })
export class BulkReviewApi {
  private readonly http = inject(HttpClient);

  /** Task inbox: approval tasks by id, or the reader's open approval task about each subject ("pipeline-run:8301"). */
  tasks(items: { taskIds: number[] } | { subjectIds: string[] }, request: BulkRequest): Observable<ApiResponse<BulkAnswer>> {
    return this.http.post<ApiResponse<BulkAnswer>>(`${API_BASE}/taskInbox.json/bulkAct`, { ...items, ...request });
  }

  /** Core: runs' review decided by a workspace administrator. Reject's comment is the reason; no rerun in bulk. */
  runs(jobQueueIds: number[], request: BulkRequest): Observable<ApiResponse<BulkAnswer>> {
    const { action, ...rest } = request;
    return this.http.post<ApiResponse<BulkAnswer>>(`${API_BASE}/sourceJob.json/review/bulkDecide`,
      { jobQueueIds, decision: action === 'approve' ? 'APPROVED' : 'REJECTED', ...rest });
  }

  /** ai-service: documents in review, each at the revision it was listed at. */
  documents(extractionIds: number[], revisions: Record<string, number>, request: BulkRequest): Observable<ApiResponse<BulkAnswer>> {
    return this.http.post<ApiResponse<BulkAnswer>>(`${API_BASE}/documentReview.json/bulkDecide`, { extractionIds, revisions, ...request });
  }

  runPolicy(): Observable<ApiResponse<RunReviewPolicy>> {
    return this.http.get<ApiResponse<RunReviewPolicy>>(`${API_BASE}/sourceJob.json/review/policy`);
  }

  saveRunPolicy(body: { bulkApproveRuns: boolean }): Observable<ApiResponse<RunReviewPolicy>> {
    return this.http.post<ApiResponse<RunReviewPolicy>>(`${API_BASE}/sourceJob.json/review/policy`, body);
  }

  documentPolicy(): Observable<ApiResponse<DocumentReviewPolicy>> {
    return this.http.get<ApiResponse<DocumentReviewPolicy>>(`${API_BASE}/documentReview.json/policy`);
  }

  saveDocumentPolicy(body: { bulkApprove: boolean; bulkApproveRuleFailures: boolean }): Observable<ApiResponse<DocumentReviewPolicy>> {
    return this.http.post<ApiResponse<DocumentReviewPolicy>>(`${API_BASE}/documentReview.json/policy`, body);
  }
}
