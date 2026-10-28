import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_SUCCESS } from '../../../core/api/api.config';
import { RunTimelineStore } from '../run-steps/run-timeline.store';
import { RunLog, LINE_PX } from './run-log';
import {
  AuditEntry, auditLines, filterLines, levelCounts, levelOfText, levelWord, logText, mergeLines, nextError, stepLines, stepOfText,
} from './run-log.model';

/**
 * UX review 2026-10-12, run page fix: the run's Log -- its entries and a chosen step's own lines (the old Console) as one
 * stream, each with a level and a step, filtered by level, step and text; virtual for a big log; errors one press away.
 */
const ENTRIES: AuditEntry[] = [
  { jobAuditLogId: 1, dateCreated: '2026-10-07T14:06:46.469Z', logsDetail: 'Taken by the step engine: pipeline XRAY_TRIAGE, 13 step(s).' },
  { jobAuditLogId: 2, dateCreated: '2026-10-07T14:06:46.533Z', logsDetail: 'Step 3/13 <manifest> (read_file) started on 1 record(s).' },
  { jobAuditLogId: 3, dateCreated: '2026-10-07T14:06:46.549Z', logsDetail: 'Step 3/13 <manifest> (read_file) completed: 1 in, 40 out, 0.0 s.' },
  { jobAuditLogId: 4, dateCreated: '2026-10-07T14:06:46.563Z', logsDetail: 'Step 5/13 <classify> (ai_prompt) failed: the model did not answer.' },
  { jobAuditLogId: 5, dateCreated: '2026-10-07T14:06:49.700Z', logsDetail: 'Retrying step 5 in 3 s.' },
];

describe('the run log model', () => {
  it('reads a level from an entry\'s wording, and a step from the engine\'s "Step n/m <key>"', () => {
    expect(levelOfText('Step 5/13 <classify> (ai_prompt) failed: x')).toBe('ERROR');
    expect(levelOfText('Retrying step 5 in 3 s.')).toBe('WARN');
    expect(levelOfText('13 of 13 step(s) completed.')).toBe('INFO');
    expect(levelOfText('40 accepted, 0 rejected')).toBe('INFO');
    expect(levelOfText('Done with 0 errors')).toBe('INFO');
    expect(stepOfText('Step 3/13 <manifest> (read_file) started')).toBe('manifest');
    expect(stepOfText('Running 13 step(s): arrival, named')).toBeNull();
    expect(levelWord('warning')).toBe('WARN');
    expect(levelWord(null)).toBe('INFO');
  });

  it('filters by level, by step and by text', () => {
    const lines = auditLines(ENTRIES);
    expect(filterLines(lines, { term: '', levels: new Set(['ERROR']), step: null }).map(l => l.entry?.jobAuditLogId)).toEqual([4]);
    expect(filterLines(lines, { term: '', levels: new Set(['ERROR', 'WARN']), step: null }).length).toBe(2);
    expect(filterLines(lines, { term: '', levels: new Set(), step: 'manifest' }).map(l => l.entry?.jobAuditLogId)).toEqual([2, 3]);
    expect(filterLines(lines, { term: '40 OUT', levels: new Set(), step: null }).length).toBe(1);
    expect(levelCounts(lines)).toEqual({ ERROR: 1, WARN: 1, INFO: 3, DEBUG: 0 });
  });

  it('merges a step\'s own lines into the run\'s entries by time', () => {
    const own = stepLines('manifest', [{ lineNo: 1, level: 'INFO', message: '40 row(s) from manifest.csv', loggedAt: '2026-10-07T14:06:46.540Z' }]);
    const merged = mergeLines(auditLines(ENTRIES), own);
    expect(merged.map(l => l.source)).toEqual(['run', 'run', 'step', 'run', 'run', 'run']);
    expect(merged[2]).toMatchObject({ step: 'manifest', level: 'INFO', message: '40 row(s) from manifest.csv' });
  });

  it('finds the next and previous error, wrapping', () => {
    const lines = auditLines([...ENTRIES, { jobAuditLogId: 6, logsDetail: 'Could not upload.' }]);
    expect(nextError(lines, -1)).toBe(3);
    expect(nextError(lines, 3)).toBe(5);
    expect(nextError(lines, 5)).toBe(3);
    expect(nextError(lines, lines.length, -1)).toBe(5);
    expect(nextError(auditLines(ENTRIES.slice(0, 2)), -1)).toBe(-1);
  });

  it('writes the lines as text for Copy and Download', () => {
    const text = logText(auditLines(ENTRIES.slice(1, 2)), () => '09:06:46');
    expect(text).toBe('09:06:46  INFO   [manifest] Step 3/13 <manifest> (read_file) started on 1 record(s).\n');
  });
});

const TIMELINE = {
  jobQueueId: 8134, jobId: 2908, runStatus: 'Completed', attempt: 1, attempts: [1], legacy: false,
  steps: [
    { stepExecutionId: 4933, index: 2, key: 'manifest', name: 'Manifest of the sampled images', task: 'read_file', status: 'Completed', log: 'step', datasets: [] },
    { stepExecutionId: 4935, index: 4, key: 'classify', task: 'ai_prompt', status: 'Completed', log: 'step', datasets: [] },
  ],
};

function mount(entries: AuditEntry[] = ENTRIES) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RunLog], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), RunTimelineStore] });
  const http = TestBed.inject(HttpTestingController);
  TestBed.inject(RunTimelineStore).load('8134');
  http.expectOne(r => r.url.endsWith('/sourceJob.json/stepExecutions')).flush({ status: API_SUCCESS, data: TIMELINE });
  const fixture = TestBed.createComponent(RunLog);
  fixture.componentRef.setInput('entries', entries);
  fixture.componentRef.setInput('fileName', 'run-8134');
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, http, el, component: fixture.componentInstance, lines: () => [...el.querySelectorAll<HTMLElement>('.run-log-line')] };
}

describe('Run page: the Log tab', () => {
  it('shows each line with its time, level and step, monospaced on the log\'s ground', () => {
    const { lines } = mount();
    expect(lines().length).toBe(5);
    expect(lines()[3].dataset['level']).toBe('ERROR');
    expect(lines()[1].querySelector('.run-log-step')?.textContent).toBe('manifest');
    expect(lines()[1].querySelector('.run-log-time')?.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('filters by level with a count on each, and by text', () => {
    const { el, fixture, lines, component } = mount();
    const errors = el.querySelector<HTMLButtonElement>('button[data-level="ERROR"]')!;
    expect(errors.textContent).toContain('1');
    errors.click();
    fixture.detectChanges();
    expect(lines().map(l => l.dataset['level'])).toEqual(['ERROR']);
    expect(errors.getAttribute('aria-pressed')).toBe('true');
    errors.click();
    component.term.set('manifest');
    fixture.detectChanges();
    expect(lines().length).toBe(2);
    expect(el.querySelector('[data-test="log-count"]')?.textContent).toContain('2 of 5 lines');
  });

  it('shows one step: the entries about it and its own lines, read once', () => {
    const { fixture, http, lines, component } = mount();
    component.step.set('manifest');
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/sourceJob.json/stepLogs') && r.params.get('stepExecutionId') === '4933')
      .flush({ status: API_SUCCESS, data: { lines: [{ lineNo: 1, level: 'WARN', message: '2 row(s) had no label', loggedAt: '2026-10-07T14:06:46.540Z' }] } });
    fixture.detectChanges();
    expect(lines().map(l => l.textContent!.includes('no label') ? 'own' : 'run')).toEqual(['run', 'own', 'run']);
    component.step.set(null);
    fixture.detectChanges();
    component.step.set('manifest');
    fixture.detectChanges();
    http.expectNone(r => r.url.endsWith('/sourceJob.json/stepLogs'));
  });

  it('jumps to the next error and marks it', () => {
    const { el, fixture } = mount();
    el.querySelector<HTMLButtonElement>('[data-test="next-error"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.run-log-line.is-current')?.getAttribute('data-level')).toBe('ERROR');
    expect(el.querySelector('[data-test="log-errors"]')?.textContent).toContain('1 error');
  });

  it('draws only the lines in view of a big log, and wraps on request', () => {
    const big: AuditEntry[] = Array.from({ length: 20000 }, (_, i) => ({ jobAuditLogId: i, logsDetail: `line ${i}`,
      dateCreated: `2026-10-07T14:${String(Math.floor(i / 600) % 60).padStart(2, '0')}:00Z` }));
    const { el, fixture, lines, component } = mount(big);
    expect(lines().length).toBeLessThan(200);
    expect((el.querySelector('.run-log-spacer') as HTMLElement).style.height).toBe(`${20000 * LINE_PX}px`);
    // Scrolled to the middle, the lines there are drawn.
    component.scrollTop.set(10000 * LINE_PX);
    fixture.detectChanges();
    expect(lines().some(l => l.textContent!.includes('line 10000'))).toBe(true);
    component.wrap.set(true);
    fixture.detectChanges();
    expect(el.querySelector('.run-log-lines.is-wrap')).not.toBeNull();
    expect(lines().length).toBe(2000);
    expect(el.querySelector('[data-earlier]')?.textContent).toContain('18000 earlier lines are not shown.');
  });

  it('says so when nothing matches', () => {
    const { el, fixture, component } = mount();
    component.term.set('nothing like this');
    fixture.detectChanges();
    expect(el.querySelector('[data-test="log-empty"]')?.textContent).toContain('No lines match the filters.');
  });
});

describe('Run page: the Log tab -- loading, empty, error (owner 2026-10-27)', () => {
  it('says the run reported no entries once an empty log answers', () => {
    const { el } = mount([]);
    expect(el.querySelector('[data-test="log-empty"]')?.textContent).toContain('This run reported no log entries.');
  });

  it('is loading, not empty, while the first read is out', () => {
    const { fixture, el } = mount([]);
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(el.querySelector('[data-test="log-empty"]')).toBeNull();
    expect(el.querySelector('app-loading')).not.toBeNull();
  });

  it('shows the error with Try again when no line ever arrived', () => {
    const { fixture, el, component } = mount([]);
    let retried = 0;
    component.retry.subscribe(() => retried++);
    fixture.componentRef.setInput('error', 'The run could not be read.');
    fixture.detectChanges();
    const tryAgain = [...el.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Try again')!;
    tryAgain.click();
    expect(retried).toBe(1);
  });

  it('keeps the lines on screen when a later poll fails, and says so above them', () => {
    const { fixture, el, lines } = mount();
    fixture.componentRef.setInput('error', 'The run could not be read.');
    fixture.detectChanges();
    expect(lines().length).toBe(5);
    expect(el.querySelector('[data-test="log-stale"]')?.textContent).toContain('The run could not be read.');
  });
});
