import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { JobEdit } from './job-edit';
import { ToastService } from '../../../shared/ui/toast.service';

/**
 * The schedule editor's design (owner, 2026-10-06): how it runs as cards, how often as one row of choices, the timetable
 * as a sentence, and beside it the next runs the scheduler itself works out (sourceJob.json/schedulePreview).
 */
function editor(preview: unknown = { status: 'SUCCESS', data: { runs: ['2026-10-08T02:00', '2026-10-09T02:00'], ends: false } }) {
  const posts: { url: string; body: any }[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: {
      post: (url: string, body: any) => { posts.push({ url, body }); return of(url.endsWith('/schedulePreview') ? preview : { status: 'SUCCESS', data: [] }); },
      get: () => of({ status: 'SUCCESS', data: null }),
    } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    { provide: Router, useValue: { navigate: () => {} } },
  ] });
  const component = TestBed.runInInjectionContext(() => new JobEdit());
  component.ngOnInit();
  return { component, posts, previews: () => posts.filter(p => p.url.endsWith('/schedulePreview')) };
}

describe('JobEdit, the schedule editor\'s design', () => {
  it('asks the scheduler for the next runs a moment after the timetable changes, and lists them', () => {
    vi.useFakeTimers();
    try {
      const { component, previews } = editor();
      vi.advanceTimersByTime(400);
      expect(previews()).toHaveLength(1);
      expect(previews()[0].body).toMatchObject({ frequency: 'Daily', intervalValue: '1', startTime: '00:00' });
      expect(component.preview().runs).toEqual(['2026-10-08T02:00', '2026-10-09T02:00']);
      component.scheduler.patchValue({ intervalValue: '2' });
      component.scheduler.patchValue({ intervalValue: '3' });
      vi.advanceTimersByTime(400);
      expect(previews()).toHaveLength(2);
      expect(previews()[1].body.intervalValue).toBe('3');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads a run as Chicago wall clock: the weekday, the day and the time', () => {
    const { component } = editor();
    expect(component.runDay('2026-10-08T02:00')).toBe('Thu');
    expect(component.runDate('2026-10-08T02:00')).toContain('Oct');
    expect(component.runTime('2026-10-08T02:00')).toBe('02:00');
  });

  it('says why there are no runs instead of an empty list', () => {
    vi.useFakeTimers();
    try {
      const { component } = editor({ status: 'ERROR', message: 'SourceJob schedule: the expression has 4 fields, not 5.' });
      vi.advanceTimersByTime(400);
      expect(component.preview().error).toBe('the expression has 4 fields, not 5.');
      component.setFrequency('Weekly');
      vi.advanceTimersByTime(400);
      expect(component.preview().error).toBe('Pick at least one day to see the runs.');
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks nothing for a schedule only started by hand', () => {
    vi.useFakeTimers();
    try {
      const { component, previews } = editor();
      vi.advanceTimersByTime(400);
      component.setExecution('Manual');
      vi.advanceTimersByTime(400);
      expect(previews()).toHaveLength(1);
      expect(component.preview().runs).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('picks how often from the row of choices, and the sentence says "every 2 days" or "every 1 day"', () => {
    const { component } = editor();
    component.setFrequency('Weekly');
    expect(component.scheduler.get('frequency')!.value).toBe('Weekly');
    expect(component.unit()).toBe('week');
    component.scheduler.patchValue({ intervalValue: '2' });
    expect(component.unit()).toBe('weeks');
    component.setFrequency('Mint');
    expect(component.timeWord()).toBe('from');
  });

  it('switches the state beside the save button, and opens Advanced when one of its fields needs fixing', () => {
    const { component } = editor();
    component.setActive(false);
    expect(component.form.get('jobStatus')!.value).toBe('Inactive');
    component.form.patchValue({ jobName: 'Nightly', taskDetailId: 7, priority: 12 });
    expect(component.advancedOpen()).toBe(false);
    component.save();
    expect(component.advancedOpen()).toBe(true);
  });
});
