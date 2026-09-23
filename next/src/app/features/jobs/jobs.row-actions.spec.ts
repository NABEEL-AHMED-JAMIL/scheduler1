import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { EMPTY, Subject, of } from 'rxjs';
import { Jobs } from './jobs';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { JobEventsService } from '../../core/socket/job-events.service';

/** The Jobs screen with the confirm answering yes and every request left in flight. */
function jobsWithRequestsInFlight() {
  const confirms: any[] = [];
  const requests: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: {
        get: () => of({ status: 'SUCCESS', data: [] }),
        post: () => of({ status: 'SUCCESS', data: [] }),
        request: (method: string, url: string) => { requests.push(`${method} ${url}`); return new Subject<any>(); },
      } },
      { provide: Dialog, useValue: { open: (_c: unknown, config: { data: unknown }) => { confirms.push(config?.data); return { closed: of(true) }; } } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      { provide: Router, useValue: { navigate: () => {} } },
      { provide: AuthService, useValue: { user: signal(null) } },
      { provide: JobEventsService, useValue: { events: EMPTY, connected: signal(false) } },
    ],
  });
  const jobs = TestBed.runInInjectionContext(() => new Jobs());
  return { jobs, confirms, requests };
}

const JOB = { jobId: 41, jobName: 'Nightly export', jobStatus: 'Active' } as any;

describe('Jobs row: Deactivate and Delete', () => {
  /** Deactivating stops a schedule and records the missed slots; it is confirmed as dangerous, like Delete. */
  it('asks to deactivate with the danger styling Delete and the user/tenant turn-offs use', async () => {
    const { jobs, confirms } = jobsWithRequestsInFlight();
    await jobs.toggleStatus(JOB);
    expect(confirms[0]).toMatchObject({ confirmLabel: 'Deactivate', danger: true });
  });

  it('does not style re-activating as dangerous', async () => {
    const { jobs, confirms } = jobsWithRequestsInFlight();
    await jobs.toggleStatus({ ...JOB, jobStatus: 'Inactive' });
    expect(confirms[0].danger).toBeFalsy();
  });

  /** The row was not locked, so a second click while the first request was out sent it twice. */
  it('locks the row while the status change is out, and sends it once', async () => {
    const { jobs, requests } = jobsWithRequestsInFlight();
    await jobs.toggleStatus(JOB);
    expect(jobs.busyJob()).toBe(41);
    await jobs.toggleStatus(JOB);
    expect(requests).toHaveLength(1);
  });

  it('locks the row while the delete is out, and sends it once', async () => {
    const { jobs, requests } = jobsWithRequestsInFlight();
    await jobs.remove(JOB);
    expect(jobs.busyJob()).toBe(41);
    await jobs.remove(JOB);
    expect(requests).toHaveLength(1);
  });
});
