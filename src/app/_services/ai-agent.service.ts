import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { AiAgent } from '@/_models/ai-agent.model';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class AiAgentService {

    constructor(private http: HttpClient) { }

    public addAgent(payload: AiAgent): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/aiAgent.json/addAgent`, payload);
    }

    public updateAgent(payload: AiAgent): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/aiAgent.json/updateAgent`, payload);
    }

    public deleteAgent(aiAgentId: any): Observable<ApiResponse> {
        return this.http.delete<ApiResponse>(`${config.apiUrl}/aiAgent.json/deleteAgent?aiAgentId=${aiAgentId}`);
    }

    public fetchAllAgents(): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/aiAgent.json/fetchAllAgents`);
    }

    public fetchAgentByAgentId(aiAgentId: any): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/aiAgent.json/fetchAgentByAgentId?aiAgentId=${aiAgentId}`);
    }

    public processAdHoc(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/aiAgent.json/processAdHoc`, payload);
    }

}
