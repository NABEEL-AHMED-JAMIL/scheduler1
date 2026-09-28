import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { Subject, of } from 'rxjs';
import { JobHistory } from './job-history';
import { ToastService } from '../../../shared/ui/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { JobEventsService } from '../../../core/socket/job-events.service';

/**
 * A job that is not there (a stale link, a deleted job, or another person's job for a tenant user,
 * answered the same way) showed "SourceJob not found with 41." beside a Try again that could only
 * fail the same way.
 */
function historyOf(jobId: string, answer: unknown) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get: () => of(answer) } },
    { provide: Router, useValue: { navigate: () => {} } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    { provide: AuthService, useValue: { canManageTasks: () => true } },
    { provide: JobEventsService, useValue: { events: new Subject(), connected: signal(false) } },
  ] });
  const component = TestBed.runInInjectionContext(() => new JobHistory());
  (component as any).jobId = () => jobId;
  (component as any).targetDate = () => '';
  (component as any).targetHr = () => '';
  component.load();
  return component;
}

describe('Run history of a job that does not exist', () => {
  it('says so, and offers no Try again', () => {
    const h = historyOf('41', { status: 'ERROR', message: 'SourceJob not found with 41.' });
    expect(h.error()).toBe('Job #41 does not exist or was deleted.');
    expect(h.missing()).toBe(true);
  });

  it('keeps Try again for a real fault', () => {
    const h = historyOf('41', { status: 'ERROR', message: 'Database unavailable.' });
    expect(h.error()).toBe('Database unavailable.');
    expect(h.missing()).toBe(false);
  });
});
