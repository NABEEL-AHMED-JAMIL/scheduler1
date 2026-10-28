import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { TaskEdit } from './task-edit';
import { ToastService } from '../../../shared/ui/toast.service';
import { API_SUCCESS } from '../../../core/api/api.config';

/**
 * Owner 2026-10-27 ("a loader on each component", "a sort on each table"): the pipeline editor's choice lists say they
 * are loading and why they failed under their own field (not a toast, not "No matches"), the Schedules tab keeps its list
 * through a reload and says when it could not be read, and its columns sort.
 */
const FAIL = () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' }));
const EMPTY = () => of({ status: API_SUCCESS, data: [] });

function editor(answers: { get?: (url: string) => Observable<unknown> | null; jobs?: () => Observable<unknown> } = {}, id?: string) {
  const toast = { success: vi.fn(), error: vi.fn(), info: () => {} };
  TestBed.resetTestingModule();
  try { localStorage.clear(); } catch { /* none: the sort remembers its choice there */ }
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: {
      get: (url: string) => answers.get?.(url) ?? EMPTY(),
      post: (url: string) => (url.endsWith('/fetchAllLinkJobsWithSourceTaskId') && answers.jobs ? answers.jobs() : EMPTY()),
      put: () => EMPTY(),
    } },
    { provide: ToastService, useValue: toast },
    { provide: Router, useValue: { navigate: () => {} } },
  ] });
  const component = TestBed.runInInjectionContext(() => new TaskEdit());
  if (id !== undefined) (component as any).taskDetailId = () => id;
  component.ngOnInit();
  return { component, toast };
}

describe('TaskEdit -- the choice lists load, fail and retry in place', () => {
  it('the connections are loading until they answer', () => {
    const { component } = editor({ get: url => (url.endsWith('/fetchAllProfiles') ? NEVER : null) });
    expect(component.profilesState.loading()).toBe(true);
    expect(component.profilesState.pending()).toBe(true);
  });

  it('a failed connections read says so under the field, with no toast, and reads again', () => {
    let fail = true;
    const { component, toast } = editor({ get: url => (url.endsWith('/fetchAllProfiles') ? (fail ? FAIL() : EMPTY()) : null) });
    expect(component.profilesState.error()).toBe('The Kafka connections could not be read.');
    expect(toast.error).not.toHaveBeenCalled();
    fail = false;
    component.loadProfiles();
    expect(component.profilesState.error()).toBe('');
    expect(component.profilesState.loaded()).toBe(true);
  });

  it('a failed groups or home pages read says so under the field', () => {
    const { component, toast } = editor({ get: url => (url.endsWith('/setting.json/taskReferences') ? FAIL() : null) });
    expect(component.groupsState.error()).toBe('The task groups could not be read.');
    expect(component.homePagesState.error()).toBe('The home pages could not be read.');
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('TaskEdit -- the Schedules tab', () => {
  const JOBS = [
    { jobId: 1, jobName: 'Nightly', execution: 'Daily', jobStatus: 'Active', lastJobRun: '2026-10-01T10:00:00Z' },
    { jobId: 2, jobName: 'Ad hoc', execution: 'Manual', jobStatus: 'Inactive', lastJobRun: '2026-10-20T10:00:00Z' },
  ];

  it('sorts by a heading, both ways, from the API order', () => {
    const { component } = editor({ get: url => (url.includes('fetchSourceTaskWithSourceTaskId') ? NEVER : null),
      jobs: () => of({ status: API_SUCCESS, data: JOBS }) }, '7714');
    component.retryJobs();
    expect(component.sortedJobs().map(j => j.jobId)).toEqual([1, 2]);
    component.jobSort.toggle('schedule');
    expect(component.sortedJobs().map(j => j.jobName)).toEqual(['Ad hoc', 'Nightly']);
    component.jobSort.toggle('schedule');
    expect(component.sortedJobs().map(j => j.jobName)).toEqual(['Nightly', 'Ad hoc']);
    component.jobSort.toggle('lastRun');
    expect(component.sortedJobs().map(j => j.jobId)).toEqual([2, 1]);
  });

  it('is loading, then empty, then says it could not be read -- never "Not scheduled yet" for a failure', () => {
    let answer: () => Observable<unknown> = () => NEVER;
    const { component } = editor({ get: url => (url.includes('fetchSourceTaskWithSourceTaskId') ? NEVER : null), jobs: () => answer() }, '7714');
    component.retryJobs();
    expect(component.jobsLoading()).toBe(true);
    expect(component.jobsLoaded()).toBe(false);
    answer = () => of({ status: API_SUCCESS, data: [] });
    component.retryJobs();
    expect(component.jobsLoaded()).toBe(true);
    expect(component.jobs()).toEqual([]);
    answer = FAIL;
    component.retryJobs();
    expect(component.jobsLoading()).toBe(false);
    expect(component.jobsError()).toBe('The schedules could not be read.');
  });

  it('keeps the schedules on screen while they are read again', () => {
    let answer: () => Observable<unknown> = () => of({ status: API_SUCCESS, data: JOBS });
    const { component } = editor({ get: url => (url.includes('fetchSourceTaskWithSourceTaskId') ? NEVER : null), jobs: () => answer() }, '7714');
    component.retryJobs();
    answer = () => NEVER;
    component.retryJobs();
    expect(component.jobsLoading()).toBe(true);
    expect(component.jobs().length).toBe(2);
    expect(component.jobsLoaded()).toBe(true);
  });
});
