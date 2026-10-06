import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../core/api/api.config';
import { FormDraft, FormStatus, FormSummary, LinkableJob, PublicFormView, SharePolicy, ShareLink, ShareLinks, ShareLinkDraft,
  Submission, UploadRef } from './forms.model';

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

  // ---- sharing by link (MIG-278): a workspace administrator's, off until one turns it on --------------------------

  sharePolicy(): Observable<ApiResponse<SharePolicy>> {
    return this.http.get<ApiResponse<SharePolicy>>(`${this.forms}/sharePolicy`);
  }

  setSharePolicy(enabled: boolean): Observable<ApiResponse<SharePolicy>> {
    return this.http.post<ApiResponse<SharePolicy>>(`${this.forms}/sharePolicy`, { enabled });
  }

  shareLinks(formId: number): Observable<ApiResponse<ShareLinks>> {
    return this.http.get<ApiResponse<ShareLinks>>(`${this.forms}/shareLinks`, { params: { formId: String(formId) } });
  }

  /** The answer carries the link's token this once; nobody can read it again. */
  createShareLink(draft: ShareLinkDraft): Observable<ApiResponse<ShareLink>> {
    return this.http.post<ApiResponse<ShareLink>>(`${this.forms}/shareLinks/create`, draft);
  }

  revokeShareLink(linkId: number): Observable<ApiResponse<ShareLink>> {
    return this.http.post<ApiResponse<ShareLink>>(`${this.forms}/shareLinks/revoke`, null, { params: { linkId: String(linkId) } });
  }

  submissionsOf(formId: number, limit = 200): Observable<ApiResponse<Submission[]>> {
    return this.http.get<ApiResponse<Submission[]>>(`${this.submissions}/list`, { params: { formId: String(formId), limit: String(limit) } });
  }

  /** The CSV, as a file: its name is in Content-Disposition. */
  exportCsv(formId: number): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.submissions}/export`, { params: { formId: String(formId) }, responseType: 'blob', observe: 'response' });
  }
}

/**
 * The one door open without signing in (MIG-278): a share link's form. Each call names the link by its token; a refusal
 * comes back with its own HTTP status (404 not valid, 410 expired or used, 401/403 sign-in, 429 too many) and a sentence.
 */
@Injectable({ providedIn: 'root' })
export class PublicFormsApi {
  private readonly http = inject(HttpClient);

  private url(token: string): string {
    return `${API_BASE}/publicForm.json/${encodeURIComponent(token)}`;
  }

  open(token: string): Observable<ApiResponse<PublicFormView>> {
    return this.http.get<ApiResponse<PublicFormView>>(this.url(token));
  }

  upload(token: string, ticket: string, field: string, file: Blob, name: string): Observable<ApiResponse<UploadRef>> {
    const body = new FormData();
    body.append('ticket', ticket);
    body.append('field', field);
    body.append('file', file, name);
    return this.http.post<ApiResponse<UploadRef>>(`${this.url(token)}/upload`, body);
  }

  /** `website` is the honeypot: a person never sees it, so it goes empty. */
  submit(token: string, ticket: string, answers: Record<string, unknown>, website: string)
    : Observable<ApiResponse<{ problems?: Record<string, string> } | null>> {
    return this.http.post<ApiResponse<{ problems?: Record<string, string> } | null>>(`${this.url(token)}/submit`,
      { ticket, answers, website });
  }
}
