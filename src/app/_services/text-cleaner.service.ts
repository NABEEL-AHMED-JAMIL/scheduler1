import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Observable } from 'rxjs';

/**
 * @author Nabeel Ahmed
 */
@Injectable({
    providedIn: 'root'
})
export class TextCleanerService {

    constructor(private http: HttpClient) { }

    /** Endpoint URL as shown/copied in the UI -- also directly callable by external tools
     * (e.g. the job-search Python listeners) with a plain { "text": "..." } POST body. */
    public get cleanUrl(): string {
        return `${config.apiUrl}/textCleaner.json/clean`;
    }

    public clean(text: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(this.cleanUrl, { text });
    }

}
