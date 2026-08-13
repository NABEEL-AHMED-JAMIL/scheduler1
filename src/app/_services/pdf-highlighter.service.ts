import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class PdfHighlighterService {

    constructor(private http: HttpClient) { }

    public fetchAllPdfHighlighterTask(): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/pdfHighlighter.json/fetchAllPdfHighlighterTask`);
    }

    public fetchPdfHighlighterTaskById(pdfHighlighterTaskId: any): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/pdfHighlighter.json/fetchPdfHighlighterTaskById?pdfHighlighterTaskId=`+pdfHighlighterTaskId);
    }

    public addPdfHighlighterTask(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/pdfHighlighter.json/addPdfHighlighterTask`, payload);
    }

    public updatePdfHighlighterTask(payload: any): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/pdfHighlighter.json/updatePdfHighlighterTask`, payload);
    }

    public deletePdfHighlighterTask(pdfHighlighterTaskId: any): Observable<ApiResponse> {
        return this.http.delete<ApiResponse>(`${config.apiUrl}/pdfHighlighter.json/deletePdfHighlighterTask?pdfHighlighterTaskId=`+pdfHighlighterTaskId);
    }

    public fetchPdfHighlighterFields(pdfHighlighterTaskId: any): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/pdfHighlighter.json/fetchPdfHighlighterFields?pdfHighlighterTaskId=`+pdfHighlighterTaskId);
    }

    public syncPdfHighlighterFields(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/pdfHighlighter.json/syncPdfHighlighterFields`, payload);
    }

    public uploadPdfHighlighterFile(pdfHighlighterTaskId: any, file: File): Observable<ApiResponse> {
        const formData = new FormData();
        formData.append('file', file, file.name);
        return this.http.post<ApiResponse>(`${config.apiUrl}/pdfHighlighter.json/uploadPdfHighlighterFile?pdfHighlighterTaskId=`+pdfHighlighterTaskId, formData);
    }

    public downloadPdfHighlighterFile(pdfHighlighterTaskId: any): Observable<Blob> {
        return this.http.get(`${config.apiUrl}/pdfHighlighter.json/downloadPdfHighlighterFile?pdfHighlighterTaskId=`+pdfHighlighterTaskId, { responseType: 'blob' });
    }

}
