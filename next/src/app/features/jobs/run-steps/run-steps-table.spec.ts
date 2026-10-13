import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_SUCCESS } from '../../../core/api/api.config';
import { RunStepsTable } from './run-steps-table';
import { RunTimelineStore } from './run-timeline.store';
import { RunAiTrace } from './run-ai-trace';
import { engineTimeline, errorText, focusStep, recordsLabel } from './run-steps.model';

/**
 * UX review 2026-10-12, run page fix: the run's steps as one compact table -- name, key and task, status, start,
 * duration against the slowest, rows in and out, outputs, and the step's own log in the side panel.
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
    step(0, 'read', 'read_file', { name: 'Customers from the inbox' }),
    step(1, 'check', 'validate', { recordsOut: 1, datasets: [{ runDatasetId: 1025, name: 'output', rowCount: 1 }] }),
    step(2, 'shape', 'transform', { durationMs: 900 }),
    step(3, 'out', 'save_file', { datasets: [{ runDatasetId: 1027, name: 'customers-clean.json', rowCount: 3, columns: ['id'], expiresAt: null }] }),
    step(4, 'report', 'render_pdf', { datasets: [{ runDatasetId: 1028, name: 'customers.pdf', rowCount: 1 }] }),
  ],
  aiSteps: [],
};

const LEGACY = {
  jobQueueId: 7383, jobId: 2834, runStatus: 'Completed', attempt: 1, attempts: [1], legacy: true,
  steps: [{ stepExecutionId: null, index: 0, key: 'legacy', task: 'legacy', status: 'Completed', log: 'run', datasets: [] }],
  aiSteps: [],
};

const OUTPUTS = [{ runOutputId: 9, stepExecutionId: 1028, stepIndex: 4, stepKey: 'report', task: 'render_pdf', kind: 'file',
  name: 'customers.pdf', format: 'pdf', rowCount: 1, byteCount: 22359, pageCount: 3, runDatasetId: 1028 }];

function mountTable(timeline: unknown, outputs: unknown[] = OUTPUTS) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RunStepsTable, RunAiTrace],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), RunTimelineStore] });
  const fixture = TestBed.createComponent(RunStepsTable);
  const store = TestBed.inject(RunTimelineStore);
  const http = TestBed.inject(HttpTestingController);
  store.load('7396');
  http.expectOne(r => r.url.endsWith('/sourceJob.json/stepExecutions')).flush({ status: API_SUCCESS, data: timeline });
  http.match(r => r.url.endsWith('/sourceJob.json/runOutputs')).forEach(r => r.flush({ status: API_SUCCESS, data: { outputs } }));
  fixture.detectChanges();
  return { fixture, http, store, el: fixture.nativeElement as HTMLElement, component: fixture.componentInstance };
}

const rowsOf = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('tr.exec-step')];

describe('Run page: the steps table', () => {
  it('lists every step in order: its name, with the key and task beneath', () => {
    const { el } = mountTable(ENGINE);
    const rows = rowsOf(el);
    expect(rows.map(r => r.dataset['step'])).toEqual(['read', 'check', 'shape', 'out', 'report']);
    expect(rows[0].querySelector('.rs-name')?.textContent?.trim()).toBe('Customers from the inbox');
    expect(rows[0].querySelector('.rs-sub')?.textContent).toContain('read');
    expect(rows[0].querySelector('.rs-sub')?.textContent).toContain('read_file');
    // A step with no name in its pipeline leads with its key.
    expect(rows[1].querySelector('.rs-name')?.textContent?.trim()).toBe('check');
    expect(rows[0].querySelector('app-status')?.textContent).toContain('Completed');
    // Step times are the server's naive wall-clock, printed on the 24-hour clock with seconds.
    expect(rows[0].textContent).toContain('00:20:30');
    expect(rows[1].textContent).toContain('3 → 1');
  });

  it('says the rows in words with the right plural, in the cell\'s title', () => {
    const { el } = mountTable(ENGINE);
    const cell = (row: HTMLElement) => row.querySelector('td.num')!.getAttribute('title');
    expect(cell(rowsOf(el)[0])).toBe('0 records in, 3 records out');
    expect(cell(rowsOf(el)[1])).toBe('3 records in, 1 record out');
    expect(el.textContent).not.toMatch(/\b1 records\b|\b1 rows\b/);
  });

  it('marks the slowest step and draws each duration against it', () => {
    const { el } = mountTable(ENGINE);
    const slow = el.querySelectorAll('tr.is-slowest');
    expect(slow.length).toBe(1);
    expect((slow[0] as HTMLElement).dataset['step']).toBe('shape');
    expect(el.querySelector('[data-test="slowest-note"]')?.textContent).toContain('Slowest: shape · 900ms');
    expect((slow[0].querySelector('.rs-fill') as HTMLElement).style.width).toBe('100%');
  });

  it('tints a failed step and says its error on its row', () => {
    const failed = { ...ENGINE, runStatus: 'Failed', steps: [
      step(0, 'read', 'read_file'),
      step(1, 'check', 'validate', { status: 'Failed', recordsOut: null, tries: 3, error: { message: 'Column balance is not a number', tries: 3, timedOut: false } }),
      step(2, 'shape', 'transform', { status: 'Skip', statusMessage: 'Skipped: an earlier step failed.' }),
    ] };
    const { el } = mountTable(failed);
    const check = el.querySelector<HTMLElement>('tr[data-step="check"]')!;
    expect(check.classList).toContain('is-crit');
    expect(check.querySelector('[data-test="step-problem"]')?.textContent).toContain('Column balance is not a number');
    expect(check.textContent).toContain('3 tries');
    expect(el.querySelector('tr[data-step="shape"]')!.classList).toContain('is-warn');
    expect(el.querySelector('tr[data-step="read"]')!.classList).not.toContain('is-crit');
  });

  it('describes a render_pdf report by its pages and size, never as a row, and offers it only as a PDF', () => {
    const { el, http } = mountTable(ENGINE);
    const report = el.querySelector<HTMLElement>('tr[data-step="report"] [data-test="step-output"]')!;
    expect(report.textContent).toContain('PDF · 3 pages · 21.8 KB');
    expect(report.textContent).not.toContain('row');
    report.querySelector<HTMLButtonElement>('button')!.click();
    const req = http.expectOne(r => r.url.endsWith('/sourceJob.json/runDataset'));
    expect(req.request.params.get('format')).toBe('pdf');
    // A dataset offers its row formats.
    expect(el.querySelector('tr[data-step="out"] [data-test="step-output"]')?.textContent).toContain('3 rows');
  });

  it('opens a step\'s own lines in the side panel, read once', () => {
    const { el, http, fixture } = mountTable(ENGINE);
    el.querySelector<HTMLButtonElement>('[aria-label="Show the log of step shape"]')!.click();
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/sourceJob.json/stepLogs') && r.params.get('stepExecutionId') === '1026')
      .flush({ status: API_SUCCESS, data: { lines: [{ lineNo: 1, level: 'WARN', message: '3 row(s) reshaped', loggedAt: '2026-09-29T00:20:32.20' }] } });
    fixture.detectChanges();
    const panel = document.querySelector('app-run-step-log-panel')!;
    expect(panel.textContent).toContain('Step 3 · shape');
    expect(panel.querySelector('.run-log-line[data-level="WARN"]')?.textContent).toContain('3 row(s) reshaped');
    el.querySelector<HTMLButtonElement>('[aria-label="Show the log of step shape"]')!.click();
    http.expectNone(r => r.url.endsWith('/sourceJob.json/stepLogs'));
  });

  it('offers each attempt of a retried run, and reads the one chosen', () => {
    const { el, http, fixture } = mountTable({ ...ENGINE, attempt: 2, attempts: [1, 2] });
    const attempt1 = [...el.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Attempt 1')!;
    attempt1.click();
    fixture.detectChanges();
    expect(http.expectOne(r => r.url.endsWith('/sourceJob.json/stepExecutions')).request.params.get('attempt')).toBe('1');
  });

  it('says a legacy run has no steps here', () => {
    const { el } = mountTable(LEGACY);
    expect(el.querySelector('tr.exec-step')).toBeNull();
    expect(el.querySelector('[data-test="legacy-steps"]')?.textContent).toContain('not taken by the step engine');
  });
});

describe('Run page: an Approval step (MIG-346)', () => {
  const waiting = { ...ENGINE, runStatus: 'Running', waitingForApproval: true, steps: [
    step(0, 'read', 'read_file'),
    step(1, 'approve', 'approval', { status: 'Running', datasets: [], statusMessage: 'Waiting for approval: Send 120 results?',
      approval: { approvalId: 1203, status: 'PENDING', waiting: true, title: 'Send 120 results?', reviewers: { kind: 'role', value: 'TENANT_ADMIN' },
        expiresAt: '2026-10-15T20:00:00Z' } }),
    step(2, 'send', 'send_webhook', { status: 'Queue', startedAt: null, datasets: [] }),
  ] };

  it('says a waiting run waits for approval, by whom and until when', () => {
    const { el } = mountTable(waiting, []);
    const row = el.querySelector<HTMLElement>('[data-step="approve"]')!;
    expect(row.querySelector('[data-test="step-waiting-approval"]')?.textContent).toContain('Waiting for approval');
    expect(row.querySelector('app-status')).toBeNull();
    expect(row.querySelector('[data-test="step-approval"]')?.textContent).toContain('Waiting for approval by the workspace administrators in their Task inbox, until');
  });

  it('says who approved, with their picture, and what they said', () => {
    const approved = { ...waiting, runStatus: 'Completed', waitingForApproval: false, steps: [waiting.steps[0],
      { ...waiting.steps[1], status: 'Completed', approval: { approvalId: 1203, status: 'APPROVED', waiting: false,
        decidedBy: 'Ana Ruiz (user 4641)', decidedByUserId: 4641, comment: 'totals match', decidedAt: '2026-10-12T20:00:00Z' } }, waiting.steps[2]] };
    const { el } = mountTable(approved, []);
    const row = el.querySelector<HTMLElement>('[data-step="approve"]')!;
    expect(row.querySelector('[data-test="step-waiting-approval"]')).toBeNull();
    expect(row.querySelector('[data-test="step-approval"]')?.textContent).toContain('Approved by Ana Ruiz (user 4641): totals match');
    expect(row.querySelector('[data-test="step-approval"] app-avatar')).not.toBeNull();
  });
});

describe('Run page: the AI trace', () => {
  it('shows the model, the prompt version and how the model was chosen', () => {
    mountTable({ ...ENGINE, aiSteps: [{ stepKey: 'summary', runIn: 'server', promptId: 12, promptVersion: 3,
      outcome: 'answered', model: 'gpt-4.1-mini', modelChoice: 'run', profileSource: 'run', connectionId: 5, modelOptionId: 7 }] });
    const trace = TestBed.createComponent(RunAiTrace);
    trace.detectChanges();
    const text = (trace.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('summary');
    expect(text).toContain('gpt-4.1-mini');
    expect(text).toContain('v3');
    expect(text).toContain('Answered');
    expect(text).toContain('chosen for this run');
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
