import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { TaskInbox } from './task-inbox';
import { TaskCountService } from './task-count.service';
import { InboxTask, RequestRow, TaskDetail, WorkflowsApi } from './workflows.api';

/**
 * The Task inbox's design (owner, 2026-10-06: "I don't like the design for inbox"; long lists are the main pain): real
 * tabs with counts, a list that reads by the request's title under day headers with its search and filters on top, the
 * decisions straight under the task's title, the request's values by their shape, a way back below 1024 px, and the
 * keyboard. Below 1024 px is CSS (data-pane); what these pin is the state behind it.
 */
const task = (id: number, title: string, extra: Partial<InboxTask> = {}): InboxTask => ({
  id, instanceId: id + 500, stepKey: 'approve', stepType: 'approval', name: 'Alex approves the visit', workflowName: 'MIG-279 visit approval',
  requestTitle: title, state: 'Open', assigneeKind: 'role', assigneeValue: 'TENANT_ADMIN', dueAt: '2099-10-07T21:34:00', overdue: false, ...extra,
} as InboxTask);

const MINE = [
  task(11, 'Visit check #1005'),
  task(12, 'Visit check #1016', { workflowName: 'Purchase approval', name: 'Manager approves' }),
  task(13, 'Visit check #1048', { overdue: true, dueAt: '2026-10-01T09:00:00' }),
];

const detailOf = (t: InboxTask): TaskDetail => ({
  ...t, requestedBy: 4597, requestState: 'Running', rejectNeedsComment: true,
  subject: { doses: '[{"mg":500,"drug":"Amoxicillin"}]', photo: 'heel.png', patient: 'SYN-001', infected: true },
  tasks: [{ stepKey: 'approve', name: t.name }],
  history: [
    { id: 1, type: 'Started', actor: 4597, at: '2026-10-06T09:00:00' },
    { id: 2, type: 'AssignedToAdministrators', stepKey: 'approve', detail: '{"reason":"No manager on file"}', at: '2026-10-06T09:00:01' },
  ],
} as unknown as TaskDetail);

const REQUESTS: RequestRow[] = [
  { id: 71, workflow: 'visit', workflowName: 'MIG-279 visit approval', version: 2, subjectType: 'form', subjectId: '1', title: 'Visit check #1005',
    state: 'Running', startedAt: '2026-10-06T09:00:00' },
];

function screen(link?: number) {
  const api = {
    mine: vi.fn(() => of({ status: 'SUCCESS', message: '', data: MINE })),
    groups: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    done: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [task(90, 'Visit check #1069', { state: 'ChangesRequested', actedAt: '2026-10-06T11:31:00' })] })),
    requests: vi.fn(() => of({ status: 'SUCCESS', message: '', data: REQUESTS })),
    task: vi.fn((id: number) => of({ status: 'SUCCESS', message: '', data: detailOf(MINE.find(t => t.id === id) ?? MINE[0]) })),
    request: vi.fn((id: number) => of({ status: 'SUCCESS', message: '', data: { ...REQUESTS[0], id, subject: { amount: 3 }, tasks: [], history: [] } })),
    colleagues: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [{ userId: 4597, fullName: 'Alex', username: 'alex@x.io' }] })),
    act: vi.fn(() => of({ status: 'SUCCESS', message: 'Approved.', data: {} })),
    reassign: vi.fn(() => of({ status: 'SUCCESS', message: '', data: {} })),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      ...(link ? [{ provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ task: String(link) }), routeConfig: { path: 'workflows/inbox' } } } }] : []),
      { provide: WorkflowsApi, useValue: api },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: TaskCountService, useValue: { refresh: vi.fn(), count: signal(3), overdue: signal(1), mine: signal(3), groups: signal(0), done: signal(1), requests: signal(1) } },
      { provide: AuthService, useValue: { canOpen: () => true, user: signal({ appUserId: 4537, tenantId: 2924 }) } },
    ],
  });
  const fixture = TestBed.createComponent(TaskInbox);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const text = (sel: string) => (el.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return { api, fixture, inbox: fixture.componentInstance, el, text, render: () => fixture.detectChanges() };
}

describe('Task inbox, the design', () => {
  it('names its tabs as real tabs with counts, and keeps their test hooks', () => {
    const { el, text } = screen();
    const tabs = [...el.querySelectorAll('[role="tablist"] .tab')];
    expect(tabs.map(t => t.getAttribute('data-test'))).toEqual(['tab-mine', 'tab-groups', 'tab-done', 'tab-requests']);
    expect(text('[data-test="tab-mine"]')).toBe('Waiting for me 3');
    expect(text('[data-test="tab-requests"]')).toBe('My requests 1');
    expect(el.querySelector('[data-test="tab-mine"]')!.classList).toContain('tab-active');
  });

  it('reads a row by the request\'s title first, step and workflow under it, under a day header with its count', () => {
    const { el, text } = screen();
    const row = el.querySelector('[data-task="12"]')!;
    expect(row.querySelector('.inbox-row-title')!.textContent).toBe('Visit check #1016');
    expect(row.querySelector('.inbox-row-sub')!.textContent).toBe('Manager approves · Purchase approval');
    const headers = [...el.querySelectorAll('[data-test="day-group"]')].map(h => [...h.children].map(c => c.textContent).join(' '));
    expect(headers).toEqual(['Later 2', 'Overdue 1']);
    expect(el.querySelector('[data-task="13"]')!.classList).toContain('is-crit');
    expect(el.querySelector('[data-task="11"]')!.getAttribute('aria-current')).toBe('true');
    expect(text('[data-test="shown-line"]')).toBe('3 tasks');
  });

  it('filters the loaded list by search, status and workflow, says how many show, and clears', () => {
    const { el, inbox, render, text } = screen();
    inbox.query.set('1016 manager');
    render();
    expect([...el.querySelectorAll('[data-task]')].map(r => r.getAttribute('data-task'))).toEqual(['12']);
    expect(text('[data-test="shown-line"]')).toBe('1 of 3 shown');
    inbox.query.set('');
    inbox.statusFilter.set('Overdue');
    render();
    expect([...el.querySelectorAll('[data-task]')].map(r => r.getAttribute('data-task'))).toEqual(['13']);
    expect(inbox.statusChoices()).toEqual([{ value: 'Pending', count: 2 }, { value: 'Overdue', count: 1 }]);
    expect(inbox.workflowChoices().map(c => c.value)).toEqual(['MIG-279 visit approval', 'Purchase approval']);
    (el.querySelector('[data-test="clear-filters"]') as HTMLButtonElement).click();
    render();
    expect(el.querySelectorAll('[data-task]')).toHaveLength(3);
    expect(el.querySelector('[data-test="clear-filters"]')).toBeNull();
  });

  it('puts the decisions straight under the task\'s title, with the rule about comments in sight', () => {
    const { el } = screen();
    const detail = el.querySelector('[data-test="task-detail"]')!;
    const order = [...detail.children].map(c => c.getAttribute('data-test') ?? c.className);
    expect(order.indexOf('action-bar')).toBe(order.indexOf('inbox-detail-head') + 1);
    expect(detail.querySelector('.inbox-detail-title')!.textContent).toBe('Visit check #1005');
    expect(detail.querySelector('.inbox-detail-head')!.textContent).toContain('With Administrators');
    expect(detail.querySelector('[data-test="decision-rule"]')!.textContent).toContain('Rejecting needs a comment');
    expect([...detail.querySelectorAll('[data-test="decisions"] button')].map(b => b.textContent!.trim())).toEqual(['Approve', 'Reject', 'Ask for changes', 'Pass on']);
  });

  it('shows the request\'s values by their shape: a table, a file chip, a quiet id, Yes', () => {
    const { el } = screen();
    const kind = (label: string) => [...el.querySelectorAll('[data-test="request-fields"] > div')]
      .find(d => d.querySelector('dt')!.textContent === label)!;
    expect(kind('Doses').getAttribute('data-kind')).toBe('table');
    expect([...kind('Doses').querySelectorAll('th')].map(th => th.textContent)).toEqual(['Mg', 'Drug']);
    expect(kind('Photo').querySelector('.inbox-file')!.textContent!.trim()).toBe('heel.png');
    expect(kind('Photo').querySelector('a')).toBeNull();
    expect(kind('Patient').querySelector('.inbox-id')!.textContent).toBe('SYN-001');
    expect(kind('Infected').querySelector('dd')!.textContent!.trim()).toBe('Yes');
  });

  it('draws the history without the task\'s own name, with who and when, and a reason as a quote', () => {
    const { el } = screen();
    const lines = [...el.querySelectorAll('[data-test="task-history"] > li')];
    expect(lines[1].querySelector('.inbox-timeline-text')!.textContent).toBe('Went to the administrators');
    expect(lines[1].querySelector('blockquote')!.textContent).toBe('No manager on file');
    expect(lines[0].querySelector('.inbox-timeline-meta')!.textContent).toContain('Alex');
    expect(lines[0].querySelector('time')!.getAttribute('title')).toMatch(/^\w{3} \d{1,2} Oct 2026, \d{2}:\d{2}$/);
  });

  it('opens a clicked task over the list below 1024 px, and goes back to the list', () => {
    const { el, inbox, render } = screen();
    expect(el.querySelector('.inbox-split')!.getAttribute('data-pane')).toBe('list');
    (el.querySelector('[data-task="12"]') as HTMLButtonElement).click();
    render();
    expect(inbox.selectedTask()).toBe(12);
    expect(el.querySelector('.inbox-split')!.getAttribute('data-pane')).toBe('detail');
    (el.querySelector('[data-test="back-to-list"]') as HTMLButtonElement).click();
    render();
    expect(el.querySelector('.inbox-split')!.getAttribute('data-pane')).toBe('list');
    expect(inbox.selectedTask()).toBe(12);
  });

  it('moves with Up and Down in the list, j and k anywhere, and / goes to the search', () => {
    const { el, inbox, render, api } = screen();
    const key = (target: Element, k: string) => {
      const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
      target.dispatchEvent(e);
      return e;
    };
    const row = el.querySelector('[data-task="11"]')!;
    expect(key(row, 'ArrowDown').defaultPrevented).toBe(true);
    render();
    expect(inbox.selectedTask()).toBe(12);
    expect(api.task).toHaveBeenLastCalledWith(12);
    key(document.body, 'j');
    render();
    expect(inbox.selectedTask()).toBe(13);
    key(document.body, 'j');
    expect(inbox.selectedTask()).toBe(13);
    key(document.body, 'k');
    expect(inbox.selectedTask()).toBe(12);
    // The arrows outside the list are the page's own; letters typed in a field are the field's.
    expect(key(document.body, 'ArrowDown').defaultPrevented).toBe(false);
    const search = el.querySelector('[data-test="inbox-search"]') as HTMLInputElement;
    key(search, 'j');
    expect(inbox.selectedTask()).toBe(12);
    key(document.body, '/');
    expect(document.activeElement).toBe(search);
  });

  it('goes on to the next task after a decision', () => {
    const { inbox, api } = screen();
    expect(inbox.selectedTask()).toBe(11);
    inbox.decide('approve');
    expect(api.act).toHaveBeenCalledWith(11, 'approve', null, expect.any(String));
    expect(inbox.selectedTask()).toBe(12);
  });

  it('opens a ?task= link on the tab that task is on, a done one on Done', () => {
    const { inbox, el } = screen(90);
    expect(inbox.selectedTask()).toBe(90);
    expect(inbox.tab()).toBe('done');
    expect(el.querySelector('.inbox-split')!.getAttribute('data-pane')).toBe('detail');
  });

  it('gives My requests the same list, and Cancel request in the request\'s header', () => {
    const { el, inbox, render } = screen();
    inbox.pick('requests');
    render();
    expect(el.querySelector('[data-request="71"] .inbox-row-title')!.textContent).toBe('Visit check #1005');
    const head = el.querySelector('[data-test="request-detail"] .inbox-detail-head')!;
    expect(head.querySelector('[data-test="cancel-request"]')).not.toBeNull();
    expect(head.textContent).toContain('Started');
  });
});
