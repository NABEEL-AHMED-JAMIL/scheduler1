import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TaskEdit } from './task-edit';
import { ToastService } from '../../../shared/ui/toast.service';
import { API_SUCCESS } from '../../../core/api/api.config';

const TASK = { taskDetailId: 7714, taskName: 'Hurricanes ETL', taskStatus: 'Active', taskPayload: '<x/>',
  sourceTaskType: { sourceTaskTypeId: 10 } };

/** The editor, reading task 7714 (when `id` is given) through `readTask` and saving through `write`. */
function editor(readTask: () => unknown, opts: { id?: string; write?: () => unknown; topics?: () => unknown } = {}) {
  const errors: unknown[] = [];
  const writes: string[] = [];
  const empty = of({ status: API_SUCCESS, data: [] });
  const write = opts.write ?? (() => of({ status: API_SUCCESS }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: {
      get: (url: string) => url.includes('fetchSourceTaskWithSourceTaskId') ? readTask()
        : url.endsWith('/setting.json/topics') && opts.topics ? opts.topics() : empty,
      post: (url: string) => (writes.push(url), write()),
      put: (url: string) => (writes.push(url), write()),
    } },
    { provide: ToastService, useValue: { success: () => {}, error: (m: unknown) => errors.push(m), info: () => {} } },
    { provide: Router, useValue: { navigate: () => {} } },
  ] });
  const component = TestBed.runInInjectionContext(() => new TaskEdit());
  if (opts.id !== undefined) (component as any).taskDetailId = () => opts.id;
  component.ngOnInit();
  return { component, errors, writes };
}

describe('TaskEdit when the task cannot be read', () => {
  /**
   * A failed read toasted, then showed an empty "Edit task" form whose Save would post an update
   * with no taskDetailId (UI audit, Medium). The page keeps the reason and offers Try again.
   */
  it('keeps the reason instead of showing a blank form, for a refusal', () => {
    const { component } = editor(() => of({ status: 'ERROR', message: 'No task 7714 here.' }), { id: '7714' });
    expect(component.loading()).toBe(false);
    expect(component.loadError()).toBe('No task 7714 here.');
  });

  it('keeps a reason for a failed request too', () => {
    const { component } = editor(() => throwError(() => ({ error: {} })), { id: '7714' });
    expect(component.loadError()).toBeTruthy();
  });

  it('will not save a form it never filled', () => {
    const { component, writes } = editor(() => of({ status: 'ERROR', message: 'nope' }), { id: '7714' });
    component.form.patchValue({ taskName: 'x', sourceTaskTypeId: 10, taskPayload: '<x/>' });
    expect(component.form.valid).toBe(true);
    component.save();
    expect(writes).toEqual([]);
  });

  it('reads again on Try again, and clears the reason once it can', () => {
    let answer: unknown = { status: 'ERROR', message: 'nope' };
    const { component } = editor(() => of(answer), { id: '7714' });
    answer = { status: API_SUCCESS, data: TASK };
    component.retryLoad();
    expect(component.loadError()).toBe('');
    expect(component.form.get('taskDetailId')!.value).toBe(7714);
  });
});

describe('TaskEdit refusals with no message', () => {
  it('says something when a save is refused', () => {
    const { component, errors } = editor(() => of({}), { write: () => of({ status: 'ERROR', message: '' }) });
    component.form.patchValue({ taskName: 'x', sourceTaskTypeId: 10, taskPayload: '<x/>' });
    component.save();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeTruthy();
  });

  it('says something when the topics are refused', () => {
    const { component, errors } = editor(() => of({}), { topics: () => of({ status: 'ERROR', message: '' }) });
    component.pickProfile('5');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeTruthy();
  });
});
