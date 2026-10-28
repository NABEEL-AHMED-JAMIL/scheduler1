import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../core/api/api.config';

export interface BucketSummary {
  label: string;
  bucket: string;
  provider: string;
  // What the connection card shows (storage-service, 2026-09-28); older servers leave them out.
  bucketName?: string;
  region?: string;
  description?: string;
  /** How the last connection test went: SUCCESS, FAILED or UNTESTED. */
  connectionStatus?: string;
  /** Server wall-clock, like every timestamp this API sends. */
  dateCreated?: string;
  createdByName?: string;
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

export interface TablePreview {
  source: 'csv' | 'tsv' | 'xlsx' | 'parquet' | 'jsonl' | 'json';
  columns: string[];
  rows: string[][];
  offset: number;
  limit: number;
  /** -1 when the count was capped. */
  totalRows: number;
  sheets: string[];
  sheet?: string;
  note?: string;
}

export interface ArchiveEntry {
  name: string;
  directory: boolean;
  size: number;
  compressedSize: number;
  lastModified: number;
}

export interface BrowseResponse {
  objects: ObjectSummary[];
  nextContinuationToken?: string;
  /**
   * Owner 2026-10-27 ("add a sort on each table"): a sorted listing pages by offset -- the next page's offset (absent
   * on the last page) and how many entries the folder level holds.
   */
  nextOffset?: number;
  total?: number;
  /** Why the folder could not be sorted (over 10,000 entries): the rows are then in the store's own order. */
  sortBlocked?: string;
}

/** A sorted listing's request: an allow-listed column (name, size, modified), its direction, and where the page starts. */
export interface BrowseSort {
  sort: string;
  dir: 'asc' | 'desc';
  offset?: number;
}

/** storage.json/findObjects (owner #27): matches newest first, how many objects were looked at, and whether it stopped early. */
export interface FindResponse {
  objects: ObjectSummary[];
  scanned: number;
  truncated: boolean;
}

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/storage.json`;

  buckets(): Observable<ApiResponse<BucketSummary[]>> {
    return this.http.get<ApiResponse<BucketSummary[]>>(`${this.base}/buckets`);
  }

  /**
   * Owner #27: every file under a prefix, however deep, whose name holds `query`, of the given extensions -- the file
   * picker's search. At most 200, from at most 5,000 looked at; `truncated` says it stopped.
   */
  findObjects(bucket: string, prefix: string, query: string, extensions: string[] = [], limit = 200)
      : Observable<ApiResponse<FindResponse>> {
    const params: Record<string, string | string[]> = { bucket, prefix, query, limit: String(limit) };
    if (extensions.length) params['extensions'] = extensions;
    return this.http.get<ApiResponse<FindResponse>>(`${this.base}/findObjects`, { params });
  }

  /**
   * One page of a folder level. Without `order` it is the store's own order paged by its continuation token; with one
   * (owner 2026-10-27) the server sorts the whole level and pages it by offset, so no token goes with it.
   */
  listObjects(bucket: string, prefix = '', continuationToken?: string, maxKeys = 100, order?: BrowseSort)
      : Observable<ApiResponse<BrowseResponse>> {
    const params: Record<string, string> = { bucket, prefix, maxKeys: String(maxKeys) };
    if (order) {
      params['sort'] = order.sort;
      params['dir'] = order.dir;
      params['offset'] = String(order.offset ?? 0);
    } else if (continuationToken) {
      params['continuationToken'] = continuationToken;
    }
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

  /** The first bytes only -- enough to tell text from binary without pulling the whole object. */
  previewHead(bucket: string, key: string, bytes = 4096): Observable<Blob> {
    return this.http.get(`${this.base}/previewObject`, {
      params: { bucket, key }, responseType: 'blob', headers: { Range: `bytes=0-${bytes - 1}` },
    });
  }

  /** A page of a tabular object: CSV/TSV, a sheet, parquet, JSON lines, a JSON array. */
  previewTable(bucket: string, key: string, offset = 0, limit = 100, sheet?: string): Observable<ApiResponse<TablePreview>> {
    const params: Record<string, string> = { bucket, key, offset: String(offset), limit: String(limit) };
    if (sheet) params['sheet'] = sheet;
    return this.http.get<ApiResponse<TablePreview>>(`${this.base}/previewTable`, { params });
  }

  /** A document rendered to PDF by the server, for the PDF viewer. */
  previewDocument(bucket: string, key: string): Observable<Blob> {
    return this.http.get(`${this.base}/previewDocument`, { params: { bucket, key }, responseType: 'blob' });
  }

  previewArchive(bucket: string, key: string): Observable<ApiResponse<ArchiveEntry[]>> {
    return this.http.get<ApiResponse<ArchiveEntry[]>>(`${this.base}/previewArchive`, { params: { bucket, key } });
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

  /** Emails one file, or several as a ZIP, to one address. */
  share(bucket: string, keys: string[], recipientEmail: string, message: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${API_BASE}/fileShare.json/send`, { bucket, keys, recipientEmail, message });
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
