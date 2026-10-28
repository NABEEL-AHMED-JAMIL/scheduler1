import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { EMPTY, NEVER, Observable, of, throwError } from 'rxjs';
import { Jobs, SourceJob } from './jobs';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { JobEventsService } from '../../core/socket/job-events.service';

/** Owner 2026-10-27: the Schedules table sorts by its headings, and its read has a loading, empty and error state. */
const job = (jobId: number, jobName: string, dateCreated: string, jobRunningStatus = 'Completed'): SourceJob =>
  ({ jobId, jobName, dateCreated, jobStatus: 'Active', jobRunningStatus } as SourceJob);

const ROWS = [
  job(1, 'Nightly import', '2026-10-01T09:00:00'),
  job(2, 'Billing feed', '2026-10-20T09:00:00'),
  job(3, 'Claims 10', '2026-09-15T09:00:00'),
];

function screen(get: (url: string) => Observable<unknown>) {
  TestBed.resetTestingModule();
  try { localStorage.clear(); } catch { /* none */ }
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get, post: () => of({ status: 'SUCCESS', data: [] }) } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: Router, useValue: { navigate: () => {} } },
      { provide: AuthService, useValue: { user: signal(null), isPlatformAdmin: () => false, isTenantAdmin: () => false,
        builderLocked: () => false, canManageTasks: () => true } },
      { provide: JobEventsService, useValue: { events: EMPTY, connected: signal(false) } },
    ],
  });
  const jobs = TestBed.runInInjectionContext(() => new Jobs());
  jobs.ngOnInit();
  return jobs;
}

describe('Schedules -- sorting (owner 2026-10-27)', () => {
  it('keeps the API order until a heading is picked, then sorts by name both ways', () => {
    const jobs = screen(() => of({ status: 'SUCCESS', data: ROWS }));
    expect(jobs.paged().map(j => j.jobId)).toEqual([1, 2, 3]);
    jobs.sort.toggle('schedule');
    expect(jobs.paged().map(j => j.jobName)).toEqual(['Billing feed', 'Claims 10', 'Nightly import']);
    jobs.sort.toggle('schedule');
    expect(jobs.paged().map(j => j.jobName)).toEqual(['Nightly import', 'Claims 10', 'Billing feed']);
  });

  it('sorts Created as dates, the newest first', () => {
    const jobs = screen(() => of({ status: 'SUCCESS', data: ROWS }));
    jobs.sort.toggle('created');
    expect(jobs.paged().map(j => j.jobId)).toEqual([2, 1, 3]);
  });
});

describe('Schedules -- loading, empty, error (owner 2026-10-27)', () => {
  it('is pending, not empty, until the list answers', () => {
    const jobs = screen(() => NEVER);
    expect(jobs.loading()).toBe(true);
    expect(jobs.state.pending()).toBe(true);
    expect(jobs.error()).toBe('');
  });

  it('is empty once an empty list answers', () => {
    const jobs = screen(() => of({ status: 'SUCCESS', data: [] }));
    expect(jobs.state.pending()).toBe(false);
    expect(jobs.loading()).toBe(false);
    expect(jobs.paged()).toEqual([]);
  });

  it('says in plain words that the list could not be read', () => {
    const jobs = screen(() => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' })));
    expect(jobs.loading()).toBe(false);
    expect(jobs.error()).toBe('The schedules could not be read.');
    expect(jobs.state.loaded()).toBe(false);
  });

  it('says a row\'s recent runs could not be read instead of "has not completed a run yet"', () => {
    const jobs = screen(url => url.includes('fetchSourceJobQueueListWithJobId')
      ? throwError(() => new HttpErrorResponse({ status: 500 }))
      : url.includes('listSourceJob') ? of({ status: 'SUCCESS', data: ROWS }) : NEVER);
    jobs.toggleRow(ROWS[0]);
    expect(jobs.runsLoadingFor().has(1)).toBe(false);
    expect(jobs.runsErrorFor()[1]).toBe("This schedule's recent runs could not be read.");
    expect(jobs.runsByJob()[1]).toBeUndefined();
  });

  it('keeps one row loading while another row\'s history answers', () => {
    const jobs = screen(url => url.includes('fetchSourceJobQueueListWithJobId') ? NEVER
      : url.includes('listSourceJob') ? of({ status: 'SUCCESS', data: ROWS }) : NEVER);
    jobs.toggleRow(ROWS[0]);
    jobs.toggleRow(ROWS[1]);
    expect([...jobs.runsLoadingFor()].sort()).toEqual([1, 2]);
  });
});
