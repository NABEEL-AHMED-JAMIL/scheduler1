import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { ReviewItemPanel } from '../review/review-item-panel';
import { uidOf } from '../review/review-sources';
import { TaskInbox } from './task-inbox';
import { TaskCountService } from './task-count.service';
import { InboxTask, RequestRow, TaskDetail, WorkflowsApi } from './workflows.api';
import { dateTime } from './history';
import { INTAKE_HISTORY, INTAKE_SUBJECT, SUMMARY } from './request-data.fixture';

/**
 * Owner 2026-10-27 (task 2904, Riverside's senior-nurse approval): the request's data on Approvals, My requests and
 * Review's side panel -- a run's outcome as one line with its results under it, a kept decision as who and when, a long
 * text as a paragraph, a masked value as hidden -- the same on every screen that shows it.
 */
const TASK = {
  id: 2904, instanceId: 2307, stepKey: 'senior', stepType: 'approval', name: 'A senior nurse decides', workflowName: 'Patient intake',
  requestTitle: 'New patient intake #0001', state: 'Open', assigneeKind: 'role', assigneeValue: 'TENANT_ADMIN', dueAt: '2099-10-07T21:34:00',
  overdue: false,
} as InboxTask;
const DETAIL = { ...TASK, requestedBy: 4600, requestState: 'Waiting', rejectNeedsComment: true, subject: INTAKE_SUBJECT,
  tasks: [{ id: 2889, stepKey: 'nurse', name: 'A nurse reviews', state: 'Approved' }], history: INTAKE_HISTORY } as unknown as TaskDetail;
const REQUEST: RequestRow = { id: 2307, workflow: 'intake', workflowName: 'Patient intake', version: 1, subjectType: 'form_submission',
  subjectId: 'form-submission:1', title: 'New patient intake #0001', state: 'Waiting', startedAt: '2026-10-27T00:47:13' };

const COLLEAGUES = [{ userId: 4601, fullName: 'Alex Morgan, RN', username: 'alex@x.io', canAct: true },
  { userId: 4600, fullName: 'Front desk', username: 'frontdesk@riverside.test', canAct: true }];

function inbox(onRequests = false, canOpen: (page: string) => boolean = () => true) {
  const api = {
    mine: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [TASK] })),
    teams: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    done: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    requests: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [REQUEST] })),
    task: vi.fn(() => of({ status: 'SUCCESS', message: '', data: DETAIL })),
    request: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { ...REQUEST, subject: INTAKE_SUBJECT, tasks: [], history: INTAKE_HISTORY } })),
    colleagues: vi.fn(() => of({ status: 'SUCCESS', message: '', data: COLLEAGUES })),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(), provideRouter([]),
      ...(onRequests ? [{ provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ id: '2307' }), routeConfig: { path: 'review/requests' } } } }] : []),
      { provide: WorkflowsApi, useValue: api },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: TaskCountService, useValue: { refresh: vi.fn(), count: signal(1), overdue: signal(0), mine: signal(1), teams: signal(0), done: signal(0), requests: signal(1) } },
      { provide: AuthService, useValue: { canOpen, user: signal({ appUserId: 4537, tenantId: 1006 }) } },
    ],
  });
  const fixture = TestBed.createComponent(TaskInbox);
  fixture.detectChanges();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/** What every screen must show of the intake's data. */
function readsTheData(area: Element) {
  const row = (key: string) => area.querySelector(`[data-test="request-fields"] > [data-key="${key}"]`)!;
  const words = (e: Element | null) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();

  // 1. A run outcome: one line, its step, a status chip, the run linked; the envelope never as rows; the results under it.
  const outcome = row('assessment');
  expect(outcome.getAttribute('data-kind')).toBe('outcome');
  expect(words(outcome.querySelector('[data-test="outcome-line"]'))).toBe('Assess the intake: checks, rules and the AI summary Completed Run #2926');
  expect(outcome.querySelector('app-status')).not.toBeNull();
  expect(outcome.querySelector('a[data-test="outcome-run"]')!.getAttribute('href')).toBe('/pipelines/schedules/1479/runs/2926');
  expect(outcome.querySelector('[data-test="outcome-problem"]')).toBeNull();
  const results = [...outcome.querySelectorAll('[data-test="request-subfields"] > div > dt')].map(dt => words(dt));
  expect(results).toEqual(['Age', 'Intake ID', 'AI summary', 'Code flags', 'Flag count', 'Patient name', 'Missing count', 'Triage priority']);
  const all = words(area);
  for (const envelope of ['Give up at', 'Job ID', 'Run ID', 'Row count', 'Truncated', 'Results step', 'Ended', 'Masked', '4 of 4 step(s)',
    'High risk meds', 'Validation line', 'By name']) {
    expect(all).not.toContain(envelope);
  }
  expect(words(row('summary_report').querySelector('[data-test="outcome-line"]'))).toBe('The signed intake summary Completed Run #2953');

  // 2. A kept decision: the person's name and the time on the console's clock, the comment as a quote; never an id or ISO text.
  expect(words(row('nurse').querySelector('[data-test="decision-line"]'))).toBe(`Approved by Riverside Health reviewer · ${dateTime(
    '2026-10-27T00:52:52.982112834-05:00')}`);
  expect(words(row('nurse').querySelector('blockquote'))).toBe('Chest pain on exertion: ECG on arrival.');
  expect(words(row('senior').querySelector('[data-test="decision-line"]'))).toMatch(/^Rejected by a member · \d{1,2} Oct 2026, \d{2}:\d{2}$/);
  expect(row('senior').querySelector('blockquote')).toBeNull();
  expect(all).not.toMatch(/2026-10-27T/);
  expect(all).not.toMatch(/\b460[12]\b/);

  // 3. A long text takes the row as a paragraph.
  const summary = outcome.querySelector('[data-key="ai_summary"]')!;
  expect(summary.classList).toContain('is-wide');
  expect(words(summary.querySelector('.inbox-long'))).toBe(SUMMARY);

  // A username the form kept reads as its person.
  expect(words(row('submitted_by').querySelector('dd'))).toBe('Front desk');

  // 4. A masked value reads as hidden, with why.
  const masked = outcome.querySelector('[data-key="patient_name"] .req-masked')!;
  expect(masked.getAttribute('title')).toBe('Hidden: personal data');
  expect(masked.querySelector('.secret-mask')!.textContent).toBe('•••');
}

describe('A request\'s data on every screen that shows it', () => {
  it('reads it on Approvals, in the task', () => {
    const el = inbox();
    readsTheData(el.querySelector('[data-test="task-detail"]')!);
  });

  it('reads it on My requests, in the request', () => {
    const el = inbox(true);
    readsTheData(el.querySelector('[data-test="request-detail"]')!);
  });

  it('names the run without a link for someone who cannot open runs', () => {
    const el = inbox(false, page => page !== 'jobs' && page !== 'queue');
    const line = el.querySelector('[data-key="assessment"] [data-test="outcome-line"]')!;
    expect(line.querySelector('a')).toBeNull();
    expect(line.textContent).toContain('Run #2926');
  });

  it('names each step of the history as the engine entered it, not by its key', () => {
    const el = inbox();
    const lines = [...el.querySelectorAll('[data-test="task-history"] .inbox-timeline-text')].map(l => l.textContent);
    expect(lines).toContain('Assessed? yes');
    expect(lines).toContain('Assess the intake: checks, rules and the AI summary: started run #2926');
  });

  it('reads it on Review\'s side panel', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ReviewItemPanel],
      providers: [
        provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthService, useValue: { canOpen: () => true, user: signal({ appUserId: 4537, tenantId: 1006 }) } },
        { provide: DIALOG_DATA, useValue: { item: { uid: uidOf('approval', 2904), kind: 'approval', via: 'task', id: 2904, title: TASK.requestTitle,
          from: 'Patient intake', since: '2026-10-27T05:52:52.981+00:00', due: null, overdue: false, waitsOn: 'Administrators', pickable: true, whyNot: '' } } },
        { provide: DialogRef, useValue: { close: vi.fn(), closed: of(undefined) } },
      ],
    });
    const fixture = TestBed.createComponent(ReviewItemPanel);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(r => r.url.endsWith('/taskInbox.json/task')).flush({ status: 'SUCCESS', data: DETAIL });
    http.expectOne(r => r.url.endsWith('/taskInbox.json/colleagues')).flush({ status: 'SUCCESS', data: COLLEAGUES });
    fixture.detectChanges();
    readsTheData((fixture.nativeElement as HTMLElement).querySelector('[data-test="panel-task"]')!);
  });

  // ZT-I34 (owner 2026-10-27, "mask for readers without access").
  describe('its personal data', () => {
    const masked = { personal: true, masked: true, canShow: true, shown: false, own: false };
    function withPersonal(state: object, shownState: object = { ...state, masked: false, shown: true }) {
      const api = {
        mine: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [TASK] })),
        teams: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
        done: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
        requests: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
        task: vi.fn((_id: number, show?: boolean) => of({ status: 'SUCCESS', message: '', data: { ...DETAIL,
          subject: show ? INTAKE_SUBJECT : { ...INTAKE_SUBJECT, last_name: '\u2022\u2022\u2022' },
          history: show ? [...INTAKE_HISTORY, { id: 99, type: 'PersonalDataShown', actor: 4537, at: '2026-10-27T15:00:00+00:00' }] : INTAKE_HISTORY,
          personalData: show ? shownState : state } })),
        request: vi.fn(() => of({ status: 'SUCCESS', message: '', data: null })),
        colleagues: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [...COLLEAGUES, { userId: 4537, fullName: 'Riverside Health admin',
          username: 'admin@riverside.test', canAct: true }] })),
      };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(), provideRouter([]),
          { provide: WorkflowsApi, useValue: api },
          { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
          { provide: TaskCountService, useValue: { refresh: vi.fn(), count: signal(1), overdue: signal(0), mine: signal(1), teams: signal(0), done: signal(0), requests: signal(0) } },
          // A session whose "full name" is its username, as a token-made one is.
          { provide: AuthService, useValue: { canOpen: () => true, user: signal({ appUserId: 4537, tenantId: 1006, username: 'admin@riverside.test',
            fullName: 'admin@riverside.test' }) } },
        ],
      });
      const fixture = TestBed.createComponent(TaskInbox);
      fixture.detectChanges();
      fixture.detectChanges();
      return { api, fixture, el: fixture.nativeElement as HTMLElement };
    }

    it('says it is hidden and offers Show to someone who may; showing reads it again, and the history says so', () => {
      const { api, fixture, el } = withPersonal(masked);
      const bar = () => el.querySelector('[data-test="personal-data-bar"]')!;
      expect(bar().getAttribute('data-state')).toBe('can-show');
      expect(el.querySelector('[data-key="last_name"] .req-masked')).not.toBeNull();
      (el.querySelector('[data-test="show-personal"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(api.task).toHaveBeenLastCalledWith(2904, true);
      expect(bar().getAttribute('data-state')).toBe('shown');
      expect(el.querySelector('[data-key="last_name"] dd')!.textContent!.trim()).toBe('Example');
      const lines = [...el.querySelectorAll('[data-test="task-history"] .inbox-timeline-text')].map(l => l.textContent);
      // The signed-in person by the directory's name, never their username.
      expect(lines).toContain('Personal data shown to Riverside Health admin (you)');
      (el.querySelector('[data-test="hide-personal"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(api.task).toHaveBeenLastCalledWith(2904, false);
      expect(bar().getAttribute('data-state')).toBe('can-show');
    });

    it('says whom to ask when the reader may not show it, and nothing when there is none', () => {
      const hidden = withPersonal({ ...masked, canShow: false });
      expect(hidden.el.querySelector('[data-test="personal-data-bar"]')!.textContent).toContain('A workspace administrator can give you See personal data');
      expect(hidden.el.querySelector('[data-test="show-personal"]')).toBeNull();
      const own = withPersonal({ ...masked, masked: false, canShow: false, own: true });
      expect(own.el.querySelector('[data-test="personal-data-bar"]')!.getAttribute('data-state')).toBe('own');
      const none = withPersonal({ personal: false, masked: false, canShow: false, shown: false, own: false });
      expect(none.el.querySelector('[data-test="personal-data-bar"]')).toBeNull();
    });
  });
});
