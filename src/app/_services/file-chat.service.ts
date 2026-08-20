import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class FileChatService {

    constructor(private http: HttpClient) { }

    public prepareContext(bucket: string, key: string): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/fileChat.json/prepareContext`, { bucket, key });
    }

    public sendMessage(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/fileChat.json/sendMessage`, payload);
    }

    public exportFile(payload: { content: string; sourceFormat: string; targetFormat: string }): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/fileChat.json/exportFile`, payload);
    }

}
