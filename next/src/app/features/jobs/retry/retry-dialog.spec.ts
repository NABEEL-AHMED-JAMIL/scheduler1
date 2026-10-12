import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { RetryDialog } from './retry-dialog';
import { ToastService } from '../../../shared/ui/toast.service';
import { API_SUCCESS } from '../../../core/api/api.config';
import { attemptSentence, planOf, resumeLabel, stepLabel } from './run-retry';
import { RunSteps } from '../run-steps/run-steps';
import { failedStep } from '../run-steps/run-steps.model';

/**
 * MIG-345: a failed run is retried as its next attempt -- from the step that failed (the steps before it reused, not run or
 * billed again) or from the start. The console asks Core what each would do (sourceJob.json/retryPlan), offers what can
 * be done, says why not for what cannot, and keeps the dialog open with the reason when Core refuses the retry itself.
 */
const PLAN = {
  jobQueueId: 7701, jobId: 2961, attempt: 1, nextAttempt: 2, resumable: true, refusalKind: null, refusal: null,
  fromIndex: 2, fromKey: 'enrich', fromName: 'Enrich rows', definitionVersion: 4, ranVersion: 3,
  reused: [
    { index: 0, key: 'read', name: 'read', task: 'read_file', rowsOut: 1200, expiresAt: '2026-10-13T14:00:00', inputFiles: 1 },
    { index: 1, key: 'clean', name: 'Clean rows', task: 'transform', rowsOut: 1180, expiresAt: '2026-10-13T14:00:01', inputFiles: 0 },
  ],
  inputFiles: 1, inputsChecked: false, restartable: true, restartRefusal: null,
};

function openDialog(data: Record<string, unknown> = { jobQueueId: 7701 }) {
  const close = vi.fn();
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RetryDialog], providers: [provideHttpClient(), provideHttpClientTesting(),
    { provide: DIALOG_DATA, useValue: data }, { provide: DialogRef, useValue: { close } }, { provide: ToastService, useValue: toast }] });
  const fixture = TestBed.createComponent(RetryDialog);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const ask = http.expectOne(r => r.url.endsWith('/sourceJob.json/retryPlan'));
  expect(ask.request.params.get('jobQueueId')).toBe('7701');
  return { fixture, http, ask, close, toast, el: fixture.nativeElement as HTMLElement };
}

const button = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll('button')].find(b => b.textContent!.trim() === text) as HTMLButtonElement | undefined;
const radio = (el: HTMLElement, test: string) => el.querySelector<HTMLInputElement>(`[data-test="${test}"] input[type="radio"]`)!;

describe('Retry a failed run', () => {
  it('offers Retry from the failed step first, listing the steps it reuses and that they are not billed twice', () => {
    const { fixture, ask, el } = openDialog();
    ask.flush({ status: API_SUCCESS, message: 'Resumable.', data: PLAN });
    fixture.detectChanges();
    const resume = el.querySelector('[data-test="retry-resume"]')!.textContent!;
    expect(resume).toContain('Retry from step 3 <enrich>');
    expect(resume).toContain('2 steps before it are not run again');
    expect(resume).toContain('not billed twice');
    expect(resume).toContain('step 2 Clean rows <clean>');
    expect(resume).toContain('version 4; the run ran version 3');
    expect(resume).toContain('The 1 file those steps read is checked first');
    expect(radio(el, 'retry-resume').checked).toBe(true);
    expect(button(el, 'Retry from step 3 <enrich>')!.disabled).toBe(false);
  });

  it('retries from the failed step and closes once the run is queued again', () => {
    const { fixture, http, ask, el, close, toast } = openDialog();
    ask.flush({ status: API_SUCCESS, data: PLAN });
    fixture.detectChanges();
    button(el, 'Retry from step 3 <enrich>')!.click();
    const post = http.expectOne(r => r.url.endsWith('/sourceJob.json/retryRun'));
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ jobQueueId: 7701, from: 'failed_step' });
    post.flush({ status: API_SUCCESS, message: 'Run 7701 queued to resume from step 3 <enrich> as attempt 2, reusing 2 step(s).' });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('attempt 2'));
    expect(close).toHaveBeenCalledWith(true);
  });

  it('runs again from the start when that is chosen', () => {
    const { fixture, http, ask, el, close } = openDialog({ jobQueueId: 7701, from: 'start' });
    ask.flush({ status: API_SUCCESS, data: PLAN });
    fixture.detectChanges();
    expect(radio(el, 'retry-restart').checked).toBe(true);
    button(el, 'Run again from the start')!.click();
    const post = http.expectOne(r => r.url.endsWith('/sourceJob.json/retryRun'));
    expect(post.request.body).toEqual({ jobQueueId: 7701, from: 'start' });
    post.flush({ status: API_SUCCESS, message: 'Run 7701 queued again from the start as attempt 2.' });
    expect(close).toHaveBeenCalledWith(true);
  });

  it('says why a resume cannot be done and offers the start instead', () => {
    const { fixture, ask, el } = openDialog();
    ask.flush({ status: API_SUCCESS, data: { ...PLAN, resumable: false, refusalKind: 'pipeline-changed',
      refusal: 'The pipeline changed before the failed step <enrich> since this run (version 3, now 4): step 2 <clean>\'s settings.' } });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="retry-resume-refusal"]')!.textContent).toContain('step 2 <clean>\'s settings');
    expect(radio(el, 'retry-resume').disabled).toBe(true);
    expect(radio(el, 'retry-restart').checked).toBe(true);
    expect(button(el, 'Run again from the start')!.disabled).toBe(false);
  });

  it('offers nothing when neither can be done (a person who is not an administrator, a resume refused)', () => {
    const { fixture, ask, el } = openDialog();
    ask.flush({ status: API_SUCCESS, data: { ...PLAN, resumable: false, refusal: 'The kept output of step <read> expired.',
      restartable: false, restartRefusal: 'Running a failed run again from the start is a workspace administrator\'s.' } });
    fixture.detectChanges();
    expect(el.textContent).toContain('a workspace administrator\'s');
    const confirm = [...el.querySelectorAll('button')].find(b => /Retry from/.test(b.textContent!));
    expect(confirm!.disabled).toBe(true);
    expect(button(el, 'Close')).toBeTruthy();
  });

  it('keeps the dialog open with Core\'s reason when the retry itself is refused (an input file changed)', () => {
    const { fixture, http, ask, el, close } = openDialog();
    ask.flush({ status: API_SUCCESS, data: PLAN });
    fixture.detectChanges();
    button(el, 'Retry from step 3 <enrich>')!.click();
    http.expectOne(r => r.url.endsWith('/sourceJob.json/retryRun')).flush({ status: 'ERROR',
      message: 'The file in/a.csv that step <read> read has changed since this run; run it again from the start.',
      data: { ...PLAN, resumable: false, refusalKind: 'input-changed', refusal: 'The file in/a.csv … has changed.', mode: 'resume' } });
    fixture.detectChanges();
    expect(close).not.toHaveBeenCalled();
    expect(el.querySelector('[data-test="retry-refused"]')!.textContent).toContain('has changed since this run');
    expect(radio(el, 'retry-restart').checked).toBe(true);
  });
});

describe('Retry wording', () => {
  it('names the step by number, name and key', () => {
    expect(stepLabel(2, 'enrich')).toBe('step 3 <enrich>');
    expect(stepLabel(1, 'clean', 'Clean rows')).toBe('step 2 Clean rows <clean>');
    expect(resumeLabel({ fromIndex: 2, fromKey: 'enrich' })).toBe('Retry from step 3 <enrich>');
    expect(resumeLabel(null)).toBe('Retry from the failed step');
    expect(planOf([])).toBeNull();
    expect(planOf({ jobQueueId: 1, resumable: false })!.reused).toEqual([]);
  });

  it('says who asked for an attempt, how and from where', () => {
    expect(attemptSentence({ attempt: 2, previousAttempt: 1, mode: 'resume', fromStepIndex: 2, fromStepKey: 'enrich', reusedSteps: 2,
      requestedVia: 'console', requestedBy: 'Dana Ortiz' }))
      .toBe('Attempt 2: resumed from step 3 <enrich>, reusing 2 steps of attempt 1 by Dana Ortiz');
    expect(attemptSentence({ attempt: 3, previousAttempt: 2, mode: 'restart', reusedSteps: 0, requestedVia: 'api',
      requestedBy: 'API client etl_abc' })).toBe('Attempt 3: run again from the start after attempt 2 failed by API client etl_abc');
  });
});

const step = (index: number, key: string, status: string, extra: Record<string, unknown> = {}) => ({
  stepExecutionId: 2000 + index, index, key, task: 'transform', status, startedAt: status === 'Completed' ? '2026-10-12T10:00:00' : null,
  durationMs: 100, recordsIn: 3, recordsOut: 3, tries: 1, onError: 'fail', datasets: [], log: 'step', ...extra,
});

function mountSteps(timeline: unknown) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RunSteps], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
  const fixture = TestBed.createComponent(RunSteps);
  fixture.componentRef.setInput('jobQueueId', '7701');
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(r => r.url.endsWith('/sourceJob.json/stepExecutions')).flush({ status: API_SUCCESS, data: timeline });
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('Run logs: the retry of a failed run', () => {
  const failed = {
    jobQueueId: 7701, jobId: 2961, runStatus: 'Failed', attempt: 1, attempts: [1], legacy: false,
    steps: [step(0, 'read', 'Completed'), step(1, 'clean', 'Completed'), step(2, 'enrich', 'Failed'), step(3, 'save', 'Skip')],
  };

  it('offers Retry from the failed step and Run again from the start on a run that failed on its latest attempt', () => {
    const { el } = mountSteps(failed);
    const bar = el.querySelector('[data-test="run-retry"]')!;
    expect(bar.textContent).toContain('Failed at step 3');
    expect(el.querySelector('[data-test="retry-from-step"]')!.textContent!.trim()).toBe('Retry from step 3 <enrich>');
    expect(el.querySelector('[data-test="retry-from-start"]')!.textContent!.trim()).toBe('Run again from the start');
  });

  it('offers no retry for a completed run, or for an earlier attempt shown', () => {
    expect(failedStep({ ...failed, runStatus: 'Completed' } as never)).toBeNull();
    expect(failedStep({ ...failed, attempts: [1, 2] } as never)).toBeNull();
    const { el } = mountSteps({ ...failed, runStatus: 'Running' });
    expect(el.querySelector('[data-test="run-retry"]')).toBeNull();
  });

  it('shows a resumed attempt\'s reused steps as not run again, and who asked for it', () => {
    const { el } = mountSteps({
      ...failed, runStatus: 'Completed', attempt: 2, attempts: [1, 2],
      steps: [step(0, 'read', 'Completed', { startedAt: null, durationMs: null, reusedFromAttempt: 1 }),
        step(1, 'clean', 'Completed', { startedAt: null, durationMs: null, reusedFromAttempt: 1 }),
        step(2, 'enrich', 'Completed'), step(3, 'save', 'Completed')],
      attemptDetails: [{ attempt: 2, previousAttempt: 1, mode: 'resume', fromStepIndex: 2, fromStepKey: 'enrich', reusedSteps: 2,
        requestedVia: 'console', requestedBy: 'Dana Ortiz', requestedAt: '2026-10-12T10:05:00' }],
    });
    expect(el.querySelectorAll('[data-test="step-reused"]').length).toBe(2);
    expect(el.querySelector('[data-step="read"]')!.textContent).toContain('Not run again');
    expect(el.querySelector('[data-test="attempt-detail"]')!.textContent)
      .toContain('Attempt 2: resumed from step 3 <enrich>, reusing 2 steps of attempt 1 by Dana Ortiz');
    expect(el.querySelector('[data-test="run-retry"]')).toBeNull();
  });
});
