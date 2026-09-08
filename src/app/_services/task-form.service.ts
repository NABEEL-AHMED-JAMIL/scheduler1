import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { Observable } from 'rxjs';

/**
 * Pipeline Forms -- the catalogue of pipelines a Source Task can target.
 *
 * A pipeline no longer comes from the PIPELINE_IDS lookup: it is defined by creating its form
 * (next app, Configuration > Pipeline Forms), and that list is what Source Task's Pipeline
 * picker reads here. This app does not build or edit forms itself, only reads the list of
 * pipelines that have one.
 */
@Injectable({
    providedIn: 'root'
})
export class TaskFormService {

    constructor(private http: HttpClient) { }

    /** The same rows the admin-only listForms shows, exposed at a role any task-configuring
     *  user already has -- this app's Add/Edit Task screen has no admin gate of its own. */
    public listPipelines(): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/taskForm.json/listPipelines`);
    }

}
