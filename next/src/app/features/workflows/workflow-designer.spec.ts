import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { AccessProfilesService } from '../admin/access-profiles/access-profiles.service';
import { WorkflowDesigner } from './workflow-designer';
import { WorkflowDetail, WorkflowsApi } from './workflows.api';
import { fromJson, newStep, problemStep, toJson } from './designer.model';

/**
 * The Workflow designer (MIG-276): the chain of steps an administrator edits and publishes as the next version, the
 * JSON it sends being the engine's own; a refusal's problems land on the step they name; a member reads and changes
 * nothing.
 */
const STEPS = {
  steps: [
    { key: 'manager', type: 'approval', name: 'Manager approves', assignee: { kind: 'manager' }, slaHours: 48, rejectNeedsComment: true },
    { key: 'large', type: 'condition', name: 'Over 1000?', condition: { field: 'amount', op: 'gt', value: 1000 }, whenTrue: 'finance', whenFalse: 'end' },
    { key: 'finance', type: 'approval', name: 'Finance approves', assignee: { kind: 'role', value: 'TENANT_ADMIN' } },
  ],
};
const WORKFLOW: WorkflowDetail = {
  id: 1, key: 'purchase', name: 'Purchase approval', subjectType: 'purchase', currentVersion: 2, status: 'Active', running: 1,
  versions: [
    { version: 2, steps: JSON.stringify(STEPS), note: 'Finance over 1000', createdBy: 4537, dateCreated: '2026-09-30T10:00:00' },
    { version: 1, steps: JSON.stringify({ steps: [STEPS.steps[0]] }), createdBy: 4537, dateCreated: '2026-09-29T10:00:00' },
  ],
};

function screenWith(opts: { admin?: boolean; problems?: string[] } = {}) {
  const admin = opts.admin ?? true;
  const api = {
    colleagues: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [{ userId: 4597, fullName: 'Alex', username: 'alex@x.io' }] })),
    list: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [WORKFLOW] })),
    fetch: vi.fn(() => of({ status: 'SUCCESS', message: '', data: WORKFLOW })),
    publish: vi.fn(() => of(opts.problems
      ? { status: 'ERROR', message: `${opts.problems.length} problems`, data: { problems: opts.problems } }
      : { status: 'SUCCESS', message: 'Published as version 3.', data: { ...WORKFLOW, currentVersion: 3 } })),
    setStatus: vi.fn(() => of({ status: 'SUCCESS', message: 'Workflow is Inactive.', data: WORKFLOW })),
    start: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { id: 1010, state: 'Running' } })),
    create: vi.fn(),
  };
  const profiles = { list: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [{ pageAccessProfileId: 7, profileName: 'Finance' }] })) };
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: WorkflowsApi, useValue: api },
      { provide: AccessProfilesService, useValue: profiles },
      { provide: ToastService, useValue: toast },
      { provide: AuthService, useValue: {
        isTenantAdmin: () => admin, builderLocked: () => false, canOpen: () => true, user: signal({ appUserId: 4537 }),
      } },
    ],
  });
  const fixture = TestBed.createComponent(WorkflowDesigner);
  fixture.detectChanges();
  TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush({ status: 'SUCCESS', data: [{ jobId: 2849, jobName: 'Nightly claims' }] }));
  fixture.detectChanges();
  return { api, profiles, toast, fixture, screen: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('Workflow designer -- the step model', () => {
  it('sends each step with its type\'s fields only, and reads a version back', () => {
    const approval = newStep('approval', []);
    const condition = newStep('condition', ['approval']);
    const notify = { ...newStep('notify', []), jobId: 5, dataset: 'x' };
    const json = toJson([approval, condition, notify]);
    expect(json.steps[0]).toEqual({ key: 'approval', type: 'approval', name: 'Approval', assignee: { kind: 'manager' }, slaHours: 48,
      rejectNeedsComment: true });
    expect(json.steps[1]).toEqual({ key: 'condition', type: 'condition', name: 'Condition',
      condition: { field: 'amount', op: 'gt', value: 1000 }, whenTrue: 'end', whenFalse: 'end' });
    expect(json.steps[2]).toEqual({ key: 'notify', type: 'notify', name: 'Notify', to: { kind: 'requester' }, message: 'Your request has moved on.' });
    expect(fromJson(JSON.stringify(json))).toHaveLength(3);
    expect(fromJson('not json')).toEqual([]);
  });

  it('gives a new step a key no other step has', () => {
    expect(newStep('approval', ['approval', 'approval-2']).key).toBe('approval-3');
    expect(newStep('run_pipeline', []).key).toBe('run-pipeline');
  });

  it('finds the step a problem is about', () => {
    expect(problemStep('steps[2].whenTrue: no step "x"')).toBe(2);
    expect(problemStep('steps: at least one step.')).toBeNull();
  });
});

describe('Workflow designer -- the screen', () => {
  it('opens the first workflow\'s current version as a chain, in words', () => {
    const { api, el } = screenWith();
    expect(api.fetch).toHaveBeenCalledWith('purchase');
    const cards = Array.from(el.querySelectorAll('[data-step]')).map(c => c.textContent!.replace(/\s+/g, ' '));
    expect(cards).toHaveLength(3);
    expect(cards[0]).toContain('the requester\'s manager · due in 2 days · then the requester\'s manager');
    expect(cards[1]).toContain('If amount is more than 1000');
    expect(cards[1]).toContain('Yes → Finance approves · No → end');
    expect(cards[2]).toContain('the administrators');
    expect(el.querySelector('[data-test="publish"]')).not.toBeNull();
  });

  it('adds, moves and removes steps, keeping links, and publishes what the engine reads', () => {
    const { api, screen } = screenWith();
    screen.selected.set(2);
    screen.add('notify');
    expect(screen.steps().map(s => s.key)).toEqual(['manager', 'large', 'finance', 'notify']);
    screen.selected.set(2);
    screen.rekey('Finance Team');
    expect(screen.steps()[1].whenTrue).toBe('finance-team');
    screen.move(3, -1);
    expect(screen.steps().map(s => s.key)).toEqual(['manager', 'large', 'notify', 'finance-team']);
    screen.remove(3);
    expect(screen.steps()[1].whenTrue).toBe('end');
    screen.note.set('No finance step');
    screen.publish();
    const [key, body, note] = api.publish.mock.calls[0] as unknown as [string, { steps: { key: string }[] }, string];
    expect(key).toBe('purchase');
    expect(body.steps.map(s => s.key)).toEqual(['manager', 'large', 'notify']);
    expect(note).toBe('No finance step');
  });

  it('puts a refusal\'s problems on the steps they name', () => {
    const { screen, fixture, el, toast } = screenWith({ problems: ['steps[1].condition.field: which field.', 'steps: something else.'] });
    screen.set('name', 'Changed');
    screen.publish();
    fixture.detectChanges();
    expect(toast.error).toHaveBeenCalled();
    expect(screen.selected()).toBe(1);
    expect(el.querySelector('[data-step="large"]')!.textContent).toContain('condition.field: which field.');
    expect(el.textContent).toContain('steps: something else.');
  });

  it('shows a member the chain and nothing that changes it', () => {
    const { profiles, el } = screenWith({ admin: false });
    expect(profiles.list).not.toHaveBeenCalled();
    expect(el.querySelectorAll('[data-step]')).toHaveLength(3);
    expect(el.querySelector('[data-test="publish"]')).toBeNull();
    expect(el.querySelector('[data-test="add-step"]')).toBeNull();
    expect(el.querySelector('[data-test="new-workflow"]')).toBeNull();
    expect((el.querySelector('[data-test="step-panel"] fieldset') as HTMLFieldSetElement).disabled).toBe(true);
  });

  it('starts a test request and links to it', () => {
    const { api, screen, fixture, el } = screenWith();
    screen.view.set('test');
    screen.testSubjectId.set('po-1');
    screen.testRun();
    fixture.detectChanges();
    expect(api.start).toHaveBeenCalledWith(expect.objectContaining({ definitionKey: 'purchase', subjectId: 'po-1', subject: { amount: 1200 } }),
      'purchase:test:po-1');
    expect(el.querySelector('[data-test="test-link"]')!.textContent).toContain('Request #1010 is running');
  });
});
