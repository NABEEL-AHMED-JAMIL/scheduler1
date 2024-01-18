import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class AppUserService {

    constructor(private http: HttpClient) {
    }

    public getAppUserProfile(username: any): Observable<any> {
        return this.http.get<any>(`${config.apiUrl}/appUser.json/getAppUserProfile?username=`+username);
    }

    public getSubAppUserAccount(username: any): Observable<any> {
        return this.http.get<any>(`${config.apiUrl}/appUser.json/getSubAppUserAccount?username=`+username);
    }

    public updateAppUserProfile(payload: any): Observable<any> {
        return this.http.post<any>(`${config.apiUrl}/appUser.json/updateAppUserProfile`, payload);
    }

    public updateAppUserPassword(payload: any): Observable<any> {
        return this.http.post<any>(`${config.apiUrl}/appUser.json/updateAppUserPassword`, payload);
    }

    public updateAppUserTimeZone(payload: any): Observable<any> {
        return this.http.post<any>(`${config.apiUrl}/appUser.json/updateAppUserTimeZone`, payload);
    }

    public closeAppUserAccount(payload: any): Observable<any> {
        return this.http.post<any>(`${config.apiUrl}/appUser.json/closeAppUserAccount`, payload);
    }

    public addEditAppUserAccount(payload: any): Observable<any> {
        return this.http.post<any>(`${config.apiUrl}/appUser.json/addEditAppUserAccount`, payload);
    }    

    public downloadAppUser(payload: any): Observable<any> {
        return this.http.post(`${config.apiUrl}/appUser.json/downloadAppUser`, payload,
        {
            responseType: 'blob'
        });
    }

    public downloadAppUserTemplateFile(): Observable<any> {
        return this.http.get(`${config.apiUrl}/appUser.json/downloadAppUserTemplateFile`,
        {
            responseType: 'blob'
        });
    }

    public uploadAppUser(payload: any): Observable<any> {
        return this.http.post<any>(`${config.apiUrl}/appUser.json/uploadAppUser`, payload);
    }

}