import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { JobEdit } from './job-edit';
import { ToastService } from '../../../shared/ui/toast.service';

/**
 * The sentence under the schedule restates it so a person can check the timetable before saving.
 * It was a computed() reading plain form values, which are not signals, so it only moved when
 * the frequency (the one field mirrored into a signal) moved: change the interval, the time or
 * the end date and it went on describing the schedule as it was.
 */
function editor() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { post: () => of({ status: 'SUCCESS', data: [] }), get: () => of({ status: 'SUCCESS', data: null }) } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    { provide: Router, useValue: { navigate: () => {} } },
  ] });
  const component = TestBed.runInInjectionContext(() => new JobEdit());
  component.ngOnInit();
  return component;
}

describe('JobEdit schedule summary', () => {
  it('follows the interval and the time', () => {
    const edit = editor();
    expect(edit.summary()).toBe('Every 1 day at 00:00.');

    edit.scheduler.patchValue({ intervalValue: '3', startTime: '02:30' });

    expect(edit.summary()).toBe('Every 3 days at 02:30.');
  });

  it('follows the end date', () => {
    const edit = editor();
    edit.scheduler.patchValue({ endDate: '2026-12-31' });
    expect(edit.summary()).toBe('Every 1 day at 00:00, until 2026-12-31 inclusive.');
  });

  it('follows the day of the month', () => {
    const edit = editor();
    edit.scheduler.patchValue({ frequency: 'Monthly' });
    expect(edit.summary()).toContain('pick a day');
    edit.scheduler.patchValue({ dayOfMonth: 15 });
    expect(edit.summary()).toBe('Every 1 month on day 15 at 00:00.');
  });

  /** A job read back from the server carries the interval as a number. */
  it('reads an interval of 1 as singular whether it arrives as text or a number', () => {
    const edit = editor();
    edit.scheduler.patchValue({ intervalValue: 1 });
    expect(edit.summary()).toBe('Every 1 day at 00:00.');
  });
});
