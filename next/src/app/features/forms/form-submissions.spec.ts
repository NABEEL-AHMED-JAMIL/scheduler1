import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpHeaders, HttpResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ToastService } from '../../shared/ui/toast.service';
import { FormSubmissions } from './form-submissions';
import { FormsApi } from './forms.service';
import { FormField, FormSummary, Submission } from './forms.model';

/**
 * Wave 5 Forms (lite), Submissions: a form's submissions, newest first, each with who, when and what it did -- Received,
 * Run started (linked to the run's log) or Run not started (why) -- its answers on demand, and the list as CSV.
 */
const FIELDS: FormField[] = [
  { key: 'patient_id', label: 'Patient ID', type: 'text', required: true },
  { key: 'infection_signs', label: 'Signs of infection', type: 'yesNo', required: true },
];
const FORMS: FormSummary[] = [
  { formId: 1000, name: 'Wound intake', status: 'Active', version: 2, fieldCount: 2, startsJob: true },
  { formId: 1001, name: 'Old intake', status: 'Archived', version: 1, fieldCount: 1, startsJob: false },
];
const SUBMISSIONS: Submission[] = [
  { submissionId: 5002, formId: 1000, formVersion: 2, status: 'RunNotStarted', jobId: 2833, reason: 'The job was busy.',
    submittedBy: 4537, submittedByName: 'nora@clinic.example', submittedAt: '2026-10-02T15:04:05Z',
    answers: { patient_id: 'P-18', infection_signs: true, removed_field: 'kept' } },
  { submissionId: 5001, formId: 1000, formVersion: 2, status: 'RunStarted', jobId: 2833, jobQueueId: 7331, bucket: 'clinic-inbox',
    storageKey: 'intake/forms/form-1000/2026/10/02/submission-5001.json', submittedBy: 4537, submittedAt: '2026-10-02T15:00:00Z',
    answers: { patient_id: 'P-17', infection_signs: false } },
];

function render(formId?: string) {
  const api = {
    list: vi.fn(() => of({ status: 'SUCCESS', message: '', data: FORMS })),
    fetch: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { ...FORMS[0], fields: FIELDS } })),
    submissionsOf: vi.fn(() => of({ status: 'SUCCESS', message: '', data: SUBMISSIONS })),
    exportCsv: vi.fn(() => of(new HttpResponse({ body: new Blob(['a,b']),
      headers: new HttpHeaders({ 'Content-Disposition': 'attachment; filename="wound-intake-submissions-2026-10-02.csv"' }) }))),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: FormsApi, useValue: api },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(FormSubmissions);
  if (formId) fixture.componentRef.setInput('formId', formId);
  fixture.detectChanges();
  return { api, fixture, screen: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('Form submissions', () => {
  it('opens the first form, or the one the address names, with its submissions newest first', () => {
    expect(render().api.submissionsOf).toHaveBeenCalledWith(1000);
    const { api, screen } = render('1001');
    expect(api.list).toHaveBeenCalledWith(true);
    expect(api.submissionsOf).toHaveBeenCalledWith(1001);
    expect(screen.selected()).toBe(1001);
  });

  it('says what each submission did: the run it started, linked to its log, or why not', () => {
    const { el } = render();
    const rows = Array.from(el.querySelectorAll('tr[data-submission]'));
    expect(rows.map(r => r.getAttribute('data-submission'))).toEqual(['5002', '5001']);
    expect(rows[0].textContent).toContain('Run not started');
    expect(rows[0].textContent).toContain('The job was busy.');
    expect(rows[0].textContent).toContain('nora@clinic.example');
    const run = rows[1].querySelector('a.pill') as HTMLAnchorElement;
    expect(run.textContent).toContain('Run started #7331');
    expect(run.getAttribute('href')).toBe('/pipelines/schedules/2833/runs/7331/logs');
    expect(rows[1].textContent).toContain('User 4537');
  });

  it('opens a submission\'s answers in the form\'s order, a removed field\'s under its key', () => {
    const { screen, fixture, el } = render();
    screen.toggle(5002);
    fixture.detectChanges();
    expect(screen.answerRows(SUBMISSIONS[0])).toEqual([
      { label: 'Patient ID', value: 'P-18' }, { label: 'Signs of infection', value: 'Yes' }, { label: 'removed_field', value: 'kept' },
    ]);
    expect(el.querySelector('dl[aria-label="Answers of submission 5002"]')?.textContent).toContain('P-18');
    screen.toggle(5002);
    expect(screen.opened()).toBeNull();
  });

  it('downloads the CSV under the name Core gives it', () => {
    const { api, screen } = render();
    const created = vi.fn(() => 'blob:csv');
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = created as never;
    URL.revokeObjectURL = vi.fn() as never;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    try {
      screen.exportCsv();
      expect(api.exportCsv).toHaveBeenCalledWith(1000);
      expect(created).toHaveBeenCalled();
      expect(click).toHaveBeenCalled();
      expect((click.mock.instances[0] as unknown as HTMLAnchorElement).download).toBe('wound-intake-submissions-2026-10-02.csv');
    } finally {
      URL.createObjectURL = original.create;
      URL.revokeObjectURL = original.revoke;
      click.mockRestore();
    }
  });
});
