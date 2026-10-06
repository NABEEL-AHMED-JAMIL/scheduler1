import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { JobHistory } from './job-history';
import { JobEventsService } from '../../../core/socket/job-events.service';
import { API_SUCCESS } from '../../../core/api/api.config';
import { useMemoryStorage } from '../../../shared/testing/memory-storage';
import { arrivalsOf, patternProblem, runsStartedByFile, triggerOf, triggerSentence } from '../inbox/inbox-trigger';

/**
 * MIG-251 on MIG-239: a job started by a file arriving in the inbox (the "Event" start) says so on its Executions --
 * each run a file started names the file, and the job's detail says what the trigger takes and what the last files
 * did (Started, or Skipped and why). A job with no trigger shows what it showed before.
 */
const RUNS = { jobQueues: [
  { jobQueueId: 7387, jobId: 2848, jobStatus: 'Completed', startTime: '2026-09-28T23:41:24', endTime: '2026-09-28T23:41:25' },
  { jobQueueId: 7385, jobId: 2848, jobStatus: 'Completed', startTime: '2026-09-28T23:30:00', endTime: '2026-09-28T23:30:01' },
] };
const DETAIL = { jobId: 2848, jobName: 'UI-CHECK steps job', jobStatus: 'Active', execution: 'Manual' };
const TRIGGER = { jobId: 2848, configured: true, enabled: true, filePattern: '*.csv', dateUpdated: '2026-09-29T04:41:14.343568Z' };
const ARRIVALS = [
  { arrivalId: 'a1', bucket: 'b', key: 'intake/x-live-customers.csv', fileName: 'live-customers.csv', bytes: 115,
    outcome: 'Started', reason: null, jobQueueId: 7387, dateCreated: '2026-09-29T04:41:23.398790Z' },
  { arrivalId: 'a2', bucket: 'b', key: 'intake/y-late.csv', fileName: 'late.csv', bytes: 9,
    outcome: 'Skipped', reason: 'A job can\'t be run while its last run is still in flight.', jobQueueId: null, dateCreated: '2026-09-29T04:42:00Z' },
];

function open(answers: { trigger?: unknown; arrivals?: unknown } = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [JobHistory], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
    { provide: JobEventsService, useValue: { connected: signal(false), events: new Subject() } }] });
  const fixture = TestBed.createComponent(JobHistory);
  fixture.componentRef.setInput('jobId', '2848');
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const reply = (path: string, data: unknown) =>
    http.match(r => r.url.endsWith(path)).forEach(r => r.flush({ status: API_SUCCESS, data }));
  reply('/sourceJob.json/fetchSourceJobQueueListWithJobId', RUNS);
  reply('/sourceJob.json/fetchSourceJobDetailWithSourceJobId', DETAIL);
  reply('/sourceJob.json/listSourceJob', [DETAIL]);
  const triggerAsk = http.match(r => r.url.endsWith('/sourceJob.json/inboxTrigger'));
  const arrivalAsk = http.match(r => r.url.endsWith('/sourceJob.json/inboxArrivals'));
  triggerAsk.forEach(r => r.flush({ status: API_SUCCESS, data: answers.trigger ?? TRIGGER }));
  arrivalAsk.forEach(r => r.flush({ status: API_SUCCESS, data: answers.arrivals ?? ARRIVALS }));
  fixture.detectChanges();
  return { fixture, http, triggerAsk, arrivalAsk, el: fixture.nativeElement as HTMLElement, component: fixture.componentInstance };
}

const rowOf = (el: HTMLElement, run: number) =>
  [...el.querySelectorAll('tbody tr')].find(tr => tr.textContent!.includes(`#${run}`)) as HTMLElement;

describe('Executions: runs a file started', () => {
  useMemoryStorage();
  it('asks for the job\'s trigger and its arrivals', () => {
    const { triggerAsk, arrivalAsk } = open();
    expect(triggerAsk.map(r => r.request.params.get('jobId'))).toEqual(['2848']);
    expect(arrivalAsk.map(r => r.request.params.get('jobId'))).toEqual(['2848']);
  });

  it('names the file on the run it started, and on no other', () => {
    const { el } = open();
    expect(rowOf(el, 7387).textContent).toContain('live-customers.csv');
    expect(rowOf(el, 7385).textContent).not.toContain('.csv');
  });

  it('says what the trigger takes, and what the last files did', () => {
    const { el } = open();
    const inbox = el.querySelector<HTMLElement>('.inbox-trigger')!;
    expect(inbox.textContent).toContain('Every file named like *.csv that arrives in the inbox starts this job.');
    expect(inbox.textContent).toContain('live-customers.csv');
    expect(inbox.textContent).toContain('late.csv');
    expect(inbox.textContent).toContain('still in flight');
    const link = inbox.querySelector<HTMLAnchorElement>('a[href*="/runs/7387/logs"]');
    expect(link).not.toBeNull();
  });

  it('shows nothing new for a job with no trigger and no arrivals', () => {
    const { el } = open({ trigger: { jobId: 2848, configured: false }, arrivals: [] });
    expect(el.querySelector('.inbox-trigger')).toBeNull();
    expect(rowOf(el, 7387).textContent).not.toContain('.csv');
  });

  it('does not ask about a trigger on the all-jobs hour drill-down', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [JobHistory], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: JobEventsService, useValue: { connected: signal(false), events: new Subject() } }] });
    const fixture = TestBed.createComponent(JobHistory);
    fixture.componentRef.setInput('targetDate', '2026-09-28');
    fixture.componentRef.setInput('targetHr', '23');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    expect(http.match(r => /inbox(Trigger|Arrivals)/.test(r.url))).toHaveLength(0);
  });
});

describe('inbox trigger wording', () => {
  it('says what the trigger does in Core\'s words', () => {
    expect(triggerSentence(TRIGGER as any)).toBe('Every file named like *.csv that arrives in the inbox starts this job.');
    expect(triggerSentence({ ...TRIGGER, filePattern: null } as any)).toBe('Every file that arrives in the inbox starts this job.');
    expect(triggerSentence({ ...TRIGGER, enabled: false } as any)).toContain('off');
    expect(triggerSentence({ jobId: 1, configured: false })).toBe('No file in the inbox starts this job.');
  });

  it('reads only real answers', () => {
    expect(triggerOf([])).toBeNull();
    expect(triggerOf(TRIGGER)?.filePattern).toBe('*.csv');
    expect(arrivalsOf({})).toEqual([]);
    expect(arrivalsOf([{ nope: 1 }, ARRIVALS[0]])).toHaveLength(1);
    expect([...runsStartedByFile(ARRIVALS as any).keys()]).toEqual([7387]);
  });

  it('refuses a folder or an overlong pattern before the server does', () => {
    expect(patternProblem('*.csv')).toBe('');
    expect(patternProblem('')).toBe('');
    expect(patternProblem('in/*.csv')).toContain('not a folder');
    expect(patternProblem('..csv')).toContain('not a folder');
    expect(patternProblem('x'.repeat(256))).toContain('at most 255');
  });
});
