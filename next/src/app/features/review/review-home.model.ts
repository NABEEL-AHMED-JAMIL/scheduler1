import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { BulkReviewApi } from '../../shared/ui/bulk/bulk-review.api';
import { BulkAnswer, BulkItem, BulkRequest, refusal } from '../../shared/ui/bulk/bulk.model';
import { ReviewItem, ReviewKind, ReviewVia } from './review-sources';

export const KIND_LABEL: Record<ReviewKind, string> = { approval: 'Approval', run: 'Run', document: 'Document' };
export const KIND_ICON: Record<ReviewKind, string> = { approval: 'checkCircle', run: 'history', document: 'file' };

/** Where an item is decided on its own: its task in Approvals, its run's page, its document's review screen. */
export function linkOf(item: ReviewItem): { path: (string | number)[]; query?: Record<string, string> } {
  if (item.kind === 'document') return { path: ['/review/documents', item.id] };
  if (item.kind === 'run' && item.jobId != null && item.runId != null) return { path: ['/pipelines/schedules', item.jobId, 'runs', item.runId] };
  return { path: ['/review/approvals'], query: { task: String(item.id) } };
}

/**
 * One bulk decision over a mixed selection (DR2): the picked rows split by the service that decides them, each part sent
 * to that service's own bulk endpoint with the same bulk id, comment and dry run -- workflow-service's bulkAct for the
 * reader's tasks, Core's bulkDecide for an administrator's runs, ai-service's bulkDecide for documents (at the revision
 * each was listed at) -- and the answers laid back together, each item under the row id the page knows it by. A part that
 * cannot be sent comes back as its items failed, with the service's message; the other parts still go.
 */
export function sendMixed(api: BulkReviewApi, rows: ReviewItem[], request: BulkRequest): Observable<ApiResponse<BulkAnswer>> {
  const parts = new Map<ReviewVia, ReviewItem[]>();
  for (const row of rows) parts.set(row.via, [...(parts.get(row.via) ?? []), row]);
  const calls = [...parts].map(([via, items]) => {
    const call: Observable<ApiResponse<BulkAnswer>> = via === 'task' ? api.tasks({ taskIds: items.map(i => i.id) }, request)
      : via === 'core' ? api.runs(items.map(i => i.id), request)
      : api.documents(items.map(i => i.id), Object.fromEntries(items.map(i => [String(i.id), i.doc?.revision ?? 0])), request);
    const byId = new Map(items.map(i => [String(i.id), i]));
    const relabel = (item: BulkItem): BulkItem => {
      const row = byId.get(String(item.id));
      return row ? { ...item, id: row.uid, label: item.label || row.title, group: item.group || row.from } : item;
    };
    const failedAll = (message: string): BulkAnswer => ({
      bulkId: request.bulkId, action: request.action, dryRun: request.dryRun, requested: items.length, done: [], skipped: [],
      failed: items.map(i => ({ id: i.uid, label: i.title, group: i.from, message })),
    });
    return call.pipe(
      map(r => r.status === API_SUCCESS && r.data
        ? { ...r.data, done: r.data.done.map(relabel), skipped: r.data.skipped.map(relabel), failed: r.data.failed.map(relabel) }
        : failedAll(r.message || 'The service refused the decision.')),
      catchError(err => of(failedAll(refusal(err, 'The service could not be reached.')))),
    );
  });
  if (!calls.length) return of({ status: API_SUCCESS, message: '', data: emptyAnswer(request) });
  return forkJoin(calls).pipe(map(answers => ({
    status: API_SUCCESS,
    message: '',
    data: answers.reduce<BulkAnswer>((all, a) => ({
      ...all,
      requested: all.requested + a.requested,
      done: [...all.done, ...a.done],
      skipped: [...all.skipped, ...a.skipped],
      failed: [...all.failed, ...a.failed],
    }), emptyAnswer(request)),
  })));
}

function emptyAnswer(request: BulkRequest): BulkAnswer {
  return { bulkId: request.bulkId, action: request.action, dryRun: request.dryRun, requested: 0, done: [], skipped: [], failed: [] };
}
