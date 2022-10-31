import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Observable } from 'rxjs';


@Injectable({
    providedIn: 'root'
})
export class HomeService {
    
    constructor(private http: HttpClient) { }

    public jobStatusStatistics(): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/dashboard.json/jobStatusStatistics`);
    }

    public jobRunningStatistics(): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/dashboard.json/jobRunningStatistics`);
    }

    public weeklyRunningJobStatistics(startDate:any, endDate:any): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/dashboard.json/weeklyRunningJobStatistics?startDate=${startDate}&endDate=${endDate}`);
    }

    public weeklyHrsRunningJobStatistics(startDate:any, endDate:any): Observable<ApiResponse> {        
        return this.http.get<ApiResponse>(`${config.apiUrl}/dashboard.json/weeklyHrsRunningJobStatistics?startDate=${startDate}&endDate=${endDate}`);
    }

    public weeklyHrRunningStatisticsDimension(targetDate:any, targetHr: any): Observable<ApiResponse> {        
        return this.http.get<ApiResponse>(`${config.apiUrl}/dashboard.json/weeklyHrRunningStatisticsDimension?targetDate=${targetDate}&targetHr=${targetHr}`);
    }

    public viewRunningJobDateByTargetClickJobStatistics(targetDate:any, targetHr: any): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/dashboard.json/viewRunningJobDateByTargetClickJobStatistics?targetDate=${targetDate}&targetHr=${targetHr}`);
    }

    public weeklyHrRunningStatisticsDimensionDetail(targetDate:any, targetHr: any, jobStatus: any, jobId:any): Observable<ApiResponse> {
        let params = '';
        if (targetDate) {
            params += `targetDate=${targetDate}&`;
        }
        if (targetHr) {
            params += `targetHr=${targetHr}&`;
        }
        if (jobStatus && jobStatus != 'Total') {
            params += `jobStatus=${jobStatus}&`;
        }
        if (jobId) {
            params += `jobId=${jobId}`;
        }
        return this.http.get<ApiResponse>(`${config.apiUrl}/dashboard.json/weeklyHrRunningStatisticsDimensionDetail?`+params);
    }

}