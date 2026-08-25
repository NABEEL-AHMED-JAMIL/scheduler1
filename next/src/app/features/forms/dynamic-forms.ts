import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { TableShell } from '../../shared/ui/data-table';
import { StatTile } from '../../shared/ui/stat-tile';
import { StatusPill } from '../../shared/ui/status-pill';
import { Icon } from '../../shared/ui/icon';
import { ViewToggle } from '../../shared/ui/view-toggle';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { copyText } from '../../shared/ui/clipboard.util';
import { FormRenderer } from './form-renderer';
import { DynamicFormDialog } from './dynamic-form-dialog';
import { SubmissionToTaskDialog } from './submission-to-task-dialog';
import { DynamicForm, DynamicFormSubmission, SECTION_TYPE } from './dynamic-form.model';

@Component({
  selector: 'app-dynamic-forms',
  imports: [ViewToggle, StatTile, TableShell, StatusPill, Icon, FormRenderer, DatePipe,
            CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './dynamic-forms.html',
})
export class DynamicForms implements OnInit {
  readonly view = signal<'table' | 'cards'>('table');
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  readonly forms = signal<DynamicForm[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly statusFilter = signal('');

  readonly hasFilters = computed(() => !!(this.search().trim() || this.statusFilter()));

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    return this.forms().filter(f => {
      if (status && f.status !== status) return false;
      if (!term) return true;
      return `${f.formName ?? ''} ${f.description ?? ''}`.toLowerCase().includes(term);
    });
  });

  readonly summary = computed(() => {
    const list = this.forms();
    return {
      total: list.length,
      active: list.filter(f => f.status === 'Active').length,
      fields: list.reduce((sum, f) => sum + (f.totalFields ?? 0), 0),
      empty: list.filter(f => !f.totalFields).length,
    };
  });

  // ---- submissions, opened for one form ------------------------------------------------
  readonly openFor = signal<DynamicForm | null>(null);
  readonly submissions = signal<DynamicFormSubmission[]>([]);
  readonly submissionsLoading = signal(false);
  readonly viewing = signal<DynamicFormSubmission | null>(null);
  /** The chosen form with its fields, needed to render a submission as the form it answered. */
  readonly openForFields = signal<DynamicForm | null>(null);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<DynamicForm[]>>(`${API_BASE}/dynamicForm.json/fetchAllForms`).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS) { this.error.set(response.message); return; }
        this.forms.set(response.data ?? []);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load forms.');
      },
    });
  }

  /** fetchAllForms omits fields, so the full form is read before editing or rendering it. */
  private withFields(form: DynamicForm): Promise<DynamicForm | null> {
    return new Promise(resolve => {
      this.http.get<ApiResponse<DynamicForm>>(`${API_BASE}/dynamicForm.json/fetchFormByFormId`,
        { params: { dynamicFormId: String(form.dynamicFormId) } }).subscribe({
        next: r => resolve(r.status === API_SUCCESS ? (r.data ?? null) : null),
        error: () => resolve(null),
      });
    });
  }

  create(): void {
    this.dialog.open<boolean>(DynamicFormDialog, { data: {} })
      .closed.subscribe(saved => { if (saved) this.load(); });
  }

  async edit(form: DynamicForm): Promise<void> {
    const full = await this.withFields(form);
    if (!full) { this.toast.error('Could not read that form.'); return; }
    this.dialog.open<boolean>(DynamicFormDialog, { data: { form: full } })
      .closed.subscribe(saved => { if (saved) this.load(); });
  }

  async remove(form: DynamicForm): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${form.formName}?`,
      body: 'The form stops accepting answers. Submissions already collected are kept.',
      confirmLabel: 'Delete form',
      danger: true,
    });
    if (!ok) return;
    this.http.delete<ApiResponse>(`${API_BASE}/dynamicForm.json/deleteForm`,
      { params: new HttpParams().set('dynamicFormId', String(form.dynamicFormId)) }).subscribe({
      next: r => {
        if (r.status === API_SUCCESS) { this.toast.success(r.message); this.load(); }
        else this.toast.error(r.message);
      },
      error: err => this.toast.error(err?.error?.message || 'The form could not be deleted.'),
    });
  }

  /** The public link anyone can open without signing in; fetchFormByUuid is permitAll. */
  shareLink(form: DynamicForm): string {
    return `${location.origin}/f/${form.uuid}`;
  }

  copyLink(form: DynamicForm): void {
    if (!form.uuid) { this.toast.error('This form has no share link yet.'); return; }
    copyText(this.shareLink(form));
    this.toast.success('Share link copied. Anyone with it can fill this form in.');
  }

  async openSubmissions(form: DynamicForm): Promise<void> {
    this.openFor.set(form);
    this.viewing.set(null);
    this.submissions.set([]);
    this.submissionsLoading.set(true);
    this.openForFields.set(await this.withFields(form));
    this.http.get<ApiResponse<DynamicFormSubmission[]>>(
      `${API_BASE}/dynamicForm.json/fetchSubmissionsByFormId`,
      { params: { dynamicFormId: String(form.dynamicFormId) } }).subscribe({
      next: r => {
        this.submissionsLoading.set(false);
        if (r.status === API_SUCCESS) this.submissions.set(r.data ?? []);
        else this.toast.error(r.message);
      },
      error: err => {
        this.submissionsLoading.set(false);
        this.toast.error(err?.error?.message || 'Could not read the submissions.');
      },
    });
  }

  closeSubmissions(): void {
    this.openFor.set(null);
    this.submissions.set([]);
    this.viewing.set(null);
  }

  async removeSubmission(submission: DynamicFormSubmission): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: 'Delete this submission?',
      body: 'The answers it holds are removed and cannot be recovered.',
      confirmLabel: 'Delete submission',
      danger: true,
    });
    if (!ok) return;
    this.http.delete<ApiResponse>(`${API_BASE}/dynamicForm.json/deleteSubmission`,
      { params: new HttpParams().set('dynamicFormSubmissionId',
        String(submission.dynamicFormSubmissionId)) }).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; }
        this.toast.success(r.message);
        if (this.viewing()?.dynamicFormSubmissionId === submission.dynamicFormSubmissionId) {
          this.viewing.set(null);
        }
        const form = this.openFor();
        if (form) this.openSubmissions(form);
      },
      error: err => this.toast.error(err?.error?.message || 'The submission could not be deleted.'),
    });
  }

  /** A one-line gist of a submission, so the list is readable without opening each row. */
  summaryOf(submission: DynamicFormSubmission): string {
    const fields = (this.openForFields()?.fields ?? [])
      .filter(f => f.fieldType !== SECTION_TYPE)
      .sort((a, b) => (a.fieldOrder ?? 0) - (b.fieldOrder ?? 0));
    const parts: string[] = [];
    for (const field of fields) {
      const answer = submission.payload?.[field.fieldName];
      if (answer === undefined || answer === null || answer === '') continue;
      // A password field is masked in the form it was typed into; printing it in a list of
      // submissions would put it back on screen in plain sight.
      const shown = field.fieldType === 'password'
        ? '••••••'
        : (Array.isArray(answer) ? answer.join(', ') : String(answer));
      parts.push(`${field.fieldLabel}: ${shown}`);
      if (parts.length === 3) break;
    }
    return parts.join(' · ') || '(no answers)';
  }

  /**
   * Writes a submission into a source task as its configuration. The form's own fields supply
   * the tag names, so this needs the version with fields rather than the list row.
   */
  useAsTaskConfig(submission: DynamicFormSubmission): void {
    const form = this.openForFields();
    if (!form) { this.toast.error('The form definition is still loading.'); return; }
    this.dialog.open<boolean>(SubmissionToTaskDialog, { data: { form, submission } })
      .closed.subscribe(saved => {
        if (saved) this.toast.success('The task now carries these answers as its payload.');
      });
  }

  clearFilters(): void { this.search.set(''); this.statusFilter.set(''); }
}
