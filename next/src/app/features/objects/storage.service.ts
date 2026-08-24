import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../core/api/api.config';

export interface BucketSummary {
  label: string;
  bucket: string;
  provider: string;
}

export interface ObjectSummary {
  name: string;
  key: string;
  folder: boolean;
  size?: number;
  lastModified?: string;
  contentType?: string;
  etag?: string;
}

export interface BrowseResponse {
  objects: ObjectSummary[];
  nextContinuationToken?: string;
}

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/storage.json`;

  buckets(): Observable<ApiResponse<BucketSummary[]>> {
    return this.http.get<ApiResponse<BucketSummary[]>>(`${this.base}/buckets`);
  }

  listObjects(bucket: string, prefix = '', continuationToken?: string, maxKeys = 100)
      : Observable<ApiResponse<BrowseResponse>> {
    const params: Record<string, string> = { bucket, prefix, maxKeys: String(maxKeys) };
    if (continuationToken) params['continuationToken'] = continuationToken;
    return this.http.get<ApiResponse<BrowseResponse>>(`${this.base}/listObjects`, { params });
  }

  objectMetadata(bucket: string, key: string): Observable<ApiResponse<ObjectSummary>> {
    return this.http.get<ApiResponse<ObjectSummary>>(`${this.base}/objectMetadata`, {
      params: { bucket, key },
    });
  }

  /** Text-ish preview; the server decompresses .gz and types it by what's inside. */
  previewText(bucket: string, key: string): Observable<string> {
    return this.http.get(`${this.base}/previewObject`, {
      params: { bucket, key }, responseType: 'text',
    });
  }

  previewBlob(bucket: string, key: string): Observable<Blob> {
    return this.http.get(`${this.base}/previewObject`, {
      params: { bucket, key }, responseType: 'blob',
    });
  }

  /**
   * Saves an object to disk.
   *
   * This used to be a downloadUrl() handed to window.open, which is a plain navigation and
   * carries no Authorization header -- every download came back 401 and opened a blank tab
   * with a JSON error in it. The bytes are fetched through HttpClient instead, where the
   * interceptor attaches the token, and handed to the browser as a blob so the save dialog
   * still shows the real filename.
   */
  download(bucket: string, key: string): Observable<Blob> {
    return this.http.get(`${this.base}/downloadObject`, {
      params: { bucket, key }, responseType: 'blob',
    });
  }

  /** The last path segment, which is what the file should be called on disk. */
  static fileNameOf(key: string): string {
    const cut = key.lastIndexOf('/');
    return cut >= 0 ? key.slice(cut + 1) : key;
  }

  /** Turns a fetched blob into a save, then releases the URL it had to create to do it. */
  static saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  /** Inline URL for an <img>; previewObject streams the bytes where downloadObject
      attaches them. */
  previewUrl(bucket: string, key: string): string {
    return `${this.base}/previewObject?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`;
  }

  upload(bucket: string, prefix: string, file: File): Observable<ApiResponse> {
    const form = new FormData();
    form.append('bucket', bucket);
    form.append('prefix', prefix);
    form.append('file', file, file.name);
    return this.http.post<ApiResponse>(`${this.base}/uploadObject`, form);
  }

  createFolder(bucket: string, prefix: string, folderName: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.base}/createFolder`, null, {
      params: { bucket, prefix, folderName },
    });
  }

  deleteObject(bucket: string, key: string): Observable<ApiResponse> {
    return this.http.delete<ApiResponse>(`${this.base}/deleteObject`, { params: { bucket, key } });
  }

  deleteObjects(bucket: string, keys: string[]): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.base}/deleteObjects`, { bucket, keys });
  }

  deleteFolder(bucket: string, key: string): Observable<ApiResponse> {
    return this.http.delete<ApiResponse>(`${this.base}/deleteFolder`, { params: { bucket, key } });
  }

  renameFolder(bucket: string, key: string, newFolderName: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.base}/renameFolder`, null, {
      params: { bucket, key, newFolderName },
    });
  }
}
