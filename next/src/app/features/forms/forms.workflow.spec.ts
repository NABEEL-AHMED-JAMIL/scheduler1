import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { FormSubmissions } from './form-submissions';
import { FormsApi } from './forms.service';
import { DocumentsApi } from '../documents/documents.service';
import { FormSummary, Submission, approvalText, approvalTone, draftForSave } from './forms.model';
import { searchedText } from '../ask-data/ask-data.model';

/**
 * MIG-279 in the console: a form names its approval workflow; Submissions shows each submission's approval as the
 * request goes (Pending, Overdue, Approved, Rejected, or why it did not start) and opens the form's rows in Analytics
 * Studio for whoever holds that page; Ask your data says when it read forms' submissions.
 */
const FORM: FormSummary = { formId: 1001, name: 'Visit', status: 'Active', version: 1, fieldCount: 1, startsJob: false,
  workflowKey: 'approve-visit', fields: [{ key: 'patient', label: 'Patient', type: 'text', required: true },
    { key: 'photo', label: 'Photo', type: 'file', required: false }],
  dataset: { analyticsDatasetId: 77, name: 'Form: Visit', connection: 'wound-inbox', path: 'datasets/forms/form-1001/*.json' } };
const SUBMISSIONS: Submission[] = [
  { submissionId: 1004, formId: 1001, formVersion: 1, status: 'Received', workflowStatus: 'Overdue', workflowInstanceId: 3004,
    answers: { photo: [{ uploadId: 9, name: 'heel.png', bucket: 'wound-inbox', key: 'intake/forms/form-1001/uploads/x-heel.png' }] } },
  { submissionId: 1003, formId: 1001, formVersion: 1, status: 'Received', workflowStatus: 'Approved', workflowInstanceId: 3003, answers: {} },
  { submissionId: 1002, formId: 1001, formVersion: 1, status: 'Received', workflowStatus: 'NotStarted',
    workflowReason: 'There is no active workflow "approve-visit".', answers: {} },
];

const requestRead = vi.fn(() => of({ status: 'SUCCESS', message: 'Reading.', data: { ocrDocumentId: 1100 } }));

function render(canAnalyse: boolean) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: FormsApi, useValue: {
        list: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [FORM] })),
        fetch: vi.fn(() => of({ status: 'SUCCESS', message: '', data: FORM })),
        submissionsOf: vi.fn(() => of({ status: 'SUCCESS', message: '', data: SUBMISSIONS })),
      } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: AuthService, useValue: { canOpen: (page: string) => page !== 'analytics' || canAnalyse } },
      { provide: DocumentsApi, useValue: { requestRead } },
    ],
  });
  const fixture = TestBed.createComponent(FormSubmissions);
  fixture.componentRef.setInput('formId', '1001');
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function renderWithFixture() {
  render(true);
  return TestBed.inject(FormsApi);
}

describe('Forms -- approval and dataset', () => {
  it('shows each submission\'s approval, and why one did not start', () => {
    const el = render(true);
    const heads = Array.from(el.querySelectorAll('thead th')).map(th => th.textContent!.trim());
    expect(heads).toContain('Approval');
    const approvals = Array.from(el.querySelectorAll('[data-approval] .pill')).map(p => p.textContent!.trim());
    expect(approvals).toEqual(['Overdue', 'Approved', 'Not started']);
    // MIG-280: the stage beside it, a link to the request where there is one, the strip above, and the state filter.
    expect(el.querySelectorAll('[data-open-request]').length).toBe(2);
    expect(Array.from(el.querySelectorAll('thead th')).map(th => th.textContent!.trim())).toContain('Stage');
    expect(el.textContent).toContain('Awaiting approval');
    expect(el.querySelector('[data-approval="NotStarted"] .pill')!.getAttribute('title')).toContain('no active workflow');
  });

  it('narrows the list by state and by text', () => {
    render(true);
    const fixture = TestBed.createComponent(FormSubmissions);
    fixture.componentRef.setInput('formId', '1001');
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.state.set('Approved');
    expect(page.shownRows().map(s => s.submissionId)).toEqual([1003]);
    page.state.set('');
    page.search.set('heel');
    expect(page.shownRows().map(s => s.submissionId)).toEqual([1004]);
    expect(page.kpis().map(k => k.label)).toEqual(['Submissions', 'Awaiting approval', 'Approved', 'Overdue']);
  });

  it('opens the form\'s rows in Analytics Studio, only for someone who holds that page', () => {
    const link = render(true).querySelector('[data-open-analytics]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/data/analytics?connection=wound-inbox&path=datasets%2Fforms%2Fform-1001%2F*.json&name=Form:%20Visit');
    expect(render(false).querySelector('[data-open-analytics]')).toBeNull();
  });

  it('colours and names the statuses, and saves the workflow with the form', () => {
    expect(['Approved', 'Rejected', 'Overdue', 'Pending'].map(approvalTone)).toEqual(['ok', 'crit', 'warn', 'neutral']);
    expect(approvalText('NotStarted')).toBe('Not started');
    expect(draftForSave({ formId: 1, name: ' Visit ', description: '', status: 'Active', jobId: null, workflowKey: ' approve-visit ',
      fields: [] }).workflowKey).toBe('approve-visit');
    expect(draftForSave({ formId: 1, name: 'Visit', description: '', status: 'Active', jobId: null, workflowKey: '', fields: [] })
      .workflowKey).toBeNull();
  });

  it('sends an attached file to Document Intelligence where it is, and links to the reading', () => {
    renderWithFixture();
    const fixture = TestBed.createComponent(FormSubmissions);
    fixture.componentRef.setInput('formId', '1001');
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.toggle(1004);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-read-file]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(requestRead).toHaveBeenCalledWith('wound-inbox', 'intake/forms/form-1001/uploads/x-heel.png');
    expect(el.querySelector('[data-file] a')!.textContent).toContain('open Document Intelligence');
  });

  it('says when Ask your data read forms\' submissions', () => {
    expect(searchedText({ documents: 1, runOutputs: 2, forms: 1 })).toBe('1 document, 2 pipeline results and 1 form');
    expect(searchedText({ documents: 1, runOutputs: 2, forms: 0 })).toBe('1 document and 2 pipeline results');
  });
});
