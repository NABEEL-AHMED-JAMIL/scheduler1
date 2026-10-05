import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { TableShell } from '../../shared/ui/data-table';
import { LoadError } from '../../shared/ui/load-error';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { ToastService } from '../../shared/ui/toast.service';
import { FormField, FormSummary, Submission, UploadRef, answerText, approvalText, approvalTone, formsOf, submissionStatusText, submissionTone, submissionsOf } from './forms.model';
import { FormsApi } from './forms.service';
import { StatStrip, StatStripItem } from '../../shared/ui/stat-strip';
import { DocumentsApi } from '../documents/documents.service';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Forms › Submissions (Wave 5 Forms lite; page 'form-submissions'): what a form collected, newest first -- who sent it
 * and when, and what it did: Received (the form starts nothing), Run started (the run, linked to its log) or Run not
 * started (why: the job was busy, paused, the workspace has no inbox ...). One submission opens with its answers; the
 * whole list exports as CSV. The form is chosen here, or arrives as ?formId= from the builder.
 */
interface AnswerRow {
  label: string;
  value: string;
  table?: { columns: FormField[]; rows: Record<string, unknown>[] };
  /** A file field's files, each of which can be read with Document Intelligence (MIG-279). */
  files?: UploadRef[];
}

/** How many submissions the page reads: the newest, as the service lists them. */
export const SUBMISSIONS_READ = 200;

/** The form the page opens on when the address names none. */
export function defaultForm(forms: FormSummary[]): FormSummary | undefined {
  return forms.find(f => f.status === 'Active' && (f.submissions ?? 0) > 0) ?? forms.find(f => f.status === 'Active')
    ?? forms.find(f => f.status !== 'Archived') ?? forms[0];
}

@Component({
  selector: 'app-form-submissions',
  imports: [StatStrip, Icon, TableShell, LoadError, ServerTimePipe, RouterLink],
  templateUrl: './form-submissions.html',
})
export class FormSubmissions implements OnInit {
  private readonly api = inject(FormsApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** ?formId= -- the form to open first. */
  readonly formId = input<string | undefined>(undefined);

  readonly forms = signal<FormSummary[]>([]);
  readonly formsLoading = signal(true);
  readonly formsError = signal('');
  readonly selected = signal<number | null>(null);
  readonly form = signal<FormSummary | null>(null);
  private readonly auth = inject(AuthService);
  /** Analytics Studio is a page of its own: the button shows only for someone who holds it. */
  readonly canAnalyse = computed(() => this.auth.canOpen('analytics'));
  private readonly documents = inject(DocumentsApi);
  /** Document Intelligence is a page of its own: its button shows only for someone who holds it. */
  readonly canRead = computed(() => this.auth.canOpen('document-intelligence'));
  /** Files sent to Document Intelligence on this page, by storage key: reading, or why not. */
  readonly reads = signal<Record<string, 'reading' | 'sent' | string>>({});
  readonly approvalTone = approvalTone;
  readonly approvalText = approvalText;
  /** MIG-279: an Approval column when the form starts a workflow, or any submission has a status from one. */
  readonly hasApproval = computed(() => !!this.form()?.workflowKey || this.submissions().some(s => !!s.workflowStatus));
  /** MIG-280: narrowing the list -- by state (approval, else the run) and by text (who, number, answers). */
  readonly state = signal('');
  readonly search = signal('');
  readonly canOpenRequests = computed(() => this.auth.canOpen('task-inbox'));
  readonly states = computed<{ value: string; label: string }[]>(() => this.hasApproval()
    ? [{ value: 'Pending', label: 'Awaiting approval' }, { value: 'Overdue', label: 'Overdue' }, { value: 'Approved', label: 'Approved' },
       { value: 'Rejected', label: 'Rejected' }, { value: 'NotStarted', label: 'Approval not started' }]
    : [{ value: 'Received', label: 'Received' }, { value: 'RunStarted', label: 'Run started' }, { value: 'RunNotStarted', label: 'Run not started' }]);
  readonly shownRows = computed(() => {
    const state = this.state();
    const text = this.search().trim().toLowerCase();
    return this.submissions().filter(s => (!state || s.workflowStatus === state || s.status === state)
      && (!text || [String(s.submissionId), this.submitter(s), s.workflowStage ?? '', JSON.stringify(s.answers)].some(v => v.toLowerCase().includes(text))));
  });
  /**
   * P2 #30: the list reads the newest 200. The form's own count says how many there are in all, so a capped list
   * says "the newest 200 of 1,240" instead of passing 200 off as the total; the other tiles and the search cover
   * the 200 and say so.
   */
  readonly totalSubmissions = computed(() => Math.max(this.form()?.submissions ?? 0,
    this.forms().find(f => f.formId === this.selected())?.submissions ?? 0, this.submissions().length));
  readonly capped = computed(() => this.submissions().length >= SUBMISSIONS_READ && this.totalSubmissions() > this.submissions().length);
  /** The strip above the list: the form's latest submissions at a glance. */
  readonly kpis = computed<StatStripItem[]>(() => {
    const rows = this.submissions();
    const count = (pick: (s: Submission) => boolean) => rows.filter(pick).length;
    const capped = this.capped();
    const all: StatStripItem = { label: 'Submissions', value: this.totalSubmissions(), icon: 'inbox',
      foot: capped ? `the newest ${rows.length.toLocaleString('en-US')} below` : 'all of them' };
    const within = (item: StatStripItem): StatStripItem => capped && !item.foot ? { ...item, foot: `of the newest ${rows.length}` } : item;
    if (this.hasApproval()) {
      return ([all,
        { label: 'Awaiting approval', value: count(s => s.workflowStatus === 'Pending'), icon: 'clock', tone: 'warn' },
        { label: 'Approved', value: count(s => s.workflowStatus === 'Approved' || s.workflowStatus === 'Completed'), icon: 'checkCircle', tone: 'ok' },
        { label: 'Overdue', value: count(s => s.workflowStatus === 'Overdue'), icon: 'alert', tone: 'crit',
          foot: count(s => s.workflowStatus === 'Rejected') + ' rejected' }] as StatStripItem[]).map((item, i) => i ? within(item) : item);
    }
    return ([all,
      { label: 'Run started', value: count(s => s.status === 'RunStarted'), icon: 'play', tone: 'ok' },
      { label: 'Run not started', value: count(s => s.status === 'RunNotStarted'), icon: 'alert', tone: 'crit' },
      { label: 'Kept only', value: count(s => s.status === 'Received'), icon: 'inbox' }] as StatStripItem[]).map((item, i) => i ? within(item) : item);
  });
  readonly submissions = signal<Submission[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly open = signal<number | null>(null);
  readonly exporting = signal(false);

  readonly opened = computed(() => this.submissions().find(s => s.submissionId === this.open()) ?? null);
  readonly statusText = submissionStatusText;
  readonly tone = submissionTone;

  ngOnInit(): void {
    this.formsLoading.set(true);
    this.api.list(true).subscribe({
      next: r => {
        this.formsLoading.set(false);
        if (r.status !== API_SUCCESS) { this.formsError.set(r.message); return; }
        const forms = formsOf(r.data);
        this.forms.set(forms);
        const wanted = Number(this.formId());
        // With no form asked for, an Active one that has submissions, else any Active one, before a draft or an
        // archived form (UI review U14: the page opened on an archived form).
        const first = forms.find(f => f.formId === wanted) ?? defaultForm(forms);
        if (first) this.choose(first.formId);
      },
      error: err => { this.formsLoading.set(false); this.formsError.set(err?.error?.message || 'The forms could not be read.'); },
    });
  }

  choose(formId: number): void {
    this.selected.set(formId);
    this.open.set(null);
    void this.router.navigate([], { queryParams: { formId }, replaceUrl: true });
    this.api.fetch(formId).subscribe({
      next: r => this.form.set(r.status === API_SUCCESS && r.data ? r.data : this.forms().find(f => f.formId === formId) ?? null),
      error: () => this.form.set(this.forms().find(f => f.formId === formId) ?? null),
    });
    this.load();
  }

  load(): void {
    const formId = this.selected();
    if (!formId) return;
    this.loading.set(true);
    this.error.set('');
    this.api.submissionsOf(formId, SUBMISSIONS_READ).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message); return; }
        this.submissions.set(submissionsOf(r.data));
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'The submissions could not be read.'); },
    });
  }

  toggle(submissionId: number): void {
    this.open.update(o => (o === submissionId ? null : submissionId));
  }

  /**
   * The answers of a submission, in the order of the version it answered (MIG-277: that version's fields, when it is
   * not the form's current one), then any to fields not in it (by key). A table's rows come with its columns.
   */
  answerRows(s: Submission): AnswerRow[] {
    const fields = s.fields ?? this.form()?.fields ?? [];
    const rows: AnswerRow[] = fields.map(f => {
      const value = s.answers[f.key];
      if (f.type === 'file' && Array.isArray(value) && value.length) {
        return { label: f.label, value: answerText(f, value), files: value as UploadRef[] };
      }
      if (f.type === 'table' && Array.isArray(value) && value.length) {
        return { label: f.label, value: answerText(f, value), table: { columns: f.columns ?? [], rows: value as Record<string, unknown>[] } };
      }
      return { label: f.label, value: answerText(f, value) };
    });
    for (const key of Object.keys(s.answers)) {
      if (!fields.some(f => f.key === key)) rows.push({ label: key, value: answerText(undefined, s.answers[key]) });
    }
    return rows;
  }

  /** Asks Document Intelligence to read one attached file where it is (its bucket and key); the result is on its page. */
  readWithIntelligence(file: UploadRef): void {
    if (!file.bucket || !file.key || this.reads()[file.key] === 'reading') return;
    const key = file.key;
    this.reads.update(r => ({ ...r, [key]: 'reading' }));
    this.documents.requestRead(file.bucket, key).subscribe({
      next: r => {
        this.reads.update(m => ({ ...m, [key]: r.status === API_SUCCESS ? 'sent' : r.message || 'It could not be read.' }));
        if (r.status === API_SUCCESS) this.toast.success(`${file.name} is being read by Document Intelligence.`);
      },
      error: err => this.reads.update(m => ({ ...m, [key]: err?.error?.message || 'It could not be read. Try again.' })),
    });
  }

  cell(column: FormField, value: unknown): string {
    return answerText(column, value);
  }

  submitter(s: Submission): string {
    return s.submittedByName || (s.submittedBy ? `User ${s.submittedBy}` : '—');
  }

  exportCsv(): void {
    const formId = this.selected();
    if (!formId || this.exporting()) return;
    this.exporting.set(true);
    this.api.exportCsv(formId).subscribe({
      next: response => {
        this.exporting.set(false);
        const body = response.body;
        if (!body) { this.toast.error('The export was empty.'); return; }
        const disposition = response.headers.get('Content-Disposition') ?? '';
        const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? `form-${formId}-submissions.csv`;
        const url = URL.createObjectURL(body);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: err => { this.exporting.set(false); this.toast.error(err?.status === 404 ? 'Form not found.' : 'The export did not download. Try again.'); },
    });
  }
}
