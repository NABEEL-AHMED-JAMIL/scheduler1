import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { NEVER, Observable, Subject, of, throwError } from 'rxjs';
import { Queue } from './queue';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { JobEvent, JobEventsService } from '../../core/socket/job-events.service';

/**
 * Owner 2026-10-27: Runs by date sorts by its headings over the runs it read, and its read says loading, empty and
 * error -- a silent re-read that fails keeps the rows on screen.
 */
const row = (jobQueueId: number, over: Record<string, unknown> = {}) => ({
  jobQueueId, jobId: 2838, jobStatus: 'Completed', jobStatusMessage: '', dateCreated: '2026-09-24T10:00:00',
  startTime: '2026-09-24T10:00:00', endTime: '2026-09-24T10:00:30', ...over,
});
const ok = (rows: unknown[]) => of({ status: 'SUCCESS', data: { sourceJobQueues: rows, jobStatusStatistic: [] } });

function screen(post: () => Observable<unknown>) {
  TestBed.resetTestingModule();
  try { localStorage.clear(); } catch { /* none */ }
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { post: () => post(), get: () => of({ status: 'SUCCESS', data: [] }), delete: () => of({ status: 'SUCCESS' }) } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: AuthService, useValue: { canOpen: () => true, builderLocked: () => false } },
      { provide: JobEventsService, useValue: { events: new Subject<JobEvent>(), connected: signal(false) } },
    ],
  });
  const queue = TestBed.runInInjectionContext(() => new Queue());
  queue.ngOnInit();
  return queue;
}

describe('Runs by date -- sorting (owner 2026-10-27)', () => {
  const rows = [row(3, { endTime: '2026-09-24T10:02:00' }), row(1, { endTime: '2026-09-24T10:00:05' }), row(2)];

  it('keeps the newest-first order until a heading is picked, then sorts by run both ways', () => {
    const queue = screen(() => ok(rows));
    expect(queue.paged().map(r => r.jobQueueId)).toEqual([3, 1, 2]);
    queue.sort.toggle('run');
    expect(queue.paged().map(r => r.jobQueueId)).toEqual([3, 2, 1]);
    queue.sort.toggle('run');
    expect(queue.paged().map(r => r.jobQueueId)).toEqual([1, 2, 3]);
  });

  it('sorts Duration by the seconds, the longest first, and says what the sort covers', () => {
    const queue = screen(() => ok(rows));
    queue.sort.toggle('duration');
    expect(queue.paged().map(r => r.jobQueueId)).toEqual([3, 2, 1]);
    expect(queue.sort.note).toBe('Sorts the newest 2,000 runs shown');
  });
});

describe('Runs by date -- loading, empty, error (owner 2026-10-27)', () => {
  it('is loading until the runs answer', () => {
    const queue = screen(() => NEVER);
    expect(queue.loading()).toBe(true);
    expect(queue.error()).toBe('');
  });

  it('is empty once no run answers', () => {
    const queue = screen(() => ok([]));
    expect(queue.loading()).toBe(false);
    expect(queue.paged()).toEqual([]);
  });

  it('says in plain words that the runs could not be read', () => {
    const queue = screen(() => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' })));
    expect(queue.loading()).toBe(false);
    expect(queue.error()).toBe('The runs could not be read.');
  });

  it('keeps the rows, with no error in their place, when a silent re-read fails', () => {
    let answer: () => Observable<unknown> = () => ok([row(1)]);
    const queue = screen(() => answer());
    answer = () => throwError(() => new HttpErrorResponse({ status: 500 }));
    queue.load({ silent: true });
    expect(queue.error()).toBe('');
    expect(queue.rows().length).toBe(1);
  });
});
