import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { EMPTY, of } from 'rxjs';
import { Jobs } from './jobs';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { JobEventsService } from '../../core/socket/job-events.service';

/**
 * A refusal that carries no sentence -- status ERROR, message empty -- was toasted as-is, so the
 * reader got an empty red box (UI audit, A.5 §8: `response.message || 'Could not …'`).
 */
function jobsRefusingEverything() {
  const errors: unknown[] = [];
  const refusal = { status: 'ERROR', message: '' };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: {
        get: (url: string) => url.includes('fetchSourceJobDetail')
          ? of({ status: 'SUCCESS', data: { jobId: 41, jobName: 'Nightly export' } })
          : of({ status: 'SUCCESS', data: [] }),
        post: (url: string) => url.includes('addSourceJob') ? of(refusal) : of({ status: 'SUCCESS', data: [] }),
        request: () => of(refusal),
      } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: ToastService, useValue: { success: vi.fn(), error: (m: unknown) => errors.push(m), info: vi.fn() } },
      { provide: Router, useValue: { navigate: () => {} } },
      { provide: AuthService, useValue: { user: signal(null) } },
      { provide: JobEventsService, useValue: { events: EMPTY, connected: signal(false) } },
    ],
  });
  const jobs = TestBed.runInInjectionContext(() => new Jobs());
  return { jobs, errors };
}

const JOB = { jobId: 41, jobName: 'Nightly export', jobStatus: 'Active' } as any;

describe('Jobs: a refusal with no message still says something', () => {
  it('Run now', () => {
    const { jobs, errors } = jobsRefusingEverything();
    jobs.runNow(JOB);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeTruthy();
  });

  it('Skip next run', () => {
    const { jobs, errors } = jobsRefusingEverything();
    jobs.skipNext(JOB);
    expect(errors[0]).toBeTruthy();
  });

  it('Activate / Deactivate', async () => {
    const { jobs, errors } = jobsRefusingEverything();
    await jobs.toggleStatus(JOB);
    expect(errors[0]).toBeTruthy();
  });

  it('Delete', async () => {
    const { jobs, errors } = jobsRefusingEverything();
    await jobs.remove(JOB);
    expect(errors[0]).toBeTruthy();
  });

  it('Duplicate', () => {
    const { jobs, errors } = jobsRefusingEverything();
    jobs.clone(JOB);
    expect(errors[0]).toBeTruthy();
  });
});
