import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
    providedIn: 'root'
})
export class AppUserService {

    constructor(private http: HttpClient) {
    }

    public getAppUserProfile(username: any): any {
        return this.http.get<any>(`${config.apiUrl}/appUser.json/getAppUserProfile?username=`+username);
    }

    public getSubAppUserAccount(username: any): any {
        return this.http.get<any>(`${config.apiUrl}/appUser.json/getSubAppUserAccount?username=`+username);
    }

    public updateAppUserProfile(payload: any): any {
        return this.http.post<any>(`${config.apiUrl}/appUser.json/updateAppUserProfile`, payload);
    }

    public updateAppUserPassword(payload: any): any {
        return this.http.post<any>(`${config.apiUrl}/appUser.json/updateAppUserPassword`, payload);
    }

    public updateAppUserTimeZone(payload: any): any {
        return this.http.post<any>(`${config.apiUrl}/appUser.json/updateAppUserTimeZone`, payload);
    }

    public closeAppUserAccount(payload: any): any {
        return this.http.post<any>(`${config.apiUrl}/appUser.json/closeAppUserAccount`, payload);
    }

}