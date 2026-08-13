import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { DynamicForm, DynamicFormField, DynamicFormSubmission } from '@/_models/dynamic-form.model';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class DynamicFormService {

    constructor(private http: HttpClient) { }

    public addForm(payload: DynamicForm): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/dynamicForm.json/addForm`, payload);
    }

    public updateForm(payload: DynamicForm): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/dynamicForm.json/updateForm`, payload);
    }

    public deleteForm(dynamicFormId: any): Observable<ApiResponse> {
        return this.http.delete<ApiResponse>(`${config.apiUrl}/dynamicForm.json/deleteForm?dynamicFormId=${dynamicFormId}`);
    }

    public fetchAllForms(): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/dynamicForm.json/fetchAllForms`);
    }

    public fetchFormByFormId(dynamicFormId: any): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/dynamicForm.json/fetchFormByFormId?dynamicFormId=${dynamicFormId}`);
    }

    public addField(dynamicFormId: any, payload: DynamicFormField): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/dynamicForm.json/addField?dynamicFormId=${dynamicFormId}`, payload);
    }

    public updateField(payload: DynamicFormField): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/dynamicForm.json/updateField`, payload);
    }

    public deleteField(dynamicFormFieldId: any): Observable<ApiResponse> {
        return this.http.delete<ApiResponse>(`${config.apiUrl}/dynamicForm.json/deleteField?dynamicFormFieldId=${dynamicFormFieldId}`);
    }

    public submitForm(payload: DynamicFormSubmission): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/dynamicForm.json/submitForm`, payload);
    }

    public updateSubmission(payload: DynamicFormSubmission): Observable<ApiResponse> {
        return this.http.put<ApiResponse>(`${config.apiUrl}/dynamicForm.json/updateSubmission`, payload);
    }

    public deleteSubmission(dynamicFormSubmissionId: any): Observable<ApiResponse> {
        return this.http.delete<ApiResponse>(`${config.apiUrl}/dynamicForm.json/deleteSubmission?dynamicFormSubmissionId=${dynamicFormSubmissionId}`);
    }

    public fetchSubmissionsByFormId(dynamicFormId: any): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/dynamicForm.json/fetchSubmissionsByFormId?dynamicFormId=${dynamicFormId}`);
    }

    public fetchSubmissionBySubmissionId(dynamicFormSubmissionId: any): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/dynamicForm.json/fetchSubmissionBySubmissionId?dynamicFormSubmissionId=${dynamicFormSubmissionId}`);
    }

}
