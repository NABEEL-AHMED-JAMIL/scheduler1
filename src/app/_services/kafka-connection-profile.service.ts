import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { KafkaConnectionProfile } from '@/_models/kafka-connection-profile.model';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class KafkaConnectionProfileService {

    constructor(private http: HttpClient) { }

    public addProfile(payload: KafkaConnectionProfile): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/kafkaConnectionProfile.json/addProfile`, payload);
    }

    public updateProfile(payload: KafkaConnectionProfile): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/kafkaConnectionProfile.json/updateProfile`, payload);
    }

    public deleteProfile(kafkaConnectionProfileId: any): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(
            `${config.apiUrl}/kafkaConnectionProfile.json/deleteProfile?kafkaConnectionProfileId=${kafkaConnectionProfileId}`, {});
    }

    public fetchAllProfiles(): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/kafkaConnectionProfile.json/fetchAllProfiles`);
    }

    public setAsDefault(kafkaConnectionProfileId: any): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(
            `${config.apiUrl}/kafkaConnectionProfile.json/setAsDefault?kafkaConnectionProfileId=${kafkaConnectionProfileId}`, {});
    }

    public clearDefault(): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/kafkaConnectionProfile.json/clearDefault`, {});
    }

    public testConnection(payload: KafkaConnectionProfile): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/kafkaConnectionProfile.json/testConnection`, payload);
    }

    public testTopic(topicName: any): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/kafkaConnectionProfile.json/testTopic?topicName=${encodeURIComponent(topicName)}`);
    }

    public fetchKafkaRoute(sourceTaskTypeId: any): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/setting.json/fetchKafkaRoute?sourceTaskTypeId=${sourceTaskTypeId}`);
    }

    public setKafkaRoute(sourceTaskTypeId: any, kafkaConnectionProfileId: any): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(
            `${config.apiUrl}/setting.json/setKafkaRoute?sourceTaskTypeId=${sourceTaskTypeId}&kafkaConnectionProfileId=${kafkaConnectionProfileId}`, {});
    }

    public deleteKafkaRoute(sourceTaskTypeId: any): Observable<ApiResponse> {
        return this.http.delete<ApiResponse>(`${config.apiUrl}/setting.json/deleteKafkaRoute?sourceTaskTypeId=${sourceTaskTypeId}`);
    }

}
