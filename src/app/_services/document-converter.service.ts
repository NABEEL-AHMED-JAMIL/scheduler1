import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class DocumentConverterService {

    constructor(private http: HttpClient) { }

    public supportedFormats(): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/documentConverter.json/supportedFormats`);
    }

    public fetchAllTasks(): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/documentConverter.json/fetchAllTasks`);
    }

    public fetchTaskById(documentConverterTaskId: any): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(
            `${config.apiUrl}/documentConverter.json/fetchTaskById?documentConverterTaskId=` + documentConverterTaskId);
    }

    public convert(file: File, outputFormat: string, save: boolean, bucketName?: string, targetFolder?: string, taskName?: string): Observable<ApiResponse> {
        const formData = new FormData();
        formData.append('file', file, file.name);
        formData.append('outputFormat', outputFormat);
        formData.append('save', String(save));
        if (bucketName) {
            formData.append('bucketName', bucketName);
        }
        if (targetFolder) {
            formData.append('targetFolder', targetFolder);
        }
        if (taskName) {
            formData.append('taskName', taskName);
        }
        return this.http.post<ApiResponse>(`${config.apiUrl}/documentConverter.json/convert`, formData);
    }

    public deleteTask(documentConverterTaskId: any): Observable<ApiResponse> {
        return this.http.delete<ApiResponse>(
            `${config.apiUrl}/documentConverter.json/deleteTask?documentConverterTaskId=` + documentConverterTaskId);
    }

}
