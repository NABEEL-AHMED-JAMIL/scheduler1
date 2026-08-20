import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class FileShareService {

    constructor(private http: HttpClient) { }

    public sendFile(payload: { bucket: string; key?: string; keys?: string[]; recipientEmail: string; message: string }): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/fileShare.json/send`, payload);
    }

}
