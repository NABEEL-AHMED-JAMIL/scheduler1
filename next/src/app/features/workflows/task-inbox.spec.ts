import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { TaskInbox, INBOX_LIST_LIMIT } from './task-inbox';
import { TaskCountService } from './task-count.service';
import { InboxTask, TaskDetail, WorkflowsApi } from './workflows.api';
import { compactTime, dropOwnStep, exactTime, historyLines, relativeTime, shortTime } from './history';

/**
 * The Task inbox (MIG-276): what waits for the reader, the request and its history in words, and the decisions --
 * a rejection that needs a reason asks for one before anything is sent; the reader's own request is not theirs to
 * decide; Pass on sends the task to a colleague by name.
 */
const TASK: InboxTask = {
  id: 501, instanceId: 1001, stepKey: 'manager', stepType: 'approval', name: 'Manager approves', workflowName: 'Purchase approval',
  requestTitle: 'Laptop for Sam', state: 'Open', assigneeKind: 'user', assigneeUserId: 4537, dueAt: '2026-10-02T16:00:00', overdue: false,
} as InboxTask;
const DETAIL = {
  ...TASK, requestedBy: 4597, requestState: 'Running', rejectNeedsComment: true, subject: { amount: 1200, vendorName: 'Acme' },
  tasks: [{ stepKey: 'manager', name: 'Manager approves' }],
  history: [
    { id: 1, type: 'Started', actor: 4597, at: '2026-09-30T09:00:00' },
    { id: 2, type: 'TaskOpened', stepKey: 'manager', detail: '{"userId":4537,"due":"2026-10-02T16:00:00"}', at: '2026-09-30T09:00:01' },
  ],
} as unknown as TaskDetail;

function screenWith(detail: TaskDetail = DETAIL) {
  const api = {
    mine: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [TASK] })),
    groups: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    done: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    requests: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    task: vi.fn(() => of({ status: 'SUCCESS', message: '', data: detail })),
    colleagues: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [
      { userId: 4597, fullName: 'Alex', username: 'alex@x.io' }, { userId: 4600, fullName: 'Sam', username: 'sam@x.io' }] })),
    act: vi.fn(() => of({ status: 'SUCCESS', message: 'Approved.', data: {} })),
    reassign: vi.fn(() => of({ status: 'SUCCESS', message: '', data: {} })),
  };
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: WorkflowsApi, useValue: api },
      { provide: ToastService, useValue: toast },
      { provide: TaskCountService, useValue: { refresh: vi.fn(), count: signal(1), overdue: signal(0), mine: signal(0), groups: signal(0) } },
      { provide: AuthService, useValue: { canOpen: () => true, user: signal({ appUserId: 4537 }) } },
    ],
  });
  const fixture = TestBed.createComponent(TaskInbox);
  fixture.detectChanges();
  return { api, toast, fixture, screen: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('Task inbox', () => {
  it('opens the first task with its request, in words, and the decisions', () => {
    const { api, el } = screenWith();
    expect(api.task).toHaveBeenCalledWith(501);
    const detail = el.querySelector('[data-test="task-detail"]')!.textContent!.replace(/\s+/g, ' ');
    expect(detail).toContain('Vendor name');
    expect(detail).toContain('Acme');
    expect(detail).toContain('Requested by Alex');
    // The task's own lines drop its name: the heading already says it.
    expect(detail).toContain('Waiting for you · due ' + shortTime('2026-10-02T16:00:00'));
    expect(detail).not.toContain('Manager approves: waiting');
    expect(el.querySelector('[data-test="decisions"]')!.textContent).toContain('Approve');
  });

  it('reads a yes/no field as Yes or No and a username as the person\'s name (UI review U10, U14)', () => {
    const { screen } = screenWith();
    expect(screen.fields({ infected: false, signed: 'true', submittedBy: 'alex@x.io', patient: 'SYN-001' })).toEqual([
      { label: 'Infected', value: 'No' }, { label: 'Signed', value: 'Yes' }, { label: 'Submitted by', value: 'Alex' },
      { label: 'Patient', value: 'SYN-001' }]);
    expect(screen.fields({ submissionId: 1005 })).toEqual([{ label: 'Submission ID', value: '1005' }]);
  });

  it('asks for a reason before a rejection that needs one', () => {
    const { api, toast, screen } = screenWith();
    screen.decide('reject');
    expect(api.act).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
    screen.comment.set('Over budget');
    screen.decide('reject');
    expect(api.act).toHaveBeenCalledWith(501, 'reject', 'Over budget', expect.stringMatching(/^501:reject:/));
  });

  it('passes a task on to a colleague by name', () => {
    const { api, toast, screen } = screenWith();
    screen.passTo.set(4600);
    screen.passOn();
    expect(api.reassign).toHaveBeenCalledWith(501, 4600, null, expect.stringMatching(/^501:pass:/));
    expect(toast.success).toHaveBeenCalledWith('Passed to Sam.');
  });

  it('does not offer the requester a decision on their own request', () => {
    const { el } = screenWith({ ...DETAIL, requestedBy: 4537 } as TaskDetail);
    expect(el.querySelector('[data-test="decisions"]')).toBeNull();
    expect(el.textContent).toContain('This is your own request');
  });
});

describe('Task history in words', () => {
  it('names both people when someone decides for another', () => {
    const names = (id: number | null | undefined) => ({ 4537: 'Nabeel', 4597: 'Alex' } as Record<number, string>)[id ?? 0] ?? 'someone';
    const lines = historyLines([
      { id: 3, type: 'Approved', stepKey: 'manager', actor: 4537, onBehalfOf: 4597, detail: '{"comment":"ok"}', at: '2026-09-30T10:00:00' },
      { id: 4, type: 'Ended', detail: '{"state":"Approved"}', at: '2026-09-30T10:00:01' },
    ] as never, names, () => 'Manager approves');
    expect(lines.map(l => [l.text, l.tone, l.comment])).toEqual([
      ['Manager approves: approved by Nabeel (for Alex)', 'ok', 'ok'],
      ['Request approved', 'ok', undefined],
    ]);
    // A byline only where a person acted; the request's end is the workflow's.
    expect(lines.map(l => l.actor)).toEqual(['Nabeel (for Alex)', undefined]);
    // Naive times are Chicago wall-clock; offset times are taken at their word.
    expect(shortTime('2026-10-01T08:05:00', 'America/Chicago')).toBe('1 Oct, 08:05');
    expect(shortTime('2026-09-30T22:20:57.914+00:00', 'America/Chicago')).toBe('30 Sep, 17:20');
    expect(shortTime('2026-09-30T22:20:57.914+00:00', 'UTC')).toBe('30 Sep, 22:20');
  });
});

describe('The task\'s own history lines', () => {
  it('drops the task\'s name and its colon from the start of a line, and only there', () => {
    const lines = [
      { id: 1, at: '', tone: 'now', text: 'Alex approves the visit: went to the administrators' },
      { id: 2, at: '', tone: 'ok', text: 'Requested by Sam' },
      { id: 3, at: '', tone: 'plain', text: 'Nurse checks: Alex approves the visit: no' },
      { id: 4, at: '', tone: 'plain', text: 'Alex approves the visit again' },
    ] as never;
    expect(dropOwnStep(lines, 'Alex approves the visit').map(l => l.text)).toEqual([
      'Went to the administrators', 'Requested by Sam', 'Nurse checks: Alex approves the visit: no', 'Alex approves the visit again']);
    expect(dropOwnStep(lines, null)).toBe(lines);
  });

  it('says when relative to now, 24-hour, with the exact time for the tooltip', () => {
    const now = Date.parse('2026-10-06T19:00:00Z'); // 14:00 in Chicago, a Tuesday
    const tz = 'America/Chicago';
    expect(relativeTime('2026-10-06T13:59:40', now, tz)).toBe('just now');
    expect(relativeTime('2026-10-06T13:35:00', now, tz)).toBe('25 min ago');
    expect(relativeTime('2026-10-06T09:10:00', now, tz)).toBe('4 h ago');
    expect(relativeTime('2026-10-05T21:34:00', now, tz)).toBe('Yesterday, 21:34');
    expect(relativeTime('2026-10-07T08:00:00', now, tz)).toBe('Tomorrow, 08:00');
    expect(relativeTime('2026-09-30T08:05:00', now, tz)).toBe('30 Sep, 08:05');
    expect(exactTime('2026-10-06T14:05:00', tz)).toBe('Tue 6 Oct 2026, 14:05');
    expect(exactTime('2026-10-06T19:05:00+00:00', tz)).toBe('Tue 6 Oct 2026, 14:05');
    expect(compactTime('2026-10-06T08:00:00', now, tz)).toBe('08:00');
    expect(compactTime('2026-10-05T08:00:00', now, tz)).toBe('Yesterday');
    expect(compactTime('2026-10-05T08:00:00', now, tz, true)).toBe('08:00');
    expect(compactTime('2026-10-07T08:00:00', now, tz)).toBe('Tomorrow');
    expect(compactTime('2026-10-02T08:00:00', now, tz)).toBe('Fri');
    expect(compactTime('2026-09-20T08:00:00', now, tz)).toBe('20 Sep');
  });
});

describe('P2 #31 and #36: the inbox at the edges', () => {
  it('reads a full tab from the count service, or "200+", never a silent 200', () => {
    const { screen } = screenWith();
    expect(screen.tabCount(12, 0)).toBe('12');
    expect(screen.tabCount(INBOX_LIST_LIMIT, 0)).toBe('200+');
    expect(screen.tabCount(INBOX_LIST_LIMIT, 1240)).toBe('1,240');
  });

  it('explains a request of one\'s own in a workspace with no one else to approve it', () => {
    const { screen } = screenWith();
    expect(screen.aloneInWorkspace()).toBe(false);
    screen.colleagues.set([{ userId: 4537, fullName: 'Me', username: 'me@x.io' } as never]);
    expect(screen.aloneInWorkspace()).toBe(true);
  });
});
