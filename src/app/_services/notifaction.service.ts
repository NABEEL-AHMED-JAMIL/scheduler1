import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Observable } from 'rxjs';


@Injectable({
    providedIn: 'root'
})
export class NotificationService {

    constructor(private http: HttpClient,) {
    }

    public updateNotification(payload: any): Observable<ApiResponse> {
        let request = {
            'notifyId': payload.notifyId
        }
        return this.http.post<ApiResponse>(`${config.apiUrl}/notification.json/updateNotification`, request);
    }

    public fetchAllNotification(payload: any): Observable<ApiResponse> {
        let params = new HttpParams();
        params = params.set('username', payload);
        return this.http.get<ApiResponse>(`${config.apiUrl}/notification.json/fetchAllNotification`, { params });
    }

}