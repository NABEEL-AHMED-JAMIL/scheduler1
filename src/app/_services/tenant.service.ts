import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Tenant } from '@/_models/tenant.model';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class TenantService {

    constructor(private http: HttpClient) { }

    public listTenants(): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/tenant.json/listTenants`);
    }

    public addTenant(payload: Tenant): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/tenant.json/addTenant`, payload);
    }

    public updateTenant(payload: Tenant): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/tenant.json/updateTenant`, payload);
    }

    public changeTenantStatus(payload: Tenant): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/tenant.json/changeTenantStatus`, payload);
    }

}
