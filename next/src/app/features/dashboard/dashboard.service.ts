import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../core/api/api.config';

export interface NameValue { name: string; value: number; }
export interface HourCell { dayCode: string; hr: number; date: string; count: number; }

export interface JobBreakdown {
  jobId: number;
  jobName: string;
  queue: number; start: number; running: number; failed: number;
  completed: number; skip: number; interrupt: number; missed: number;
  stop?: number; total: number;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/dashboard.json`;

  jobStatus(startDate: string, endDate: string): Observable<ApiResponse<NameValue[]>> {
    return this.http.get<ApiResponse<NameValue[]>>(`${this.base}/jobStatusStatistics`,
      { params: { startDate, endDate } });
  }

  jobRunning(startDate: string, endDate: string): Observable<ApiResponse<NameValue[]>> {
    return this.http.get<ApiResponse<NameValue[]>>(`${this.base}/jobRunningStatistics`,
      { params: { startDate, endDate } });
  }

  weekly(startDate: string, endDate: string): Observable<ApiResponse<NameValue[]>> {
    return this.http.get<ApiResponse<NameValue[]>>(`${this.base}/weeklyRunningJobStatistics`,
      { params: { startDate, endDate } });
  }

  hourly(startDate: string, endDate: string): Observable<ApiResponse<HourCell[]>> {
    return this.http.get<ApiResponse<HourCell[]>>(`${this.base}/weeklyHrsRunningJobStatistics`,
      { params: { startDate, endDate } });
  }

  breakdown(targetDate: string, targetHr: number): Observable<ApiResponse<JobBreakdown[]>> {
    return this.http.get<ApiResponse<JobBreakdown[]>>(`${this.base}/weeklyHrRunningStatisticsDimension`,
      { params: { targetDate, targetHr: String(targetHr) } });
  }

  breakdownDetail(targetDate: string, targetHr: number, jobId: number, jobStatus: string)
      : Observable<ApiResponse<any[]>> {
    return this.http.get<ApiResponse<any[]>>(`${this.base}/weeklyHrRunningStatisticsDimensionDetail`,
      { params: { targetDate, targetHr: String(targetHr), jobId: String(jobId), jobStatus } });
  }
}
