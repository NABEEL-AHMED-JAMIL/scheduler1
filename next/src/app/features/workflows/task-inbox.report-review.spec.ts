import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { BulkReviewApi } from '../../shared/ui/bulk/bulk-review.api';
import { ReportStudioApi } from '../report-studio/report-studio.api';
import { TaskInbox } from './task-inbox';
import { TaskCountService } from './task-count.service';
import { InboxTask, WorkflowsApi } from './workflows.api';

/**
 * Report Studio phase 7: a report waiting for approval is a task in Review › Approvals, decided only in its review card
 * (Report Studio signs what is approved): no Approve, Reject or Ask for changes of the inbox's own, no bulk checkbox; Pass on
 * stays. Another workflow's approval keeps its buttons.
 */
const ME = 4641;
const ID = '01M5BPGVMH7JXRQEP6TN6G791A';
const task = (id: number, extra: Partial<InboxTask> = {}): InboxTask => ({
  id, instanceId: 1000 + id, stepKey: 'approve', stepType: 'approval', name: 'Approve and sign the report', workflowName: 'Report approval',
  requestTitle: 'Approve RPT-0005 v3: Wound assessment', state: 'Open', assigneeKind: 'group', assigneeValue: '1063', overdue: false,
  requestedBy: 4640, subjectType: 'report_version', subjectId: `report-version:${ID}:v3`, ...extra,
} as InboxTask);
const LIST = [task(701), task(702, { subjectType: 'expense', subjectId: 'expense:EXP-1', workflowName: 'Expense', name: 'Manager approves' })];

function screen() {
  const api = {
    mine: vi.fn(() => of({ status: 'SUCCESS', message: '', data: LIST, paging: { nextCursor: null } })),
    groups: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    done: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    requests: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    task: vi.fn((id: number) => of({ status: 'SUCCESS', message: '', data: { ...LIST.find(t => t.id === id)!, subject: { report: 'RPT-0005', pages: 3, reviewers: { kind: 'group', value: '1063' } }, history: [], tasks: [] } })),
    colleagues: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
  };
  const studio = { reviewCard: vi.fn(() => of({ reportId: ID, reportLabel: 'RPT-0005', name: 'Wound assessment', templateVersion: 2, version: 3, current: true,
    pages: 1, hasPdf: true, problems: 0, void: false, expired: false, mayApprove: true, mayReject: true, secondApprover: false, stage: 'FINAL',
    signing: { configured: true } })), reviewPage: vi.fn(() => of({ body: null })) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(), provideRouter([]),
      { provide: WorkflowsApi, useValue: api }, { provide: ReportStudioApi, useValue: studio },
      { provide: BulkReviewApi, useValue: { tasks: vi.fn() } }, { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: TaskCountService, useValue: { refresh: vi.fn(), count: signal(2), overdue: signal(0), mine: signal(2), groups: signal(0), done: signal(0), requests: signal(0) } },
      { provide: AuthService, useValue: { canOpen: () => true, user: signal({ appUserId: ME, tenantId: 2960 }) } },
    ],
  });
  const fixture = TestBed.createComponent(TaskInbox);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, inbox: fixture.componentInstance, studio };
}

describe('Review inbox: a Report Studio review', () => {
  it('has no bulk checkbox and no inbox buttons, and shows its review card', async () => {
    const { fixture, el, inbox, studio } = screen();
    expect(el.querySelector('[data-bulk-pick="701"]')?.hasAttribute('disabled') ?? true).toBe(true);
    expect(inbox.pickable(LIST[0])).toBe(false);
    expect(inbox.pickTitle(LIST[0])).toContain('Decided in its review card');
    expect(inbox.pickable(LIST[1])).toBe(true);
    inbox.openTask(701);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-test="decided-in-card"]')).not.toBeNull();
    expect(el.textContent).not.toContain('Ask for changes');
    expect(studio.reviewCard).toHaveBeenCalledWith(ID, 3);
    expect(el.querySelector('app-report-review-card')).not.toBeNull();
    // one note box (the card's): the bar's comment and the request's raw fields are not shown for it
    expect(el.querySelector('#task-comment')).toBeNull();
    expect(el.querySelector('#task-details-title')).toBeNull();
    inbox.passing.set(true);
    fixture.detectChanges();
    expect((el.querySelector('#task-comment') as HTMLTextAreaElement | null)?.placeholder).toBe('Note for the person you pass it to (optional)');
  });

  it("keeps another workflow's comment and its request details", async () => {
    const { fixture, el, inbox } = screen();
    inbox.openTask(702);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('#task-comment')).not.toBeNull();
    expect(el.querySelector('#task-details-title')).not.toBeNull();
    expect(el.textContent).toContain('Ask for changes');
    // who the step goes to is its chip, not a field
    expect(inbox.fields({ reviewers: { kind: 'group', value: '1063' }, amount: 12 })).toEqual([{ label: 'Amount', value: '12' }]);
    expect(el.querySelector('[data-test="action-bar"]')).not.toBeNull();
  });
});
