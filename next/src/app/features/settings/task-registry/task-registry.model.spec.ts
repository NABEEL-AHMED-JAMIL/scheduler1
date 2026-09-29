import { describe, it, expect } from 'vitest';
import { StepTaskEntry } from '../../tasks/steps/steps.model';
import { Pipeline } from '../pipelines/pipeline-dialog';
import {
  EMPTY_FILTER, filterRows, kindCounts, permissionLabel, readableSchema, registryRows, retryText, schemaShape,
  stateOf, timeoutText,
} from './task-registry.model';

const ROWS = { type: 'array', description: 'Any rows.', items: { type: 'object', additionalProperties: { type: ['string', 'null'] } } };

const task = (over: Partial<StepTaskEntry>): StepTaskEntry => ({
  code: 'filter', name: 'Filter', kind: 'Process', backingService: 'core', inputSchema: ROWS, outputSchema: ROWS,
  enabled: true, available: true, overridden: false, overridable: true, ...over,
});

const LEGACY = task({ code: 'legacy', name: 'Legacy pipeline', kind: 'Legacy', backingService: 'worker', outputSchema: null,
  overridable: false, runsInEngine: false, aiToolName: 'run_legacy_pipeline' });
const pipeline = (over: Partial<Pipeline>): Pipeline => ({
  pipelineKey: 100167, pipelineId: 'REF_CSV_CHECK_V1', pipelineName: 'Reference: CSV check', status: 'Active',
  sourceTaskTypeId: 11831, topicName: 'service-1 reference worker', kafkaTopic: 'etl.reference', fieldCount: 7, requiredCount: 3, ...over,
});

describe('Task Registry -- the rows', () => {
  it('lists the step tasks by kind (Read, Process, Output), then one Legacy row per pipeline', () => {
    const tasks = [
      task({ code: 'save_file', name: 'Save File', kind: 'Output' }),
      task({ code: 'filter' }),
      LEGACY,
      task({ code: 'sample', name: 'Sample rows', kind: 'Read', inputSchema: null }),
      { ...LEGACY, name: 'Legacy: Reference: CSV check', pipelineKey: 100167, pipelineId: 'REF_CSV_CHECK_V1', config: { pipelineId: 'REF_CSV_CHECK_V1' } },
    ];
    const rows = registryRows(tasks, [pipeline({}), pipeline({ pipelineKey: 100175, pipelineId: 'UI_CHECK_STEPS_0928', pipelineName: 'UI-CHECK steps' })]);
    expect(rows.map(r => `${r.kind}:${r.code}`)).toEqual([
      'Read:sample', 'Process:filter', 'Output:save_file', 'Legacy:REF_CSV_CHECK_V1', 'Legacy:UI_CHECK_STEPS_0928',
    ]);
    expect(rows[3]).toMatchObject({ id: 'legacy:100167', name: 'Reference: CSV check', service: 'worker', legacy: true });
    // The pipeline's own registry line where Core sent one; the generic legacy line otherwise.
    expect(rows[3].task.pipelineKey).toBe(100167);
    expect(rows[4].task.pipelineKey).toBeUndefined();
    expect(rows[4].task.aiToolName).toBe('run_legacy_pipeline');
  });

  it('keeps every pipeline as a legacy row even when the registry could not be read', () => {
    const rows = registryRows([], [pipeline({})]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'Legacy', code: 'REF_CSV_CHECK_V1', legacy: true, state: 'On' });
    expect(rows[0].task.code).toBe('legacy');
  });

  it('summarises input and output: none, rows, named columns; a legacy pipeline takes its payload to its worker', () => {
    expect(schemaShape(null)).toBe('None');
    expect(schemaShape(ROWS)).toBe('Rows');
    expect(schemaShape({ type: 'array', items: { type: 'object', properties: { id: {}, name: {} } } })).toBe('Rows: id, name');
    expect(schemaShape({ type: 'object' })).toBe('Object');
    const [read, legacy] = registryRows([task({ code: 'sample', kind: 'Read', inputSchema: null })], [pipeline({})]);
    expect([read.input, read.output]).toEqual(['None', 'Rows']);
    expect([legacy.input, legacy.output]).toEqual(['Payload: 7 fields', 'Worker']);
    expect(registryRows([], [pipeline({ fieldCount: 1 })])[0].input).toBe('Payload: 1 field');
  });
});

describe('Task Registry -- state', () => {
  it('is Unavailable when the platform cannot run it, with Core\'s reason', () => {
    expect(stateOf(task({ available: false, enabled: false, disabledReason: 'storage-service is off' })))
      .toEqual({ state: 'Unavailable', reason: 'storage-service is off' });
    expect(stateOf(task({ available: false, enabled: false })).reason).toBe('The platform cannot run it yet.');
  });

  it('is Off when switched off here or off by default', () => {
    expect(stateOf(task({ enabled: false, overridden: true }))).toEqual({ state: 'Off', reason: 'Switched off in this workspace.' });
    expect(stateOf(task({ enabled: false, enabledByDefault: false }))).toEqual({ state: 'Off', reason: 'Off by default.' });
  });

  it('is On otherwise; a legacy row is On while its pipeline is Active', () => {
    expect(stateOf(task({}))).toEqual({ state: 'On', reason: '' });
    const [active, inactive] = registryRows([], [pipeline({}), pipeline({ pipelineKey: 2, status: 'Inactive' })]);
    expect(active.state).toBe('On');
    expect([inactive.state, inactive.reason]).toEqual(['Off', 'The pipeline is Inactive.']);
  });
});

describe('Task Registry -- filters', () => {
  const rows = registryRows([
    task({ code: 'sample', name: 'Sample rows', kind: 'Read', inputSchema: null }),
    task({ code: 'filter', description: 'Keeps the rows that meet its conditions.' }),
    task({ code: 'write_database', name: 'Write Database', kind: 'Output', backingService: 'integration-service', available: false, enabled: false }),
    task({ code: 'join', name: 'Join', enabled: false, overridden: true }),
  ], [pipeline({}), pipeline({ pipelineKey: 2, pipelineId: 'OTHER', pipelineName: 'Other', topicName: 'claims', status: 'Inactive' })]);

  it('by kind', () => {
    expect(filterRows(rows, { ...EMPTY_FILTER, kind: 'Legacy' }).map(r => r.code)).toEqual(['REF_CSV_CHECK_V1', 'OTHER']);
    expect(filterRows(rows, { ...EMPTY_FILTER, kind: 'Read' }).map(r => r.code)).toEqual(['sample']);
  });

  it('by state', () => {
    expect(filterRows(rows, { ...EMPTY_FILTER, state: 'Unavailable' }).map(r => r.code)).toEqual(['write_database']);
    expect(filterRows(rows, { ...EMPTY_FILTER, state: 'Off' }).map(r => r.code)).toEqual(['join', 'OTHER']);
  });

  it('by text: name, code, description, service, pipeline id and topic', () => {
    const search = (text: string) => filterRows(rows, { ...EMPTY_FILTER, search: text }).map(r => r.code);
    expect(search('conditions')).toEqual(['filter']);
    expect(search('INTEGRATION')).toEqual(['write_database']);
    expect(search('claims')).toEqual(['OTHER']);
    expect(search('ref_csv')).toEqual(['REF_CSV_CHECK_V1']);
  });

  it('counts each kind for the kind chips', () => {
    expect(kindCounts(rows)).toEqual({ '': 6, Read: 1, Process: 2, Output: 1, Legacy: 2 });
  });
});

describe('Task Registry -- the panel\'s words', () => {
  it('says who may use a task', () => {
    expect(permissionLabel('TENANT_USER')).toBe('Any member');
    expect(permissionLabel('TENANT_ADMIN')).toBe('Workspace administrators');
    expect(permissionLabel(null)).toBe('Any member');
  });

  it('says how it retries and how long it may run', () => {
    expect(retryText({ maxAttempts: 1, delaySeconds: 0 })).toBe('Once, no retry');
    expect(retryText({ maxAttempts: 3, delaySeconds: 10 })).toBe('Up to 3 tries, 10 s apart');
    expect(retryText(null)).toBe('Once, no retry');
    expect(timeoutText(null)).toBe('No limit');
    expect(timeoutText(300)).toBe('5 min');
    expect(timeoutText(90)).toBe('90 s');
    expect(timeoutText(7200)).toBe('2 h');
  });

  it('reads a config schema as a field list: kind, required, default, choices, and a group\'s own fields', () => {
    const fields = readableSchema({
      type: 'object', required: ['conditions'],
      properties: {
        match: { type: 'string', enum: ['all', 'any'], title: 'Keep a row that meets', default: 'all' },
        conditions: {
          type: 'array', title: 'Conditions', minItems: 1, maxItems: 50,
          items: { type: 'object', required: ['column'], properties: { column: { type: 'string', format: 'column', title: 'Column' } } },
        },
        bucket: { type: 'string', format: 'bucket', title: 'Bucket', description: 'A storage connection.' },
        maxRows: { type: 'integer', minimum: 1, maximum: 50000, title: 'At most rows' },
        variables: { type: 'object', additionalProperties: { type: 'string' }, title: 'Variables' },
      },
    });
    expect(fields.map(f => [f.name, f.label, f.type, f.required])).toEqual([
      ['match', 'Keep a row that meets', 'One of', false],
      ['conditions', 'Conditions', 'Repeatable group', true],
      ['bucket', 'Bucket', 'Bucket', false],
      ['maxRows', 'At most rows', 'Whole number', false],
      ['variables', 'Variables', 'Names and values (text)', false],
    ]);
    expect(fields[0].notes).toEqual(['Default: all', 'Choices: all, any']);
    expect(fields[1].notes).toEqual(['1 to 50 rows']);
    expect(fields[1].children.map(c => [c.name, c.type, c.required])).toEqual([['column', 'Column', true]]);
    expect(fields[2].description).toBe('A storage connection.');
    expect(fields[3].notes).toEqual(['1 to 50000']);
  });

  it('reads no schema as no fields', () => {
    expect(readableSchema(null)).toEqual([]);
    expect(readableSchema({ type: 'object', properties: {} })).toEqual([]);
  });
});
