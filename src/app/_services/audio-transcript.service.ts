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
export class AudioTranscriptService {

    constructor(private http: HttpClient) { }

    public extractFromUpload(file: File, timestamps: boolean = false): Observable<ApiResponse> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('timestamps', String(timestamps));
        return this.http.post<ApiResponse>(`${config.apiUrl}/audioTranscript.json/extractFromUpload`, formData);
    }

    public extractFromBucket(bucket: string, key: string, timestamps: boolean = false): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/audioTranscript.json/extractFromBucket`, { bucket, key, timestamps });
    }

    public extractFromVideoUpload(file: File, timestamps: boolean = false): Observable<ApiResponse> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('timestamps', String(timestamps));
        return this.http.post<ApiResponse>(`${config.apiUrl}/audioTranscript.json/extractFromVideoUpload`, formData);
    }

    public extractFromYoutube(url: string, timestamps: boolean = false): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/audioTranscript.json/extractFromYoutube`, { url, timestamps });
    }

}
