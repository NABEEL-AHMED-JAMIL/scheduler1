import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { LOCALE_ID, signal } from '@angular/core';
import { EMPTY, of } from 'rxjs';
import { Jobs } from './jobs';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { JobEventsService } from '../../core/socket/job-events.service';

/**
 * Owner decisions, 2026-09-28: bulk delete takes a Failed job, as the row menu always did; and
 * Skip next run asks first, naming the run, and says afterwards which run it skipped.
 */
function jobs(answer: { confirm?: boolean; data?: unknown } = {}) {
  const confirms: any[] = [];
  const requests: { method: string; url: string; body: any }[] = [];
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: LOCALE_ID, useValue: 'en-US' },
      { provide: HttpClient, useValue: {
        get: () => of({ status: 'SUCCESS', data: [] }),
        post: () => of({ status: 'SUCCESS', data: [] }),
        request: (method: string, url: string, options: { body: unknown }) => {
          requests.push({ method, url, body: options?.body });
          return of({ status: 'SUCCESS', message: 'ok', data: answer.data });
        },
      } },
      { provide: Dialog, useValue: { open: (_c: unknown, config: { data: unknown }) => {
        confirms.push(config?.data); return { closed: of(answer.confirm ?? true) }; } } },
      { provide: ToastService, useValue: toast },
      { provide: Router, useValue: { navigate: () => {} } },
      { provide: AuthService, useValue: { user: signal(null), isTenantAdmin: signal(true), canManageTasks: signal(true) } },
      { provide: JobEventsService, useValue: { events: EMPTY, connected: signal(false) } },
    ],
  });
  return { jobs: TestBed.runInInjectionContext(() => new Jobs()), confirms, requests, toast };
}

const failed = { jobId: 51, jobName: 'Ledger', jobStatus: 'Active', jobRunningStatus: 'Failed' } as any;
const scheduled = {
  jobId: 52, jobName: 'Nightly', jobStatus: 'Active', jobRunningStatus: 'Completed', execution: 'Auto',
  scheduler: { schedulerId: 9, frequency: 'Daily', nextRunAt: '2026-09-30T09:30:00', expired: false },
} as any;

describe('Bulk delete of a Failed job', () => {
  it('deletes a Failed job, as the row menu does', async () => {
    const { jobs: page, confirms, requests } = jobs();
    page.jobs.set([failed]);
    page.selected.set(new Set([51]));
    page.deleteSelected();
    await Promise.resolve();
    expect(confirms[0]?.title).toBe('Delete 1 job?');
    expect(requests.map(r => r.url)).toEqual([expect.stringContaining('deleteSourceJob')]);
  });

  it('still refuses a job whose run is in flight', () => {
    const { jobs: page, confirms, toast } = jobs();
    const running = { ...failed, jobRunningStatus: 'Running' };
    page.jobs.set([running]);
    page.selected.set(new Set([51]));
    page.deleteSelected();
    expect(confirms).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('#51'));
  });
});

describe('Skip next run', () => {
  it('asks first, naming the run it will skip', async () => {
    const { jobs: page, confirms, requests } = jobs({ confirm: false });
    await page.skipNext(scheduled);
    expect(confirms[0].title).toBe('Skip next run');
    expect(confirms[0].body).toContain('30 Sep, 09:30');
    expect(requests).toHaveLength(0);
  });

  it('says which run it skipped and when the next one is', async () => {
    const { jobs: page, requests, toast } = jobs({ data: { nextRunAt: '2026-10-01T09:30:00' } });
    await page.skipNext(scheduled);
    expect(requests.map(r => r.url)).toEqual([expect.stringContaining('skipNextSourceJob')]);
    expect(toast.success).toHaveBeenCalledWith('Skipped the run on 30 Sep, 09:30. Next run 1 Oct, 09:30.');
  });
});
