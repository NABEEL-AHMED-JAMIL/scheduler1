import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { WorkflowsApi } from '../../workflows/workflows.api';
import { RunApproval } from './run-approval';
import { RunApprovalStore } from './run-approval.store';
import { RunTimelineStore } from './run-timeline.store';

/**
 * Run page polish 2026-10-12: a run waiting at an Approval step is an amber Next steps box, not a red error line. Someone in
 * the group decides here (their Review inbox task about the request: Reject, which says why, then Approve, the primary
 * rightmost); someone else with the inbox is pointed to it; a viewer reads who decides and has nothing to press.
 */
const HOUR = 3_600_000;
const NOW = Date.now();
const APPROVAL = { approvalId: 1006, status: 'PENDING', waiting: true, title: 'Approve 3 bulk-review test rows of run 8298',
  reviewers: { kind: 'group', value: '1063' }, requestedAt: new Date(NOW - 7 * HOUR - 60_000).toISOString(),
  expiresAt: new Date(NOW + 65 * HOUR).toISOString() };
const TIMELINE = { jobQueueId: 8298, jobId: 2977, runStatus: 'Running', attempt: 1, attempts: [1], legacy: false, waitingForApproval: true,
  steps: [
    { stepExecutionId: 1, index: 0, key: 'rows', task: 'sample', status: 'Completed', log: 'step' },
    { stepExecutionId: 2, index: 1, key: 'approve', name: 'Approve the test rows', task: 'approval', status: 'Running', log: 'step', approval: APPROVAL },
  ] };
const TASK = { id: 1136, instanceId: 1130, stepKey: 'approve', stepType: 'approval', name: 'Approve the run to continue', state: 'Open',
  assigneeKind: 'group', assigneeValue: '1063', rejectNeedsComment: true, requestTitle: APPROVAL.title, subjectId: 'pipeline-approval:1006' };

function box(opts: { tasks?: unknown[]; inbox?: boolean; admin?: boolean; timeline?: unknown }) {
  const get = vi.fn(() => of({ status: 'SUCCESS', message: '', data: [{ pageAccessProfileId: 1063, profileName: 'Reviewer' }, { pageAccessProfileId: 1064, profileName: 'Viewer' }] }));
  const api = {
    forSubject: vi.fn(() => of({ status: 'SUCCESS', message: '', data: opts.tasks ?? [] })),
    act: vi.fn(() => of({ status: 'SUCCESS', message: 'Approved.', data: {} })),
  };
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      RunApprovalStore,
      { provide: RunTimelineStore, useValue: { timeline: signal(opts.timeline ?? TIMELINE) } },
      { provide: HttpClient, useValue: { get } },
      { provide: WorkflowsApi, useValue: api },
      { provide: ToastService, useValue: toast },
      { provide: AuthService, useValue: {
        canOpen: (p: string) => p !== 'task-inbox' || opts.inbox !== false,
        isTenantAdmin: () => !!opts.admin,
        user: signal({ appUserId: opts.admin ? 4640 : 4641, pageAccessProfileName: opts.admin ? null : opts.inbox === false ? 'Viewer' : 'Reviewer' }),
      } },
    ],
  });
  const fixture = TestBed.createComponent(RunApproval);
  fixture.componentRef.setInput('now', NOW);
  fixture.detectChanges();
  TestBed.tick();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const text = (test: string) => el.querySelector(`[data-test="${test}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const click = (test: string) => { (el.querySelector(`[data-test="${test}"]`) as HTMLButtonElement).click(); fixture.detectChanges(); };
  const type = (value: string) => {
    const area = el.querySelector('[data-test="approval-comment"]') as HTMLTextAreaElement;
    area.value = value; area.dispatchEvent(new Event('input')); fixture.detectChanges();
  };
  return { el, text, click, type, api, get, toast, fixture };
}

describe('Run page: waiting for approval', () => {
  it('says where the run waits and what the step asks, in an amber box with no error in it', () => {
    const { el, text } = box({ tasks: [TASK] });
    expect(text('approval-where')).toBe('Waiting for approval at step 2 · Approve the test rows');
    expect(text('approval-title')).toBe('Approve 3 bulk-review test rows of run 8298');
    expect(el.querySelector('[data-test="approval-status"]')?.classList.contains('pill-warn')).toBe(true);
    expect(el.querySelector('.text-crit-500, [data-test="run-message"]')).toBeNull();
  });

  it('asks the reader\'s own task about the request', () => {
    const { api } = box({ tasks: [TASK] });
    expect(api.forSubject).toHaveBeenCalledWith('pipeline-approval:1006');
  });

  it('lets someone in the group decide: Reject then Approve, the primary rightmost, as their inbox task', () => {
    const { el, text, click, api } = box({ tasks: [TASK] });
    expect(text('approval-who')).toBe('You (the Reviewer group)');
    const buttons = [...el.querySelectorAll('[data-test="approval-buttons"] button')];
    expect(buttons.map(b => b.getAttribute('data-test'))).toEqual(['approval-reject', 'approval-approve']);
    expect(buttons[1].classList.contains('btn-primary')).toBe(true);
    click('approval-approve');
    expect(api.act).toHaveBeenCalledWith(1136, 'approve', null, '1136:approve:run-page');
  });

  it('asks why before a rejection, then sends it with the reason', () => {
    const { el, click, type, api } = box({ tasks: [TASK] });
    click('approval-reject');
    expect(api.act).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Say why');
    type('Totals do not match');
    click('approval-reject');
    expect(api.act).toHaveBeenCalledWith(1136, 'reject', 'Totals do not match', '1136:reject:run-page');
  });

  it('tells an administrator outside the group who it waits on, by the group\'s name, and points to the Review inbox', () => {
    const { el, text, get } = box({ admin: true });
    expect(get).toHaveBeenCalledWith(expect.stringContaining('/pageAccess.json/listProfiles'));
    expect(text('approval-who')).toBe('The Reviewer group');
    expect(el.querySelector('[data-test="approval-buttons"]')).toBeNull();
    expect(el.querySelector('[data-test="approval-inbox"]')?.getAttribute('href')).toBe('/workflows/inbox');
  });

  it('gives a viewer who decides, and nothing to press', () => {
    const { el, text, api, get } = box({ inbox: false });
    expect(api.forSubject).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(text('approval-who')).toBe('The pipeline\'s reviewer group');
    expect(el.querySelectorAll('button').length).toBe(0);
    expect(el.querySelector('[data-test="approval-inbox"]')).toBeNull();
  });

  it('says since when and until when, on the 24-hour clock, with how long ago and how long left', () => {
    const { text } = box({ tasks: [TASK] });
    expect(text('approval-since')).toMatch(/^\d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2} · 7 h ago$/);
    expect(text('approval-expires')).toMatch(/^\d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2} · in 2 d 17 h$/);
  });

  it('draws nothing when the run waits at no Approval step', () => {
    const { el, api } = box({ timeline: { ...TIMELINE, waitingForApproval: false, steps: [TIMELINE.steps[0]] } });
    expect(el.querySelector('[data-test="approval-next"]')).toBeNull();
    expect(api.forSubject).not.toHaveBeenCalled();
  });
});
