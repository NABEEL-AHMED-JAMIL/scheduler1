import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { JobHistory } from './job-history';
import { ToastService } from '../../../shared/ui/toast.service';

function history(route: { jobId?: string; targetDate?: string; targetHr?: string } = { jobId: '41' }) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', data: {} }) } },
    { provide: Router, useValue: { navigate: () => {} } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
  ] });
  const component = TestBed.runInInjectionContext(() => new JobHistory());
  (component as any).jobId = () => route.jobId ?? '';
  (component as any).targetDate = () => route.targetDate ?? '';
  (component as any).targetHr = () => route.targetHr ?? '';
  return component;
}

const runs = (n: number) => Array.from({ length: n }, (_, i) => ({
  jobQueueId: i + 1, jobId: 41, jobStatus: i % 2 ? 'Failed' : 'Completed', jobStatusMessage: '',
})) as any[];

describe('Run history paging', () => {
  /**
   * The runs table rendered every run a job ever made in one piece; Jobs, Tasks and Queue all
   * page (UI audit, Medium). A long-lived job's history is thousands of rows.
   */
  it('shows one page of runs at a time', () => {
    const h = history();
    h.runs.set(runs(120));
    expect(h.paged().length).toBe(50);
    h.goToPage(3);
    expect(h.paged().map(r => r.jobQueueId)).toEqual(runs(120).slice(100).map(r => r.jobQueueId));
  });

  it('goes back to the first page when a filter changes what the pages hold', () => {
    const h = history();
    h.runs.set(runs(120));
    h.goToPage(2);
    h.setStatusFilter('Failed');
    expect(h.pager.page()).toBe(1);
    h.goToPage(2);
    h.setSearch('1');
    expect(h.pager.page()).toBe(1);
  });
});

describe('Run history empty message', () => {
  /** "This job has never run." was said for a search that matched nothing, and for an empty hour. */
  it('says a filter matched nothing when one is on', () => {
    const h = history();
    h.setSearch('zzz');
    expect(h.emptyMessage()).toBe('No runs match the current filters.');
    const s = history();
    s.setStatusFilter('Failed');
    expect(s.emptyMessage()).toBe('No runs match the current filters.');
  });

  it('says the hour was empty on a drill-down', () => {
    expect(history({ targetDate: '2026-09-20', targetHr: '9' }).emptyMessage()).toBe('No runs in this hour.');
    expect(history({ jobId: '41', targetDate: '2026-09-20', targetHr: '9' }).emptyMessage()).toBe('No runs in this hour.');
  });

  it('says the job never ran only when that is what it means', () => {
    expect(history().emptyMessage()).toBe('This job has never run.');
  });
});
