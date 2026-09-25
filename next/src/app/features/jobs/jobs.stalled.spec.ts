import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { Subject, of } from 'rxjs';
import { Jobs, SourceJob } from './jobs';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { JobEvent, JobEventsService } from '../../core/socket/job-events.service';

const longAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
const justNow = new Date(Date.now() - 60 * 1000).toISOString();

/** The Jobs screen loaded with `rows` as the list endpoint returns them. */
function jobsListing(rows: Partial<SourceJob>[]) {
  const events = new Subject<JobEvent>();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', data: rows }) } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(false) }) } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      { provide: Router, useValue: { navigate: () => {} } },
      { provide: AuthService, useValue: { user: signal(null) } },
      { provide: JobEventsService, useValue: { events, connected: signal(false) } },
    ],
  });
  const jobs = TestBed.runInInjectionContext(() => new Jobs());
  jobs.load();
  return { jobs, events };
}

const row = (jobId: number, extra: Partial<SourceJob>) =>
  ({ jobId, jobName: `Job ${jobId}`, jobStatus: 'Active', jobRunningStatus: 'Start', ...extra });

describe('Jobs: the stalled banner and badge follow the server (MIG-63)', () => {
  it('counts a row the server marks stalled, even though its timestamp is fresh', () => {
    const { jobs } = jobsListing([row(1, { stalled: true, lastJobRun: justNow })]);
    expect(jobs.stalledCount()).toBe(1);
    expect(jobs.isStalled(jobs.jobs()[0])).toBe(true);
  });

  it('does not count a row the server clears, though it has sat in Start for six hours', () => {
    const { jobs } = jobsListing([row(2, { stalled: false, lastJobRun: longAgo })]);
    expect(jobs.stalledCount()).toBe(0);
    expect(jobs.isStalled(jobs.jobs()[0])).toBe(false);
  });

  it('counts only the rows the server flagged', () => {
    const { jobs } = jobsListing([
      row(1, { stalled: true, lastJobRun: longAgo }),
      row(2, { stalled: false, lastJobRun: longAgo }),
      row(3, { stalled: true, jobRunningStatus: 'Running', lastJobRun: longAgo }),
    ]);
    expect(jobs.stalledCount()).toBe(2);
  });

  it('clears the flag when a status push arrives, since the run has just reported', () => {
    // The flag is the server's verdict as of the list read. A push is the run reporting in, so
    // whatever it now says -- a new in-flight state or a finish -- the server would say "not
    // stalled", and the stale `true` must not linger on a row that just moved.
    const { jobs, events } = jobsListing([row(1, { stalled: true, lastJobRun: longAgo })]);
    events.next({ type: 'job.status', jobId: 1, jobRunningStatus: 'Completed' } as JobEvent);
    expect(jobs.stalledCount()).toBe(0);
    expect(jobs.jobs()[0].stalled).toBe(false);
  });
});
