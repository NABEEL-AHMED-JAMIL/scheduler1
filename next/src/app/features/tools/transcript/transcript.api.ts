import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import { IntakeAnswer } from '../../documents/documents.model';
import { ExportFormat, RecordingDetail, RecordingList, RecordingQuery, RecordingSummary, SpeakerChoice, TranscriptLimits } from './transcript.model';

const BASE = `${API_BASE}/audioTranscript.json`;

/** What a new transcript asks for besides the recording. */
export interface TranscribeOptions {
  name?: string;
  speakers: SpeakerChoice;
  keepRecording: boolean;
  maskExports: boolean;
  sendToDocuments: boolean;
}

/** One change to a finished transcript: its name, a speaker named, two merged, a segment's words corrected. */
export interface RecordingChange {
  name?: string;
  maskExports?: boolean;
  speakers?: { key: number; name: string }[];
  merge?: { from: number; into: number };
  segments?: { i: number; text: string }[];
}

/** media-service's Audio Transcript (the tools redesign's API): recordings kept, transcribed on the server. */
@Injectable({ providedIn: 'root' })
export class TranscriptApi {
  private readonly http = inject(HttpClient);

  limits(): Observable<ApiResponse<TranscriptLimits>> {
    return this.http.get<ApiResponse<TranscriptLimits>>(`${BASE}/limits`);
  }

  /** The list with each facet's counts (tools Option A): no `view`, so media-service answers with facets. */
  list(query: RecordingQuery): Observable<ApiResponse<RecordingList>> {
    const params: Record<string, string> = { days: String(query.days), page: String(query.page), size: String(query.size) };
    if (query.q.trim()) params['q'] = query.q.trim();
    for (const key of ['status', 'by', 'speakers', 'language'] as const) if (query[key].length) params[key] = query[key].join(',');
    return this.http.get<ApiResponse<RecordingList>>(`${BASE}/recordings`, { params });
  }

  upload(file: File, options: TranscribeOptions): Observable<HttpEvent<ApiResponse<RecordingDetail>>> {
    const form = new FormData();
    form.append('file', file, file.name);
    if (options.name?.trim()) form.append('name', options.name.trim());
    form.append('speakers', options.speakers);
    form.append('keepRecording', String(options.keepRecording));
    form.append('maskExports', String(options.maskExports));
    form.append('sendToDocuments', String(options.sendToDocuments));
    return this.http.post<ApiResponse<RecordingDetail>>(`${BASE}/recordings`, form, { reportProgress: true, observe: 'events' });
  }

  fromBucket(bucket: string, key: string, options: TranscribeOptions): Observable<ApiResponse<RecordingDetail>> {
    return this.http.post<ApiResponse<RecordingDetail>>(`${BASE}/recordings/fromBucket`, { bucket, key, ...options });
  }

  one(id: number): Observable<ApiResponse<RecordingDetail>> {
    return this.http.get<ApiResponse<RecordingDetail>>(`${BASE}/recordings/${id}`);
  }

  audio(id: number): Observable<Blob> {
    return this.http.get(`${BASE}/recordings/${id}/audio`, { responseType: 'blob' });
  }

  change(id: number, change: RecordingChange): Observable<ApiResponse<RecordingDetail>> {
    return this.http.put<ApiResponse<RecordingDetail>>(`${BASE}/recordings/${id}`, change);
  }

  stop(id: number): Observable<ApiResponse<RecordingDetail>> {
    return this.http.post<ApiResponse<RecordingDetail>>(`${BASE}/recordings/${id}/stop`, {});
  }

  /** Try again (a failure, a stop), or Transcribe again a finished one, with the speakers asked (kept as before when none). */
  retry(id: number, speakers?: SpeakerChoice): Observable<ApiResponse<RecordingDetail>> {
    return this.http.post<ApiResponse<RecordingDetail>>(`${BASE}/recordings/${id}/retry`, speakers ? { speakers } : {});
  }

  split(id: number): Observable<ApiResponse<{ parts: RecordingSummary[] }>> {
    return this.http.post<ApiResponse<{ parts: RecordingSummary[] }>>(`${BASE}/recordings/${id}/split`, {});
  }

  keep(id: number, bucketName: string, targetFolder: string, format: ExportFormat): Observable<ApiResponse<{ bucket: string; key: string }>> {
    return this.http.post<ApiResponse<{ bucket: string; key: string }>>(`${BASE}/recordings/${id}/keep`, { bucketName, targetFolder, format });
  }

  sendToDocuments(id: number): Observable<ApiResponse<{ intake: IntakeAnswer; recording: RecordingDetail }>> {
    return this.http.post<ApiResponse<{ intake: IntakeAnswer; recording: RecordingDetail }>>(`${BASE}/recordings/${id}/sendToDocuments`, {});
  }

  remove(id: number): Observable<ApiResponse> {
    return this.http.delete<ApiResponse>(`${BASE}/recordings/${id}`);
  }

  exportFile(id: number, format: ExportFormat, mask: boolean): Observable<Blob> {
    return this.http.get(`${BASE}/recordings/${id}/export`, { params: { format, mask: String(mask) }, responseType: 'blob' });
  }
}
