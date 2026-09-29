import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../core/api/api.config';
import {
  CorrectionSent, DatasetPage, DocumentType, Extraction, OcrDocument, QueuePage, ReviewDetail, TypeDefinition, TypeStats, TypeVersion,
} from './documents.model';

const OCR = `${API_BASE}/documentOcr.json`;
const TYPES = `${API_BASE}/documentType.json`;
const EXTRACTION = `${API_BASE}/documentExtraction.json`;
const REVIEW = `${API_BASE}/documentReview.json`;

export interface QueueFilters {
  documentTypeId?: number | null;
  status?: string;
  maxConfidence?: number | null;
  olderThanMinutes?: number | null;
  claimed?: string;
  page: number;
  size: number;
}

export interface TypeSave {
  documentTypeId?: number | null;
  typeKey: string;
  name: string;
  description?: string | null;
  baseVersion?: number | null;
  definition: TypeDefinition;
}

/**
 * Document Intelligence's four prefixes, as the console calls them (MIG-272). OCR is media-service's (page key
 * document-intelligence); types and extraction are ai-service's on the same key; the review queue is ai-service's on
 * document-review. Every member may read, extract and review; saving a type is a workspace administrator's.
 *
 * A refusal comes back with its HTTP status (404, 409, 422, 429 ...) and the {status: ERROR, message} envelope, so a
 * caller reads the message from the error (documents.model's refusalText) as well as `status` on a 200.
 */
@Injectable({ providedIn: 'root' })
export class DocumentsApi {
  private readonly http = inject(HttpClient);

  // ------------------------------------------------------------------------------------------ OCR (media)

  reads(): Observable<ApiResponse<OcrDocument[]>> {
    return this.http.get<ApiResponse<OcrDocument[]>>(`${OCR}/fetchAll`);
  }

  read(ocrDocumentId: number): Observable<ApiResponse<OcrDocument>> {
    return this.http.get<ApiResponse<OcrDocument>>(`${OCR}/fetchById`, { params: { ocrDocumentId } });
  }

  /** Queues a read of a stored file; an unchanged file read before answers that read (unless forced). */
  requestRead(bucket: string, key: string, force = false): Observable<ApiResponse<OcrDocument>> {
    return this.http.post<ApiResponse<OcrDocument>>(`${OCR}/request`, { bucket, key, force });
  }

  /**
   * One page's upright image, the pixels its boxes are in. Fetched through HttpClient so the auth interceptor adds the
   * token -- an <img src> would carry none -- and shown from an object URL the caller revokes.
   */
  pageImage(ocrDocumentId: number, page: number): Observable<Blob> {
    return this.http.get(`${OCR}/pageImage`, { params: { ocrDocumentId, page }, responseType: 'blob' });
  }

  // ------------------------------------------------------------------------------------------ types

  types(): Observable<ApiResponse<DocumentType[]>> {
    return this.http.get<ApiResponse<DocumentType[]>>(`${TYPES}/fetchAll`);
  }

  type(documentTypeId: number): Observable<ApiResponse<DocumentType>> {
    return this.http.get<ApiResponse<DocumentType>>(`${TYPES}/fetchById`, { params: { documentTypeId } });
  }

  typeVersion(documentTypeId: number, version: number): Observable<ApiResponse<TypeVersion>> {
    return this.http.get<ApiResponse<TypeVersion>>(`${TYPES}/version`, { params: { documentTypeId, version } });
  }

  /** A new type (no id), or the next version of one; a type that moved on since `baseVersion` is 409. */
  saveType(body: TypeSave): Observable<ApiResponse<DocumentType>> {
    return this.http.post<ApiResponse<DocumentType>>(`${TYPES}/save`, body);
  }

  setTypeStatus(documentTypeId: number, status: 'Active' | 'Inactive'): Observable<ApiResponse<DocumentType>> {
    return this.http.put<ApiResponse<DocumentType>>(`${TYPES}/setStatus`, null, { params: { documentTypeId, status } });
  }

  // ------------------------------------------------------------------------------------------ extraction

  /** Queues one read to be extracted: as the type named, or classified first. */
  extract(ocrDocumentId: number, documentTypeId?: number | null): Observable<ApiResponse<Extraction>> {
    return this.http.post<ApiResponse<Extraction>>(`${EXTRACTION}/extract`,
      documentTypeId ? { ocrDocumentId, documentTypeId } : { ocrDocumentId });
  }

  extractions(ocrDocumentId?: number): Observable<ApiResponse<Extraction[]>> {
    const params: Record<string, number> = {};
    if (ocrDocumentId) params['ocrDocumentId'] = ocrDocumentId;
    return this.http.get<ApiResponse<Extraction[]>>(`${EXTRACTION}/fetchAll`, { params });
  }

  extraction(extractionId: number): Observable<ApiResponse<Extraction>> {
    return this.http.get<ApiResponse<Extraction>>(`${EXTRACTION}/fetchById`, { params: { extractionId } });
  }

  stats(days?: number): Observable<ApiResponse<TypeStats[]>> {
    const params: Record<string, number> = {};
    if (days) params['days'] = days;
    return this.http.get<ApiResponse<TypeStats[]>>(`${EXTRACTION}/stats`, { params });
  }

  /** The type's dataset: one row per approved document. Pages from 0. */
  dataset(documentTypeId: number, page: number, size: number): Observable<ApiResponse<DatasetPage>> {
    return this.http.get<ApiResponse<DatasetPage>>(`${EXTRACTION}/dataset`, { params: { documentTypeId, page, size } });
  }

  /** The same as a file; the response keeps its headers for the name the service gave it. */
  datasetExport(documentTypeId: number, format: 'csv' | 'jsonl'): Observable<HttpResponse<Blob>> {
    return this.http.get(`${EXTRACTION}/datasetExport`, { params: { documentTypeId, format }, responseType: 'blob', observe: 'response' });
  }

  // ------------------------------------------------------------------------------------------ review

  /** One page of the queue, oldest first. Pages from 0. */
  queue(f: QueueFilters): Observable<ApiResponse<QueuePage>> {
    const params: Record<string, string | number> = { page: f.page, size: f.size };
    if (f.documentTypeId) params['documentTypeId'] = f.documentTypeId;
    if (f.status) params['status'] = f.status;
    if (f.maxConfidence != null) params['maxConfidence'] = f.maxConfidence;
    if (f.olderThanMinutes != null) params['olderThanMinutes'] = f.olderThanMinutes;
    if (f.claimed) params['claimed'] = f.claimed;
    return this.http.get<ApiResponse<QueuePage>>(`${REVIEW}/queue`, { params });
  }

  review(extractionId: number): Observable<ApiResponse<ReviewDetail>> {
    return this.http.get<ApiResponse<ReviewDetail>>(`${REVIEW}/fetchById`, { params: { extractionId } });
  }

  claim(extractionId: number): Observable<ApiResponse<ReviewDetail>> {
    return this.http.post<ApiResponse<ReviewDetail>>(`${REVIEW}/claim`, null, { params: { extractionId } });
  }

  unclaim(extractionId: number): Observable<ApiResponse<ReviewDetail>> {
    return this.http.post<ApiResponse<ReviewDetail>>(`${REVIEW}/unclaim`, null, { params: { extractionId } });
  }

  /** Always at the revision the reviewer has open: a document changed since is 409. */
  correct(extractionId: number, revision: number, corrections: CorrectionSent[]): Observable<ApiResponse<ReviewDetail>> {
    return this.http.post<ApiResponse<ReviewDetail>>(`${REVIEW}/correct`, { extractionId, revision, corrections });
  }

  approve(extractionId: number, revision: number, acceptRuleFailures: boolean): Observable<ApiResponse<ReviewDetail>> {
    return this.http.post<ApiResponse<ReviewDetail>>(`${REVIEW}/approve`, { extractionId, revision, acceptRuleFailures });
  }

  reject(extractionId: number, reason: string): Observable<ApiResponse<ReviewDetail>> {
    return this.http.post<ApiResponse<ReviewDetail>>(`${REVIEW}/reject`, { extractionId, reason });
  }
}
