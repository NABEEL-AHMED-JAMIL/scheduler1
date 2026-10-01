import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../core/api/api.config';
import { FormDraft, FormStatus, FormSummary, LinkableJob, Submission, UploadRef } from './forms.model';

/**
 * Core's forms (Wave 5 Forms lite). /form.json is the page 'forms' (build, read, fill in); /formSubmission.json the page
 * 'form-submissions'. Saving and changing a form's status are a workspace administrator's, and a builder action (refused
 * to the customer in a MANAGED workspace); filling in is every member's who holds the page.
 */
@Injectable({ providedIn: 'root' })
export class FormsApi {
  private readonly http = inject(HttpClient);
  private readonly forms = `${API_BASE}/form.json`;
  private readonly submissions = `${API_BASE}/formSubmission.json`;

  list(withArchived = false): Observable<ApiResponse<FormSummary[]>> {
    return this.http.get<ApiResponse<FormSummary[]>>(`${this.forms}/list`, { params: { withArchived: String(withArchived) } });
  }

  fetch(formId: number): Observable<ApiResponse<FormSummary>> {
    return this.http.get<ApiResponse<FormSummary>>(`${this.forms}/fetch`, { params: { formId: String(formId) } });
  }

  linkableJobs(): Observable<ApiResponse<LinkableJob[]>> {
    return this.http.get<ApiResponse<LinkableJob[]>>(`${this.forms}/linkableJobs`);
  }

  save(draft: FormDraft): Observable<ApiResponse<FormSummary>> {
    return this.http.post<ApiResponse<FormSummary>>(`${this.forms}/save`, draft);
  }

  setStatus(formId: number, status: FormStatus): Observable<ApiResponse<FormSummary>> {
    return this.http.post<ApiResponse<FormSummary>>(`${this.forms}/status`, { formId, status });
  }

  /** A refusal of the answers comes back as ERROR with `data.problems`, a sentence per field key. */
  submit(formId: number, answers: Record<string, unknown>): Observable<ApiResponse<Submission | { problems: Record<string, string> }>> {
    return this.http.post<ApiResponse<Submission | { problems: Record<string, string> }>>(`${this.forms}/submit`, { formId, answers });
  }

  /** A file or drawn signature for a form's field, before the form is sent (MIG-277); the answer names it by uploadId. */
  upload(formId: number, field: string, file: Blob, name: string): Observable<ApiResponse<UploadRef>> {
    const body = new FormData();
    body.append('formId', String(formId));
    body.append('field', field);
    body.append('file', file, name);
    return this.http.post<ApiResponse<UploadRef>>(`${this.forms}/upload`, body);
  }

  submissionsOf(formId: number, limit = 200): Observable<ApiResponse<Submission[]>> {
    return this.http.get<ApiResponse<Submission[]>>(`${this.submissions}/list`, { params: { formId: String(formId), limit: String(limit) } });
  }

  /** The CSV, as a file: its name is in Content-Disposition. */
  exportCsv(formId: number): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.submissions}/export`, { params: { formId: String(formId) }, responseType: 'blob', observe: 'response' });
  }
}
