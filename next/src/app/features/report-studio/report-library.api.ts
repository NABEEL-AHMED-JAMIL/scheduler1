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
export type ReportState = 'READY' | 'WAITING' | 'APPROVED' | 'FAILED' | 'VOID' | 'PENDING';
export type MadeBy = 'PIPELINE' | 'SCHEDULE' | 'CONSOLE';

export const STATE_WORDS: Record<ReportState, string> = {
  READY: 'Ready', WAITING: 'Waiting for approval', APPROVED: 'Approved and signed', FAILED: 'Generation failed', VOID: 'Void',
  PENDING: 'No version yet',
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
    case 'PENDING': return 'Generating';
    default: return 'Ready';
  }
}

export interface LibraryRow {
  reportId: string; tenantId: number; reportNo: number; label: string; name: string; templateId: string; templateName: string;
  category?: string | null; test: boolean; status: string; state: ReportState; currentVersion?: number | null; pages?: number | null;
  madeAt?: string | null; updatedAt?: string | null; madeBy: MadeBy; createdBy?: number | null; signed: boolean;
  approvedBy?: number | null; approverName?: string | null; needsSecond: boolean; firstApprovedBy?: number | null;
  /** A failed report's newest job's message. */
  failReason?: string | null;
  firstApproverName?: string | null; askedAt?: string | null; waitingForMe: boolean;
}

export interface FacetValue { value: string; label?: string | null; count: number; }

export interface LibraryFacets {
  state: FacetValue[]; template: FacetValue[]; category: FacetValue[]; madeBy: FacetValue[]; approver: FacetValue[]; tests: number;
}

export interface HistogramDay { day: string; READY?: number; WAITING?: number; APPROVED?: number; FAILED?: number; VOID?: number; PENDING?: number; }

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

/** What a template has (media's TemplateFeatures): the gallery's chips, a template's "At a glance", a report's QR card. */
export interface TemplateFeatures {
  approvals: number; qr: boolean; qrContent?: string | null; charts: number; images: number; conditional: boolean; repeat: boolean;
  signature: boolean; stamp: boolean; confidentiality: boolean; components: number; pageSize?: string | null; orientation?: string | null;
}

export interface Meaning { code: string; words: string; }
export interface Meanings { meanings: Meaning[]; firstDefault: string; finalDefault: string; }

/** Reports redesign, feature 16: a person mentioned in a review comment. */
export interface ReviewMention { userId: number; name: string; }

/**
 * A review comment on a report version: a thread's first comment (pinned to a point of a page or to a block) or a reply.
 * Its words come masked from the server for a reader without See personal data (masked: true).
 */
export interface ReviewComment {
  commentId: string; version: number; text: string; masked: boolean; about: 'REPORT' | 'TEMPLATE'; authorId: number; authorName: string;
  createdAt: string; replyTo?: string; page?: number; x?: number; y?: number; componentId?: string; componentLabel?: string;
  mentions: ReviewMention[]; resolvedAt?: string; resolvedByName?: string; sentBackAt?: string; mine?: boolean; mayResolve?: boolean;
  replies?: ReviewComment[];
}

/** A version's review comments: its threads, how many are open, what the reader may do, and the blocks to pin to. */
export interface ReviewComments {
  reportId: string; version: number; label: string; masked: boolean; threads: ReviewComment[]; open: number; total: number;
  may: { comment: boolean; resolveAny: boolean; why?: string };
  blocks: { id: string; type: string; label: string }[];
}

/** A new comment: on a page point or a block (a new thread), or a reply. */
export interface NewComment {
  reportId: string; version: number; text: string; page?: number; x?: number; y?: number; componentId?: string; about?: 'TEMPLATE';
  mentions?: number[]; replyTo?: string;
}

/** An open review comment about a template's block, of a report made from it (the designer's list). */
export interface TemplateComment extends ReviewComment { reportLabel: string; templateVersion: number; link: string; }

export interface BulkResult { reportId: string; version?: number; ok: boolean; stage?: string; signed?: boolean; code?: string; message?: string;
  notSignedReason?: string; }
export interface BulkAnswer { results: BulkResult[]; approved: number; refused: number; }

// ---------------------------------------------------------------- reports redesign, features 10 and 12

/** One side of a comparison: the version, when it was made, from which template version and frozen data, its state. */
export interface CompareSide {
  version: number; createdAt: string; templateVersion: number; pages?: number | null; reason?: string | null;
  state: 'VOID' | 'APPROVED' | 'WAITING' | 'REJECTED' | 'GENERATED'; snapshotId: string; dataFrozenAt?: string | null; source?: string | null;
  expired: boolean; sensitive: boolean;
}

/** One change: a value of the frozen data, the template, or the approvals. */
export interface CompareChange {
  id: string; kind: 'data' | 'template' | 'approval'; title: string;
  /** data: changed, added (a row) or removed (a row). */
  change?: 'changed' | 'added' | 'removed';
  before?: string | null; after?: string | null; masked?: boolean; path?: string;
  /** Where: "page 1 · table “Wounds this visit” · row 2"; page and the side it is on (b, or a for a removed row). */
  where?: string; page?: number; side?: 'a' | 'b';
  /** template and approval: in words. */
  detail?: string; lines?: string[]; templateId?: string; fromTemplateVersion?: number; toTemplateVersion?: number;
  stateA?: string; stateB?: string;
}

/** A box to highlight on a page, as fractions of the page from its top left. */
export interface HighlightBox { page: number; x: number; y: number; w: number; h: number; }

export interface Comparison {
  reportId: string; name: string; label: string; a: CompareSide; b: CompareSide; notes: string[]; changes: CompareChange[];
  counts: { all: number; data: number; template: number; approval: number }; dataShown: number; personalMasked: boolean;
  highlights: { a: HighlightBox[]; b: HighlightBox[] };
}

/** Feature 12: whether a version has a copy without names, its rules, and the copy when made. */
export interface DeidentifiedStatus {
  reportId: string; version: number; available: boolean; reason?: string;
  personalFields: { path: string; label: string; rule?: string | null }[];
  rules: { dates: 'shift' | 'year' | 'keep'; freeText: boolean; picturesLeftOut: number };
  copy?: { copyId: string; version: number; pages?: number | null; pdf: boolean; html: boolean; madeAt: string; madeByName?: string | null;
    source: string; summary?: Record<string, unknown> };
  snapshotKept: boolean;
}

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

  /** Feature 10: versions a and b of a report compared -- the change list, and the boxes to highlight on their pages. */
  compare(reportId: string, a: number, b: number): Observable<Comparison> {
    return ReportLibraryApi.data$(this.http.get<ApiResponse<Comparison>>(`${this.library}/compare`,
      { params: { reportId, a: String(a), b: String(b) } }));
  }

  /** Feature 10: the comparison as a PDF (the change list). */
  comparePdf(reportId: string, a: number, b: number): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.library}/comparePdf`, { params: { reportId, a: String(a), b: String(b) }, responseType: 'blob', observe: 'response' });
  }

  /** Feature 12: whether a version has a copy without names. */
  deidentified(reportId: string, version: number): Observable<DeidentifiedStatus> {
    return ReportLibraryApi.data$(this.http.get<ApiResponse<DeidentifiedStatus>>(`${this.library}/deidentifiedCopy`,
      { params: { reportId, version: String(version) } }));
  }

  /** Feature 12: the version's copy without names as a file (made now if it was not): a signed link, then the download. */
  downloadDeidentified(reportId: string, version: number, format: 'PDF' | 'HTML'): Observable<HttpResponse<Blob>> {
    return new Observable<HttpResponse<Blob>>(subscriber => {
      const inner = this.http.post<ApiResponse<{ token: string }>>(`${this.library}/deidentifiedLink`, { reportId, version, format },
        { params: { reportId, version, format } }).subscribe({
        next: r => {
          const token = r.data?.token;
          if (!token) { subscriber.error(new Error(r.message || 'No download link.')); return; }
          this.http.get(`${this.library}/deidentifiedDownload`, { params: { token }, responseType: 'blob', observe: 'response' }).subscribe(subscriber);
        },
        error: e => subscriber.error(e),
      });
      return () => inner.unsubscribe();
    });
  }

  /** Feature 16: a version's review comments (masked on the server without See personal data). */
  comments(reportId: string, version: number): Observable<ReviewComments> {
    return ReportLibraryApi.data$(this.http.get<ApiResponse<ReviewComments>>(`${this.library}/comments`,
      { params: { reportId, version: String(version) } }));
  }

  /** Feature 16: a new comment or a reply; answers the version's comments as they are now. */
  addComment(body: NewComment): Observable<ReviewComments> {
    return ReportLibraryApi.data$(this.http.post<ApiResponse<ReviewComments>>(`${this.library}/comment`, body));
  }

  /** Feature 16: a thread resolved. */
  resolveComment(commentId: string): Observable<ReviewComments> {
    return ReportLibraryApi.data$(this.http.post<ApiResponse<ReviewComments>>(`${this.library}/commentResolve`, { commentId }));
  }

  /** Feature 16: who may be mentioned on a report. */
  commentPeople(reportId: string): Observable<{ people: ReviewMention[] }> {
    return ReportLibraryApi.data$(this.http.get<ApiResponse<{ people: ReviewMention[] }>>(`${this.library}/commentPeople`, { params: { reportId } }));
  }

  /** Feature 16: the open review comments about a template's blocks (the designer). */
  templateComments(templateId: string): Observable<{ templateId: string; masked: boolean; comments: TemplateComment[] }> {
    return ReportLibraryApi.data$(this.http.get<ApiResponse<{ templateId: string; masked: boolean; comments: TemplateComment[] }>>(
      `${this.library}/templateComments`, { params: { templateId } }));
  }

  meanings(): Observable<Meanings> {
    return ReportLibraryApi.data$(this.http.get<ApiResponse<Meanings>>(`${this.approving}/meanings`));
  }

  approveMany(items: { reportId: string; version: number }[], meaning?: string | null, note = ''): Observable<BulkAnswer> {
    return ReportLibraryApi.data$(this.http.post<ApiResponse<BulkAnswer>>(`${this.approving}/approveMany`,
      { items, note, ...(meaning ? { meaning } : {}) }));
  }
}
