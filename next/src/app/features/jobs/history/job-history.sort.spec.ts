import { AuthService } from '../../../core/auth/auth.service';
import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { Subject, of } from 'rxjs';
import { JobHistory } from './job-history';
import { ToastService } from '../../../shared/ui/toast.service';
import { JobEventsService } from '../../../core/socket/job-events.service';

/**
 * Owner 2026-10-27 ("add a sort on each table"): the run list sorts on the server. No sort is sent before a choice; a
 * column sends Core's name and direction and reads again from the start (offset 0, page 1); "Load more" in that order goes
 * on by Core's nextOffset; Runs › Latest carries the order in its body; a drill-down's hour sorts the rows on screen.
 */
const gets: { url: string; params: any }[] = [];
const posts: { url: string; body: any }[] = [];
let answer: any = { status: 'SUCCESS', data: { jobQueues: [], hasMore: false } };

function history(route: { jobId?: string; targetDate?: string; targetHr?: string } = { jobId: '41' }) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: {
      get: (url: string, options?: { params?: any }) => {
        gets.push({ url, params: options?.params });
        return of(url.includes('fetchSourceJobQueueListWithJobId') || url.includes('DimensionDetail') ? answer : { status: 'SUCCESS', data: {} });
      },
      post: (url: string, body: any) => {
        posts.push({ url, body });
        return of({ status: 'SUCCESS', data: url.includes('fetchLogs') ? { sourceJobQueues: [], hasMore: false } : {} });
      },
    } },
    { provide: Router, useValue: { navigate: () => {} } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    { provide: AuthService, useValue: { canManageTasks: () => true } },
    { provide: JobEventsService, useValue: { events: new Subject(), connected: signal(false) } },
  ] });
  const component = TestBed.runInInjectionContext(() => new JobHistory());
  (component as any).jobId = () => route.jobId ?? '';
  (component as any).targetDate = () => route.targetDate ?? '';
  (component as any).targetHr = () => route.targetHr ?? '';
  return component;
}

const historyReads = () => gets.filter(g => g.url.endsWith('/sourceJob.json/fetchSourceJobQueueListWithJobId'));
const logReads = () => posts.filter(p => p.url.endsWith('/message.json/fetchLogs'));

describe('Run history sorting (server)', () => {
  beforeEach(() => {
    localStorage.clear();
    gets.length = 0;
    posts.length = 0;
    answer = { status: 'SUCCESS', data: { jobQueues: [], hasMore: false } };
  });

  it('sends no sort before a choice, then the column and direction from the start', () => {
    const h = history();
    h.load();
    expect(historyReads().at(-1)!.params).toEqual({ jobId: '41', limit: 500 });
    h.pager.goTo(3, 10_000);

    h.sort.toggle('started');
    expect(historyReads().at(-1)!.params).toEqual({ jobId: '41', limit: 500, sort: 'started', dir: 'desc', offset: 0 });
    expect(h.pager.page()).toBe(1);
    h.sort.toggle('started');
    expect(historyReads().at(-1)!.params).toMatchObject({ sort: 'started', dir: 'asc', offset: 0 });
    // A third click goes back to the newest-first read, with no sort and the beforeId cursor again.
    h.sort.toggle('started');
    expect(historyReads().at(-1)!.params).toEqual({ jobId: '41', limit: 500 });
  });

  it('loads more in the order picked by Core\'s offset, not by the oldest run', () => {
    answer = { status: 'SUCCESS', data: { jobQueues: [{ jobQueueId: 7, jobId: 41, jobStatus: 'Failed' }], hasMore: true, nextOffset: 500 } };
    const h = history();
    h.sort.toggle('duration');
    expect(h.hasMore()).toBe(true);
    expect(h.nextOffset()).toBe(500);
    answer = { status: 'SUCCESS', data: { jobQueues: [{ jobQueueId: 3, jobId: 41, jobStatus: 'Completed' }], hasMore: false, nextOffset: null } };
    h.loadOlder();
    expect(historyReads().at(-1)!.params).toEqual({ jobId: '41', limit: 500, sort: 'duration', dir: 'desc', offset: 500 });
    expect(h.runs().map(r => r.jobQueueId)).toEqual([7, 3]);
    expect(h.sortedByServer()).toBe(true);
  });

  it('pages newest first by beforeId when no column is picked', () => {
    answer = { status: 'SUCCESS', data: { jobQueues: [{ jobQueueId: 9, jobId: 41, jobStatus: 'Completed' }], hasMore: true } };
    const h = history();
    h.load();
    h.loadOlder();
    expect(historyReads().at(-1)!.params).toEqual({ jobId: '41', limit: 500, beforeId: 9 });
  });

  it('carries the order in Runs › Latest\'s body, and none before a choice', () => {
    const h = history({});
    h.load();
    expect(logReads().at(-1)!.body.sort).toBeUndefined();
    h.sort.toggle('status');
    expect(logReads().at(-1)!.body).toMatchObject({ limit: 200, sort: 'status', dir: 'asc' });
    h.sort.toggle('status');
    expect(logReads().at(-1)!.body).toMatchObject({ sort: 'status', dir: 'desc' });
  });

  it('sorts a drill-down\'s hour on screen without asking again', () => {
    const h = history({ jobId: '41', targetDate: '2026-09-20', targetHr: '9' });
    h.runs.set([
      { jobQueueId: 1, jobId: 41, jobStatus: 'Completed', startTime: '2026-09-20T09:10:00' },
      { jobQueueId: 2, jobId: 41, jobStatus: 'Completed', startTime: '2026-09-20T09:40:00' },
      { jobQueueId: 3, jobId: 41, jobStatus: 'Completed' },
    ] as any);
    const before = gets.length;
    h.sort.toggle('started');
    expect(gets.length).toBe(before);
    expect(h.filtered().map(r => r.jobQueueId)).toEqual([2, 1, 3]);
    h.sort.toggle('started');
    expect(h.filtered().map(r => r.jobQueueId)).toEqual([1, 2, 3]);
  });
});
