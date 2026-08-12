import { Injectable } from '@angular/core';
import { HttpClient, HttpParams  } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Observable } from 'rxjs';
import { QueryCriteria, SearchText  } from '@/_models/index';


/**
 * @author Nabeel Ahmed
 */
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

    public uploadSourceTask(fileToUpload: File): any {
        const formData = new FormData();
        formData.append("file", fileToUpload);
        return this.http.post(`${config.apiUrl}/sourceTask.json/uploadSourceTask`, formData);
    }

    public fetchSourceTaskWithSourceTaskId(payload:any): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/sourceTask.json/fetchSourceTaskWithSourceTaskId?sourceTaskId=`+payload);
    }

    /**
     * Method use to fetch the jobs linked to a source task -- used by the Task List row's
     * expand panel (mirrors Job List's expand panel fetching that job's queue/run history).
     * A generous limit is used since this is a detail panel, not its own paged list.
     * @param sourceTaskId
     * @return Observable<ApiResponse>
     * */
    public fetchAllLinkJobsWithSourceTaskId(sourceTaskId: any): Observable<ApiResponse> {
        let params = new HttpParams()
            .append('sourceTaskId', sourceTaskId)
            .append('page', '1')
            .append('limit', '500');
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTask.json/fetchAllLinkJobsWithSourceTaskId`, {}, { params: params });
    }

    /**
     * Method use to fetch every source task built on a given source task type -- powers the
     * Source Task Type page's "Link Source Task" count/picker (Settings), so a user can browse
     * and pick a target task from that type's tasks, grouped by the task's Group.
     * @param sourceTaskTypeId
     * @return Observable<ApiResponse>
     * */
    public fetchAllLinkSourceTaskWithSourceTaskTypeId(sourceTaskTypeId: any): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(
            `${config.apiUrl}/sourceTask.json/fetchAllLinkSourceTaskWithSourceTaskTypeId?sourceTaskTypeId=${sourceTaskTypeId}`);
    }

}