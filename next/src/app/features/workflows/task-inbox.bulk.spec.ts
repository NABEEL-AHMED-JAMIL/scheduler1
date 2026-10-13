import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { BulkReviewApi } from '../../shared/ui/bulk/bulk-review.api';
import { TaskInbox } from './task-inbox';
import { TaskCountService } from './task-count.service';
import { InboxQuery, InboxTask, WorkflowsApi } from './workflows.api';

/**
 * Bulk review (2026-10-12) in the Review inbox: approval tasks the reader may decide have a checkbox; a page is picked at
 * once, every task matching the search is read from the service a hundred at a time, a changed search starts again, and
 * the decision goes to workflow-service's bulkAct by task id.
 */
const ME = 4537;
const task = (id: number, extra: Partial<InboxTask> = {}): InboxTask => ({
  id, instanceId: 1000 + id, stepKey: 'manager', stepType: 'approval', name: 'Manager approves', workflowName: 'Visit approval',
  requestTitle: `Visit check #${id}`, state: 'Open', assigneeKind: 'user', assigneeUserId: ME, dueAt: '2026-10-14T16:00:00', overdue: false,
  requestedBy: 4597, ...extra,
} as InboxTask);

/** Waiting for me: 501 an approval, 502 a "done" task, 503 the reader's own request, then a second page on the service. */
const FIRST = [task(501), task(502, { stepType: 'task', name: 'Upload the scan' }), task(503, { requestedBy: ME })];

function screen(pages: Record<string, { data: InboxTask[]; next: string | null }> = {}) {
  const mine = vi.fn((q: InboxQuery = {}) => {
    const page = pages[q.cursor ?? ''] ?? { data: FIRST, next: 'c1' };
    return of({ status: 'SUCCESS', message: '', data: page.data, paging: { nextCursor: page.next, limit: q.limit } });
  });
  const api = {
    mine,
    groups: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    done: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [task(600, { state: 'Approved' })] })),
    requests: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    task: vi.fn((id: number) => of({ status: 'SUCCESS', message: '', data: { ...FIRST.find(t => t.id === id) ?? task(id), subject: {}, history: [], tasks: [] } })),
    colleagues: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
  };
  const bulk = { tasks: vi.fn(() => of({ status: 'SUCCESS', message: '', data: null })) };
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: WorkflowsApi, useValue: api },
      { provide: BulkReviewApi, useValue: bulk },
      { provide: ToastService, useValue: toast },
      { provide: TaskCountService, useValue: { refresh: vi.fn(), count: signal(3), overdue: signal(0), mine: signal(240), groups: signal(0), done: signal(1), requests: signal(0) } },
      { provide: AuthService, useValue: { canOpen: () => true, user: signal({ appUserId: ME, tenantId: 2945 }) } },
    ],
  });
  const fixture = TestBed.createComponent(TaskInbox);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const refresh = () => fixture.detectChanges();
  return { fixture, el, inbox: fixture.componentInstance, api, bulk, toast, refresh };
}

describe('Review inbox: bulk', () => {
  it('gives approval tasks a checkbox, none to a "done" task, and keeps the reader\'s own request out', () => {
    const { el } = screen();
    expect(el.querySelector('[data-bulk-pick="501"]')).not.toBeNull();
    expect(el.querySelector('[data-bulk-pick="502"]')).toBeNull();
    const own = el.querySelector<HTMLInputElement>('[data-bulk-pick="503"]')!;
    expect(own.disabled).toBe(true);
    expect(own.title).toContain('Your own request');
    // The row's own button still opens the task.
    expect(el.querySelector('[data-task="501"]')!.classList).toContain('inbox-row');
  });

  it('picks the approval tasks of the page at once, and nothing on Done', () => {
    const { el, inbox, refresh } = screen();
    el.querySelector<HTMLInputElement>('[data-bulk-page]')!.click();
    refresh();
    expect(inbox.bulk.ids()).toEqual([501]);
    expect(el.querySelector('[data-bulk-count]')!.textContent!.trim()).toBe('1 selected');
    expect(el.querySelector('[data-bulk-page]')!.getAttribute('aria-label')).toContain('approval tasks');
    inbox.pick('done');
    refresh();
    expect(inbox.bulk.count()).toBe(0);
    expect(el.querySelector('[data-bulk-pick]')).toBeNull();
    expect(el.querySelector('[data-bulk-page]')).toBeNull();
  });

  it('selects all matching by reading the list again with the same search, a hundred at a time, following the cursors', () => {
    const { el, inbox, api, refresh } = screen({
      '': { data: FIRST, next: 'c1' },
      c1: { data: [task(504), task(505, { stepType: 'task' })], next: 'c2' },
      c2: { data: [task(506)], next: null },
    });
    el.querySelector<HTMLInputElement>('[data-bulk-page]')!.click();
    refresh();
    const link = el.querySelector<HTMLButtonElement>('[data-bulk-matching]')!;
    expect(link.textContent!.trim()).toBe('Select all matching (up to 100)');
    api.mine.mockClear();
    link.click();
    refresh();
    expect(api.mine.mock.calls.map(c => c[0])).toEqual([
      { cursor: null, limit: 100, q: null }, { cursor: 'c1', limit: 100, q: null }, { cursor: 'c2', limit: 100, q: null }]);
    expect(inbox.bulk.ids()).toEqual([501, 504, 506]);
    expect(el.querySelector('[data-bulk-matched]')!.textContent!.trim()).toBe('All 3 matching are selected.');
  });

  it('starts the selection again when the search changes, and sends that search with Select all matching', () => {
    const { el, inbox, api, refresh } = screen();
    el.querySelector<HTMLInputElement>('[data-bulk-pick="501"]')!.click();
    refresh();
    expect(inbox.bulk.count()).toBe(1);
    inbox.setQuery('visit');
    refresh();
    expect(inbox.bulk.count()).toBe(0);
    el.querySelector<HTMLInputElement>('[data-bulk-page]')!.click();
    refresh();
    api.mine.mockClear();
    el.querySelector<HTMLButtonElement>('[data-bulk-matching]')!.click();
    expect(api.mine.mock.calls[0][0]).toEqual({ cursor: null, limit: 100, q: 'visit' });
  });

  it('decides by task id through workflow-service, and the decided tasks leave the list', () => {
    const pages = { '': { data: FIRST, next: null as string | null } };
    const { el, inbox, bulk, refresh } = screen(pages);
    expect(inbox.selectedTask()).toBe(501);
    el.querySelector<HTMLInputElement>('[data-bulk-pick="501"]')!.click();
    refresh();
    const request = { action: 'approve' as const, comment: null, bulkId: 'bulk-0001', dryRun: true };
    inbox.bulk.source.send(inbox.bulk.rows(), request).subscribe();
    expect(bulk.tasks).toHaveBeenCalledWith({ taskIds: [501] }, request);
    pages[''] = { data: FIRST.slice(1), next: null };
    inbox.bulkDecided({ bulkId: 'bulk-0001', action: 'approve', dryRun: false, requested: 1, done: [{ id: 501 }], skipped: [], failed: [] });
    refresh();
    expect(inbox.mine().map(t => t.id)).toEqual([502, 503]);
    expect(el.querySelector('[data-task="501"]')).toBeNull();
    // The open task was decided: the inbox moves on to the next one.
    expect(inbox.selectedTask()).toBe(502);
  });
});
