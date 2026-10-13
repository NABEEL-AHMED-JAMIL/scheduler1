import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import {
  ClassDays, RetentionAuditLine, RetentionConfirmation, RetentionHold, RetentionPass, RetentionPlatform, RetentionPreview, RetentionView,
} from './retention.model';

/**
 * Core's data retention (MIG-354), under setting.json: a workspace administrator's (a platform administrator names the
 * workspace with `tenantId`). Every refusal is a 4xx with its sentence in the envelope.
 */
@Injectable({ providedIn: 'root' })
export class RetentionApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/setting.json/retention`;

  private static params(tenantId?: number | null): Record<string, number> {
    return tenantId == null ? {} : { tenantId };
  }

  private static body<T extends object>(tenantId: number | null | undefined, body: T): T & { tenantId?: number } {
    return tenantId == null ? body : { ...body, tenantId };
  }

  view(tenantId?: number | null): Observable<ApiResponse<RetentionView>> {
    return this.http.get<ApiResponse<RetentionView>>(this.base, { params: RetentionApi.params(tenantId) });
  }

  save(tenantId: number | null | undefined, enabled: boolean, classes: ClassDays): Observable<ApiResponse<RetentionView>> {
    return this.http.post<ApiResponse<RetentionView>>(this.base, RetentionApi.body(tenantId, { enabled, classes }));
  }

  /** What a pass would remove now; with `classes`, as if those days were saved (nothing is written). */
  preview(tenantId?: number | null, classes?: ClassDays): Observable<ApiResponse<RetentionPreview>> {
    return this.http.post<ApiResponse<RetentionPreview>>(`${this.base}/preview`, RetentionApi.body(tenantId, classes ? { classes } : {}));
  }

  confirm(tenantId: number | null | undefined, dataClass: string, expectedCount: number): Observable<ApiResponse<RetentionConfirmation>> {
    return this.http.post<ApiResponse<RetentionConfirmation>>(`${this.base}/confirm`, RetentionApi.body(tenantId, { dataClass, expectedCount }));
  }

  run(tenantId?: number | null): Observable<ApiResponse<{ passId: number; state: string }>> {
    return this.http.post<ApiResponse<{ passId: number; state: string }>>(`${this.base}/run`, RetentionApi.body(tenantId, {}));
  }

  placeHold(tenantId: number | null | undefined, hold: { scope: string; jobId?: number | null; runId?: number | null; reason: string }):
    Observable<ApiResponse<RetentionHold>> {
    return this.http.post<ApiResponse<RetentionHold>>(`${this.base}/holds`, RetentionApi.body(tenantId, hold));
  }

  releaseHold(tenantId: number | null | undefined, id: number, reason: string): Observable<ApiResponse<RetentionHold>> {
    return this.http.post<ApiResponse<RetentionHold>>(`${this.base}/holds/release`, RetentionApi.body(tenantId, { id, reason }));
  }

  passes(tenantId?: number | null, limit = 20): Observable<ApiResponse<RetentionPass[]>> {
    return this.http.get<ApiResponse<RetentionPass[]>>(`${this.base}/passes`, { params: { ...RetentionApi.params(tenantId), limit } });
  }

  audit(tenantId?: number | null, limit = 100): Observable<ApiResponse<RetentionAuditLine[]>> {
    return this.http.get<ApiResponse<RetentionAuditLine[]>>(`${this.base}/audit`, { params: { ...RetentionApi.params(tenantId), limit } });
  }

  platform(): Observable<ApiResponse<RetentionPlatform>> {
    return this.http.get<ApiResponse<RetentionPlatform>>(`${this.base}/platform`);
  }

  savePlatform(body: { auditFloorDays: number; maxSharePct: number }): Observable<ApiResponse<RetentionPlatform>> {
    return this.http.post<ApiResponse<RetentionPlatform>>(`${this.base}/platform`, body);
  }

  /** The workspace's pipelines, for a pipeline hold (the Schedules page's own list). */
  pipelines(): Observable<ApiResponse<{ jobId: number; jobName: string }[]>> {
    return this.http.get<ApiResponse<{ jobId: number; jobName: string }[]>>(`${API_BASE}/sourceJob.json/listSourceJob`);
  }
}
