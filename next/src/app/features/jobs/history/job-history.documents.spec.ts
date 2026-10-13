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
import {
  approvalsOf, batchProblem, runsStartedByDocument, startedChip, triggerOf, triggerSentence, waitingSentence,
} from '../documents/document-trigger';

/**
 * MIG-364: a job started by an approved document says so on its Executions -- each run a document started links to the
 * document's review screen (a batch names every document), and the job's detail says which type's approvals start it
 * and what the last approved documents did (Started, Waiting, or Skipped and why). A job with no such trigger shows
 * what it showed before.
 */
const RUNS = { jobQueues: [
  { jobQueueId: 7390, jobId: 2848, jobStatus: 'Completed', startTime: '2026-10-12T10:05:00', endTime: '2026-10-12T10:05:02' },
  { jobQueueId: 7387, jobId: 2848, jobStatus: 'Completed', startTime: '2026-10-12T09:41:24', endTime: '2026-10-12T09:41:25' },
  { jobQueueId: 7385, jobId: 2848, jobStatus: 'Completed', startTime: '2026-10-12T09:30:00', endTime: '2026-10-12T09:30:01' },
] };
const DETAIL = { jobId: 2848, jobName: 'UI-CHECK steps job', jobStatus: 'Active', execution: 'Manual' };
const TRIGGER = { jobId: 2848, configured: true, enabled: true, documentTypeId: 1007, batchSize: 1, waiting: 0,
  dateUpdated: '2026-10-12T14:00:00Z' };
const TYPES = [{ documentTypeId: 1007, name: 'Intake form', status: 'Active' }];
const approval = (extractionId: number, outcome: string, jobQueueId: number | null, extra: Record<string, unknown> = {}) => ({
  extractionId, typeVersion: 2, documentTypeId: 1007, ocrDocumentId: extractionId + 1000, approval: 'reviewer', outcome,
  reason: null, jobQueueId, dateCreated: '2026-10-12T15:00:00Z', startedAt: null, place: null, ...extra });
// Newest first, as Core answers: 7390 took two documents that waited; 7387 one.
const APPROVALS = [
  approval(815, 'Skipped', null, { reason: 'The job is inactive.' }),
  approval(814, 'Started', 7390, { approval: 'auto' }),
  approval(813, 'Started', 7390),
  approval(812, 'Started', 7387),
];

function open(answers: { trigger?: unknown; approvals?: unknown } = {}) {
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
  reply('/sourceJob.json/inboxTrigger', { jobId: 2848, configured: false });
  reply('/sourceJob.json/inboxArrivals', []);
  const triggerAsk = http.match(r => r.url.endsWith('/sourceJob.json/documentTrigger'));
  const approvalAsk = http.match(r => r.url.endsWith('/sourceJob.json/documentApprovals'));
  triggerAsk.forEach(r => r.flush({ status: API_SUCCESS, data: answers.trigger ?? TRIGGER }));
  approvalAsk.forEach(r => r.flush({ status: API_SUCCESS, data: answers.approvals ?? APPROVALS }));
  const typesAsk = http.match(r => r.url.endsWith('/documentType.json/fetchAll'));
  typesAsk.forEach(r => r.flush({ status: API_SUCCESS, data: TYPES }));
  fixture.detectChanges();
  return { fixture, http, triggerAsk, approvalAsk, typesAsk, el: fixture.nativeElement as HTMLElement };
}

const rowOf = (el: HTMLElement, run: number) =>
  [...el.querySelectorAll('tbody tr')].find(tr => tr.textContent!.includes(`#${run}`)) as HTMLElement;
const chipOf = (el: HTMLElement, run: number) => rowOf(el, run).querySelector<HTMLAnchorElement>('[data-test="started-by-document"]');

describe('Executions: runs an approved document started', () => {
  useMemoryStorage();
  it('asks for the job\'s document trigger and its approvals, and the types once to name it', () => {
    const { triggerAsk, approvalAsk, typesAsk } = open();
    expect(triggerAsk.map(r => r.request.params.get('jobId'))).toEqual(['2848']);
    expect(approvalAsk.map(r => r.request.params.get('jobId'))).toEqual(['2848']);
    expect(approvalAsk[0].request.params.get('limit')).toBeTruthy();
    expect(typesAsk).toHaveLength(1);
  });

  it('links the run a document started to the document\'s review screen, and no other run', () => {
    const { el } = open();
    const chip = chipOf(el, 7387)!;
    expect(chip.textContent!.trim()).toBe('Document #812');
    expect(chip.getAttribute('href')).toBe('/documents/review/812');
    expect(chipOf(el, 7385)).toBeNull();
  });

  it('names every document of a run that took several, and links the first approved', () => {
    const { el } = open();
    const chip = chipOf(el, 7390)!;
    expect(chip.textContent!.trim()).toBe('2 documents');
    expect(chip.getAttribute('title')).toBe('Started by documents #813, #814 being approved');
    expect(chip.getAttribute('href')).toBe('/documents/review/813');
  });

  it('says which type starts it, and what the last documents did', () => {
    const { el } = open();
    const block = el.querySelector<HTMLElement>('.document-trigger')!;
    expect(block.textContent).toContain('Every document of \'Intake form\' that is approved starts this job.');
    expect(block.textContent).toContain('Document #815');
    expect(block.textContent).toContain('The job is inactive.');
    expect(block.querySelector('a[href="/documents/review/812"]')).not.toBeNull();
    expect(block.querySelector('a[href*="/runs/7387"]')).not.toBeNull();
  });

  it('shows a waiting document with its place in line, and how many wait', () => {
    const waiting = approval(816, 'Waiting', null, { place: 1, reason: 'A run of this job was in flight when it was approved.' });
    const { el } = open({ trigger: { ...TRIGGER, waiting: 2, batchSize: 5 }, approvals: [waiting, ...APPROVALS] });
    const block = el.querySelector<HTMLElement>('.document-trigger')!;
    expect(block.querySelector('[data-test="approval-waiting"]')!.textContent!.trim()).toBe('Waiting · #1 in line');
    expect(block.querySelector('[data-test="documents-waiting"]')!.textContent).toContain('2 documents wait for the run in flight to end');
    expect(block.textContent).toContain('the next run takes up to 5 of them');
  });

  it('shows nothing new for a job with no document trigger and no approvals', () => {
    const { el, typesAsk } = open({ trigger: { jobId: 2848, configured: false, waiting: 0 }, approvals: [] });
    expect(el.querySelector('.document-trigger')).toBeNull();
    expect(chipOf(el, 7387)).toBeNull();
    expect(typesAsk).toHaveLength(0);
  });

  it('does not ask about documents on the all-jobs hour drill-down', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [JobHistory], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: JobEventsService, useValue: { connected: signal(false), events: new Subject() } }] });
    const fixture = TestBed.createComponent(JobHistory);
    fixture.componentRef.setInput('targetDate', '2026-10-12');
    fixture.componentRef.setInput('targetHr', '9');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    expect(http.match(r => /document(Trigger|Approvals)/.test(r.url))).toHaveLength(0);
  });
});

describe('document trigger wording', () => {
  const names = new Map([[1007, 'Intake form']]);
  it('says what the trigger does in Core\'s words', () => {
    expect(triggerSentence(TRIGGER, names)).toBe('Every document of \'Intake form\' that is approved starts this job.');
    expect(triggerSentence(TRIGGER)).toBe('Every document of document type 1007 that is approved starts this job.');
    expect(triggerSentence({ ...TRIGGER, enabled: false })).toContain('off');
    expect(triggerSentence({ jobId: 1, configured: false })).toBe('No approved document starts this job.');
    expect(triggerSentence({ ...TRIGGER, batchSize: 10 }, names)).toContain('the next run takes up to 10 of them');
    expect(waitingSentence({ ...TRIGGER, waiting: 0 })).toBe('');
    expect(waitingSentence({ ...TRIGGER, waiting: 1 })).toBe('1 document waits for the run in flight to end.');
  });

  it('holds documents per run to 1..50', () => {
    expect(batchProblem(1)).toBe('');
    expect(batchProblem('50')).toBe('');
    expect(batchProblem(0)).toContain('1 to 50');
    expect(batchProblem(51)).toContain('1 to 50');
    expect(batchProblem('2.5')).toContain('whole number');
  });

  it('reads only real answers, and groups a run\'s documents oldest first', () => {
    expect(triggerOf([])).toBeNull();
    expect(triggerOf(TRIGGER)?.documentTypeId).toBe(1007);
    expect(approvalsOf({})).toEqual([]);
    expect(approvalsOf([{ nope: 1 }, APPROVALS[0]])).toHaveLength(1);
    const runs = runsStartedByDocument(APPROVALS);
    expect([...runs.keys()].sort()).toEqual([7387, 7390]);
    expect(runs.get(7390)!.map(a => a.extractionId)).toEqual([813, 814]);
    expect(startedChip(runs.get(7387)!).text).toBe('Document #812');
  });
});
