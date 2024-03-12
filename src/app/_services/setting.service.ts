import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Observable } from 'rxjs';


@Injectable({
    providedIn: 'root'
})
export class SettingService {

    constructor(private http: HttpClient) { }

    public dynamicQueryResponse(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/setting.json/dynamicQueryResponse`, payload);
    }

}