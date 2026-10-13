import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { TaskEdit } from './task-edit';
import { ToastService } from '../../../shared/ui/toast.service';
import { API_SUCCESS } from '../../../core/api/api.config';
import { RunDrawer } from '../steps/run-drawer';

/**
 * UX review 2026-10-12 (B2): the pipeline editor as one page. Run now and Schedule are the header's (Run now runs the
 * one schedule, or the one picked, saving unsaved changes first); the overview strip says what each part is set to;
 * one save bar saves the details and the steps, and the page stays open after a save.
 */
const TASK = { taskDetailId: 1864, tenantId: 2924, taskName: 'Brain tumour MRI grading', taskStatus: 'Active', pipelineId: 'MED_BRAIN_MRI',
  taskPayload: '<pipeline/>', sourceTaskType: { sourceTaskTypeId: 11831 }, xmlTagsInfo: [] };
const PIPELINES = [{ pipelineKey: 100175, pipelineId: 'MED_BRAIN_MRI', pipelineName: 'MRI', sourceTaskTypeId: 11831, status: 'Active' }];
const STEPS = { legacy: false, stored: true, version: 3, versions: [], pipelineKey: 100175, pipelineId: 'MED_BRAIN_MRI', json: '', yaml: '',
  definition: { version: 1, steps: [{ key: 'manifest', task: 'read_file' }, { key: 'save', task: 'save_file' }] } };
const JOBS = [{ jobId: 2903, jobName: 'Manual', jobStatus: 'Active' }, { jobId: 2935, jobName: 'Nightly', jobStatus: 'Active' }];

function editor(opts: { jobs?: unknown[]; put?: unknown } = {}) {
  const navigate = vi.fn();
  const request = vi.fn(() => of({ status: API_SUCCESS }));
  const put = vi.fn(() => of(opts.put ?? { status: API_SUCCESS, message: 'SourceTask updated.' }));
  const opened: { component: unknown; data: any }[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: {
      get: (url: string) => {
        if (url.includes('fetchSourceTaskWithSourceTaskId')) return of({ status: API_SUCCESS, data: TASK });
        if (url.endsWith('/pipeline.json/listForTopic')) return of({ status: API_SUCCESS, data: PIPELINES });
        if (url.endsWith('/pipeline.json/steps/definition')) return of({ status: API_SUCCESS, data: STEPS });
        // No form defined for the pipeline: the payload is the box's, as typed.
        if (url.endsWith('/pipeline.json/definition')) return of({ status: 'ERROR', message: 'No form.' });
        if (url.endsWith('fetchSourceJobQueueListWithJobId')) return of({ status: API_SUCCESS, data: { jobQueues: [{ jobQueueId: 8300 }, { jobQueueId: 8301 }] } });
        return of({ status: API_SUCCESS, data: [] });
      },
      post: (url: string) => of({ status: API_SUCCESS, data: url.includes('fetchAllLinkJobsWithSourceTaskId') ? (opts.jobs ?? JOBS) : [] }),
      put,
      request,
    } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
    { provide: Router, useValue: { navigate } },
    { provide: Dialog, useValue: { open: vi.fn((component: unknown, config: { data: any }) => { opened.push({ component, data: config?.data }); return { closed: of(undefined) }; }) } },
  ] });
  const component = TestBed.runInInjectionContext(() => new TaskEdit());
  (component as any).taskDetailId = () => '1864';
  (component as any).tab = () => '';
  component.ngOnInit();
  TestBed.tick();
  return { component, navigate, request, put, opened };
}

describe('TaskEdit -- the header, the overview and one save (B2)', () => {
  it('reads the schedules that run it, and shows the steps\' version beside the title', () => {
    const { component } = editor();
    expect(component.jobs().map(j => j.jobId)).toEqual([2903, 2935]);
    expect(component.versionPill()).toBe(3);
    expect(component.heading()).toBe('Brain tumour MRI grading');
  });

  it('runs the schedule picked and opens the run as it happens', async () => {
    const { component, request, opened } = editor();
    await component.runNow(2935);
    expect(request).toHaveBeenCalledWith('POST', expect.stringContaining('sourceJob.json/'), { body: { jobId: 2935 } });
    const drawer = opened.find(o => o.component === RunDrawer)!;
    expect(drawer.data).toMatchObject({ jobQueueId: 8301, jobId: 2935, jobName: 'Nightly' });
  });

  it('cannot run a pipeline no schedule runs, and says to schedule one', async () => {
    const { component, request } = editor({ jobs: [] });
    expect(component.runHint()).toContain('No schedule runs this pipeline yet');
    await component.runNow();
    expect(request).not.toHaveBeenCalled();
  });

  it('opens a new schedule for this pipeline', () => {
    const { component, navigate } = editor();
    component.schedule();
    expect(navigate).toHaveBeenCalledWith(['/pipelines/schedules/new'], { queryParams: { taskDetailId: 1864 } });
  });

  it('draws the overview from the saved steps before the builder is on the page', () => {
    const { component } = editor();
    expect(component.overview().map(p => [p.id, p.state])).toEqual([
      ['source', 'done'], ['steps', 'done'], ['review', 'optional'], ['outputs', 'done'], ['schedule', 'done'],
    ]);
    component.goTo(component.overview()[4]);
    expect(component.activeTab()).toBe('schedules');
  });

  it('saves changed details from the save bar and stays on the page, saying No changes again', async () => {
    const { component, navigate, put } = editor();
    expect(component.dirty()).toBe(false);
    expect(component.saveState()).toBe('No changes');
    component.form.get('taskName')!.setValue('Brain tumour MRI grading (v2)');
    component.form.markAsDirty();
    expect(component.dirty()).toBe(true);
    expect(component.saveState()).toBe('Unsaved changes');
    expect(component.runLabel()).toBe('Save & run now');
    expect(await component.saveAll()).toBe(true);
    expect(put).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalledWith(['/pipelines/list']);
    expect(component.dirty()).toBe(false);
    expect(component.heading()).toBe('Brain tumour MRI grading (v2)');
  });

  it('keeps the changes when the save is refused', async () => {
    const { component } = editor({ put: { status: 'ERROR', message: 'Refused.' } });
    component.form.get('taskName')!.setValue('Renamed');
    component.form.markAsDirty();
    expect(await component.saveAll()).toBe(false);
    expect(component.dirty()).toBe(true);
  });
});
