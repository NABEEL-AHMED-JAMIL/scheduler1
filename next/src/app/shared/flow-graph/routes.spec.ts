import { describe, it, expect } from 'vitest';
import { branchNames, branchOfSteps, branchRefs, mergeHeads } from './routes';
import { pipelineEdges } from './flow-adapters';
import { outputColumns, inputColumns } from '../../features/tasks/steps/steps.model';

/** MIG-450: a Route's branches as the engine reads them -- which branch a step is in, what a Merge stacks, how the flow draws it. */
const steps = [
  { key: 'read', task: 'sample', config: { rows: [{ id: 1, priority: 'urgent' }] } },
  { key: 'triage', task: 'route', config: { branches: [{ name: 'urgent', conditions: [{ column: 'priority', operator: 'eq', value: 'urgent' }] }],
    otherwise: 'routine' } },
  { key: 'opinion', task: 'compute', input: 'triage.urgent', config: { formulas: [{ target: 'second_opinion', expression: "'asked'" }] } },
  { key: 'shape', task: 'select', config: { columns: ['id', 'priority', 'branch', 'second_opinion'] } },
  { key: 'together', task: 'merge', config: { route: 'triage' } },
  { key: 'save', task: 'save_file', config: {} },
];

describe('A Route\'s branches', () => {
  it('names its branches and Otherwise, and the refs a step reads them by', () => {
    expect(branchNames(steps[1])).toEqual(['urgent', 'routine']);
    expect([...branchRefs(steps).keys()]).toEqual(['triage.urgent', 'triage.routine']);
  });

  it('puts a step in the branch it reads, until the Merge', () => {
    expect([...branchOfSteps(steps)]).toEqual([['opinion', 'triage.urgent'], ['shape', 'triage.urgent']]);
  });

  it('merges each branch\'s last step, or the branch itself when it has none', () => {
    expect(mergeHeads(steps, 4, 'triage')).toEqual([{ branch: 'urgent', reads: 'shape' }, { branch: 'routine', reads: 'triage.routine' }]);
    expect(mergeHeads(steps, 4, 'read')).toEqual([]);
  });

  it('draws a branch from its route and every branch into the Merge, each labelled with its name', () => {
    const edges = pipelineEdges(steps).map(e => `${e.from}>${e.to}${e.label ? ':' + e.label : ''}`);
    expect(edges).toContain('triage>opinion:urgent');
    expect(edges).toContain('shape>together:urgent');
    expect(edges).toContain('triage>together:routine');
    expect(edges).toContain('together>save');
    expect(edges).not.toContain('opinion>together');
  });

  it('knows the columns through a route and a merge', () => {
    const definition = { version: 1, steps } as never;
    expect(outputColumns(definition, 1)).toEqual(['id', 'priority', 'branch']);
    expect(inputColumns(definition, 2)).toEqual(['id', 'priority', 'branch']);
    expect(outputColumns(definition, 4)).toEqual(['id', 'priority', 'branch', 'second_opinion']);
  });
});
