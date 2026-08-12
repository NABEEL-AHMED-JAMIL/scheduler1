import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import {
    DatabaseConnectionProfile,
    QueryDefinition,
    QueryExecutionRequest,
    QuerySchedule
} from '@/_models/query-engine.model';
import { Observable } from 'rxjs';

/**
 * @author Nabeel Ahmed
 */
@Injectable({
    providedIn: 'root'
})
export class QueryEngineService {

    constructor(private http: HttpClient) { }

    // ---------------------------------------------------------------- connections

    public addConnectionProfile(payload: DatabaseConnectionProfile): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/queryEngine.json/connections/add`, payload);
    }

    public updateConnectionProfile(payload: DatabaseConnectionProfile): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/queryEngine.json/connections/update`, payload);
    }

    public deleteConnectionProfile(databaseConnectionProfileId: any): Observable<ApiResponse> {
        return this.http.delete<ApiResponse>(
            `${config.apiUrl}/queryEngine.json/connections/delete?databaseConnectionProfileId=${databaseConnectionProfileId}`);
    }

    public fetchAllConnectionProfiles(): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/queryEngine.json/connections/fetchAll`);
    }

    public testConnection(payload: DatabaseConnectionProfile): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/queryEngine.json/connections/testConnection`, payload);
    }

    // ---------------------------------------------------------------- queries

    public addQuery(payload: QueryDefinition): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/queryEngine.json/queries/add`, payload);
    }

    public updateQuery(payload: QueryDefinition): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/queryEngine.json/queries/update`, payload);
    }

    public deleteQuery(queryId: any): Observable<ApiResponse> {
        return this.http.delete<ApiResponse>(`${config.apiUrl}/queryEngine.json/queries/delete?queryId=${queryId}`);
    }

    public fetchAllQueries(): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/queryEngine.json/queries/fetchAll`);
    }

    public fetchQueryById(queryId: any): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/queryEngine.json/queries/fetchById?queryId=${queryId}`);
    }

    /** payload.queryId (re-validate a saved query) or payload.queryText (a not-yet-saved draft). */
    public validateQuery(payload: QueryDefinition): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/queryEngine.json/queries/validate`, payload);
    }

    /** Same queryId-or-draft resolution as validateQuery -- returns QueryPreviewResponse in .data. */
    public previewQuery(payload: QueryDefinition): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/queryEngine.json/queries/preview`, payload);
    }

    // ---------------------------------------------------------------- execution

    public execute(payload: QueryExecutionRequest): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/queryEngine.json/executions/execute`, payload);
    }

    public fetchAllExecutions(): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/queryEngine.json/executions/fetchAll`);
    }

    public fetchExecutionsByQueryId(queryId: any): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/queryEngine.json/executions/fetchByQueryId?queryId=${queryId}`);
    }

    // ---------------------------------------------------------------- schedules

    public addSchedule(payload: QuerySchedule): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/queryEngine.json/schedules/add`, payload);
    }

    public updateSchedule(payload: QuerySchedule): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/queryEngine.json/schedules/update`, payload);
    }

    public deleteSchedule(scheduleId: any): Observable<ApiResponse> {
        return this.http.delete<ApiResponse>(`${config.apiUrl}/queryEngine.json/schedules/delete?scheduleId=${scheduleId}`);
    }

    public fetchAllSchedules(): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/queryEngine.json/schedules/fetchAll`);
    }

}
