import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { FormFill } from './form-fill';
import { FormsApi } from './forms.service';
import { FormField, FormSummary } from './forms.model';

/**
 * Wave 5 Forms (lite), Fill in: a member fills in an Active form. Wrong answers are marked before anything is sent, and
 * Core's own refusal lands at each field; a sent form says whether it started its run.
 */
const FIELDS: FormField[] = [
  { key: 'patient_id', label: 'Patient ID', type: 'text', required: true },
  { key: 'wound_location', label: 'Wound location', type: 'choice', required: true, options: ['Sacrum', 'Heel'] },
  { key: 'length_cm', label: 'Length (cm)', type: 'number', required: false },
  { key: 'infection_signs', label: 'Signs of infection', type: 'yesNo', required: true },
];
const FORM: FormSummary = { formId: 1000, name: 'Wound intake', description: 'Bedside assessment', status: 'Active', version: 2,
  fieldCount: 4, startsJob: true, fields: FIELDS };

function render(opts: { form?: FormSummary; submit?: unknown; fetchFails?: boolean } = {}) {
  const api = {
    fetch: vi.fn(() => opts.fetchFails ? throwError(() => ({ status: 403, error: { message: 'Form builder is not part of your access.' } }))
      : of({ status: 'SUCCESS', message: '', data: opts.form ?? FORM })),
    submit: vi.fn(() => of(opts.submit ?? { status: 'SUCCESS', message: 'Thank you: your submission was received and started run #7331.',
      data: { submissionId: 5001, formId: 1000, formVersion: 2, status: 'RunStarted', jobQueueId: 7331, answers: {} } })),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: FormsApi, useValue: api },
      { provide: AuthService, useValue: { canOpen: () => true, isTenantAdmin: () => false, canBuild: () => false, builderLocked: () => false } },
    ],
  });
  const fixture = TestBed.createComponent(FormFill);
  fixture.componentRef.setInput('formId', '1000');
  fixture.detectChanges();
  return { api, fixture, screen: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('Form fill', () => {
  it('opens the form by its id and draws every field in order', () => {
    const { api, el } = render();
    expect(api.fetch).toHaveBeenCalledWith(1000);
    expect(el.querySelector('h1')?.textContent).toContain('Wound intake');
    const keys = Array.from(el.querySelectorAll('[data-field]')).map(e => e.getAttribute('data-field'));
    expect(keys).toEqual(['patient_id', 'wound_location', 'length_cm', 'infection_signs']);
    expect(el.textContent).toContain('Submitting starts this form\'s pipeline.');
  });

  it('marks what is missing and sends nothing', () => {
    const { api, screen } = render();
    screen.change({ key: 'length_cm', value: 'three' });
    screen.send();
    expect(api.submit).not.toHaveBeenCalled();
    expect(screen.problems()).toEqual({
      patient_id: 'Patient ID is required.', wound_location: 'Wound location is required.', length_cm: 'Enter a number.',
      infection_signs: 'Signs of infection is required.',
    });
    expect(screen.message()).toBe('4 answers need attention.');
  });

  it('sends good answers as their types and says the run started', () => {
    const { api, screen, fixture, el } = render();
    screen.change({ key: 'patient_id', value: ' P-17 ' });
    screen.change({ key: 'wound_location', value: 'Heel' });
    screen.change({ key: 'length_cm', value: '2.5' });
    screen.change({ key: 'infection_signs', value: false });
    screen.send();
    expect(api.submit).toHaveBeenCalledWith(1000, { patient_id: 'P-17', wound_location: 'Heel', length_cm: 2.5, infection_signs: false });
    fixture.detectChanges();
    expect(el.querySelector('[data-submitted]')?.textContent).toContain('Run started #7331');
    screen.again();
    expect(screen.answers()).toEqual({});
  });

  it('shows Core\'s refusal at each field, word for word', () => {
    const { screen } = render({ submit: { status: 'ERROR', message: 'Wound location: choose one of Sacrum, Heel.',
      data: { problems: { wound_location: 'Wound location: choose one of Sacrum, Heel.' } } } });
    screen.change({ key: 'patient_id', value: 'P-17' });
    screen.change({ key: 'wound_location', value: 'Heel' });
    screen.change({ key: 'infection_signs', value: true });
    screen.send();
    expect(screen.problems()).toEqual({ wound_location: 'Wound location: choose one of Sacrum, Heel.' });
    expect(screen.done()).toBeNull();
  });

  it('keeps a submission whose run did not start, and says why', () => {
    const reason = 'The job was busy: a run of it was still in flight (\'Running\'), so this submission did not start another.';
    const { screen } = render({ submit: { status: 'SUCCESS', message: `Your submission was received, but it did not start its run: ${reason}`,
      data: { submissionId: 5002, formId: 1000, formVersion: 2, status: 'RunNotStarted', reason, answers: {} } } });
    screen.change({ key: 'patient_id', value: 'P-17' });
    screen.change({ key: 'wound_location', value: 'Heel' });
    screen.change({ key: 'infection_signs', value: true });
    screen.send();
    expect(screen.done()?.status).toBe('RunNotStarted');
    expect(screen.doneMessage()).toContain('busy');
  });

  it('refuses to send a form that is not Active, and says why a form cannot be opened', () => {
    const { api, screen } = render({ form: { ...FORM, status: 'Draft' } });
    screen.send();
    expect(api.submit).not.toHaveBeenCalled();
    expect(render({ fetchFails: true }).screen.error()).toBe('Form builder is not part of your access.');
  });
});
