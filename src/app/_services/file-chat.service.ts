import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class FileChatService {

    constructor(private http: HttpClient) { }

    public prepareContext(bucket: string, key: string, aiAgentId?: number | string): Observable<ApiResponse> {
        // aiAgentId is what lets the backend's target-file-type check run at all (see
        // FileChatServiceImpl.prepareContext) -- without it, an agent restricted to e.g. png/jpg
        // picked against a PDF silently reads as "Ready" here, and the mismatch only surfaces once
        // the user has already typed a question and sendMessage's separate check rejects it.
        const payload: any = { bucket, key };
        if (aiAgentId !== undefined && aiAgentId !== null && aiAgentId !== '') {
            payload.aiAgentId = Number(aiAgentId);
        }
        return this.http.post<ApiResponse>(`${config.apiUrl}/fileChat.json/prepareContext`, payload);
    }

    public sendMessage(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/fileChat.json/sendMessage`, payload);
    }

    public exportFile(payload: { content: string; sourceFormat: string; targetFormat: string }): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/fileChat.json/exportFile`, payload);
    }

}
