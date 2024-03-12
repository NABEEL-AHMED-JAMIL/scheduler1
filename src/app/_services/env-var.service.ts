import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Observable } from 'rxjs';


@Injectable({
    providedIn: 'root'
})
export class EnvVarService {

    constructor(private http: HttpClient) { }

    public addEnv(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/appUserEvn.json/addEnv`, payload);
    }

    public editEnv(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/appUserEvn.json/editEnv`, payload);
    }

    public deleteEnv(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/appUserEvn.json/deleteEnv`, payload);
    }

    public fetchAllEvn() {
        return this.http.get<ApiResponse>(`${config.apiUrl}/appUserEvn.json/fetchAllEvn`);
    }

    public fetchEnvById(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/appUserEvn.json/fetchEnvById`, payload);
    }

    public linkEnvWithUser(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/appUserEvn.json/linkEnvWithUser`, payload);
    }

    public fetchAllEnvWithEnvKeyId(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/appUserEvn.json/fetchAllEnvWithEnvKeyId`, payload);
    }

    public fetchUserEnvByEnvKey(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/appUserEvn.json/fetchUserEnvByEnvKey`, payload);
    }

    public fetchAllEnvWithAppUserId(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/appUserEvn.json/fetchAllEnvWithAppUserId`, payload);
    }

    public deleteEnvWithUserId(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/appUserEvn.json/deleteEnvWithUserId`, payload);
    }

    public updateAppUserEnvWithUserId(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/appUserEvn.json/updateAppUserEnvWithUserId`, payload);
    }

}