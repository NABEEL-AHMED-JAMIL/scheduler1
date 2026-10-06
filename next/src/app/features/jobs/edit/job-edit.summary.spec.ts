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

  /** A time input with a step, or a value read back from the API, can carry seconds nobody set. */
  it('writes the time without seconds', () => {
    const edit = editor();
    edit.scheduler.patchValue({ startTime: '09:30:00' });
    expect(edit.summary()).toBe('Every 1 day at 09:30.');
  });

  it('follows the end date', () => {
    const edit = editor();
    edit.scheduler.patchValue({ endDate: '2026-12-31' });
    expect(edit.summary()).toBe('Every 1 day at 00:00, until 31 Dec 2026 inclusive.');
  });

  it('follows the day of the month', () => {
    const edit = editor();
    edit.scheduler.patchValue({ frequency: 'Monthly' });
    // The day is optional: without one the job keeps the start date's day (ProcessTimeUtil's
    // plusMonths), so "pick a day" asked for something nobody has to give (UI review jobs#20).
    expect(edit.summary()).not.toContain('pick a day');
    expect(edit.summary()).toBe('Every 1 month at 00:00, on the start date\'s day.');
    edit.scheduler.patchValue({ startDate: '2026-10-07' });
    expect(edit.summary()).toBe('Every 1 month on day 7 (the start date\'s day) at 00:00.');
    edit.scheduler.patchValue({ dayOfMonth: 15 });
    expect(edit.summary()).toBe('Every 1 month on day 15 at 00:00.');
  });

  /** A job read back from the server carries the interval as a number. */
  it('reads an interval of 1 as singular whether it arrives as text or a number', () => {
    const edit = editor();
    edit.scheduler.patchValue({ intervalValue: 1 });
    expect(edit.summary()).toBe('Every 1 day at 00:00.');
  });

  /** An interval the field itself refuses was described as "Every 1" (UI review jobs#20). */
  it('describes no schedule for an interval below one or left empty', () => {
    const edit = editor();
    for (const bad of ['0', '', '-2', '1.5']) {
      edit.scheduler.patchValue({ intervalValue: bad });
      expect(edit.summary()).not.toContain('Every 1');
      expect(edit.summary()).toBe('Set how often it repeats to see the schedule.');
    }
  });

  /** A past end date saved quietly, and the job then never ran again (UI review jobs#20). */
  it('flags an end date that has already passed, and only that', () => {
    const edit = editor();
    expect(edit.endPassed()).toBe(false);
    edit.scheduler.patchValue({ endDate: '2020-01-01' });
    expect(edit.endPassed()).toBe(true);
    edit.scheduler.patchValue({ endDate: '2999-12-31' });
    expect(edit.endPassed()).toBe(false);
  });
});
