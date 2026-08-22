import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { StorageConnection } from '@/_models/storage-connection.model';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class StorageConnectionService {

    constructor(private http: HttpClient) { }

    public addConnection(payload: StorageConnection): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/storageConnection.json/addConnection`, payload);
    }

    public updateConnection(payload: StorageConnection): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/storageConnection.json/updateConnection`, payload);
    }

    public deleteConnection(storageConnectionId: any): Observable<ApiResponse> {
        return this.http.delete<ApiResponse>(
            `${config.apiUrl}/storageConnection.json/deleteConnection?storageConnectionId=${storageConnectionId}`);
    }

    public fetchAllConnections(): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/storageConnection.json/fetchAllConnections`);
    }

    public fetchConnectionById(storageConnectionId: any): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(
            `${config.apiUrl}/storageConnection.json/fetchConnectionById?storageConnectionId=${storageConnectionId}`);
    }

    public discoverBuckets(payload: StorageConnection): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(
            `${config.apiUrl}/storageConnection.json/discoverBuckets`, payload);
    }

    public testConnection(storageConnectionId: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(
            `${config.apiUrl}/storageConnection.json/testConnection?storageConnectionId=${storageConnectionId}`, {});
    }

}
