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
import { stepLabel } from './history';

/**
 * Owner 2026-10-27, task 2769 (Summit's Write-off, a person's own request): its subject is a plain text -- it read one
 * character a field (0: P, 1: e, 2: r ...) -- and its steps are named only by their keys ("manager", "large", "record"),
 * which the subtitle and the history showed as they are.
 */
const TASK = {
  id: 2769, instanceId: 2189, stepKey: 'manager', stepType: 'approval', name: 'manager', workflowName: 'Write-off',
  requestTitle: 'Perf cycle 157 (synthetic)', state: 'Approved', assigneeKind: 'role', assigneeValue: 'TENANT_ADMIN', overdue: false,
} as InboxTask;
const DETAIL = { ...TASK, requestedBy: 4700, requestState: 'Approved', rejectNeedsComment: false,
  subject: 'Perf cycle (synthetic) for Write-off approval',
  tasks: [{ id: 2769, stepKey: 'manager', name: 'manager', state: 'Approved' }],
  history: [
    { id: 1, type: 'Started', actor: 4700, at: '2026-10-27T23:57:00+00:00' },
    { id: 2, stepKey: 'manager', type: 'StepEntered', detail: '{"name": "manager", "type": "approval"}', at: '2026-10-27T23:57:00+00:00' },
    { id: 3, stepKey: 'manager', type: 'Approved', actor: 4701, at: '2026-10-28T00:28:00+00:00' },
    { id: 4, stepKey: 'large', type: 'StepEntered', detail: '{"name": "large", "type": "condition"}', at: '2026-10-28T00:28:00+00:00' },
    { id: 5, stepKey: 'large', type: 'ConditionFalse', detail: '{"next": "record"}', at: '2026-10-28T00:28:00+00:00' },
    { id: 6, stepKey: 'record', type: 'StepEntered', detail: '{"type": "save_dataset"}', at: '2026-10-28T00:28:00+00:00' },
    { id: 7, stepKey: 'record', type: 'DatasetSaved', detail: '{"dataset": "write-offs"}', at: '2026-10-28T00:28:00+00:00' },
  ],
} as unknown as TaskDetail;

function inbox() {
  const api = {
    mine: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    teams: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    done: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [TASK] })),
    requests: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    task: vi.fn(() => of({ status: 'SUCCESS', message: '', data: DETAIL })),
    request: vi.fn(() => of({ status: 'SUCCESS', message: '', data: null })),
    colleagues: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(), provideRouter([]),
      { provide: WorkflowsApi, useValue: api },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: TaskCountService, useValue: { refresh: vi.fn(), count: signal(0), overdue: signal(0), mine: signal(0), teams: signal(0), done: signal(1), requests: signal(0) } },
      { provide: AuthService, useValue: { canOpen: () => true, user: signal({ appUserId: 4701, tenantId: 1013 }) } },
    ],
  });
  const fixture = TestBed.createComponent(TaskInbox);
  fixture.componentInstance.openTask(2769);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('A request whose subject is a plain text, and steps named by their keys', () => {
  it('reads the subject as one Details paragraph, never one character a field', () => {
    const el = inbox();
    const rows = [...el.querySelectorAll('[data-test="request-fields"] > div')];
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('dt')!.textContent).toBe('Details');
    expect(rows[0].querySelector('.inbox-long')!.textContent).toBe('Perf cycle (synthetic) for Write-off approval');
    expect(rows[0].classList).toContain('is-wide');
  });

  it('names a step by its label, else its key in words, in the subtitle and the history', () => {
    const el = inbox();
    expect(el.querySelector('.inbox-detail-sub')!.textContent).toBe('Manager · Write-off');
    const lines = [...el.querySelectorAll('[data-test="task-history"] .inbox-timeline-text')].map(l => l.textContent);
    expect(lines).toContain('Large? No');
    expect(lines).toContain('Record: saved to dataset write-offs');
    expect(lines.join(' ')).not.toMatch(/\b(manager|large|record):/);
  });

  it('keeps a real name as it is, and words a key that is only a key', () => {
    expect(stepLabel('A senior nurse decides', 'senior')).toBe('A senior nurse decides');
    expect(stepLabel('manager', 'manager')).toBe('Manager');
    expect(stepLabel(null, 'large_spend')).toBe('Large spend');
    expect(stepLabel('', 'report-senior')).toBe('Report senior');
    expect(stepLabel('High priority?', 'priority')).toBe('High priority?');
  });
});
