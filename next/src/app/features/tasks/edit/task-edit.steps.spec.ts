import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { TaskEdit } from './task-edit';
import { ToastService } from '../../../shared/ui/toast.service';
import { API_SUCCESS } from '../../../core/api/api.config';

/**
 * MIG-249: the step builder lives on the pipeline's edit page. A task whose pipeline has saved steps opens on them,
 * with Details (today's form) as one tab beside Steps, Settings, YAML and JSON; a legacy pipeline opens on today's
 * form exactly as before -- no tabs -- unless the page is asked for its steps (?tab=steps), which is how a legacy
 * pipeline is given steps. A new task has no pipeline yet and never asks.
 */
const TASK = { taskDetailId: 1864, tenantId: 2924, taskName: 'UI-CHECK step engine task 0928', taskStatus: 'Active', pipelineId: 'UI_CHECK_STEPS_0928',
  taskPayload: '<pipeline/>', sourceTaskType: { sourceTaskTypeId: 11831 }, xmlTagsInfo: [] };
const PIPELINES = [
  { pipelineKey: 100175, pipelineId: 'UI_CHECK_STEPS_0928', pipelineName: 'UI-CHECK steps', sourceTaskTypeId: 11831, status: 'Active' },
  { pipelineKey: 100167, pipelineId: 'REF_CSV_CHECK_V1', pipelineName: 'Reference', sourceTaskTypeId: 11831, status: 'Active' },
];
const STEPS = { legacy: false, stored: true, version: 1, versions: [], pipelineKey: 100175, pipelineId: 'UI_CHECK_STEPS_0928', json: '', yaml: '',
  definition: { version: 1, steps: [{ key: 'read', task: 'sample', config: { rows: [{ id: 1 }] } }] } };
const LEGACY = { ...STEPS, legacy: true, stored: false, version: null, pipelineKey: 100167, pipelineId: 'REF_CSV_CHECK_V1',
  definition: { version: 1, source: { type: 'task' }, steps: [{ key: 'legacy', task: 'legacy', config: { pipelineId: 'REF_CSV_CHECK_V1' } }] } };

function editor(opts: { task?: object; id?: string; tab?: string } = {}) {
  const asked: string[] = [];
  const navigate = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: {
      get: (url: string, options?: { params?: Record<string, unknown> }) => {
        if (url.includes('fetchSourceTaskWithSourceTaskId')) return of({ status: API_SUCCESS, data: opts.task ?? TASK });
        if (url.endsWith('/pipeline.json/listForTopic')) return of({ status: API_SUCCESS, data: PIPELINES });
        if (url.endsWith('/pipeline.json/steps/definition')) {
          asked.push(String(options?.params?.['pipelineKey']));
          return of({ status: API_SUCCESS, data: options?.params?.['pipelineKey'] === 100175 ? STEPS : LEGACY });
        }
        return of({ status: API_SUCCESS, data: [] });
      },
      post: () => of({ status: API_SUCCESS, data: [] }),
      put: () => of({ status: API_SUCCESS }),
    } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    { provide: Router, useValue: { navigate } },
  ] });
  const component = TestBed.runInInjectionContext(() => new TaskEdit());
  (component as any).taskDetailId = () => opts.id ?? '1864';
  (component as any).tab = () => opts.tab ?? '';
  component.ngOnInit();
  TestBed.tick();
  return { component, asked, navigate };
}

describe('TaskEdit and the step builder', () => {
  it('opens a pipeline with saved steps on its steps, Details beside them', () => {
    const { component, asked } = editor();
    expect(asked).toEqual(['100175']);
    expect(component.stepsMode()).toBe(true);
    expect(component.activeTab()).toBe('steps');
    expect(component.pageTabs.map(t => t.label)).toEqual(['Details', 'Steps', 'Settings', 'YAML', 'JSON']);
  });

  it('opens a legacy pipeline on today\'s form, with no tabs', () => {
    const { component, asked } = editor({ task: { ...TASK, pipelineId: 'REF_CSV_CHECK_V1' } });
    expect(asked).toEqual(['100167']);
    expect(component.stepsMode()).toBe(false);
    expect(component.activeTab()).toBe('details');
  });

  it('shows a legacy pipeline\'s steps when the page is asked for them', () => {
    const { component } = editor({ task: { ...TASK, pipelineId: 'REF_CSV_CHECK_V1' }, tab: 'steps' });
    expect(component.stepsMode()).toBe(true);
    expect(component.activeTab()).toBe('steps');
  });

  it('never asks for a new task', () => {
    const { component, asked } = editor({ id: '' });
    expect(asked).toEqual([]);
    expect(component.stepsMode()).toBe(false);
  });

  it('keeps the open tab in the address', () => {
    const { component, navigate } = editor();
    component.setTab('yaml');
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { tab: 'yaml' }, queryParamsHandling: 'merge', replaceUrl: true }));
  });

  it('stays on the tab it was asked for, a text tab included', () => {
    const { component } = editor({ tab: 'json' });
    expect(component.activeTab()).toBe('json');
    expect(component.builderTab()).toBe('json');
  });
});
