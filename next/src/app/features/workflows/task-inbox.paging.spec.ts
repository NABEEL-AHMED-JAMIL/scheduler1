import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { INBOX_PAGE_SIZE, TaskInbox } from './task-inbox';
import { TaskCountService } from './task-count.service';
import { InboxQuery, InboxTask, RequestRow, TaskDetail, WorkflowsApi } from './workflows.api';

/**
 * The Task inbox past one page (owner: long lists): the service pages each list by cursor, so the list offers Load more
 * while there is more, a search over a part-loaded list says so (and can ask the service instead), the tab counts stay
 * totals, and a decision keeps the pages loaded. The page size here is the service's; what a page holds is the mock's,
 * so a three-row "page" stands in for a hundred.
 */
const task = (id: number, title: string, extra: Partial<InboxTask> = {}): InboxTask => ({
  id, instanceId: id + 500, stepKey: 'approve', stepType: 'approval', name: 'Alex approves the visit', workflowName: 'MIG-279 visit approval (synthetic)',
  requestTitle: title, state: 'Open', assigneeKind: 'role', assigneeValue: 'TENANT_ADMIN', dueAt: '2099-10-07T21:34:00', overdue: false, ...extra,
} as InboxTask);

const PAGE_1 = [task(11, 'MIG-277 visit check (synthetic) #1016'), task(12, 'MIG-277 visit check (synthetic) #1017'), task(13, 'Wound review #1018')];
const PAGE_2 = [task(14, 'MIG-277 visit check (synthetic) #1019'), task(15, 'Wound review #1020')];

const detail = (id: number): TaskDetail => ({ ...[...PAGE_1, ...PAGE_2].find(t => t.id === id)!, requestedBy: 4597, requestState: 'Running',
  rejectNeedsComment: false, subject: {}, tasks: [], history: [] } as unknown as TaskDetail);

const page = <T>(rows: T[], nextCursor: string | null) => of({ status: 'SUCCESS' as const, message: '', data: rows, paging: { nextCursor, limit: INBOX_PAGE_SIZE } });

function screen(options: { mine?: (q: InboxQuery) => ReturnType<typeof page<InboxTask>>; requests?: RequestRow[] } = {}) {
  const api = {
    mine: vi.fn(options.mine ?? ((q: InboxQuery) => q.cursor === 'c2' ? page(PAGE_2, null) : page(PAGE_1, 'c2'))),
    groups: vi.fn(() => page<InboxTask>([], null)),
    done: vi.fn(() => page<InboxTask>([], null)),
    requests: vi.fn(() => page<RequestRow>(options.requests ?? [], null)),
    task: vi.fn((id: number) => of({ status: 'SUCCESS', message: '', data: detail(id) })),
    colleagues: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    act: vi.fn((_id: number, ..._rest: unknown[]) => of({ status: 'SUCCESS', message: 'Approved.', data: {} })),
    reassign: vi.fn(() => of({ status: 'SUCCESS', message: '', data: {} })),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: WorkflowsApi, useValue: api },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: TaskCountService, useValue: { refresh: vi.fn(), count: signal(240), overdue: signal(0), mine: signal(240), groups: signal(0),
        done: signal(0), requests: signal(0) } },
      { provide: AuthService, useValue: { canOpen: () => true, user: signal({ appUserId: 4537 }) } },
    ],
  });
  const fixture = TestBed.createComponent(TaskInbox);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const text = (sel: string) => (el.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const ids = () => [...el.querySelectorAll('[data-task]')].map(r => Number(r.getAttribute('data-task')));
  return { api, inbox: fixture.componentInstance, el, text, ids, render: () => fixture.detectChanges() };
}

describe('Task inbox, paging', () => {
  it('asks for a page at the service\'s size, and offers Load more while the service has more', () => {
    const { api, el, text, ids, render } = screen();
    expect(api.mine).toHaveBeenCalledWith({ cursor: null, limit: 100, q: null });
    expect(ids()).toEqual([11, 12, 13]);
    expect(text('[data-test="shown-line"]')).toBe('3 of 240 tasks');
    expect(text('[data-test="tab-mine"]')).toBe('Waiting for me 240');
    expect(el.querySelector('[data-capped]')).not.toBeNull();

    (el.querySelector('[data-test="load-more"]') as HTMLButtonElement).click();
    render();
    expect(api.mine).toHaveBeenLastCalledWith({ cursor: 'c2', limit: 100, q: null });
    expect(ids()).toEqual([11, 12, 13, 14, 15]);
    // The whole list is in: no Load more, no capped note, and the tab counts what it holds.
    expect(el.querySelector('[data-test="load-more"]')).toBeNull();
    expect(el.querySelector('[data-capped]')).toBeNull();
    expect(text('[data-test="shown-line"]')).toBe('5 tasks');
    expect(text('[data-test="tab-mine"]')).toBe('Waiting for me 5');
  });

  it('says a search looks only at what is loaded, and Search all asks the service', () => {
    const { api, inbox, el, text, ids, render } = screen({
      mine: q => q.q ? page([PAGE_2[1]], null) : (q.cursor === 'c2' ? page(PAGE_2, null) : page(PAGE_1, 'c2')),
    });
    inbox.setQuery('wound');
    render();
    expect(ids()).toEqual([13]);
    expect(text('[data-test="partial-search"] > span')).toBe('Searching 3 loaded; Load more to search further.');
    expect(text('[data-test="search-all"]')).toBe('Search all');

    (el.querySelector('[data-test="search-all"]') as HTMLButtonElement).click();
    render();
    expect(api.mine).toHaveBeenLastCalledWith({ cursor: null, limit: 100, q: 'wound' });
    expect(ids()).toEqual([15]);
    expect(el.querySelector('[data-test="partial-search"]')).toBeNull();
    // A tab narrowed by the service counts its total, not its matches.
    expect(text('[data-test="tab-mine"]')).toBe('Waiting for me 240');

    // Emptying the search reads the whole list again.
    inbox.setQuery('');
    render();
    expect(api.mine).toHaveBeenLastCalledWith({ cursor: null, limit: 100, q: null });
    expect(ids()).toEqual([11, 12, 13]);
  });

  it('keeps the pages loaded after a decision, drops the task acted on, and moves to the next', () => {
    // The service: open tasks in order, three to a page, a cursor naming the last row's id.
    const open = [...PAGE_1, ...PAGE_2, task(16, 'Wound review #1021'), task(17, 'Wound review #1022')];
    const serve = (q: InboxQuery) => {
      const from = q.cursor ? open.findIndex(t => t.id === Number(q.cursor)) + 1 : 0;
      const rows = open.slice(from, from + 3);
      return page(rows, from + 3 < open.length ? String(rows[rows.length - 1].id) : null);
    };
    const { api, inbox, ids, render } = screen({ mine: serve });
    inbox.loadMore();
    render();
    expect(ids()).toEqual([11, 12, 13, 14, 15, 16]);
    api.act.mockImplementation((id: number) => { open.splice(open.findIndex(t => t.id === id), 1); return of({ status: 'SUCCESS', message: 'Approved.', data: {} }); });

    // A task on the second page: the first page read afresh, the second kept, the task gone, the next one open.
    inbox.openTask(14);
    inbox.decide('approve');
    render();
    expect(ids()).toEqual([11, 12, 13, 15, 16]);
    expect(inbox.selectedTask()).toBe(15);
    // A task on the first page: the row that slid onto it is not drawn twice, the rows loaded after it stay.
    inbox.openTask(11);
    inbox.decide('approve');
    render();
    expect(ids()).toEqual([12, 13, 15, 16]);
    expect(inbox.selectedTask()).toBe(12);
    // The next page still starts after the last row loaded.
    inbox.loadMore();
    render();
    expect(ids()).toEqual([12, 13, 15, 16, 17]);
    expect(inbox.hasMore()).toBe(false);
  });

  it('cuts a row\'s title in its name, never its trailing reference, and says what every row shares once', () => {
    const { el, inbox, text, render } = screen();
    const row = el.querySelector('[data-task="11"]')!;
    expect(row.querySelector('.inbox-title-name')!.textContent).toBe('MIG-277 visit check (synthetic)');
    expect(row.querySelector('.inbox-title-ref')!.textContent!.trim()).toBe('#1016');
    expect(row.querySelector('.inbox-row-title')!.getAttribute('title')).toBe('MIG-277 visit check (synthetic) #1016');
    // Every row is the same step of the same workflow: said once over the list, not on each row.
    expect(text('[data-test="list-common"]')).toBe('· Alex approves the visit · MIG-279 visit approval (synthetic)');
    expect(row.querySelector('.inbox-row-sub')!.textContent).toBe('');
    // The heading keeps the reference whole too.
    expect(el.querySelector('.inbox-detail-title .inbox-title-ref')!.textContent).toBe('#1016');
    expect(text('.inbox-detail-title')).toBe('MIG-277 visit check (synthetic) #1016');
    inbox.workflowFilter.set('MIG-279 visit approval (synthetic)');
    render();
    expect(text('[data-test="list-common"]')).toContain('MIG-279 visit approval (synthetic)');
  });

  it('keeps the step and workflow on each row when they differ, and a title without a reference whole', () => {
    const { el } = screen({ mine: () => page([task(21, 'Laptop for Sam', { name: 'Manager approves' }), task(22, 'Order#12', { workflowName: 'Purchase approval' })], null) });
    expect(el.querySelector('[data-test="list-common"]')).toBeNull();
    expect(el.querySelector('[data-task="21"] .inbox-row-sub')!.textContent).toBe('Manager approves · MIG-279 visit approval (synthetic)');
    expect(el.querySelector('[data-task="22"] .inbox-title-ref')).toBeNull();
    expect(el.querySelector('[data-task="22"] .inbox-title-name')!.textContent).toBe('Order#12');
  });
});
