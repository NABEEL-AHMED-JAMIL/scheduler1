import { describe, it, expect } from 'vitest';
import { pipelineGraph, stepSummary } from './flow-adapters';

/**
 * UX review 2026-10-12: a node read "reque… 1083" and "envir… 1072". A setting is called by its schema title, and an id is
 * the name of what it points at -- "#1083" until the name is read.
 */
const READ_API = {
  code: 'read_api', name: 'Read API', kind: 'Read',
  configSchema: { type: 'object', properties: {
    requestId: { type: 'integer', title: 'API request', format: 'api-request' },
    environmentId: { type: 'integer', title: 'Environment', format: 'api-environment' },
    version: { type: 'integer', title: 'Collection version' },
  } },
};
const STEP = { key: 'patients', task: 'read_api', config: { requestId: 1083, environmentId: 1072 } };

describe('a flow node names what its step points at', () => {
  it('shows the title and the name when it is known', () => {
    const known: Record<string, string> = { 'api-request:1083': 'Patients by ward', 'api-environment:1072': 'Production' };
    const names = (format: string, value: unknown) => known[`${format}:${value}`] ?? null;
    expect(stepSummary(STEP, 2, READ_API.configSchema, names)).toEqual([
      { label: 'API request', value: 'Patients by ward' }, { label: 'Environment', value: 'Production' }]);
  });

  it('shows the id marked as one until the name is read, and a plain setting as it is', () => {
    expect(stepSummary({ ...STEP, config: { requestId: 1083, version: 4 } }, 2, READ_API.configSchema, () => null)).toEqual([
      { label: 'API request', value: '#1083' }, { label: 'Collection version', value: '4' }]);
    // Without a schema the setting's own key, as before.
    expect(stepSummary(STEP)).toEqual([{ label: 'requestId', value: '1083' }, { label: 'environmentId', value: '1072' }]);
  });

  it('reaches the node through pipelineGraph', () => {
    const graph = pipelineGraph([STEP], { tasks: [READ_API], names: f => (f === 'api-request' ? 'Patients by ward' : null) });
    expect(graph.nodes[0].metrics).toEqual([{ label: 'API request', value: 'Patients by ward' }, { label: 'Environment', value: '#1072' }]);
  });
});
