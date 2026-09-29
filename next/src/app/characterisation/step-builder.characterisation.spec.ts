import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { click, closeOverlays, detailsOf, overlay, pin, restoreClock, surfaceOf, visit } from './harness';
import { PINNED } from './pinned/step-builder';

/**
 * MIG-249 characterisation baseline: the step builder on a pipeline's edit page.
 *
 * The answers are Core's, as it gave them on 2026-09-28 for workspace A (2924): task 1864 "UI-CHECK step engine task
 * 0928" on pipeline 100175 UI_CHECK_STEPS_0928, whose saved version 1 is two steps (sample -> select), run by the
 * manual job 2848; and the shared legacy pipeline 100167 REF_CSV_CHECK_V1, opened as steps without being saved. The
 * legacy edit page itself -- no tabs, today's form -- is pinned in source-tasks.
 */
const FILE = 'step-builder';

const TASK_1864 = {
  taskDetailId: 1864, tenantId: 2924, taskName: 'UI-CHECK step engine task 0928', taskStatus: 'Active', pipelineId: 'UI_CHECK_STEPS_0928',
  taskPayload: '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<pipeline>\n  <note>MIG-230 live check</note>\n</pipeline>',
  sourceTaskType: { sourceTaskTypeId: 11831, serviceName: 'service-1 reference worker', queueTopicPartition: 'topic=etl.reference&partitions=[*]', status: 'Active' },
  xmlTagsInfo: [{ taskPayloadId: 4906, tagKey: 'note', tagParent: null, tagValue: 'MIG-230 live check' }],
};
const PIPELINES = { status: 'SUCCESS', message: '2 pipeline(s).', data: [
  { pipelineKey: 100175, pipelineId: 'UI_CHECK_STEPS_0928', pipelineName: 'UI-CHECK step engine 0928', tenantId: 2924, sourceTaskTypeId: 11831, status: 'Active' },
  { pipelineKey: 100167, pipelineId: 'REF_CSV_CHECK_V1', pipelineName: 'Reference: CSV check and summarise', tenantId: 2924, sourceTaskTypeId: 11831, status: 'Active' },
] };
const STEPS_100175 = { status: 'SUCCESS', message: 'Pipeline definition version 1.', data: {
  legacy: false,
  definition: { version: 1, steps: [
    { key: 'read', task: 'sample', config: { rows: [{ id: 1, name: 'Ada' }, { id: 2, name: 'Bo' }] } },
    { key: 'keep', task: 'select', config: { columns: { name: 'patient' } } },
  ] },
  json: '{\n  "version" : 1\n}',
  yaml: 'version: 1\nsteps:\n- key: read\n  task: sample\n  config:\n    rows:\n    - id: 1\n      name: Ada\n    - id: 2\n      name: Bo\n- key: keep\n  task: select\n  config:\n    columns:\n      name: patient\n',
  pipelineKey: 100175, pipelineId: 'UI_CHECK_STEPS_0928', stored: true, version: 1,
  versions: [{ version: 1, pipelineDefinitionId: 1000, createdBy: 4537, dateCreated: '2026-09-29T04:14:59.098917Z' }],
} };
const LEGACY_100167 = { status: 'SUCCESS', message: 'No definition is saved: the pipeline runs as its legacy step.', data: {
  legacy: true,
  definition: { version: 1, source: { type: 'task' }, steps: [{ key: 'legacy', name: 'Legacy pipeline REF_CSV_CHECK_V1', task: 'legacy', config: { pipelineId: 'REF_CSV_CHECK_V1' } }] },
  json: '{}', yaml: 'version: 1\n', pipelineKey: 100167, pipelineId: 'REF_CSV_CHECK_V1', stored: false, version: null, versions: [],
} };
const TASKS = { status: 'SUCCESS', message: '3 step task(s).', data: [
  { code: 'legacy', description: "An existing pipeline, run by its worker exactly as before (the task's XML payload over Kafka).", runsInEngine: false },
  { code: 'sample', description: 'Rows written in the step itself: a sample to build and test a pipeline on.', runsInEngine: true },
  { code: 'select', description: 'Keeps the columns it names, in that order, optionally renamed.', runsInEngine: true },
] };
const JOBS = { status: 'SUCCESS', message: 'OK', data: [{ jobId: 2848, jobName: 'UI-CHECK step engine job 0928', jobStatus: 'Active', execution: 'Manual' }] };

const ANSWERS: Record<string, unknown> = {
  'GET /sourceTask.json/fetchSourceTaskWithSourceTaskId': { status: 'SUCCESS', message: 'SourceTask found with 1864.', data: TASK_1864 },
  'GET /pipeline.json/listForTopic': PIPELINES,
  'GET /pipeline.json/definition': { status: 'SUCCESS', message: 'No form.', data: null },
  'GET /pipeline.json/steps/definition': STEPS_100175,
  'GET /pipeline.json/steps/tasks': TASKS,
  'POST /sourceTask.json/fetchAllLinkJobsWithSourceTaskId': JOBS,
};
const LEGACY_ANSWERS: Record<string, unknown> = {
  ...ANSWERS,
  'GET /sourceTask.json/fetchSourceTaskWithSourceTaskId': { status: 'SUCCESS', message: 'SourceTask found.', data: { ...TASK_1864, pipelineId: 'REF_CSV_CHECK_V1' } },
  'GET /pipeline.json/steps/definition': LEGACY_100167,
};

describe('MIG-249: the step builder', () => {
  useMemoryStorage();
  afterEach(() => { restoreClock(); closeOverlays(); });

  it('a pipeline with steps opens on them', async () => {
    const v = await visit('/pipelines/1864/edit', 'TENANT_ADMIN', null, ANSWERS);
    pin(FILE, 'a pipeline with steps opens on them', v.surface, PINNED);
  });

  it('its Details tab is the task form', async () => {
    const v = await visit('/pipelines/1864/edit?tab=details', 'TENANT_ADMIN', null, ANSWERS);
    pin(FILE, 'its Details tab is the task form', { ...surfaceOf(v.main), hidden: Array.from(v.main.querySelectorAll('.hidden')).map(e => e.tagName.toLowerCase()) }, PINNED);
  });

  it('Settings', async () => {
    const v = await visit('/pipelines/1864/edit?tab=settings', 'TENANT_ADMIN', null, ANSWERS);
    pin(FILE, 'Settings', surfaceOf(v.main), PINNED);
  });

  it('YAML', async () => {
    const v = await visit('/pipelines/1864/edit?tab=yaml', 'TENANT_ADMIN', null, ANSWERS);
    pin(FILE, 'YAML', { ...surfaceOf(v.main), details: detailsOf(v.main) }, PINNED);
  });

  it('JSON', async () => {
    const v = await visit('/pipelines/1864/edit?tab=json', 'TENANT_ADMIN', null, ANSWERS);
    pin(FILE, 'JSON', { ...surfaceOf(v.main), details: detailsOf(v.main) }, PINNED);
  });

  it('a step in the side panel', async () => {
    const v = await visit('/pipelines/1864/edit', 'TENANT_ADMIN', null, ANSWERS);
    await click(v, 'Edit step keep');
    pin(FILE, 'a step in the side panel', overlay(), PINNED);
  });

  it('Validate, with a problem on a step', async () => {
    const v = await visit('/pipelines/1864/edit', 'TENANT_ADMIN', null, {
      ...ANSWERS,
      'POST /pipeline.json/steps/validate': { status: 'ERROR', message: 'The definition has 1 problem(s): steps[1].config.columns: a list of column names, or an object {from: to}', data: {
        valid: false, problems: [{ path: 'steps[1].config.columns', message: 'a list of column names, or an object {from: to}' }],
      } },
    });
    const requests = await click(v, 'Validate');
    pin(FILE, 'Validate, with a problem on a step', { requests, ...surfaceOf(v.main), problems: Array.from(v.main.querySelectorAll('.has-problems')).map(e => e.getAttribute('data-step')) }, PINNED);
  });

  it('a legacy pipeline asked for its steps', async () => {
    const v = await visit('/pipelines/1854/edit?tab=steps', 'TENANT_ADMIN', null, LEGACY_ANSWERS);
    pin(FILE, 'a legacy pipeline asked for its steps', v.surface, PINNED);
  });

  it('a new schedule for the pipeline', async () => {
    const v = await visit('/pipelines/schedules/new?taskDetailId=1864', 'TENANT_ADMIN', null, {
      ...ANSWERS, 'POST /sourceTask.json/listSourceTask': { status: 'SUCCESS', message: 'OK', data: [TASK_1864] },
    });
    pin(FILE, 'a new schedule for the pipeline', { url: v.surface.url, task: (v.main.querySelector('input#task') as HTMLInputElement | null)?.value }, PINNED);
  });
});
