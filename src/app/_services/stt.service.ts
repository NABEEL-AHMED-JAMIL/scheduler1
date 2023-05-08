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