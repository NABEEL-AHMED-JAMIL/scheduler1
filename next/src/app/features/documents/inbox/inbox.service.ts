import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import { BucketSummary } from '../../objects/storage.service';
import { InboxFile, InboxSettings } from './inbox.model';

/** What an upload answers with: the arrival, as the list later shows it. */
export type InboxArrival = InboxFile;

/**
 * storage-service's workspace inbox (MIG-239). Reading and uploading are every member's; configure and turn off are
 * a workspace administrator's. A refusal answers 400 with the reason in `message`, which the page shows as it is.
 */
@Injectable({ providedIn: 'root' })
export class InboxApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/storage.json`;

  settings(): Observable<ApiResponse<InboxSettings>> {
    return this.http.get<ApiResponse<InboxSettings>>(`${this.base}/inbox`);
  }

  /** Newest first; the service takes at most 200. */
  files(limit = 50): Observable<ApiResponse<InboxFile[]>> {
    return this.http.get<ApiResponse<InboxFile[]>>(`${this.base}/inbox/files`, { params: { limit: String(limit) } });
  }

  /** One file; the events carry the upload's progress, then the answer. */
  upload(file: File): Observable<HttpEvent<ApiResponse<InboxArrival>>> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ApiResponse<InboxArrival>>(`${this.base}/inbox/upload`, form, { reportProgress: true, observe: 'events' });
  }

  /** Names one of the workspace's own connections as the inbox; no maxBytes means the platform's limit. */
  configure(alias: string, maxBytes: number | null): Observable<ApiResponse<InboxSettings>> {
    const body: { alias: string; maxBytes?: number } = { alias };
    if (maxBytes) body.maxBytes = maxBytes;
    return this.http.post<ApiResponse<InboxSettings>>(`${this.base}/inbox/configure`, body);
  }

  /** Stops the inbox taking files. The files already in the bucket stay. */
  turnOff(): Observable<ApiResponse<unknown>> {
    return this.http.delete<ApiResponse<unknown>>(`${this.base}/inbox`);
  }

  /** The workspace's storage connections, for the administrator's choice. */
  buckets(): Observable<ApiResponse<BucketSummary[]>> {
    return this.http.get<ApiResponse<BucketSummary[]>>(`${this.base}/buckets`);
  }

  /** The workspace's members, for "uploaded by" -- an administrator's read; a member is refused it. */
  users(): Observable<ApiResponse<{ appUserId: number; fullName?: string; username?: string }[]>> {
    return this.http.get<ApiResponse<{ appUserId: number; fullName?: string; username?: string }[]>>(`${API_BASE}/appUser.json/listUsers`);
  }

  /** The names a member may read (MIG-321): the colleagues the task inbox offers; without that page, numbers stay. */
  colleagues(): Observable<ApiResponse<{ userId: number; fullName?: string; username?: string }[]>> {
    return this.http.get<ApiResponse<{ userId: number; fullName?: string; username?: string }[]>>(`${API_BASE}/taskInbox.json/colleagues`);
  }
}
