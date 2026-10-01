import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { FormFill } from './form-fill';
import { FormsApi } from './forms.service';
import {
  Answers, FormDraft, FormField, FormSummary, answerProblems, answerText, answersForSubmit, definitionProblems, draftForSave, holds,
  ruleText, visibleFields,
} from './forms.model';

/**
 * MIG-277 in the console: tables, files, signatures, lookups and show/required rules -- checked here the way Core checks
 * them (FormFields), hidden fields neither asked nor sent, and files uploaded as they are chosen.
 */
const VISIT: FormField[] = [
  { key: 'patient', label: 'Patient', type: 'lookup', required: true, lookup: { formId: 900, field: 'patient_id' } },
  { key: 'infected', label: 'Infected', type: 'yesNo', required: true },
  { key: 'antibiotic', label: 'Antibiotic', type: 'text', required: false,
    showWhen: { field: 'infected', op: 'eq', value: true }, requiredWhen: { field: 'infected', op: 'eq', value: true } },
  { key: 'doses', label: 'Doses', type: 'table', required: false, maxRows: 2,
    columns: [{ key: 'drug', label: 'Drug', type: 'text', required: true }, { key: 'mg', label: 'mg', type: 'number', required: false }] },
  { key: 'photo', label: 'Photo', type: 'file', required: false, accept: ['jpg'], maxSizeMb: 5, maxFiles: 2 },
  { key: 'signed', label: 'Signature', type: 'signature', required: true },
];
const LOOKUPS = { patient: ['P-100', 'P-200'] };

describe('Forms -- rules', () => {
  it('reads yes/no, numbers, dates and words the way Core does', () => {
    expect(holds({ field: 'a', op: 'eq', value: true }, { a: true })).toBe(true);
    expect(holds({ field: 'a', op: 'gt', value: '10' }, { a: '12' })).toBe(true);
    expect(holds({ field: 'a', op: 'lt', value: '2026-10-01' }, { a: '2026-09-30' })).toBe(true);
    expect(holds({ field: 'a', op: 'in', value: ['sacrum', 'heel'] }, { a: 'Heel' })).toBe(true);
    expect(holds({ field: 'a', op: 'ne', value: 'x' }, {})).toBe(true);
    expect(holds({ field: 'a', op: 'filled' }, { a: [] })).toBe(false);
  });

  it('asks a field only while its rule holds, and says the rule in words', () => {
    expect(visibleFields(VISIT, { infected: false }).map(f => f.key)).not.toContain('antibiotic');
    expect(visibleFields(VISIT, { infected: true }).map(f => f.key)).toContain('antibiotic');
    expect(ruleText(VISIT[2].showWhen, VISIT)).toBe('Infected is Yes');
  });
});

describe('Forms -- the new types', () => {
  const base = (): Answers => ({
    patient: 'p-100', infected: false, antibiotic: 'left over',
    doses: [{ drug: 'Paracetamol', mg: '500' }, { drug: '', mg: '' }],
    photo: [{ uploadId: 11, name: 'wound.jpg' }], signed: { uploadId: 21, name: 'signature.png' },
  });

  it('sends rows as values, files and a signature by upload id, and nothing for a hidden field', () => {
    expect(answerProblems(VISIT, base(), LOOKUPS)).toEqual({});
    expect(answersForSubmit(VISIT, base())).toEqual({
      patient: 'p-100', infected: false, doses: [{ drug: 'Paracetamol', mg: 500 }], photo: [11], signed: 21,
    });
  });

  it('names what is wrong: a required rule, a row, too many files, a value not offered, no signature', () => {
    const wrong: Answers = { ...base(), infected: true, antibiotic: '', patient: 'P-999', signed: null,
      doses: [{ drug: '', mg: 'lots' }], photo: [{ uploadId: 1, name: 'a' }, { uploadId: 2, name: 'b' }, { uploadId: 3, name: 'c' }] };
    expect(answerProblems(VISIT, wrong, LOOKUPS)).toEqual({
      patient: 'Choose one of the listed values.',
      antibiotic: 'Antibiotic is required.',
      doses: 'Row 1: Drug is required.',
      photo: 'Attach at most 2 files.',
      signed: 'Signature is required.',
    });
  });

  it('reads the new answers back in words', () => {
    expect(answerText(VISIT[3], [{ drug: 'A' }, { drug: 'B' }])).toBe('2 rows');
    expect(answerText(VISIT[4], [{ uploadId: 1, name: 'a.jpg' }, { uploadId: 2, name: 'b.jpg' }])).toBe('a.jpg, b.jpg');
    expect(answerText(VISIT[5], { uploadId: 3, name: 'signature.png' })).toBe('Signed');
  });

  it('checks a definition the way Core does, and saves only what each type uses', () => {
    const draft: FormDraft = { formId: null, name: 'Visit', description: '', status: 'Draft', jobId: null, fields: VISIT };
    expect(definitionProblems(draft)).toEqual({});
    const broken: FormDraft = { ...draft, fields: [
      { key: 'a', label: 'A', type: 'table', required: false, columns: [] },
      { key: 'b', label: 'B', type: 'file', required: false, accept: ['exe'] },
      { key: 'c', label: 'C', type: 'lookup', required: false, lookup: { formId: null, field: '' } },
      { key: 'd', label: 'D', type: 'text', required: false, showWhen: { field: 'e', op: 'eq', value: 'x' } },
      { key: 'e', label: 'E', type: 'text', required: false, showWhen: { field: 'a', op: 'eq', value: 'x' } },
    ] };
    expect(definitionProblems(broken)).toEqual({
      '0': 'A table needs at least one column.',
      '1': '\'exe\' files cannot be accepted.',
      '2': 'Pick the form and the field whose answers it offers.',
      '3': 'It can be shown only by a field above it.',
      '4': 'A table field can only be tested for answered or not.',
    });
    const sent = draftForSave(draft).fields;
    expect(sent[2].showWhen).toEqual({ field: 'infected', op: 'eq', value: true });
    expect(sent[3]).toMatchObject({ maxRows: 2, columns: [{ key: 'drug', type: 'text', required: true, options: null }, { key: 'mg' }] });
    expect(sent[4]).toMatchObject({ accept: ['jpg'], maxSizeMb: 5, maxFiles: 2 });
    // MIG-271: "send to Document Intelligence" is sent only when on, so a form saved before it reads as it did.
    expect('toDocuments' in sent[4]).toBe(false);
    const toDocuments = { ...draft, fields: draft.fields.map((f, i) => i === 4 ? { ...f, toDocuments: true } : f) };
    expect(draftForSave(toDocuments).fields[4].toDocuments).toBe(true);
    expect(sent[0].lookup).toEqual({ formId: 900, field: 'patient_id' });
    expect('columns' in sent[1]).toBe(false);
  });
});

describe('Forms -- filling in the new types', () => {
  const FORM: FormSummary = { formId: 1001, name: 'Visit', status: 'Active', version: 1, fieldCount: VISIT.length, startsJob: false,
    fields: VISIT, lookupValues: LOOKUPS };

  function render() {
    const api = {
      fetch: vi.fn(() => of({ status: 'SUCCESS', message: '', data: FORM })),
      upload: vi.fn((_: number, field: string, __: Blob, name: string) =>
        of({ status: 'SUCCESS', message: 'Uploaded.', data: { uploadId: field === 'signed' ? 21 : 11, name, size: 2048 } })),
      submit: vi.fn(() => of({ status: 'SUCCESS', message: 'Thank you.', data: { submissionId: 5002, formId: 1001, formVersion: 1,
        status: 'Received', answers: {} } })),
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
    fixture.componentRef.setInput('formId', '1001');
    fixture.detectChanges();
    return { api, fixture, page: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('offers the lookup\'s values, adds table rows, and shows a rule\'s field only when it holds', () => {
    const { page, fixture, el } = render();
    const options = Array.from(el.querySelectorAll('[data-field="patient"] option')).map(o => o.textContent!.trim());
    expect(options).toEqual(['Choose…', 'P-100', 'P-200']);
    expect(el.querySelector('[data-field="antibiotic"]')).toBeNull();
    page.change({ key: 'infected', value: true });
    fixture.detectChanges();
    expect(el.querySelector('[data-field="antibiotic"]')).not.toBeNull();
    (el.querySelector('[data-add-row]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-field="doses"] tbody tr')).toHaveLength(1);
  });

  it('uploads each chosen file and a drawn signature, then sends them by id', () => {
    const { api, page } = render();
    const file = new File(['jpeg'], 'wound.jpg', { type: 'image/jpeg' });
    page.uploadFiles({ key: 'photo', files: [file] });
    page.uploadSignature('signed', new Blob(['png'], { type: 'image/png' }));
    expect(api.upload).toHaveBeenCalledWith(1001, 'photo', file, 'wound.jpg');
    expect(api.upload).toHaveBeenCalledWith(1001, 'signed', expect.any(Blob), 'signature.png');
    page.change({ key: 'patient', value: 'P-200' });
    page.change({ key: 'infected', value: false });
    page.send();
    expect(api.submit).toHaveBeenCalledWith(1001, { patient: 'P-200', infected: false, photo: [11], signed: 21 });
  });

  it('refuses more files than the field takes, before uploading them', () => {
    const { api, page } = render();
    const files = ['a', 'b', 'c'].map(n => new File(['x'], `${n}.jpg`));
    page.uploadFiles({ key: 'photo', files });
    expect(api.upload).toHaveBeenCalledTimes(2);
    expect(page.problems()['photo']).toBe('Photo takes at most 2 file(s).');
  });
});
