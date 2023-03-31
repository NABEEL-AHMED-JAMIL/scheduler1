import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthResponse } from '@/_models';

@Injectable({
    providedIn: 'root'
})
export class AppUserService {

    constructor(private http: HttpClient) {
    }

    public getAppUserProfile() {
        return this.http.get<any>(`${config.apiUrl}/appUser.json/getAppUserProfile`);
    }

    public updateAppUserProfile(payload: any) {
        return this.http.post<any>(`${config.apiUrl}/appUser.json/updateAppUserProfile`, payload);
    }

    public updateAppUserPassword(payload: any) {
        return this.http.post<any>(`${config.apiUrl}/appUser.json/updateAppUserPassword`, payload);
    }

    public updateAppUserTimeZone(payload: any) {
        return this.http.post<any>(`${config.apiUrl}/appUser.json/updateAppUserTimeZone`, payload);
    }

    public closeAppUserAccount(payload: any) {
        return this.http.delete<any>(`${config.apiUrl}/appUser.json/closeAppUserAccount`, payload);
    }

}