import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import { ConversionPage, ConversionQuery, ConversionRow, ConverterLimits, FormatFamily } from './converter.model';
import { IntakeAnswer } from '../../documents/documents.model';

const BASE = `${API_BASE}/documentConverter.json`;

/** media-service's Document Converter (the tools redesign's API): conversions recorded and kept 30 days unless kept. */
@Injectable({ providedIn: 'root' })
export class ConverterApi {
  private readonly http = inject(HttpClient);

  formats(): Observable<ApiResponse<FormatFamily[]>> {
    return this.http.get<ApiResponse<FormatFamily[]>>(`${BASE}/supportedFormats`);
  }

  limits(): Observable<ApiResponse<ConverterLimits>> {
    return this.http.get<ApiResponse<ConverterLimits>>(`${BASE}/limits`);
  }

  /** One file converted and recorded; a refusal is a row too (outcome FAILED). 429: busy, nothing recorded. */
  convert(file: File, outputFormat: string, keep: { bucketName: string; targetFolder: string } | null): Observable<HttpEvent<ApiResponse<ConversionRow>>> {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('outputFormat', outputFormat);
    if (keep) {
      form.append('bucketName', keep.bucketName);
      if (keep.targetFolder.trim()) form.append('targetFolder', keep.targetFolder.trim());
    }
    return this.http.post<ApiResponse<ConversionRow>>(`${BASE}/conversions`, form, { reportProgress: true, observe: 'events' });
  }

  /** Recent conversions with each facet's counts (tools Option A): no `view`, so media-service answers with facets. */
  list(query: ConversionQuery): Observable<ApiResponse<ConversionPage>> {
    const params: Record<string, string> = { days: String(query.days), page: String(query.page), size: String(query.size) };
    if (query.q.trim()) params['q'] = query.q.trim();
    for (const key of ['status', 'from', 'kept', 'by'] as const) if (query[key].length) params[key] = query[key].join(',');
    return this.http.get<ApiResponse<ConversionPage>>(`${BASE}/conversions`, { params });
  }

  one(id: number): Observable<ApiResponse<ConversionRow>> {
    return this.http.get<ApiResponse<ConversionRow>>(`${BASE}/conversions/${id}`);
  }

  file(id: number, side: 'input' | 'output'): Observable<Blob> {
    return this.http.get(`${BASE}/conversions/${id}/file`, { params: { side }, responseType: 'blob' });
  }

  /** One page of either side, rendered on the server as a PNG; X-Page-Count says how many there are. */
  page(id: number, side: 'input' | 'output', page: number): Observable<HttpResponse<Blob>> {
    return this.http.get(`${BASE}/conversions/${id}/page`, { params: { side, page: String(page) }, responseType: 'blob', observe: 'response' });
  }

  keep(id: number, bucketName: string, targetFolder: string): Observable<ApiResponse<ConversionRow>> {
    return this.http.post<ApiResponse<ConversionRow>>(`${BASE}/conversions/${id}/keep`, { bucketName, targetFolder });
  }

  sendToDocuments(id: number): Observable<ApiResponse<{ intake: IntakeAnswer; conversion: ConversionRow }>> {
    return this.http.post<ApiResponse<{ intake: IntakeAnswer; conversion: ConversionRow }>>(`${BASE}/conversions/${id}/sendToDocuments`, {});
  }

  download(ids: number[]): Observable<Blob> {
    return this.http.post(`${BASE}/conversions/download`, { ids }, { responseType: 'blob' });
  }

  remove(id: number): Observable<ApiResponse> {
    return this.http.delete<ApiResponse>(`${BASE}/conversions/${id}`);
  }
}
