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

/** The live-counts strip above the jobs table, now drawn by app-stat-strip. */
function jobsWith(rows: SourceJob[]) {
  const events = new Subject<JobEvent>();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', data: rows }), post: () => of({ status: 'SUCCESS', data: [] }) } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: Router, useValue: { navigate: () => {} } },
      { provide: AuthService, useValue: { user: signal(null) } },
      { provide: JobEventsService, useValue: { events, connected: signal(false) } },
    ],
  });
  const jobs = TestBed.runInInjectionContext(() => new Jobs());
  jobs.jobs.set(rows);
  return { jobs, events };
}

const job = (jobId: number, jobRunningStatus?: string): SourceJob =>
  ({ jobId, jobName: `job ${jobId}`, jobStatus: 'Active', jobRunningStatus } as SourceJob);

describe('the live-counts strip', () => {
  it('shows the five counts in order, each with its icon and tone', () => {
    const { jobs } = jobsWith([
      job(1, 'Running'), job(2, 'Queue'), job(3, 'Start'), job(4, 'Completed'),
      job(5, 'Failed'), job(6, 'Interrupt'), job(7),
    ]);
    expect(jobs.liveTiles().map(t => [t.label, t.value, t.icon, t.tone])).toEqual([
      ['Running',   1, 'play',        'info'],
      ['Queued',    2, 'clock',       'muted'],
      ['Completed', 1, 'checkCircle', 'ok'],
      ['Failed',    2, 'xCircle',     'crit'],
      ['Never run', 1, 'minus',       'muted'],
    ]);
  });

  it('pulses the Running tile only while something is running', () => {
    const { jobs } = jobsWith([job(1, 'Completed')]);
    expect(jobs.liveTiles()[0].live).toBeUndefined();
    jobs.jobs.set([job(1, 'Running')]);
    expect(jobs.liveTiles()[0].live).toBe('Updating as runs report in');
  });

  it('moves with a status push, as the hand-rolled strip did', () => {
    const { jobs, events } = jobsWith([job(1244, 'Completed')]);
    events.next({ type: 'job.status', jobId: 1244, jobQueueId: 1, jobRunningStatus: 'Running',
      at: '2026-09-24T14:01:25.564Z', tenantId: 1 });
    const running = jobs.liveTiles().find(t => t.label === 'Running')!;
    const completed = jobs.liveTiles().find(t => t.label === 'Completed')!;
    expect(running.value).toBe(1);
    expect(completed.value).toBe(0);
  });

  it('is display-only: no tile links or emits', () => {
    const { jobs } = jobsWith([job(1, 'Running')]);
    expect(jobs.liveTiles().some(t => t.link || t.clickable)).toBe(false);
  });
});
