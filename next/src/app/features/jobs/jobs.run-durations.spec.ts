import { compactDuration } from '../../shared/ui/time-format';
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
import { clockTime } from './schedule-labels';

/**
 * UI review jobs#10 and jobs#11 (MIG-295). The expanded row's Recent runs chart plotted minutes to
 * one decimal, so job 2838's runs of 25, 27, 41 and 50 seconds were labelled 0, 0, 0 and 1 -- and
 * its schedule's start and end days were printed as the API sent them, "2027-03-31".
 */
const RUNS = [
  // Newest first, as fetchSourceJobQueueListWithJobId answers.
  { jobQueueId: 7340, jobStatus: 'Completed', startTime: '2026-09-24T10:04:00', endTime: '2026-09-24T10:05:00' },
  { jobQueueId: 7339, jobStatus: 'Completed', startTime: '2026-09-24T10:03:00', endTime: '2026-09-24T10:03:50' },
  { jobQueueId: 7338, jobStatus: 'Failed',    startTime: '2026-09-24T10:02:00', endTime: '2026-09-24T10:02:41' },
  { jobQueueId: 7337, jobStatus: 'Completed', startTime: '2026-09-24T10:01:00', endTime: '2026-09-24T10:01:27' },
  { jobQueueId: 7336, jobStatus: 'Completed', startTime: '2026-09-24T10:00:00', endTime: '2026-09-24T10:00:25.300' },
];

function jobsFor() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: {
        get: () => of({ status: 'SUCCESS', data: { jobQueues: RUNS } }),
        post: () => of({ status: 'SUCCESS', data: [] }),
      } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: Router, useValue: { navigate: () => {} } },
      { provide: AuthService, useValue: { user: signal(null) } },
      { provide: JobEventsService, useValue: { events: EMPTY, connected: signal(false) } },
    ],
  });
  return TestBed.runInInjectionContext(() => new Jobs());
}

const job = { jobId: 2838, jobName: 'feed', jobStatus: 'Active', execution: 'Auto' } as SourceJob;

describe('the Recent runs chart', () => {
  it('plots seconds, oldest first, and labels each with its unit', () => {
    const jobs = jobsFor();
    jobs.toggleRow(job);
    const bars = jobs.runsByJob()[2838];
    expect(bars.map(bar => bar.value)).toEqual([25.3, 27, 41, 50, 60]);
    expect(bars.map(bar => compactDuration(bar.value))).toEqual(['25s', '27s', '41s', '50s', '1m']);
  });
});

describe('the schedule in words', () => {
  it('writes its days as "31 Mar 2027", not as the API sends them', () => {
    const jobs = jobsFor();
    expect(jobs.dayLabel('2027-03-31')).toBe('31 Mar 2027');
    // An unset start or end stays empty, so the detail panel still leaves the item out.
    expect(jobs.dayLabel(undefined)).toBe('');
  });

  it('writes a time of day without the seconds the API stores', () => {
    expect(clockTime('09:30:00')).toBe('09:30');
    expect(clockTime('9:05')).toBe('09:05');
    expect(clockTime('')).toBe('');
  });
});
