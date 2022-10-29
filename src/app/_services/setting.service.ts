import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Observable } from 'rxjs';


@Injectable({
    providedIn: 'root'
})
export class SettingService {
    
    constructor(private http: HttpClient) { }

    public appSetting(): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/setting.json/appSetting`);
    }

    public addSourceTaskType(payload:any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/setting.json/addSourceTaskType`, payload);
    }

    public updateSourceTaskType(payload:any): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/setting.json/updateSourceTaskType`, payload);
    }

    public deleteSourceTaskType(payload:any): Observable<ApiResponse> {
        return this.http.delete<ApiResponse>(`${config.apiUrl}/setting.json/deleteSourceTaskType?sourceTaskTypeId=`+payload);
    }

    public addLookupData(payload:any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/setting.json/addLookupData`, payload);
    }

    public updateLookupData(payload:any): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/setting.json/updateLookupData`, payload);
    }

    public deleteLookupData(payload:any): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/setting.json/deleteLookupData`, payload);
    }

    public fetchSubLookupByParentId(parentLookUpId: any): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/setting.json/fetchSubLookupByParentId?parentLookUpId=`+parentLookUpId);
    }

    public fetchLogs(payload:any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/message.json/fetchLogs`, payload);
    }

    public failJobLogs(jobQId: any): Observable<ApiResponse> {
        return this.http.delete<ApiResponse>(`${config.apiUrl}/message.json/failJobLogs?jobQId=`+jobQId);
    }

}