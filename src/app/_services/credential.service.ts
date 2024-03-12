import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Observable } from 'rxjs';


@Injectable({
    providedIn: 'root'
})
export class CredentailService {

    constructor(private http: HttpClient) { }

    public addCredential(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/credential.json/addCredential`, payload);
    }

    public updateCredential(payload: any): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/credential.json/updateCredential`, payload);
    }

    public deleteCredential(payload: any): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/credential.json/deleteCredential`, payload);
    }

    public fetchCredentialByCredentialId(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/credential.json/fetchCredentialByCredentialId`, payload);
    }

    public fetchAllCredential(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/credential.json/fetchAllCredential`, payload);
    }

}