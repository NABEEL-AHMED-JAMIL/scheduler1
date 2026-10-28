import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { Tasks } from './tasks';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';

/** Owner 2026-10-27: "a sort on each table" and "a loader on each component", on the Pipelines list. */
const ROWS = [
  { taskDetailId: 2, taskName: 'Zeta loader', taskStatus: 'Active', stepCount: 3, totalLinksJobs: 1, lastRun: { jobQueueId: 9, jobId: 4, at: '2026-10-01T10:00:00Z' } },
  { taskDetailId: 1, taskName: 'Alpha check', taskStatus: 'Inactive', stepCount: 8, totalLinksJobs: 0, lastRun: null },
];

function screen(list: () => Observable<unknown>, linked: () => Observable<unknown> = () => of({ status: 'SUCCESS', data: [] })) {
  TestBed.resetTestingModule();
  try { localStorage.clear(); } catch { /* none: the sort remembers its choice there */ }
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: {
        get: () => of({}), put: () => of({}),
        post: (url: string) => (url.includes('fetchAllLinkJobsWithSourceTaskId') ? linked() : list()),
      } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(undefined) }) } },
      { provide: AuthService, useValue: { user: () => null, canManageTasks: () => true, isPlatformAdmin: () => false } },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new Tasks());
  component.ngOnInit();
  return component;
}

describe('Pipelines -- sorting', () => {
  it('keeps the API order until a heading is picked, then sorts before paging, both ways', () => {
    const c = screen(() => of({ status: 'SUCCESS', data: ROWS }));
    expect(c.paged().map((t: any) => t.taskDetailId)).toEqual([2, 1]);
    c.sort.toggle('pipeline');
    expect(c.paged().map((t: any) => t.taskName)).toEqual(['Alpha check', 'Zeta loader']);
    c.sort.toggle('pipeline');
    expect(c.paged().map((t: any) => t.taskName)).toEqual(['Zeta loader', 'Alpha check']);
    c.sort.toggle('steps');
    expect(c.sorted().map(t => t.stepCount)).toEqual([8, 3]);
  });

  it('sorts an expanded row\'s schedules', () => {
    const c = screen(() => of({ status: 'SUCCESS', data: ROWS }));
    const jobs = [{ jobId: 1, jobName: 'Nightly', jobStatus: 'Active' }, { jobId: 2, jobName: 'Ad hoc', jobStatus: 'Active' }];
    c.linkedSort.toggle('schedule');
    expect(c.sortedLinked(jobs).map(j => j.jobName)).toEqual(['Ad hoc', 'Nightly']);
    c.linkedSort.toggle('schedule');
    expect(c.sortedLinked(jobs).map(j => j.jobName)).toEqual(['Nightly', 'Ad hoc']);
  });
});

describe('Pipelines -- loading, empty, error', () => {
  it('is loading until the list answers', () => {
    const c = screen(() => NEVER);
    expect(c.loading()).toBe(true);
    expect(c.error()).toBe('');
  });

  it('is empty once an empty list answers', () => {
    const c = screen(() => of({ status: 'SUCCESS', data: [] }));
    expect(c.loading()).toBe(false);
    expect(c.sorted()).toEqual([]);
  });

  it('says the list could not be read, in plain words', () => {
    const c = screen(() => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' })));
    expect(c.loading()).toBe(false);
    expect(c.error()).toBe('The pipelines could not be read.');
  });

  it('an expanded row\'s schedules say when they could not be read, and read again on Try again', () => {
    let linked: () => Observable<unknown> = () => throwError(() => new HttpErrorResponse({ status: 500 }));
    const c = screen(() => of({ status: 'SUCCESS', data: ROWS }), () => linked());
    c.toggleRow(ROWS[0] as any);
    expect(c.linkedErrors()[2]).toBe('The schedules for this pipeline could not be read.');
    linked = () => of({ status: 'SUCCESS', data: [{ jobId: 1, jobName: 'Nightly', jobStatus: 'Active' }] });
    c.loadLinkedJobs(ROWS[0] as any);
    expect(c.linkedErrors()[2]).toBeUndefined();
    expect(c.linkedJobs()[2].length).toBe(1);
  });
});
