import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class STTService {
    
    constructor(private http: HttpClient) { }

    public addSTT(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/addSTT`, payload);
    }

    public editSTT(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/editSTT`, payload);
    }

    public deleteSTT(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/deleteSTT`, payload);
    }

    public fetchSTTBySttId(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/fetchSTTBySttId`, payload);
    }

    public fetchSTT(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/fetchSTT`, payload);
    }

    public addSTTLinkUser(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/addSTTLinkUser`, payload);
    }

    public deleteSTTLinkUser(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/deleteSTTLinkUser`, payload);
    }

    public fetchSTTLinkUser(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/fetchSTTLinkUser`, payload);
    }

    public addSTTLinkSTTF(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/addSTTLinkSTTF`, payload);
    }

    public deleteSTTLinkSTTF(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/deleteSTTLinkSTTF`, payload);
    }

    public fetchSTTLinkSTTF(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/fetchSTTLinkSTTF`, payload);
    }

    public addSTTF(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/addSTTF`, payload);
    }

    public editSTTF(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/editSTTF`, payload);
    }

    public deleteSTTF(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/deleteSTTF`, payload);
    }

    public fetchSTTFBySttfId(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/fetchSTTFBySttfId`, payload);
    }

    public fetchSTTF(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/fetchSTTF`, payload);
    }

    public addSTTFLinkSTT(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/addSTTFLinkSTT`, payload);
    }

    public deleteSTTFLinkSTT(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/deleteSTTFLinkSTT`, payload);
    }

    public fetchSTTFLinkSTT(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/fetchSTTFLinkSTT`, payload);
    }

    public addSTTFLinkSTTS(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/addSTTFLinkSTTS`, payload);
    }

    public deleteSTTFLinkSTTS(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/deleteSTTFLinkSTTS`, payload);
    }

    public fetchSTTFLinkSTTS(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/fetchSTTFLinkSTTS`, payload);
    }

    public addSTTS(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/addSTTS`, payload);
    }

    public editSTTS(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/editSTTS`, payload);
    }

    public deleteSTTS(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/deleteSTTS`, payload);
    }

    public fetchSTTSBySttsId(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/fetchSTTSBySttsId`, payload);
    }

    public fetchSTTS(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/fetchSTTS`, payload);
    }

    public addSTTSLinkSTTF(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/addSTTSLinkSTTF`, payload);
    }

    public deleteSTTSLinkSTTF(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/deleteSTTSLinkSTTF`, payload);
    }

    public fetchSTTSLinkSTTF(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/fetchSTTSLinkSTTF`, payload);
    }

    public addSTTSLinkSTTC(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/addSTTSLinkSTTC`, payload);
    }

    public deleteSTTSLinkSTTC(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/deleteSTTSLinkSTTC`, payload);
    }

    public fetchSTTSLinkSTTC(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/fetchSTTSLinkSTTC`, payload);
    }

    public addSTTC(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/addSTTC`, payload);
    }

    public editSTTC(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/editSTTC`, payload);
    }

    public deleteSTTC(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/deleteSTTC`, payload);
    }

    public fetchSTTCBySttcId(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/fetchSTTCBySttcId`, payload);
    }

    public fetchSTTC(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/fetchSTTC`, payload);
    }

    public addSTTCLinkSTTS(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/addSTTCLinkSTTS`, payload);
    }

    public deleteSTTCLinkSTTS(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/deleteSTTCLinkSTTS`, payload);
    }

    public fetchSTTCLinkSTTS(payload: any) {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/fetchSTTCLinkSTTS`, payload);
    }

    public downloadSTTCommon(payload: any): Observable<any> {
        return this.http.post(`${config.apiUrl}/sourceTaskType.json/downloadSTTCommon`, payload,
        {
            responseType: 'blob'
        });
    }

    public downloadSTTCommonTemplateFile(payload: any): Observable<any> {
        return this.http.post(`${config.apiUrl}/sourceTaskType.json/downloadSTTCommonTemplateFile`, payload,
        {
            responseType: 'blob'
        });
    }

    public uploadSTTCommon(payload:any): Observable<any> {
        return this.http.post(`${config.apiUrl}/sourceTaskType.json/uploadSTTCommon`, payload);
    }

}