import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { EMPTY, of } from 'rxjs';
import { Queue } from './queue';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { JobEventsService } from '../../core/socket/job-events.service';
import { signal } from '@angular/core';

/**
 * Tenant-user review, 2026-09-24: the Queue's Job column showed a bare number (2844). The runs carry only the job id,
 * so the screen reads the job list once and shows each run's job by name; search finds a run by its job's name.
 */
function queue(canOpenJobs = true) {
  const gets: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: {
      post: () => of({ status: 'SUCCESS', data: { sourceJobQueues: [], jobStatusStatistic: [] } }),
      get: (url: string) => { gets.push(url); return of({ status: 'SUCCESS', data: [{ jobId: 2844, jobName: 'Nightly ledger check' }] }); },
    } },
    { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    // The screen follows the socket and gates its links on the Jobs page; neither is under test here.
    { provide: AuthService, useValue: { canOpen: (page: string) => page !== 'jobs' || canOpenJobs } },
    { provide: JobEventsService, useValue: { events: EMPTY, connected: signal(false) } },
  ] });
  const q = TestBed.runInInjectionContext(() => new Queue());
  q.ngOnInit();
  return Object.assign(q, { gets });
}

const run = (jobId: number) => ({ jobQueueId: 7000 + jobId, jobId, jobStatus: 'Completed', jobStatusMessage: '' }) as any;

describe('Queue job names', () => {
  it('names a run by its job', () => {
    const q = queue();
    expect(q.jobName(run(2844))).toBe('Nightly ledger check');
  });

  it('falls back to the number for a job it does not know', () => {
    expect(queue().jobName(run(9))).toBe('Job #9');
  });

  it('finds a run by its job name', () => {
    const q = queue();
    q.rows.set([run(2844), run(9)]);
    q.search.set('ledger');
    expect(q.data().map(r => r.jobId)).toEqual([2844]);
  });

  it('does not ask for the job list without the Schedules page, and keeps the numbers (review 2026-10-07)', () => {
    const q = queue(false);
    expect(q.gets.some(url => url.includes('listSourceJob'))).toBe(false);
    expect(q.jobName(run(2844))).toBe('Job #2844');
  });
});
