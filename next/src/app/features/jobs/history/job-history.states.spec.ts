import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { NEVER, Observable, Subject, of, throwError } from 'rxjs';
import { JobHistory } from './job-history';
import { ToastService } from '../../../shared/ui/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { JobEventsService } from '../../../core/socket/job-events.service';

/**
 * Owner 2026-10-27: a schedule's runs page says its details card is loading or could not be read (it was absent), and
 * its status tiles wait for the first answer instead of showing zeros.
 */
function historyOf(get: (url: string) => Observable<unknown>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get: (url: string) => get(url), post: () => NEVER } },
    { provide: Router, useValue: { navigate: () => {} } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    { provide: AuthService, useValue: { canManageTasks: () => true } },
    { provide: JobEventsService, useValue: { events: new Subject(), connected: signal(false) } },
  ] });
  const component = TestBed.runInInjectionContext(() => new JobHistory());
  (component as any).jobId = () => '41';
  (component as any).targetDate = () => '';
  (component as any).targetHr = () => '';
  return component;
}

const fail = () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' }));

describe('Schedule runs -- the details card (owner 2026-10-27)', () => {
  it('is loading until the details answer', () => {
    const h = historyOf(() => NEVER);
    h.loadDetail();
    expect(h.detailState.loading()).toBe(true);
    expect(h.detail()).toBeNull();
  });

  it('shows the details once they answer', () => {
    const h = historyOf(() => of({ status: 'SUCCESS', data: { jobId: 41, jobName: 'Nightly' } }));
    h.loadDetail();
    expect(h.detailState.loading()).toBe(false);
    expect(h.detail()?.jobName).toBe('Nightly');
  });

  it('says the details could not be read, in plain words', () => {
    const h = historyOf(fail);
    h.loadDetail();
    expect(h.detailState.loading()).toBe(false);
    expect(h.detailState.error()).toBe("This schedule's details could not be read.");
  });
});

describe('Schedule runs -- the status tiles wait for the runs (owner 2026-10-27)', () => {
  it('has no answer while the runs are read', () => {
    const h = historyOf(() => NEVER);
    h.load();
    expect(h.loading()).toBe(true);
    expect(h.runsAnswered()).toBe(false);
  });

  it('has an answer once an empty history arrives', () => {
    const h = historyOf(() => of({ status: 'SUCCESS', data: { jobQueues: [] } }));
    h.load();
    expect(h.loading()).toBe(false);
    expect(h.runsAnswered()).toBe(true);
    expect(h.runs()).toEqual([]);
  });

  it('says the history could not be read, and has no answer', () => {
    const h = historyOf(url => (url.includes('fetchSourceJobQueueListWithJobId') ? fail() : NEVER));
    h.load();
    expect(h.loading()).toBe(false);
    expect(h.error()).toBe('The run history could not be read.');
    expect(h.runsAnswered()).toBe(false);
  });
});
