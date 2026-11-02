import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_BASE, ApiResponse } from '../../core/api/api.config';

/**
 * Reports redesign (owner 2026-11-02, "build all"): the library as an explorer, the overview's 30-day figures, approve and
 * sign several reports at once, and what an approval means. media-service's reportLibrary.json/browse and /summary,
 * reportApprove.json/approveMany and /meanings.
 */

/** A report's state, as the library's facets and pills say it. */
export type ReportState = 'READY' | 'WAITING' | 'APPROVED' | 'FAILED' | 'VOID';
export type MadeBy = 'PIPELINE' | 'SCHEDULE' | 'CONSOLE';

export const STATE_WORDS: Record<ReportState, string> = {
  READY: 'Ready', WAITING: 'Waiting for approval', APPROVED: 'Approved and signed', FAILED: 'Generation failed', VOID: 'Void',
};
export const MADE_BY_WORDS: Record<MadeBy, string> = { PIPELINE: 'A pipeline', SCHEDULE: 'A schedule', CONSOLE: 'A person' };

/** The pill's tone for a state. */
export function stateTone(s: ReportState | string): 'ok' | 'warn' | 'crit' | 'neutral' {
  return s === 'APPROVED' ? 'ok' : s === 'WAITING' ? 'warn' : s === 'FAILED' ? 'crit' : 'neutral';
}

/** The short word a list row's pill shows: "Signed", "2nd approval", "Waiting", "Ready", "Failed", "Void". */
export function stateChip(r: Pick<LibraryRow, 'state' | 'signed' | 'needsSecond' | 'firstApprovedBy'>): string {
  switch (r.state) {
    case 'APPROVED': return r.signed ? 'Signed' : 'Approved';
    case 'WAITING': return r.needsSecond && r.firstApprovedBy ? '2nd approval' : 'Waiting';
    case 'FAILED': return 'Failed';
    case 'VOID': return 'Void';
    default: return 'Ready';
  }
}

export interface LibraryRow {
  reportId: string; tenantId: number; reportNo: number; label: string; name: string; templateId: string; templateName: string;
  category?: string | null; test: boolean; status: string; state: ReportState; currentVersion?: number | null; pages?: number | null;
  madeAt?: string | null; updatedAt?: string | null; madeBy: MadeBy; createdBy?: number | null; signed: boolean;
  approvedBy?: number | null; approverName?: string | null; needsSecond: boolean; firstApprovedBy?: number | null;
  firstApproverName?: string | null; askedAt?: string | null; waitingForMe: boolean;
}

export interface FacetValue { value: string; label?: string | null; count: number; }

export interface LibraryFacets {
  state: FacetValue[]; template: FacetValue[]; category: FacetValue[]; madeBy: FacetValue[]; approver: FacetValue[]; tests: number;
}

export interface HistogramDay { day: string; READY?: number; WAITING?: number; APPROVED?: number; FAILED?: number; VOID?: number; }

export interface LibraryBrowse {
  reports: LibraryRow[]; total: number; offset: number; limit: number; facets: LibraryFacets;
  histogram: { zone: string; days: HistogramDay[] };
}

export interface BrowseQuery {
  q?: string; state?: string[]; templateId?: string[]; category?: string[]; madeBy?: string[]; approver?: string[];
  tests?: boolean; from?: string | null; to?: string | null; tz?: string; sort?: string; dir?: 'asc' | 'desc'; limit?: number; offset?: number;
}

export interface LibrarySummary {
  zone: string; made30: number; madeBefore30: number; madeDaily: { day: string; count: number }[];
  madeByCategory: ({ day: string } & Record<string, number | string>)[];
  approved: { total: number; approved: number; signed: number; medianHours: number | null };
  waiting: { count: number; mine: number; reports: LibraryRow[] };
  recent: LibraryRow[]; mostUsed: { templateId: string; name: string; reports: number }[]; testTemplates: number;
}

export interface Meaning { code: string; words: string; }
export interface Meanings { meanings: Meaning[]; firstDefault: string; finalDefault: string; }

export interface BulkResult { reportId: string; version?: number; ok: boolean; stage?: string; signed?: boolean; code?: string; message?: string;
  notSignedReason?: string; }
export interface BulkAnswer { results: BulkResult[]; approved: number; refused: number; }

/** The console's time zone, for days in the histogram (the browser's; Chicago when it cannot say). */
export function consoleZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago';
  } catch {
    return 'America/Chicago';
  }
}

@Injectable({ providedIn: 'root' })
export class ReportLibraryApi {
  private readonly http = inject(HttpClient);
  private readonly library = `${API_BASE}/reportLibrary.json`;
  private readonly approving = `${API_BASE}/reportApprove.json`;

  private static data$<T>(o: Observable<ApiResponse<T>>): Observable<T> {
    return o.pipe(map(r => r.data as T));
  }

  browse(q: BrowseQuery, tenantId?: number | null): Observable<LibraryBrowse> {
    const params: Record<string, string> = { tz: q.tz ?? consoleZone() };
    const list = (k: keyof BrowseQuery, v?: string[]) => { if (v?.length) params[k] = v.join(','); };
    if (q.q?.trim()) params['q'] = q.q.trim();
    list('state', q.state); list('templateId', q.templateId); list('category', q.category); list('madeBy', q.madeBy); list('approver', q.approver);
    if (q.tests) params['tests'] = 'true';
    if (q.from) params['from'] = q.from;
    if (q.to) params['to'] = q.to;
    if (q.sort) { params['sort'] = q.sort; params['dir'] = q.dir ?? 'asc'; }
    params['limit'] = String(q.limit ?? 50);
    params['offset'] = String(q.offset ?? 0);
    if (tenantId) params['tenantId'] = String(tenantId);
    return ReportLibraryApi.data$(this.http.get<ApiResponse<LibraryBrowse>>(`${this.library}/browse`, { params }));
  }

  summary(tenantId?: number | null): Observable<LibrarySummary> {
    return ReportLibraryApi.data$(this.http.get<ApiResponse<LibrarySummary>>(`${this.library}/summary`,
      { params: { tz: consoleZone(), ...(tenantId ? { tenantId: String(tenantId) } : {}) } }));
  }

  /** A page of a version's PDF as a PNG: 720 px wide (the side panel, the report page's rail). */
  page(reportId: string, version: number | null | undefined, page = 1, tenantId?: number | null): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.library}/thumbnail`, {
      params: { reportId, wide: 'true', page: String(page), ...(version ? { version: String(version) } : {}),
        ...(tenantId ? { tenantId: String(tenantId) } : {}) },
      responseType: 'blob', observe: 'response' });
  }

  meanings(): Observable<Meanings> {
    return ReportLibraryApi.data$(this.http.get<ApiResponse<Meanings>>(`${this.approving}/meanings`));
  }

  approveMany(items: { reportId: string; version: number }[], meaning?: string | null, note = ''): Observable<BulkAnswer> {
    return ReportLibraryApi.data$(this.http.post<ApiResponse<BulkAnswer>>(`${this.approving}/approveMany`,
      { items, note, ...(meaning ? { meaning } : {}) }));
  }
}
