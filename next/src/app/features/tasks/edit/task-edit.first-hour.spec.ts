import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { TaskEdit } from './task-edit';
import { ToastService } from '../../../shared/ui/toast.service';
import { API_SUCCESS } from '../../../core/api/api.config';

/**
 * MIG-324, a new organisation's first hour: the places on the pipeline page where a new administrator got stuck.
 *
 * - A pipeline whose registry task has no saved steps opened on its form only, with no sign of the step builder (it
 *   took ?tab=steps in the address). A run of it is handed to whatever worker reads its topic, and in a new workspace
 *   nothing does: the run sat in Start and Run now went grey. Details now offers "Build its steps".
 * - Create pipeline went back to the list, away from the steps the pipeline still needed: it now opens the new pipeline.
 * - A connection with no topic offered an empty topic box that said "No matches": it now says where topics are added.
 */
const PIPELINES = [
  { pipelineKey: 100175, pipelineId: 'WITH_STEPS', pipelineName: 'With steps', sourceTaskTypeId: 11831, status: 'Active' },
  { pipelineKey: 100167, pipelineId: 'NO_STEPS', pipelineName: 'No steps', sourceTaskTypeId: 11831, status: 'Active' },
];
const STEPS = { legacy: false, stored: true, version: 1, versions: [], pipelineKey: 100175, pipelineId: 'WITH_STEPS', json: '', yaml: '',
  definition: { version: 1, steps: [{ key: 'read', task: 'sample', config: { rows: [{ id: 1 }] } }] } };
const LEGACY = { ...STEPS, legacy: true, stored: false, version: null, pipelineKey: 100167, pipelineId: 'NO_STEPS',
  definition: { version: 1, source: { type: 'task' }, steps: [{ key: 'legacy', task: 'legacy', config: { pipelineId: 'NO_STEPS' } }] } };
const TASK = { taskDetailId: 1876, tenantId: 2945, taskName: 'Orders', taskStatus: 'Active', pipelineId: 'NO_STEPS',
  taskPayload: '<pipeline/>', sourceTaskType: { sourceTaskTypeId: 11831 }, xmlTagsInfo: [] };

function editor(opts: { task?: object; id?: string; topics?: unknown[]; added?: string; builderLocked?: boolean } = {}) {
  const navigate = vi.fn();
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: {
      get: (url: string, options?: { params?: Record<string, unknown> }) => {
        if (url.includes('fetchSourceTaskWithSourceTaskId')) return of({ status: API_SUCCESS, data: opts.task ?? TASK });
        if (url.endsWith('/pipeline.json/listForTopic')) return of({ status: API_SUCCESS, data: PIPELINES });
        if (url.endsWith('/pipeline.json/steps/definition')) {
          return of({ status: API_SUCCESS, data: options?.params?.['pipelineKey'] === 100175 ? STEPS : LEGACY });
        }
        if (url.endsWith('/setting.json/topics') && options?.params?.['kafkaConnectionProfileId'] != null) {
          return of({ status: API_SUCCESS, data: opts.topics ?? [] });
        }
        return of({ status: API_SUCCESS, data: [] });
      },
      post: (url: string) => url.endsWith('/sourceTask.json/addSourceTask')
        ? of({ status: API_SUCCESS, message: opts.added ?? 'SourceTask successfully saved with ID 1877.' })
        : of({ status: API_SUCCESS, data: [] }),
      put: () => of({ status: API_SUCCESS }),
    } },
    { provide: ToastService, useValue: toast },
    { provide: Router, useValue: { navigate } },
  ] });
  const component = TestBed.runInInjectionContext(() => new TaskEdit());
  (component as any).taskDetailId = () => opts.id ?? '1876';
  (component as any).tab = () => '';
  if (opts.builderLocked) (component as any).locked = () => true;
  component.ngOnInit();
  TestBed.tick();
  return { component, navigate, toast };
}

describe('TaskEdit, a new organisation\'s first hour (MIG-324)', () => {
  it('offers a pipeline with no steps its step builder from Details', () => {
    const { component } = editor();
    expect(component.stepsMode()).toBe(false);
    expect(component.offerSteps()).toBe(true);

    component.setTab('steps');
    expect(component.stepsMode()).toBe(true);
    expect(component.activeTab()).toBe('steps');
    expect(component.offerSteps()).toBe(false);
  });

  it('does not offer it when the pipeline already runs as steps', () => {
    const { component } = editor({ task: { ...TASK, pipelineId: 'WITH_STEPS' } });
    expect(component.stepsMode()).toBe(true);
    expect(component.offerSteps()).toBe(false);
  });

  it('does not offer it on a new pipeline, nor where the builder is locked', () => {
    expect(editor({ id: '' }).component.offerSteps()).toBe(false);
    expect(editor({ builderLocked: true }).component.offerSteps()).toBe(false);
  });

  it('opens the new pipeline once it is created, where its steps are built', () => {
    const { component, navigate, toast } = editor({ id: '' });
    component.form.patchValue({ taskName: 'Orders', sourceTaskTypeId: 11831, taskStatus: 'Active', taskPayload: '<pipeline/>' });
    component.save();
    expect(toast.success).toHaveBeenCalledWith('Pipeline created.');
    expect(navigate).toHaveBeenCalledWith(['/pipelines', 1877, 'edit']);
  });

  it('goes back to the list when the answer names no id', () => {
    const { component, navigate } = editor({ id: '', added: 'Task created.' });
    component.form.patchValue({ taskName: 'Orders', sourceTaskTypeId: 11831, taskStatus: 'Active', taskPayload: '<pipeline/>' });
    component.save();
    expect(navigate).toHaveBeenCalledWith(['/pipelines']);
  });

  it('says where topics are added when the picked connection has none', () => {
    const { component } = editor({ id: '' });
    expect(component.noTopicsHere()).toBe(false);
    component.pickProfile('5');
    expect(component.noTopicsHere()).toBe(true);
    expect(component.topicHint()).toContain('Kafka & Topics');
  });

  it('says nothing of the kind while a connection has topics', () => {
    const { component } = editor({ id: '', topics: [{ sourceTaskTypeId: 10, serviceName: 'Orders intake', queueTopicPartition: 'topic=orders&partitions=[*]' }] });
    component.pickProfile('5');
    expect(component.noTopicsHere()).toBe(false);
    expect(component.topicHint()).not.toContain('Kafka & Topics');
  });
});
