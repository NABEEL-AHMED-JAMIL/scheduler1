import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { TaskEdit } from './task-edit';
import { ToastService } from '../../../shared/ui/toast.service';
import { API_BASE, API_SUCCESS } from '../../../core/api/api.config';

/**
 * The Pipeline field used to be a PIPELINE_IDS lookup dropdown; a pipeline is now defined by
 * creating its Pipeline Form, so the field reads the pipeline catalogue from there instead.
 * These tests exist because that migration is exactly the kind of change that fails silently:
 * a stale LOOKUP_TYPES entry or a leftover numeric-id assumption would not throw anywhere, it
 * would just make the Pipeline field quietly empty or mismatched against Pipeline Forms.
 */
function taskEditWith(getImpl: (url: string, opts?: any) => any) {
  const get = vi.fn(getImpl);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get, post: vi.fn(() => of({})) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: Router, useValue: { navigate: () => {} } },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new TaskEdit());
  return { component, get };
}

const appSettingWithPipelineIdsLookup = of({
  status: API_SUCCESS,
  data: {
    sourceTaskTypes: [],
    // A PIPELINE_IDS parent row may still exist in old data/other tenants -- the point of the
    // migration is that this screen no longer treats it as the pipeline source even if present.
    lookupDatas: [
      { lookupId: 1015, lookupType: 'PIPELINE_IDS' },
      { lookupId: 2001, lookupType: 'TASK_GROUPS' },
      { lookupId: 2002, lookupType: 'PIPELINE_HOME_PAGES' },
    ],
  },
});

describe('TaskEdit pipeline selection', () => {
  it('populates the Pipeline field from taskForm.json/listPipelines, not a lookup', () => {
    const pipelines = [
      { taskFormId: 1, pipelineId: 'F768926', formName: 'Hurricanes ETL' },
      { taskFormId: 2, pipelineId: 'F768927', formName: 'MP3 Noise Processing' },
    ];
    const { component, get } = taskEditWith(url => {
      if (url.endsWith('/setting.json/appSetting')) return appSettingWithPipelineIdsLookup;
      if (url.endsWith('/taskForm.json/listPipelines')) {
        return of({ status: API_SUCCESS, data: pipelines });
      }
      if (url.endsWith('/setting.json/fetchSubLookupByParentId')) {
        return of({ status: API_SUCCESS, data: { lookupDatas: [] } });
      }
      if (url.endsWith('/taskForm.json/formForPipeline')) {
        return of({ status: API_SUCCESS, data: null });
      }
      throw new Error(`unexpected GET ${url}`);
    });

    component.ngOnInit();

    expect(component.pipelines()).toEqual(pipelines);
    expect(get).toHaveBeenCalledWith(`${API_BASE}/taskForm.json/listPipelines`);
  });

  it('never asks the lookup API for a PIPELINE_IDS sub-lookup', () => {
    const { component, get } = taskEditWith(url => {
      if (url.endsWith('/setting.json/appSetting')) return appSettingWithPipelineIdsLookup;
      if (url.endsWith('/taskForm.json/listPipelines')) return of({ status: API_SUCCESS, data: [] });
      if (url.endsWith('/setting.json/fetchSubLookupByParentId')) {
        return of({ status: API_SUCCESS, data: { lookupDatas: [] } });
      }
      if (url.endsWith('/taskForm.json/formForPipeline')) return of({ status: API_SUCCESS, data: null });
      throw new Error(`unexpected GET ${url}`);
    });

    component.ngOnInit();

    // Only the two remaining lookup-backed dropdowns (TASK_GROUPS, PIPELINE_HOME_PAGES) should
    // trigger a sub-lookup fetch -- never one for the PIPELINE_IDS parent, even though appSetting
    // still returned it (old data, or another tenant's rows the cache has not dropped yet).
    const subLookupCalls = get.mock.calls.filter(
      ([url]) => typeof url === 'string' && url.endsWith('/setting.json/fetchSubLookupByParentId'));
    expect(subLookupCalls).toHaveLength(2);
    const requestedParentIds = subLookupCalls.map(([, opts]) => opts.params.parentLookUpId);
    expect(requestedParentIds).not.toContain(1015);
    expect(requestedParentIds.sort()).toEqual([2001, 2002]);
  });

  it('sends the pipeline id straight through to formForPipeline, unparsed', () => {
    const { component, get } = taskEditWith(url => {
      if (url.endsWith('/setting.json/appSetting')) {
        return of({ status: API_SUCCESS, data: { sourceTaskTypes: [], lookupDatas: [] } });
      }
      if (url.endsWith('/taskForm.json/listPipelines')) return of({ status: API_SUCCESS, data: [] });
      if (url.endsWith('/taskForm.json/formForPipeline')) return of({ status: API_SUCCESS, data: null });
      throw new Error(`unexpected GET ${url}`);
    });
    component.ngOnInit();
    get.mockClear();

    // A pipeline's id is now its own string (e.g. "F768926") -- never a numeric lookup row id --
    // so nothing here should coerce or reinterpret it before it reaches formForPipeline.
    component.form.get('pipelineId')!.setValue('F768926');

    expect(get).toHaveBeenCalledWith(`${API_BASE}/taskForm.json/formForPipeline`,
      { params: { pipelineId: 'F768926' } });
  });
});
