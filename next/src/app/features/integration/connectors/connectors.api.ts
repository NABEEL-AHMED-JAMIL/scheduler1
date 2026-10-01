import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import {
  Connection, ConnectionDetail, ConnectionSave, ConnectorCard, Dataset, Stream, StreamSave, SyncRun, TestResult,
} from './connectors.model';

const BASE = () => `${API_BASE}/connectorHub.json`;

/** Storage connections a sync can write to (storage-service, TENANT_ADMIN). */
export interface StorageTarget { storageConnectionId: number; alias: string; connectionName: string; provider: string; status: string; }

/** Connector Hub's API (integration-service, gated by page 'connector-hub' at the gateway). */
@Injectable({ providedIn: 'root' })
export class ConnectorsApi {
  private readonly http = inject(HttpClient);

  connectors(): Observable<ApiResponse<ConnectorCard[]>> {
    return this.http.get<ApiResponse<ConnectorCard[]>>(`${BASE()}/connectors`);
  }

  connections(): Observable<ApiResponse<Connection[]>> {
    return this.http.get<ApiResponse<Connection[]>>(`${BASE()}/connection/list`);
  }

  connection(connectionId: number): Observable<ApiResponse<ConnectionDetail>> {
    return this.http.get<ApiResponse<ConnectionDetail>>(`${BASE()}/connection/get`, { params: { connectionId } });
  }

  save(body: ConnectionSave): Observable<ApiResponse<Connection>> {
    return this.http.post<ApiResponse<Connection>>(`${BASE()}/connection/save`, body);
  }

  remove(connectionId: number): Observable<ApiResponse<Connection>> {
    return this.http.delete<ApiResponse<Connection>>(`${BASE()}/connection/delete`, { params: { connectionId } });
  }

  test(connectionId: number): Observable<ApiResponse<TestResult>> {
    return this.http.post<ApiResponse<TestResult>>(`${BASE()}/connection/test`, null, { params: { connectionId } });
  }

  discover(connectionId: number): Observable<ApiResponse<Dataset[]>> {
    return this.http.post<ApiResponse<Dataset[]>>(`${BASE()}/connection/discover`, null, { params: { connectionId } });
  }

  oauthStart(connectionId: number): Observable<ApiResponse<{ authorizeUrl: string }>> {
    return this.http.post<ApiResponse<{ authorizeUrl: string }>>(`${BASE()}/oauth/start`, null, { params: { connectionId } });
  }

  oauthComplete(body: { state: string | null; code: string | null; error: string | null }): Observable<ApiResponse<Connection>> {
    return this.http.post<ApiResponse<Connection>>(`${BASE()}/oauth/complete`, body);
  }

  oauthDisconnect(connectionId: number): Observable<ApiResponse<Connection>> {
    return this.http.post<ApiResponse<Connection>>(`${BASE()}/oauth/disconnect`, null, { params: { connectionId } });
  }

  saveStream(body: StreamSave): Observable<ApiResponse<Stream>> {
    return this.http.post<ApiResponse<Stream>>(`${BASE()}/stream/save`, body);
  }

  removeStream(streamId: number): Observable<ApiResponse<Stream>> {
    return this.http.delete<ApiResponse<Stream>>(`${BASE()}/stream/delete`, { params: { streamId } });
  }

  acceptSchema(streamId: number): Observable<ApiResponse<Stream>> {
    return this.http.post<ApiResponse<Stream>>(`${BASE()}/stream/acceptSchema`, null, { params: { streamId } });
  }

  asSource(streamId: number): Observable<ApiResponse<Stream>> {
    return this.http.post<ApiResponse<Stream>>(`${BASE()}/stream/asSource`, null, { params: { streamId } });
  }

  runNow(target: { connectionId?: number; streamId?: number }): Observable<ApiResponse<Stream[]>> {
    const params: Record<string, number> = {};
    if (target.connectionId != null) params['connectionId'] = target.connectionId;
    if (target.streamId != null) params['streamId'] = target.streamId;
    return this.http.post<ApiResponse<Stream[]>>(`${BASE()}/sync/run`, null, { params });
  }

  runs(connectionId: number, limit = 50): Observable<ApiResponse<SyncRun[]>> {
    return this.http.get<ApiResponse<SyncRun[]>>(`${BASE()}/sync/list`, { params: { connectionId, limit } });
  }

  /** The workspace's storage connections, for where a sync writes (an administrator's list). */
  storageTargets(): Observable<ApiResponse<StorageTarget[]>> {
    return this.http.get<ApiResponse<StorageTarget[]>>(`${API_BASE}/storageConnection.json/fetchAllConnections`);
  }
}
