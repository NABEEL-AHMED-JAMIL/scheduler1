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
  // Every test's editor loads the Kafka connections first; none of them is about that list.
  const get = vi.fn((url: string, opts?: any) =>
    url.endsWith('/kafkaConnectionProfile.json/fetchAllProfiles') ? of({ status: API_SUCCESS, data: [] }) : getImpl(url, opts));
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

const noTopics = of({ status: API_SUCCESS, data: [] });
/** What setting.json/taskReferences answers: the task groups or the home pages, by the kind asked for. */
const REFERENCES: Record<string, any[]> = {
  TASK_GROUP: [
    { id: 2001, tenantId: 2901, kind: 'TASK_GROUP', name: 'Nightly', usedByTasks: 1 },
    { id: 2003, tenantId: 2901, kind: 'TASK_GROUP', name: 'Claims', value: 'CLM', usedByTasks: 0 },
  ],
  HOME_PAGE: [
    { id: 2002, tenantId: 2901, kind: 'HOME_PAGE', name: 'Claims portal', value: 'https://claims.example.com', usedByTasks: 1 },
  ],
};
function references(opts: any) {
  return of({ status: API_SUCCESS, data: REFERENCES[opts?.params?.kind] ?? [] });
}

/** What pipeline.json/listForTopic answers: the given pipelines on the topic the call names. */
function forTopic(pipelines: any[], opts: any) {
  const topic = Number(opts?.params?.sourceTaskTypeId);
  return of({ status: API_SUCCESS, data: pipelines.filter(p => p.sourceTaskTypeId === topic) });
}

/** The pipelines are fetched by an effect, which runs on the next tick rather than inline. */
const settle = () => TestBed.tick();

describe('TaskEdit pipeline selection', () => {
  it('populates the Pipeline field from pipeline.json/listForTopic, not a lookup', () => {
    const pipelines = [
      { pipelineKey: 1, pipelineId: 'F768926', pipelineName: 'Hurricanes ETL', sourceTaskTypeId: 10 },
      { pipelineKey: 2, pipelineId: 'F768927', pipelineName: 'MP3 Noise Processing', sourceTaskTypeId: 10 },
    ];
    const { component, get } = taskEditWith((url, opts) => {
      if (url.endsWith('/setting.json/topics')) return noTopics;
      if (url.endsWith('/setting.json/taskReferences')) return references(opts);
      if (url.endsWith('/pipeline.json/listForTopic')) return forTopic(pipelines, opts);
      if (url.endsWith('/pipeline.json/definition')) {
        return of({ status: API_SUCCESS, data: null });
      }
      throw new Error(`unexpected GET ${url}`);
    });

    component.ngOnInit();
    settle();

    // Nothing is fetched until a topic is chosen; then only that topic's pipelines are.
    expect(get).not.toHaveBeenCalledWith(`${API_BASE}/pipeline.json/listForTopic`, expect.anything());
    component.form.patchValue({ sourceTaskTypeId: 10 });
    settle();
    expect(component.pipelines()).toEqual(pipelines);
    expect(get).toHaveBeenCalledWith(`${API_BASE}/pipeline.json/listForTopic`, { params: { sourceTaskTypeId: 10 } });
  });

  it('sends the pipeline id straight through to formForPipeline, unparsed', () => {
    const { component, get } = taskEditWith((url, opts) => {
      if (url.endsWith('/setting.json/topics')) return noTopics;
      if (url.endsWith('/setting.json/taskReferences')) return references(opts);
      if (url.endsWith('/pipeline.json/listForTopic')) return forTopic([], opts);
      if (url.endsWith('/pipeline.json/definition')) return of({ status: API_SUCCESS, data: null });
      throw new Error(`unexpected GET ${url}`);
    });
    component.ngOnInit();
    settle();
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
    const { component, post } = taskEditWith((url, opts) => {
      if (url.endsWith('/setting.json/topics')) return noTopics;
      if (url.endsWith('/setting.json/taskReferences')) return references(opts);
      if (url.endsWith('/pipeline.json/listForTopic')) return forTopic([oneFieldForm], opts);
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
    settle();
    component.form.patchValue({ taskName: 'AC', sourceTaskTypeId: 1, taskStatus: 'Active', pipelineId: 'F768926' });
    component.formData.get('|search_term')!.setValue('hurricanes');

    component.save();

    expect(post).toHaveBeenCalledWith(`${API_BASE}/setting.json/xmlCreateChecker`, expect.anything());
    expect(post).toHaveBeenCalledWith(`${API_BASE}/sourceTask.json/addSourceTask`, expect.anything());
  });

  it('still requires a hand-written payload when no pipeline form applies', () => {
    const { component, post, toast } = taskEditWith((url, opts) => {
      if (url.endsWith('/setting.json/topics')) return noTopics;
      if (url.endsWith('/setting.json/taskReferences')) return references(opts);
      if (url.endsWith('/pipeline.json/listForTopic')) return forTopic([], opts);
      throw new Error(`unexpected GET ${url}`);
    });
    component.ngOnInit();
    settle();
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
    const { component } = taskEditWith((url, opts) => {
      if (url.endsWith('/setting.json/topics')) return noTopics;
      if (url.endsWith('/setting.json/taskReferences')) return references(opts);
      if (url.endsWith('/pipeline.json/listForTopic')) return forTopic([def], opts);
      if (url.endsWith('/pipeline.json/definition')) return of({ status: API_SUCCESS, data: def });
      throw new Error(`unexpected GET ${url}`);
    });
    component.ngOnInit();
    settle();
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
  const withEverything = () => taskEditWith((url, opts) => {
    if (url.endsWith('/setting.json/topics')) return noTopics;
      if (url.endsWith('/setting.json/taskReferences')) return references(opts);
    if (url.endsWith('/pipeline.json/listForTopic')) return forTopic(pipelines, opts);
    if (url.endsWith('/pipeline.json/definition')) return of({ status: API_SUCCESS, data: null });
    throw new Error(`unexpected GET ${url}`);
  });

  it('offers no pipeline until a topic is chosen, then only that topic\'s', () => {
    const { component } = withEverything();
    component.ngOnInit();
    settle();

    expect(component.pipelineOptions()).toEqual([]);
    expect(component.pipelineHint()).toContain('Pick a topic first');

    component.form.patchValue({ sourceTaskTypeId: 10 });
    settle();
    expect(component.pipelineOptions().map(o => o.value)).toEqual(['F768926', 'F768928']);

    component.form.patchValue({ sourceTaskTypeId: 30 });
    settle();
    expect(component.pipelineOptions()).toEqual([]);
    expect(component.pipelineHint()).toContain('No pipeline publishes on this topic');
  });

  it('clears a pipeline that does not publish on the newly chosen topic', () => {
    const { component } = withEverything();
    component.ngOnInit();
    settle();
    component.form.patchValue({ sourceTaskTypeId: 10 });
    settle();
    component.form.patchValue({ pipelineId: 'F768926' });

    // Same topic: the pipeline stays.
    component.form.patchValue({ sourceTaskTypeId: 10 });
    settle();
    expect(component.form.get('pipelineId')!.value).toBe('F768926');

    // A topic F768926 does not publish on: the pair could not dispatch, so the pipeline goes.
    component.form.patchValue({ sourceTaskTypeId: 20 });
    settle();
    expect(component.form.get('pipelineId')!.value).toBe('');
  });
});

describe('TaskEdit -- an edited task opens with its topic\'s pipelines', () => {
  it('offers the loaded task\'s pipelines even though loadTask patches silently', () => {
    const pipelines = [
      { pipelineKey: 1, pipelineId: 'F900001', pipelineName: 'Claims file loader', sourceTaskTypeId: 1148 },
      { pipelineKey: 2, pipelineId: 'F768927', pipelineName: 'Other', sourceTaskTypeId: 20 },
    ];
    const { component } = taskEditWith((url, opts) => {
      if (url.endsWith('/setting.json/topics')) return noTopics;
      if (url.endsWith('/setting.json/taskReferences')) return references(opts);
      if (url.endsWith('/pipeline.json/listForTopic')) return forTopic(pipelines, opts);
      if (url.endsWith('/pipeline.json/definition')) return of({ status: API_SUCCESS, data: null });
      if (url.endsWith('/sourceTask.json/fetchSourceTaskWithSourceTaskId')) {
        return of({ status: API_SUCCESS, data: { taskDetailId: 1469, taskName: 'Nightly claims load', taskStatus: 'Active',
          sourceTaskType: { sourceTaskTypeId: 1148 }, pipelineId: 'F900001', taskPayload: '<pipeline/>', xmlTagsInfo: [] } });
      }
      throw new Error(`unexpected GET ${url}`);
    });
    (component as any).taskDetailId = () => 1469;
    component.ngOnInit();
    settle();

    expect(component.selectedTopicId()).toBe(1148);
    expect(component.pipelineOptions().map(o => o.value)).toEqual(['F900001']);

    // A later pick still wins over the loaded value.
    component.form.patchValue({ sourceTaskTypeId: 20 });
    settle();
    expect(component.pipelineOptions().map(o => o.value)).toEqual(['F768927']);
  });
});

describe('TaskEdit -- topics are picked profile-first', () => {
  const topicsOf: Record<string, any[]> = {
    '5': [{ sourceTaskTypeId: 10, serviceName: 'Claims intake', queueTopicPartition: 'topic=claims&partitions=[*]' }],
    '6': [{ sourceTaskTypeId: 20, serviceName: 'Audit alerts', queueTopicPartition: 'topic=audit&partitions=[*]' }],
  };
  const editor = () => taskEditWith((url, opts) => {
    if (url.endsWith('/setting.json/topics') && opts?.params?.kafkaConnectionProfileId != null) {
      return of({ status: API_SUCCESS, data: topicsOf[String(opts.params.kafkaConnectionProfileId)] ?? [] });
    }
    if (url.endsWith('/setting.json/topics')) return noTopics;
    if (url.endsWith('/setting.json/taskReferences')) return references(opts);
    if (url.endsWith('/pipeline.json/listForTopic')) return forTopic([], opts);
    if (url.endsWith('/pipeline.json/definition')) return of({ status: API_SUCCESS, data: null });
    throw new Error(`unexpected GET ${url}`);
  });

  it('offers no topic until a connection is picked, then only that connection\'s', () => {
    const { component, get } = editor();
    component.ngOnInit();
    settle();

    expect(component.topicOptions()).toEqual([]);
    expect(get).not.toHaveBeenCalledWith(`${API_BASE}/setting.json/topics`, expect.anything());

    component.pickProfile('5');
    expect(get).toHaveBeenCalledWith(`${API_BASE}/setting.json/topics`, { params: { kafkaConnectionProfileId: 5 } });
    expect(component.topicOptions().map(o => o.label)).toEqual(['Claims intake']);
  });

  it('clears a topic that does not publish through the newly picked connection', () => {
    const { component } = editor();
    component.ngOnInit();
    settle();
    component.pickProfile('5');
    component.form.patchValue({ sourceTaskTypeId: 10 });
    settle();

    component.pickProfile('6');
    settle();
    expect(component.form.get('sourceTaskTypeId')!.value).toBeNull();
    expect(component.topicOptions().map(o => o.label)).toEqual(['Audit alerts']);
  });
});

/**
 * MIG-167: the Group and Home page boxes read setting.json/taskReferences. They were sub-lookups
 * of the generic Lookups table, fetched parent by parent through two endpoints that no longer
 * exist; the rows kept their ids, so a task's saved groupId/homePageId -- string ids on the
 * wire -- must still match an option's value.
 */
describe('TaskEdit -- Group and Home page choices', () => {
  const editor = (task?: any) => taskEditWith((url, opts) => {
    if (url.endsWith('/setting.json/taskReferences')) return references(opts);
    if (url.endsWith('/setting.json/topics')) return noTopics;
    if (url.endsWith('/pipeline.json/listForTopic')) return forTopic([], opts);
    if (url.endsWith('/pipeline.json/definition')) return of({ status: API_SUCCESS, data: null });
    if (task && url.endsWith('/sourceTask.json/fetchSourceTaskWithSourceTaskId')) return of({ status: API_SUCCESS, data: task });
    throw new Error(`unexpected GET ${url}`);
  });
  const referenceCalls = (get: any) => get.mock.calls
    .filter(([url]: [string]) => url.endsWith('/setting.json/taskReferences'))
    .map(([, opts]: [string, any]) => opts.params);

  it('asks for the task groups and the home pages, and nothing of the retired lookup API', () => {
    const { component, get } = editor();
    component.ngOnInit();
    settle();

    expect(referenceCalls(get)).toEqual([{ kind: 'TASK_GROUP' }, { kind: 'HOME_PAGE' }]);
    const urls = get.mock.calls.map(([url]) => url as string);
    expect(urls.some(u => /\/setting\.json\/(lookups|fetchSubLookupByParentId)$/.test(u))).toBe(false);
  });

  it('offers each by its id as a string, named, with its value beside it when it has one', () => {
    const { component } = editor();
    component.ngOnInit();
    settle();

    expect(component.groupOptions()).toEqual([
      { value: '2001', label: 'Nightly', hint: '' },
      { value: '2003', label: 'Claims (CLM)', hint: '' },
    ]);
    expect(component.homePageOptions()).toEqual([
      { value: '2002', label: 'Claims portal (https://claims.example.com)', hint: '' },
    ]);
  });

  it('asks an edited task\'s own workspace, and keeps its saved ids matching an option', () => {
    const { component, get } = editor({
      taskDetailId: 1469, tenantId: 2901, taskName: 'Nightly claims load', taskStatus: 'Active',
      homePageId: '2002', groupId: '2001', taskPayload: '<pipeline/>', xmlTagsInfo: [],
    });
    (component as any).taskDetailId = () => 1469;
    component.ngOnInit();
    settle();

    expect(referenceCalls(get)).toEqual([
      { kind: 'TASK_GROUP', tenantId: '2901' },
      { kind: 'HOME_PAGE', tenantId: '2901' },
    ]);
    expect(component.groupOptions().map(o => o.value)).toContain(component.form.get('groupId')!.value);
    expect(component.homePageOptions().map(o => o.value)).toContain(component.form.get('homePageId')!.value);
  });
});
