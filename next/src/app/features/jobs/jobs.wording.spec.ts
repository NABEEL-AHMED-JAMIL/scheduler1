import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { EMPTY, of } from 'rxjs';
import { Jobs } from './jobs';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { JobEventsService } from '../../core/socket/job-events.service';

/**
 * MIG-324: Pipelines › Schedules listed "Jobs (0 of 0)" and said "No jobs yet." under a title, a menu entry and a
 * New schedule button that all say schedule; the empty state now also says what a schedule does.
 */
function screen(locked: boolean) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', data: [] }), request: () => EMPTY } },
    { provide: Dialog, useValue: { open: () => ({ closed: of(false) }) } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    { provide: Router, useValue: { navigate: () => {} } },
    { provide: AuthService, useValue: { user: signal(null), builderLocked: () => locked, canManageTasks: () => !locked } },
    { provide: JobEventsService, useValue: { events: EMPTY, connected: signal(false) } },
  ] });
  return TestBed.runInInjectionContext(() => new Jobs());
}

describe('Schedules list wording (MIG-324)', () => {
  it('says what a schedule does when there is none', () => {
    expect(screen(false).emptyMessage()).toBe(
      'No schedules yet. New schedule runs a pipeline on a timetable, when a file arrives in the inbox, or when you say so.');
  });

  it('only says there is none where the workspace\'s schedules are our team\'s to make', () => {
    expect(screen(true).emptyMessage()).toBe('No schedules yet.');
  });

  it('says schedules when the filters hide every row', () => {
    const jobs = screen(false);
    (jobs as any).hasFilters = () => true;
    expect(jobs.emptyMessage()).toBe('No schedules match the current filters.');
  });
});
