import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class TextCleanerService {

    constructor(private http: HttpClient) { }

    public get cleanUrl(): string {
        return `${config.apiUrl}/textCleaner.json/clean`;
    }

    public clean(text: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(this.cleanUrl, { text });
    }

}
