import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { Subject, of } from 'rxjs';
import { JobHistory } from './job-history';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { JobEventsService } from '../../../core/socket/job-events.service';

/**
 * MIG-420: a schedule's runs say how their items went -- "48 of 50 done · 2 failed ›" -- for the runs that have items,
 * read for the page's runs in one question; "2 failed" opens the run's Items tab filtered to the failed ones.
 */
function runs(canOpen: boolean) {
  const posts: { url: string; body: any }[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [JobHistory], providers: [
    provideRouter([]),
    { provide: HttpClient, useValue: {
      get: (url: string) => of(url.includes('fetchSourceJobQueueListWithJobId')
        ? { status: 'SUCCESS', data: { jobQueues: [
            { jobQueueId: 8814, jobId: 41, jobStatus: 'Completed' },
            { jobQueueId: 8790, jobId: 41, jobStatus: 'Completed' },
            { jobQueueId: 8771, jobId: 41, jobStatus: 'Completed' },
          ] } }
        : { status: 'SUCCESS', data: {} }),
      post: (url: string, body: any) => {
        posts.push({ url, body });
        return of(url.includes('runItems/counts')
          ? { status: 'SUCCESS', data: { 8814: { items: 50, done: 48, failed: 2, running: 0 }, 8790: { items: 12, done: 12, failed: 0, running: 0 } } }
          : { status: 'SUCCESS', data: {} });
      },
    } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    { provide: AuthService, useValue: { canManageTasks: () => true, canOpen: () => canOpen } },
    { provide: JobEventsService, useValue: { events: new Subject(), connected: signal(false) } },
  ] });
  const fixture = TestBed.createComponent(JobHistory);
  fixture.componentRef.setInput('jobId', '41');
  fixture.detectChanges();
  TestBed.tick();
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, posts };
}

describe('Runs list: item counts', () => {
  it('asks once for the page\'s runs and says how their items went, the failed ones a link to the filtered Items tab', () => {
    const { el, posts } = runs(true);
    const asked = posts.filter(p => p.url.endsWith('/sourceJob.json/runItems/counts'));
    expect(asked).toHaveLength(1);
    expect([...asked[0].body.jobQueueIds].sort()).toEqual([8771, 8790, 8814]);
    expect(el.querySelector('thead')?.textContent).toContain('Items');
    const cells = [...el.querySelectorAll('[data-test="run-items"]')].map(c => c.textContent!.replace(/\s+/g, ' ').trim());
    expect(cells).toEqual(['48 of 50 done · 2 failed ›', '12 of 12 done', '—']);
    const failed = el.querySelector('[data-test="run-items-failed"]') as HTMLAnchorElement;
    expect(failed.getAttribute('href')).toBe('/pipelines/schedules/41/runs/8814?tab=items&status=failed');
  });

  it('asks nothing and adds no column for a reader without the run pages', () => {
    const { el, posts } = runs(false);
    expect(posts.filter(p => p.url.includes('runItems'))).toHaveLength(0);
    expect(el.querySelector('[data-test="run-items"]')).toBeNull();
  });
});
