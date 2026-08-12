import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { AppUserRecord } from '@/_models/app-user.model';
import { Observable } from 'rxjs';

/**
 * @author Nabeel Ahmed
 */
@Injectable({
    providedIn: 'root'
})
export class AppUserService {

    constructor(private http: HttpClient) { }

    public listUsers(): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/appUser.json/listUsers`);
    }

    public addUser(payload: AppUserRecord): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/appUser.json/addUser`, payload);
    }

    public updateUser(payload: AppUserRecord): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/appUser.json/updateUser`, payload);
    }

    public changeUserStatus(payload: AppUserRecord): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/appUser.json/changeUserStatus`, payload);
    }

    public resetPassword(payload: AppUserRecord): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/appUser.json/resetPassword`, payload);
    }

}
