import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../core/api/api.config';
import { AssetDetail, CatalogAsset, CatalogSummary, Grant, LineageGraph } from './catalog.model';

const BASE = () => `${API_BASE}/analyticsCatalog.json`;

/** The Data Catalog's API (analytics-service, gated by page 'data-catalog' at the gateway). */
@Injectable({ providedIn: 'root' })
export class CatalogApi {
  private readonly http = inject(HttpClient);

  list(filter: { q?: string; kind?: string; flag?: string; withDeleted?: boolean }): Observable<ApiResponse<CatalogAsset[]>> {
    let params = new HttpParams();
    if (filter.q) params = params.set('q', filter.q);
    if (filter.kind) params = params.set('kind', filter.kind);
    if (filter.flag) params = params.set('flag', filter.flag);
    if (filter.withDeleted) params = params.set('withDeleted', 'true');
    return this.http.get<ApiResponse<CatalogAsset[]>>(`${BASE()}/list`, { params });
  }

  summary(): Observable<ApiResponse<CatalogSummary>> {
    return this.http.get<ApiResponse<CatalogSummary>>(`${BASE()}/summary`);
  }

  asset(assetId: number): Observable<ApiResponse<AssetDetail>> {
    return this.http.get<ApiResponse<AssetDetail>>(`${BASE()}/asset`, { params: { assetId } });
  }

  describe(assetId: number, ownerUserId: number | null, description: string | null): Observable<ApiResponse<AssetDetail>> {
    return this.http.post<ApiResponse<AssetDetail>>(`${BASE()}/describe`, { assetId, ownerUserId, description });
  }

  profile(assetId: number): Observable<ApiResponse<AssetDetail>> {
    return this.http.post<ApiResponse<AssetDetail>>(`${BASE()}/profile`, null, { params: { assetId } });
  }

  scan(assetId: number): Observable<ApiResponse<AssetDetail>> {
    return this.http.post<ApiResponse<AssetDetail>>(`${BASE()}/scan`, null, { params: { assetId } });
  }

  tag(assetId: number, column: string, tags: string[]): Observable<ApiResponse<AssetDetail>> {
    return this.http.post<ApiResponse<AssetDetail>>(`${BASE()}/tag`, { assetId, column, tags });
  }

  classify(assetId: number, sensitivity: string | null): Observable<ApiResponse<AssetDetail>> {
    return this.http.post<ApiResponse<AssetDetail>>(`${BASE()}/classify`, { assetId, sensitivity });
  }

  lineage(assetId: number, depth = 4): Observable<ApiResponse<LineageGraph>> {
    return this.http.get<ApiResponse<LineageGraph>>(`${BASE()}/lineage`, { params: { assetId, depth } });
  }

  requestAccess(assetId: number, reason: string, days: number): Observable<ApiResponse<Grant>> {
    return this.http.post<ApiResponse<Grant>>(`${BASE()}/requestAccess`, { assetId, reason, days });
  }

  accessRequests(): Observable<ApiResponse<Grant[]>> {
    return this.http.get<ApiResponse<Grant[]>>(`${BASE()}/accessRequests`);
  }

  revokeAccess(grantId: number): Observable<ApiResponse<Grant>> {
    return this.http.post<ApiResponse<Grant>>(`${BASE()}/revokeAccess`, null, { params: { grantId } });
  }
}
