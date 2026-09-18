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
function taskEditWith(getImpl: (url: string, opts?: any) => any,
                       postImpl: (url: string, body?: any) => any = () => of({})) {
  const get = vi.fn(getImpl);
  const post = vi.fn(postImpl);
  const toast = { success: vi.fn(), error: vi.fn(), info: () => {} };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get, post } },
      { provide: ToastService, useValue: toast },
      { provide: Router, useValue: { navigate: () => {} } },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new TaskEdit());
  return { component, get, post, toast };
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
  it('populates the Pipeline field from pipeline.json/listPipelines, not a lookup', () => {
    const pipelines = [
      { pipelineKey: 1, pipelineId: 'F768926', pipelineName: 'Hurricanes ETL' },
      { pipelineKey: 2, pipelineId: 'F768927', pipelineName: 'MP3 Noise Processing' },
    ];
    const { component, get } = taskEditWith(url => {
      if (url.endsWith('/setting.json/appSetting')) return appSettingWithPipelineIdsLookup;
      if (url.endsWith('/pipeline.json/listPipelines')) {
        return of({ status: API_SUCCESS, data: pipelines });
      }
      if (url.endsWith('/setting.json/fetchSubLookupByParentId')) {
        return of({ status: API_SUCCESS, data: { lookupDatas: [] } });
      }
      if (url.endsWith('/pipeline.json/definition')) {
        return of({ status: API_SUCCESS, data: null });
      }
      throw new Error(`unexpected GET ${url}`);
    });

    component.ngOnInit();

    expect(component.pipelines()).toEqual(pipelines);
    expect(get).toHaveBeenCalledWith(`${API_BASE}/pipeline.json/listPipelines`);
  });

  it('never asks the lookup API for a PIPELINE_IDS sub-lookup', () => {
    const { component, get } = taskEditWith(url => {
      if (url.endsWith('/setting.json/appSetting')) return appSettingWithPipelineIdsLookup;
      if (url.endsWith('/pipeline.json/listPipelines')) return of({ status: API_SUCCESS, data: [] });
      if (url.endsWith('/setting.json/fetchSubLookupByParentId')) {
        return of({ status: API_SUCCESS, data: { lookupDatas: [] } });
      }
      if (url.endsWith('/pipeline.json/definition')) return of({ status: API_SUCCESS, data: null });
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
      if (url.endsWith('/pipeline.json/listPipelines')) return of({ status: API_SUCCESS, data: [] });
      if (url.endsWith('/pipeline.json/definition')) return of({ status: API_SUCCESS, data: null });
      throw new Error(`unexpected GET ${url}`);
    });
    component.ngOnInit();
    get.mockClear();

    // A pipeline's id is now its own string (e.g. "F768926") -- never a numeric lookup row id --
    // so nothing here should coerce or reinterpret it before it reaches formForPipeline.
    component.form.get('pipelineId')!.setValue('F768926');

    expect(get).toHaveBeenCalledWith(`${API_BASE}/pipeline.json/definition`,
      { params: { pipelineId: 'F768926' } });
  });
});

/**
 * There is no more "Configuration tags" screen (removed 2026-09-07) -- a pipeline's form is the
 * only surface an operator fills in, so the payload the worker receives has to be generated from
 * the form's answers automatically on save, not by a "Show the XML" button that no longer exists.
 * These tests exist because this is exactly the kind of change that fails silently: forgetting to
 * generate the payload would save a task with an empty `taskPayload` that the server rejects, or
 * -- worse, if the server's own requirement is ever loosened -- one that silently sends nothing
 * to the pipeline at all.
 */
describe('TaskEdit -- payload generated from the pipeline form on save', () => {
  const oneFieldForm = {
    pipelineKey: 9, pipelineId: 'F768926', pipelineName: 'Hurricanes ETL',
    fields: [{ tagKey: 'search_term', tagParent: null, label: 'Search term',
               fieldType: 'text', required: true, position: 0 }],
  };

  it('calls xmlCreateChecker with the form\'s answers and submits the result as the payload', () => {
    const { component, post } = taskEditWith(url => {
      if (url.endsWith('/setting.json/appSetting')) {
        return of({ status: API_SUCCESS, data: { sourceTaskTypes: [], lookupDatas: [] } });
      }
      if (url.endsWith('/pipeline.json/listPipelines')) return of({ status: API_SUCCESS, data: [oneFieldForm] });
      if (url.endsWith('/pipeline.json/definition')) return of({ status: API_SUCCESS, data: oneFieldForm });
      throw new Error(`unexpected GET ${url}`);
    }, (url, body) => {
      if (url.endsWith('/setting.json/xmlCreateChecker')) {
        expect(body).toEqual({ xmlTagsInfo: [{ tagKey: 'search_term', tagParent: '', tagValue: 'hurricanes' }] });
        return of({ status: API_SUCCESS, message: '<search_term>hurricanes</search_term>' });
      }
      if (url.endsWith('/sourceTask.json/addSourceTask')) {
        expect(body.taskPayload).toBe('<search_term>hurricanes</search_term>');
        expect(body.xmlTagsInfo).toEqual([{ tagKey: 'search_term', tagParent: '', tagValue: 'hurricanes' }]);
        return of({ status: API_SUCCESS, message: 'Task created.' });
      }
      throw new Error(`unexpected POST ${url}`);
    });
    component.ngOnInit();
    component.form.patchValue({ taskName: 'AC', sourceTaskTypeId: 1, taskStatus: 'Active', pipelineId: 'F768926' });
    component.formData.get('|search_term')!.setValue('hurricanes');

    component.save();

    expect(post).toHaveBeenCalledWith(`${API_BASE}/setting.json/xmlCreateChecker`, expect.anything());
    expect(post).toHaveBeenCalledWith(`${API_BASE}/sourceTask.json/addSourceTask`, expect.anything());
  });

  it('still requires a hand-written payload when no pipeline form applies', () => {
    const { component, post, toast } = taskEditWith(url => {
      if (url.endsWith('/setting.json/appSetting')) {
        return of({ status: API_SUCCESS, data: { sourceTaskTypes: [], lookupDatas: [] } });
      }
      if (url.endsWith('/pipeline.json/listPipelines')) return of({ status: API_SUCCESS, data: [] });
      throw new Error(`unexpected GET ${url}`);
    });
    component.ngOnInit();
    component.form.patchValue({ taskName: 'AC', sourceTaskTypeId: 1, taskStatus: 'Active' });
    // pipelineId left empty -> no form -> taskPayload stays required and, here, blank.

    component.save();

    expect(toast.error).toHaveBeenCalledWith('Check the highlighted fields.');
    expect(post).not.toHaveBeenCalled();
  });
});

/**
 * A select's choices used to be one string bound to both an <option>'s value and its text, so
 * the author had to choose between a dropdown the operator can read and a token the worker can
 * parse. These tests pin down both halves of the split -- that the label is what shows and the
 * value is what reaches the tag -- and, just as importantly, that a form written before the
 * split still resolves each line to itself. That last one is not cosmetic: buildFormControls
 * seeds a select from the tag the task already saved, and syncFormToTags DELETES that tag when
 * the control comes back blank, so a legacy option that stopped matching its own saved value
 * would empty the field and drop the answer on the next save.
 */
describe('TaskEdit -- a select field\'s choices', () => {
  function formWith(fieldOptions: string | null, defaultValue: string | null = null) {
    return {
      pipelineKey: 9, pipelineId: 'F768930', pipelineName: 'CSV to JSON demo',
      fields: [{ tagKey: 'format', tagParent: null, label: 'JSON shape', fieldType: 'select',
                 required: false, defaultValue, helpText: null, fieldOptions, position: 0 }],
    };
  }

  function loaded(def: any) {
    const { component } = taskEditWith(url => {
      if (url.endsWith('/setting.json/appSetting')) {
        return of({ status: API_SUCCESS, data: { sourceTaskTypes: [], lookupDatas: [] } });
      }
      if (url.endsWith('/pipeline.json/listPipelines')) return of({ status: API_SUCCESS, data: [def] });
      if (url.endsWith('/pipeline.json/definition')) return of({ status: API_SUCCESS, data: def });
      throw new Error(`unexpected GET ${url}`);
    });
    component.ngOnInit();
    component.form.get('pipelineId')!.setValue('F768930');
    return component;
  }

  it('shows the label and stores the value for a value=label choice', () => {
    const component = loaded(formWith('records=JSON array\nlines=JSON Lines', 'records'));
    const field = component.formFields()[0];

    expect(component.fieldChoices(field)).toEqual([
      { value: 'records', label: 'JSON array' },
      { value: 'lines', label: 'JSON Lines' },
    ]);
  });

  it('writes the VALUE of the choice the operator picked, never its label', () => {
    // The whole point of the feature, end to end: the operator reads "JSON Lines" and the worker
    // receives "lines". Before the split the tag carried whichever of the two the author
    // sacrificed. Deliberately routed through fieldChoices rather than setting "lines" directly:
    // the option's [value] is what the browser writes into the control, so picking the choice by
    // the label on screen is the only version of this that can fail when the split is missing.
    const component = loaded(formWith('records=JSON array\nlines=JSON Lines', 'records'));
    const onScreen = component.fieldChoices(component.formFields()[0])
      .find(choice => choice.label === 'JSON Lines');

    component.formData.get('|format')!.setValue(onScreen!.value);
    component.syncFormToTags();

    expect(component.form.getRawValue().tags)
      .toEqual([{ tagKey: 'format', tagParent: '', tagValue: 'lines' }]);
  });

  it('resolves a legacy line to itself as both halves', () => {
    const component = loaded(formWith('records\nlines', 'records'));
    expect(component.fieldChoices(component.formFields()[0])).toEqual([
      { value: 'records', label: 'records' },
      { value: 'lines', label: 'lines' },
    ]);
    // And the seeded default still matches an option, so the dropdown is not blank on open.
    expect(component.formData.get('|format')!.value).toBe('records');
  });

  it('splits the comma-separated options the ETL demo seeder wrote', () => {
    // These rendered as ONE option reading "records,lines" that the field's own default never
    // matched, so the dropdown opened blank and the only thing in it corrupted the task.
    const component = loaded(formWith('records,lines', 'records'));
    expect(component.fieldChoices(component.formFields()[0])).toEqual([
      { value: 'records', label: 'records' },
      { value: 'lines', label: 'lines' },
    ]);
  });

  it('carries a saved answer that matches no choice rather than rendering blank', () => {
    // A renamed choice leaves the task holding a value no <option> has. Angular then paints the
    // select empty while the control still holds -- and still sends -- the old value.
    const component = loaded(formWith('records\nlines', 'daily'));
    expect(component.fieldChoices(component.formFields()[0])).toEqual([
      { value: 'records', label: 'records' },
      { value: 'lines', label: 'lines' },
      { value: 'daily', label: 'daily (not one of the choices)' },
    ]);
  });
});

describe('TaskEdit -- the pipeline follows the topic', () => {
  const pipelines = [
    { pipelineKey: 1, pipelineId: 'F768926', pipelineName: 'Hurricanes ETL', sourceTaskTypeId: 10 },
    { pipelineKey: 2, pipelineId: 'F768927', pipelineName: 'MP3 Noise Processing', sourceTaskTypeId: 20 },
    { pipelineKey: 3, pipelineId: 'F768928', pipelineName: 'Claims files', sourceTaskTypeId: 10 },
  ];
  const withEverything = () => taskEditWith(url => {
    if (url.endsWith('/setting.json/appSetting')) return appSettingWithPipelineIdsLookup;
    if (url.endsWith('/pipeline.json/listPipelines')) return of({ status: API_SUCCESS, data: pipelines });
    if (url.endsWith('/setting.json/fetchSubLookupByParentId')) return of({ status: API_SUCCESS, data: { lookupDatas: [] } });
    if (url.endsWith('/pipeline.json/definition')) return of({ status: API_SUCCESS, data: null });
    throw new Error(`unexpected GET ${url}`);
  });

  it('offers no pipeline until a topic is chosen, then only that topic\'s', () => {
    const { component } = withEverything();
    component.ngOnInit();

    expect(component.pipelineOptions()).toEqual([]);
    expect(component.pipelineHint()).toContain('Pick a topic first');

    component.form.patchValue({ sourceTaskTypeId: 10 });
    expect(component.pipelineOptions().map(o => o.value)).toEqual(['F768926', 'F768928']);

    component.form.patchValue({ sourceTaskTypeId: 30 });
    expect(component.pipelineOptions()).toEqual([]);
    expect(component.pipelineHint()).toContain('No pipeline publishes on this topic');
  });

  it('clears a pipeline that does not publish on the newly chosen topic', () => {
    const { component } = withEverything();
    component.ngOnInit();
    component.form.patchValue({ sourceTaskTypeId: 10 });
    component.form.patchValue({ pipelineId: 'F768926' });

    // Same topic: the pipeline stays.
    component.form.patchValue({ sourceTaskTypeId: 10 });
    expect(component.form.get('pipelineId')!.value).toBe('F768926');

    // A topic F768926 does not publish on: the pair could not dispatch, so the pipeline goes.
    component.form.patchValue({ sourceTaskTypeId: 20 });
    expect(component.form.get('pipelineId')!.value).toBe('');
  });
});
