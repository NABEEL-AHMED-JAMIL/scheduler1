import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import { IntakeAnswer } from '../../documents/documents.model';
import { BlurRegion, Comparison, Description, ImageDocument, ImageLimits, PhotoDetail, PhotoDetails, PhotoList, PhotoQuery } from './image.model';

const BASE = `${API_BASE}/imageReview.json`;

/** media-service's Image review: photos measured in code against their ruler, with a draft description to confirm. */
@Injectable({ providedIn: 'root' })
export class ImageApi {
  private readonly http = inject(HttpClient);

  limits(): Observable<ApiResponse<ImageLimits>> {
    return this.http.get<ApiResponse<ImageLimits>>(`${BASE}/limits`);
  }

  list(query: PhotoQuery): Observable<ApiResponse<PhotoList>> {
    const params: Record<string, string> = { days: String(query.days), page: String(query.page), size: String(query.size) };
    if (query.q.trim()) params['q'] = query.q.trim();
    for (const key of ['status', 'site', 'patient', 'by'] as const) if (query[key].length) params[key] = query[key].join(',');
    return this.http.get<ApiResponse<PhotoList>>(`${BASE}/photos`, { params });
  }

  upload(file: File, details: PhotoDetails): Observable<ApiResponse<{ photos: PhotoDetail[] }>> {
    const form = new FormData();
    form.append('file', file, file.name);
    for (const [k, v] of Object.entries(details)) if (v != null && String(v).trim()) form.append(k, String(v).trim());
    return this.http.post<ApiResponse<{ photos: PhotoDetail[] }>>(`${BASE}/photos`, form);
  }

  fromBucket(bucket: string, key: string, details: PhotoDetails): Observable<ApiResponse<PhotoDetail>> {
    return this.http.post<ApiResponse<PhotoDetail>>(`${BASE}/photos/fromBucket`, { bucket, key, ...details });
  }

  fromDocuments(ocrDocumentId: number, details: PhotoDetails): Observable<ApiResponse<PhotoDetail>> {
    return this.http.post<ApiResponse<PhotoDetail>>(`${BASE}/photos/fromDocuments`, { ocrDocumentId, ...details });
  }

  documents(): Observable<ApiResponse<{ rows: ImageDocument[] }>> {
    return this.http.get<ApiResponse<{ rows: ImageDocument[] }>>(`${BASE}/documents`);
  }

  one(id: number): Observable<ApiResponse<PhotoDetail>> {
    return this.http.get<ApiResponse<PhotoDetail>>(`${BASE}/photos/${id}`);
  }

  image(id: number, thumb: boolean): Observable<Blob> {
    return this.http.get(`${BASE}/photos/${id}/image`, { params: thumb ? { thumb: 'true' } : {}, responseType: 'blob' });
  }

  download(id: number, format: 'photo' | 'outlined' | 'pdf'): Observable<Blob> {
    return this.http.get(`${BASE}/photos/${id}/download`, { params: { format }, responseType: 'blob' });
  }

  edit(id: number, details: PhotoDetails): Observable<ApiResponse<PhotoDetail>> {
    return this.http.put<ApiResponse<PhotoDetail>>(`${BASE}/photos/${id}`, details);
  }

  outline(id: number, outline: number[]): Observable<ApiResponse<PhotoDetail>> {
    return this.http.post<ApiResponse<PhotoDetail>>(`${BASE}/photos/${id}/outline`, { outline });
  }

  remeasure(id: number): Observable<ApiResponse<PhotoDetail>> {
    return this.http.post<ApiResponse<PhotoDetail>>(`${BASE}/photos/${id}/remeasure`, {});
  }

  blur(id: number, regions: BlurRegion[]): Observable<ApiResponse<PhotoDetail>> {
    return this.http.post<ApiResponse<PhotoDetail>>(`${BASE}/photos/${id}/blur`, { regions });
  }

  confirm(id: number, fields?: Description): Observable<ApiResponse<PhotoDetail>> {
    return this.http.post<ApiResponse<PhotoDetail>>(`${BASE}/photos/${id}/description/confirm`, fields ? { fields } : {});
  }

  discard(id: number): Observable<ApiResponse<PhotoDetail>> {
    return this.http.post<ApiResponse<PhotoDetail>>(`${BASE}/photos/${id}/description/discard`, {});
  }

  describeAgain(id: number): Observable<ApiResponse<PhotoDetail>> {
    return this.http.post<ApiResponse<PhotoDetail>>(`${BASE}/photos/${id}/description/again`, {});
  }

  compare(id: number): Observable<ApiResponse<Comparison>> {
    return this.http.get<ApiResponse<Comparison>>(`${BASE}/photos/${id}/compare`);
  }

  sendToDocuments(id: number): Observable<ApiResponse<{ intake: IntakeAnswer; photo: PhotoDetail }>> {
    return this.http.post<ApiResponse<{ intake: IntakeAnswer; photo: PhotoDetail }>>(`${BASE}/photos/${id}/sendToDocuments`, {});
  }

  addToReport(id: number): Observable<ApiResponse<PhotoDetail>> {
    return this.http.post<ApiResponse<PhotoDetail>>(`${BASE}/photos/${id}/addToReport`, {});
  }

  keep(id: number, bucketName: string, targetFolder: string): Observable<ApiResponse<{ bucket: string; key: string }>> {
    return this.http.post<ApiResponse<{ bucket: string; key: string }>>(`${BASE}/photos/${id}/keep`, { bucketName, targetFolder });
  }

  remove(id: number): Observable<ApiResponse> {
    return this.http.delete<ApiResponse>(`${BASE}/photos/${id}`);
  }
}
