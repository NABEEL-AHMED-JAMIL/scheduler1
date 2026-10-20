import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_BASE, ApiResponse } from '../../core/api/api.config';
import {
  DataSourceRow, InspectResult, JobRow, PreviewResult, Problem, ReportDetail, ReportRow, SourceRef, StudioOverview,
  TemplateDetail, TemplateLibrary, VersionRow,
} from './report-studio.model';

/** What a refusal says (spec section 22): a stable code, a sentence, and the problems that blocked it. */
export interface StudioError { code: string; message: string; problems: Problem[]; retryable: boolean; }

/** A refusal's code, sentence and problems, from any error the API answered (or a sentence for one it did not). */
export function studioError(e: unknown, fallback = 'Something went wrong; try again.'): StudioError {
  const body = e instanceof HttpErrorResponse ? e.error : (e as { error?: unknown })?.error;
  const b = (body && typeof body === 'object' ? body : {}) as { code?: string; message?: string; retryable?: boolean;
    details?: { problems?: Problem[] } };
  const status = e instanceof HttpErrorResponse ? e.status : 0;
  const message = b.message || (status === 0 ? 'The service could not be reached; try again.' : fallback);
  return { code: b.code ?? (status === 403 ? 'FORBIDDEN' : 'ERROR'), message, problems: b.details?.problems ?? [], retryable: !!b.retryable };
}

/**
 * Report Studio (MIG-403), media-service's, through the gateway: one prefix per page key -- the hub (report-studio),
 * templates (report-templates), publishing (report-publish), the preview, data (report-data), generating
 * (report-generate) and the library (report-library). The gateway refuses a call whose page the reader does not hold.
 */
@Injectable({ providedIn: 'root' })
export class ReportStudioApi {
  private readonly http = inject(HttpClient);
  private readonly studio = `${API_BASE}/reportStudio.json`;
  private readonly templates = `${API_BASE}/reportTemplate.json`;
  private readonly publishing = `${API_BASE}/reportPublish.json`;
  private readonly previews = `${API_BASE}/reportPreview.json`;
  private readonly data = `${API_BASE}/reportData.json`;
  private readonly generating = `${API_BASE}/reportGenerate.json`;
  private readonly library = `${API_BASE}/reportLibrary.json`;

  private static data$<T>(o: Observable<ApiResponse<T>>): Observable<T> {
    return o.pipe(map(r => r.data as T));
  }

  private static scope(tenantId?: number | null): Record<string, string> {
    return tenantId ? { tenantId: String(tenantId) } : {};
  }

  overview(tenantId?: number | null): Observable<StudioOverview> {
    return ReportStudioApi.data$(this.http.get<ApiResponse<StudioOverview>>(`${this.studio}/overview`,
      { params: ReportStudioApi.scope(tenantId) }));
  }

  schema(): Observable<Record<string, unknown>> {
    return ReportStudioApi.data$(this.http.get<ApiResponse<Record<string, unknown>>>(`${this.studio}/schema`));
  }

  // ---------------------------------------------------------------- templates

  list(archived = false, tenantId?: number | null): Observable<TemplateLibrary> {
    return ReportStudioApi.data$(this.http.get<ApiResponse<TemplateLibrary>>(`${this.templates}/fetchAll`,
      { params: { archived: String(archived), ...ReportStudioApi.scope(tenantId) } }));
  }

  template(templateId: string, tenantId?: number | null): Observable<TemplateDetail> {
    return ReportStudioApi.data$(this.http.get<ApiResponse<TemplateDetail>>(`${this.templates}/fetchById`,
      { params: { templateId, ...ReportStudioApi.scope(tenantId) } }));
  }

  version(templateId: string, version: string): Observable<VersionRow> {
    return ReportStudioApi.data$(this.http.get<ApiResponse<VersionRow>>(`${this.templates}/version`, { params: { templateId, version } }));
  }

  exportJson(templateId: string, version: string): Observable<Record<string, unknown>> {
    return ReportStudioApi.data$(this.http.get<ApiResponse<Record<string, unknown>>>(`${this.templates}/export`,
      { params: { templateId, version } }));
  }

  create(body: Record<string, unknown>): Observable<TemplateDetail> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<TemplateDetail>>(`${this.templates}/create`, body));
  }

  saveDraft(templateId: string, revision: number, definition: unknown): Observable<TemplateDetail> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<TemplateDetail>>(`${this.templates}/saveDraft`, { revision, definition },
      { params: { templateId } }));
  }

  newDraft(templateId: string, fromVersion: number): Observable<TemplateDetail> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<TemplateDetail>>(`${this.templates}/newDraft`, null,
      { params: { templateId, fromVersion: String(fromVersion) } }));
  }

  discardDraft(templateId: string): Observable<TemplateDetail> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<TemplateDetail>>(`${this.templates}/discardDraft`, null, { params: { templateId } }));
  }

  archive(templateId: string): Observable<TemplateDetail> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<TemplateDetail>>(`${this.templates}/archive`, null, { params: { templateId } }));
  }

  remove(templateId: string): Observable<unknown> {
    return this.http.delete<ApiResponse>(`${this.templates}/delete`, { params: { templateId } });
  }

  validate(body: Record<string, unknown>): Observable<{ problems: Problem[]; summary: { errors: number; warnings: number; valid: boolean } }> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<{ problems: Problem[]; summary: { errors: number; warnings: number; valid: boolean } }>>(
      `${this.templates}/validate`, body));
  }

  saveSample(templateId: string, name: string, source: SourceRef): Observable<unknown> {
    return ReportStudioApi.data$(this.http.post<ApiResponse>(`${this.templates}/sample/save`, { name, source }, { params: { templateId } }));
  }

  deleteSample(sampleId: string): Observable<unknown> {
    return this.http.delete<ApiResponse>(`${this.templates}/sample/delete`, { params: { sampleId } });
  }

  publish(templateId: string, revision: number, changeSummary: string): Observable<TemplateDetail> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<TemplateDetail>>(`${this.publishing}/publish`, { revision, changeSummary },
      { params: { templateId } }));
  }

  // ---------------------------------------------------------------- preview ("Test with data")

  previewHtml(body: Record<string, unknown>): Observable<PreviewResult> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<PreviewResult>>(`${this.previews}/html`, body));
  }

  previewPdf(body: Record<string, unknown>): Observable<HttpResponse<Blob>> {
    return this.http.post(`${this.previews}/pdf`, body, { responseType: 'blob', observe: 'response' });
  }

  // ---------------------------------------------------------------- data

  sources(tenantId?: number | null): Observable<DataSourceRow[]> {
    return this.http.get<ApiResponse<{ sources: DataSourceRow[] }>>(`${this.data}/sources`, { params: ReportStudioApi.scope(tenantId) })
      .pipe(map(r => r.data?.sources ?? []));
  }

  inspect(source: SourceRef, rootPath = '$'): Observable<InspectResult> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<InspectResult>>(`${this.data}/inspect`, { source, rootPath }));
  }

  upload(file: File, name: string): Observable<DataSourceRow> {
    const form = new FormData();
    form.append('file', file, file.name);
    if (name.trim()) form.append('name', name.trim());
    return ReportStudioApi.data$(this.http.post<ApiResponse<DataSourceRow>>(`${this.data}/upload`, form));
  }

  saveSource(name: string, source: SourceRef, rootPath = '$'): Observable<DataSourceRow> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<DataSourceRow>>(`${this.data}/save`, { name, source, rootPath }));
  }

  archiveSource(sourceId: string): Observable<unknown> {
    return this.http.post<ApiResponse>(`${this.data}/archive`, null, { params: { sourceId } });
  }

  // ---------------------------------------------------------------- generating and the library

  generate(body: Record<string, unknown>, idempotencyKey: string): Observable<JobRow> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<JobRow>>(`${this.generating}/generate`, body,
      { headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }) }));
  }

  cancelJob(jobId: string): Observable<JobRow> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<JobRow>>(`${this.generating}/cancelJob`, null, { params: { jobId } }));
  }

  archiveReport(reportId: string): Observable<ReportDetail> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<ReportDetail>>(`${this.generating}/archiveReport`, null, { params: { reportId } }));
  }

  reports(status = '', tenantId?: number | null): Observable<ReportRow[]> {
    return this.http.get<ApiResponse<{ reports: ReportRow[] }>>(`${this.library}/reports`,
      { params: { ...(status ? { status } : {}), limit: '200', ...ReportStudioApi.scope(tenantId) } }).pipe(map(r => r.data?.reports ?? []));
  }

  report(reportId: string, tenantId?: number | null): Observable<ReportDetail> {
    return ReportStudioApi.data$(this.http.get<ApiResponse<ReportDetail>>(`${this.library}/report`,
      { params: { reportId, ...ReportStudioApi.scope(tenantId) } }));
  }

  jobs(status = '', tenantId?: number | null): Observable<JobRow[]> {
    return this.http.get<ApiResponse<{ jobs: JobRow[] }>>(`${this.library}/jobs`,
      { params: { ...(status ? { status } : {}), limit: '100', ...ReportStudioApi.scope(tenantId) } }).pipe(map(r => r.data?.jobs ?? []));
  }

  job(jobId: string): Observable<JobRow> {
    return ReportStudioApi.data$(this.http.get<ApiResponse<JobRow>>(`${this.library}/job`, { params: { jobId } }));
  }

  /** One output as a file: a signed link (five minutes, the reader's own), then the proxied download. */
  download(reportId: string, version: number, format: 'PDF' | 'HTML'): Observable<HttpResponse<Blob>> {
    return new Observable<HttpResponse<Blob>>(subscriber => {
      const inner = this.http.post<ApiResponse<{ token: string }>>(`${this.library}/downloadLink`, { reportId, version, format }).subscribe({
        next: r => {
          const token = r.data?.token;
          if (!token) { subscriber.error(new Error(r.message || 'No download link.')); return; }
          this.http.get(`${this.library}/download`, { params: { token }, responseType: 'blob', observe: 'response' }).subscribe(subscriber);
        },
        error: e => subscriber.error(e),
      });
      return () => inner.unsubscribe();
    });
  }
}
