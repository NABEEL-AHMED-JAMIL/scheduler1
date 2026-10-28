import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { JobEdit } from './job-edit';
import { ToastService } from '../../../shared/ui/toast.service';

/**
 * Owner 2026-10-27: the editor's side reads -- the pipelines to choose from and the saved triggers and AI models --
 * each say they are loading, empty or failed, instead of "No matches", a toast, or a trigger shown as off.
 */
const JOB = { status: 'SUCCESS', data: { jobId: 41, jobName: 'Nightly export', execution: 'Manual', priority: 1,
  jobStatus: 'Active', taskDetail: { taskDetailId: 7 } } };
const fail = () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' }));

function editor(get: (url: string) => Observable<unknown>, tasks: () => Observable<unknown>, id = '41') {
  const toasts: unknown[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: {
      post: (url: string) => (url.includes('listSourceTask') ? tasks() : of({ status: 'SUCCESS' })),
      put: () => of({ status: 'SUCCESS' }),
      get: (url: string) => get(url),
    } },
    { provide: ToastService, useValue: { success: () => {}, error: (m: unknown) => toasts.push(m), info: () => {} } },
    { provide: Router, useValue: { navigate: () => {} } },
  ] });
  const component = TestBed.runInInjectionContext(() => new JobEdit());
  (component as any).jobId = () => id;
  (component as any).whenApproved = () => '';
  component.ngOnInit();
  return { component, toasts };
}

describe('JobEdit -- the pipeline list (owner 2026-10-27)', () => {
  it('is loading until the list answers', () => {
    const { component } = editor(() => of(JOB), () => NEVER);
    expect(component.tasksState.loading()).toBe(true);
    expect(component.tasksState.pending()).toBe(true);
  });

  it('is empty once an empty list answers', () => {
    const { component } = editor(() => of(JOB), () => of({ status: 'SUCCESS', data: [] }));
    expect(component.tasksState.loaded()).toBe(true);
    expect(component.tasks()).toEqual([]);
  });

  it('says the list could not be read, under the field rather than in a toast', () => {
    const { component, toasts } = editor(() => of(JOB), fail);
    expect(component.tasksState.loading()).toBe(false);
    expect(component.tasksState.error()).toBe('The pipelines could not be read.');
    expect(toasts).toEqual([]);
  });
});

describe('JobEdit -- the saved triggers and AI models (owner 2026-10-27)', () => {
  const tasks = () => of({ status: 'SUCCESS', data: [] });

  it('holds the trigger switches while the triggers are read', () => {
    const { component } = editor(url => (url.includes('fetchSourceJobDetailWithSourceJobId') ? of(JOB) : NEVER), tasks);
    expect(component.extrasLoading()).toBe(true);
    expect(component.triggersLoading()).toBe(true);
    expect(component.extrasError()).toBe('');
  });

  it('says a trigger could not be read, and reads only that one again on Try again', () => {
    let inbox: () => Observable<unknown> = fail;
    const asked: string[] = [];
    const { component } = editor(url => {
      asked.push(url);
      if (url.includes('fetchSourceJobDetailWithSourceJobId')) return of(JOB);
      if (url.includes('inboxTrigger')) return inbox();
      return of({ status: 'SUCCESS', data: { configured: false } });
    }, tasks);
    expect(component.extrasLoading()).toBe(false);
    expect(component.extrasError()).toBe("This schedule's inbox trigger could not be read.");
    inbox = () => of({ status: 'SUCCESS', data: { jobId: 41, configured: true, enabled: true, filePattern: '*.csv' } });
    asked.length = 0;
    component.retryExtras();
    expect(asked.filter(u => u.includes('sourceJob.json/')).map(u => u.replace(/^.*sourceJob\.json\//, ''))).toEqual(['inboxTrigger']);
    expect(component.extrasError()).toBe('');
    expect(component.onArrival()).toBe(true);
  });
});
