import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Observable } from 'rxjs';

/**
 * @author Nabeel Ahmed
 */
@Injectable({
    providedIn: 'root'
})
export class StorageService {

    constructor(private http: HttpClient) { }

    public buckets(): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/storage.json/buckets`);
    }

    public listObjects(bucket: string, prefix: string, continuationToken: string, maxKeys: number = 50): Observable<ApiResponse> {
        let url = `${config.apiUrl}/storage.json/listObjects?bucket=${encodeURIComponent(bucket)}`
            + `&prefix=${encodeURIComponent(prefix || '')}&maxKeys=${maxKeys}`;
        if (continuationToken) {
            url += `&continuationToken=${encodeURIComponent(continuationToken)}`;
        }
        return this.http.get<ApiResponse>(url);
    }

    public objectMetadata(bucket: string, key: string): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(
            `${config.apiUrl}/storage.json/objectMetadata?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`);
    }

    public previewObjectUrl(bucket: string, key: string): string {
        return `${config.apiUrl}/storage.json/previewObject?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`;
    }

    public downloadObjectUrl(bucket: string, key: string): string {
        return `${config.apiUrl}/storage.json/downloadObject?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`;
    }

    public previewObjectText(bucket: string, key: string): Observable<string> {
        return this.http.get(this.previewObjectUrl(bucket, key), { responseType: 'text' });
    }

    public uploadObject(bucket: string, prefix: string, file: File): Observable<ApiResponse> {
        const formData = new FormData();
        formData.append('file', file);
        const url = `${config.apiUrl}/storage.json/uploadObject?bucket=${encodeURIComponent(bucket)}&prefix=${encodeURIComponent(prefix || '')}`;
        return this.http.post<ApiResponse>(url, formData);
    }

    public createFolder(bucket: string, prefix: string, folderName: string): Observable<ApiResponse> {
        const url = `${config.apiUrl}/storage.json/createFolder?bucket=${encodeURIComponent(bucket)}`
            + `&prefix=${encodeURIComponent(prefix || '')}&folderName=${encodeURIComponent(folderName)}`;
        return this.http.post<ApiResponse>(url, {});
    }

    public deleteObject(bucket: string, key: string): Observable<ApiResponse> {
        return this.http.delete<ApiResponse>(
            `${config.apiUrl}/storage.json/deleteObject?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`);
    }

    public deleteObjects(bucket: string, keys: string[]): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/storage.json/deleteObjects`, { bucket, keys });
    }

    public deleteFolder(bucket: string, key: string): Observable<ApiResponse> {
        return this.http.delete<ApiResponse>(
            `${config.apiUrl}/storage.json/deleteFolder?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`);
    }

    public renameFolder(bucket: string, key: string, newFolderName: string): Observable<ApiResponse> {
        const url = `${config.apiUrl}/storage.json/renameFolder?bucket=${encodeURIComponent(bucket)}`
            + `&key=${encodeURIComponent(key)}&newFolderName=${encodeURIComponent(newFolderName)}`;
        return this.http.post<ApiResponse>(url, {});
    }

}
