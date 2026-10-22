import { describe, it, expect } from 'vitest';
import { PipelineFlowArtifact, flowVerdict, graphOf, isFlow, newestFlow, pipelineIdOf, settingsToFill, triggerWhen, withStepConfig } from './flow.model';
import { jobPayload } from './create-pipeline';

/** AI workflow review: a designed flow as the panel draws it and the Create dialog saves it. */
const flow = (over: Partial<PipelineFlowArtifact> = {}): PipelineFlowArtifact => ({
  kind: 'pipeline-flow', name: 'Lab results', trigger: { type: 'inbox' }, valid: false, saved: false,
  problems: [
    { step: 'check', message: 'check needs a setting: contractName.', kind: 'setting' },
    { step: 'flag', message: '$.mappings[0].op: does not have a value in the enumeration', kind: 'error' },
  ],
  flow: {
    nodes: [
      { id: 'trigger-node', kind: 'trigger', label: 'A file lands in the inbox', sub: 'inbox' },
      { id: 'read', kind: 'read', label: 'Read', task: 'read_file', problems: [] },
      { id: 'check', kind: 'process', label: 'Check', task: 'validate', problems: [{ step: 'check', message: 'check needs a setting: contractName.', kind: 'setting' }] },
      { id: 'flag', kind: 'process', label: 'Flag', task: 'transform', problems: [{ step: 'flag', message: 'bad op', kind: 'error' }] },
      { id: 'review-gate', kind: 'review', label: 'Review: internal' },
    ],
    edges: [{ from: 'trigger-node', to: 'read', label: 'file' }, { from: 'read', to: 'check' }, { from: 'check', to: 'flag' },
      { from: 'flag', to: 'review-gate', label: 'results', dashed: true }],
  },
  definition: { version: 1, steps: [{ key: 'read', task: 'read_file' }, { key: 'check', task: 'validate' }, { key: 'flag', task: 'transform' }] },
  ...over,
});

describe('a designed flow', () => {
  it('is drawn with each step\'s problems as its tone and badges', () => {
    const g = graphOf(flow());
    expect(g.nodes.map(n => [n.id, n.kind, n.tone ?? null])).toEqual([
      ['trigger-node', 'trigger', null], ['read', 'read', null], ['check', 'process', 'warn'], ['flag', 'process', 'crit'], ['review-gate', 'review', null]]);
    expect(g.nodes[2].badges).toEqual(['needs 1 setting']);
    expect(g.nodes[3].badges).toEqual(['1 error']);
    expect(g.nodes[1].sub).toBe('read_file');
    expect(g.edges.at(-1)).toEqual({ from: 'flag', to: 'review-gate', label: 'results', dashed: true });
  });

  it('says whether it can be created as it is', () => {
    expect(flowVerdict(flow())).toEqual({ label: '1 error', tone: 'crit' });
    expect(flowVerdict(flow({ problems: [{ step: 'check', message: 'check needs a setting: contractName.', kind: 'setting' }] })))
      .toEqual({ label: '1 setting to fill', tone: 'warn' });
    expect(flowVerdict(flow({ problems: [] }))).toEqual({ label: 'Ready to create', tone: 'ok' });
  });

  it('is never "Ready to create" with a warning, and a warned step is drawn warn with its badge', () => {
    const warned = flow({ problems: [{ step: 'read', message: 'Step read has no groupBy, so it collapses all the rows into ONE row.', kind: 'warning' }] });
    expect(flowVerdict(warned)).toEqual({ label: 'Check 1 warning', tone: 'warn' });
    const g = graphOf(flow({ flow: { ...flow().flow, nodes: [{ id: 'read', kind: 'read', label: 'Read', task: 'read_file',
      problems: [{ step: 'read', message: 'collapses', kind: 'warning' }] }] } }));
    expect(g.nodes[0].tone).toBe('warn');
    expect(g.nodes[0].badges).toEqual(['1 warning']);
  });

  it('says when a created pipeline really runs', () => {
    expect(triggerWhen({ type: 'schedule', every: 'day', at: '09:00' }, '2026-10-13')).toBe('It runs every day at 09:00 (America/Chicago), from 2026-10-13.');
    expect(triggerWhen({ type: 'schedule', every: 'week' }, '2026-10-13')).toContain('every week (Mondays)');
    expect(triggerWhen({ type: 'inbox' }, '2026-10-13')).toBe('It runs when a file lands in its inbox.');
    expect(triggerWhen({ type: 'manual' }, '2026-10-13')).toBe('Nothing runs until you press Run now.');
  });

  it('names the settings to fill, and a filled setting goes into the definition only', () => {
    const f = flow();
    expect(settingsToFill(f)).toEqual([{ step: 'check', name: 'contractName' }]);
    const filled = withStepConfig(f.definition, 'check', { contractName: 'lab_result' });
    expect(filled.steps[1].config).toEqual({ contractName: 'lab_result' });
    expect(f.definition.steps[1].config).toBeUndefined();
  });

  it('finds the conversation\'s newest flow, and tells a flow from an old draft', () => {
    const messages = [{ messageId: 1, artifact: flow({ name: 'Old' }) }, { messageId: 2, artifact: { kind: 'pipeline-draft', text: 'x' } },
      { messageId: 3, artifact: null }];
    expect(newestFlow(messages)?.messageId).toBe(1);
    expect(isFlow({ kind: 'pipeline-draft', text: 'x' })).toBe(false);
    expect(newestFlow([])).toBeNull();
  });

  it('makes a pipeline id Core accepts from the name', () => {
    expect(pipelineIdOf('Lab Results: validation & notification')).toBe('LAB_RESULTS_VALIDATION_NOTIFICAT');
    expect(pipelineIdOf('')).toBe('AI_PIPELINE');
    expect(pipelineIdOf('x', '2')).toBe('X_2');
  });

  it('asks Core for a manual job, or a schedule on the flow\'s timetable', () => {
    expect(jobPayload('Labs', 7, { type: 'inbox' }, '2026-10-12')).toMatchObject({ execution: 'Manual', taskDetail: { taskDetailId: 7 } });
    expect(jobPayload('Labs', 7, { type: 'manual' }, '2026-10-12')['schedulers']).toBeUndefined();
    const daily = jobPayload('FHIR', 8, { type: 'schedule', every: 'day', at: '06:30' }, '2026-10-12');
    expect(daily['execution']).toBe('Auto');
    expect(daily['schedulers']).toEqual([{ startDate: '2026-10-12', endDate: '', startTime: '06:30', frequency: 'Daily', intervalValue: '1',
      daysOfWeek: null, dayOfMonth: null }]);
    expect((jobPayload('W', 8, { type: 'schedule', every: 'week' }, '2026-10-12')['schedulers'] as { frequency: string; startTime: string }[])[0])
      .toMatchObject({ frequency: 'Weekly', startTime: '06:00', daysOfWeek: 'MON' });
  });
});
