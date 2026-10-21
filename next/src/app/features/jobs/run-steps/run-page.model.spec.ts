import { describe, it, expect } from 'vitest';
import { outputChips, outputLabel, plural, runFacts, runRows, runStatusLook, runTabFromUrl, runTabUrl, startedBy, stepRows } from './run-page.model';
import { RunOutput, StepExecution, StepTimeline } from './run-steps.model';

/** UX review 2026-10-12, run page fix: the readings behind the run page's header, summary, tabs and steps table. */
const step = (index: number, key: string, task: string, extra: Partial<StepExecution> = {}): StepExecution => ({
  stepExecutionId: 4931 + index, index, key, task, status: 'Completed', startedAt: '2026-10-07T09:06:46.49', durationMs: 10,
  recordsIn: 1, recordsOut: 1, tries: 1, onError: 'fail', error: null, datasets: [], log: 'step', ...extra,
});
const timeline = (steps: StepExecution[], extra: Partial<StepTimeline> = {}): StepTimeline =>
  ({ jobQueueId: 8134, jobId: 2908, runStatus: 'Completed', attempt: 1, attempts: [1], legacy: false, steps, ...extra });

describe('run page: the tab an address opens', () => {
  it('opens the Log on /logs and the Steps on the bare run', () => {
    expect(runTabFromUrl('logs', null)).toBe('log');
    expect(runTabFromUrl(undefined, null)).toBe('steps');
    expect(runTabFromUrl('8134', undefined)).toBe('steps');
  });

  it('lets ?tab= name any tab, and ignores one it does not know', () => {
    expect(runTabFromUrl(undefined, 'outputs')).toBe('outputs');
    expect(runTabFromUrl('logs', 'map')).toBe('map');
    expect(runTabFromUrl(undefined, 'ai')).toBe('ai');
    expect(runTabFromUrl('logs', 'nonsense')).toBe('log');
    expect(runTabFromUrl(undefined, 'timeline')).toBe('steps');
  });

  it('writes each tab\'s address: the Log at /logs, the Steps bare, the rest with ?tab=', () => {
    expect(runTabUrl('2908', '8134', 'log')).toEqual({ commands: ['/pipelines/schedules', '2908', 'runs', '8134', 'logs'], queryParams: {} });
    expect(runTabUrl(2908, 8134, 'steps')).toEqual({ commands: ['/pipelines/schedules', '2908', 'runs', '8134'], queryParams: {} });
    expect(runTabUrl('2908', '8134', 'outputs').queryParams).toEqual({ tab: 'outputs' });
    expect(runTabUrl('2908', '8134', 'map').commands).toEqual(['/pipelines/schedules', '2908', 'runs', '8134']);
  });
});

describe('run page: the header\'s one status', () => {
  it('says the run and its review in one pill', () => {
    expect(runStatusLook('Completed', 'PENDING')).toEqual({ label: 'Completed · waiting for review', tone: 'warn', icon: 'clock' });
    // AI hard-workflow test: a failed run has nothing to review -- Core says NOT_APPLICABLE, and an older PENDING is not shown either.
    expect(runStatusLook('Failed', 'PENDING')).toEqual({ label: 'Failed', tone: 'crit', icon: 'xCircle' });
    expect(runStatusLook('Failed', 'NOT_APPLICABLE')).toEqual({ label: 'Failed', tone: 'crit', icon: 'xCircle' });
    expect(runStatusLook('Interrupt', 'NOT_APPLICABLE')?.label).toBe('Interrupted');
    expect(runStatusLook('Completed', 'APPROVED')?.label).toBe('Completed · approved');
    expect(runStatusLook('Completed', 'REJECTED')?.tone).toBe('crit');
    expect(runStatusLook('Completed', 'NOT_REQUIRED')).toEqual({ label: 'Completed', tone: 'ok', icon: 'checkCircle' });
    expect(runStatusLook('Failed', null)).toEqual({ label: 'Failed', tone: 'crit', icon: 'xCircle' });
    expect(runStatusLook('Interrupt')?.label).toBe('Interrupted');
    expect(runStatusLook('Running', null, true)?.label).toBe('Running · waiting for approval');
    expect(runStatusLook(null)).toBeNull();
  });

  it('says what started the run', () => {
    expect(startedBy({ runManual: true }, { execution: 'Auto' })).toBe('By hand');
    expect(startedBy({ runManual: false }, { execution: 'Auto' })).toBe('Its timetable');
    expect(startedBy({ runManual: false }, { execution: 'Manual' })).toBe('A trigger');
  });
});

describe('run page: the summary strip', () => {
  const facts = (t: StepTimeline | null) => runFacts({ start: '7 Oct 2026, 09:06:45', end: '7 Oct 2026, 09:06:49', duration: '4.1s',
    startedBy: 'A trigger', timeline: t });

  it('says only what the header does not: no status, schedule or pipeline', () => {
    const labels = facts(timeline([step(0, 'arrival', 'read_s3', { recordsIn: 0 }), step(1, 'manifest', 'read_file', { recordsOut: 40 })]))
      .map(f => f.label);
    expect(labels).toEqual(['Started', 'Ended', 'Duration', 'Started by', 'Steps', 'Rows in → out']);
    expect(labels).not.toContain('Status');
    expect(labels).not.toContain('Schedule');
    expect(labels).not.toContain('Pipeline');
  });

  it('counts the steps completed, and the rows read and put out', () => {
    const f = facts(timeline([step(0, 'a', 'read_s3', { recordsIn: 0, recordsOut: 1 }), step(1, 'b', 'read_file', { recordsOut: 40 }),
      step(2, 'c', 'select', { status: 'Failed', recordsOut: null })]));
    expect(f.find(x => x.label === 'Steps')?.value).toBe('2/3');
    expect(f.find(x => x.label === 'Rows in → out')?.value).toBe('1 → 40');
    expect(runRows([step(0, 'a', 'x', { recordsOut: 1 })])?.hint).toBe('1 record read, 1 record out of the last step');
  });

  it('adds the run\'s cost when Billing told an administrator what it was', () => {
    const f = runFacts({ start: 'a', end: 'b', duration: '1s', startedBy: 'By hand', timeline: null, cost: '$0.8722' });
    expect(f.at(-1)).toMatchObject({ label: 'Cost', value: '$0.8722' });
  });

  it('leaves the steps out for a run the step engine did not take', () => {
    expect(facts(null).map(f => f.label)).toEqual(['Started', 'Ended', 'Duration', 'Started by']);
  });
});

describe('run page: counts and files in words', () => {
  it('says one record, not "1 records"', () => {
    expect(plural(1, 'record')).toBe('1 record');
    expect(plural(40, 'record')).toBe('40 records');
    expect(plural(1024, 'row')).toBe('1,024 rows');
    expect(plural(0, 'page')).toBe('0 pages');
  });

  it('says a PDF\'s pages and size, never its rows', () => {
    const pdf = { name: 'xray-triage-draft.pdf', format: 'pdf', rowCount: 1, byteCount: 22359 };
    expect(outputLabel(pdf)).toBe('PDF · 21.8 KB');
    expect(outputLabel({ ...pdf, pageCount: 2 })).toBe('PDF · 2 pages · 21.8 KB');
    expect(outputLabel({ ...pdf, pageCount: 1 })).toBe('PDF · 1 page · 21.8 KB');
    expect(outputLabel({ ...pdf, format: null })).toBe('PDF · 21.8 KB');
    expect(outputLabel(pdf)).not.toContain('row');
  });

  it('says a table\'s type, rows and size', () => {
    expect(outputLabel({ name: 'xray-triage.csv', format: 'csv', rowCount: 1, byteCount: 349 })).toBe('CSV · 1 row · 349 B');
    expect(outputLabel({ name: 'out.json', format: 'json', rowCount: 40, byteCount: null })).toBe('JSON · 40 rows');
  });

  it('describes a step\'s kept file by its output and its upload as a chip of its own', () => {
    const report = step(11, 'report', 'render_pdf', { datasets: [{ runDatasetId: 4537, name: 'xray-triage-draft.pdf', rowCount: 1 }] });
    const keep = step(9, 'keep', 'upload_bucket');
    const outputs: RunOutput[] = [
      { runOutputId: 2021, stepExecutionId: report.stepExecutionId, stepKey: 'report', kind: 'file', name: 'xray-triage-draft.pdf', format: 'pdf',
        rowCount: 1, byteCount: 22359, pageCount: null, runDatasetId: 4537 },
      { runOutputId: 2019, stepExecutionId: keep.stepExecutionId, stepKey: 'keep', kind: 'bucket', name: 'run-8134.csv', format: 'csv',
        rowCount: 1, byteCount: 349, bucket: 'riverside-health-s3', key: 'runs/run-8134.csv' },
    ];
    expect(outputChips(report, outputs)).toMatchObject([{ name: 'xray-triage-draft.pdf', kind: 'file', pdf: true, detail: 'PDF · 21.8 KB' }]);
    expect(outputChips(keep, outputs)).toMatchObject([{ name: 'run-8134.csv', kind: 'bucket', detail: 'CSV · 1 row · 349 B' }]);
    expect(outputChips(step(0, 'arrival', 'read_s3', { datasets: [{ runDatasetId: 4527, name: 'output', rowCount: 1 }] }), outputs))
      .toMatchObject([{ name: 'output', kind: 'dataset', pdf: false, detail: '1 row' }]);
  });
});

describe('run page: the steps table\'s rows', () => {
  const steps = [
    step(0, 'arrival', 'read_s3', { name: 'The image this run was started for', durationMs: 24, recordsIn: 0, recordsOut: 1 }),
    step(1, 'classify', 'ai_prompt', { name: 'Vision model: DRAFT label', durationMs: 3097 }),
    step(2, 'tell', 'send_notification', { durationMs: 22, recordsIn: 1, recordsOut: 1 }),
  ];

  it('leads with the step\'s name, the key kept for the secondary line', () => {
    const rows = stepRows(timeline(steps), []);
    expect(rows.map(r => [r.no, r.name, r.named])).toEqual([[1, 'The image this run was started for', true],
      [2, 'Vision model: DRAFT label', true], [3, 'tell', false]]);
  });

  it('marks the slowest step and sizes each bar against it', () => {
    const rows = stepRows(timeline(steps), []);
    expect(rows.map(r => r.slowest)).toEqual([false, true, false]);
    expect(rows[1].share).toBe(1);
    expect(rows[0].share).toBeCloseTo(24 / 3097);
    expect(rows[1].duration).toBe('3.1 sec');
    expect(stepRows(timeline([steps[0]]), [])[0].slowest).toBe(false);
  });

  it('pluralises the rows properly', () => {
    const rows = stepRows(timeline(steps), []);
    expect(rows[0].rows).toBe('0 → 1');
    expect(rows[0].rowsHint).toBe('0 records in, 1 record out');
    expect(stepRows(timeline([step(0, 'm', 'read_file', { recordsIn: 1, recordsOut: 40 })]), [])[0].rowsHint).toBe('1 record in, 40 records out');
  });

  it('tints a failed step and says its error; a skipped one as a warning', () => {
    const rows = stepRows(timeline([steps[0],
      step(1, 'check', 'validate', { status: 'Failed', error: { message: 'Column balance is not a number', tries: 3 } }),
      step(2, 'shape', 'transform', { status: 'Skip', statusMessage: 'Skipped: an earlier step failed.' })], { runStatus: 'Failed' }), []);
    expect(rows.map(r => r.tone)).toEqual([null, 'crit', 'warn']);
    expect(rows[1].problem).toBe('Column balance is not a number');
    expect(rows[2].problem).toBe('Skipped: an earlier step failed.');
    expect(rows[0].problem).toBe('');
  });
});
