import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpHeaders, HttpResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastService } from '../../shared/ui/toast.service';
import { FormSubmissions, SUBMISSIONS_READ, defaultForm } from './form-submissions';
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

function render(formId?: string, submissions: Submission[] = SUBMISSIONS, list?: () => Observable<unknown>) {
  try { localStorage.clear(); } catch { /* none */ }
  const api = {
    list: vi.fn(list ?? (() => of({ status: 'SUCCESS', message: '', data: FORMS }))),
    fetch: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { ...FORMS[0], fields: FIELDS } })),
    submissionsOf: vi.fn(() => of({ status: 'SUCCESS', message: '', data: submissions })),
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
    expect(render().api.submissionsOf).toHaveBeenCalledWith(1000, SUBMISSIONS_READ);
    const { api, screen } = render('1001');
    expect(api.list).toHaveBeenCalledWith(true);
    expect(api.submissionsOf).toHaveBeenCalledWith(1001, SUBMISSIONS_READ);
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
    expect(run.getAttribute('href')).toBe('/pipelines/schedules/2833/runs/7331');
    expect(rows[1].textContent).toContain('User 4537');
  });

  /** ZT-F4 (2026-10-21): a rejected submission said "Rejected" and nothing more, though the approver had to give a reason. */
  it('ZT-F4: says why a submission was rejected, in the approver\'s words', () => {
    const rejected: Submission = { submissionId: 5003, formId: 1000, formVersion: 2, status: 'Received', submittedBy: 4537,
      submittedByName: 'Nora Clinic', submittedAt: '2026-10-02T16:00:00Z', answers: { patient_id: 'P-19' },
      workflowInstanceId: 1548, workflowStatus: 'Rejected', workflowReason: 'The wound photo is missing.' };
    const { el } = render(undefined, [rejected]);
    const row = el.querySelector('tr[data-submission="5003"]') as HTMLElement;
    expect(row.querySelector('[data-rejected-reason]')?.textContent?.trim()).toBe('Rejected: The wound photo is missing.');
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

  // ZT-I34 (owner 2026-10-27): Core masks the personal answers for someone without See personal data, and says so.
  it('says when a submission\'s personal data is hidden from the reader', () => {
    const masked = [{ ...SUBMISSIONS[0], answers: { ...SUBMISSIONS[0].answers, patient_id: '\u2022\u2022\u2022' }, personalMasked: true }];
    const { screen, fixture, el } = render(undefined, masked);
    screen.toggle(5002);
    fixture.detectChanges();
    expect(el.querySelector('[data-test="personal-masked"]')?.textContent).toContain('Personal data is hidden for you');
    expect(screen.answerRows(masked[0])[0]).toEqual({ label: 'Patient ID', value: '\u2022\u2022\u2022' });
    const plain = render();
    plain.screen.toggle(5002);
    plain.fixture.detectChanges();
    expect(plain.el.querySelector('[data-test="personal-masked"]')).toBeNull();
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

describe('UI review U14: the form Submissions opens on', () => {
  const form = (formId: number, status: 'Draft' | 'Active' | 'Archived', submissions = 0) =>
    ({ formId, name: 'F' + formId, status, version: 1, fieldCount: 1, startsJob: false, submissions });
  it('is an Active form with submissions, else an Active one, never an archived one first', () => {
    expect(defaultForm([form(1, 'Archived', 9), form(2, 'Active'), form(3, 'Active', 4)])?.formId).toBe(3);
    expect(defaultForm([form(1, 'Archived', 9), form(2, 'Draft'), form(3, 'Active')])?.formId).toBe(3);
    expect(defaultForm([form(1, 'Archived', 9), form(2, 'Draft')])?.formId).toBe(2);
    expect(defaultForm([form(1, 'Archived', 9)])?.formId).toBe(1);
  });
});

describe('P2 #30: a capped submissions list says so', () => {
  it('counts the form in all and says the list is its newest 200', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]),
      { provide: FormsApi, useValue: { list: () => of({ status: 'SUCCESS', data: [] }) } }] });
    const screen = TestBed.createComponent(FormSubmissions).componentInstance;
    screen.forms.set([{ formId: 7, name: 'Intake', status: 'Active', version: 1, fieldCount: 1, startsJob: false, submissions: 1240 }]);
    screen.selected.set(7);
    screen.submissions.set(Array.from({ length: SUBMISSIONS_READ }, (_, i) => ({ submissionId: i + 1, status: 'Received' }) as never));
    expect(screen.capped()).toBe(true);
    expect(screen.kpis()[0]).toEqual(expect.objectContaining({ value: 1240, foot: 'the newest 200 below' }));
    expect(screen.kpis()[1].foot).toBe('of the newest 200');
  });
});

describe('Form submissions -- sorting (owner 2026-10-27)', () => {
  it('keeps the newest-first order until a heading is picked, then sorts by it both ways', () => {
    const { screen } = render();
    expect(screen.sortedRows().map(s => s.submissionId)).toEqual([5002, 5001]);
    screen.sort.toggle('id');
    expect(screen.sortedRows().map(s => s.submissionId)).toEqual([5002, 5001]);
    screen.sort.toggle('id');
    expect(screen.sortedRows().map(s => s.submissionId)).toEqual([5001, 5002]);
    expect(screen.sort.note).toBe(`Sorts the newest ${SUBMISSIONS_READ} shown`);
  });

  it('sorts a table answer by a column, numbers as numbers', () => {
    const { screen } = render();
    const rows = [{ item: 'Gauze', qty: 10 }, { item: 'Tape', qty: 9 }];
    // A column read from the data sorts A to Z (smallest first) on the first click, then the other way.
    screen.answerSort.toggle('qty');
    expect(screen.answerSort.apply(rows).map(r => r['qty'])).toEqual([9, 10]);
    screen.answerSort.toggle('qty');
    expect(screen.answerSort.apply(rows).map(r => r['qty'])).toEqual([10, 9]);
  });
});

describe('Form submissions -- loading, empty, error (owner 2026-10-27)', () => {
  it('is loading, with no "No forms yet", until the forms answer', () => {
    const { screen, el } = render(undefined, SUBMISSIONS, () => NEVER);
    expect(screen.formsLoading()).toBe(true);
    expect(el.querySelector('app-loading')).not.toBeNull();
    expect(el.textContent).not.toContain('No forms yet');
  });

  it('says there is no form once an empty list answers', () => {
    const { el } = render(undefined, SUBMISSIONS, () => of({ status: 'SUCCESS', message: '', data: [] }));
    expect(el.textContent).toContain('No forms yet');
  });

  it('says why the forms could not be read, and Try again clears it once they are read', () => {
    const { screen, api, fixture, el } = render(undefined, SUBMISSIONS, () => throwError(() => new HttpErrorResponse({ status: 500 })));
    expect(screen.formsLoading()).toBe(false);
    expect(screen.formsError()).toBe('The forms could not be read.');
    api.list.mockReturnValue(of({ status: 'SUCCESS', message: '', data: FORMS }) as never);
    (el.querySelector('app-load-error button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(screen.formsError()).toBe('');
    expect(screen.forms().length).toBe(2);
  });

  it('clears the last form\'s rows and loads again when another form is picked', () => {
    const { screen, api } = render();
    api.submissionsOf.mockReturnValueOnce(NEVER as never);
    screen.choose(1001);
    expect(screen.submissions()).toEqual([]);
    expect(screen.loading()).toBe(true);
  });
});
