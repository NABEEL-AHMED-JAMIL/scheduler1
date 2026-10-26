import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { AccessProfilesService } from '../admin/access-profiles/access-profiles.service';
import { PipelineFields, WorkflowDesigner } from './workflow-designer';
import { WorkflowsApi } from './workflows.api';
import { DraftStep, fromJson, newStep, resultName, runFields, toJson } from './designer.model';

/**
 * MIG-424: a Run pipeline step passes parameters mapped from the request and keeps chosen values of the run's answer for
 * later conditions -- picked from the pipeline's declared parameters and its output's columns.
 */
const CAREPLAN: PipelineFields = {
  jobId: 2850, name: 'Care plan', active: true, stepPipeline: true,
  parameters: [{ name: 'mrn', type: 'text', required: true }, { name: 'days', type: 'number', required: false, default: '30' }],
  steps: [{ key: 'read', name: 'Read patient', task: 'read_api', columns: ['mrn', 'name'] },
    { key: 'score', name: 'Score risk', task: 'ai_prompt', columns: ['mrn', 'risk', 'summary'] }],
  final: ['mrn', 'risk', 'summary'],
  fromRun: 9001,
};

function careplanStep(): DraftStep {
  return { ...newStep('run_pipeline', []), key: 'careplan', jobId: 2850, waitFor: true, saveAs: 'careplan', waitHours: 24 };
}

const JOURNEY = { steps: [
  { key: 'careplan', type: 'run_pipeline', name: 'Care plan', jobId: 2850, wait: true, saveAs: 'careplan', waitHours: 24 },
  { key: 'risky', type: 'condition', name: 'High risk?', condition: { field: 'careplan.ok', op: 'eq', value: true }, whenTrue: 'end', whenFalse: 'end' },
] };
const WORKFLOW = { id: 3, key: 'journey', name: 'Patient journey', subjectType: 'patient', currentVersion: 1, status: 'Active', running: 0,
  versions: [{ version: 1, steps: JSON.stringify(JOURNEY), createdBy: 1015, dateCreated: '2026-10-26T10:00:00' }] };

function screen() {
  const api = {
    colleagues: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    list: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [WORKFLOW] })),
    fetch: vi.fn(() => of({ status: 'SUCCESS', message: '', data: WORKFLOW })),
    publish: vi.fn(), setStatus: vi.fn(), start: vi.fn(), create: vi.fn(),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: WorkflowsApi, useValue: api },
      { provide: AccessProfilesService, useValue: { list: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })) } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: AuthService, useValue: { isTenantAdmin: () => true, builderLocked: () => false, canOpen: () => true,
        user: signal({ appUserId: 4537, tenantId: 1006 }) } },
    ],
  });
  const fixture = TestBed.createComponent(WorkflowDesigner);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.match(r => r.url.includes('listSourceJob')).forEach(r => r.flush({ status: 'SUCCESS', data: [{ jobId: 2850, jobName: 'Care plan' }] }));
  return { fixture, http, s: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('Workflow designer -- a Run pipeline step\'s parameters and results (MIG-424)', () => {
  it('sends parameters, and results only on a step that waits, as workflow-service reads them', () => {
    const step: DraftStep = { ...careplanStep(), parameters: { mrn: '{{subject.mrn}}', days: '' },
      results: { from: 'score', take: 'first', fields: ['risk', { path: 'summary.age', as: 'age' }, { path: 'mrn', as: 'mrn' }] } };
    expect(toJson([step]).steps[0]).toEqual({ key: 'careplan', type: 'run_pipeline', name: 'Run pipeline', jobId: 2850,
      parameters: { mrn: '{{subject.mrn}}' }, waitFor: true, saveAs: 'careplan', waitHours: 24,
      results: { from: 'score', fields: ['risk', 'summary.age', 'mrn'] } });
    expect(toJson([{ ...step, results: { fields: [{ path: 'summary.age', as: 'patient_age' }] } }]).steps[0]['results'])
      .toEqual({ fields: [{ path: 'summary.age', as: 'patient_age' }] });
    expect(toJson([{ ...step, waitFor: false }]).steps[0]['results']).toBeUndefined();
    expect(toJson([{ ...step, results: { take: 'all', maxRows: 5 } }]).steps[0]['results']).toEqual({ take: 'all', maxRows: 5 });
    // "wait", the engine's word, is read back as waitFor.
    expect(fromJson(JSON.stringify({ steps: [{ key: 'r', type: 'run_pipeline', jobId: 1, wait: true }] }))[0].waitFor).toBe(true);
  });

  it('names what later steps read: the outcome and each kept value', () => {
    expect(resultName('summary.age')).toBe('age');
    expect(resultName({ path: 'risk', as: 'level' })).toBe('level');
    const step = { ...careplanStep(), results: { fields: ['risk', 'eligible'] } };
    expect(runFields(step)).toEqual(['careplan.ok', 'careplan.status', 'careplan.message', 'careplan.risk', 'careplan.eligible']);
    expect(runFields({ ...step, results: { take: 'count' as const } })).toContain('careplan.count');
  });

  it('reads the pipeline when its step is opened, offers its declared parameters and its output\'s columns, and branches on a value', () => {
    const { fixture, http, s, el } = screen();
    expect(s.steps()[0].waitFor).toBe(true);
    s.pick(0);
    fixture.detectChanges();
    const read = http.expectOne(r => r.url.endsWith('/sourceJob.json/outputFields'));
    expect(read.request.params.get('jobId')).toBe('2850');
    read.flush({ status: 'SUCCESS', data: CAREPLAN });
    fixture.detectChanges();

    expect(s.parameterRows(s.step()!).map(p => p.name)).toEqual(['mrn', 'days']);
    expect(s.parameterPlaceholder('days', CAREPLAN.parameters[1])).toBe('default: 30');
    expect(s.parameterPlaceholder('mrn', CAREPLAN.parameters[0])).toBe('{{subject.mrn}}');
    s.setParameter('mrn', '{{subject.mrn}}');
    s.setParameter('ward', '7');
    expect(s.parameterRows(s.step()!).find(p => p.name === 'ward')!.declared).toBeNull();
    s.setParameter('ward', '');
    expect(s.step()!.parameters).toEqual({ mrn: '{{subject.mrn}}' });

    s.setKeepResults(true);
    fixture.detectChanges();
    expect(Array.from(el.querySelectorAll('[data-test="wf-run-columns"] button')).map(b => b.textContent!.trim())).toEqual(['mrn', 'risk', 'summary']);
    s.setResults('from', 'read');
    expect(s.resultColumns(s.step()!)).toEqual(['mrn', 'name']);
    s.setResults('from', 'final');
    s.toggleResultField(s.step()!, 'risk');
    s.toggleResultField(s.step()!, 'summary.age');
    s.renameResultField(s.step()!, 'summary.age', 'status');
    fixture.detectChanges();
    expect(s.resultFieldRows(s.step()!).find(f => f.path === 'summary.age')!.clash).toBe(true);
    s.renameResultField(s.step()!, 'summary.age', 'age');
    expect(s.runFieldNames()).toEqual(['careplan.ok', 'careplan.status', 'careplan.message', 'careplan.risk', 'careplan.age']);

    s.branchOnResult(s.step()!, 'risk');
    expect(s.steps()[1].condition).toEqual({ field: 'careplan.risk', op: 'eq', value: true });
    expect(s.knownFields()).toContain('careplan.risk');
    expect(http.match(r => r.url.endsWith('/sourceJob.json/outputFields'))).toHaveLength(0);
  });

  it('says so when the pipeline declares no parameters, and reads each pipeline once', () => {
    const { fixture, http, s, el } = screen();
    s.pick(0);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/sourceJob.json/outputFields')).flush({ status: 'SUCCESS', data: { ...CAREPLAN, parameters: [] } });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="wf-run-parameters"]')!.textContent).toContain('This pipeline declares no parameters.');
    s.pick(1);
    fixture.detectChanges();
    s.pick(0);
    fixture.detectChanges();
    expect(http.match(r => r.url.endsWith('/sourceJob.json/outputFields'))).toHaveLength(0);
  });

  it('says when a pipeline cannot be read -- another workspace\'s, or none -- rather than reading it for ever', () => {
    const { fixture, http, s, el } = screen();
    s.pick(0);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/sourceJob.json/outputFields')).flush({ status: 'ERROR', message: 'SourceJob not found with jobId.' },
      { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(s.pipelineMissing()).toBe(true);
    expect(el.querySelector('[data-test="wf-run-parameters-note"]')!.textContent).toContain('could not be read');
  });
});
