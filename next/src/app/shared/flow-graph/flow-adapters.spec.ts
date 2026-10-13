import { describe, it, expect } from 'vitest';
import {
  FLOW_REVIEW, FLOW_START, PipelineStepLike, PipelineTaskLike, WORKFLOW_END, WORKFLOW_REJECTED, WORKFLOW_START, aiFlowGraph, pipelineEdges,
  pipelineGraph, readsInput, stepRefs, workflowGraph,
} from './flow-adapters';
import { layoutFlow, sameGraph } from './flow-graph.model';

/**
 * The adapters every flow screen draws through (the step builder's Flow view, the Workflow designer, the AI Assistant's
 * flow, a run's map): where a pipeline's rows really go -- the step before, a named input, a join's other side, an
 * append's steps -- and where a workflow's request goes on each outcome.
 */
const step = (key: string, task: string, more: Partial<PipelineStepLike> = {}): PipelineStepLike => ({ key, task, ...more });
const pairs = (edges: { from: string; to: string; label?: string | null; dashed?: boolean }[]) =>
  edges.map(e => `${e.from}>${e.to}${e.label ? ':' + e.label : ''}${e.dashed ? ' (dashed)' : ''}`);

/** The registry's lines as Core answers them (pipeline.json/steps/tasks), cut to what the drawing reads. */
const rows = (description: string) => ({ type: 'array', description, items: { type: 'object' } });
const TASKS: PipelineTaskLike[] = [
  { code: 'read_file', kind: 'Read', inputSchema: null, configSchema: { type: 'object', properties: { path: { type: 'string' } } } },
  { code: 'read_database', kind: 'Read', inputSchema: null, configSchema: { type: 'object', properties: { sql: { type: 'string' } } } },
  { code: 'filter', kind: 'Process', inputSchema: rows('Any rows.'), configSchema: { type: 'object', properties: { where: { type: 'string' } } } },
  { code: 'join', kind: 'Process', inputSchema: rows('The left rows.'),
    configSchema: { type: 'object', properties: { with: { type: 'string', format: 'step', title: 'Join with' }, on: { type: 'array' } } } },
  { code: 'append', kind: 'Process', inputSchema: rows('Not read: the steps named in Steps are.'),
    configSchema: { type: 'object', properties: { steps: { type: 'array', title: 'Steps to stack', items: { type: 'string', format: 'step' } } } } },
  { code: 'render_pdf', kind: 'Output', inputSchema: rows('The rows to put in the report.'), configSchema: { type: 'object', properties: {
    sections: { type: 'array', items: { type: 'object', properties: { input: { type: 'string', format: 'step', title: 'Rows of' } } } } } } },
  { code: 'ai_prompt', kind: 'Process', backingService: 'ai-service', inputSchema: rows('Rows.'), configSchema: { type: 'object', properties: {} } },
  { code: 'save_file', kind: 'Output', inputSchema: rows('The rows to save.'), configSchema: { type: 'object', properties: {} } },
];

describe('pipeline edges', () => {
  it('follow the run: each step reads the one before it, the first from the start', () => {
    const steps = [step('read', 'read_file'), step('keep', 'filter'), step('save', 'save_file')];
    expect(pairs(pipelineEdges(steps, { tasks: TASKS, startId: FLOW_START, startLabel: 'payload' })))
      .toEqual(['@start>read:payload', 'read>keep', 'keep>save']);
  });

  it('draw a named input from the step it names, not the one before', () => {
    const steps = [step('read', 'read_file'), step('keep', 'filter'), step('all', 'save_file', { input: 'read' })];
    expect(pairs(pipelineEdges(steps, { tasks: TASKS }))).toEqual(['read>keep', 'read>all:rows']);
  });

  it('draw a join from both sides: its input and the step its "with" names (from the registry\'s format: step)', () => {
    const steps = [step('patients', 'read_file'), step('visits', 'read_database'), step('both', 'join', { config: { with: 'patients', on: ['id'] } })];
    expect(pairs(pipelineEdges(steps, { tasks: TASKS }))).toEqual(['patients>visits:then (dashed)', 'visits>both', 'patients>both:joined']);
    // Before the registry answers, the built-in join is still known.
    expect(pairs(pipelineEdges(steps))).toEqual(['patients>visits:then (dashed)', 'visits>both', 'patients>both:joined']);
  });

  it('draw an append from each step it stacks, and no input edge: an append reads only those', () => {
    const steps = [step('a', 'read_file'), step('b', 'read_file'), step('c', 'read_file'), step('all', 'append', { config: { steps: ['a', 'c'] } })];
    expect(readsInput(steps[3], TASKS.find(t => t.code === 'append'))).toBe(false);
    expect(pairs(pipelineEdges(steps, { tasks: TASKS })))
      .toEqual(['a>b:then (dashed)', 'b>c:then (dashed)', 'a>all:stacked', 'c>all:stacked']);
  });

  it('find a step named deep in a setting (a report section\'s rows), each once, never itself or a later step', () => {
    const report = step('report', 'render_pdf', { config: { sections: [{ input: 'read' }, { input: 'read' }, { input: 'report' }, { input: 'later' }] } });
    expect(stepRefs(report, TASKS.find(t => t.code === 'render_pdf')).map(r => [r.field, r.key, r.label]))
      .toEqual([['sections.input', 'read', 'rows of'], ['sections.input', 'later', 'rows of']]);
    const steps = [step('read', 'read_file'), step('keep', 'filter'), report, step('later', 'save_file')];
    expect(pairs(pipelineEdges(steps, { tasks: TASKS }))).toEqual(['read>keep', 'keep>report', 'read>report:rows of', 'report>later']);
  });

  it('keep a read in the middle in the run\'s order, dashed: it reads no rows', () => {
    const steps = [step('a', 'filter'), step('b', 'read_database'), step('c', 'filter')];
    expect(pipelineEdges(steps, { tasks: TASKS }).map(e => !!e.dashed)).toEqual([true, false]);
  });
});

describe('a pipeline as a flow', () => {
  it('marks a step with problems crit and a step not saved dashed, with the start before and the review gate after', () => {
    const steps = [step('read', 'read_file', { config: { path: 'in/claims.csv', format: 'csv' } }), step('ask', 'ai_prompt', { name: 'Summarise' }),
      step('save', 'save_file')];
    const g = pipelineGraph(steps, {
      tasks: TASKS, start: { label: 'Run starts', sub: 'task payload' }, startLabel: 'payload', review: ['internal'],
      problems: i => (i === 1 ? 2 : 0), change: s => (s.key === 'save' ? 'new' : null),
    });
    expect(g.nodes.map(n => [n.id, n.kind, n.tone ?? null, n.badges ?? []])).toEqual([
      [FLOW_START, 'trigger', null, []],
      ['read', 'read', null, []],
      ['ask', 'ai', 'crit', ['2 problems']],
      ['save', 'output', 'info', ['unsaved']],
      [FLOW_REVIEW, 'review', null, []],
    ]);
    expect(g.nodes[1]).toMatchObject({ label: 'read', sub: 'read_file', icon: 'file', metrics: [{ label: 'path', value: 'in/claims.csv' }, { label: 'format', value: 'csv' }] });
    expect(g.nodes[2].label).toBe('Summarise');
    expect(g.nodes[3].pending).toBe(true);
    expect(pairs(g.edges)).toEqual(['@start>read:payload', 'read>ask', 'ask>save', 'save>@review:results (dashed)']);
  });

  it('draws 100 steps (the engine\'s cap) with a branch, laid out without overlap in good time', () => {
    const steps: PipelineStepLike[] = Array.from({ length: 100 }, (_, i) => i % 25 === 24
      ? step(`s${i}`, 'join', { config: { with: `s${i - 10}` } })
      : step(`s${i}`, i % 10 === 0 ? 'read_file' : 'filter', { config: { where: `x > ${i}` } }));
    const started = performance.now();
    const g = pipelineGraph(steps, { tasks: TASKS, start: { label: 'Run starts' } });
    const l = layoutFlow(g.nodes, g.edges, { direction: 'TB' });
    const took = performance.now() - started;
    expect(g.nodes).toHaveLength(101);
    expect(g.edges.filter(e => e.label === 'joined')).toHaveLength(4);
    expect(g.edges.filter(e => e.dashed)).toHaveLength(9);
    expect(l.nodes).toHaveLength(101);
    const spots = new Set(l.nodes.map(n => `${n.x},${n.y}`));
    expect(spots.size).toBe(101);
    expect(took).toBeLessThan(250);
  });
});

describe('the AI flow', () => {
  it('keeps ai-service\'s trigger and review edges and draws the steps\' own the step builder\'s way (a join\'s other side too)', () => {
    const g = aiFlowGraph({
      flow: {
        nodes: [
          { id: 'trigger', kind: 'trigger', label: 'A file lands', sub: 'inbox' },
          { id: 'left', kind: 'read', label: 'Left', task: 'read_file' },
          { id: 'right', kind: 'read', label: 'Right', task: 'read_database' },
          { id: 'both', kind: 'process', label: 'Both', task: 'join', problems: [{ kind: 'setting' }] },
          { id: 'review', kind: 'review', label: 'Review: internal' },
        ],
        edges: [{ from: 'trigger', to: 'left', label: 'file' }, { from: 'left', to: 'right', label: 'rows' }, { from: 'right', to: 'both', label: 'rows' },
          { from: 'both', to: 'review', label: 'results', dashed: true }],
      },
      definition: { steps: [step('left', 'read_file'), step('right', 'read_database'), step('both', 'join', { config: { with: 'left' } })] },
    }, TASKS);
    expect(pairs(g.edges)).toEqual(['trigger>left:file', 'left>right:then (dashed)', 'right>both', 'left>both:joined', 'both>review:results (dashed)']);
    expect(g.nodes.find(n => n.id === 'both')).toMatchObject({ tone: 'warn', badges: ['needs 1 setting'], icon: 'link' });
  });
});

describe('a workflow as a flow', () => {
  const STEPS = [
    { key: 'manager', type: 'approval', name: 'Manager approves' },
    { key: 'large', type: 'condition', name: 'Over 1000?', whenTrue: 'finance', whenFalse: 'end' },
    { key: 'finance', type: 'approval', name: 'Finance approves', onReject: 'manager' },
    { key: 'tell', type: 'notify', name: 'Tell them', next: 'end' },
    { key: 'pause', type: 'wait', hours: 48 },
  ];

  it('goes on to the step below or its next, draws a condition\'s two ways and an approval\'s rejection, each labelled', () => {
    const g = workflowGraph(STEPS, { summary: s => (s.type === 'condition' ? 'If amount is more than 1000' : null), problems: i => (i === 3 ? 1 : 0) });
    expect(pairs(g.edges)).toEqual([
      '@start>manager',
      'manager>large:approved', 'manager>@rejected:rejected (dashed)',
      'large>finance:yes', 'large>@end:no',
      'finance>tell:approved', 'finance>manager:rejected (dashed)',
      'tell>@end',
      'pause>@end:after 2 d',
    ]);
    expect(g.edges.find(e => e.label === 'yes')!.tone).toBe('ok');
    expect(g.edges.find(e => e.label === 'rejected')!.tone).toBe('crit');
    expect(g.nodes.map(n => n.id)).toEqual([WORKFLOW_START, 'manager', 'large', 'finance', 'tell', 'pause', WORKFLOW_END, WORKFLOW_REJECTED]);
    expect(g.nodes.find(n => n.id === 'large')).toMatchObject({ sub: 'If amount is more than 1000', icon: 'filter', accent: 'warn' });
    expect(g.nodes.find(n => n.id === 'manager')).toMatchObject({ icon: 'checkCircle', accent: 'ok', sub: 'approval' });
    expect(g.nodes.find(n => n.id === 'tell')).toMatchObject({ tone: 'crit', badges: ['1 problem'] });
    expect(g.nodes.find(n => n.id === 'pause')!.label).toBe('pause');
  });

  it('leaves out an edge to a step that is not there, and draws no rejected end without an approval that ends there', () => {
    const g = workflowGraph([{ key: 'a', type: 'task', next: 'gone' }, { key: 'b', type: 'notify' }]);
    expect(pairs(g.edges)).toEqual(['@start>a', 'b>@end']);
    expect(g.nodes.some(n => n.id === WORKFLOW_REJECTED)).toBe(false);
    expect(pairs(workflowGraph([]).edges)).toEqual(['@start>@end']);
    // A condition whose two ways go to the same place is one edge saying both.
    const both = workflowGraph([{ key: 'c', type: 'condition', whenTrue: 'end', whenFalse: 'end' }]);
    expect(pairs(both.edges)).toEqual(['@start>c', 'c>@end:yes / no']);
    expect(both.edges[1].tone).toBeNull();
  });
});

describe('the same graph twice', () => {
  it('is told apart from a changed one, so the renderer lays out only a real change', () => {
    const a = pipelineGraph([step('a', 'read_file'), step('b', 'filter')], { tasks: TASKS });
    const b = pipelineGraph([step('a', 'read_file'), step('b', 'filter')], { tasks: TASKS });
    expect(a.nodes).not.toBe(b.nodes);
    expect(sameGraph(a.nodes, a.edges, b.nodes, b.edges)).toBe(true);
    const c = pipelineGraph([step('a', 'read_file'), step('b', 'filter', { name: 'Keep' })], { tasks: TASKS });
    expect(sameGraph(a.nodes, a.edges, c.nodes, c.edges)).toBe(false);
    const d = pipelineGraph([step('a', 'read_file'), step('b', 'filter', { input: 'a' })], { tasks: TASKS });
    expect(sameGraph(a.nodes, a.edges, d.nodes, d.edges)).toBe(true);
  });
});
