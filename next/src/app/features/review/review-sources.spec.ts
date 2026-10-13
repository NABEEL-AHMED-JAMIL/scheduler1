import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Injector, provideZonelessChangeDetection, signal } from '@angular/core';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import type { InboxTask } from '../workflows/workflows.api';
import type { WaitingRun } from '../jobs/history/review-waiting';
import type { Extraction } from '../documents/documents.model';
import { AuthService } from '../../core/auth/auth.service';
import { ReviewCount, ReviewViewer, ageOf, countKinds, countReview, dueIn, loadReview, merge, runOf, uidOf } from './review-sources';

/** UX review DR2 (2026-10-13): the three review sources, read as the reader and laid out as one list with one count. */

const task = (id: number, over: Partial<InboxTask> = {}): InboxTask => ({
  id, instanceId: id - 6, stepKey: 'review', stepType: 'approval', name: 'Approve the visit', assigneeKind: 'group',
  assigneeValue: '1063', state: 'Open', requestTitle: `Visit #${id}`, workflowName: 'Visit approval', createdAt: '2026-10-13T12:00:00+00:00',
  ...over,
});
const runTask = (id: number, run: number): InboxTask => task(id, {
  name: "Review the run's results", requestTitle: `Review run #${run}: Patient 360 (daily)`, subjectType: 'pipeline_run',
  subjectId: `pipeline-run:${run}`, workflowName: 'Pipeline run review',
});
const run = (jobQueueId: number, over: Partial<WaitingRun> = {}): WaitingRun => ({
  jobQueueId, jobId: 2907, jobName: 'Patient 360 (daily)', finishedAt: '2026-10-13T07:22:29.235395', required: ['internal'], decisions: [],
  individual: false, ...over,
});
const doc = (extractionId: number, over: Partial<Extraction> = {}): Extraction => ({
  extractionId, ocrDocumentId: 1045, status: 'Review', documentTypeId: 1000, documentTypeName: 'Invoice', revision: 0,
  dateFinished: '2026-10-13T03:10:47.871+00:00', reviewCount: 2, fieldCount: 9, ...over,
});

const REVIEWER: ReviewViewer = { tasks: true, documents: true, admin: false, me: 4641 };
const ADMIN: ReviewViewer = { tasks: true, documents: true, admin: true, me: 4640 };
const none = { count: null, mine: [], groups: [], runs: [], runsMore: false, runsFailed: false, documents: [], documentTotal: 0 };

describe('Review sources: one list over three services', () => {
  it('lists a reviewer\'s task about a run once, as the run, decided through the task', () => {
    const load = merge(REVIEWER, { ...none, groups: [runTask(1142, 8311)], runs: [run(8311)] });
    expect(load.items.length).toBe(1);
    const [row] = load.items;
    expect(row).toMatchObject({ kind: 'run', via: 'task', id: 1142, runId: 8311, jobId: 2907, title: 'Run #8311',
      from: 'Patient 360 (daily)', waitsOn: 'Your groups', pickable: true });
    expect(row.since).toBe('2026-10-13T07:22:29.235395');
    expect(load.total).toBe(1);
  });

  it('never lists a run to a reviewer who has no task about it: they cannot decide it', () => {
    expect(merge(REVIEWER, { ...none, runs: [run(8311)] }).items).toEqual([]);
  });

  it('lists an administrator\'s runs that no task of theirs covers, decided through Core', () => {
    const load = merge(ADMIN, { ...none, runs: [run(8311), run(8300, { individual: true })] });
    expect(load.items.map(i => [i.via, i.id, i.pickable])).toEqual([['core', 8300, false], ['core', 8311, true]]);
    expect(load.items.find(i => i.id === 8300)!.whyNot).toContain('individual review');
    expect(load.items[0].waitsOn).toBe('Internal review');
  });

  it('keeps out of bulk what the reader may not decide: their own request, a task step, a document someone else holds', () => {
    const load = merge(REVIEWER, {
      ...none,
      mine: [task(1, { requestedBy: 4641 }), task(2, { stepType: 'task', name: 'Upload the scan' }), task(3)],
      documents: [doc(10, { claimActive: true, claimedBy: 4640, claimedByName: 'Riverside admin' }), doc(11)],
      documentTotal: 2,
    });
    const by = (uid: number) => load.items.find(i => i.uid === uid)!;
    expect(by(uidOf('approval', 1)).whyNot).toBe('Your own request: someone else decides it.');
    expect(by(uidOf('approval', 2)).pickable).toBe(false);
    expect(by(uidOf('approval', 3)).pickable).toBe(true);
    expect(by(uidOf('document', 10))).toMatchObject({ pickable: false, waitsOn: 'Claimed by Riverside admin' });
    expect(by(uidOf('document', 11))).toMatchObject({ pickable: true, waitsOn: 'Any reviewer', from: 'Invoice' });
  });

  it('gives task 1142 and document 1142 two rows', () => {
    const load = merge(REVIEWER, { ...none, mine: [task(1142)], documents: [doc(1142)], documentTotal: 1 });
    expect(new Set(load.items.map(i => i.uid)).size).toBe(2);
  });

  it('puts overdue first, then the soonest due, then the longest waiting', () => {
    const load = merge(REVIEWER, {
      ...none,
      mine: [task(1, { createdAt: '2026-10-10T00:00:00+00:00' }), task(2, { dueAt: '2026-10-20T00:00:00+00:00' }),
        task(3, { overdue: true, dueAt: '2026-10-01T00:00:00+00:00' })],
      documents: [doc(5, { dateFinished: '2026-10-01T00:00:00+00:00' })], documentTotal: 1,
    });
    expect(load.items.map(i => i.uid)).toEqual([uidOf('approval', 3), uidOf('approval', 2), uidOf('document', 5), uidOf('approval', 1)]);
    expect(load.overdue).toBe(1);
  });

  it('counts what did not fit the first pages, as each service counts it', () => {
    const load = merge(REVIEWER, {
      ...none, count: { mine: 120, groups: 30, total: 150, overdue: 0 }, mine: [task(1)], groups: [task(2)],
      documents: [doc(9)], documentTotal: 40,
    });
    expect(load.beyond).toEqual({ tasks: 148, documents: 39, runs: false });
    expect(load.total).toBe(3 + 148 + 39);
    expect(countKinds(load)).toEqual({ approval: 150, run: 0, document: 40 });
  });

  it('names the sources that answered an error, and still lists the others', () => {
    const load = merge(ADMIN, { ...none, mine: null, documents: null, runsFailed: true, runs: [] });
    expect(load.failed).toEqual(['approval', 'run', 'document']);
  });

  it('reads a run out of a task\'s subject', () => {
    expect(runOf({ subjectId: 'pipeline-run:8311' })).toBe(8311);
    expect(runOf({ subjectType: 'pipeline_run', subjectId: '77' })).toBe(77);
    expect(runOf({ subjectType: 'visit', subjectId: 'visit:3' })).toBeNull();
  });

  it('says ages and due times in short words, Chicago and UTC stamps alike', () => {
    const now = Date.parse('2026-10-13T12:00:00Z');
    expect(ageOf('2026-10-13T11:30:00+00:00', now)).toBe('30 min');
    expect(ageOf('2026-10-13T02:00:00', now)).toBe('5 h');
    expect(ageOf('2026-10-10T12:00:00+00:00', now)).toBe('3 d');
    expect(dueIn('2026-10-13T15:00:00+00:00', now)).toBe('Due in 3 h');
    expect(dueIn(null, now)).toBe('');
  });
});

describe('Review sources: asked as the reader', () => {
  function setup() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()] });
    return { http: TestBed.inject(HttpClient), ctl: TestBed.inject(HttpTestingController) };
  }

  it('asks the three services in parallel, once each', async () => {
    const { http, ctl } = setup();
    const answer = firstValueFrom(loadReview(http, ADMIN));
    const pending = ctl.match(() => true);
    const reqs = pending.map(r => r.request.urlWithParams.replace(/^.*\/api\/v1\//, ''));
    expect(reqs.sort()).toEqual([
      'documentReview.json/queue?page=0&size=100&status=Review', 'sourceJob.json/review/waiting', 'taskInbox.json/count',
      'taskInbox.json/groups?limit=100', 'taskInbox.json/mine?limit=100',
    ]);
    for (const r of pending) {
      const url = r.request.url;
      r.flush({ status: 'SUCCESS', data: url.endsWith('/count') ? { mine: 0, groups: 1, total: 1, overdue: 0 }
        : url.endsWith('/groups') ? [task(7)] : url.endsWith('/mine') ? [] : url.includes('waiting') ? { runs: [run(8311)], more: false }
        : { items: [doc(1133)], total: 1 } });
    }
    expect((await answer).items.length).toBe(3);
  });

  it('asks nothing of a source the reader may not open (a reviewer with only Document review)', async () => {
    const { http, ctl } = setup();
    const answer = firstValueFrom(loadReview(http, { tasks: false, documents: true, admin: false, me: 9 }));
    const reqs = ctl.match(() => true);
    expect(reqs.map(r => r.request.url.replace(/^.*\/api\/v1\//, ''))).toEqual(['documentReview.json/queue']);
    reqs[0].flush({ status: 'SUCCESS', data: { items: [doc(1)], total: 1 } });
    expect((await answer).total).toBe(1);
  });

  it('counts for the badge as the page lists it', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { canOpen: (p: string) => p === 'task-inbox', isTenantAdmin: () => false, user: () => ({ appUserId: 4641 }) } }] });
    const target = { injector: TestBed.inject(Injector), review: signal<ReviewCount | null>(null) };
    countReview(target);
    for (const r of TestBed.inject(HttpTestingController).match(() => true)) {
      const url = r.request.url;
      r.flush({ status: 'SUCCESS', data: url.endsWith('/count') ? { mine: 1, groups: 0, total: 1, overdue: 1 }
        : url.endsWith('/mine') ? [task(5, { overdue: true })] : url.endsWith('/groups') ? [] : { runs: [], more: false } });
    }
    expect(target.review()).toEqual({ total: 1, overdue: 1, more: false, kinds: { approval: 1, run: 0, document: 0 } });
  });

  it('asks nothing for a viewer, and clears the count', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { canOpen: () => false, isTenantAdmin: () => false, user: () => ({ appUserId: 4642 }) } }] });
    const target = { injector: TestBed.inject(Injector),
      review: signal<ReviewCount | null>({ total: 3, overdue: 0, more: false, kinds: { approval: 3, run: 0, document: 0 } }) };
    countReview(target);
    expect(TestBed.inject(HttpTestingController).match(() => true)).toEqual([]);
    expect(target.review()).toBeNull();
  });
});
