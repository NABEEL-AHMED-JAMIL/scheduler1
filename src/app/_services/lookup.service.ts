import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Observable } from 'rxjs';


@Injectable({
    providedIn: 'root'
})
export class LookupService {

    constructor(private http: HttpClient) {
    }

    public addLookupData(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/lookup.json/addLookupData`, payload);
    }

    public deleteLookupData(payload: any): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/lookup.json/deleteLookupData`, payload);
    }

    public fetchAllLookup(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/lookup.json/fetchAllLookup`, payload);
    }

    public fetchSubLookupByParentId(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/lookup.json/fetchSubLookupByParentId`, payload);
    }

    public fetchLookupByLookupType(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/lookup.json/fetchLookupByLookupType`, payload);
    }    

    public updateLookupData(payload: any): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/lookup.json/updateLookupData`, payload);
    }

    public uploadLookup(payload:any): any {
        return this.http.post(`${config.apiUrl}/lookup.json/uploadLookup`, payload);
    }

    public downloadLookup(payload: any): Observable<any> {
        return this.http.post(`${config.apiUrl}/lookup.json/downloadLookup`, payload,
        {
            responseType: 'blob'
        });
    }

    public downloadLookupTemplateFile(): Observable<any> {
        return this.http.get(`${config.apiUrl}/lookup.json/downloadSourceJobTemplateFile`,
        {
            responseType: 'blob'
        });
    }

}