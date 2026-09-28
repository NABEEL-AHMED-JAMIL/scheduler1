import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { Subject, of } from 'rxjs';
import { JobHistory } from './job-history';
import { ToastService } from '../../../shared/ui/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { JobEvent, JobEventsService } from '../../../core/socket/job-events.service';

/**
 * UI review jobs#12: a run that finished while the history was open did not appear until a
 * manual Refresh, although Jobs and Queue already follow the job-status feed.
 */
function setup() {
  const events = new Subject<JobEvent>();
  const connected = signal(false);
  const gets: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [JobHistory],
    providers: [
      provideRouter([]),
      { provide: HttpClient, useValue: {
        get: (url: string) => {
          gets.push(url);
          return of({ status: 'SUCCESS', data: url.includes('listSourceJob')
            ? [] : { sourceJobQueues: [{ jobQueueId: 1, jobId: 41, jobStatus: 'Completed' }] } });
        },
      } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: AuthService, useValue: { canManageTasks: () => true } },
      { provide: JobEventsService, useValue: { events, connected } },
    ],
  });
  return { events, connected, gets };
}

function history(route: { jobId?: string; targetDate?: string; targetHr?: string } = { jobId: '41' }) {
  const component = TestBed.runInInjectionContext(() => new JobHistory());
  (component as any).jobId = () => route.jobId ?? '';
  (component as any).targetDate = () => route.targetDate ?? '';
  (component as any).targetHr = () => route.targetHr ?? '';
  // Lets the route effect make its first read now, so a count taken after this is a baseline.
  TestBed.tick();
  return component;
}

const runReads = (gets: string[]) => gets.filter(url =>
  url.includes('fetchSourceJobQueueListWithJobId') || url.includes('weeklyHrRunningStatisticsDimensionDetail')).length;

afterEach(() => vi.useRealTimers());

describe('Run history live updates', () => {
  it('re-reads once, a second after a burst of this job\'s status pushes, without the loading blur', () => {
    vi.useFakeTimers();
    const { events, gets } = setup();
    const h = history();
    const before = runReads(gets);
    expect(before).toBeGreaterThan(0);
    const loading: boolean[] = [];
    const original = h.loading.set.bind(h.loading);
    h.loading.set = (value: boolean) => { loading.push(value); original(value); };

    events.next({ type: 'job.status', jobId: 41, jobRunningStatus: 'Running' });
    events.next({ type: 'job.status', jobId: 41, jobRunningStatus: 'Completed', jobQueueId: 2 });
    vi.advanceTimersByTime(999);
    expect(runReads(gets)).toBe(before);
    vi.advanceTimersByTime(1);
    expect(runReads(gets)).toBe(before + 1);
    expect(loading).not.toContain(true);
    expect(h.runs().length).toBe(1);
  });

  it('ignores another job\'s pushes and log lines', () => {
    vi.useFakeTimers();
    const { events, gets } = setup();
    history();
    const before = runReads(gets);
    events.next({ type: 'job.status', jobId: 99, jobRunningStatus: 'Completed' });
    events.next({ type: 'job.log', jobId: 41, message: 'hello' });
    vi.advanceTimersByTime(2000);
    expect(runReads(gets)).toBe(before);
  });

  it('follows every job on an all-jobs hour drill-down', () => {
    vi.useFakeTimers();
    const { events, gets } = setup();
    history({ targetDate: '2026-09-28', targetHr: '9' });
    const before = runReads(gets);
    events.next({ type: 'job.status', jobId: 99, jobRunningStatus: 'Completed' });
    vi.advanceTimersByTime(1000);
    expect(runReads(gets)).toBe(before + 1);
  });

  it('shows the Live mark only while the feed is connected', () => {
    const { connected } = setup();
    const fixture = TestBed.createComponent(JobHistory);
    fixture.componentRef.setInput('jobId', '41');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const hasLive = () => [...el.querySelectorAll('span')].some(s => s.textContent?.trim() === 'Live');
    expect(hasLive()).toBe(false);
    connected.set(true);
    fixture.detectChanges();
    expect(hasLive()).toBe(true);
  });
});
