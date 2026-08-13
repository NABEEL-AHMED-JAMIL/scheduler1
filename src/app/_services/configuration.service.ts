import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse } from '@/_models';

@Injectable({
    providedIn: 'root'
})
export class ConfigurationMakerService {

    constructor(private http: HttpClient) { }

    public getXmlData(payload:any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/setting.json/xmlCreateChecker`, payload);
    }

}