import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { Subject, of } from 'rxjs';
import { Queue } from './queue';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { JobEvent, JobEventsService } from '../../core/socket/job-events.service';
import { localIsoDay } from '../../shared/ui/local-day';

/**
 * The Queue said "in flight right now" and never moved; its runs and jobs were dead ends; and its
 * day chart bucketed by the UTC date, so an evening run landed on tomorrow, outside the range.
 */
function setup(options: { canOpenJobs?: boolean; rows?: any[] } = {}) {
  const events = new Subject<JobEvent>();
  const connected = signal(false);
  const posts: unknown[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Queue],
    providers: [
      provideRouter([]),
      { provide: HttpClient, useValue: {
        post: (_url: string, body: unknown) => {
          posts.push(body);
          return of({ status: 'SUCCESS', data: { sourceJobQueues: options.rows ?? [], jobStatusStatistic: [] } });
        },
        get: () => of({ status: 'SUCCESS', data: [{ jobId: 2838, jobName: 'Nightly ledger check' }] }),
        delete: () => of({ status: 'SUCCESS' }),
      } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: AuthService, useValue: { canOpen: (page: string) => page !== 'jobs' || options.canOpenJobs !== false, builderLocked: () => false } },
      { provide: JobEventsService, useValue: { events, connected } },
    ],
  });
  return { events, connected, posts };
}

const row = (over: any = {}): any => ({
  jobQueueId: 7359, jobId: 2838, jobStatus: 'Running', jobStatusMessage: '',
  dateCreated: '2026-09-24T10:00:00', startTime: '2026-09-24T10:00:00', ...over,
});

afterEach(() => vi.useRealTimers());

describe('Queue volume by day', () => {
  it('buckets a run by the reader\'s own day, not by the UTC date', () => {
    setup();
    const queue = TestBed.runInInjectionContext(() => new Queue());
    const at = '2026-09-25T03:47:53.834+00:00';
    const day = localIsoDay(new Date(at));
    queue.fromDate.set('2026-09-18');
    queue.toDate.set(day < '2026-09-24' ? '2026-09-24' : day);
    queue.rows.set([row({ dateCreated: at })]);
    const bars = queue.byDay();
    expect(bars.find(b => b.meta === day)!.value).toBe(1);
    // West of UTC (Chicago among them) that evening is still the 24th: no bar past the range.
    if (day === '2026-09-24') expect(bars[bars.length - 1].meta).toBe('2026-09-24');
  });
});

describe('Queue live updates', () => {
  it('re-reads once, five seconds after the first of a burst of status pushes, without the loading blur', () => {
    vi.useFakeTimers();
    const { events, posts } = setup({ rows: [row()] });
    const queue = TestBed.runInInjectionContext(() => new Queue());
    queue.ngOnInit();
    expect(posts).toHaveLength(1);
    const loading: boolean[] = [];
    const original = queue.loading.set.bind(queue.loading);
    queue.loading.set = (value: boolean) => { loading.push(value); original(value); };

    events.next({ type: 'job.status', jobId: 2838, jobRunningStatus: 'Running' });
    events.next({ type: 'job.status', jobId: 2838, jobRunningStatus: 'Completed', jobQueueId: 7359 });
    vi.advanceTimersByTime(4999);
    expect(posts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(posts).toHaveLength(2);
    // The rows on screen stay put while the fresh ones arrive.
    expect(loading).not.toContain(true);
  });

  /**
   * Scale review P0 #3: a debounce waits for a quiet second, and a busy workspace never has one, so the
   * list never re-read at all under load. A steady stream still costs one read per five seconds.
   */
  it('keeps re-reading under a steady stream of pushes, at most once per five seconds', () => {
    vi.useFakeTimers();
    const { events, posts } = setup({ rows: [row()] });
    const queue = TestBed.runInInjectionContext(() => new Queue());
    queue.ngOnInit();

    for (let second = 0; second < 20; second++) {
      events.next({ type: 'job.status', jobId: 2838, jobRunningStatus: 'Running' });
      vi.advanceTimersByTime(1000);
    }

    expect(posts).toHaveLength(1 + 4);
  });

  it('ignores a log line', () => {
    vi.useFakeTimers();
    const { events, posts } = setup();
    const queue = TestBed.runInInjectionContext(() => new Queue());
    queue.ngOnInit();
    events.next({ type: 'job.log', jobId: 2838, message: 'hello' });
    vi.advanceTimersByTime(2000);
    expect(posts).toHaveLength(1);
  });
});

describe('Queue rows lead somewhere', () => {
  function render(canOpenJobs = true) {
    setup({ canOpenJobs, rows: [row({ jobStatus: 'Completed', endTime: '2026-09-24T10:00:05' })] });
    const fixture = TestBed.createComponent(Queue);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('links the run to its logs and the job to its history', () => {
    const hrefs = [...render().querySelectorAll('table a')].map(a => a.getAttribute('href'));
    expect(hrefs).toContain('/pipelines/schedules/2838/runs/7359/logs');
    expect(hrefs).toContain('/pipelines/schedules/2838/executions');
  });

  it('shows plain text to someone whose profile has Queue but not Jobs', () => {
    const el = render(false);
    expect(el.querySelectorAll('table a').length).toBe(0);
    expect(el.textContent).toContain('Nightly ledger check');
  });

  it('names the job in the busiest-jobs chart', () => {
    setup();
    const queue = TestBed.runInInjectionContext(() => new Queue());
    queue.ngOnInit();
    queue.rows.set([row(), row({ jobQueueId: 1, jobId: 9 })]);
    expect(queue.byJob().map(b => b.name)).toEqual(['Nightly ledger check', 'Job #9']);
  });
});
