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

    public viewSTT(): Observable<ApiResponse> {
        return null;
    }

    public fetchSTTBySttId(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/fetchSTTBySttId`, payload);
    }

    public fetchSTT(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/fetchSTT`, payload);
    }

    public downloadSTTTree(): Observable<ApiResponse> {
        return null;
    }

    public linkSTTWithFrom(): Observable<ApiResponse> {
        return null;
    }

    // STTF
    public addSTTF(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/addSTTF`, payload);
    }

    public editSTTF(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/editSTTF`, payload);
    }

    public deleteSTTF(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/deleteSTTF`, payload);
    }

    public viewSTTF(): Observable<ApiResponse> {
        return null;
    }

    public fetchSTTFBySttfId(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/fetchSTTFBySttfId`, payload);
    }

    public fetchSTTF(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/fetchSTTF`, payload);
    }

    public downloadSTTFTree(): Observable<ApiResponse> {
        return null;
    }

    public linkSTTFWithFrom(): Observable<ApiResponse> {
        return null;
    }

    // STTS
    public addSTTS(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/addSTTS`, payload);
    }

    public editSTTS(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/editSTTS`, payload);
    }

    public deleteSTTS(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/deleteSTTS`, payload);
    }

    public viewSTTS(): Observable<ApiResponse> {
        return null;
    }

    public fetchSTTSBySttsId(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/fetchSTTSBySttsId`, payload);
    }

    public fetchSTTS(): Observable<ApiResponse> {
        return null;
    }

    public downloadSTTSTree(): Observable<ApiResponse> {
        return null;
    }

    public linkSTTSWithFrom(): Observable<ApiResponse> {
        return null;
    }

    // STTC
    public addSTTC(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/addSTTC`, payload);
    }

    public editSTTC(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/editSTTC`, payload);
    }

    public deleteSTTC(payload: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/sourceTaskType.json/deleteSTTC`, payload);
    }

    public fetchSTTC(): Observable<ApiResponse> {
        return null;
    }

    public downloadSTTCTree(): any {
        return null;
    };

    public linkSTTCWithFrom(): any {
        return null;
    };


}