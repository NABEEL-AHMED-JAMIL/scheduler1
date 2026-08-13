import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class OllamaService {

    constructor(private http: HttpClient) { }

    public listModels(): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/ollama.json/listModels`);
    }

    public pullModel(name: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/ollama.json/pullModel?name=${encodeURIComponent(name)}`, {});
    }

    public deleteModel(name: any): Observable<ApiResponse> {
        return this.http.delete<ApiResponse>(`${config.apiUrl}/ollama.json/deleteModel?name=${encodeURIComponent(name)}`);
    }

}
