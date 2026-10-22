import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { WorkflowsApi } from '../../workflows/workflows.api';
import { RunDecision } from './run-decision';

/**
 * UX review 2026-10-12 (R1, R2): the run page's Next steps. Reject then Approve, the primary rightmost; an administrator
 * decides through Core, a reviewer the pipeline names through their Task inbox task about the run; a rejection always says
 * why; anyone else is told who decides.
 */
const PENDING = (you: Record<string, unknown>) => ({ status: 'SUCCESS', message: '', data: {
  jobQueueId: 8209, jobId: 2907, reviewStatus: 'PENDING', required: ['internal'], decisions: [], you } });
const TASK = { id: 1121, instanceId: 1115, stepKey: 'review', stepType: 'approval', name: "Review the run's results", state: 'Open',
  requestTitle: 'Review run #8209', subjectId: 'pipeline-run:8209', list: 'teams' };

function box(opts: { review: unknown; tasks?: unknown[]; inbox?: boolean }) {
  const get = vi.fn((url: string) => url.includes('/appUser.json/teams/list')
    ? of({ status: 'SUCCESS', message: '', data: [{ teamId: 1063, name: 'Reviewer', members: [] }] }) : of(opts.review));
  const post = vi.fn(() => of({ status: 'SUCCESS', message: 'The internal review is recorded: the run\'s results are APPROVED.' }));
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
      { provide: HttpClient, useValue: { get, post } },
      { provide: WorkflowsApi, useValue: api },
      { provide: ToastService, useValue: toast },
      { provide: AuthService, useValue: { canOpen: (p: string) => p !== 'task-inbox' || opts.inbox !== false, user: signal({ appUserId: 4641, pageAccessProfileName: 'Reviewer' }) } },
    ],
  });
  const fixture = TestBed.createComponent(RunDecision);
  fixture.componentRef.setInput('jobQueueId', '8209');
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const click = (test: string) => { (el.querySelector(`[data-test="${test}"]`) as HTMLButtonElement).click(); fixture.detectChanges(); };
  const type = (text: string) => {
    const area = el.querySelector('[data-test="decision-comment"]') as HTMLTextAreaElement;
    area.value = text; area.dispatchEvent(new Event('input')); fixture.detectChanges();
  };
  return { el, get, post, api, toast, click, type, fixture };
}

describe('Run page: Next steps', () => {
  it('puts Reject before Approve, the primary rightmost', () => {
    const { el } = box({ review: PENDING({ party: 'internal', canDecide: true }) });
    const buttons = Array.from(el.querySelectorAll('[data-test="decision-buttons"] button'));
    expect(buttons.map(b => b.getAttribute('data-test'))).toEqual(['reject', 'approve']);
    expect(buttons[1].classList.contains('btn-primary')).toBe(true);
  });

  it('records an administrator\'s approval with Core', () => {
    const { click, post, api } = box({ review: PENDING({ party: 'internal', canDecide: true }) });
    click('approve');
    expect(post).toHaveBeenCalledWith(expect.stringContaining('/sourceJob.json/review/decide'),
      expect.objectContaining({ jobQueueId: 8209, decision: 'APPROVED' }));
    expect(api.forSubject).not.toHaveBeenCalled();
  });

  it('decides a reviewer\'s Task inbox task about the run', () => {
    const { click, api, post, el } = box({ review: PENDING({ party: 'internal', canDecide: false,
      refusal: 'Only a tenant administrator can approve or reject a run\'s results here; the pipeline\'s reviewers decide it in the Task inbox.' }),
      tasks: [TASK] });
    expect(api.forSubject).toHaveBeenCalledWith('pipeline-run:8209');
    expect(el.textContent).toContain('Recorded as your decision in Review › Approvals.');
    click('approve');
    expect(api.act).toHaveBeenCalledWith(1121, 'approve', null, '1121:approve:run-page');
    expect(post).not.toHaveBeenCalled();
  });

  it('asks why before a rejection, then sends it with the reason', () => {
    const { click, type, api, el } = box({ review: PENDING({ canDecide: false }), tasks: [TASK] });
    click('reject');
    expect(api.act).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Why are these results rejected?');
    type('Totals do not match the source');
    click('reject');
    expect(api.act).toHaveBeenCalledWith(1121, 'reject', 'Totals do not match the source', '1121:reject:run-page');
  });

  it('tells a reader with no task who decides, and offers no buttons', () => {
    const { el } = box({ review: PENDING({ canDecide: false, refusal: 'Only a tenant administrator can approve or reject a run\'s results here; the pipeline\'s reviewers decide it in the Task inbox.' }), tasks: [] });
    expect(el.querySelector('[data-test="decision-buttons"]')).toBeNull();
    expect(el.querySelector('[data-test="who-decides"]')?.textContent).toContain('Task inbox');
  });

  it('says who it waits on: the reviewer themselves, by their team\'s name', () => {
    const review = PENDING({ party: 'internal', canDecide: false, refusal: 'The pipeline\'s reviewers decide it in the Task inbox.' });
    (review.data as Record<string, unknown>)['reviewers'] = { kind: 'team', value: '1063' };
    const { el } = box({ review, tasks: [TASK] });
    expect(el.querySelector('[data-test="waiting-on"]')?.textContent).toContain('you (the Reviewer team)');
  });

  it('says the workspace administrators when the pipeline names no reviewers, and that an administrator decides here', () => {
    const { el } = box({ review: PENDING({ party: 'internal', canDecide: true }) });
    expect(el.querySelector('[data-test="waiting-on"]')?.textContent).toContain('the workspace administrators (you can decide here)');
  });

  it('once decided, says who decided and when, with their picture', () => {
    const { el } = box({ review: { status: 'SUCCESS', message: '', data: { jobQueueId: 8134, jobId: 2908, reviewStatus: 'APPROVED', required: ['internal'],
      decisions: [{ runReviewDecisionId: 1109, party: 'internal', decision: 'APPROVED', comment: 'Checked', reviewer: 'Ana Ruiz', reviewerUserId: 4640,
        decidedAt: '2026-10-12T21:14:33.456872' }], you: { canDecide: false } } } });
    const made = el.querySelector('[data-test="decisions-made"]')!;
    expect(made.textContent).toContain('Approved');
    expect(made.textContent).toContain('by Ana Ruiz');
    expect(made.querySelector('[data-test="decided-at"]')?.textContent).toMatch(/12 Oct 2026, \d{2}:\d{2}/);
    expect(made.querySelector('app-avatar')).not.toBeNull();
    expect(el.querySelector('[data-test="waiting-on"]')).toBeNull();
    expect(el.querySelector('[data-test="decision-buttons"]')).toBeNull();
  });

  it('draws nothing for a run that needs no review', () => {
    const { el } = box({ review: { status: 'SUCCESS', data: { jobQueueId: 1, jobId: 2, reviewStatus: 'NOT_REQUIRED', required: [], decisions: [] } } });
    expect(el.querySelector('[data-test="next-steps"]')).toBeNull();
  });
});
