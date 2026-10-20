import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_BASE, ApiResponse } from '../../core/api/api.config';
import { PaletteEntry } from './designer/designer-model';
import {
  AssetDetail, AssetLibrary, BrandDefinition, BrandProfileDetail, BrandProfileRow, Contrast, Person, Usable,
} from './assets.model';
import {
  Approval, DataSourceRow, InspectResult, JobRow, PreviewResult, Problem, ReportDetail, ReportRow, SourceRef, StudioOverview,
  TemplateContract, TemplateDetail, TemplateLibrary, VerifyResult, VersionRow,
} from './report-studio.model';

/** A page of the report library (reports or jobs): the filters the service applies, then limit (1 to 200) and offset. */
export interface LibraryQuery { status?: string; q?: string; templateId?: string; limit?: number; offset?: number; }

/** One page of rows, and how many the filters match in all. */
export interface LibraryPage<T> { rows: T[]; total: number; offset: number; limit: number; }

/** A page of the template library: the library's paging and the Templates page's filters. */
export interface TemplateQuery extends LibraryQuery { archived?: boolean; category?: string; state?: string; owner?: string; }

/** A page of the asset library. */
export interface AssetQuery { q?: string; kind?: string; state?: string; used?: string; limit?: number; offset?: number; }

/** The rows one library read asks for when it names no limit; the service answers 200 at most. */
export const LIBRARY_PAGE = 50;

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
  // MIG-406: Assets & branding (report-assets), signatures and stamps (report-asset-custodian), the approver (report-approve).
  private readonly assetsBase = `${API_BASE}/reportAsset.json`;
  private readonly custodian = `${API_BASE}/reportAssetCustodian.json`;
  private readonly approving = `${API_BASE}/reportApprove.json`;

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

  /** The component palette (the registry's types, groups, words and starting settings). */
  components(): Observable<PaletteEntry[]> {
    return this.http.get<ApiResponse<{ components?: PaletteEntry[] } | PaletteEntry[]>>(`${this.studio}/components`)
      .pipe(map(r => (Array.isArray(r.data) ? r.data : r.data?.components ?? [])));
  }

  // ---------------------------------------------------------------- templates

  /**
   * One page of the workspace's templates (newest change first) with total, counts and categories, and every starter.
   * Filters: q, category, state (PUBLISHED, DRAFT, HAS_DRAFT, LIVE = has a published version), owner (ME, STARTER, COPY).
   */
  list(query: TemplateQuery = {}, tenantId?: number | null): Observable<TemplateLibrary> {
    const params: Record<string, string> = { archived: String(!!query.archived), ...ReportStudioApi.page(query), ...ReportStudioApi.scope(tenantId) };
    for (const k of ['category', 'state', 'owner'] as const) if (query[k]) params[k] = query[k]!;
    return ReportStudioApi.data$(this.http.get<ApiResponse<TemplateLibrary>>(`${this.templates}/fetchAll`, { params }))
      .pipe(map(lib => ({ ...lib, total: lib.total ?? lib.templates.length, counts: lib.counts ?? { templates: lib.templates.length },
        categories: lib.categories ?? [] })));
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

  /** "Ask for approval" (MIG-404): recorded on the draft's revision; publishing stays report-publish's. */
  requestApproval(templateId: string, revision: number, note: string): Observable<TemplateDetail> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<TemplateDetail>>(`${this.templates}/requestApproval`, { revision, note },
      { params: { templateId } }));
  }

  /** Each live template's data contract (MIG-404). */
  contracts(tenantId?: number | null): Observable<TemplateContract[]> {
    return this.http.get<ApiResponse<{ templates: TemplateContract[] }>>(`${this.templates}/contracts`, { params: ReportStudioApi.scope(tenantId) })
      .pipe(map(r => r.data?.templates ?? []));
  }

  /** A template version's first page as a 320 px PNG (MIG-404): the newest published one, else the draft, or the one named. */
  templateThumbnail(templateId: string, version?: string | null, tenantId?: number | null): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.templates}/thumbnail`, { params: { templateId, ...(version ? { version } : {}), ...ReportStudioApi.scope(tenantId) },
      responseType: 'blob', observe: 'response' });
  }

  /** A page (default the first) of a report version's PDF as a 320 px PNG (MIG-404; any page since 2026-10-20). */
  reportThumbnail(reportId: string, version?: number | null, tenantId?: number | null, page = 1): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.library}/thumbnail`, {
      params: { reportId, ...(version ? { version: String(version) } : {}), ...(page > 1 ? { page: String(page) } : {}), ...ReportStudioApi.scope(tenantId) },
      responseType: 'blob', observe: 'response' });
  }

  publish(templateId: string, revision: number, changeSummary: string): Observable<TemplateDetail> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<TemplateDetail>>(`${this.publishing}/publish`, { revision, changeSummary },
      { params: { templateId } }));
  }

  // ---------------------------------------------------------------- preview ("Test with data")

  previewHtml(body: Record<string, unknown>): Observable<PreviewResult> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<PreviewResult>>(`${this.previews}/html`, body));
  }

  /** The designer's canvas (MIG-404): the definition being edited as HTML whose elements name their components. */
  canvas(body: Record<string, unknown>): Observable<PreviewResult> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<PreviewResult>>(`${this.previews}/canvas`, body));
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

  /** Phase 4: marks a version VOID, with the reason; not taken back. */
  voidVersion(reportId: string, version: number, reason: string): Observable<{ reportId: string; version: number; void: boolean }> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<{ reportId: string; version: number; void: boolean }>>(`${this.generating}/voidVersion`,
      { reportId, version, reason }));
  }

  archiveReport(reportId: string): Observable<ReportDetail> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<ReportDetail>>(`${this.generating}/archiveReport`, null, { params: { reportId } }));
  }

  /** One page of the library's reports, newest change first; total is how many the filters match in all. */
  reports(query: LibraryQuery = {}, tenantId?: number | null): Observable<LibraryPage<ReportRow>> {
    return this.http.get<ApiResponse<{ reports: ReportRow[]; total?: number; offset?: number; limit?: number }>>(`${this.library}/reports`,
      { params: { ...ReportStudioApi.page(query), ...(query.templateId ? { templateId: query.templateId } : {}), ...ReportStudioApi.scope(tenantId) } })
      .pipe(map(r => ReportStudioApi.pageOf(r.data?.reports, r.data)));
  }

  report(reportId: string, tenantId?: number | null): Observable<ReportDetail> {
    return ReportStudioApi.data$(this.http.get<ApiResponse<ReportDetail>>(`${this.library}/report`,
      { params: { reportId, ...ReportStudioApi.scope(tenantId) } }));
  }

  /** One page of generation jobs, newest first (status RUNNING: every job not finished yet); with total. */
  jobs(query: LibraryQuery = {}, tenantId?: number | null): Observable<LibraryPage<JobRow>> {
    return this.http.get<ApiResponse<{ jobs: JobRow[]; total?: number; offset?: number; limit?: number }>>(`${this.library}/jobs`,
      { params: { ...ReportStudioApi.page(query), ...ReportStudioApi.scope(tenantId) } })
      .pipe(map(r => ReportStudioApi.pageOf(r.data?.jobs, r.data)));
  }

  private static page(query: { status?: string; q?: string; limit?: number; offset?: number }): Record<string, string> {
    const q = query.q?.trim();
    return { ...(query.status ? { status: query.status } : {}), ...(q ? { q } : {}), limit: String(query.limit ?? LIBRARY_PAGE),
      offset: String(query.offset ?? 0) };
  }

  private static pageOf<T>(rows: T[] | undefined, data?: { total?: number; offset?: number; limit?: number } | null): LibraryPage<T> {
    const list = rows ?? [];
    return { rows: list, total: data?.total ?? list.length, offset: data?.offset ?? 0, limit: data?.limit ?? list.length };
  }

  job(jobId: string): Observable<JobRow> {
    return ReportStudioApi.data$(this.http.get<ApiResponse<JobRow>>(`${this.library}/job`, { params: { jobId } }));
  }

  // ---------------------------------------------------------------- MIG-406: approvals that sign, and verify

  /** Approve a report version (report-approve; never the person who generated it): its PDF is certified in the approver's name. */
  approve(reportId: string, version: number, note = ''): Observable<Approval> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<Approval>>(`${this.approving}/approve`, { reportId, version, note }));
  }

  verify(reportId: string, version: number): Observable<VerifyResult> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<VerifyResult>>(`${this.library}/verify`, { reportId, version }));
  }

  verifyFile(file: File): Observable<VerifyResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    return ReportStudioApi.data$(this.http.post<ApiResponse<VerifyResult>>(`${this.library}/verifyFile`, form));
  }

  // ---------------------------------------------------------------- MIG-406: assets

  /** One page of the asset library's cards (newest change first) with total and the scope's counts, and the brand profiles. */
  assets(filters: AssetQuery = {}, tenantId?: number | null): Observable<AssetLibrary> {
    const params: Record<string, string> = { ...ReportStudioApi.page(filters), ...ReportStudioApi.scope(tenantId) };
    for (const k of ['kind', 'state', 'used'] as const) if (filters[k]) params[k] = filters[k]!;
    return ReportStudioApi.data$(this.http.get<ApiResponse<AssetLibrary>>(`${this.assetsBase}/assets`, { params }))
      .pipe(map(lib => ({ ...lib, total: lib.total ?? lib.assets.length })));
  }

  asset(assetId: string, tenantId?: number | null): Observable<AssetDetail> {
    return ReportStudioApi.data$(this.http.get<ApiResponse<AssetDetail>>(`${this.assetsBase}/asset`,
      { params: { assetId, ...ReportStudioApi.scope(tenantId) } }));
  }

  /** A version's picture (the current approved one when none is named), as a blob the page shows through an object URL. */
  assetFile(assetId: string, version?: number | null, tenantId?: number | null): Observable<Blob> {
    return this.http.get(`${this.assetsBase}/file`, { params: { assetId, ...(version ? { version: String(version) } : {}),
      ...ReportStudioApi.scope(tenantId) }, responseType: 'blob' });
  }

  /**
   * What this person may place (approved, active), searched on the server: q and kinds (LOGO, IMAGE, SIGNATURE, STAMP),
   * one page (200 at most) with total; and the published brand profiles.
   */
  usable(templateId?: string | null, query: { q?: string; kinds?: string[]; limit?: number; offset?: number } = {}): Observable<Usable> {
    const params: Record<string, string> = { ...ReportStudioApi.page({ q: query.q, limit: query.limit ?? 200, offset: query.offset }),
      ...(templateId ? { templateId } : {}), ...(query.kinds?.length ? { kinds: query.kinds.join(',') } : {}) };
    return ReportStudioApi.data$(this.http.get<ApiResponse<Usable>>(`${this.assetsBase}/usable`, { params }))
      .pipe(map(u => ({ ...u, total: u.total ?? u.assets.length })));
  }

  people(): Observable<Person[]> {
    return this.http.get<ApiResponse<{ people: Person[] }>>(`${this.assetsBase}/people`).pipe(map(r => r.data?.people ?? []));
  }

  /** A logo or image (report-assets), or a signature or stamp (report-asset-custodian): the file and its details. */
  uploadAsset(file: Blob, fileName: string, fields: Record<string, string | number | null | undefined>, restricted: boolean): Observable<AssetDetail> {
    const form = new FormData();
    form.append('file', file, fileName);
    for (const [k, v] of Object.entries(fields)) if (v !== null && v !== undefined && String(v) !== '') form.append(k, String(v));
    return ReportStudioApi.data$(this.http.post<ApiResponse<AssetDetail>>(`${restricted ? this.custodian : this.assetsBase}/upload`, form));
  }

  uploadAssetVersion(assetId: string, file: Blob, fileName: string, restricted: boolean): Observable<AssetDetail> {
    const form = new FormData();
    form.append('file', file, fileName);
    form.append('assetId', assetId);
    return ReportStudioApi.data$(this.http.post<ApiResponse<AssetDetail>>(`${restricted ? this.custodian : this.assetsBase}/version/upload`, form));
  }

  renameAsset(body: { assetId: string; rowVersion: number; name?: string; description?: string; category?: string; ownerTitle?: string }):
    Observable<AssetDetail> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<AssetDetail>>(`${this.assetsBase}/rename`, body));
  }

  retireAsset(assetId: string, restricted: boolean): Observable<AssetDetail> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<AssetDetail>>(`${restricted ? this.custodian : this.assetsBase}/retire`, { assetId }));
  }

  deleteAsset(assetId: string): Observable<unknown> {
    return ReportStudioApi.data$(this.http.post<ApiResponse>(`${this.assetsBase}/delete`, { assetId }));
  }

  reviewAsset(assetId: string, version: number, approve: boolean, note = ''): Observable<AssetDetail> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<AssetDetail>>(`${this.approving}/asset/${approve ? 'approve' : 'reject'}`,
      { assetId, version, note }));
  }

  grant(assetId: string, userId: number, templateId?: string | null, expiresAt?: string | null): Observable<AssetDetail> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<AssetDetail>>(`${this.assetsBase}/grant`, { assetId, userId, templateId, expiresAt }));
  }

  revokeGrant(grantId: string): Observable<AssetDetail> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<AssetDetail>>(`${this.assetsBase}/grant/revoke`, { grantId }));
  }

  // ---------------------------------------------------------------- MIG-406: brand profiles

  brandProfiles(tenantId?: number | null): Observable<BrandProfileRow[]> {
    return this.http.get<ApiResponse<{ profiles: BrandProfileRow[] }>>(`${this.assetsBase}/brandProfiles`, { params: ReportStudioApi.scope(tenantId) })
      .pipe(map(r => r.data?.profiles ?? []));
  }

  brandProfile(profileId: string, tenantId?: number | null): Observable<BrandProfileDetail> {
    return ReportStudioApi.data$(this.http.get<ApiResponse<BrandProfileDetail>>(`${this.assetsBase}/brandProfile`,
      { params: { profileId, ...ReportStudioApi.scope(tenantId) } }));
  }

  createBrandProfile(name: string, fromProfileId?: string | null): Observable<BrandProfileDetail> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<BrandProfileDetail>>(`${this.assetsBase}/brandProfile/create`,
      { name, ...(fromProfileId ? { fromProfileId } : {}) }));
  }

  saveBrandDraft(profileId: string, revision: number | null, definition: BrandDefinition, name?: string): Observable<BrandProfileDetail> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<BrandProfileDetail>>(`${this.assetsBase}/brandProfile/draft/save`,
      { profileId, ...(revision ? { revision } : {}), definition, ...(name ? { name } : {}) }));
  }

  askBrandApproval(profileId: string, note = ''): Observable<BrandProfileDetail> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<BrandProfileDetail>>(`${this.assetsBase}/brandProfile/requestApproval`, { profileId, note }));
  }

  archiveBrandProfile(profileId: string): Observable<BrandProfileDetail> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<BrandProfileDetail>>(`${this.assetsBase}/brandProfile/archive`, { profileId }));
  }

  previewBrand(profileId: string | null, definition: BrandDefinition): Observable<{ html: string; contrast: Contrast; problems: Problem[];
    sources?: Record<string, string> }> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<{ html: string; contrast: Contrast; problems: Problem[]; sources?: Record<string, string> }>>(
      `${this.assetsBase}/brandProfile/preview`, { ...(profileId ? { profileId } : {}), definition }));
  }

  publishBrand(profileId: string, revision: number, changeSummary = ''): Observable<BrandProfileDetail> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<BrandProfileDetail>>(`${this.publishing}/brandProfile/publish`,
      { profileId, revision, changeSummary }));
  }

  setDefaultBrand(profileId: string): Observable<BrandProfileDetail> {
    return ReportStudioApi.data$(this.http.post<ApiResponse<BrandProfileDetail>>(`${this.publishing}/brandProfile/setDefault`, { profileId }));
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
