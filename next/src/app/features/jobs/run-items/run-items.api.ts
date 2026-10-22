import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable, map, switchMap, throwError } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import {
  AttentionRun, ItemCounts, ItemData, ItemDetail, ItemFilesPage, ItemFilter, ItemsPage, ItemsQuery, RetryAnswer, RetryBody, ReviewAnswer,
  Reviewers, SelectionAnswer,
} from './run-items.model';
import { AcrossPage, AcrossQuery, Comparison } from '../schedule-items/schedule-items.model';

/** A bulk selection as the bulk endpoints take it. */
export type SelectionBody = { jobQueueId: number; refs?: string[]; all?: boolean; status?: ItemFilter; search?: string; except?: string[] };

const BASE = `${API_BASE}/sourceJob.json`;

/** An answer's data, or an error carrying Core's message (the envelope said ERROR). */
function dataOf<T>(r: ApiResponse<T>): T {
  if (r?.status !== API_SUCCESS) throw Object.assign(new Error(r?.message || 'Refused.'), { refused: true, message: r?.message || 'Refused.' });
  return r.data as T;
}

/**
 * Core's run items (MIG-420): the list, one item's detail and its data at a step, its files, the zip of them, a CSV of
 * the list, the counts the Runs list shows, the runs Home says need attention, and retrying items. Files come as blobs
 * through HttpClient, so the sign-in's token goes with them.
 */
@Injectable({ providedIn: 'root' })
export class RunItemsApi {
  private readonly http = inject(HttpClient);

  list(query: ItemsQuery): Observable<ItemsPage> {
    return this.http.post<ApiResponse<ItemsPage>>(`${BASE}/runItems`, query).pipe(map(dataOf));
  }

  /** One item; previous and next walk the items the list shows with this filter and search. */
  detail(jobQueueId: number, ref: string, attempt?: number | null, status?: string | null, search?: string | null): Observable<ItemDetail> {
    const params: Record<string, string> = { jobQueueId: String(jobQueueId), ref };
    if (attempt) params['attempt'] = String(attempt);
    if (status && status !== 'all') params['status'] = status;
    if (search && search.trim()) params['search'] = search.trim();
    return this.http.get<ApiResponse<ItemDetail>>(`${BASE}/runItems/detail`, { params }).pipe(map(dataOf));
  }

  data(jobQueueId: number, ref: string, stepKey: string, attempt?: number | null): Observable<ItemData> {
    const params: Record<string, string> = { jobQueueId: String(jobQueueId), ref, stepKey };
    if (attempt) params['attempt'] = String(attempt);
    return this.http.get<ApiResponse<ItemData>>(`${BASE}/runItems/data`, { params }).pipe(map(dataOf));
  }

  files(body: { jobQueueId: number; ref: string; stepKey?: string; search?: string; page: number; size: number; attempt?: number }): Observable<ItemFilesPage> {
    return this.http.post<ApiResponse<ItemFilesPage>>(`${BASE}/runItems/files`, body).pipe(map(dataOf));
  }

  /** One file's bytes: inline to look at it here, else as a download. */
  file(jobQueueId: number, ref: string, fileRef: string, inline: boolean): Observable<Blob> {
    return this.http.get(`${BASE}/runItems/file`, {
      params: { jobQueueId: String(jobQueueId), ref, fileRef, inline: String(inline) }, responseType: 'blob',
    });
  }

  /** Every file of an item (or of one of its steps) as a zip: a short-lived link first, then the zip itself. */
  zip(jobQueueId: number, ref: string, stepKey?: string | null): Observable<HttpResponse<Blob>> {
    const params: Record<string, string> = { jobQueueId: String(jobQueueId), ref };
    if (stepKey) params['stepKey'] = stepKey;
    return this.http.get<ApiResponse<{ token: string; expiresAt?: string; files?: number }>>(`${BASE}/runItems/zipLink`, { params }).pipe(
      map(dataOf),
      switchMap(link => link?.token
        ? this.http.get(`${BASE}/runItems/zip`, { params: { jobQueueId: String(jobQueueId), token: link.token }, responseType: 'blob', observe: 'response' })
        : throwError(() => new Error('No link to the files.'))),
    );
  }

  /**
   * The list as CSV, with the filter, the search and the columns shown (masked as on screen); MIG-421: or of a selection --
   * the refs ticked, or all matching less except.
   */
  csv(jobQueueId: number, status: ItemFilter, search: string, fields: string[], refs?: string[], except?: string[]): Observable<HttpResponse<Blob>> {
    const params: Record<string, string | string[]> = { jobQueueId: String(jobQueueId), status };
    if (search.trim()) params['search'] = search.trim();
    if (fields.length) params['fields'] = fields;
    if (refs?.length) params['refs'] = refs;
    if (except?.length) params['except'] = except;
    return this.http.get(`${BASE}/runItems/csv`, { params, responseType: 'blob', observe: 'response' });
  }

  /** MIG-421: how many items a selection names and how many of them failed, before a bulk action. */
  selection(body: SelectionBody): Observable<SelectionAnswer> {
    return this.http.post<ApiResponse<SelectionAnswer>>(`${BASE}/runItems/selection`, body).pipe(map(dataOf));
  }

  /** MIG-421: the selected items' files as one zip, a folder each: a two-minute signed link first, then the zip. */
  zipMany(sel: SelectionBody): Observable<HttpResponse<Blob>> {
    const params: Record<string, string | string[]> = { jobQueueId: String(sel.jobQueueId) };
    if (sel.all) params['all'] = 'true';
    if (sel.refs?.length) params['refs'] = sel.refs;
    if (sel.status && sel.status !== 'all') params['status'] = sel.status;
    if (sel.search) params['search'] = sel.search;
    if (sel.except?.length) params['except'] = sel.except;
    return this.http.get<ApiResponse<{ token: string; expiresAt?: string; items?: number; files?: number }>>(`${BASE}/runItems/zipLink`, { params }).pipe(
      map(dataOf),
      switchMap(link => link?.token
        ? this.http.get(`${BASE}/runItems/zip`, { params: { jobQueueId: String(sel.jobQueueId), token: link.token }, responseType: 'blob', observe: 'response' })
        : throwError(() => new Error('No link to the files.'))),
    );
  }

  /** MIG-421: the selected items to a team or role, as a Task inbox task naming them. */
  review(body: SelectionBody & { reviewers: Reviewers; note?: string }): Observable<{ data: ReviewAnswer; message: string }> {
    return this.http.post<ApiResponse<ReviewAnswer>>(`${BASE}/reviewRunItems`, body).pipe(map(r => ({ data: dataOf(r), message: r.message ?? '' })));
  }

  /** MIG-421: a schedule's items across its runs, newest first (the item records only). */
  acrossRuns(query: AcrossQuery): Observable<AcrossPage> {
    return this.http.post<ApiResponse<AcrossPage>>(`${BASE}/itemRuns`, query).pipe(map(dataOf));
  }

  /** MIG-421: one item in two runs, step by step, and the pipeline change between them. */
  compare(jobId: number, key: string, a: number, b: number): Observable<Comparison> {
    return this.http.get<ApiResponse<Comparison>>(`${BASE}/itemRuns/compare`, {
      params: { jobId: String(jobId), key, a: String(a), b: String(b) },
    }).pipe(map(dataOf));
  }

  counts(jobQueueIds: number[]): Observable<Record<string, ItemCounts>> {
    return this.http.post<ApiResponse<Record<string, ItemCounts>>>(`${BASE}/runItems/counts`, { jobQueueIds }).pipe(map(r => dataOf(r) ?? {}));
  }

  attention(limit = 5): Observable<AttentionRun[]> {
    return this.http.get<ApiResponse<AttentionRun[]>>(`${BASE}/runItems/attention`, { params: { limit: String(limit) } })
      .pipe(map(r => { const d = dataOf(r); return Array.isArray(d) ? d : []; }));
  }

  /** Retries items; the answer's message ("Retrying 2 items from AI prompt: attempt 2.") comes with it. */
  retry(body: RetryBody): Observable<{ data: RetryAnswer; message: string }> {
    return this.http.post<ApiResponse<RetryAnswer>>(`${BASE}/retryRunItems`, body)
      .pipe(map(r => ({ data: dataOf(r), message: r.message ?? '' })));
  }
}

/** The words of a refusal: the envelope's message (a 409's body, an ERROR answer), else the fallback. */
export function refusalText(err: unknown, fallback: string): string {
  const e = err as { error?: { message?: string } | null; message?: string; refused?: boolean } | null;
  return e?.error?.message || (e?.refused ? e.message : '') || fallback;
}
