import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { EMPTY, of } from 'rxjs';
import { Jobs, SourceJob } from './jobs';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { JobEventsService } from '../../core/socket/job-events.service';

/**
 * An inactive job keeps its scheduler row, so the list went on printing its Next run and offering
 * Run now and Skip next run -- both of which the server refuses for anything that is not Active
 * (runSourceJob and skipNextSourceJob look the job up by jobId AND Active, and answer "SourceJob
 * not found with jobId." otherwise).
 */
function jobsFor() {
  const confirms: any[] = [];
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', data: [] }), request: () => EMPTY } },
      // The confirm answers no, so a bulk run stops at the question this spec is about.
      { provide: Dialog, useValue: { open: (_c: unknown, config: { data: unknown }) => { confirms.push(config?.data); return { closed: of(false) }; } } },
      { provide: ToastService, useValue: toast },
      { provide: Router, useValue: { navigate: () => {} } },
      { provide: AuthService, useValue: { user: signal(null) } },
      { provide: JobEventsService, useValue: { events: EMPTY, connected: signal(false) } },
    ],
  });
  const jobs = TestBed.runInInjectionContext(() => new Jobs());
  return { jobs, confirms, toast };
}

const autoJob = (over: Partial<SourceJob> = {}): SourceJob => ({
  jobId: 2838,
  jobName: 'nightly load',
  jobStatus: 'Active',
  jobRunningStatus: 'Completed',
  execution: 'Auto',
  scheduler: {
    schedulerId: 9001, frequency: 'Daily', intervalValue: '1', startTime: '09:00:00',
    endDate: '2027-03-31', nextRunAt: '2026-09-26T09:00:00', expired: false,
  },
  ...over,
});

const inactive = (over: Partial<SourceJob> = {}) => autoJob({ jobStatus: 'Inactive', ...over });

describe('an inactive job', () => {
  it('shows no next run: the dispatcher does not run it, and passed slots are recorded as Missed', () => {
    const { jobs } = jobsFor();
    expect(jobs.nextRun(inactive())).toBeNull();
  });

  it('says its timetable is paused rather than counting down to its end date', () => {
    const { jobs } = jobsFor();
    expect(jobs.scheduleNote(inactive())).toEqual({
      text: 'Paused while inactive — passed slots are recorded as Missed', tone: 'muted',
    });
  });

  it('offers neither Run now nor Skip next run', () => {
    const { jobs } = jobsFor();
    expect(jobs.canRunNow(inactive())).toBe(false);
    expect(jobs.canSkipNext(inactive())).toBe(false);
  });

  it('explains why both are off', () => {
    const { jobs } = jobsFor();
    expect(jobs.runBlockedReason(inactive())).toBe('Activate this job to run it');
    expect(jobs.skipBlockedReason(inactive())).toBe('Activate this job to run it');
  });

  it('an active one still offers both', () => {
    const { jobs } = jobsFor();
    expect(jobs.canRunNow(autoJob())).toBe(true);
    expect(jobs.canSkipNext(autoJob())).toBe(true);
    expect(jobs.runBlockedReason(autoJob())).toBe('');
    expect(jobs.nextRun(autoJob())).toBe('2026-09-26T09:00:00');
  });

  it('an active one in flight still cannot be run again', () => {
    const { jobs } = jobsFor();
    const running = autoJob({ jobRunningStatus: 'Running' });
    expect(jobs.canRunNow(running)).toBe(false);
    expect(jobs.runBlockedReason(running)).toBe('This job is already queued or running');
  });
});

describe('Run selected with inactive jobs in the selection', () => {
  it('leaves them out and says how many', () => {
    const { jobs, confirms } = jobsFor();
    jobs.jobs.set([autoJob({ jobId: 1 }), inactive({ jobId: 2 }), inactive({ jobId: 3 })]);
    jobs.selected.set(new Set([1, 2, 3]));
    jobs.runSelected();
    expect(confirms[0].title).toBe('Run 1 job?');
    expect(confirms[0].body).toContain('2 inactive jobs are left out');
  });

  it('refuses a selection of inactive jobs only, naming the reason', () => {
    const { jobs, confirms, toast } = jobsFor();
    jobs.jobs.set([inactive({ jobId: 2 })]);
    jobs.selected.set(new Set([2]));
    jobs.runSelected();
    expect(confirms).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith('Select at least one active job that is not already running.');
  });

  it('still lets an inactive job be selected, because Delete selected takes it', () => {
    const { jobs } = jobsFor();
    expect(jobs.selectable(inactive())).toBe(true);
  });
});
