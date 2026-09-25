import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { JobEdit } from './job-edit';
import { ToastService } from '../../../shared/ui/toast.service';

const JOB = { jobId: 41, jobName: 'Nightly export', execution: 'Manual', priority: 1, jobStatus: 'Active',
  taskDetail: { taskDetailId: 7 } };

/** The editor for job 41, reading it through `read` and saving through `write`. */
function editor(read: () => unknown, write: () => unknown = () => of({ status: 'SUCCESS' })) {
  const errors: unknown[] = [];
  const writes: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: {
      post: (url: string) => url.includes('listSourceTask') ? of({ status: 'SUCCESS', data: [] }) : (writes.push(url), write()),
      put: (url: string) => (writes.push(url), write()),
      get: () => read(),
    } },
    { provide: ToastService, useValue: { success: () => {}, error: (m: unknown) => errors.push(m), info: () => {} } },
    { provide: Router, useValue: { navigate: () => {} } },
  ] });
  const component = TestBed.runInInjectionContext(() => new JobEdit());
  (component as any).jobId = () => '41';
  component.ngOnInit();
  return { component, errors, writes };
}

describe('JobEdit when the job cannot be read', () => {
  /**
   * A failed read toasted and then showed an empty "Edit job" form whose Save would PUT an
   * update with jobId null (UI audit, Medium). The page now holds the reason and offers Try
   * again, and there is no form to save.
   */
  it('keeps the reason instead of showing a blank form, for a refusal', () => {
    const { component } = editor(() => of({ status: 'ERROR', message: 'No job 41 here.' }));
    expect(component.loading()).toBe(false);
    expect(component.loadError()).toBe('No job 41 here.');
  });

  it('keeps a reason for a failed request too', () => {
    const { component } = editor(() => throwError(() => ({ error: {} })));
    expect(component.loadError()).toBeTruthy();
  });

  it('will not save a form it never filled', () => {
    const { component, writes } = editor(() => of({ status: 'ERROR', message: 'No job 41 here.' }));
    component.form.patchValue({ jobName: 'x', taskDetailId: 7, executionType: 'Manual',
      scheduler: { startDate: '2026-10-01' } });
    expect(component.form.valid).toBe(true);
    component.save();
    expect(writes).toEqual([]);
  });

  it('reads again on Try again, and clears the reason once it can', () => {
    let answer: unknown = { status: 'ERROR', message: 'No job 41 here.' };
    const { component } = editor(() => of(answer));
    answer = { status: 'SUCCESS', data: JOB };
    component.retryLoad();
    expect(component.loadError()).toBe('');
    expect(component.form.get('jobId')!.value).toBe(41);
  });
});

describe('JobEdit save', () => {
  /** An empty message was toasted as-is: an empty red box. */
  it('says something when a save is refused without a message', () => {
    const { component, errors } = editor(() => of({ status: 'SUCCESS', data: JOB }),
      () => of({ status: 'ERROR', message: '' }));
    component.form.patchValue({ scheduler: { startDate: '2026-10-01' } });
    expect(component.form.valid).toBe(true);
    component.save();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeTruthy();
  });
});

/**
 * Owner's tenant-user review, 2026-09-24: a Manual job could not be created or saved. The Schedule section is
 * hidden for Manual, but its start date stayed required, so the form was invalid with nothing highlighted.
 */
describe('JobEdit with Manual execution', () => {
  it('saves a Manual job without a start date', () => {
    const { component, writes, errors } = editor(() => of({ status: 'SUCCESS', data: JOB }));
    expect(component.form.valid).toBe(true);
    component.save();
    expect(errors).toHaveLength(0);
    expect(writes).toHaveLength(1);
  });

  it('still requires a start date once the job is scheduled', () => {
    const { component } = editor(() => of({ status: 'SUCCESS', data: JOB }));
    component.form.patchValue({ executionType: 'Auto', scheduler: { startDate: '' } });
    expect(component.form.valid).toBe(false);
    component.form.patchValue({ executionType: 'Manual' });
    expect(component.form.valid).toBe(true);
  });
});
