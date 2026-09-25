import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { Subject, of } from 'rxjs';
import { Jobs, SourceJob } from './jobs';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { JobEvent, JobEventsService } from '../../core/socket/job-events.service';

/**
 * MIG-151: the live job-status push carries ids only -- type, jobId, jobQueueId, jobRunningStatus,
 * at, tenantId (notifications-service JobFeed.status). The row's words -- its name, its owner, its
 * next run -- are the list read's, and a push must never be where they come from.
 */
function jobsWith(rows: SourceJob[]) {
  const events = new Subject<JobEvent>();
  const gets: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: HttpClient, useValue: {
          get: (url: string) => { gets.push(url); return of({ status: 'SUCCESS', data: rows }); },
          post: () => of({ status: 'SUCCESS', data: [] }),
        },
      },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: Router, useValue: { navigate: () => {} } },
      { provide: AuthService, useValue: { user: signal(null) } },
      { provide: JobEventsService, useValue: { events, connected: signal(false) } },
    ],
  });
  const jobs = TestBed.runInInjectionContext(() => new Jobs());
  jobs.jobs.set(rows);
  return { jobs, events, gets };
}

const nightly = (): SourceJob => ({
  jobId: 1244,
  jobName: 'nightly load',
  jobStatus: 'Active',
  jobRunningStatus: 'Completed',
  execution: 'Auto',
  lastJobRun: '2026-09-23T09:00:00',
  assignedUsername: 'ops@medaxis.example',
  scheduler: { schedulerId: 9001, frequency: 'Daily', nextRunAt: '2026-09-25T09:00:00', expired: false },
});

/** Exactly what /topic/jobs.{tenantId} sends for a status since MIG-151. */
const idsOnly = (jobRunningStatus: string): JobEvent => ({
  type: 'job.status', jobId: 1244, jobQueueId: 7001, jobRunningStatus,
  at: '2026-09-24T14:01:25.564Z', tenantId: 2905,
});

describe('an ids-only status push', () => {
  it('moves the row to the new status and keeps the name, owner and next run the list read', () => {
    const { jobs, events } = jobsWith([nightly()]);

    events.next(idsOnly('Running'));

    const row = jobs.jobs()[0];
    expect(row.jobRunningStatus).toBe('Running');
    expect(row.lastJobRun).toBe('2026-09-24T14:01:25.564Z');
    expect(row.jobName).toBe('nightly load');
    expect(row.assignedUsername).toBe('ops@medaxis.example');
    expect(row.scheduler?.nextRunAt).toBe('2026-09-25T09:00:00');
  });

  it('is enough on its own: a status needs no re-read', () => {
    const { events, gets } = jobsWith([nightly()]);

    events.next(idsOnly('Completed'));

    expect(gets).toEqual([]);
  });

  it('leaves another job alone', () => {
    const { jobs, events } = jobsWith([nightly()]);

    events.next({ ...idsOnly('Failed'), jobId: 99 });

    expect(jobs.jobs()[0]).toEqual(nightly());
  });

  /**
   * A server still on the old shape, or a field added back later, must not become the row's words:
   * only the status (and, for a run in flight, when it got there) is taken from a push.
   */
  it('takes nothing else from a push, whatever else it carries', () => {
    const { jobs, events } = jobsWith([nightly()]);

    events.next({
      ...idsOnly('Failed'),
      jobName: 'from the push', assignedUsername: 'someone@else.example',
      nextRunAt: '2030-01-01T00:00:00', jobStatus: 'Inactive', message: 'The worker gave up.',
    } as JobEvent);

    expect(jobs.jobs()[0]).toEqual({ ...nightly(), jobRunningStatus: 'Failed' });
  });
});
