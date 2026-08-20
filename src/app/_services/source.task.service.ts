import { Injectable } from '@angular/core';
import { HttpClient, HttpParams  } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Observable } from 'rxjs';
import { QueryCriteria, SearchText  } from '@/_models/index';

@Injectable({
    providedIn: 'root'
})
export class SourceTaskService {

    public searchText: SearchText;

    constructor(private http: HttpClient) { }

    public addSourceTask(payload:any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTask.json/addSourceTask`, payload);
    }

    public updateSourceTask(payload:any): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/sourceTask.json/updateSourceTask`, payload);
    }

    public deleteSourceTask(payload:any): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/sourceTask.json/deleteSourceTask`, payload);
    }

    public listSourceTask(payload:QueryCriteria): Observable<ApiResponse> {
        if (payload.searchText) {
            this.searchText = payload.searchText;
        }
        let params = new HttpParams();
        if (payload.startDate) {
            params = params.append('startDate', payload.startDate);
        }
        if (payload.endDate) {
            params = params.append('endDate', payload.endDate);
        }
        if (payload.page) {
            params = params.append('page', payload.page);
        }
        if (payload.limit) {
            params = params.append('limit', payload.limit);
        }
        if (payload.columnName) {
            params = params.append('columnName', payload.columnName);
        }
        if (payload.order) {
            params = params.append('order', payload.order);
        }
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTask.json/listSourceTask`, this.searchText, { params: params });
    }

    public downloadListSourceTask(): Observable<any> {
        return this.http.get(`${config.apiUrl}/sourceTask.json/downloadListSourceTask`, {
            responseType: 'blob'
        });
    }

    public downloadSourceTaskTemplate(): Observable<any> {
        return this.http.get(`${config.apiUrl}/sourceTask.json/downloadSourceTaskTemplate`, {
            responseType: 'blob'
        });
    }

    public uploadSourceTask(fileToUpload: File, tenantId?: any): any {
        const formData = new FormData();
        formData.append("file", fileToUpload);
        if (tenantId) {
            formData.append("tenantId", tenantId);
        }
        return this.http.post(`${config.apiUrl}/sourceTask.json/uploadSourceTask`, formData);
    }

    public fetchSourceTaskWithSourceTaskId(payload:any): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/sourceTask.json/fetchSourceTaskWithSourceTaskId?sourceTaskId=`+payload);
    }

    public fetchAllLinkJobsWithSourceTaskId(sourceTaskId: any): Observable<ApiResponse> {
        let params = new HttpParams()
            .append('sourceTaskId', sourceTaskId)
            .append('page', '1')
            .append('limit', '500');
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTask.json/fetchAllLinkJobsWithSourceTaskId`, {}, { params: params });
    }

    public fetchAllLinkSourceTaskWithSourceTaskTypeId(sourceTaskTypeId: any): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(
            `${config.apiUrl}/sourceTask.json/fetchAllLinkSourceTaskWithSourceTaskTypeId?sourceTaskTypeId=${sourceTaskTypeId}`);
    }

}