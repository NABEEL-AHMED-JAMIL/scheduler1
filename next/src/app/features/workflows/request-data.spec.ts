import { describe, it, expect } from 'vitest';
import { RequestEntry, requestData, stepNamesOf, runStepOf } from './request-data';
import { dateTime, exactTime } from './history';
import { valueKind } from './value-kind';
import { INTAKE_HISTORY, INTAKE_SUBJECT, SUMMARY } from './request-data.fixture';

/**
 * Owner 2026-10-27 (task 2904): a request's data read as the engine keeps it -- a run's envelope as rows ("Ok: Yes, Ended:
 * Yes, Job ID 1479, Give up at 2026-10-27T02:47:13.849158761"), a kept decision as "By 1016 / At 2026-10-27T00:52:52.98…",
 * a five-sentence summary in a table cell and "Patient name •••". By shape, never by a field's name.
 */
const directory: Record<number, string> = { 4601: 'Alex Morgan, RN' };
const entries = (subject: Record<string, unknown> = INTAKE_SUBJECT, canOpenRuns = true) => requestData(subject, {
  personName: id => directory[id] ?? null,
  personByUsername: u => (u === 'frontdesk@riverside.test' ? 'Front desk' : null),
  runStep: runStepOf(INTAKE_HISTORY),
  canOpenRuns,
});
const entry = (key: string, list: RequestEntry[] = entries()) => list.find(e => e.key === key)!;

describe('A request\'s data, by its shape', () => {
  it('reads a run outcome as one line -- its step, a status, the run -- and never lists the envelope', () => {
    const a = entry('assessment');
    expect(a).toMatchObject({ kind: 'outcome', label: 'Assessment', step: 'Assess the intake: checks, rules and the AI summary', status: 'Completed',
      runId: 2926, link: ['/pipelines/schedules', 1479, 'runs', 2926], problem: null });
    if (a.kind !== 'outcome') throw new Error('not an outcome');
    const keys = a.fields.map(f => f.key);
    for (const envelope of ['ok', 'ended', 'jobId', 'runId', 'status', 'message', 'giveUpAt', 'rowCount', 'truncated', 'masked', 'resultsStep']) {
      expect(keys).not.toContain(envelope);
    }
    // The pipeline's results are the data, nulls left out.
    expect(keys).toEqual(['age', 'intake_id', 'ai_summary', 'code_flags', 'flag_count', 'patient_name', 'missing_count', 'triage_priority']);
    // An outcome without results is the line alone; its step is the one that started that run.
    expect(entry('summary_report')).toMatchObject({ kind: 'outcome', step: 'The signed intake summary', status: 'Completed', runId: 2953, fields: [] });
  });

  it('says what went wrong only when the run did not complete, and links the run only for someone who can open it', () => {
    const failed = entries({ check: { ok: false, ended: true, jobId: 7, runId: 70, status: 'Failed', message: 'Step 2 of 4 failed: no rows.' } });
    expect(entry('check', failed)).toMatchObject({ kind: 'outcome', status: 'Failed', problem: 'Step 2 of 4 failed: no rows.', step: null });
    const noResults = entries({ check: { ok: true, ended: true, jobId: 7, runId: 70, status: 'Completed', message: 'Done.',
      resultsProblem: 'The run kept no output.' } });
    expect(entry('check', noResults)).toMatchObject({ status: 'Completed', problem: 'The run kept no output.' });
    const waiting = entries({ check: { ok: null, ended: false, jobId: 7, runId: 70, status: 'Running', message: null, giveUpAt: '2026-10-27T02:47:13' } });
    expect(entry('check', waiting)).toMatchObject({ status: 'Running', problem: null });
    expect(entry('assessment', entries(INTAKE_SUBJECT, false))).toMatchObject({ runId: 2926, link: null });
  });

  it('reads a kept decision as who decided and when, by name, with the comment as a quote', () => {
    expect(entry('nurse')).toEqual({ kind: 'decision', key: 'nurse', label: 'Nurse', decision: 'Approved', tone: 'ok',
      line: 'Approved by Riverside Health reviewer', at: dateTime('2026-10-27T00:52:52.982112834-05:00'),
      atTitle: exactTime('2026-10-27T00:52:52.982112834-05:00'), atIso: '2026-10-27T00:52:52.982112834-05:00', comment: 'Chest pain on exertion: ECG on arrival.' });
    // No name kept: the colleague directory, else "a member" -- never the id.
    const senior = entry('senior');
    expect(senior).toMatchObject({ decision: 'Rejected', tone: 'crit', line: 'Rejected by a member', comment: null });
    const known = entries({ ...INTAKE_SUBJECT, senior: { ...(INTAKE_SUBJECT['senior'] as object), by: 4601 } });
    expect(entry('senior', known)).toMatchObject({ line: 'Rejected by Alex Morgan, RN' });
    expect(JSON.stringify(entries())).not.toMatch(/\b460[12]\b/);
  });

  it('writes a decision\'s time on the 24-hour clock with its year, from the naive and the offset forms alike', () => {
    expect(dateTime('2026-10-27T00:52:52.982112834-05:00', 'America/Chicago')).toBe('27 Oct 2026, 00:52');
    expect(dateTime('2026-10-27T05:52:52.982+00:00', 'America/Chicago')).toBe('27 Oct 2026, 00:52');
    expect(dateTime('2026-10-27T00:52:52.982112', 'America/Chicago')).toBe('27 Oct 2026, 00:52');
    expect(dateTime('2026-10-27T13:05:00', 'America/Chicago')).toBe('27 Oct 2026, 13:05');
  });

  it('gives a long text the row as a paragraph, inside an outcome as well', () => {
    const a = entry('assessment');
    if (a.kind !== 'outcome') throw new Error('not an outcome');
    expect(a.fields.find(f => f.key === 'ai_summary')).toMatchObject({ kind: 'value', label: 'AI summary', view: { kind: 'long', text: SUMMARY } });
    expect(valueKind('x'.repeat(130))).toEqual({ kind: 'long', text: 'x'.repeat(130) });
  });

  it('keeps the DRAFT mark on what a model drafted, where the result says DRAFT', () => {
    const drafted = entries({ finding: { ok: true, ended: true, jobId: 7, runId: 70, status: 'Completed', label: 'DRAFT', note: SUMMARY } });
    const f = entry('finding', drafted);
    if (f.kind !== 'outcome') throw new Error('not an outcome');
    expect(f.fields.find(x => x.key === 'note')).toMatchObject({ draft: true });
    const a = entry('assessment');
    if (a.kind !== 'outcome') throw new Error('not an outcome');
    expect(a.fields.find(x => x.key === 'ai_summary')).toMatchObject({ draft: false });
  });

  it('reads a masked value as hidden, wherever it is', () => {
    expect(valueKind('•••')).toEqual({ kind: 'masked', text: '•••' });
    expect(valueKind('•••@•••.com')).toEqual({ kind: 'masked', text: '•••@•••.com' });
    const a = entry('assessment');
    if (a.kind !== 'outcome') throw new Error('not an outcome');
    expect(a.fields.find(f => f.key === 'patient_name')).toMatchObject({ view: { kind: 'masked', text: '•••' } });
    // The run named the field masked: hidden even when its value does not show the mask.
    const named = entries({ r: { ok: true, ended: true, runId: 1, status: 'Completed', masked: ['phone'], phone: 'redacted' } });
    const r = entry('r', named);
    if (r.kind !== 'outcome') throw new Error('not an outcome');
    expect(r.fields[0]).toMatchObject({ key: 'phone', view: { kind: 'masked' } });
  });

  it('keeps the form\'s own values as they read: a table, a name for a username, a record as its fields', () => {
    expect(entry('medications')).toMatchObject({ kind: 'value', view: { kind: 'table', columns: ['Dose', 'Name'] } });
    expect(entry('submitted_by')).toMatchObject({ kind: 'value', value: 'Front desk', view: { kind: 'text', text: 'Front desk' } });
    const group = entry('address', entries({ address: { city: 'Millbrook', zipCode: '60999', note: null } }));
    expect(group).toMatchObject({ kind: 'group', label: 'Address' });
    if (group.kind !== 'group') throw new Error('not a group');
    expect(group.fields.map(f => [f.label, f.kind === 'value' ? f.value : ''])).toEqual([['City', 'Millbrook'], ['Zip code', '60999']]);
  });

  it('names each step as the engine entered it, and the step behind each run', () => {
    expect(stepNamesOf(INTAKE_HISTORY).get('assessed')).toBe('Assessed?');
    expect(runStepOf(INTAKE_HISTORY)(2926)).toBe('Assess the intake: checks, rules and the AI summary');
    expect(runStepOf(INTAKE_HISTORY)(999)).toBeNull();
  });
});
