import { describe, it, expect } from 'vitest';
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

function jobsFor() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      // ngOnInit is never called here, so nothing is fetched: every test hands the component the
      // rows listSourceJob would have returned and asks what it says about them.
      { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', data: [] }), post: () => of({ status: 'SUCCESS', data: [] }) } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: Router, useValue: { navigate: () => {} } },
      { provide: AuthService, useValue: { user: signal(null) } },
      { provide: JobEventsService, useValue: { events: EMPTY, connected: signal(false) } },
    ],
  });
  return TestBed.runInInjectionContext(() => new Jobs());
}

/**
 * An Auto job with a live timetable. The scheduler row is exactly what listSourceJob attaches.
 */
const autoJob = (over: Partial<SourceJob> = {}): SourceJob => ({
  jobId: 1244,
  jobName: 'nightly load',
  jobStatus: 'Active',
  jobRunningStatus: 'Completed',
  execution: 'Auto',
  lastJobRun: '2026-09-13T09:00:00',
  scheduler: {
    schedulerId: 9001,
    frequency: 'Daily',
    intervalValue: '1',
    startTime: '09:00:00',
    endDate: '2027-03-31',
    nextRunAt: '2026-09-15T09:00:00',
    expired: false,
  },
  ...over,
});

/**
 * The same job after Execution is set to Manual.
 *
 * The editor posts no `schedulers` block for a Manual job and updateSourceJob only touches the
 * Scheduler row when one is posted, so the row survives with its old next_run_at -- deliberately,
 * because findDueSchedulers filters on `source_job.execution = 'Auto'` rather than expiring it,
 * and switching back to Auto has to resume the timetable rather than lose it. listSourceJob then
 * attaches that row with no execution check.
 */
const manualJobKeepingItsSchedule = (): SourceJob => autoJob({ execution: 'Manual' });

describe('a Manual job does not advertise the schedule it no longer runs on', () => {
  it('reads as on demand, however live the stored timetable looks', () => {
    const jobs = jobsFor();
    // The row still says "Daily every 1 at 09:00"; what it does is run when somebody presses Run.
    expect(jobs.scheduleSummary(manualJobKeepingItsSchedule())).toBe('On demand');
  });

  it('does not print a next run the dispatcher will never reach', () => {
    const jobs = jobsFor();
    expect(jobs.nextRun(manualJobKeepingItsSchedule())).toBeNull();
  });

  it('says the timetable is held rather than counting down to its end date', () => {
    const jobs = jobsFor();
    // Not "Ends 2027-03-31": that note is about a timetable that is running, which this is not.
    expect(jobs.scheduleNote(manualJobKeepingItsSchedule())).toEqual({
      text: 'Schedule kept, paused while Manual', tone: 'muted',
    });
  });

  it('does not offer Skip next run, which the server refuses for a Manual job', () => {
    const jobs = jobsFor();
    // skipNextSourceJob answers "SourceJob skip only work with 'auto' source job." -- an error
    // for a menu item the list had just said was available.
    expect(jobs.canSkipNext(manualJobKeepingItsSchedule())).toBe(false);
  });
});

describe('an Auto job still says everything it knows', () => {
  it('summarises its timetable', () => {
    const jobs = jobsFor();
    expect(jobs.scheduleSummary(autoJob())).toBe('Daily at 09:00');
  });

  it('names its next run', () => {
    const jobs = jobsFor();
    expect(jobs.nextRun(autoJob())).toBe('2026-09-15T09:00:00');
  });

  it('still reports when the timetable stops', () => {
    const jobs = jobsFor();
    expect(jobs.scheduleNote(autoJob())).toEqual({ text: 'Ends 2027-03-31', tone: 'muted' });
  });

  it('offers Skip next run', () => {
    const jobs = jobsFor();
    expect(jobs.canSkipNext(autoJob())).toBe(true);
  });

  it('withholds the next run once the schedule has expired', () => {
    const jobs = jobsFor();
    const expired = autoJob({
      scheduler: { ...autoJob().scheduler!, expired: true },
    });
    expect(jobs.nextRun(expired)).toBeNull();
    expect(jobs.scheduleNote(expired)).toEqual({ text: 'Expired — no further runs', tone: 'warn' });
  });
});

describe('a job with no schedule at all', () => {
  it('says so rather than inventing one', () => {
    const jobs = jobsFor();
    const manualNeverScheduled = autoJob({ execution: 'Manual', scheduler: null });
    expect(jobs.scheduleSummary(manualNeverScheduled)).toBe('On demand');
    expect(jobs.scheduleNote(manualNeverScheduled)).toBeNull();
    expect(jobs.canSkipNext(manualNeverScheduled)).toBe(false);
  });
});
