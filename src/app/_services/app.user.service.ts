import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
    providedIn: 'root'
})
export class AppUserService {

    constructor(private http: HttpClient) {
    }

    public getAppUserProfile(username: any) {
        return this.http.get<any>(`${config.apiUrl}/appUser.json/getAppUserProfile?username=`+username);
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
        return this.http.post<any>(`${config.apiUrl}/appUser.json/closeAppUserAccount`, payload);
    }

}