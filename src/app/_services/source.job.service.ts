import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Observable } from 'rxjs';


@Injectable({
    providedIn: 'root'
})
export class SourceJobService {
    
    constructor(private http: HttpClient) { }

    public fetchSourceJobDetailWithSourceJobId(payload:any): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/sourceJob.json/fetchSourceJobDetailWithSourceJobId?jobId=`+payload);
    }

    public listSourceJob(): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceJob.json/listSourceJob`, null);
    }

    public addSourceJob(payload:any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceJob.json/addSourceJob`, payload);
    }

    public updateSourceJob(payload:any): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/sourceJob.json/updateSourceJob`, payload);
    }

    public deleteSourceJob(payload:any): Observable<ApiResponse> {
        let deletePayload = {
            jobId: payload.jobId
        }
        return this.http.put<ApiResponse>(`${config.apiUrl}/sourceJob.json/deleteSourceJob`, deletePayload);
    }

    public runSourceJob(payload:any): Observable<ApiResponse> {
        let modifyPayload = {
            jobId: payload?.jobId
        };
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceJob.json/runSourceJob`, modifyPayload);
    }

    public skipNextSourceJob(payload:any): Observable<ApiResponse> {
        let modifyPayload = {
            jobId: payload?.jobId
        };
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceJob.json/skipNextSourceJob`, modifyPayload);
    }

    public fetchRunningJobEvent(payload:any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceJob.json/fetchRunningJobEvent`, payload);
    }

    public findSourceJobAuditLog(jobQueueId:any, jobId:any): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/sourceJob.json/findSourceJobAuditLog?jobQueueId=`+jobQueueId+`&jobId=`+jobId);
    }

    public downloadSourceJobTemplateFile(): Observable<any> {
        return this.http.get(`${config.apiUrl}/sourceJob.json/downloadSourceJobTemplateFile`,
        {
            responseType: 'blob'
        });
    }
    
    public downloadListSourceJob(): Observable<any> {
        return this.http.get(`${config.apiUrl}/sourceJob.json/downloadListSourceJob`,
        {
            responseType: 'blob'
        });
    }

    public uploadSourceJob(fileToUpload: File): any {
        const formData = new FormData();
        formData.append("file", fileToUpload);
        return this.http.post(`${config.apiUrl}/sourceJob.json/uploadSourceJob`, formData);
    }

}