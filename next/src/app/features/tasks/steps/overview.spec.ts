import { describe, it, expect } from 'vitest';
import { pipelineOverview, stageGroups, stageOf } from './overview';
import { Definition, StepTaskEntry } from './steps.model';

/**
 * UX review 2026-10-12 (B2, P5): a step's stage comes from the Task Registry's line for its task (its kind and backing
 * service), the steps group as runs of one stage, and the editor's overview strip reads Source -> Steps -> Review ->
 * Outputs -> Schedule & triggers off the draft.
 */
const TASKS: StepTaskEntry[] = [
  { code: 'read_file', name: 'Read CSV/JSON/Parquet', kind: 'Read', backingService: 'storage-service' },
  { code: 'read_documents', name: 'Read documents', kind: 'Read', backingService: 'ai-service' },
  { code: 'validate', name: 'Validate', kind: 'Process', backingService: 'integration-service' },
  { code: 'ai_prompt', name: 'AI prompt', kind: 'Process', backingService: 'ai-service' },
  { code: 'transform', name: 'Transform', kind: 'Process', backingService: 'core' },
  { code: 'approval', name: 'Approval', kind: 'Process', backingService: 'core', aiToolName: 'request_approval' },
  { code: 'save_file', name: 'Save File', kind: 'Output', backingService: 'core' },
  { code: 'render_pdf', name: 'Render PDF', kind: 'Output', backingService: 'media-service' },
  { code: 'new_writer', name: 'A writer registered tomorrow', kind: 'Output', backingService: 'somewhere' },
  { code: 'transcribe_audio', name: 'Transcribe audio', kind: 'Process', backingService: 'media-service', aiToolName: 'transcribe_audio' },
  { code: 'convert_file', name: 'Convert file', kind: 'Process', backingService: 'media-service', aiToolName: 'convert_file' },
];
const task = (code: string) => TASKS.find(t => t.code === code);

const MRI: Definition = { version: 1, settings: { review: { required: ['internal'] } }, steps: [
  { key: 'manifest', name: 'Manifest of the sampled images', task: 'read_file' },
  { key: 'check', task: 'validate' },
  { key: 'classify', task: 'ai_prompt' },
  { key: 'normalise', task: 'transform' },
  { key: 'signoff', task: 'approval' },
  { key: 'save_results', task: 'save_file' },
  { key: 'report', task: 'render_pdf' },
  { key: 'by_class', task: 'transform' },
] };

describe('stageOf', () => {
  it('reads the stage from the registry line: kind first, then what the task is for', () => {
    expect(stageOf({ task: 'read_file' }, task('read_file'))).toBe('read');
    expect(stageOf({ task: 'read_documents' }, task('read_documents'))).toBe('read');
    expect(stageOf({ task: 'validate' }, task('validate'))).toBe('check');
    expect(stageOf({ task: 'ai_prompt' }, task('ai_prompt'))).toBe('ai');
    expect(stageOf({ task: 'approval' }, task('approval'))).toBe('review');
    expect(stageOf({ task: 'transform' }, task('transform'))).toBe('transform');
    expect(stageOf({ task: 'new_writer' }, task('new_writer'))).toBe('write');
  });

  it('puts the steps that turn files into rows (media-service, kind Process) under Transform, with the registry or without', () => {
    for (const code of ['transcribe_audio', 'convert_file']) {
      expect(stageOf({ task: code }, task(code)), code).toBe('transform');
      expect(stageOf({ task: code }), code).toBe('transform');
    }
  });

  it('falls back on the code while the registry is not read yet', () => {
    expect(stageOf({ task: 'read_api' })).toBe('read');
    expect(stageOf({ task: 'upload_bucket' })).toBe('write');
    expect(stageOf({ task: 'sort' })).toBe('transform');
  });
});

describe('stageGroups', () => {
  it('groups runs of one stage in order; a stage that comes back is a group of its own', () => {
    const groups = stageGroups(MRI.steps, TASKS);
    expect(groups.map(g => [g.stage.id, g.start, g.steps.map(s => s.step.key)])).toEqual([
      ['read', 0, ['manifest']], ['check', 1, ['check']], ['ai', 2, ['classify']], ['transform', 3, ['normalise']],
      ['review', 4, ['signoff']], ['write', 5, ['save_results', 'report']], ['transform', 7, ['by_class']],
    ]);
  });
});

describe('pipelineOverview', () => {
  const jobs = [{ jobId: 2903, jobName: 'Manual', jobStatus: 'Active' }, { jobId: 2935, jobName: 'Nightly', jobStatus: 'Inactive' }];

  it('says what each part is set to, and where it is set', () => {
    const parts = pipelineOverview({ definition: MRI, tasks: TASKS, jobs, jobsLoaded: true });
    expect(parts.map(p => [p.id, p.state, p.detail])).toEqual([
      ['source', 'done', 'Manifest of the sampled images'],
      ['steps', 'done', '8 steps in 6 stages'],
      ['review', 'done', 'Our team · 1 approval step'],
      ['outputs', 'done', '2: Save File, Render PDF'],
      ['schedule', 'done', '2 schedules · 1 active'],
    ]);
    expect(parts.map(p => p.target)).toEqual([
      { tab: 'steps', anchor: 'stage-read' }, { tab: 'steps' }, { tab: 'settings', anchor: 'pipeline-review' },
      { tab: 'steps', anchor: 'stage-write' }, { tab: 'schedules' },
    ]);
  });

  it('marks what is missing, and review as optional, on an empty pipeline', () => {
    const parts = pipelineOverview({ definition: { steps: [] }, tasks: TASKS, jobs: [], jobsLoaded: true });
    expect(parts.map(p => p.state)).toEqual(['missing', 'missing', 'optional', 'missing', 'missing']);
    expect(parts.find(p => p.id === 'schedule')!.detail).toBe('Not scheduled: add one to run it');
  });

  it('reads a legacy pipeline as its worker\'s, with no steps yet', () => {
    const legacy: Definition = { steps: [{ key: 'legacy', task: 'legacy', config: { pipelineId: 'REF' } }], source: { type: 'task' } };
    const parts = pipelineOverview({ definition: legacy, tasks: TASKS, jobs: [], jobsLoaded: false });
    expect(parts.map(p => [p.id, p.state])).toEqual([['source', 'done'], ['steps', 'missing'], ['review', 'optional'], ['outputs', 'optional'], ['schedule', 'optional']]);
    expect(parts.find(p => p.id === 'schedule')!.detail).toBe('Reading the schedules…');
  });

  it('takes the schedule\'s task payload as a source when no step reads', () => {
    const parts = pipelineOverview({ definition: { source: { type: 'task' }, steps: [{ key: 'x', task: 'transform' }] }, tasks: TASKS, jobs: [], jobsLoaded: true });
    expect(parts[0]).toMatchObject({ state: 'done', target: { tab: 'settings', anchor: 'pipeline-source' } });
  });
});
