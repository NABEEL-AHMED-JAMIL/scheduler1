import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { JobEdit } from './job-edit';
import { ToastService } from '../../../shared/ui/toast.service';

/**
 * MIG-251: the schedule editor's Event start (MIG-239's inbox trigger: start when a file arrives in the inbox, with a
 * pattern on the file's name) and its AI models section (MIG-242: the model each AI step runs on when the schedule runs
 * it). Both are saved after the job itself, and only when they changed -- a job that has neither saves exactly as today.
 */
const JOB = { jobId: 2848, jobName: 'UI-CHECK steps job', execution: 'Manual', priority: 1, jobStatus: 'Active',
  taskDetail: { taskDetailId: 1864 } };
const CHOICES = { jobId: 2848, taskDetailId: 1864, steps: [
  { stepKey: 'summary', label: 'Summarise', runIn: 'server', options: [
    { modelOptionId: 7, connectionName: 'OpenAI', model: 'gpt-4.1', isDefault: true, connectionActive: true },
    { modelOptionId: 8, connectionName: 'Claude', model: 'claude-x', connectionActive: true },
  ] },
] };

interface Call { method: string; path: string; params?: Record<string, string>; body?: any }

function editor(answers: Record<string, unknown>, id = '2848', saveAnswer: unknown = { status: 'SUCCESS', message: 'SourceJob saved.' }) {
  const calls: Call[] = [];
  const errors: unknown[] = [];
  const successes: unknown[] = [];
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
    { provide: ToastService, useValue: { success: (m: unknown) => successes.push(m), error: (m: unknown) => errors.push(m), info: () => {} } },
    { provide: Router, useValue: { navigate: (to: unknown) => navigations.push(to) } },
  ] });
  const component = TestBed.runInInjectionContext(() => new JobEdit());
  (component as any).jobId = () => id;
  component.ngOnInit();
  return { component, calls, errors, successes, navigations };
}

const writes = (calls: Call[]) => calls.filter(c => c.method !== 'GET').map(c => c.path);

describe('JobEdit: the Event start', () => {
  it('reads the job\'s trigger and shows it', () => {
    const { component, calls } = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
      '/sourceJob.json/inboxTrigger': { status: 'SUCCESS', data: { jobId: 2848, configured: true, enabled: true, filePattern: '*.csv' } },
    });
    expect(calls.find(c => c.path === '/sourceJob.json/inboxTrigger')?.params).toEqual({ jobId: '2848' });
    expect(component.onArrival()).toBe(true);
    expect(component.filePattern()).toBe('*.csv');
  });

  it('saves nothing extra when neither the trigger nor the models changed', () => {
    const { component, calls, navigations } = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
      '/sourceJob.json/inboxTrigger': { status: 'SUCCESS', data: { jobId: 2848, configured: false } },
      '/sourceJob.json/aiModelChoice': { status: 'SUCCESS', data: CHOICES },
    });
    component.save();
    expect(writes(calls)).toEqual(['/sourceJob.json/updateSourceJob']);
    expect(navigations).toEqual([['/pipelines/schedules']]);
  });

  it('turns the trigger on with its pattern, after the job is saved', () => {
    const { component, calls } = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
      '/sourceJob.json/inboxTrigger': { status: 'SUCCESS', data: { jobId: 2848, configured: false } },
    });
    component.onArrival.set(true);
    component.filePattern.set(' invoices_*.pdf ');
    component.save();
    expect(writes(calls)).toEqual(['/sourceJob.json/updateSourceJob', '/sourceJob.json/inboxTrigger/save']);
    expect(calls.at(-1)!.body).toEqual({ jobId: 2848, enabled: true, filePattern: 'invoices_*.pdf' });
  });

  // MIG-360: files that waited for a run go together, up to this many; sent only when it changed.
  it('saves the files per run with the trigger, only when it changed', () => {
    const { component, calls } = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
      '/sourceJob.json/inboxTrigger': { status: 'SUCCESS', data: { jobId: 2848, configured: true, enabled: true, filePattern: '*.csv', batchSize: 1 } },
    });
    expect(component.batchSize()).toBe(1);
    component.batchSize.set('10');
    component.save();
    expect(calls.at(-1)).toMatchObject({ path: '/sourceJob.json/inboxTrigger/save',
      body: { jobId: 2848, enabled: true, filePattern: '*.csv', batchSize: 10 } });
  });

  it('refuses files per run outside 1..50 before saving anything', () => {
    const { component, calls, errors } = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
    });
    component.onArrival.set(true);
    component.batchSize.set('0');
    component.save();
    expect(writes(calls)).toEqual([]);
    expect(errors[0]).toContain('1 to 50');
  });

  it('turns it off without forgetting the pattern', () => {
    const { component, calls } = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
      '/sourceJob.json/inboxTrigger': { status: 'SUCCESS', data: { jobId: 2848, configured: true, enabled: true, filePattern: '*.csv' } },
    });
    component.onArrival.set(false);
    component.save();
    expect(calls.at(-1)).toMatchObject({ path: '/sourceJob.json/inboxTrigger/save', body: { jobId: 2848, enabled: false, filePattern: '*.csv' } });
  });

  it('refuses a folder in the pattern before saving anything', () => {
    const { component, calls, errors } = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
    });
    component.onArrival.set(true);
    component.filePattern.set('in/*.csv');
    expect(component.patternError()).toContain('not a folder');
    component.save();
    expect(writes(calls)).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it('sets the trigger on a new job, by the id its creation answers with', () => {
    const { component, calls } = editor({}, '', { status: 'SUCCESS', message: 'Job save with jobId 2901.' });
    expect(calls.some(c => c.path === '/sourceJob.json/inboxTrigger')).toBe(false);
    component.form.patchValue({ jobName: 'x', taskDetailId: 7, executionType: 'Manual' });
    component.onArrival.set(true);
    component.save();
    expect(writes(calls)).toEqual(['/sourceJob.json/addSourceJob', '/sourceJob.json/inboxTrigger/save']);
    expect(calls.at(-1)!.body).toEqual({ jobId: 2901, enabled: true, filePattern: '' });
  });

  it('says the job was saved but the trigger was not, and stays', () => {
    const { component, errors, navigations } = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
      'POST /sourceJob.json/inboxTrigger/save': { status: 'ERROR', message: 'A file pattern is at most 255 characters.' },
    });
    component.onArrival.set(true);
    component.save();
    expect(errors[0]).toContain('A file pattern is at most 255 characters.');
    expect(navigations).toEqual([]);
    expect(component.saving()).toBe(false);
  });
});

describe('JobEdit: AI models', () => {
  it('lists the job\'s AI steps when it has some, and none otherwise', () => {
    const withSteps = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
      '/sourceJob.json/aiModelChoice': { status: 'SUCCESS', data: CHOICES },
    });
    expect(withSteps.component.aiSteps().map(s => s.stepKey)).toEqual(['summary']);
    expect(withSteps.component.modelPicks()).toEqual({ summary: '' });
    const without = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
      '/sourceJob.json/aiModelChoice': { status: 'SUCCESS', data: { jobId: 2848, steps: [] } },
    });
    expect(without.component.aiSteps()).toEqual([]);
  });

  it('saves the schedule\'s models when one changed', () => {
    const { component, calls } = editor({
      '/sourceJob.json/fetchSourceJobDetailWithSourceJobId': { status: 'SUCCESS', data: JOB },
      '/sourceJob.json/aiModelChoice': { status: 'SUCCESS', data: CHOICES },
    });
    component.modelPicks.set({ summary: '8' });
    component.save();
    expect(writes(calls)).toEqual(['/sourceJob.json/updateSourceJob', '/sourceJob.json/aiModelChoice/save']);
    expect(calls.at(-1)!.body).toEqual({ jobId: 2848, steps: [{ stepKey: 'summary', modelOptionId: '8' }] });
  });

  it('does not ask about models for a new job', () => {
    const { calls } = editor({}, '');
    expect(calls.some(c => c.path === '/sourceJob.json/aiModelChoice')).toBe(false);
  });
});
