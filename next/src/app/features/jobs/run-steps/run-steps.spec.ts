import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RunSteps } from './run-steps';
import { API_SUCCESS } from '../../../core/api/api.config';
import { engineTimeline, errorText, focusStep, recordsLabel } from './run-steps.model';

/**
 * MIG-251: a step-engine run's steps on the run's page -- a Timeline of every step (time, duration, records, errors,
 * the datasets it wrote) and a Console of one step's own lines -- while a legacy run gets nothing new at all.
 */
const step = (index: number, key: string, task: string, extra: Record<string, unknown> = {}) => ({
  stepExecutionId: 1024 + index, index, key, task, status: 'Completed',
  startedAt: `2026-09-29T00:20:3${index}.10`, endedAt: `2026-09-29T00:20:3${index}.30`, durationMs: 200 + index,
  recordsIn: index ? 3 : 0, recordsOut: 3, tries: 1, onError: 'fail', statusMessage: 'Completed in 0.2 s: 3 in, 3 out.',
  error: null, datasets: [{ runDatasetId: 1024 + index, name: 'output', rowCount: 3, columns: ['id', 'name'], expiresAt: '2026-09-30T00:20:30' }],
  log: 'step', ...extra,
});

const ENGINE = {
  jobQueueId: 7396, jobId: 2849, runStatus: 'Completed', attempt: 1, attempts: [1], legacy: false, pipelineDefinitionId: 1030,
  steps: [
    step(0, 'read', 'read_file'),
    step(1, 'check', 'validate'),
    step(2, 'shape', 'transform'),
    step(3, 'out', 'save_file', { datasets: [{ runDatasetId: 1027, name: 'customers-clean.json', rowCount: 3, columns: ['id'], expiresAt: null }] }),
    step(4, 'publish', 'upload_bucket'),
  ],
  aiSteps: [],
};

const LEGACY = {
  jobQueueId: 7383, jobId: 2834, runStatus: 'Completed', attempt: 1, attempts: [1], legacy: true,
  steps: [{ stepExecutionId: null, index: 0, key: 'legacy', task: 'legacy', status: 'Completed', log: 'run', datasets: [] }],
  aiSteps: [],
};

const LINES = { stepExecutionId: 1024, jobQueueId: 7396, stepKey: 'read', attempt: 1, lines: [
  { lineNo: 1, level: 'INFO', message: 'Try 1 of 3.', loggedAt: '2026-09-29T00:20:29.52' },
  { lineNo: 2, level: 'WARN', message: '3 row(s) from ui-review-s3/in/live.csv', loggedAt: '2026-09-29T00:20:30.17' },
] };

function mount(timeline: unknown, jobQueueId = '7396') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RunSteps], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
  const fixture = TestBed.createComponent(RunSteps);
  fixture.componentRef.setInput('jobQueueId', jobQueueId);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const req = http.expectOne(r => r.url.endsWith('/sourceJob.json/stepExecutions'));
  expect(req.request.params.get('jobQueueId')).toBe(jobQueueId);
  req.flush({ status: API_SUCCESS, data: timeline });
  fixture.detectChanges();
  return { fixture, http, el: fixture.nativeElement as HTMLElement, component: fixture.componentInstance };
}

const buttonNamed = (el: HTMLElement, name: string) =>
  [...el.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() === name) as HTMLButtonElement | undefined;

describe('RunSteps: a step-engine run', () => {
  it('lists every step in order with its task, status, duration and records', () => {
    const { el } = mount(ENGINE);
    const rows = [...el.querySelectorAll<HTMLElement>('.exec-step')];
    expect(rows.map(r => r.dataset['step'])).toEqual(['read', 'check', 'shape', 'out', 'publish']);
    expect(rows[0].textContent).toContain('read_file');
    expect(rows[0].querySelector('app-status')?.textContent).toContain('Completed');
    expect(rows[0].textContent).toContain('200ms');
    expect(rows[1].textContent).toContain('3 → 3');
    // Step times are the server's naive wall-clock, printed on the 24-hour clock with seconds.
    expect(rows[0].textContent).toContain('00:20:30');
  });

  // Wave 4: Core serves a dataset now (sourceJob.json/runDataset), so each one offers its download -- see run-steps.files.spec.ts.
  it('names the datasets each step wrote, with their rows, and offers each one\'s download', () => {
    const { el } = mount(ENGINE);
    const out = el.querySelector<HTMLElement>('.exec-step[data-step="out"]')!;
    expect(out.textContent).toContain('customers-clean.json');
    expect(out.textContent).toContain('3 rows');
    expect(out.querySelectorAll('[aria-label^="Download"]').length).toBe(1);
  });

  it('shows a failed step\'s error and opens on it', () => {
    const failed = { ...ENGINE, runStatus: 'Failed', steps: [
      step(0, 'read', 'read_file'),
      step(1, 'check', 'validate', { status: 'Failed', recordsOut: null, tries: 3, error: { message: 'Column balance is not a number', tries: 3, timedOut: false } }),
      step(2, 'shape', 'transform', { status: 'Skip', stepExecutionId: 1026 }),
    ] };
    const { el, component } = mount(failed);
    const check = el.querySelector<HTMLElement>('.exec-step[data-step="check"]')!;
    expect(check.textContent).toContain('Column balance is not a number');
    expect(check.textContent).toContain('3 tries');
    expect(component.selectedStep()?.key).toBe('check');
  });

  it('switches to the Console and reads the chosen step\'s own lines', () => {
    const { fixture, http, el } = mount(ENGINE);
    buttonNamed(el, 'Console')!.click();
    fixture.detectChanges();
    const req = http.expectOne(r => r.url.endsWith('/sourceJob.json/stepLogs'));
    expect(req.request.params.get('stepExecutionId')).toBe('1024');
    req.flush({ status: API_SUCCESS, data: LINES });
    fixture.detectChanges();
    const lines = [...el.querySelectorAll('.exec-steps .log-console-line')].map(l => l.textContent!.replace(/\s+/g, ' ').trim());
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('INFO');
    expect(lines[0]).toContain('Try 1 of 3.');
    expect(lines[1]).toContain('WARN');
  });

  it('opens a step\'s log from its row, and reads each step once', () => {
    const { fixture, http, el, component } = mount(ENGINE);
    buttonNamed(el, 'Show the log of step shape')!.click();
    fixture.detectChanges();
    expect(component.view()).toBe('console');
    http.expectOne(r => r.url.endsWith('/sourceJob.json/stepLogs') && r.params.get('stepExecutionId') === '1026')
      .flush({ status: API_SUCCESS, data: { ...LINES, stepExecutionId: 1026, lines: [] } });
    fixture.detectChanges();
    expect(el.querySelector('.exec-steps')?.textContent).toContain('This step wrote no log lines.');
    component.view.set('timeline');
    fixture.detectChanges();
    component.view.set('console');
    fixture.detectChanges();
    http.expectNone(r => r.url.endsWith('/sourceJob.json/stepLogs'));
  });

  it('offers each attempt of a retried run, and reads the one chosen', () => {
    const { fixture, http, el } = mount({ ...ENGINE, attempt: 2, attempts: [1, 2] });
    const attempt1 = buttonNamed(el, 'Attempt 1')!;
    expect(attempt1).toBeTruthy();
    attempt1.click();
    fixture.detectChanges();
    const req = http.expectOne(r => r.url.endsWith('/sourceJob.json/stepExecutions'));
    expect(req.request.params.get('attempt')).toBe('1');
  });

  it('shows the run\'s AI trace: the model, the prompt version and how the model was chosen', () => {
    const { el } = mount({ ...ENGINE, aiSteps: [{ stepKey: 'summary', runIn: 'server', promptId: 12, promptVersion: 3,
      outcome: 'answered', model: 'gpt-4.1-mini', modelChoice: 'run', profileSource: 'run', connectionId: 5, modelOptionId: 7 }] });
    const trace = el.querySelector<HTMLElement>('.exec-ai-trace')!;
    expect(trace.textContent).toContain('summary');
    expect(trace.textContent).toContain('gpt-4.1-mini');
    expect(trace.textContent).toContain('v3');
    expect(trace.textContent).toContain('Answered');
  });
});

describe('RunSteps: a legacy run', () => {
  it('draws nothing, so the run\'s page stays as it is today', () => {
    const { el } = mount(LEGACY, '7383');
    expect(el.querySelector('.exec-steps')).toBeNull();
    expect(el.textContent!.trim()).toBe('');
  });

  it('draws nothing when the timeline cannot be read', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [RunSteps], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(RunSteps);
    fixture.componentRef.setInput('jobQueueId', '7396');
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(r => r.url.endsWith('/sourceJob.json/stepExecutions'))
      .flush({ status: 'ERROR', message: 'Run not found.' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.exec-steps')).toBeNull();
  });
});

describe('run-steps model', () => {
  it('reads only an engine timeline with steps as one worth drawing', () => {
    expect(engineTimeline(ENGINE)).not.toBeNull();
    expect(engineTimeline(LEGACY)).toBeNull();
    expect(engineTimeline([])).toBeNull();
    expect(engineTimeline({ ...ENGINE, steps: [] })).toBeNull();
    expect(engineTimeline(null)).toBeNull();
  });

  it('writes records and errors plainly', () => {
    expect(recordsLabel(step(0, 'a', 'b') as any)).toBe('0 → 3');
    expect(recordsLabel({ ...step(0, 'a', 'b'), recordsIn: null } as any)).toBe('— → 3');
    expect(errorText({ error: { message: 'Boom', timedOut: true } } as any)).toBe('Boom (timed out)');
    expect(errorText({ error: 'plain' } as any)).toBe('plain');
    expect(errorText({ error: null } as any)).toBe('');
  });

  it('opens on the failed step, else the running one, else the first', () => {
    const steps = ENGINE.steps as any[];
    expect(focusStep(steps)?.key).toBe('read');
    expect(focusStep([steps[0], { ...steps[1], status: 'Running' }])?.key).toBe('check');
    expect(focusStep([{ ...steps[0], status: 'Failed' }, { ...steps[1], status: 'Running' }])?.key).toBe('read');
    expect(focusStep([])).toBeNull();
  });
});

describe('RunSteps: the Console\'s step picker', () => {
  it('shows the step whose lines are on screen when the Console opens from a row', () => {
    const { fixture, el } = mount(ENGINE);
    buttonNamed(el, 'Show the log of step publish')!.click();
    fixture.detectChanges();
    const select = el.querySelector<HTMLSelectElement>('#run-step-pick')!;
    expect(select.value).toBe('publish');
  });
});
