import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { JobEdit } from './job-edit';
import { ToastService } from '../../../shared/ui/toast.service';

/**
 * MIG-364: the schedule editor's second Event start -- run when a document of one type is approved (Core's
 * sourceJob.json/documentTrigger). Like the inbox trigger it is saved after the job, only when it changed, and switching
 * it off keeps the type (saved as a trigger that is off).
 */
const JOB = { jobId: 2848, jobName: 'UI-CHECK steps job', execution: 'Manual', priority: 1, jobStatus: 'Active',
  taskDetail: { taskDetailId: 1864 } };
const TYPES = { status: 'SUCCESS', data: [
  { documentTypeId: 1007, name: 'Intake form', status: 'Active', builtIn: false, typeKey: 'intake', currentVersion: 2 },
  { documentTypeId: 1008, name: 'Referral letter', status: 'Inactive', builtIn: false, typeKey: 'referral', currentVersion: 1 },
] };
const ON = { status: 'SUCCESS', data: { jobId: 2848, configured: true, enabled: true, documentTypeId: 1007, batchSize: 1, waiting: 0 } };

interface Call { method: string; path: string; params?: Record<string, string>; body?: any }

function editor(answers: Record<string, unknown>, id = '2848', saveAnswer: unknown = { status: 'SUCCESS', message: 'SourceJob saved.' }, whenApproved = '') {
  const calls: Call[] = [];
  const errors: unknown[] = [];
  const navigations: unknown[] = [];
  const path = (url: string) => url.replace(/^.*\/api\/v1/, '');
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: {
      get: (url: string, options?: { params?: Record<string, string> }) => {
        calls.push({ method: 'GET', path: path(url), params: options?.params });
        return of(answers[path(url)] ?? { status: 'SUCCESS', data: [] });
      },
      post: (url: string, body: unknown) => {
        if (url.includes('listSourceTask')) return of({ status: 'SUCCESS', data: [] });
        calls.push({ method: 'POST', path: path(url), body });
        return of(path(url).includes('SourceJob') ? saveAnswer : (answers['POST ' + path(url)] ?? { status: 'SUCCESS', message: 'Saved.' }));
      },
      put: (url: string, body: unknown) => { calls.push({ method: 'PUT', path: path(url), body }); return of(saveAnswer); },
    } },
    { provide: ToastService, useValue: { success: () => {}, error: (m: unknown) => errors.push(m), info: () => {} } },
    { provide: Router, useValue: { navigate: (to: unknown) => navigations.push(to) } },
  ] });
  const component = TestBed.runInInjectionContext(() => new JobEdit());
  (component as any).jobId = () => id;
  (component as any).whenApproved = () => whenApproved;
  component.ngOnInit();
  return { component, calls, errors, navigations };
}

const writes = (calls: Call[]) => calls.filter(c => c.method !== 'GET').map(c => c.path);
const typeReads = (calls: Call[]) => calls.filter(c => c.path === '/documentType.json/fetchAll').length;

describe('JobEdit: the document start (MIG-364)', () => {
  it('reads the job\'s document trigger and the workspace\'s types to choose from', () => {
    const { component, calls } = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
      '/sourceJob.json/documentTrigger': { ...ON, data: { ...ON.data, batchSize: 5 } },
      '/documentType.json/fetchAll': TYPES,
    });
    expect(calls.find(c => c.path === '/sourceJob.json/documentTrigger')?.params).toEqual({ jobId: '2848' });
    expect(component.onApproval()).toBe(true);
    expect(component.documentTypeId()).toBe(1007);
    expect(component.documentBatch()).toBe(5);
    expect(component.documentTypeOptions()).toEqual([
      { id: 1007, label: 'Intake form' }, { id: 1008, label: 'Referral letter (inactive)' }]);
    expect(component.documentTypeLabel()).toBe('Intake form');
  });

  /** Owner 2026-10-20 (§0.1): Document types' "Set it on a schedule" opens a new schedule with the type's start on. */
  it('starts a new schedule on a document type\'s approval when the link names the type', () => {
    const { component, calls } = editor({ '/documentType.json/fetchAll': TYPES }, '', undefined, '1007');
    expect(component.onApproval()).toBe(true);
    expect(component.documentTypeId()).toBe(1007);
    expect(typeReads(calls)).toBe(1);
    expect(component.documentTypeLabel()).toBe('Intake form');
    const plain = editor({ '/documentType.json/fetchAll': TYPES }, '', undefined, 'not-a-number');
    expect(plain.component.onApproval()).toBe(false);
  });

  it('reads the types once, and only when the document start is shown', () => {
    const { component, calls } = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
      '/sourceJob.json/documentTrigger': { status: 'SUCCESS', data: { jobId: 2848, configured: false, waiting: 0 } },
      '/documentType.json/fetchAll': TYPES,
    });
    expect(component.onApproval()).toBe(false);
    expect(typeReads(calls)).toBe(0);
    component.setOnApproval(true);
    component.setOnApproval(false);
    component.setOnApproval(true);
    expect(typeReads(calls)).toBe(1);
  });

  it('keeps a saved type the workspace no longer has, by its id', () => {
    const { component } = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
      '/sourceJob.json/documentTrigger': { ...ON, data: { ...ON.data, documentTypeId: 1099 } },
      '/documentType.json/fetchAll': TYPES,
    });
    expect(component.documentTypeOptions().at(-1)).toEqual({ id: 1099, label: 'Document type 1099 (not in this workspace)' });
  });

  it('saves nothing extra when the document trigger did not change', () => {
    const { component, calls, navigations } = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
      '/sourceJob.json/documentTrigger': ON,
      '/documentType.json/fetchAll': TYPES,
    });
    component.save();
    expect(writes(calls)).toEqual(['/sourceJob.json/updateSourceJob']);
    expect(navigations).toEqual([['/pipelines/schedules']]);
  });

  it('turns the trigger on with its type, after the job is saved', () => {
    const { component, calls } = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
      '/sourceJob.json/documentTrigger': { status: 'SUCCESS', data: { jobId: 2848, configured: false, waiting: 0 } },
      '/documentType.json/fetchAll': TYPES,
    });
    component.setOnApproval(true);
    component.pickDocumentType('1007');
    component.save();
    expect(writes(calls)).toEqual(['/sourceJob.json/updateSourceJob', '/sourceJob.json/documentTrigger/save']);
    expect(calls.at(-1)!.body).toEqual({ jobId: 2848, enabled: true, documentTypeId: 1007 });
  });

  it('saves another type, and the documents per run only when it changed', () => {
    const { component, calls } = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
      '/sourceJob.json/documentTrigger': ON,
      '/documentType.json/fetchAll': TYPES,
    });
    component.pickDocumentType('1008');
    component.save();
    expect(calls.at(-1)!.body).toEqual({ jobId: 2848, enabled: true, documentTypeId: 1008 });
    component.documentBatch.set('10');
    component.save();
    expect(calls.at(-1)!.body).toEqual({ jobId: 2848, enabled: true, documentTypeId: 1008, batchSize: 10 });
  });

  it('turns it off without forgetting the type', () => {
    const { component, calls } = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
      '/sourceJob.json/documentTrigger': ON,
      '/documentType.json/fetchAll': TYPES,
    });
    component.setOnApproval(false);
    component.save();
    expect(calls.at(-1)).toMatchObject({ path: '/sourceJob.json/documentTrigger/save',
      body: { jobId: 2848, enabled: false, documentTypeId: 1007 } });
  });

  it('does not save a trigger that is off and was off', () => {
    const { component, calls } = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
      '/sourceJob.json/documentTrigger': { ...ON, data: { ...ON.data, enabled: false } },
    });
    expect(component.onApproval()).toBe(false);
    component.save();
    expect(writes(calls)).toEqual(['/sourceJob.json/updateSourceJob']);
  });

  it('refuses the start without a type, or documents per run outside 1..50, before saving anything', () => {
    const { component, calls, errors } = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
      '/documentType.json/fetchAll': TYPES,
    });
    component.setOnApproval(true);
    component.save();
    expect(writes(calls)).toEqual([]);
    expect(errors[0]).toContain('Choose the document type');
    component.pickDocumentType('1007');
    component.documentBatch.set('51');
    component.save();
    expect(writes(calls)).toEqual([]);
    expect(errors[1]).toContain('Documents per run is a whole number from 1 to 50');
  });

  it('sets the trigger on a new job, by the id its creation answers with', () => {
    const { component, calls } = editor({ '/documentType.json/fetchAll': TYPES }, '',
      { status: 'SUCCESS', message: 'Job save with jobId 2901.' });
    expect(calls.some(c => c.path === '/sourceJob.json/documentTrigger')).toBe(false);
    component.form.patchValue({ jobName: 'x', taskDetailId: 7, executionType: 'Manual' });
    component.setOnApproval(true);
    component.pickDocumentType('1007');
    component.save();
    expect(writes(calls)).toEqual(['/sourceJob.json/addSourceJob', '/sourceJob.json/documentTrigger/save']);
    expect(calls.at(-1)!.body).toEqual({ jobId: 2901, enabled: true, documentTypeId: 1007 });
  });

  it('says the job was saved but the trigger was not, in Core\'s words, and stays', () => {
    const { component, errors, navigations } = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
      '/documentType.json/fetchAll': TYPES,
      'POST /sourceJob.json/documentTrigger/save': { status: 'ERROR', message: 'There is no document type 1007 in this workspace.' },
    });
    component.setOnApproval(true);
    component.pickDocumentType('1007');
    component.save();
    expect(errors[0]).toContain('There is no document type 1007 in this workspace.');
    expect(navigations).toEqual([]);
    expect(component.saving()).toBe(false);
  });

  it('saves the inbox and the document triggers together when both changed', () => {
    const { component, calls } = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
      '/documentType.json/fetchAll': TYPES,
    });
    component.onArrival.set(true);
    component.setOnApproval(true);
    component.pickDocumentType('1007');
    component.save();
    expect(writes(calls)).toEqual(['/sourceJob.json/updateSourceJob', '/sourceJob.json/inboxTrigger/save',
      '/sourceJob.json/documentTrigger/save']);
  });
});
