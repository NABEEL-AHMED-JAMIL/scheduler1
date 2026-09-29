import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import { ModelConnection } from '../../ai/ai-providers';
import { DataPolicy, SavedLevel } from './data-policy.model';

/**
 * ai-service's data policy (MIG-243), under the prompts' prefix: the gateway gates it on the ai-prompts page. Reading is
 * a member's; saving is a workspace administrator's. `tenantId` is a platform administrator's only.
 */
@Injectable({ providedIn: 'root' })
export class DataPolicyApi {
  private readonly http = inject(HttpClient);

  get(tenantId?: number | null): Observable<ApiResponse<DataPolicy>> {
    const params: Record<string, number> = tenantId == null ? {} : { tenantId };
    return this.http.get<ApiResponse<DataPolicy>>(`${API_BASE}/aiPrompt.json/dataPolicy`, { params });
  }

  save(body: { tenantId?: number; levels: SavedLevel[] }): Observable<ApiResponse<DataPolicy>> {
    return this.http.post<ApiResponse<DataPolicy>>(`${API_BASE}/aiPrompt.json/dataPolicy`, body);
  }

  /** The workspace's model connections -- a workspace administrator's read (every aiConnection.json call is). */
  connections(): Observable<ApiResponse<ModelConnection[]>> {
    return this.http.get<ApiResponse<ModelConnection[]>>(`${API_BASE}/aiConnection.json/list`);
  }

  tenants(): Observable<ApiResponse<{ tenantId: number; tenantName: string }[]>> {
    return this.http.get<ApiResponse<{ tenantId: number; tenantName: string }[]>>(`${API_BASE}/tenant.json/listTenants`);
  }
}
