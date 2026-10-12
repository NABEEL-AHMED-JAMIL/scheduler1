import { describe, it, expect, vi, afterEach } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { Subject, of } from 'rxjs';
import { JobEvent, JobEventsService } from '../../../core/socket/job-events.service';
import { FOLLOW_BACKOFF_MS, RunFollow, runState } from './run-follow';
import { Assistant } from './assistant';

/**
 * Owner bug 2026-10-12: a pipeline run from the AI assistant showed "Running" and never changed -- the card showed the
 * status the run had when it was queued. The card now follows the run to its end: on a job-status push for its job, and
 * on a backing-off timer between pushes; it stops once the run is final.
 */
const step = (key: string, index: number, status: string) => ({ stepExecutionId: 10 + index, index, key, task: 'select', status,
  startedAt: `2026-10-12T14:37:1${index}.000`, endedAt: status === 'Running' ? null : `2026-10-12T14:37:1${index + 1}.500` });
const timeline = (runStatus: string, steps: unknown[], reviewStatus = 'NOT_REQUIRED') => ({ status: 'SUCCESS', message: '', data: {
  jobQueueId: 8228, jobId: 2905, runStatus, attempt: 1, attempts: [1], legacy: false, steps, reviewStatus } });

function card(initialStatus = 'Running') {
  const pushes = new Subject<JobEvent>();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [RunFollow],
    providers: [
      provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: JobEventsService, useValue: { events: pushes.asObservable(), connected: signal(true) } },
      { provide: Dialog, useValue: { open: vi.fn(() => ({ closed: of(true) })) } },
    ],
  });
  const fixture = TestBed.createComponent(RunFollow);
  fixture.componentRef.setInput('jobId', 2905);
  fixture.componentRef.setInput('jobQueueId', 8228);
  fixture.componentRef.setInput('jobName', 'Hospital readmission risk (daily)');
  fixture.componentRef.setInput('initialStatus', initialStatus);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const answer = (body: object) => http.expectOne(r => r.url.endsWith('/sourceJob.json/stepExecutions') && r.params.get('jobQueueId') === '8228')
    .flush(body);
  return { fixture, http, answer, pushes, el: fixture.nativeElement as HTMLElement, c: fixture.componentInstance };
}

describe('RunFollow (the assistant run card)', () => {
  afterEach(() => vi.useRealTimers());

  it('follows a run the assistant started until the card says Completed, then stops', () => {
    vi.useFakeTimers();
    const { fixture, http, answer, el, c } = card('Running');
    answer(timeline('Running', [step('read', 0, 'Completed'), step('shape', 1, 'Running')]));
    fixture.detectChanges();
    expect(el.querySelector('[data-state]')!.getAttribute('data-state')).toBe('Running');
    expect(el.textContent).toContain('1 of 2 steps');
    expect(c.following()).toBe(true);

    vi.advanceTimersByTime(FOLLOW_BACKOFF_MS[0]);
    answer(timeline('Completed', [step('read', 0, 'Completed'), step('shape', 1, 'Completed')]));
    fixture.detectChanges();

    expect(el.querySelector('[data-state]')!.getAttribute('data-state')).toBe('Completed');
    expect(el.textContent).toContain('2 of 2 steps');
    expect(el.textContent).toContain('Run logs');
    expect(c.following()).toBe(false);
    vi.advanceTimersByTime(60_000);
    http.expectNone(r => r.url.endsWith('/sourceJob.json/stepExecutions'));
    http.verify();
  });

  it('reads again on a job-status push for its job, not for another job', () => {
    vi.useFakeTimers();
    const { fixture, http, answer, pushes, el } = card('Queue');
    answer(timeline('Queue', []));
    pushes.next({ type: 'job.status', jobId: 9999, jobRunningStatus: 'Completed' });
    vi.advanceTimersByTime(400);
    http.expectNone(r => r.url.endsWith('/sourceJob.json/stepExecutions'));
    pushes.next({ type: 'job.status', jobId: 2905, jobQueueId: 8228, jobRunningStatus: 'Completed' });
    vi.advanceTimersByTime(1000);
    // The push's read (the timer's own, due at 1.5 s, is replaced by it).
    const live = http.match(r => r.url.endsWith('/sourceJob.json/stepExecutions')).filter(r => !r.cancelled);
    expect(live.length).toBe(1);
    live[0].flush(timeline('Completed', [step('read', 0, 'Completed')]));
    fixture.detectChanges();
    expect(el.querySelector('[data-state]')!.getAttribute('data-state')).toBe('Completed');
  });

  it('backs off between reads while nothing changes', () => {
    vi.useFakeTimers();
    const { http, answer } = card('Running');
    answer(timeline('Running', [step('read', 0, 'Running')]));
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(FOLLOW_BACKOFF_MS[i] - 1);
      http.expectNone(r => r.url.endsWith('/sourceJob.json/stepExecutions'));
      vi.advanceTimersByTime(1);
      answer(timeline('Running', [step('read', 0, 'Running')]));
    }
  });

  it('a failed run says which step failed and offers Retry, which follows the run again', () => {
    vi.useFakeTimers();
    const { fixture, answer, el, c } = card('Running');
    answer(timeline('Failed', [{ ...step('read', 0, 'Failed'), statusMessage: 'No such file' }]));
    fixture.detectChanges();
    expect(el.querySelector('[data-state]')!.getAttribute('data-state')).toBe('Failed');
    expect(el.textContent).toContain('Step read failed: No such file');
    const retry = Array.from(el.querySelectorAll('button')).find(b => b.textContent!.includes('Retry'))!;
    retry.click();
    expect(c.following()).toBe(true);
    answer(timeline('Completed', [step('read', 0, 'Completed')]));
    fixture.detectChanges();
    expect(el.querySelector('[data-state]')!.getAttribute('data-state')).toBe('Completed');
  });

  it('a completed run whose results need a review says Waiting for review; a run paused at an approval says so', () => {
    expect(runState({ runStatus: 'Completed', reviewStatus: 'PENDING' })).toEqual({ label: 'Waiting for review', final: true });
    expect(runState({ runStatus: 'Running' })).toEqual({ label: 'Running', final: false });
    expect(runState(null, 'Queue')).toEqual({ label: 'Queue', final: false });
    expect(runState({ runStatus: 'Running', waitingForApproval: true })).toEqual({ label: 'Waiting for approval', final: false });
  });
});

describe('Assistant: a pipeline run from the chat', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the run the assistant started as a live card that reaches Completed', async () => {
    vi.useFakeTimers();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Assistant],
      providers: [
        provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: JobEventsService, useValue: { events: new Subject<JobEvent>().asObservable(), connected: signal(true) } },
      ],
    });
    const fixture = TestBed.createComponent(Assistant);
    const http = TestBed.inject(HttpTestingController);
    const a = fixture.componentInstance;
    a.messages.set([{ messageId: 1, conversationId: 7, seq: 3, role: 'assistant', content: 'Started the readmission run.', toolRunId: 55,
      runStatus: 'answered', card: null, artifact: null, dateCreated: '2026-10-12T14:37:17',
      links: [{ kind: 'execution', jobId: 2905, jobName: 'Hospital readmission risk (daily)', jobQueueId: 8228, status: 'Running' }] } as never]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-run-follow [data-state]')!.getAttribute('data-state')).toBe('Running');
    http.match(r => r.url.endsWith('/sourceJob.json/stepExecutions')).forEach(r => r.flush(timeline('Completed', [step('read', 0, 'Completed')])));
    fixture.detectChanges();
    expect(el.querySelector('app-run-follow [data-state]')!.getAttribute('data-state')).toBe('Completed');
  });
});
