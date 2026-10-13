import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { Tasks } from './tasks';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';

/**
 * MIG-324: Pipelines › Pipelines listed "Tasks (0 of 0)" and said "No tasks yet." -- a third word for the thing the
 * menu, the title and the New pipeline button call a pipeline, and an empty state that did not say what to do next.
 */
function screen(canManage: boolean) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get: () => of({}), post: () => of({}), put: () => of({}) } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    { provide: Dialog, useValue: { open: () => ({ closed: of(undefined) }) } },
    { provide: AuthService, useValue: { user: () => null, canManageTasks: () => canManage } },
  ] });
  return TestBed.runInInjectionContext(() => new Tasks());
}

describe('Pipelines list wording (MIG-324)', () => {
  it('tells a builder of an empty workspace how the first pipeline is made', () => {
    expect(screen(true).emptyMessage()).toBe('No pipelines yet. New pipeline makes one: pick a topic and its registry task, then build its steps.');
  });

  it('tells a member who makes them', () => {
    expect(screen(false).emptyMessage()).toBe('No pipelines yet. A workspace administrator makes them.');
  });

  it('says pipelines when the filters hide every row', () => {
    const tasks = screen(true);
    (tasks as any).hasFilters = () => true;
    expect(tasks.emptyMessage()).toBe('No pipelines match the filters.');
  });
});
