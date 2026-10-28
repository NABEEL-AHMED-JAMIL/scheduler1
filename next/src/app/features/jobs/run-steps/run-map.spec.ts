import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { RunMap, byTask, durationText, runMap, stepKind } from './run-map';
import { StepTimeline } from './run-steps.model';

/** AI workflow review: a run's steps as a plan map -- time and rows per step, the failed or slowest step marked. */
const step = (key: string, task: string, status: string, durationMs: number, recordsIn: number, recordsOut: number) =>
  ({ stepExecutionId: 1, index: 0, key, task, status, durationMs, recordsIn, recordsOut, tries: 1, log: 'step' as const });
const run = (steps: ReturnType<typeof step>[]): StepTimeline => ({ jobQueueId: 8238, jobId: 2905, runStatus: 'Completed', attempt: 1, attempts: [1],
  legacy: false, steps: steps.map((s, i) => ({ ...s, index: i })) });

describe('the run plan map', () => {
  const done = run([step('read', 'read_file', 'Completed', 400, 0, 101766), step('banded', 'compute', 'Completed', 139, 101766, 101766),
    step('by_age', 'aggregate', 'Completed', 2600, 101766, 10), step('save', 'save_file', 'Completed', 60, 10, 10)]);

  it('marks the slowest step of a run that did not fail, and each step\'s share of the time', () => {
    const m = runMap(done, 'time');
    expect(m.hot?.key).toBe('by_age');
    expect(m.nodes.find(n => n.id === 'by_age')).toMatchObject({ hot: true, badges: ['slowest'], kind: 'process' });
    expect(m.nodes[0].kind).toBe('read');
    expect(m.nodes[3].kind).toBe('output');
    expect(m.nodes[2].share).toBeCloseTo(2600 / 3199, 5);
    expect(m.nodes[2].metrics?.map(x => x.value)).toEqual(['2.6 sec', '81.3%', '101,766', '10']);
    // ZT-P10: labels that fit a node's metric cell ("rows in" was drawn "rows…").
    expect(m.nodes[2].metrics?.map(x => x.label)).toEqual(['time', 'share', 'in', 'out']);
    expect(m.edges.map(e => `${e.from}>${e.to} ${e.label}`)).toEqual(['read>banded 101,766 rows', 'banded>by_age 101,766 rows', 'by_age>save 10 rows']);
  });

  it('ZT-P9: draws each step from the steps it reads -- a read after a read stands alone, an append and a join from each source', () => {
    const t = run([step('visits', 'read_file', 'Completed', 10, 0, 42), step('clinics', 'read_file', 'Completed', 10, 0, 4),
      step('all', 'append', 'Completed', 10, 46, 46), step('joined', 'join', 'Completed', 10, 46, 46)]);
    const reads: Record<string, string[]> = { visits: [], clinics: [], all: ['visits', 'clinics'], joined: ['all', 'clinics'] };
    t.steps.forEach(s => (s as { reads?: string[] }).reads = reads[s.key]);
    expect(runMap(t, 'time').edges.map(e => `${e.from}>${e.to} ${e.label}`))
      .toEqual(['visits>all 42 rows', 'clinics>all 4 rows', 'all>joined 46 rows', 'clinics>joined 4 rows']);
  });

  it('marks the failed step before the slowest, in red', () => {
    const failed = run([step('read', 'read_file', 'Completed', 4000, 0, 5), step('check', 'validate', 'Failed', 20, 5, 0)]);
    const m = runMap(failed, 'time');
    expect(m.hot?.key).toBe('check');
    expect(m.nodes[1]).toMatchObject({ tone: 'crit', hot: true, badges: ['Failed'] });
    expect(m.edges[0].tone).toBeNull();
  });

  it('ranks by rows when asked, and the overview ranks tasks by what they cost', () => {
    expect(runMap(done, 'rows').nodes[0].share).toBeCloseTo(101766 / 203552, 5);
    expect(byTask(done, 'time').map(r => r.task)).toEqual(['aggregate', 'read_file', 'compute', 'save_file']);
    expect(byTask(done, 'rows')[0]).toMatchObject({ count: 1, share: 1 });
  });

  it('says durations and kinds in a few words', () => {
    expect([durationText(450), durationText(4600), durationText(125_000), durationText(null)]).toEqual(['450 ms', '4.6 sec', '2 min 5 sec', '—']);
    expect([stepKind('ai_prompt'), stepKind('sample'), stepKind('send_notification'), stepKind('legacy')]).toEqual(['ai', 'read', 'output', 'legacy']);
  });
});

describe('the run plan map -- the Overview sorts (owner 2026-10-27)', () => {
  it('starts ranked by cost and sorts by task name both ways', () => {
    try { localStorage.clear(); } catch { /* none */ }
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(RunMap);
    fixture.componentRef.setInput('timeline', run([step('read', 'read_file', 'Completed', 2600, 0, 10),
      step('agg', 'aggregate', 'Completed', 400, 10, 2), step('save', 'save_file', 'Completed', 60, 2, 2)]));
    const map = fixture.componentInstance;
    expect(map.sortedOverview().map(r => r.task)).toEqual(['read_file', 'aggregate', 'save_file']);
    map.sort.toggle('task');
    expect(map.sortedOverview().map(r => r.task)).toEqual(['aggregate', 'read_file', 'save_file']);
    map.sort.toggle('task');
    expect(map.sortedOverview().map(r => r.task)).toEqual(['save_file', 'read_file', 'aggregate']);
    map.sort.toggle('value');
    expect(map.sortedOverview().map(r => r.value)).toEqual([2600, 400, 60]);
  });
});
