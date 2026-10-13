import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { TaskInbox } from './task-inbox';
import { TaskCountService } from './task-count.service';
import { InboxTask, TaskDetail, WorkflowsApi } from './workflows.api';

/**
 * UX review 2026-10-12 (W1): the inbox opens on the tab with work. A reviewer whose tasks all wait in their group's pool
 * opened on an empty "Waiting for me" while My groups held five.
 */
const GROUP_TASK = {
  id: 1123, instanceId: 1117, stepKey: 'review', stepType: 'approval', name: 'Review the run', workflowName: 'Pipeline run review',
  requestTitle: 'Review run #8214: Patient 360 (daily)', state: 'Open', assigneeKind: 'group', assigneeValue: '1063',
} as InboxTask;
const MINE_TASK = { ...GROUP_TASK, id: 900, assigneeKind: 'user', assigneeUserId: 4641 } as InboxTask;

function inbox(mine: InboxTask[], groups: InboxTask[]) {
  const detail = (id: number) => ({ ...(id === 900 ? MINE_TASK : GROUP_TASK), subject: {}, history: [], tasks: [] }) as unknown as TaskDetail;
  const api = {
    mine: vi.fn(() => of({ status: 'SUCCESS', message: '', data: mine })),
    groups: vi.fn(() => of({ status: 'SUCCESS', message: '', data: groups })),
    done: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    requests: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    task: vi.fn((id: number) => of({ status: 'SUCCESS', message: '', data: detail(id) })),
    colleagues: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: WorkflowsApi, useValue: api },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: TaskCountService, useValue: { refresh: vi.fn(), count: signal(1), overdue: signal(0), mine: signal(0), groups: signal(0), done: signal(0), requests: signal(0) } },
      { provide: AuthService, useValue: { canOpen: () => true, user: signal({ appUserId: 4641, tenantId: 2960 }) } },
    ],
  });
  const fixture = TestBed.createComponent(TaskInbox);
  fixture.detectChanges();
  return { api, screen: fixture.componentInstance, fixture, el: fixture.nativeElement as HTMLElement };
}

describe('Task inbox opens where the work is', () => {
  it('opens My groups on its first task when nothing is assigned to the reader by name', () => {
    const { api, screen } = inbox([], [GROUP_TASK]);
    expect(screen.tab()).toBe('groups');
    expect(api.task).toHaveBeenCalledWith(1123);
  });

  it('stays on Waiting for me when something is', () => {
    const { screen } = inbox([MINE_TASK], [GROUP_TASK]);
    expect(screen.tab()).toBe('mine');
  });

  it('does not move the reader on a Refresh after they chose the empty tab, and leads there in words', () => {
    const { screen, fixture, el } = inbox([], [GROUP_TASK]);
    screen.pick('mine');
    screen.load();
    fixture.detectChanges();
    expect(screen.tab()).toBe('mine');
    expect(el.querySelector('[data-test="see-groups"]')!.textContent).toContain('See what waits for your groups');
  });

  it('says nothing waits when neither tab has work', () => {
    const { screen, el, fixture } = inbox([], []);
    fixture.detectChanges();
    expect(screen.tab()).toBe('mine');
    expect(el.textContent).toContain('Nothing is waiting for you.');
  });
});
