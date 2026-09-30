import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';

/**
 * MIG-196: the two 99.99% objectives, as their owners compute them from stored rows (etl-platform docs/SLO.md).
 * Every call is PLATFORM_ADMIN on the server.
 *
 * - Pipeline execution (process, /reliability.json/pipelineRuns): one run is one job_queue row, counted once by the
 *   status its last attempt ended in. Good: Completed. Bad: a worker's Failed, a decline, a dispatch out of retries,
 *   the stall sweep's Interrupt. Excluded: skips, missed slots, refusals, AI step failures, a person's closes.
 * - Billing (billing-service, /billing.json/reliability): one operation is one accepted usage event. Good: priced by
 *   its day's rollup. Bad: unrolled past a five-minute grace, or unpriced (no rate on the card).
 */

/** What both reports share. `numerator / denominator` is the rate; the budget is (1 - target) of the denominator. */
export interface SloWindow {
  sli: string;
  from: string;
  to: string;
  target: number;
  good: number;
  bad: number;
  numerator: number;
  denominator: number;
  successRate: number | null;
  budgetSpent: number | null;
  errorBudgetRemaining: number | null;
}

export interface RunGroup { outcome: string; reason: string; slo: 'good' | 'bad' | 'excluded'; runs: number; }
export interface RunDay { day: string; good: number; bad: number; excluded: number; successRate: number | null; }

export interface PipelineRunsSlo extends SloWindow {
  excluded: number;
  errorBudgetRuns: number;
  groups: RunGroup[];
  daily: RunDay[];
}

export interface MeterRow { meter: string; accepted: number; priced: number; unpriced: number; unrolled: number; pending: number; }
export interface BillingDay {
  day: string; good: number; bad: number; unpriced: number; unrolled: number; pending: number; successRate: number | null;
}

export interface BillingSlo extends SloWindow {
  asOf: string;
  unpriced: number;
  unrolled: number;
  pending: number;
  errorBudgetEvents: number;
  meters: MeterRow[];
  daily: BillingDay[];
}

export interface BurnWindow { window: string; good: number; bad: number; burnRate: number | null; }

export interface BurnRate {
  sli: string;
  rule: string;
  severity: 'page' | 'ticket';
  threshold: number;
  asOf: string;
  long: BurnWindow | null;
  short: BurnWindow | null;
  firing: boolean;
  unmeasured: string | null;
}

@Injectable({ providedIn: 'root' })
export class ReliabilityApi {
  private readonly http = inject(HttpClient);

  private static window(from: string, to: string): HttpParams {
    return new HttpParams().set('from', from).set('to', to);
  }

  pipelineRuns(from: string, to: string): Observable<ApiResponse<PipelineRunsSlo>> {
    return this.http.get<ApiResponse<PipelineRunsSlo>>(`${API_BASE}/reliability.json/pipelineRuns`,
      { params: ReliabilityApi.window(from, to) });
  }

  billing(from: string, to: string): Observable<ApiResponse<BillingSlo>> {
    return this.http.get<ApiResponse<BillingSlo>>(`${API_BASE}/billing.json/reliability`, { params: ReliabilityApi.window(from, to) });
  }

  burnRates(): Observable<ApiResponse<BurnRate[]>> {
    return this.http.get<ApiResponse<BurnRate[]>>(`${API_BASE}/reliability.json/burnRates`);
  }
}
