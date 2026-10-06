import { describe, it, expect } from 'vitest';
import {
  Definition, StepTaskEntry, addStep, canonical, coerce, inputColumns, isMapSchema, mapValueKind, outputColumns, refusalOf, definitionJson, fieldsOf, isLegacyDefinition, moveStep, nextKey, problemsByStep,
  removeStep, replaceStep, runFinished, sampleRowsOf, schemaSupported, seedConfig, taskEntry, taskOptions, toYaml, updateSettings,
  withSample, parseSampleRows,
} from './steps.model';

/**
 * MIG-249: the step builder's rules, without a screen. The definition is MIG-230's (PipelineDefinition.java): version,
 * source, ordered steps, settings. The builder, the YAML tab and the JSON tab are three views of one object, so the
 * round trip -- builder to JSON to builder, builder to YAML to the server's JSON -- is what these pin.
 */
const TWO: Definition = {
  version: 1,
  steps: [
    { key: 'read', task: 'sample', config: { rows: [{ id: 1, name: 'Ada' }, { id: 2, name: 'Bo' }] } },
    { key: 'keep', task: 'select', config: { columns: { name: 'patient' } } },
  ],
};

/** Lines as MIG-231's registry sends them (GET pipeline.json/steps/tasks), cut to what these rules read. */
const TASKS: StepTaskEntry[] = [
  { code: 'aggregate', name: 'Aggregate', kind: 'Process', description: 'Groups rows.', runsInEngine: true, enabled: true, available: true, requiredPermission: 'TENANT_USER' },
  { code: 'legacy', name: 'Legacy: REF', kind: 'Legacy', description: 'An existing pipeline.', runsInEngine: false, enabled: true, pipelineKey: 100167, pipelineId: 'REF', config: { pipelineId: 'REF' } },
  { code: 'legacy', name: 'Legacy: UI-CHECK', kind: 'Legacy', description: 'An existing pipeline.', runsInEngine: false, enabled: true, pipelineKey: 100175, pipelineId: 'UI', config: { pipelineId: 'UI' } },
  { code: 'read_api', name: 'Read API', kind: 'Read', description: 'Calls an API.', runsInEngine: true, enabled: false, available: false,
    disabledReason: "integration-service's internal pipeline endpoints are not deployed yet" },
  { code: 'sample', name: 'sample', kind: 'Read', description: 'Rows written in the step itself.', runsInEngine: true, enabled: true, available: true },
  { code: 'save_file', name: 'Save File', kind: 'Output', description: 'Keeps the rows as a file.', runsInEngine: true, enabled: true, available: true },
  { code: 'select', name: 'select', kind: 'Process', description: 'Keeps the columns it names.', runsInEngine: true, enabled: true, available: true },
  {
    code: 'filter', name: 'Filter rows', kind: 'Process', description: 'Keeps the rows that match.', runsInEngine: true, enabled: false, available: true,
    disabledReason: 'Switched off in this workspace.', configSchema: { type: 'object', properties: { column: { type: 'string' } } },
  },
  { code: 'upload_bucket', name: 'Upload to Bucket', kind: 'Output', description: 'Uploads.', runsInEngine: true, enabled: true, available: true, requiredPermission: 'TENANT_ADMIN' },
];

describe('steps model -- the definition as three views', () => {
  it('writes the builder\'s definition as the JSON the server stores, keys in its order', () => {
    const text = definitionJson(TWO);
    expect(JSON.parse(text)).toEqual(TWO);
    expect(text.indexOf('"version"')).toBeLessThan(text.indexOf('"steps"'));
    expect(text.indexOf('"key"')).toBeLessThan(text.indexOf('"task"'));
  });

  it('round-trips builder -> JSON -> builder unchanged', () => {
    expect(canonical(JSON.parse(definitionJson(TWO)))).toEqual(canonical(TWO));
  });

  it('drops what a person left blank, so a builder edit and a YAML edit save the same text', () => {
    const edited: Definition = {
      version: 1, source: { type: 'none' },
      steps: [{ key: 'read', name: '', task: 'sample', input: '', config: { rows: [] }, retry: {}, timeoutSeconds: null, onError: '' } as any],
      settings: { datasetRetentionHours: null, defaultTimeoutSeconds: undefined, defaultOnError: '' } as any,
    };
    expect(canonical(edited)).toEqual({ version: 1, source: { type: 'none' }, steps: [{ key: 'read', task: 'sample', config: { rows: [] } }] });
  });

  it('orders every level as the server does, whatever order the builder built it in', () => {
    const scrambled = { steps: [{ onError: 'fail', task: 'sample', key: 'read', retry: { delaySeconds: 5, maxAttempts: 2 } }], version: 1 } as any;
    expect(Object.keys(canonical(scrambled))).toEqual(['version', 'steps']);
    expect(Object.keys(canonical(scrambled).steps[0])).toEqual(['key', 'task', 'retry', 'onError']);
    expect(Object.keys(canonical(scrambled).steps[0].retry!)).toEqual(['maxAttempts', 'delaySeconds']);
  });

  it('writes YAML the server reads back to the same definition (plain words bare, anything else quoted)', () => {
    expect(toYaml(TWO)).toBe([
      'version: 1',
      'steps:',
      '- key: read',
      '  task: sample',
      '  config:',
      '    rows:',
      '    - id: 1',
      '      name: Ada',
      '    - id: 2',
      '      name: Bo',
      '- key: keep',
      '  task: select',
      '  config:',
      '    columns:',
      '      name: patient',
      '',
    ].join('\n'));
  });

  it('quotes a YAML value that would read as something else', () => {
    const yaml = toYaml({ version: 1, steps: [{ key: 'a', task: 'sample', config: { rows: [
      { flag: 'yes', num: '12', empty: '', colon: 'a: b', hash: 'x #y', nul: null, t: true, lead: ' pad', multi: 'l1\nl2', dash: '-x' },
    ] } }] });
    expect(yaml).toContain('flag: "yes"');
    expect(yaml).toContain('num: "12"');
    expect(yaml).toContain('empty: ""');
    expect(yaml).toContain('colon: "a: b"');
    expect(yaml).toContain('hash: "x #y"');
    expect(yaml).toContain('nul: null');
    expect(yaml).toContain('t: true');
    expect(yaml).toContain('lead: " pad"');
    expect(yaml).toContain('multi: "l1\\nl2"');
    expect(yaml).toContain('dash: "-x"');
    // A key YAML 1.1 reads as a boolean is quoted too.
    expect(toYaml({ version: 1, steps: [{ key: 'a', task: 'sample', config: { n: 1 } }] })).toContain('"n": 1');
  });

  it('writes empty lists and objects inline', () => {
    expect(toYaml({ version: 1, steps: [{ key: 'a', task: 'sample', config: { rows: [] } }], settings: {} } as any))
      .toContain('    rows: []');
  });
});

describe('steps model -- the step cards', () => {
  it('adds a step with a key made from its task, unique among the others', () => {
    const one = addStep(TWO, taskEntry(TASKS, 'select')!);
    expect(one.steps.map(s => s.key)).toEqual(['read', 'keep', 'select']);
    const two = addStep(one, taskEntry(TASKS, 'select')!);
    expect(two.steps.map(s => s.key)).toEqual(['read', 'keep', 'select', 'select_2']);
    expect(TWO.steps).toHaveLength(2);
  });

  it('makes a key the server accepts from any task code', () => {
    expect(nextKey('Read-CSV', [])).toBe('read_csv');
    expect(nextKey('9lives', [])).toBe('step_9lives');
    expect(nextKey('', ['step'])).toBe('step_2');
  });

  it('seeds a new step\'s config from its schema defaults and nothing else', () => {
    expect(seedConfig({ type: 'object', required: ['columns'], properties: {
      columns: { type: 'array', items: { type: 'string' } }, required: { type: 'boolean', default: false }, note: { type: 'string' },
    } })).toEqual({ columns: [], required: false });
    expect(seedConfig(undefined)).toBeUndefined();
  });

  it('replaces the one legacy step when a real step is added: a legacy step must be the only one', () => {
    const legacy: Definition = { version: 1, source: { type: 'task' }, steps: [{ key: 'legacy', name: 'Legacy pipeline P', task: 'legacy', config: { pipelineId: 'P' } }] };
    expect(isLegacyDefinition(legacy)).toBe(true);
    const next = addStep(legacy, taskEntry(TASKS, 'sample')!);
    expect(next.steps.map(s => s.task)).toEqual(['sample']);
    expect(isLegacyDefinition(next)).toBe(false);
  });

  it('moves a step up or down, and ignores a move past either end', () => {
    expect(moveStep(TWO, 1, -1).steps.map(s => s.key)).toEqual(['keep', 'read']);
    expect(moveStep(TWO, 0, 1).steps.map(s => s.key)).toEqual(['keep', 'read']);
    expect(moveStep(TWO, 0, -1)).toBe(TWO);
    expect(moveStep(TWO, 1, 1)).toBe(TWO);
  });

  it('moves a dragged step to where it was dropped', () => {
    const three = addStep(TWO, taskEntry(TASKS, 'select')!);
    expect(moveStep(three, 0, 2).steps.map(s => s.key)).toEqual(['keep', 'select', 'read']);
  });

  it('deletes a step, and clears an input that named it', () => {
    const chained: Definition = { ...TWO, steps: [...TWO.steps, { key: 'last', task: 'select', input: 'keep', config: { columns: ['patient'] } }] };
    const next = removeStep(chained, 1);
    expect(next.steps.map(s => s.key)).toEqual(['read', 'last']);
    expect(next.steps[1].input).toBeUndefined();
  });

  it('renames an input that pointed at a step whose key changed', () => {
    const chained: Definition = { ...TWO, steps: [...TWO.steps, { key: 'last', task: 'select', input: 'keep', config: { columns: ['patient'] } }] };
    const next = replaceStep(chained, 1, { ...chained.steps[1], key: 'shape' });
    expect(next.steps[2].input).toBe('shape');
  });

  it('changes a setting and removes one set back to its default', () => {
    const set = updateSettings(TWO, { defaultOnError: 'continue', datasetRetentionHours: 48 });
    expect(set.settings).toEqual({ defaultOnError: 'continue', datasetRetentionHours: 48 });
    expect(canonical(updateSettings(set, { defaultOnError: '', datasetRetentionHours: null })).settings).toBeUndefined();
  });
});

describe('steps model -- validation errors point at the step', () => {
  const problems = [
    { path: 'steps[1].config.columns', message: 'a list of column names, or an object {from: to}' },
    { path: 'steps[1].retry.maxAttempts', message: 'between 1 and 10' },
    { path: 'steps[0].key', message: 'lower case letters' },
    { path: 'settings.defaultOnError', message: 'one of [fail, continue, skip_rest]' },
    { path: '$', message: 'Unrecognized field "stepz"' },
  ];

  it('files each problem under its step, with the field it names', () => {
    const grouped = problemsByStep(problems);
    expect(grouped.steps[1]).toEqual([
      { field: 'config.columns', message: 'a list of column names, or an object {from: to}' },
      { field: 'retry.maxAttempts', message: 'between 1 and 10' },
    ]);
    expect(grouped.steps[0]).toEqual([{ field: 'key', message: 'lower case letters' }]);
    expect(grouped.other).toEqual([
      { path: 'settings.defaultOnError', message: 'one of [fail, continue, skip_rest]' },
      { path: '$', message: 'Unrecognized field "stepz"' },
    ]);
  });

  it('has nothing to say about a definition with no problems', () => {
    expect(problemsByStep([])).toEqual({ steps: {}, other: [] });
    expect(problemsByStep(undefined)).toEqual({ steps: {}, other: [] });
  });
});

describe('steps model -- Add step from the Task Registry', () => {
  it('offers every task but the legacy ones, grouped by kind -- Read, Process, Output -- what can be added first', () => {
    const options = taskOptions(TASKS);
    expect(options.map(o => [o.group, o.value])).toEqual([
      ['Read', 'sample'], ['Read', 'read_api'], ['Process', 'aggregate'], ['Process', 'select'], ['Process', 'filter'],
      ['Output', 'save_file'], ['Output', 'upload_bucket'],
    ]);
  });

  it('lists a task that is off, with the registry\'s reason, and does not let it be picked', () => {
    const options = taskOptions(TASKS);
    expect(options.find(o => o.value === 'filter')).toMatchObject({ label: 'Filter rows (disabled)', disabled: true, hint: 'Switched off in this workspace.' });
    expect(options.find(o => o.value === 'read_api')).toMatchObject({ disabled: true, hint: "integration-service's internal pipeline endpoints are not deployed yet" });
    expect(options.find(o => o.value === 'sample')).toMatchObject({ label: 'sample', disabled: false, hint: 'Rows written in the step itself.' });
  });

  it('keeps a task that needs a workspace administrator from anyone else', () => {
    expect(taskOptions(TASKS, true).find(o => o.value === 'upload_bucket')!.disabled).toBe(false);
    expect(taskOptions(TASKS, false).find(o => o.value === 'upload_bucket')).toMatchObject({
      disabled: true, hint: 'Only a workspace administrator can add this task.',
    });
    expect(refusalOf(undefined, true)).toBe('Not in the Task Registry.');
  });

  it('finds a legacy step\'s own line: the registry lists legacy once per pipeline', () => {
    expect(taskEntry(TASKS, 'legacy', { key: 'legacy', task: 'legacy', config: { pipelineId: 'UI' } })!.name).toBe('Legacy: UI-CHECK');
    expect(taskEntry(TASKS, 'select')!.name).toBe('select');
  });
});

describe('steps model -- the columns a step can pick from', () => {
  const chain: Definition = { version: 1, steps: [
    { key: 'read', task: 'sample', config: { rows: [{ id: 1, name: 'Ada' }, { id: 2, city: 'Oslo' }] } },
    { key: 'only', task: 'filter', config: { conditions: [] } },
    { key: 'shape', task: 'select', config: { columns: { name: 'patient', id: 'id' } } },
    { key: 'map', task: 'transform', config: { mappings: [{ target: 'upper_name', op: 'upper', source: 'patient' }], keepUnmapped: true } },
    { key: 'sum', task: 'aggregate', config: { groupBy: ['patient'], aggregations: [{ op: 'count', as: 'n' }] } },
    { key: 'both', task: 'join', input: 'read', config: { with: 'sum', on: [{ left: 'name', right: 'patient' }] } },
    { key: 'api', task: 'read_api', config: {} },
    { key: 'after', task: 'save_file', config: { fileName: 'x.csv' } },
  ] };

  it('follows the rows through the steps the definition describes', () => {
    expect(outputColumns(chain, 0)).toEqual(['id', 'name', 'city']);
    expect(inputColumns(chain, 1)).toEqual(['id', 'name', 'city']);
    expect(outputColumns(chain, 1)).toEqual(['id', 'name', 'city']);
    expect(outputColumns(chain, 2)).toEqual(['patient', 'id']);
    expect(outputColumns(chain, 3)).toEqual(['patient', 'id', 'upper_name']);
    expect(outputColumns(chain, 4)).toEqual(['patient', 'n']);
    expect(inputColumns(chain, 5)).toEqual(['id', 'name', 'city']);
    expect(outputColumns(chain, 5)).toEqual(['id', 'name', 'city', 'patient', 'n']);
  });

  it('cannot tell after a step that reads from outside, nor for the first step', () => {
    expect(outputColumns(chain, 6)).toBeNull();
    expect(inputColumns(chain, 7)).toBeNull();
    expect(inputColumns(chain, 0)).toBeNull();
  });

  it('takes the columns a task\'s outputSchema names over anything else', () => {
    const tasks: StepTaskEntry[] = [{ code: 'read_api', outputSchema: { type: 'array', items: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } } } } }];
    expect(inputColumns(chain, 7, tasks)).toEqual(['a', 'b']);
  });
});

describe('steps model -- a config form from the task\'s JSON Schema', () => {
  const schema = {
    type: 'object',
    required: ['path'],
    properties: {
      path: { type: 'string', title: 'Path', description: 'Inside the connection.' },
      format: { type: 'string', enum: ['csv', 'json'], default: 'csv' },
      header: { type: 'boolean', default: true },
      limit: { type: 'integer' },
      ratio: { type: 'number' },
      note: { type: 'string', maxLength: 2000 },
      columns: { type: 'array', items: { type: 'string' } },
      renames: { type: 'array', items: { type: 'object', required: ['from'], properties: { from: { type: 'string' }, to: { type: 'string' } } } },
      options: { type: 'object', properties: { quote: { type: 'string' } } },
      anything: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    },
  };

  it('turns each property into a field of the kind it needs', () => {
    const fields = fieldsOf(schema);
    expect(fields.map(f => [f.name, f.kind])).toEqual([
      ['path', 'text'], ['format', 'enum'], ['header', 'boolean'], ['limit', 'integer'], ['ratio', 'number'], ['note', 'textarea'],
      ['columns', 'list'], ['renames', 'objects'], ['options', 'object'], ['anything', 'json'],
    ]);
    expect(fields[0]).toMatchObject({ label: 'Path', required: true, description: 'Inside the connection.' });
    expect(fields[1]).toMatchObject({ label: 'format', options: ['csv', 'json'], required: false });
  });

  it('reads the registry\'s widget hints and type lists', () => {
    const fields = fieldsOf({ type: 'object', properties: {
      column: { type: 'string', title: 'Column', format: 'column' },
      with: { type: 'string', title: 'Join with', format: 'step' },
      query: { type: 'string', title: 'Query', format: 'sql' },
      title: { type: 'string', title: 'Title', format: 'template', maxLength: 200 },
      message: { type: 'string', title: 'Message', format: 'multiline' },
      groupBy: { type: 'array', title: 'Group by', items: { type: 'string', format: 'column' } },
      value: { type: ['string', 'number', 'boolean', 'null'], title: 'Value' },
      values: { type: 'array', title: 'Values', items: { type: ['string', 'number', 'boolean', 'null'] } },
      columns: { type: ['array', 'object'], title: 'Columns' },
      maybe: { type: ['string', 'null'], title: 'Maybe' },
      bucket: { type: 'string', title: 'Bucket', format: 'bucket' },
      headers: { type: 'object', title: 'Headers', additionalProperties: { type: 'string' } },
      rows: { type: 'array', title: 'Rows', items: { type: 'object', additionalProperties: { type: ['string', 'number', 'boolean', 'null'] } } },
    } });
    expect(fields.map(f => [f.name, f.kind, f.itemKind ?? ''])).toEqual([
      ['column', 'column', ''], ['with', 'step', ''], ['query', 'textarea', ''], ['title', 'textarea', ''], ['message', 'textarea', ''],
      ['groupBy', 'columns', ''], ['value', 'scalar', ''], ['values', 'list', 'scalar'], ['columns', 'json', ''], ['maybe', 'text', ''],
      ['bucket', 'text', ''], ['headers', 'object', ''], ['rows', 'objects', ''],
    ]);
    expect(isMapSchema(fields[11].schema)).toBe(true);
    expect(mapValueKind(fields[11].schema)).toBe('text');
    expect(mapValueKind(fields[12].schema.items)).toBe('scalar');
  });

  it('reads a box that may hold text, a number or true/false the way JSON would', () => {
    expect(coerce('scalar', '12')).toBe(12);
    expect(coerce('scalar', '-1.5')).toBe(-1.5);
    expect(coerce('scalar', 'true')).toBe(true);
    expect(coerce('scalar', 'null')).toBeNull();
    expect(coerce('scalar', '007')).toBe('007');
    expect(coerce('scalar', 'Ada')).toBe('Ada');
    expect(coerce('scalar', '')).toBeUndefined();
  });

  it('says a schema it can draw in full is supported, and one with an expression it cannot is not', () => {
    expect(schemaSupported({ type: 'object', properties: { a: { type: 'string' } } })).toBe(true);
    expect(schemaSupported(schema)).toBe(false);
    expect(schemaSupported(undefined)).toBe(false);
    expect(schemaSupported({ type: 'object' })).toBe(false);
  });
});

describe('steps model -- a run\'s end', () => {
  it('stops following a run once its status is final', () => {
    for (const s of ['Completed', 'Failed', 'Interrupt', 'Skip']) expect(runFinished(s)).toBe(true);
    for (const s of ['Queue', 'Start', 'Running', null]) expect(runFinished(s)).toBe(false);
  });
});

describe('steps model -- Test with sample', () => {
  it('reads the rows of a first sample step, to start the sample from', () => {
    expect(sampleRowsOf(TWO)).toEqual([{ id: 1, name: 'Ada' }, { id: 2, name: 'Bo' }]);
    expect(sampleRowsOf({ version: 1, steps: [{ key: 'keep', task: 'select' }] })).toEqual([]);
  });

  it('puts the rows in the first step when it is a sample, and leaves the rest alone', () => {
    const next = withSample(TWO, [{ id: 9 }]);
    expect(next.steps.map(s => s.key)).toEqual(['read', 'keep']);
    expect(next.steps[0].config).toEqual({ rows: [{ id: 9 }] });
    expect(next.steps[1]).toBe(TWO.steps[1]);
  });

  it('adds a sample step in front of steps that have none', () => {
    const next = withSample({ version: 1, steps: [{ key: 'keep', task: 'select', config: { columns: ['id'] } }] }, [{ id: 9 }]);
    expect(next.steps.map(s => [s.key, s.task])).toEqual([['sample', 'sample'], ['keep', 'select']]);
    expect(next.steps[0].config).toEqual({ rows: [{ id: 9 }] });
  });

  it('replaces a legacy step: the sample and the worker cannot share a pipeline', () => {
    const next = withSample({ version: 1, steps: [{ key: 'legacy', task: 'legacy' }] }, [{ id: 9 }]);
    expect(next.steps.map(s => s.task)).toEqual(['sample']);
  });

  it('accepts sample rows as a JSON list of objects of plain values, and says what is wrong otherwise', () => {
    expect(parseSampleRows('[{"id": 1, "name": "Ada", "ok": true, "none": null}]')).toEqual({ rows: [{ id: 1, name: 'Ada', ok: true, none: null }] });
    expect(parseSampleRows('{"id": 1}').error).toBe('A list of rows: [{ "column": value }, …].');
    expect(parseSampleRows('[1, 2]').error).toBe('Row 1 is not an object of column: value.');
    expect(parseSampleRows('[{"a": {"b": 1}}]').error).toBe('Row 1, a: a value is text, a number, true/false or null.');
    expect(parseSampleRows('[{').error).toMatch(/^Not JSON/);
    expect(parseSampleRows('[]').error).toBe('At least one row.');
  });
});

describe('fieldsOf -- MIG-245', () => {
  it('reads an integer with the prompt hint as a prompt choice', () => {
    const fields = fieldsOf({ type: 'object', properties: { promptId: { type: 'integer', format: 'prompt' } } });
    expect(fields[0].kind).toBe('prompt');
  });
});
